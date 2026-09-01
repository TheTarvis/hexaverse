package main

// RED-phase (structural-guard) test for openspec change
// replace-observation-with-sightings, tasks.md 3.6 (specs/sighting-records/
// spec.md — "A Sighting Is Minted Only By a Resolving Sweep": "Reading the
// pile mints nothing", "Sustained passive proximity mints no sighting", "A
// burn resolution mints no sighting").
//
// This file deliberately does NOT import hexaverse/sightings — it queries
// the corporations/{cid}/sightings collection directly via the raw
// production Firestore client, so its own compile/run status never depends
// on that package's existence or internal shape. That keeps this file's red
// evidence honest: it compiles and runs even before backend/sightings
// exists, and it genuinely passes today because nothing in this change's
// chain so far (links 1-4, and this link's §1/§2 work) ever writes to that
// collection — see fleet/burn_and_jump_never_mint_sightings_test.go for the
// structural half covering the burn/jump resolvers by name, and the SDET
// handoff report for why this whole scenario family is a structural
// regression net rather than red-phase evidence of missing behavior:
// nothing can incorrectly auto-mint before §5 gives anything the ABILITY to
// mint at all.
//
// SCOPE HONESTLY NARROWED (see handoff report): "sustained passive
// proximity" is exercised here only as "several repeated reads of the
// corp's own fleet/pile surfaces mint nothing," WITHOUT constructing a
// second, foreign fleet in mutual passive range — system-interior's
// `contacts` array (the only read this change wires to a live disclosure
// evaluation) does not exist until §4, so there is today no read path that
// could even ATTEMPT a passive-proximity mint regardless of what is nearby.
// This test is a coarse stand-in now and should be strengthened once §4/§5
// land to actually position a foreign fleet in range.

import (
	"context"
	"net/http"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

func TestRouter_Scenario_ReadingAndResolvingNeverMintASighting(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	fs, client := firestoreClient(t)
	token, corpId := spawnCorp(t, router, "SDET No-Auto-Mint Corp")

	countFor := func(cid string) int {
		t.Helper()
		iter := client.Collection("corporations").Doc(cid).Collection("sightings").Documents(context.Background())
		defer iter.Stop()
		n := 0
		for {
			_, err := iter.Next()
			if err == iterator.Done {
				break
			}
			if err != nil {
				t.Fatalf("counting corporations/%s/sightings: %v", cid, err)
			}
			n++
		}
		return n
	}

	t.Run("Scenario: Reading the pile mints nothing", func(t *testing.T) {
		before := countFor(corpId)
		// GET /v1/sightings may 404 until tasks.md 3.4 wires the route — the
		// scenario under test here is "reading mints nothing", not "reading
		// succeeds" (router_sightings_read_test.go pins the wiring itself).
		for i := 0; i < 3; i++ {
			doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, nil)
		}
		after := countFor(corpId)
		if after != before {
			t.Errorf("sighting-records \"Reading the pile mints nothing\": corp's sighting count changed from %d "+
				"to %d across three reads of its own pile", before, after)
		}
	})

	t.Run("Scenario: Sustained passive proximity mints no sighting (narrowed — see file doc comment)", func(t *testing.T) {
		before := countFor(corpId)
		for i := 0; i < 3; i++ {
			doJSON(t, router, http.MethodGet, "/v1/fleets", token, nil, nil)
		}
		after := countFor(corpId)
		if after != before {
			t.Errorf("sighting-records \"Sustained passive proximity mints no sighting\": corp's sighting count "+
				"changed from %d to %d across repeated reads", before, after)
		}
	})

	t.Run("Scenario: A burn resolution mints no sighting — the lane-transit half, via a real resolved jump", func(t *testing.T) {
		// POST /v1/corporations is idempotent per account (re-calling it on an
		// already-spawned account heals/returns the same living corp) — used
		// here purely to recover the SpawnResult shape (fleet/homeSystem ids),
		// which GET /v1/corporations/me does not carry (it returns the bare
		// Corporation only).
		var me struct {
			Fleet struct {
				Id string `json:"id"`
			} `json:"fleet"`
			HomeSystem struct {
				Id string `json:"id"`
			} `json:"homeSystem"`
		}
		if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
			map[string]any{"name": "SDET No-Auto-Mint Corp"}, &me); w.Code != http.StatusOK {
			t.Fatalf("POST /v1/corporations (idempotent re-call): status = %d, body = %s", w.Code, w.Body.String())
		}
		fleetId, homeId := me.Fleet.Id, me.HomeSystem.Id
		if fleetId == "" || homeId == "" {
			t.Fatalf("POST /v1/corporations (idempotent re-call) missing fleet/homeSystem ids: %+v", me)
		}

		ctx := context.Background()
		gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), common.WorldClock())
		lanes, err := gsvc.LanesOf(ctx, homeId)
		if err != nil || len(lanes) == 0 {
			t.Fatalf("test-environment issue, not the scenario under test: LanesOf(home)=%v err=%v", lanes, err)
		}
		destId, laneId := lanes[0].OtherSystemId, lanes[0].LaneId
		gateId := "gate-" + destId

		fdao := fleet.NewDaoWithClient(fs)
		fl, err := fdao.Get(ctx, fleetId)
		if err != nil || fl == nil {
			t.Fatalf("loading the spawned fleet directly: %v", err)
		}
		fl.AttachedTo = gateId
		fl.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateId, Radius: 300}}
		fl.StateDoc = fleet.EncodeKinematicState(fl.State)
		fl.ActiveActionId = ""
		if err := fdao.Save(ctx, *fl); err != nil {
			t.Fatalf("attaching the fleet to its gate directly: %v", err)
		}

		before := countFor(corpId)

		var jumped struct {
			Jump *struct {
				ArriveMs common.WorldMillis `json:"arriveMs"`
			} `json:"jump"`
		}
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/jump", token,
			map[string]any{"laneId": laneId}, &jumped)
		if w.Code != http.StatusOK || jumped.Jump == nil {
			t.Skipf("test-environment issue, not the scenario under test: jump commit did not succeed "+
				"(status=%d body=%s) — covered independently by router_jump_wiring_test.go", w.Code, w.Body.String())
		}

		// Time-skip the arrival exactly as traversability_e2e_test.go and
		// router_jump_wiring_test.go already establish as this repo's
		// convention for settling a due action deterministically without a
		// real-time wait.
		fl2, err := fdao.Get(ctx, fleetId)
		if err != nil || fl2 == nil || fl2.Jump == nil || fl2.ActiveActionId == "" {
			t.Fatalf("re-loading the fleet mid-jump: fl=%+v err=%v", fl2, err)
		}
		pastEta := common.WorldClock().Now() - 1
		if _, err := client.Collection("actions").Doc(fl2.ActiveActionId).Update(ctx, []firestore.Update{
			{Path: "eta", Value: int64(pastEta)},
		}); err != nil {
			t.Fatalf("time-skipping the wrapping action's eta: %v", err)
		}
		fl2.Jump.ArriveMs = pastEta
		if err := fdao.Save(ctx, *fl2); err != nil {
			t.Fatalf("time-skipping the jump's ArriveMs: %v", err)
		}

		// Settling the arrival opportunistically on read is the "resolution"
		// this scenario means.
		if w := doJSON(t, router, http.MethodGet, "/v1/fleets/"+fleetId, token, nil, nil); w.Code != http.StatusOK {
			t.Fatalf("GET /v1/fleets/%s (settling the due jump arrival): status = %d, body = %s",
				fleetId, w.Code, w.Body.String())
		}

		after := countFor(corpId)
		if after != before {
			t.Errorf("sighting-records \"A burn resolution mints no sighting\" (lane-transit half): corp's "+
				"sighting count changed from %d to %d across a real jump-arrival resolution", before, after)
		}
	})
}
