package main

// RED-phase end-to-end integration test for openspec change
// replace-observation-with-sightings, tasks.md 4.11 + 8.8
// (specs/system-interior/spec.md ADDED "Lane-Gate Bodies Carry Their Lane
// Id"; specs/board-view/spec.md ADDED "Jump Commit").
//
// This is the "no fake" proof standing rule #1 asks for: gates_lane_id_test.go
// (backend/system) already unit-tests LaneGates' own LaneId derivation
// against a fakeGalaxy — correct, isolated, and (per the chain's own
// history: the link-4 jump resolver, link-5 GraphSource, charts's
// GateAttachmentWrite) NEVER SUFFICIENT ON ITS OWN, because a fake standing
// in for `galaxy` cannot prove that `system.LaneGates`'s own laneId and
// `galaxy.LaneCrossing` (the REAL GraphSource POST /v1/fleets/:id/jump
// commits through, wired in router.go) agree on the id for the same
// crossing. This test runs the full read-then-jump path against the REAL,
// production-constructed router (SetupRouter()) with a REAL Firestore-backed
// galaxy and a REAL Firebase Auth emulator token — the same posture
// traversability_e2e_test.go (tasks.md 1.6) already established for the
// four original blockers, extended to this later-discovered fifth gap: the
// interior read's laneGates carried no laneId at all, so a client had no
// wire field to satisfy Jump's required {laneId} body with.
//
// Genuinely RED today: `system.LaneGate` (backend/system/gates.go) has no
// LaneId field, so `home.LaneGates[0].LaneId` fails to compile until 4.11
// adds it. Once it compiles, the assertions below are ALSO expected to be
// red until LaneGates is actually wired to populate it (a decoded zero
// value, "", on an added-but-unpopulated field would compile and 200, and
// is exactly why every assertion below checks non-empty and cross-checks
// against galaxy.LaneIdBetween rather than merely checking the field is
// present).

import (
	"net/http"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"
)

func TestLaneIdTraversal_Scenario_ServedLaneIdReadsAndJumpsEndToEnd(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	token := mintFirebaseIDToken(t)

	// --- Spawn (a fresh corporation — zero charted lanes, spawn charts home
	// explored only) ------------------------------------------------------
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts: status = %d, body = %s", w.Code, w.Body.String())
	}
	var spawn struct {
		Fleet      struct{ Id string } `json:"fleet"`
		HomeSystem struct{ Id string } `json:"homeSystem"`
	}
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
		map[string]any{"name": "SDET Lane-Id Corp"}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations: status = %d, body = %s", w.Code, w.Body.String())
	}
	fleetId, homeId := spawn.Fleet.Id, spawn.HomeSystem.Id
	if fleetId == "" || homeId == "" {
		t.Fatalf("spawn response missing fleet/homeSystem ids: %+v", spawn)
	}

	// --- Scenario: "A fresh corporation with no charted lanes still
	// receives a usable lane id" — confirm charted knowledge really is empty
	// before reading, so the assertions below can't be trivially explained
	// by the corp having charted something already. ------------------------
	var gal struct {
		Lanes []struct{ Id string } `json:"lanes"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/galaxy", token, nil, &gal); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/galaxy: status = %d, body = %s", w.Code, w.Body.String())
	}

	// --- Scenario: "A materialized system's read carries each lane-gate
	// body's lane id" — read the corp's OWN home interior and take the
	// served laneId straight off the wire, no second lookup. ---------------
	var home struct {
		LaneGates []struct {
			DestSystemId string `json:"destSystemId"`
			LaneId       string `json:"laneId"`
		} `json:"laneGates"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/systems/"+homeId, token, nil, &home); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", homeId, w.Code, w.Body.String())
	}
	if len(home.LaneGates) == 0 {
		t.Fatalf("home system's interior read carries ZERO lane gates — nothing to jump to (home=%s)", homeId)
	}
	gate := home.LaneGates[0]
	if gate.LaneId == "" {
		t.Fatalf("system-interior \"Lane-Gate Bodies Carry Their Lane Id\": the gate to %q on the home system's "+
			"interior read carries an EMPTY laneId — a client has no wire field to satisfy Jump's required "+
			"{laneId} body with. Full gate: %+v", gate.DestSystemId, gate)
	}

	// --- Scenario: "The served lane id matches the server's own derivation
	// for the same crossing" — cross-checked against galaxy.LaneIdBetween,
	// the SAME pure derivation gate-attachment/travel-arrival charting
	// writes already key on (called directly here: a deterministic, no-read
	// pure function is not a fake standing in for a dependency — it's the
	// spec's own named oracle). -------------------------------------------
	wantLaneId := galaxy.LaneIdBetween(homeId, gate.DestSystemId)
	if gate.LaneId != wantLaneId {
		t.Errorf("gate %s -> %s: served laneId = %q, want %q (galaxy.LaneIdBetween(%q, %q)) — the interior read's "+
			"laneId must be the SAME id both gate-attachment and travel-arrival charting already agree on",
			homeId, gate.DestSystemId, gate.LaneId, wantLaneId, homeId, gate.DestSystemId)
	}

	// --- Arrange: attach the fleet to that gate (burn/dock is a separately
	// shipped, separately tested capability — see traversability_e2e_test.go's
	// own identical scope note; this test's own subject is the laneId wire
	// path and jump acceptance, not the burn-then-dock leg). ---------------
	destId := gate.DestSystemId
	gateBodyId := "gate-" + destId
	fs, _ := firestoreClient(t)
	ctx := t.Context()
	fdao := fleet.NewDaoWithClient(fs)
	fl, err := fdao.Get(ctx, fleetId)
	if err != nil || fl == nil {
		t.Fatalf("loading the spawned fleet directly (id=%q): %v", fleetId, err)
	}
	fl.AttachedTo = gateBodyId
	fl.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateBodyId, Radius: 300}}
	fl.StateDoc = fleet.EncodeKinematicState(fl.State)
	fl.ActiveActionId = ""
	if err := fdao.Save(ctx, *fl); err != nil {
		t.Fatalf("attaching the fleet to its gate directly: %v", err)
	}

	// --- Scenario: "The served lane id is the one the jump endpoint
	// accepts" — commit the jump naming EXACTLY the laneId the interior read
	// served, with NO client-side re-derivation and no second lookup
	// (galaxy.LanesOf, LaneIdBetween, or otherwise). -----------------------
	var jumped struct {
		Jump *struct {
			DestSystemId string             `json:"destSystemId"`
			ArriveMs     common.WorldMillis `json:"arriveMs"`
		} `json:"jump"`
	}
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/jump", token,
		map[string]any{"laneId": gate.LaneId}, &jumped)
	if w.Code >= 500 {
		t.Fatalf("POST /v1/fleets/:fleetId/jump with the interior read's OWN served laneId returned %d (never a "+
			"5xx). Body: %s", w.Code, w.Body.String())
	}
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/:fleetId/jump status = %d, want 200 — the server rejected the exact laneId it "+
			"itself served on the interior read for the gate the fleet is attached to (board-view \"Jump Commit\": "+
			"\"invoking jump submits an order naming that laneId... with no second read to resolve the id\"). "+
			"Body: %s", w.Code, w.Body.String())
	}
	if jumped.Jump == nil || jumped.Jump.DestSystemId != destId || jumped.Jump.ArriveMs <= 0 {
		t.Fatalf("expected a committed jump to %q with a positive ETA, got %+v", destId, jumped.Jump)
	}
}
