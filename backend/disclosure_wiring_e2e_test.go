package main

// RED-phase path-level integration tests for replace-observation-with-
// sightings §4 ("disclosure Wiring", tasks.md 4.1-4.9) plus the two debts §3
// deferred to this section (specs/sighting-records/spec.md "A Sighting Is
// Never Consulted To Decide Live Disclosure" — "Holding a sighting does not
// disclose its target live"; "A sighting for a target now out of range is
// absent from contacts").
//
// Every test here drives the REAL, production-constructed router
// (SetupRouter(), the same e2e_testsupport_test.go harness
// traversability_e2e_test.go uses) rather than a package-scoped substitute —
// per the standing rule carried into this section: §4 is where `disclosure`
// finally gets a consumer after shipping with zero, and a unit test of the
// mechanism alone would prove nothing about whether it is actually reached
// from `GET /v1/systems/:systemId`. Geometry fixtures (which fleet is where)
// are arranged directly via Firestore, exactly as traversability_e2e_test.go
// arranges the burn/dock leg — proximity-disclosure's own geometry rules are
// already unit-tested in backend/disclosure; driving fleets into position
// through real burns over the wall clock would make these tests slow without
// adding coverage of anything this section touches.
//
// Every scenario that expects `contacts` to be NON-empty deliberately
// includes at least one foreign fleet that MUST be disclosed, so a totally
// unimplemented `contacts` array (today's state: the field does not exist on
// the wire at all) always fails these tests rather than vacuously satisfying
// an "absent" assertion — see the SDET handoff report's discussion of
// avoiding tautological reds for the lane-transit and held-sighting
// exclusion scenarios in particular.
//
// EXPECTED TO BE RED TODAY: `system.interiorDTO` carries no `contacts`
// field and no body carries `space`/`size` (system/handler.go,
// system/fog.go, as read at HEAD). Every assertion below that reads
// body["contacts"] or a feature's "space"/"size" key finds it absent
// (json.RawMessage / map lookup miss) and fails for that reason — never a
// compile error, since this file never references an internal Go type that
// doesn't exist yet, only the untyped wire JSON.

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/sightings"
	"hexaverse/space"
	"hexaverse/system"
)

// spawnForDisclosureTest spawns a fresh corporation through the real router
// and returns its auth token, corp id, home fleet id, and home system id —
// shared setup for every scenario below.
func spawnForDisclosureTest(t *testing.T, router http.Handler, name string) (token, corpId, fleetId, homeId string) {
	t.Helper()
	token = mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts: status = %d, body = %s", w.Code, w.Body.String())
	}
	var spawn struct {
		Corporation struct {
			Id string `json:"id"`
		} `json:"corporation"`
		Fleet struct {
			Id string `json:"id"`
		} `json:"fleet"`
		HomeSystem struct {
			Id string `json:"id"`
		} `json:"homeSystem"`
	}
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
		map[string]any{"name": name}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations: status = %d, body = %s", w.Code, w.Body.String())
	}
	if spawn.Fleet.Id == "" || spawn.HomeSystem.Id == "" || spawn.Corporation.Id == "" {
		t.Fatalf("spawn response missing ids: %+v", spawn)
	}
	return token, spawn.Corporation.Id, spawn.Fleet.Id, spawn.HomeSystem.Id
}

// driftFleet saves a fleet document directly at an exact, controlled
// position — a free, unpowered coast at zero velocity, so its position at
// every world time is exactly the anchor written here, with no dependency
// on the star/body layout a real generated system happens to roll.
func driftFleet(t *testing.T, fdao fleet.Dao, ctx context.Context, id, corpId, systemId string, at space.Vec3) {
	t.Helper()
	f := fleet.Fleet{
		Id: id, CorporationId: corpId, SystemId: systemId,
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: at, Velocity: space.Vec3{}, EpochMs: 1}},
	}
	if err := fdao.Save(ctx, f); err != nil {
		t.Fatalf("saving drift fixture fleet %q: %v", id, err)
	}
}

// interiorBody GETs a system's interior for the given token and returns the
// decoded JSON as an untyped map — deliberately untyped (rather than
// decoding into system.interiorDTO, which this test file cannot reach across
// the package boundary, or a locally-declared struct pinning a key casing no
// scenario has decided yet) so a wire-shape choice §4's implementer makes
// that this section's scenarios do not pin (e.g. contact position key
// casing) cannot fail this file to compile or produce a false negative.
func interiorBody(t *testing.T, router http.Handler, token, systemId string) map[string]any {
	t.Helper()
	req := doJSON(t, router, http.MethodGet, "/v1/systems/"+systemId, token, nil, nil)
	if req.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", systemId, req.Code, req.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(req.Body.Bytes(), &out); err != nil {
		t.Fatalf("decoding interior response: %v\nbody: %s", err, req.Body.String())
	}
	return out
}

// contactsOf extracts the interior response's contacts array as a slice of
// untyped elements, distinguishing "key absent" (nil, len 0 — today's state)
// from "key present, empty array" via t.Helper()-scoped presence tracking:
// callers that need to assert PRESENCE (not just count) read ok separately.
func contactsOf(body map[string]any) (contacts []any, present bool) {
	raw, ok := body["contacts"]
	if !ok || raw == nil {
		return nil, ok
	}
	arr, ok := raw.([]any)
	return arr, ok
}

// featuresOf extracts the interior response's features array.
func featuresOf(t *testing.T, body map[string]any) []map[string]any {
	t.Helper()
	raw, ok := body["features"].([]any)
	if !ok {
		t.Fatalf("interior response has no usable \"features\" array: %+v", body["features"])
	}
	out := make([]map[string]any, 0, len(raw))
	for _, f := range raw {
		m, ok := f.(map[string]any)
		if !ok {
			t.Fatalf("a features[] element is not an object: %#v", f)
		}
		out = append(out, m)
	}
	return out
}

// bodyTableFor computes a real system.BodyTable the same way router.go's own
// composition wires system+galaxy, for tests that need a body's true
// continuous position to place a fixture fleet near it — never derived from
// the wire (space/size are exactly what this section is red for).
func bodyTableFor(t *testing.T, ctx context.Context, systemId string) *system.BodyTable {
	t.Helper()
	fs, _ := firestoreClient(t)
	clock := common.WorldClock()
	galaxySvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clock)
	sysSvc := system.NewServiceWith(system.NewDaoWithClient(fs), galaxySvc, clock)
	bt, err := sysSvc.BodyTable(ctx, systemId)
	if err != nil {
		t.Fatalf("BodyTable(%s): %v", systemId, err)
	}
	return bt
}

// firstNonStarNonGateBody returns a deterministic, real body id from a body
// table — never the star, never a synthetic lane-gate body — so a fixture
// fleet can be docked/masked at an ordinary body.
func firstNonStarNonGateBody(t *testing.T, bt *system.BodyTable) string {
	t.Helper()
	for _, id := range bt.Ids() {
		if id == bt.StarId() {
			continue
		}
		if len(id) >= 5 && id[:5] == "gate-" {
			continue
		}
		return id
	}
	t.Fatalf("body table for a freshly generated system has no ordinary body: ids=%v", bt.Ids())
	return ""
}

// Scenario: An authenticated, spawned requester receives every body in full
// / A materialized system's read carries every body's continuous position
// and size (system-interior). tasks.md 4.6, 4.7.
//
// RETARGETED 2026-09-03 (build-production-space-view, tasks.md 9.1). This test
// also carried three inline "Pre-existing wire fields are unchanged"
// assertions — band == "visible", live == true, and a footprint key on every
// feature — plus a laneGates[].cell loop. That scenario belonged to link
// 8a-1's additive guarantee and its requirement, `system-interior`'s *Interior
// Read Endpoint*, is REMOVED by this change; the fields themselves are gone
// from the DTO. The four assertions were DELETED rather than retargeted here:
// their successor, *Lattice-only fields are absent from the response*, is
// asserted at this same real-router level in
// interior_continuous_wire_e2e_test.go, and duplicating it in a disclosure
// test would put a wire-shape guard in a file about who-sees-whom. What
// survives below is what this file is actually for plus the continuous
// position/size half, which is unaffected by the removal.
func TestInterior_Scenario_BodiesPublicWithSpaceAndSize(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	token, _, _, homeId := spawnForDisclosureTest(t, router, "SDET Bodies-Public Corp")
	body := interiorBody(t, router, token, homeId)
	features := featuresOf(t, body)
	if len(features) == 0 {
		t.Fatalf("a freshly generated system's interior served zero features")
	}
	for _, f := range features {
		id, _ := f["id"].(string)
		if _, ok := f["space"]; !ok {
			t.Errorf("feature %q: no \"space\" key — every body must carry a continuous position "+
				"(system-interior \"A materialized system's read carries every body's continuous position and "+
				"size\")", id)
			continue
		}
		size, ok := f["size"].(float64)
		if !ok || size <= 0 {
			t.Errorf("feature %q: size = %v, want a strictly positive continuous size", id, f["size"])
		}
	}
}

// Scenario: A corpless requester's contacts array is empty (system-interior
// "Foreign Presence Is Served As System Contacts"). tasks.md 4.5.
//
// Asserted by JSON KEY PRESENCE, not merely "len == 0" — an absent field and
// an empty array both decode to len 0, and only the former is today's actual
// (wrong) state.
func TestInterior_Scenario_CorplessRequesterContactsArrayIsPresentAndEmpty(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// A real system id to read, from an unrelated spawned corp.
	_, _, _, homeId := spawnForDisclosureTest(t, router, "SDET Corpless-Anchor Corp")

	corplessToken := mintFirebaseIDToken(t) // authenticated, never spawned — no POST /v1/corporations
	body := interiorBody(t, router, corplessToken, homeId)
	contacts, present := contactsOf(body)
	if !present {
		t.Fatalf("interior response for a corpless requester has no \"contacts\" key at all: %+v", body)
	}
	if len(contacts) != 0 {
		t.Errorf("corpless requester's contacts = %v, want an empty array", contacts)
	}
}

// Scenario: A target seen by only one of several own fleets is disclosed /
// A target seen by more than one own fleet is disclosed exactly once / A
// fleet in lane transit contributes no observation (proximity-disclosure
// "Disclosure to a Corporation Is the Union Over Its Own Assets"); Contacts
// reflect the requester's own union of observers / A target seen by more
// than one own fleet appears once in contacts (system-interior "Foreign
// Presence Is Served As System Contacts"). tasks.md 4.4, 4.5.
//
// One test, three assertions bound together on purpose: this is the ONLY
// arrangement of fixtures that cannot be vacuously satisfied by an
// unimplemented `contacts` array (which would report 0, not the required 1).
func TestInterior_Scenario_ContactUnionDedupedAndLaneTransitExcluded(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()

	token, corpId, homeFleetId, homeId := spawnForDisclosureTest(t, router, "SDET Union-Dedup Corp")
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	// Two of the corp's own fleets, independently within passive range (12)
	// of the SAME foreign target — dedup must collapse this to one contact.
	driftFleet(t, fdao, ctx, homeFleetId, corpId, homeId, space.Vec3{X: 150, Y: 8})
	driftFleet(t, fdao, ctx, "own-fleet-2-"+homeFleetId, corpId, homeId, space.Vec3{X: 150, Y: -8})
	driftFleet(t, fdao, ctx, "foreign-dedup-target", "corp-foreign-dedup", homeId, space.Vec3{X: 150, Y: 0})

	// A THIRD own fleet, in lane transit (Jump set) — its STALE stored
	// position sits near a SECOND foreign target that must NOT appear.
	transiting := fleet.Fleet{
		Id: "own-fleet-transiting-" + homeFleetId, CorporationId: corpId, SystemId: homeId,
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: space.Vec3{X: 300, Y: 0}, Velocity: space.Vec3{}, EpochMs: 1}},
		Jump:  &fleet.JumpTransit{LaneId: "lane-x", DestSystemId: "sys-elsewhere", DepartMs: 0, ArriveMs: 999_999_999},
	}
	if err := fdao.Save(ctx, transiting); err != nil {
		t.Fatalf("saving the lane-transiting fixture fleet: %v", err)
	}
	driftFleet(t, fdao, ctx, "foreign-transit-only-target", "corp-foreign-transit", homeId, space.Vec3{X: 300, Y: 5})

	body := interiorBody(t, router, token, homeId)
	contacts, present := contactsOf(body)
	if !present {
		t.Fatalf("interior response has no \"contacts\" key at all: %+v", body)
	}
	if len(contacts) != 1 {
		t.Fatalf("contacts = %v (len %d), want exactly 1: the target seen by TWO own fleets deduped to one, and "+
			"the target only reachable from the transiting fleet's STALE position excluded entirely "+
			"(proximity-disclosure \"A target seen by more than one own fleet is disclosed exactly once\", "+
			"\"A fleet in lane transit contributes no observation\")", contacts, len(contacts))
	}
}

// Scenario: A masked, docked own fleet still observes (proximity-disclosure
// "Disclosure to a Corporation Is the Union Over Its Own Assets"). tasks.md
// 4.1, 4.2, 4.4.
func TestInterior_Scenario_MaskedDockedOwnFleetStillObserves(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()

	token, corpId, homeFleetId, homeId := spawnForDisclosureTest(t, router, "SDET Masked-Observer Corp")
	bt := bodyTableFor(t, ctx, homeId)
	hostId := firstNonStarNonGateBody(t, bt)
	hostPos, err := space.Position(bt, hostId, 0)
	if err != nil {
		t.Fatalf("resolving host body position: %v", err)
	}

	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	// The corp's own fleet, MASKED and DOCKED at hostId (AttachedTo set, not
	// emitting) — a masked observer must still contribute to the union.
	masked := fleet.Fleet{
		Id: homeFleetId, CorporationId: corpId, SystemId: homeId, AttachedTo: hostId,
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: hostPos, Velocity: space.Vec3{}, EpochMs: 1}},
	}
	if err := fdao.Save(ctx, masked); err != nil {
		t.Fatalf("saving the masked/docked fixture fleet: %v", err)
	}
	driftFleet(t, fdao, ctx, "foreign-near-masked-observer", "corp-foreign-masked", homeId, hostPos.Add(space.Vec3{X: 8}))

	body := interiorBody(t, router, token, homeId)
	contacts, present := contactsOf(body)
	if !present {
		t.Fatalf("interior response has no \"contacts\" key at all: %+v", body)
	}
	if len(contacts) != 1 {
		t.Errorf("contacts = %v (len %d), want exactly 1 — the corp's own fleet is masked and docked, but masking "+
			"governs disclosure of that fleet, never what it can itself observe", contacts, len(contacts))
	}
}

// Scenario: A foreign fleet is omitted from a list read / A foreign fleet
// 404s on a direct fetch (fleet-movement "Fleet Read Endpoints Serve Own
// Fleets In Full and Foreign Fleets As Contacts"). tasks.md 4.8.
//
// Confirms, through the REAL router, that a foreign fleet reaches this
// corporation ONLY as an anonymous interior contact and never through a
// fleet endpoint by id — already the shipped behavior as of this file's
// writing (see the SDET handoff report: this is a permanent regression net
// for design.md Decision 7, not new red behavior).
func TestFleetReads_Scenario_ForeignFleetNeverReachesAFleetEndpoint(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()

	token, corpId, _, homeId := spawnForDisclosureTest(t, router, "SDET Audience-Fog Corp")
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)
	driftFleet(t, fdao, ctx, "foreign-audience-fog-target", "corp-foreign-audience", homeId, space.Vec3{X: 20})
	_ = corpId

	if w := doJSON(t, router, http.MethodGet, "/v1/fleets/foreign-audience-fog-target", token, nil, nil); w.Code != http.StatusNotFound {
		t.Errorf("GET /v1/fleets/:fleetId for a foreign fleet: status = %d, want 404 (never 403 — a 403 would "+
			"itself confirm the id exists)", w.Code)
	}

	var list struct {
		Fleets []struct {
			Id string `json:"id"`
		} `json:"fleets"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/fleets?systemId="+homeId, token, nil, &list); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/fleets?systemId=%s: status = %d, body = %s", homeId, w.Code, w.Body.String())
	}
	for _, f := range list.Fleets {
		if f.Id == "foreign-audience-fog-target" {
			t.Errorf("the foreign fleet appeared in a systemId list read; it must be omitted entirely, disclosed " +
				"or not — a disclosed foreign fleet reaches this endpoint's caller only as an anonymous interior " +
				"contact")
		}
	}
}

// Scenario: Holding a sighting does not disclose its target live / A
// sighting for a target now out of range is absent from contacts
// (sighting-records "A Sighting Is Never Consulted To Decide Live
// Disclosure") — the two debts §3 explicitly deferred to this section's
// task 4.5. tasks.md 4.5.
//
// A THIRD, genuinely-in-range foreign fleet is included so this test cannot
// be vacuously satisfied by a `contacts` array that is simply always empty
// (today's actual, unimplemented state) — see the file-level doc comment.
func TestInterior_Scenario_HoldingASightingNeverDisclosesOrLeaksIntoContacts(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()

	token, corpId, homeFleetId, homeId := spawnForDisclosureTest(t, router, "SDET Held-Sighting Corp")
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	// The corp's one observing fleet, and a target genuinely in range of it —
	// this is the control that must appear, proving contacts are live.
	driftFleet(t, fdao, ctx, homeFleetId, corpId, homeId, space.Vec3{X: 0, Y: 1000})
	driftFleet(t, fdao, ctx, "foreign-live-control", "corp-foreign-live", homeId, space.Vec3{X: 0, Y: 1008})

	// A DIFFERENT foreign fleet, far out of range of every own fleet — but
	// the corp holds an old sighting record naming it.
	const heldTargetId = "foreign-stale-sighted"
	driftFleet(t, fdao, ctx, heldTargetId, "corp-foreign-stale", homeId, space.Vec3{X: 0, Y: -5000})

	writes := sightings.MintWrites(corpId, "fake-scan-action-1", []sightings.Sighting{{
		SystemId: homeId, TargetId: heldTargetId, AsOf: 100,
		Position: space.Vec3{X: 0, Y: -5000}, Velocity: space.Vec3{}, Emitting: false,
		HullCount: 2, HullTypes: []string{"scout"},
	}})
	for _, w := range writes {
		if len(w.Path) != 4 {
			t.Fatalf("unexpected sighting doc path shape: %v", w.Path)
		}
		ref := fs.Collection(w.Path[0]).Doc(w.Path[1]).Collection(w.Path[2]).Doc(w.Path[3])
		if _, err := ref.Set(ctx, w.Data); err != nil {
			t.Fatalf("writing the held-sighting fixture directly: %v", err)
		}
	}

	// Sanity: the pile itself actually holds the record (§3's own surface,
	// exercised here only as a precondition check for this test's fixture).
	var pile struct {
		Sightings []map[string]any `json:"sightings"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, &pile); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/sightings: status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(pile.Sightings) == 0 {
		t.Fatalf("the fixture sighting was not written/readable; this test's precondition failed, not its subject")
	}

	body := interiorBody(t, router, token, homeId)
	contacts, present := contactsOf(body)
	if !present {
		t.Fatalf("interior response has no \"contacts\" key at all: %+v", body)
	}
	if len(contacts) != 1 {
		t.Fatalf("contacts = %v (len %d), want exactly 1 (only the live, in-range control target) — a sighting "+
			"held for an out-of-range target must not appear in contacts, and must not change the count "+
			"(sighting-records \"A sighting for a target now out of range is absent from contacts\")",
			contacts, len(contacts))
	}
}
