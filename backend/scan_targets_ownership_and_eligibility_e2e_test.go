package main

// RED-phase path-level integration tests for openspec change
// add-scan-and-sightings-surface, tasks.md 1.4, 1.5, 1.6, 1.9 (list half),
// 1.11 (list half), and 3.7/9.2b (no worldTime field) — the new
// `GET /v1/fleets/:fleetId/scan-targets` read
// (specs/focused-scan/spec.md's ADDED "Eligible Scan Targets Are Served Per
// Fleet, To Their Owner Alone" / "A Served Scan Target Is One a Commit
// Would Accept, Priced at the Duration a Commit Would Freeze" / "A Fleet Is
// Never a Host For Its Own Sweep").
//
// Mirrors scan_verb_e2e_test.go's own established fixture techniques
// (placeFleet, farFromStar, bodyTableFor) exactly, against the REAL,
// production-constructed router.
//
// EXPECTED RED TODAY: every request below 404s with Gin's generic
// unmatched-route body ("404 page not found") — no scan-targets route is
// wired at all yet (backend/fleet/handler.go) — guarded throughout by
// requireRouteImplemented so an unwired route cannot pass any of these
// scenarios for the wrong reason.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/space"
)

type scanTargetEntry struct {
	HostId     string  `json:"hostId"`
	Kind       string  `json:"kind"`
	DurationMs float64 `json:"durationMs"`
}

type scanTargetsResp struct {
	Targets []scanTargetEntry `json:"targets"`
}

func scanTargetsReq(t *testing.T, router http.Handler, token, fleetId string) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, router, http.MethodGet, "/v1/fleets/"+fleetId+"/scan-targets", token, nil, nil)
}

func scanTargets(t *testing.T, router http.Handler, token, fleetId string) (scanTargetsResp, *httptest.ResponseRecorder) {
	t.Helper()
	w := scanTargetsReq(t, router, token, fleetId)
	requireRouteImplemented(t, w)
	var out scanTargetsResp
	if w.Code == http.StatusOK {
		if err := jsonUnmarshalLenient(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("decoding scan-targets response: %v\nbody: %s", err, w.Body.String())
		}
	}
	return out, w
}

func findTarget(resp scanTargetsResp, hostId string) (scanTargetEntry, bool) {
	for _, tgt := range resp.Targets {
		if tgt.HostId == hostId {
			return tgt, true
		}
	}
	return scanTargetEntry{}, false
}

// --- 1.4: ownership ---------------------------------------------------------

// Scenario: Another corporation's fleet id is rejected as nonexistent / A
// corpless requester is rejected the same way — all three (foreign,
// nonexistent, corpless) answer 404 with an EMPTY, byte-identical body.
func TestScanTargets_Scenario_OwnershipRejectionsAreIndistinguishable(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	_, _, fleetId, _ := spawnForDisclosureTest(t, router, "SDET ScanTargets Ownership-Anchor Corp")
	otherToken, _, _, _ := spawnForDisclosureTest(t, router, "SDET ScanTargets Foreign Corp")
	corplessToken := mintFirebaseIDToken(t)

	wForeign := scanTargetsReq(t, router, otherToken, fleetId)
	requireRouteImplemented(t, wForeign)
	wNonexistent := scanTargetsReq(t, router, otherToken, "no-such-fleet-"+fleetId)
	requireRouteImplemented(t, wNonexistent)
	wCorpless := scanTargetsReq(t, router, corplessToken, fleetId)
	requireRouteImplemented(t, wCorpless)

	for name, w := range map[string]*httptest.ResponseRecorder{
		"foreign corp":       wForeign,
		"nonexistent fleet":  wNonexistent,
		"corpless requester": wCorpless,
	} {
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404", name, w.Code)
		}
		if w.Body.Len() != 0 {
			t.Errorf("%s: body = %q, want EMPTY — a body would itself disclose the id's existence", name, w.Body.String())
		}
	}
	if wForeign.Code != wNonexistent.Code || wForeign.Code != wCorpless.Code {
		t.Errorf("the three rejections are not identically coded: foreign=%d nonexistent=%d corpless=%d",
			wForeign.Code, wNonexistent.Code, wCorpless.Code)
	}
}

// --- 1.5 (empty-set states): lane transit / running sweep / nothing in reach

// Scenario: A fleet in lane transit has an empty target set.
func TestScanTargets_Scenario_LaneTransitYieldsEmptySet(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET ScanTargets Transit Corp")
	hostId := "host-targets-transit-" + fleetId
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 5})) // well within range, clear sightline

	f := readFleet(t, fdao, ctx, fleetId)
	f.Jump = &fleet.JumpTransit{LaneId: "lane-x", DestSystemId: "sys-elsewhere", DepartMs: 0, ArriveMs: 999_999_999}
	if err := fdao.Save(ctx, *f); err != nil {
		t.Fatalf("setting the fleet mid-jump directly: %v", err)
	}

	resp, w := scanTargets(t, router, token, fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("scan-targets while in lane transit: status = %d, want 200. body=%s", w.Code, w.Body.String())
	}
	if len(resp.Targets) != 0 {
		t.Errorf("scan-targets while in lane transit = %+v, want an empty set even though a host is in range", resp.Targets)
	}
}

// Scenario: A fleet already running a sweep has an empty target set.
func TestScanTargets_Scenario_RunningSweepYieldsEmptySet(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET ScanTargets Running-Sweep Corp")
	base := farFromStar(t, ctx, homeId)
	hostId := "host-targets-running-" + fleetId
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 5}))

	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("committing the running sweep: status = %d, body = %s", w.Code, w.Body.String())
	}

	resp, w := scanTargets(t, router, token, fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("scan-targets with a running sweep: status = %d, want 200. body=%s", w.Code, w.Body.String())
	}
	if len(resp.Targets) != 0 {
		t.Errorf("scan-targets with a running sweep = %+v, want an empty set (the sensor slot is claimed)", resp.Targets)
	}
}

// Scenario: A system with nothing in reach yields an empty set, not an error.
func TestScanTargets_Scenario_NothingInReachYieldsEmptySet(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET ScanTargets Nothing-In-Reach Corp")
	// Placed far from every generated body, well beyond focused-scan range
	// (48), and with no other fleet in the system.
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base.Add(space.Vec3{X: 1_000_000}))

	resp, w := scanTargets(t, router, token, fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("scan-targets with nothing in reach: status = %d, want 200 (never an error). body=%s", w.Code, w.Body.String())
	}
	if len(resp.Targets) != 0 {
		t.Errorf("scan-targets with nothing in reach = %+v, want an empty set", resp.Targets)
	}
}

// --- 1.5/1.6/1.9/1.11: eligibility, ordering, duration, self- and
//     belt-member-exclusion --------------------------------------------------

// Scenario: A host beyond focused-scan range is absent / A host the star
// occludes is absent / A host at exactly the named range is served / The
// reading fleet is absent from its own target list / A foreign fleet in the
// same system is absent / An own fleet in lane transit is absent / An
// owner reads its own fleet's eligible targets (own fleet listed, kind
// "fleet").
func TestScanTargets_Scenario_EligibilityBoundariesAndSelfExclusion(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	const focusedScanRange = 48.0

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET ScanTargets Eligibility Corp")
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)

	beyondId := "host-beyond-targets-" + fleetId
	placeFleet(t, fdao, ctx, beyondId, corpId, homeId, base.Add(space.Vec3{X: focusedScanRange + 5}))

	atRangeId := "host-at-range-targets-" + fleetId
	placeFleet(t, fdao, ctx, atRangeId, corpId, homeId, base.Add(space.Vec3{X: focusedScanRange}))

	ownFleetInRangeId := "host-own-fleet-targets-" + fleetId
	placeFleet(t, fdao, ctx, ownFleetInRangeId, corpId, homeId, base.Add(space.Vec3{Y: 10}))

	foreignId := "host-foreign-targets-" + fleetId
	placeFleet(t, fdao, ctx, foreignId, "corp-foreign-scantargets-"+fleetId, homeId, base.Add(space.Vec3{Y: -10}))

	transitingOwnId := "host-transiting-own-targets-" + fleetId
	transiting := fleetFixture(transitingOwnId, corpId, homeId, base.Add(space.Vec3{X: 5, Y: 5}))
	transiting.Jump = &fleet.JumpTransit{LaneId: "lane-y", DestSystemId: "sys-elsewhere-2", DepartMs: 0, ArriveMs: 999_999_999}
	if err := fdao.Save(ctx, transiting); err != nil {
		t.Fatalf("saving transiting own fleet fixture: %v", err)
	}

	// Occluded: scanner and host straddle the star.
	bt := bodyTableFor(t, ctx, homeId)
	starPos, err := space.Position(bt, bt.StarId(), 0)
	if err != nil {
		t.Fatalf("resolving star position: %v", err)
	}
	occludedScannerId := "occluded-scanner-targets-" + fleetId
	placeFleet(t, fdao, ctx, occludedScannerId, corpId, homeId, starPos.Add(space.Vec3{X: -20}))
	occludedHostId := "host-occluded-targets-" + fleetId
	placeFleet(t, fdao, ctx, occludedHostId, corpId, homeId, starPos.Add(space.Vec3{X: 20}))

	resp, w := scanTargets(t, router, token, fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("scan-targets: status = %d, body = %s", w.Code, w.Body.String())
	}

	if _, ok := findTarget(resp, beyondId); ok {
		t.Errorf("a host beyond range (%q) appeared in the served set: %+v", beyondId, resp.Targets)
	}
	if entry, ok := findTarget(resp, atRangeId); !ok {
		t.Errorf("a host at exactly the named range (%q) is ABSENT, want present (boundary resolves toward disclosure): %+v",
			atRangeId, resp.Targets)
	} else if entry.Kind != "body" && entry.Kind != "fleet" {
		t.Errorf("target %q kind = %q, want %q or %q", atRangeId, entry.Kind, "body", "fleet")
	}
	if _, ok := findTarget(resp, foreignId); ok {
		t.Errorf("a foreign fleet (%q) appeared in the served set: %+v", foreignId, resp.Targets)
	}
	if _, ok := findTarget(resp, transitingOwnId); ok {
		t.Errorf("an own fleet in lane transit (%q) appeared in the served set: %+v", transitingOwnId, resp.Targets)
	}
	if _, ok := findTarget(resp, fleetId); ok {
		t.Errorf("the reading fleet's OWN id (%q) appeared in its own served set: %+v", fleetId, resp.Targets)
	}
	if entry, ok := findTarget(resp, ownFleetInRangeId); !ok {
		t.Errorf("an in-range own fleet (%q) is absent, want present as kind %q: %+v", ownFleetInRangeId, "fleet", resp.Targets)
	} else if entry.Kind != "fleet" {
		t.Errorf("own fleet target %q kind = %q, want %q", ownFleetInRangeId, entry.Kind, "fleet")
	}

	// The occluded pair is read through a SEPARATE fleet (occludedScannerId)
	// so this assertion is independent of the scanner-under-test's own set.
	occludedResp, w2 := scanTargets(t, router, token, occludedScannerId)
	if w2.Code != http.StatusOK {
		t.Fatalf("scan-targets (occluded scanner): status = %d, body = %s", w2.Code, w2.Body.String())
	}
	if _, ok := findTarget(occludedResp, occludedHostId); ok {
		t.Errorf("a host the star occludes (%q) appeared in the served set: %+v", occludedHostId, occludedResp.Targets)
	}

	// Ordering — ascending by hostId, one merged list (link8b-impl-contract.md §1.1).
	for i := 0; i+1 < len(resp.Targets); i++ {
		if resp.Targets[i].HostId > resp.Targets[i+1].HostId {
			t.Errorf("scan-targets not ascending by hostId: %q then %q", resp.Targets[i].HostId, resp.Targets[i+1].HostId)
		}
	}

	// No worldTime field anywhere on the response (3.7/9.2b).
	if w.Body.Len() > 0 && containsAll(w.Body.String(), "worldTime") {
		t.Errorf("scan-targets response carries a \"worldTime\" key, which no client requirement consumes "+
			"(link8b-impl-contract.md §1.1/§3.7): body = %s", w.Body.String())
	}
}

// Scenario: A served duration equals the duration a commit freezes.
func TestScanTargets_Scenario_ServedDurationEqualsCommittedDuration(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET ScanTargets Duration-Agreement Corp")
	base := farFromStar(t, ctx, homeId)
	hostId := "host-duration-agreement-" + fleetId
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 30}))

	resp, w := scanTargets(t, router, token, fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("scan-targets: status = %d, body = %s", w.Code, w.Body.String())
	}
	entry, ok := findTarget(resp, hostId)
	if !ok {
		t.Fatalf("expected %q in the served set: %+v", hostId, resp.Targets)
	}
	if entry.DurationMs <= 0 {
		t.Fatalf("served durationMs = %v, want a strictly positive value", entry.DurationMs)
	}

	if w2 := scanReq(t, router, token, fleetId, hostId); w2.Code < 200 || w2.Code >= 300 {
		t.Fatalf("scan commit against the SAME listed host: status = %d, body = %s", w2.Code, w2.Body.String())
	}
	f := readFleet(t, fdao, ctx, fleetId)
	if f.Scan == nil {
		t.Fatalf("expected a committed scan window")
	}
	gotDuration := float64(f.Scan.ArriveMs - f.Scan.DepartMs)
	// The two reads (scan-targets, then the commit) are not perfectly
	// simultaneous, and duration scales with LIVE range at each read's own
	// world time — but the scanner and host are both static (drift fixtures
	// with zero velocity) between the two calls, so the geometry has not
	// changed and the two computations must agree exactly.
	if gotDuration != entry.DurationMs {
		t.Errorf("focused-scan \"A served duration equals the duration a commit freezes\": scan-targets served "+
			"durationMs=%v, the commit's own committed window spans %v ms — want them EQUAL for an unmoved "+
			"scanner/host pair", entry.DurationMs, gotDuration)
	}
	// REVISED 2026-09-03 (test dispute adjudicated in the developer's favor).
	// The original assertion here compared the stored action's own
	// (eta - committedAt) against the served durationMs. That fails by
	// design, not by defect: action.Service.Commit samples ITS OWN `now`
	// for CommittedAt, independently of and after fleet.Scan's DepartMs
	// (which already completed a Firestore round trip) — design.md
	// Decision 3 records plainly that the two clock reads are "not pinned
	// together by any requirement". The spec scenario this test is named
	// for ("the committed scan's arrive time is T + D") is fully satisfied
	// by the frozen scan window alone (gotDuration, asserted above); it
	// says nothing about the action's OWN commit-time bookkeeping. The
	// property that DOES matter to a client — the instant the running-sweep
	// countdown counts to — is the action's `eta`, which must still equal
	// the frozen arrive instant exactly.
	action := rawAction(t, client, f.ActiveScanId)
	eta, _ := action["eta"].(int64)
	if eta != int64(f.Scan.ArriveMs) {
		t.Errorf("committed action's eta = %d, want the frozen scan window's ArriveMs %d — the eta is what a "+
			"client's running-sweep countdown counts to (system-space-view \"A Running Sweep's Window and Cancel "+
			"Come From the Action Inbox\")", eta, int64(f.Scan.ArriveMs))
	}
}

// --- 1.9 (commit half): self-sweep rejected identically to unresolvable ---

// Scenario: A fleet sweeping itself is rejected / A self-sweep is rejected
// even at zero range with a clear sightline.
func TestScanTargets_Scenario_SelfSweepCommitRejectedIdenticallyToUnresolvable(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Self-Sweep Corp")
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)

	wSelf := scanReq(t, router, token, fleetId, fleetId)
	wUnresolvable := scanReq(t, router, token, fleetId, "no-such-host-selfsweep-"+fleetId)

	if wSelf.Code >= 200 && wSelf.Code < 300 {
		t.Fatalf("focused-scan \"A Fleet Is Never a Host For Its Own Sweep\": a self-sweep was ACCEPTED "+
			"(status %d) even at zero range with a clear sightline", wSelf.Code)
	}
	if wSelf.Code != wUnresolvable.Code || wSelf.Body.String() != wUnresolvable.Body.String() {
		t.Errorf("a self-sweep rejected with status=%d body=%q, an unresolvable host with status=%d body=%q — "+
			"want byte-identical rejections", wSelf.Code, wSelf.Body.String(), wUnresolvable.Code, wUnresolvable.Body.String())
	}
	f := readFleet(t, fdao, ctx, fleetId)
	if f.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after a rejected self-sweep, want empty — no sensor-channel slot claimed", f.ActiveScanId)
	}
}

// --- 1.11 (both halves): belt member excluded from the list and the commit

// Scenario: A belt is served as one host, never as its members / A commit
// naming a belt member is rejected as unresolvable.
//
// Skips (rather than flakily failing) if the freshly generated home system
// happens to carry no belt feature — belt placement is a generation
// outcome, not a guarantee this suite controls, and a skip here is honest
// about that rather than asserting a property the fixture cannot arrange.
func TestScanTargets_Scenario_BeltServedAsOneHostNeverAsMembers(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Belt-Member Corp")
	body := interiorBody(t, router, token, homeId)
	features := featuresOf(t, body)
	beltId := ""
	for _, f := range features {
		if typ, _ := f["type"].(string); typ == "belt" {
			beltId, _ = f["id"].(string)
			break
		}
	}
	if beltId == "" {
		t.Skip("this freshly generated home system carries no belt feature — nothing to assert against")
	}

	bt := bodyTableFor(t, ctx, homeId)
	beltPos, err := space.Position(bt, beltId, common.WorldClock().Now())
	if err != nil {
		t.Fatalf("resolving belt %q position: %v", beltId, err)
	}
	// AT the belt's own position: distance 0 guarantees WithinRange passes
	// and Occluded early-returns false for the zero-length segment (the
	// exact geometric edge case focused-scan's own self-sweep rule
	// exploits) — so this fixture needs no star-clearance reasoning.
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, beltPos)

	resp, w := scanTargets(t, router, token, fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("scan-targets: status = %d, body = %s", w.Code, w.Body.String())
	}
	if _, ok := findTarget(resp, beltId); !ok {
		t.Fatalf("the belt feature %q itself is absent from the served set: %+v", beltId, resp.Targets)
	}
	memberId := beltId + "#0"
	if _, ok := findTarget(resp, memberId); ok {
		t.Errorf("focused-scan \"A belt is served as one host, never as its members\": derived member %q "+
			"appeared in the served set: %+v", memberId, resp.Targets)
	}

	wMember := scanReq(t, router, token, fleetId, memberId)
	wUnresolvable := scanReq(t, router, token, fleetId, "no-such-host-beltmember-"+fleetId)
	if wMember.Code >= 200 && wMember.Code < 300 {
		t.Fatalf("focused-scan \"A commit naming a belt member is rejected as unresolvable\": commit against "+
			"%q was ACCEPTED (status %d)", memberId, wMember.Code)
	}
	if wMember.Code != wUnresolvable.Code || wMember.Body.String() != wUnresolvable.Body.String() {
		t.Errorf("a belt-member commit rejected with status=%d body=%q, an unresolvable host with status=%d "+
			"body=%q — want byte-identical rejections", wMember.Code, wMember.Body.String(), wUnresolvable.Code, wUnresolvable.Body.String())
	}
}
