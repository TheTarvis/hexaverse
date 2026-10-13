package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"testing"

	"cloud.google.com/go/firestore"
	"hexaverse/fleet"
	"hexaverse/space"
)

// Opt-in scenario setup, never used by spawnFuelCorp: stabilize the currently
// served safe origin only when a test specifically needs a hostless point park.
func arrangeStationaryPoint(t *testing.T, router http.Handler, sp fuelSpawn) {
	t.Helper()
	var read struct {
		Position space.Vec3 `json:"position"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/fleets/"+sp.fleetId, sp.token, nil, &read); w.Code != http.StatusOK {
		t.Fatalf("point fixture read: %d", w.Code)
	}
	_, client := firestoreClient(t)
	state := space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: read.Position}}
	if _, err := client.Collection("fleets").Doc(sp.fleetId).Update(context.Background(), []firestore.Update{
		{Path: "state", Value: fleet.EncodeKinematicState(state)}, {Path: "attachedTo", Value: ""}, {Path: "activeActionId", Value: ""},
	}); err != nil {
		t.Fatal(err)
	}
	got, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK || got.State.Park == nil || got.State.Park.Kind != space.ParkPoint || got.AttachedTo != "" || got.State.Park.Point != read.Position {
		t.Fatalf("explicit stationary fixture not established: status%d state%+v", code, got)
	}
}

// Assert the actual new spawn contract through served reads. No kinematic solve
// or fixture relocation is allowed here; the immediate service call is real.
func requireStationHostedSpawn(t *testing.T, router http.Handler, sp fuelSpawn) {
	t.Helper()
	got, raw, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK || got.State.Park == nil {
		t.Fatalf("spawn read missing park: %d", code)
	}
	park := got.State.Park
	if got.AttachedTo != sp.stationId || park.Kind != space.ParkOrbit || park.BodyId != sp.stationId || park.Radius <= 0 || park.PeriodMs != space.InsertionPeriod(park.Radius) {
		t.Fatalf("spawn must use attached free station insertion orbit: %+v", got)
	}
	var point space.Vec3
	b, _ := json.Marshal(raw["position"])
	if err := json.Unmarshal(b, &point); err != nil {
		t.Fatal(err)
	}
	var interior struct {
		Features []struct {
			Id   string  `json:"id"`
			Type string  `json:"type"`
			Size float64 `json:"size"`
		} `json:"features"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, &interior); w.Code != http.StatusOK {
		t.Fatalf("spawn interior read: %d", w.Code)
	}
	var starSize, stationSize float64
	for _, f := range interior.Features {
		if f.Type == "star" {
			starSize = f.Size
		}
		if f.Id == sp.stationId {
			stationSize = f.Size
		}
	}
	if starSize <= 0 || stationSize <= 0 || point.Length() <= space.StarClearanceRadius(starSize) || math.IsNaN(point.Length()) || math.IsInf(point.Length(), 0) {
		t.Fatal("spawn station/position missing, nonfinite or inside star clearance")
	}
	if park.Radius != space.InsertionStandoff(space.Body{Size: stationSize}) {
		t.Fatalf("spawn radius %v not station insertion standoff", park.Radius)
	}
	grant := fleet.DefaultFuelParams().StartingFuelTons
	if gotFuel := fleetCargoFuel(t, sp.fleetId); gotFuel != grant {
		t.Fatalf("spawn fuel=%v want configured grant%v", gotFuel, grant)
	}
	// A second read and healing request must neither charge upkeep nor mint fuel.
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", sp.token, map[string]any{"name": "Healing existing station spawn"}, nil); w.Code != http.StatusOK {
		t.Fatalf("spawn healing: %d", w.Code)
	}
	healed, _, status := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if status != http.StatusOK || healed.Id != got.Id || healed.AttachedTo != got.AttachedTo || healed.State.Park == nil || *healed.State.Park != *park || fleetCargoFuel(t, sp.fleetId) != grant {
		t.Fatal("healing changed identity/orbit/attachment or charged/reminted fuel")
	}
	if code, _ := refuel(t, router, sp.token, sp.fleetId, 1, "spawn-immediate-service"); code != http.StatusOK {
		t.Fatalf("fresh attached spawn cannot access refuel: %d", code)
	}
	if fleetCargoFuel(t, sp.fleetId) != grant+1 {
		t.Fatal("immediate refuel did not add exactly purchased fuel")
	}
}
