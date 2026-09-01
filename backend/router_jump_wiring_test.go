package main

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 8.2 (the blocker-3 half) — "an HTTP-level test that submits POST
// /v1/fleets/:fleetId/jump against the real, production-constructed router
// (no fake GraphSource) for a fleet attached to a gate, and asserts a
// success response carrying the committed ETA — never a 5xx" (design.md
// Decision 22; fleet-movement "Fleet Command Endpoints Are Restricted to the
// Owning Corporation": "The owning corporation's jump order succeeds at the
// HTTP surface").
//
// This is the narrower of the two production-router tests in this package
// (see traversability_e2e_test.go for the comprehensive slice covering all
// four blockers together, tasks.md 1.6): it proves ONLY that jump's
// commit path never 5xxs through the REAL router.go composition —
// SetupRouter() itself, called directly, with no substituted GraphSource —
// which is the exact regression net design.md Decision 22 calls for: "the
// constructor's type signature... makes an unwired router a compile error,
// so the regression net that matters is the end-to-end behavior, not the
// wiring itself."
//
// EXPECTED TO BE RED TODAY: router.go's fleetSvc :=
// fleet.NewServiceWith(fleet.NewDao(), systemSvc, actionSvc, clock) never
// calls .WithGraph(...), so Jump's own s.graph == nil guard fires before any
// game rule runs, and Handler.respond's default branch maps that error to
// 500 (fleet/handler.go's error switch has no case for it).

import (
	"context"
	"net/http"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"
)

func TestRouter_Scenario_OwningCorporationsJumpOrderSucceedsAtTheHTTPSurface(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	token := mintFirebaseIDToken(t)

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
		map[string]any{"name": "SDET Jump-Wiring Corp"}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations: status = %d, body = %s", w.Code, w.Body.String())
	}
	if spawn.Fleet.Id == "" || spawn.HomeSystem.Id == "" {
		t.Fatalf("spawn response missing fleet/homeSystem ids: %+v", spawn)
	}

	fs, _ := firestoreClient(t)
	ctx := context.Background()
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), common.WorldClock())
	lanes, err := gsvc.LanesOf(ctx, spawn.HomeSystem.Id)
	if err != nil {
		t.Fatalf("LanesOf(home): %v", err)
	}
	if len(lanes) == 0 {
		t.Fatalf("test-environment issue, not the scenario under test: home system %q has no incident lanes at "+
			"all, so there is no gate to attach to and jump from", spawn.HomeSystem.Id)
	}
	destId, laneId := lanes[0].OtherSystemId, lanes[0].LaneId
	gateId := "gate-" + destId

	// Arrange: attach the fleet to its lane's own gate body directly —
	// bypassing the burn/dock mechanic (already covered elsewhere, not this
	// section's own concern) — mirroring JumpResolver's own "as if
	// BurnResolver had already run" shape (fleet/jump_settle_test.go's
	// established convention).
	fdao := fleet.NewDaoWithClient(fs)
	fl, err := fdao.Get(ctx, spawn.Fleet.Id)
	if err != nil || fl == nil {
		t.Fatalf("loading the spawned fleet directly (id=%q): %v", spawn.Fleet.Id, err)
	}
	fl.AttachedTo = gateId
	fl.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateId, Radius: 300}}
	fl.StateDoc = fleet.EncodeKinematicState(fl.State)
	fl.ActiveActionId = ""
	if err := fdao.Save(ctx, *fl); err != nil {
		t.Fatalf("attaching the fleet to its gate directly: %v", err)
	}

	var jumped struct {
		Jump *struct {
			LaneId       string             `json:"laneId"`
			DestSystemId string             `json:"destSystemId"`
			ArriveMs     common.WorldMillis `json:"arriveMs"`
		} `json:"jump"`
	}
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+spawn.Fleet.Id+"/jump", token,
		map[string]any{"laneId": laneId}, &jumped)

	if w.Code >= 500 {
		t.Fatalf("fleet-movement \"The owning corporation's jump order succeeds at the HTTP surface\": "+
			"POST /v1/fleets/:fleetId/jump against the REAL production-constructed router (SetupRouter(), "+
			"no fake GraphSource) returned %d — never a 5xx caused by an unconfigured or missing server-side "+
			"dependency (design.md Decision 22, blocker 3: router.go never calls fleetSvc.WithGraph(...)). "+
			"Body: %s", w.Code, w.Body.String())
	}
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/:fleetId/jump status = %d, want 200 for a fleet attached to its lane's own "+
			"gate body with a corporation that owns it; body: %s", w.Code, w.Body.String())
	}
	if jumped.Jump == nil {
		t.Fatalf("expected the response to carry the committed jump (a non-nil \"jump\" field with an ETA), got "+
			"body with no jump: status=%d", w.Code)
	}
	if jumped.Jump.DestSystemId != destId {
		t.Errorf("jump.destSystemId = %q, want %q", jumped.Jump.DestSystemId, destId)
	}
	if jumped.Jump.ArriveMs <= 0 {
		t.Errorf("jump.arriveMs = %d, want a positive committed ETA", jumped.Jump.ArriveMs)
	}
}
