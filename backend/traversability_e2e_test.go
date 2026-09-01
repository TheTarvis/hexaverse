package main

// RED-phase end-to-end integration test for openspec change
// replace-observation-with-sightings, tasks.md 1.6 — "End-to-end
// traversability integration test — the link's first milestone: spawn, burn
// to a gate, dock, jump, arrive parked unmasked near the destination gate,
// confirm the crossed lane appears on the galaxy map, confirm the
// destination's full gate set is present. This single path must fail if any
// of blockers 1–4 regress" (design.md Decision 24).
//
// This is the section's real acceptance criterion (see the SDET handoff
// report). It runs against the REAL, production-constructed router
// (SetupRouter()) with a REAL Firebase Auth emulator token — never an
// injected fakeGraph or a hand-rolled composition root — because a
// hand-rolled composition would hide exactly the class of bug this scenario
// exists to catch (blocker 3: router.go forgetting to wire a GraphSource).
//
// SCOPE DECISION (see handoff report): the burn-and-dock leg is arranged
// directly via Firestore (mirroring JumpResolver's own "as if BurnResolver
// had already run" shape, jump_settle_test.go's established convention)
// rather than driven through POST /orders and waited out over the real
// wall clock — burning to a body and docking on arrival is an already-
// shipped, separately-tested capability from an earlier chain link, and is
// not one of this section's four blockers. Exercising it again here through
// a real-time wait would make this test slow and would not add coverage of
// anything blockers 1–4 touch. The JUMP itself, and its arrival, run
// through the real HTTP verbs; only the jump's ARRIVAL wait is short-
// circuited (arranging the stored ETA into the past, rather than sleeping)
// so the test is fast and deterministic while still exercising the real
// JumpResolver and fleet.Service.Get through the real router.
//
// EXPECTED TO BE RED TODAY at the jump commit step (blocker 3: 500, no
// GraphSource configured) — the same failure router_jump_wiring_test.go
// pins in isolation. Once blocker 3 is closed, this test is sensitive in
// turn to blocker 1 (the corporation's charted-lane set is empty at jump
// time — spawn charts no lanes) and blocker 2 (the home system's laneGates
// must be non-empty for the corp to ever discover a gate to jump through,
// checked explicitly below before the jump is even attempted).

import (
	"context"
	"net/http"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
)

func TestTraversability_Scenario_SpawnBurnDockJumpArriveEndToEnd(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	token := mintFirebaseIDToken(t)

	// --- Spawn ---------------------------------------------------------
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
		map[string]any{"name": "SDET Traversability Corp"}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations: status = %d, body = %s", w.Code, w.Body.String())
	}
	fleetId, homeId := spawn.Fleet.Id, spawn.HomeSystem.Id
	if fleetId == "" || homeId == "" {
		t.Fatalf("spawn response missing fleet/homeSystem ids: %+v", spawn)
	}

	// --- Discover a gate through the corp's OWN interior read (blocker 2) ---
	// A freshly spawned corporation has charted NOTHING (spawn charts home
	// explored, no lanes) — if chartedGates still filters lane-gate bodies,
	// this array is empty and the corporation has no way to ever find a
	// road to jump through (system-interior "Bodies Are Public; Ships Are
	// Disclosed": "No body is omitted for lack of stored knowledge").
	var home struct {
		LaneGates []struct {
			DestSystemId string `json:"destSystemId"`
		} `json:"laneGates"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/systems/"+homeId, token, nil, &home); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", homeId, w.Code, w.Body.String())
	}
	if len(home.LaneGates) == 0 {
		t.Fatalf("system-interior \"Bodies Are Public; Ships Are Disclosed\": the home system's interior read "+
			"shows ZERO lane gates to a corporation with no charted knowledge — blocker 2 (chartedGates still "+
			"filtering every gate away from a fresh corp) — the galaxy is untraversable: there is nothing to "+
			"jump to. (home=%s)", homeId)
	}
	destId := home.LaneGates[0].DestSystemId
	gateId := "gate-" + destId

	// The interior read's laneGates carry no laneId (only destSystemId/cell)
	// — resolve the real lane id the same way the galaxy package itself
	// would, via the exported LanesOf seam.
	fs, client := firestoreClient(t)
	ctx := context.Background()
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), common.WorldClock())
	lanes, err := gsvc.LanesOf(ctx, homeId)
	if err != nil {
		t.Fatalf("LanesOf(home): %v", err)
	}
	var laneId string
	for _, l := range lanes {
		if l.OtherSystemId == destId {
			laneId = l.LaneId
			break
		}
	}
	if laneId == "" {
		t.Fatalf("could not resolve a lane id between %q and %q via galaxy.LanesOf (got %+v)", homeId, destId, lanes)
	}

	// --- Arrange: attach the fleet to the gate (burn/dock is out of scope
	// for this section — see the doc comment above) ---
	fdao := fleet.NewDaoWithClient(fs)
	fl, err := fdao.Get(ctx, fleetId)
	if err != nil || fl == nil {
		t.Fatalf("loading the spawned fleet directly (id=%q): %v", fleetId, err)
	}
	fl.AttachedTo = gateId
	fl.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateId, Radius: 300}}
	fl.StateDoc = fleet.EncodeKinematicState(fl.State)
	fl.ActiveActionId = ""
	if err := fdao.Save(ctx, *fl); err != nil {
		t.Fatalf("attaching the fleet to its gate directly: %v", err)
	}

	// --- Jump (blockers 1 and 3) ---
	var jumped struct {
		Jump *struct {
			LaneId       string             `json:"laneId"`
			DestSystemId string             `json:"destSystemId"`
			ArriveMs     common.WorldMillis `json:"arriveMs"`
		} `json:"jump"`
	}
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/jump", token,
		map[string]any{"laneId": laneId}, &jumped)
	if w.Code >= 500 {
		t.Fatalf("POST /v1/fleets/:fleetId/jump against the real production router returned %d (never a 5xx — "+
			"blocker 3). Body: %s", w.Code, w.Body.String())
	}
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/:fleetId/jump status = %d, want 200 — the corporation has charted NO lanes at "+
			"all at this point (spawn charts none), so a non-200 here that isn't blocker 3 is blocker 1 "+
			"(the charted-lane precondition still gates the jump). Body: %s", w.Code, w.Body.String())
	}
	if jumped.Jump == nil || jumped.Jump.DestSystemId != destId || jumped.Jump.ArriveMs <= 0 {
		t.Fatalf("expected a committed jump to %q with a positive ETA, got %+v", destId, jumped.Jump)
	}

	// --- Time-skip the arrival (see doc comment: no real-time wait) ---
	// The resolve trigger reads TWO stored ETAs that must agree: the fleet
	// doc's own Jump.ArriveMs (what Service.Get's own due-check looks at)
	// AND the wrapping action document's Eta (what action.Service.
	// ResolveActive's due-query actually filters on) — rewriting only the
	// former leaves the action's Eta in the future, so ResolveActive finds
	// nothing due and silently no-ops. Both must move together.
	fl2, err := fdao.Get(ctx, fleetId)
	if err != nil || fl2 == nil || fl2.Jump == nil || fl2.ActiveActionId == "" {
		t.Fatalf("re-loading the fleet mid-jump: fl=%+v err=%v", fl2, err)
	}
	pastEta := common.WorldClock().Now() - 1
	if _, err := client.Collection("actions").Doc(fl2.ActiveActionId).Update(ctx, []firestore.Update{
		{Path: "eta", Value: pastEta},
	}); err != nil {
		t.Fatalf("time-skipping the wrapping action's eta into the past: %v", err)
	}
	fl2.Jump.ArriveMs = pastEta
	if err := fdao.Save(ctx, *fl2); err != nil {
		t.Fatalf("time-skipping the jump's ArriveMs into the past: %v", err)
	}

	// --- Arrive (settles opportunistically on read) ---
	var arrived struct {
		SystemId   string       `json:"systemId"`
		AttachedTo string       `json:"attachedTo,omitempty"`
		Jump       *struct{}    `json:"jump,omitempty"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/fleets/"+fleetId, token, nil, &arrived); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/fleets/%s (settling the due jump arrival): status = %d, body = %s",
			fleetId, w.Code, w.Body.String())
	}
	if arrived.SystemId != destId {
		t.Errorf("fleet-movement \"Jump Arrival Parks Near the Destination Gate, Unmasked\": arrived.systemId = "+
			"%q, want the destination %q", arrived.SystemId, destId)
	}
	if arrived.AttachedTo != "" {
		t.Errorf("fleet-movement \"Jump Arrival Parks Near the Destination Gate, Unmasked\": arrival must park "+
			"UNATTACHED (unmasked) near the destination gate; got attachedTo=%q", arrived.AttachedTo)
	}
	if arrived.Jump != nil {
		t.Errorf("expected the jump's lane-transit state to be cleared on arrival, got jump=%+v", arrived.Jump)
	}

	// --- Confirm the crossed lane appears on the galaxy map ---
	var gal struct {
		Lanes []struct {
			Id string `json:"id"`
		} `json:"lanes"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/galaxy", token, nil, &gal); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/galaxy: status = %d, body = %s", w.Code, w.Body.String())
	}
	found := false
	for _, l := range gal.Lanes {
		if l.Id == laneId {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("galaxy-generation / galaxy-knowledge: the crossed lane %q does not appear in GET /v1/galaxy's "+
			"lanes after arrival — jump-arrival must chart the crossed lane via:traveled for the fleet's "+
			"corporation (fleet-movement \"Jump Arrival Parks Near the Destination Gate, Unmasked\": \"Arrival "+
			"charts the crossed lane as traveled\"). Got lanes=%+v", laneId, gal.Lanes)
	}

	// --- Confirm the destination's full gate set is present ---
	var dest struct {
		LaneGates []struct {
			DestSystemId string `json:"destSystemId"`
		} `json:"laneGates"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/systems/"+destId, token, nil, &dest); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", destId, w.Code, w.Body.String())
	}
	if len(dest.LaneGates) == 0 {
		t.Errorf("expected the destination system's gate set to be non-empty after arrival (blocker 2 must " +
			"stay closed on the destination too, and blocker 4's frontier-materialization ordering must not " +
			"strand the arriving fleet with fewer gates than truly exist — the dedicated ordering test for the " +
			"frontier case itself lives in backend/fleet/jump_arrival_lane_horizon_test.go)")
	}
}
