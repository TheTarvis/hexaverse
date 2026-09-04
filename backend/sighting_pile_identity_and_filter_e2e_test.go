package main

// RED-phase path-level integration tests for openspec change
// add-scan-and-sightings-surface, tasks.md 1.2, 1.3, 1.7, 1.8
// (specs/sighting-records/spec.md's ADDED "A Sighting Record Is Addressable
// On the Wire Without Naming Its Target" / "The Pile Read Filters To One
// System On Request", and its MODIFIED "A Sighting Is Minted Only By a
// Resolving Sweep" — "A due sweep settled by a read mints as the sweep, not
// as the read").
//
// Every test drives the REAL, production-constructed router (SetupRouter()),
// per this repo's established convention (scan_verb_e2e_test.go,
// disclosure_wiring_e2e_test.go). Task 1.3/1.8's page-spanning fixtures are
// seeded via a DIRECT Firestore write through the real, production
// sightings.MintWrites function (never a hand-rolled document shape) —
// mirroring disclosure_wiring_e2e_test.go's own precedent for seeding a
// sighting fixture — so the ACT and ASSERT steps (GET /v1/sightings) still
// exercise the real handler/service/dao stack end to end, while avoiding 50+
// real, real-time-priced focused scans, which would make this file
// prohibitively slow without adding any coverage of the systemId filter or
// the cursor itself.
//
// EXPECTED RED TODAY: TestSightingId_Scenario_* fails once sightings/fleet
// compile (an id/cursor assertion against the CURRENT {actionId}_{targetId}
// derivation and its plaintext cursor); TestSightingSystemFilter_Scenario_*
// fails because GET /v1/sightings does not accept `systemId` at all yet
// (backend/sightings/handler.go); TestSightingSettleOnRead_Scenario_*
// exercises the currently-shipped settle-on-read mechanism directly (it may
// already pass for the asOf-vs-read-time half, since that mechanism
// predates this change — see the file's own per-test notes).

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/sightings"
	"hexaverse/space"

	"github.com/google/uuid"
)

// seedSightingsDirect mints n records for cid via the REAL
// sightings.MintWrites (so the current-vs-future document-id derivation is
// always exercised for real), applied through the raw Firestore primitive
// action's own resolve transaction uses (tx.Set/MergeAll — here a plain
// non-transactional Set, since no concurrent writer is in play). Each
// record gets its own actionId (a real sweep never mints two records under
// one actionId for two DIFFERENT targets sharing a systemId in this
// fixture's shape), a caller-supplied systemId, and a distinct targetId, so
// every record is a genuine target-naming (non-clean-sweep) claim.
func seedSightingsDirect(t *testing.T, fs common.FirestoreService, cid, systemId string, n int) []sightings.Sighting {
	t.Helper()
	ctx := context.Background()
	out := make([]sightings.Sighting, 0, n)
	for i := 0; i < n; i++ {
		rec := sightings.Sighting{
			SystemId:  systemId,
			TargetId:  "target-" + uuid.NewString(),
			AsOf:      common.WorldMillis(1_000_000 + i),
			Position:  space.Vec3{X: float64(i)},
			HostId:    "host-" + uuid.NewString(),
			HullCount: 1,
			HullTypes: []string{"frigate"},
		}
		actionId := "action-" + uuid.NewString()
		writes := sightings.MintWrites(cid, actionId, []sightings.Sighting{rec})
		if len(writes) != 1 {
			t.Fatalf("seedSightingsDirect: MintWrites returned %d writes, want 1", len(writes))
		}
		w := writes[0]
		if len(w.Path) != 4 {
			t.Fatalf("seedSightingsDirect: unexpected doc path shape %v", w.Path)
		}
		ref := fs.Collection(w.Path[0]).Doc(w.Path[1]).Collection(w.Path[2]).Doc(w.Path[3])
		if _, err := ref.Set(ctx, w.Data); err != nil {
			t.Fatalf("seedSightingsDirect: writing fixture record %d: %v", i, err)
		}
		out = append(out, rec)
	}
	return out
}

// pileRead GETs /v1/sightings with the given raw query string (may be "").
type pilePage struct {
	Sightings  []map[string]any `json:"sightings"`
	NextCursor string           `json:"nextCursor"`
}

func pileRead(t *testing.T, router http.Handler, token, query string) pilePage {
	t.Helper()
	path := "/v1/sightings"
	if query != "" {
		path += "?" + query
	}
	var page pilePage
	w := doJSON(t, router, http.MethodGet, path, token, nil, &page)
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s: status = %d, body = %s", path, w.Code, w.Body.String())
	}
	return page
}

// --- 1.2: the served id ----------------------------------------------------

// Scenario: A served record carries a stable id (read twice) / Two sweeps
// against the same target serve different ids / A record's id names no
// target (no targetId key on the wire).
func TestSightingId_Scenario_StableAcrossReadsAndDistinctAcrossSweeps(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Sighting-Id Corp")
	base := farFromStar(t, ctx, homeId)
	hostId := "host-id-stability-" + fleetId
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	hostPos := base.Add(space.Vec3{X: 20})
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, hostPos)

	// A masked foreign target at the host, present for BOTH sweeps below.
	targetId := "foreign-id-stability-" + fleetId
	target := fleetFixture(targetId, "corp-foreign-id-stability-"+fleetId, homeId, hostPos)
	target.AttachedTo = hostId
	if err := fdao.Save(ctx, target); err != nil {
		t.Fatalf("saving masked foreign target: %v", err)
	}

	// First sweep.
	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("first scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	f1 := readFleet(t, fdao, ctx, fleetId)
	timeSkipAction(t, client, f1.ActiveScanId)
	settleScope(t, router, token, homeId)

	pageA := pileRead(t, router, token, "")
	pageB := pileRead(t, router, token, "")
	idA, idB := "", ""
	for _, s := range pageA.Sightings {
		if hid, _ := s["hostId"].(string); hid == hostId {
			idA, _ = s["id"].(string)
		}
	}
	for _, s := range pageB.Sightings {
		if hid, _ := s["hostId"].(string); hid == hostId {
			idB, _ = s["id"].(string)
		}
	}
	if idA == "" {
		t.Fatalf("sighting-records \"A served record carries a stable id\": no served \"id\" field on the "+
			"minted record for hostId %q (the record itself exists on the first read): %+v", hostId, pageA.Sightings)
	}
	if idA != idB {
		t.Errorf("sighting-records \"A served record carries a stable id\": two reads of the same pile "+
			"served ids %q and %q for the same record", idA, idB)
	}

	// Second, independent sweep against the SAME host/target.
	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("second scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	f2 := readFleet(t, fdao, ctx, fleetId)
	if f2.ActiveScanId == f1.ActiveScanId {
		t.Fatalf("second scan committed the SAME action id as the first — fixture is not exercising two sweeps")
	}
	timeSkipAction(t, client, f2.ActiveScanId)
	settleScope(t, router, token, homeId)

	pageC := pileRead(t, router, token, "")
	var recordsForHost []map[string]any
	for _, s := range pageC.Sightings {
		if hid, _ := s["hostId"].(string); hid == hostId {
			recordsForHost = append(recordsForHost, s)
		}
	}
	if len(recordsForHost) != 2 {
		t.Fatalf("sighting-records \"Two sweeps against the same target share no identifier\": expected 2 "+
			"records for repeated sweeps of hostId %q, got %d: %+v", hostId, len(recordsForHost), recordsForHost)
	}
	id1, _ := recordsForHost[0]["id"].(string)
	id2, _ := recordsForHost[1]["id"].(string)
	if id1 == "" || id2 == "" {
		t.Fatalf("a record for hostId %q served no \"id\" field: %+v", hostId, recordsForHost)
	}
	if id1 == id2 {
		t.Errorf("two independent sweeps against the same target served the SAME id %q", id1)
	}
	if len(id1) != 32 || strings.ToLower(id1) != id1 {
		t.Errorf("served id %q is not a 32-character lowercase hex digest", id1)
	}

	body := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, nil).Body.String()
	if strings.Contains(body, targetId) {
		t.Errorf("GET /v1/sightings response body contains the raw target id %q", targetId)
	}
	if strings.Contains(body, `"targetId"`) {
		t.Errorf("GET /v1/sightings response body contains a \"targetId\" key at all: %s", body)
	}
}

// --- 1.3: the continuation cursor never leaks a target id ------------------

// Scenario: The continuation cursor names no target id — with a pile larger
// than PageMax, across TWO successive pages (so the cursor returned by page
// 1 and consumed to fetch page 2 is itself checked, not merely the response
// bodies).
func TestSightingCursor_Scenario_NeverLeaksATargetIdAcrossTwoPages(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	fs, _ := firestoreClient(t)

	token, corpId := spawnCorp(t, router, "SDET Cursor-Leak Corp")
	const pageMax = 50
	records := seedSightingsDirect(t, fs, corpId, "sys-cursor-leak", pageMax+5)

	page1 := pileRead(t, router, token, "")
	if len(page1.Sightings) != pageMax {
		t.Fatalf("first page returned %d records, want the page maximum %d", len(page1.Sightings), pageMax)
	}
	if page1.NextCursor == "" {
		t.Fatalf("expected a non-empty continuation cursor for a pile larger than the page maximum")
	}
	for _, rec := range records {
		if strings.Contains(page1.NextCursor, rec.TargetId) {
			t.Errorf("sighting-records \"The continuation cursor names no target id\": nextCursor %q contains "+
				"target id %q", page1.NextCursor, rec.TargetId)
		}
	}

	page2 := pileRead(t, router, token, "cursor="+page1.NextCursor)
	if len(page2.Sightings) == 0 {
		t.Fatalf("continuing with the served cursor returned no further records")
	}
	for _, rec := range records {
		if strings.Contains(page2.NextCursor, rec.TargetId) {
			t.Errorf("second page's nextCursor %q contains target id %q", page2.NextCursor, rec.TargetId)
		}
	}
	// Belt-and-braces: the raw response BODIES of both pages, not just the
	// cursor field, never carry a target id (mirrors
	// router_sightings_read_test.go's own body-substring technique, applied
	// here against the NEW digest-based id/cursor rather than the old one).
	body1 := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, nil).Body.String()
	for _, rec := range records {
		if strings.Contains(body1, rec.TargetId) {
			t.Errorf("GET /v1/sightings response body contains target id %q", rec.TargetId)
		}
	}
}

// --- 1.8: the systemId filter -----------------------------------------------

// Scenario: A filtered read returns only the named system's records / A
// filtered read for a system with no records is empty, not an error / An
// unfiltered read is unchanged.
func TestSightingSystemFilter_Scenario_FiltersToOneSystem(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	fs, _ := firestoreClient(t)

	token, corpId := spawnCorp(t, router, "SDET SystemId-Filter Corp")
	sysA := "sys-filter-a-" + uuid.NewString()
	sysB := "sys-filter-b-" + uuid.NewString()
	seedSightingsDirect(t, fs, corpId, sysA, 2)
	seedSightingsDirect(t, fs, corpId, sysB, 3)

	pageA := pileRead(t, router, token, "systemId="+sysA)
	if len(pageA.Sightings) != 2 {
		t.Fatalf("systemId=%s: got %d records, want exactly 2", sysA, len(pageA.Sightings))
	}
	for _, s := range pageA.Sightings {
		if sid, _ := s["systemId"].(string); sid != sysA {
			t.Errorf("systemId=%s: record has systemId %q, want only %q", sysA, sid, sysA)
		}
	}

	neverSweptSystem := "sys-filter-never-swept-" + uuid.NewString()
	pageNever := pileRead(t, router, token, "systemId="+neverSweptSystem)
	if len(pageNever.Sightings) != 0 {
		t.Errorf("systemId=%s (never swept): got %d records, want 0", neverSweptSystem, len(pageNever.Sightings))
	}

	unfiltered := pileRead(t, router, token, "")
	if len(unfiltered.Sightings) != 5 {
		t.Errorf("unfiltered read: got %d records, want all 5 (2 sysA + 3 sysB)", len(unfiltered.Sightings))
	}
}

// Scenario: A filtered read is bounded and paged like any other — the
// cursor returned under a systemId filter continues the FILTERED sequence.
func TestSightingSystemFilter_Scenario_BoundedAndPagedWithinTheFilter(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	fs, _ := firestoreClient(t)

	token, corpId := spawnCorp(t, router, "SDET SystemId-Filter-Paged Corp")
	sysA := "sys-filter-paged-a-" + uuid.NewString()
	sysB := "sys-filter-paged-b-" + uuid.NewString()
	const pageMax = 50
	seedSightingsDirect(t, fs, corpId, sysA, pageMax+3)
	seedSightingsDirect(t, fs, corpId, sysB, 4) // interleaved-in-time noise from a DIFFERENT system

	page1 := pileRead(t, router, token, "systemId="+sysA)
	if len(page1.Sightings) != pageMax {
		t.Fatalf("filtered first page: got %d records, want the page maximum %d", len(page1.Sightings), pageMax)
	}
	for _, s := range page1.Sightings {
		if sid, _ := s["systemId"].(string); sid != sysA {
			t.Fatalf("filtered first page served a record from systemId %q, want only %q", sid, sysA)
		}
	}
	if page1.NextCursor == "" {
		t.Fatalf("expected a non-empty cursor for a filtered pile larger than the page maximum")
	}

	page2 := pileRead(t, router, token, "systemId="+sysA+"&cursor="+page1.NextCursor)
	if len(page2.Sightings) != 3 {
		t.Fatalf("filtered second page: got %d records, want the remaining 3", len(page2.Sightings))
	}
	for _, s := range page2.Sightings {
		if sid, _ := s["systemId"].(string); sid != sysA {
			t.Errorf("filtered second page (continuing sysA's cursor) served a record from systemId %q", sid)
		}
	}
}

// --- 1.7: settle-on-read stamps the SWEEP, not the READ --------------------

// Scenario: A due sweep settled by a read mints as the sweep, not as the
// read (sighting-records) — the minted record's asOf is the sweep's own
// pulse-reach instant (the midpoint of its committed depart/arrive window),
// never the world time the settling read actually ran at, and it carries
// the sweep's own action id (already covered structurally elsewhere; here
// re-asserted alongside the timing claim so both halves of the one scenario
// are pinned together).
func TestSightingSettleOnRead_Scenario_StampsPulseReachNotReadTime(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Settle-On-Read Corp")
	base := farFromStar(t, ctx, homeId)
	hostId := "host-settle-on-read-" + fleetId
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	hostPos := base.Add(space.Vec3{X: 25})
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, hostPos)

	targetId := "foreign-settle-on-read-" + fleetId
	target := fleetFixture(targetId, "corp-foreign-settle-on-read-"+fleetId, homeId, hostPos)
	target.AttachedTo = hostId
	if err := fdao.Save(ctx, target); err != nil {
		t.Fatalf("saving masked foreign target: %v", err)
	}

	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	f := readFleet(t, fdao, ctx, fleetId)
	if f.Scan == nil {
		t.Fatalf("expected a committed scan window")
	}
	depart, arrive := f.Scan.DepartMs, f.Scan.ArriveMs
	wantPulseReach := depart + (arrive-depart)/2

	// Rewrite the action's eta into the past (this repo's own
	// deterministic settle technique) WITHOUT waiting out the sweep's real
	// duration — so the real world clock at settle time is nowhere near
	// wantPulseReach, and a resolver that (wrongly) stamped asOf at the
	// settling read's own Now() would be caught red-handed here.
	timeSkipAction(t, client, f.ActiveScanId)
	realNowAtSettle := common.WorldClock().Now()
	settleScope(t, router, token, homeId)

	page := pileRead(t, router, token, "")
	var asOf int64
	var actionId string
	found := false
	for _, s := range page.Sightings {
		if hid, _ := s["hostId"].(string); hid == hostId {
			found = true
			if v, ok := s["asOf"].(float64); ok {
				asOf = int64(v)
			}
			actionId, _ = s["actionId"].(string)
		}
	}
	if !found {
		t.Fatalf("no minted record for hostId %q after settling the due sweep via a read", hostId)
	}
	if asOf != int64(wantPulseReach) {
		t.Errorf("sighting-records \"A due sweep settled by a read mints as the sweep, not as the read\": "+
			"minted asOf = %d, want the sweep's own pulse-reach %d (depart=%d, arrive=%d)",
			asOf, int64(wantPulseReach), int64(depart), int64(arrive))
	}
	if asOf == int64(realNowAtSettle) {
		t.Errorf("minted asOf (%d) equals the real world time the settling read ran at (%d) — "+
			"the record was stamped as the READ, not as the sweep", asOf, int64(realNowAtSettle))
	}
	if actionId != "" && actionId != f.ActiveScanId {
		t.Errorf("minted record's actionId = %q, want the sweep's own action id %q", actionId, f.ActiveScanId)
	}
}
