package main

// RED-PHASE end-to-end test for openspec change `build-production-space-view`,
// capability `system-interior`, requirement *Lane-Gate Bodies Carry Their
// Body Id* (tasks.md 9.1b/9.1c), scenarios:
//
//   - "Every lane-gate body carries a non-empty, distinct id"
//   - "The served gate body id is the id a fleet attaches to"
//
// WHY THIS TEST EXISTS AT ALL, AND WHY IT IS AN E2E RATHER THAN A UNIT TEST.
// `interior_wire_lattice_removal_test.go` pins that the gate DTO carries an
// `id` key. Presence is worthless on its own: a handler that served
// `id: "x"` for every gate would satisfy it. The requirement is an
// IDENTITY claim — the served id is the string a burn order names and the
// string `fleet.AttachedTo` reports after that burn settles — and identity
// between two subsystems (the interior read's gate construction and the
// fleet resolver's attachment write) cannot be proven by either subsystem's
// own unit test with the other faked. So this drives the REAL
// production-composed router against the REAL emulators, exactly as
// lane_id_traversal_e2e_test.go does for the sibling `laneId` field.
//
// THE CLIENT COPY THIS CLOSES. The `"gate-" + destSystemId` convention is
// duplicated five times in the backend today. Before 9.1b, a client that
// wanted to burn to a gate had to reimplement it — unpinned by any fixture
// and invisible to every Go test. The whole point of serving `id` is that
// no consumer ever writes that concatenation again, so this test NEVER
// builds the expected id by concatenation: it takes the served string,
// feeds it back through the burn command, and demands the settled
// attachment equal it byte for byte. That is the only assertion shape that
// stays honest if the server's naming convention ever changes.
//
// RED TODAY because `system.LaneGate` has no `Id` field (9.1b unimplemented):
// the decode below yields "" and the first assertion fails naming the field.
// It compiles both before and after, since it decodes json keys rather than
// naming a Go identifier.

import (
	"net/http"
	"testing"
)

type gateBodyWire struct {
	Id           string  `json:"id"`
	DestSystemId string  `json:"destSystemId"`
	LaneId       string  `json:"laneId"`
	Size         float64 `json:"size"`
}

func TestInteriorGateBodyId_ServedIdIsTheIdAFleetAttachesTo(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	sp := spawnFuelCorp(t, router, "SDET Gate Body Id Corp")

	var home struct {
		LaneGates []gateBodyWire `json:"laneGates"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, &home); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", sp.homeId, w.Code, w.Body.String())
	}
	if len(home.LaneGates) == 0 {
		t.Skipf("home system %s has no lane gates — nothing to burn to", sp.homeId)
	}

	// The corporation was spawned seconds ago and has charted nothing, so
	// this same read doubles as the unfiltered-by-charted-knowledge case.
	//
	// Scenario: A fresh corporation with no charted lanes still receives the gate body id
	t.Run("Scenario: Every lane-gate body carries a non-empty, distinct id", func(t *testing.T) {
		seen := map[string]string{}
		for _, g := range home.LaneGates {
			if g.Id == "" {
				t.Fatalf("the gate toward %q serves an EMPTY id. Once `cell` is gone the id is the "+
					"only identity a client has for a gate — with it empty, a burn order cannot name "+
					"the gate at all without reimplementing the server's own naming convention. "+
					"Full gate: %+v", g.DestSystemId, g)
			}
			if prev, dup := seen[g.Id]; dup {
				t.Errorf("two lane gates share the id %q (toward %q and toward %q) — gate ids must be "+
					"distinct within a system or a burn command is ambiguous", g.Id, prev, g.DestSystemId)
			}
			seen[g.Id] = g.DestSystemId
		}
	})

	gate := home.LaneGates[0]

	t.Run("Scenario: A burn order naming the served gate body id targets that gate", func(t *testing.T) {
		if gate.Id == "" {
			t.Fatal("no served gate id to burn toward (see the previous subtest)")
		}

		// Fuel enough that affordability can never be the reason this leg
		// fails — the subject here is identity, not economy.
		setFleetFuel(t, sp.fleetId, 5_000_000)

		// Name the SERVED id, verbatim, as the burn target. No
		// concatenation, no prefix test, no second lookup — precisely the
		// client-side derivation 9.1b exists to delete.
		orderResp, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": gate.Id})
		if code != http.StatusOK {
			t.Fatalf("POST /v1/fleets/%s/orders {bodyId:%q} — the id the server ITSELF served for this "+
				"gate on the interior read — returned %d. A served body id the burn command will not "+
				"accept is not a body id (`system-interior`: *Lane-Gate Bodies Carry Their Body Id*)",
				sp.fleetId, gate.Id, code)
		}
		if orderResp.State.Burn == nil {
			t.Fatalf("the order to gate %q committed no burn: state = %+v", gate.Id, orderResp.State)
		}
	})

	t.Run("Scenario: The served gate body id is the id a fleet attaches to", func(t *testing.T) {
		if gate.Id == "" {
			t.Fatal("no served gate id to burn toward (see the previous subtest)")
		}

		// Settle the arrival through the REAL BurnResolver (time travel on
		// the stored window only — see forceBurnArrivalPast).
		forceBurnArrivalPast(t, sp.fleetId)
		typed, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
		if code != http.StatusOK {
			t.Fatalf("GET /v1/fleets/%s after the forced arrival: status = %d", sp.fleetId, code)
		}

		// ASSERT: byte equality, both directions of the identity claim.
		if typed.AttachedTo != gate.Id {
			t.Fatalf("after arriving at the gate the fleet reports attachedTo = %q, but the interior "+
				"read served that same gate's id as %q. These must be BYTE-EQUAL: the whole reason the "+
				"gate body carries an id is that a client can burn to it and then recognise where it "+
				"landed without knowing the server's naming convention. (`system-interior`: *Lane-Gate "+
				"Bodies Carry Their Body Id* > \"The served gate body id is the id a fleet attaches to\")",
				typed.AttachedTo, gate.Id)
		}
	})
}
