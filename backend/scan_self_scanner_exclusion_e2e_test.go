package main

// RED-phase path-level integration test for openspec change
// add-scan-and-sightings-surface, tasks.md 1.15
// (specs/focused-scan/spec.md's ADDED "A Sweep Never Files a Claim Against
// Its Own Scanner"):
//
//	GIVEN a fleet docked at a body with no other ship attached beneath it
//	WHEN it commits a focused scan against that body and the sweep resolves
//	THEN no sighting record names the scanning fleet
//	AND a single clean-sweep record is minted for that host
//
// plus the second case tasks.md 1.15 requires: with ONE OTHER ship also
// attached beneath the same host, exactly one record is minted, naming
// that ship and NOT the scanner, and no clean-sweep record accompanies it.
//
// THIS IS CURRENTLY GREEN-WRONG (design.md's own framing): `chainBeneath`
// walks attachments with no owner filter today, so a fleet masked beneath
// the very host it sweeps mints a sighting of ITSELF. Case A below is
// therefore expected to find the scanner's own targetId among the minted
// records' stored TargetId (read directly off the store, since `targetId`
// is never served on the wire — sighting-records "The target id is stored
// but never serialized to the client") — the honest way to observe this
// defect without inventing a wire field no scenario grants.
//
// EXPECTED RED TODAY: assertion failure (a wrongly-minted self-sighting
// found, or a clean-sweep record minted alongside a real one in case B),
// not a compile error — POST /v1/fleets/:fleetId/scan and GET /v1/sightings
// both already exist (link 5).

import (
	"context"
	"net/http"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/sightings"
	"hexaverse/space"
)

func TestScanSelfScannerExclusion_Scenario_NoSelfSightingAndSingleCleanSweep(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)
	sdao := sightings.NewDaoWithClient(fs)

	t.Run("scanner alone at the host mints no self-sighting, one clean sweep", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Self-Scanner-Alone Corp")
		bt := bodyTableFor(t, ctx, homeId)
		hostId := firstNonStarNonGateBody(t, bt)
		hostPos, err := space.Position(bt, hostId, common.WorldClock().Now())
		if err != nil {
			t.Fatalf("resolving host %q position: %v", hostId, err)
		}

		// Docked AT the host, exactly there: distance 0 from the scanner to
		// its own swept host guarantees WithinRange passes and Occluded's
		// zero-length-segment early return applies — no star-clearance
		// reasoning needed.
		docked := fleet.Fleet{
			Id: fleetId, CorporationId: corpId, SystemId: homeId, AttachedTo: hostId,
			State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: hostPos, Velocity: space.Vec3{}, EpochMs: 1}},
		}
		if err := fdao.Save(ctx, docked); err != nil {
			t.Fatalf("saving the docked scanner fixture: %v", err)
		}

		if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
			t.Fatalf("scan commit (docked fleet sweeping its own host): status = %d, body = %s", w.Code, w.Body.String())
		}
		f := readFleet(t, fdao, ctx, fleetId)
		timeSkipAction(t, client, f.ActiveScanId)
		settleScope(t, router, token, homeId)

		// Store-level check: no minted record's TargetId is the scanner's
		// own fleet id (the wire never serves TargetId at all, so this is
		// the only way to observe the defect this scenario names).
		stored, _, err := sdao.List(ctx, corpId, 100, "")
		if err != nil {
			t.Fatalf("reading the stored pile directly: %v", err)
		}
		for _, rec := range stored {
			if rec.HostId != hostId {
				continue
			}
			if rec.TargetId == fleetId {
				t.Errorf("focused-scan \"A Sweep Never Files a Claim Against Its Own Scanner\": a stored "+
					"sighting for host %q names the SCANNING FLEET %q as its target: %+v", hostId, fleetId, rec)
			}
		}

		// Wire-level check: exactly one clean-sweep record for this host,
		// and no target-naming one.
		var pile struct {
			Sightings []map[string]any `json:"sightings"`
		}
		if w := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, &pile); w.Code != http.StatusOK {
			t.Fatalf("GET /v1/sightings: status = %d, body = %s", w.Code, w.Body.String())
		}
		cleanCount, targetNamingCount := 0, 0
		for _, s := range pile.Sightings {
			if hid, _ := s["hostId"].(string); hid != hostId {
				continue
			}
			if clean, _ := s["cleanSweep"].(bool); clean {
				cleanCount++
			} else {
				targetNamingCount++
			}
		}
		if cleanCount != 1 {
			t.Errorf("expected exactly ONE clean-sweep record for host %q (the scanner is the only ship "+
				"masked there, and it must be excluded), got %d", hostId, cleanCount)
		}
		if targetNamingCount != 0 {
			t.Errorf("expected NO target-naming record for host %q, got %d", hostId, targetNamingCount)
		}
	})

	t.Run("scanner plus one other ship at the host mints exactly one record, naming the other ship", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Self-Scanner-Plus-One Corp")
		bt := bodyTableFor(t, ctx, homeId)
		hostId := firstNonStarNonGateBody(t, bt)
		hostPos, err := space.Position(bt, hostId, common.WorldClock().Now())
		if err != nil {
			t.Fatalf("resolving host %q position: %v", hostId, err)
		}

		docked := fleet.Fleet{
			Id: fleetId, CorporationId: corpId, SystemId: homeId, AttachedTo: hostId,
			State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: hostPos, Velocity: space.Vec3{}, EpochMs: 1}},
		}
		if err := fdao.Save(ctx, docked); err != nil {
			t.Fatalf("saving the docked scanner fixture: %v", err)
		}

		otherShipId := "other-ship-at-host-" + fleetId
		other := fleet.Fleet{
			Id: otherShipId, CorporationId: "corp-foreign-plus-one-" + fleetId, SystemId: homeId, AttachedTo: hostId,
			State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: hostPos, Velocity: space.Vec3{}, EpochMs: 1}},
		}
		if err := fdao.Save(ctx, other); err != nil {
			t.Fatalf("saving the other-ship fixture: %v", err)
		}

		if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
			t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
		}
		f := readFleet(t, fdao, ctx, fleetId)
		timeSkipAction(t, client, f.ActiveScanId)
		settleScope(t, router, token, homeId)

		stored, _, err := sdao.List(ctx, corpId, 100, "")
		if err != nil {
			t.Fatalf("reading the stored pile directly: %v", err)
		}
		var forHost []sightings.Sighting
		for _, rec := range stored {
			if rec.HostId == hostId {
				forHost = append(forHost, rec)
			}
		}
		if len(forHost) != 1 {
			t.Fatalf("expected exactly ONE stored record for host %q, got %d: %+v", hostId, len(forHost), forHost)
		}
		if forHost[0].CleanSweep {
			t.Errorf("the one record for host %q is a clean sweep, want it to name %q — a real ship is "+
				"masked there", hostId, otherShipId)
		}
		if forHost[0].TargetId != otherShipId {
			t.Errorf("the one record for host %q names target %q, want %q (the OTHER ship, not the scanner)",
				hostId, forHost[0].TargetId, otherShipId)
		}
		if forHost[0].TargetId == fleetId {
			t.Errorf("the one record for host %q names the SCANNING FLEET %q as its target", hostId, fleetId)
		}
	})
}
