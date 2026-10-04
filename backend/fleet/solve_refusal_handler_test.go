package fleet

// RED-phase tests for openspec change fix-burn-order-geometry-refusals,
// fleet-movement tasks 2.1, 2.2, 2.3, 2.5 and 2.6: burn solve refusals are
// served as reason-bearing 409/404 on orders and orders/preview, decided in a
// fixed order, and a foreign or unknown fleet still gets the bodyless 404.
//
// Every assertion reads the served `error` text (the pinned literals in
// solve_refusal_helpers_test.go), never the status alone. World time is the
// injected fakeClock; no test calls time.Now() or retries.

import (
	"bytes"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"
)

// Sweep-located instants (impl-contract 7.3, three-step procedure). Each was
// located at authoring time by stepping the injected clock against
// space.SolveBurn with the inputs solveOrder uses, then pinned here. Each test
// that uses one first asserts its arrangement directly against the solver and
// fails with "arrangement no longer holds" if a retune moved it.
const (
	// refusalInnerRadius: a synthetic body orbiting inside the clearance ring
	// (radius 19, size 2.0, period 600 000 ms, the orbitingFeature default).
	// Located for the destination refusal: stepping the clock over
	// [0, 600 000) ms in 10 000 ms steps, a fleet parked at (150,0,0) is
	// refused for its DESTINATION from 220 000 ms to 270 000 ms (the body is on
	// the far side of the star, so the standoff point on the fleet's side of it
	// falls inside the clearance). 240 000 ms is the middle of that run.
	refusalInnerRadius        = 19.0
	refusalDestinationInstant = common.WorldMillis(240_000)

	// feat-host: radius 60, size 2.0, period 73 500 ms (the Kepler period of
	// radius 60). The fleet is parked in a standoff orbit around it (phase 0,
	// epoch 0); the solve inputs are DerivedAccelCeiling and the fleet's
	// normalised orbital velocity. Located by stepping the clock over
	// [10 000, 60 000) ms in 1 000 ms steps and keeping instants whose outcome
	// is the same at every 50 ms step within +-200 ms.
	refusalHostRadius            = 60.0
	refusalHostSize              = 2.0
	refusalHostPeriodMs          = common.WorldMillis(73_500)
	refusalHostShortInstant      = common.WorldMillis(12_000) // ErrArcTooShort
	refusalHostLongEnoughInstant = common.WorldMillis(11_000) // no error, curve length 8.1
)

func hostFeatureWithPeriod() system.Feature {
	ft := orbitingFeature("feat-host", refusalHostRadius, refusalHostSize)
	ft.SpaceDoc = space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: refusalHostRadius, PeriodMs: refusalHostPeriodMs})
	return ft
}

func orbitingHostFleet(t *testing.T, bt *system.BodyTable) *Fleet {
	t.Helper()
	body, ok := bt.Body("feat-host")
	if !ok {
		t.Fatal("fixture: feat-host missing from the body table")
	}
	st := space.InsertionStandoff(body)
	return &Fleet{
		Id: "fleet_host", CorporationId: refusalOwnerCorp, SystemId: "sys-0",
		Cargo: map[string]float64{"fuel": 500},
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{
			Kind: space.ParkOrbit, BodyId: "feat-host", Radius: st, PeriodMs: space.InsertionPeriod(st), Phase: 0, EpochMs: 0,
		}},
	}
}

// Scenario: An order naming the star is refused by the same destination reason as any other clearance refusal
// Scenario: A point target at or inside the clearance is refused with the destination reason
func TestRefusal_Scenario_StarAndPointTargetsServeTheDestinationReason(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	f := parkedAtPoint("f1", refusalOwnerCorp, 150)
	clr := refusalClearance()
	if f.State.Park.Point.Length() <= clr {
		t.Fatalf("arrangement no longer holds: fleet must start outside the clearance")
	}

	cases := []struct {
		scenario string
		body     []byte
	}{
		{"Scenario: A point target at or inside the clearance is refused with the destination reason (inside)", pointOrder(clr-1, 0, 0)},
		{"Scenario: A point target at or inside the clearance is refused with the destination reason (exactly equal)", pointOrder(clr, 0, 0)},
		{"Scenario: An order naming the star is refused by the same destination reason as any other clearance refusal", bodyOrder("feat-star")},
	}
	for _, c := range cases {
		for _, route := range []struct{ name, path string }{{"commit", ordersPath("f1")}, {"preview", previewPath("f1")}} {
			t.Run(c.scenario+"/"+route.name, func(t *testing.T) {
				e := newRefusalEnv(t, 0, bt, f)
				status, body := e.post(e.router(refusalOwnerCorp), route.path, c.body)
				assertRefused(t, route.name, status, body, 409, reasonDestination)
				e.assertNothingChanged("f1")
			})
		}
	}
}

// SDET-added boundary probe: a point just outside the clearance is NOT a destination refusal.
func TestRefusal_SDETAdded_PointJustOutsideClearanceIsNotRefused(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	f := parkedAtPoint("f1", refusalOwnerCorp, 150)
	e := newRefusalEnv(t, 0, bt, f)
	status, body := e.post(e.router(refusalOwnerCorp), previewPath("f1"), pointOrder(refusalClearance()+0.001, 0, 0))
	if status != 200 {
		t.Fatalf("preview of a point 0.001 outside the clearance: status %d body %q, want 200 (not a destination refusal)", status, body)
	}
}

// Scenario: A body whose solved standoff point is inside the clearance is refused with the destination reason
// Scenario: A preview of the same order is refused with the same status and the same body
func TestRefusal_Scenario_BodyStandoffPointInsideClearance(t *testing.T) {
	inner := orbitingFeature("feat-inner", refusalInnerRadius, 2.0)
	bt := testBodyTable(t, "sys-0", refusalStarSize, inner)
	f := parkedAtPoint("f1", refusalOwnerCorp, 150)
	now := refusalDestinationInstant

	// Arrangement first (impl-contract 7.3 step 3): the real solver, at the
	// pinned instant, with the inputs solveOrder uses, refuses this order for
	// its destination while the origin is outside. No fleet sentinel is named.
	from, dd, accel, clr := solveInputsAt(t, bt, f, now)
	if !(from.Length() > clr) {
		t.Fatalf("arrangement no longer holds: origin %.3f is not outside the clearance %.3f", from.Length(), clr)
	}
	if _, err := space.SolveBurn(bt, from, space.Target{BodyId: "feat-inner"}, now, accel, dd, clr, space.SolveRounds); !isSpaceErr(err, space.ErrEndpointInsideClearance) {
		t.Fatalf("arrangement no longer holds: SolveBurn at %d ms = %v, want space.ErrEndpointInsideClearance", now, err)
	}

	t.Run("Scenario: A body whose solved standoff point is inside the clearance is refused with the destination reason", func(t *testing.T) {
		e := newRefusalEnv(t, now, bt, f)
		status, body := e.post(e.router(refusalOwnerCorp), ordersPath("f1"), bodyOrder("feat-inner"))
		assertRefused(t, "commit", status, body, 409, reasonDestination)
		e.assertNothingChanged("f1")
	})

	t.Run("Scenario: A preview of the same order is refused with the same status and the same body", func(t *testing.T) {
		e := newRefusalEnv(t, now, bt, f)
		cStatus, cBody := e.post(e.router(refusalOwnerCorp), ordersPath("f1"), bodyOrder("feat-inner"))
		pStatus, pBody := e.post(e.router(refusalOwnerCorp), previewPath("f1"), bodyOrder("feat-inner"))
		assertRefused(t, "commit", cStatus, cBody, 409, reasonDestination)
		assertRefused(t, "preview", pStatus, pBody, 409, reasonDestination)
		if cStatus != pStatus || !bytes.Equal(cBody, pBody) {
			t.Fatalf("preview (%d %q) is not byte-identical to commit (%d %q)", pStatus, pBody, cStatus, cBody)
		}
		e.assertNothingChanged("f1")
	})
}

// Scenario: A fleet whose own position is inside the clearance is refused with the origin reason
// Scenario: A fleet inside the clearance ordering a destination also inside it is refused with the origin reason
// Scenario: An origin inside the clearance outranks a destination or a short curve
func TestRefusal_Scenario_OriginInsideClearance(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	f := parkedAtPoint("f1", refusalOwnerCorp, 10)
	if f.State.Park.Point.Length() >= refusalClearance() {
		t.Fatalf("arrangement no longer holds: fleet must start inside the clearance")
	}
	clr := refusalClearance()

	cases := []struct {
		scenario string
		body     []byte
	}{
		{"Scenario: A fleet whose own position is inside the clearance is refused with the origin reason", pointOrder(150, 0, 0)},
		{"Scenario: A fleet inside the clearance ordering a destination also inside it is refused with the origin reason (star)", bodyOrder("feat-star")},
		{"Scenario: An origin inside the clearance outranks a destination or a short curve (destination inside)", pointOrder(clr-1, 0, 0)},
		{"Scenario: An origin inside the clearance outranks a destination or a short curve (short curve)", pointOrder(11, 0, 0)},
	}
	for _, c := range cases {
		for _, route := range []struct{ name, path string }{{"commit", ordersPath("f1")}, {"preview", previewPath("f1")}} {
			t.Run(c.scenario+"/"+route.name, func(t *testing.T) {
				e := newRefusalEnv(t, 0, bt, f)
				status, body := e.post(e.router(refusalOwnerCorp), route.path, c.body)
				assertRefused(t, route.name, status, body, 409, reasonOrigin)
				if reasonOf(t, body) == reasonDestination {
					t.Errorf("served the destination reason, want the origin reason")
				}
				e.assertNothingChanged("f1")
			})
		}
	}
}

// Scenario: An absent body while the fleet is inside the clearance is refused as absent
func TestRefusal_Scenario_AbsentBodyOutranksOriginInside(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	f := parkedAtPoint("f1", refusalOwnerCorp, 10)
	for _, route := range []struct{ name, path string }{{"commit", ordersPath("f1")}, {"preview", previewPath("f1")}} {
		t.Run("Scenario: An absent body while the fleet is inside the clearance is refused as absent/"+route.name, func(t *testing.T) {
			e := newRefusalEnv(t, 0, bt, f)
			status, body := e.post(e.router(refusalOwnerCorp), route.path, bodyOrder("feat-not-here"))
			assertRefused(t, route.name, status, body, 404, reasonAbsent)
			e.assertNothingChanged("f1")
		})
	}
}

// Scenario: An order whose solved curve is below the minimum toward the fleet's own host is refused with the minimum-arc reason
// Scenario: An order to the fleet's own host whose solved curve is long enough commits
func TestRefusal_Scenario_OwnHostMinimumArc(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize, hostFeatureWithPeriod())
	f := orbitingHostFleet(t, bt)

	t.Run("Scenario: An order whose solved curve is below the minimum toward the fleet's own host is refused with the minimum-arc reason", func(t *testing.T) {
		now := refusalHostShortInstant
		from, dd, accel, clr := solveInputsAt(t, bt, f, now)
		if !(from.Length() > clr) {
			t.Fatalf("arrangement no longer holds: origin inside the clearance")
		}
		if _, err := space.SolveBurn(bt, from, space.Target{BodyId: "feat-host"}, now, accel, dd, clr, space.SolveRounds); !isSpaceErr(err, space.ErrArcTooShort) {
			t.Fatalf("arrangement no longer holds: SolveBurn at %d ms = %v, want space.ErrArcTooShort", now, err)
		}
		e := newRefusalEnv(t, now, bt, f)
		cStatus, cBody := e.post(e.router(refusalOwnerCorp), ordersPath(f.Id), bodyOrder("feat-host"))
		pStatus, pBody := e.post(e.router(refusalOwnerCorp), previewPath(f.Id), bodyOrder("feat-host"))
		assertRefused(t, "commit", cStatus, cBody, 409, reasonMinArc)
		assertRefused(t, "preview", pStatus, pBody, 409, reasonMinArc)
		if !bytes.Equal(cBody, pBody) {
			t.Fatalf("preview body %q is not byte-identical to commit body %q", pBody, cBody)
		}
		if got := reasonOf(t, cBody); got == reasonOrigin || got == reasonDestination {
			t.Fatalf("minimum-arc refusal served a clearance reason %q", got)
		}
		e.assertNothingChanged(f.Id)
	})

	t.Run("Scenario: An order to the fleet's own host whose solved curve is long enough commits", func(t *testing.T) {
		now := refusalHostLongEnoughInstant
		from, dd, accel, clr := solveInputsAt(t, bt, f, now)
		if _, err := space.SolveBurn(bt, from, space.Target{BodyId: "feat-host"}, now, accel, dd, clr, space.SolveRounds); err != nil {
			t.Fatalf("arrangement no longer holds: SolveBurn at %d ms = %v, want no error", now, err)
		}
		e := newRefusalEnv(t, now, bt, f)
		status, body := e.post(e.router(refusalOwnerCorp), ordersPath(f.Id), bodyOrder("feat-host"))
		if status != 200 {
			t.Fatalf("order to the fleet's own host at %d ms: status %d body %q, want 200 (accepted, not an identity refusal)", now, status, body)
		}
		if e.fa.committed == nil || e.fa.committed.Type != burnType {
			t.Fatalf("the order was not committed as a burn: %+v", e.fa.committed)
		}
	})
}

// Scenario: A point closer than the minimum arc length is refused with the minimum-arc reason
func TestRefusal_Scenario_ShortPointMinimumArc(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	f := parkedAtPoint("f1", refusalOwnerCorp, 150)
	for _, route := range []struct{ name, path string }{{"commit", ordersPath("f1")}, {"preview", previewPath("f1")}} {
		t.Run("Scenario: A point closer than the minimum arc length is refused with the minimum-arc reason/"+route.name, func(t *testing.T) {
			e := newRefusalEnv(t, 0, bt, f)
			// One unit away: closer than space.MinArcLength (2.0).
			status, body := e.post(e.router(refusalOwnerCorp), route.path, pointOrder(151, 0, 0))
			assertRefused(t, route.name, status, body, 409, reasonMinArc)
			e.assertNothingChanged("f1")
		})
	}
}

// Scenario: A commit naming an absent body id is refused with a reason
// Scenario: A preview naming an absent body id is refused with the same reason
func TestRefusal_Scenario_AbsentBodyServesAReasonOnCommitAndPreview(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	f := parkedAtPoint("f1", refusalOwnerCorp, 150)
	var first []byte
	for _, absent := range []string{"feat-missing-a", "feat-missing-b"} {
		e := newRefusalEnv(t, 0, bt, f)
		cStatus, cBody := e.post(e.router(refusalOwnerCorp), ordersPath("f1"), bodyOrder(absent))
		pStatus, pBody := e.post(e.router(refusalOwnerCorp), previewPath("f1"), bodyOrder(absent))
		t.Run("Scenario: A commit naming an absent body id is refused with a reason/"+absent, func(t *testing.T) {
			assertRefused(t, "commit", cStatus, cBody, 404, reasonAbsent)
			if len(cBody) == 0 {
				t.Fatalf("the absent-body 404 must carry a body, unlike the bodyless unknown-fleet 404")
			}
			e.assertNothingChanged("f1") // no burn stored, no action created
		})
		t.Run("Scenario: A preview naming an absent body id is refused with the same reason/"+absent, func(t *testing.T) {
			assertRefused(t, "preview", pStatus, pBody, 404, reasonAbsent)
			if !bytes.Equal(cBody, pBody) {
				t.Fatalf("preview body %q is not byte-identical to commit body %q", pBody, cBody)
			}
		})
		if first == nil {
			first = cBody
		} else if !bytes.Equal(first, cBody) {
			t.Fatalf("the absent-body reason differs between two absent ids: %q vs %q", first, cBody)
		}
	}
}

// Scenario: An unknown or foreign fleet still answers a bodyless 404
func TestRefusal_Scenario_UnknownOrForeignFleetStillBodyless404(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	const owner = "corp-foreign-owner"
	inward := space.Vec3{X: -5}
	fleets := []*Fleet{
		driftingAt("f-origin", owner, space.Vec3{X: 10}, inward),                   // origin-inside refusal
		driftingAt("f-dest", owner, space.Vec3{X: refusalClearance() + 1}, inward), // destination-inside refusal (lead point inside)
		parkedAtPoint("f-minarc", owner, 150),                                      // minimum-arc refusal
		parkedAtPoint("f-absent", owner, 150),                                      // absent-body refusal
	}
	type req struct {
		fleetId, path string
		body          []byte
		wantStatus    int
		wantReason    string
	}
	reqs := []req{
		{"f-origin", ordersPath("f-origin"), pointOrder(150, 0, 0), 409, reasonOrigin},
		{"f-origin", previewPath("f-origin"), pointOrder(150, 0, 0), 409, reasonOrigin},
		{"f-origin", stopPath("f-origin"), nil, 409, reasonOrigin},
		{"f-dest", ordersPath("f-dest"), pointOrder(refusalClearance()-1, 0, 0), 409, reasonDestination},
		{"f-dest", previewPath("f-dest"), pointOrder(refusalClearance()-1, 0, 0), 409, reasonDestination},
		{"f-dest", stopPath("f-dest"), nil, 409, reasonDestination},
		{"f-minarc", ordersPath("f-minarc"), pointOrder(151, 0, 0), 409, reasonMinArc},
		{"f-minarc", previewPath("f-minarc"), pointOrder(151, 0, 0), 409, reasonMinArc},
		{"f-absent", ordersPath("f-absent"), bodyOrder("feat-nope"), 404, reasonAbsent},
		{"f-absent", previewPath("f-absent"), bodyOrder("feat-nope"), 404, reasonAbsent},
	}

	// Arrangement: the owner is served each reason (so a bodyless 404 to anyone
	// else is the seam's doing, not an artefact of an unarrangeable fleet).
	t.Run("arrangement: the owner is served each refusal", func(t *testing.T) {
		e := newRefusalEnv(t, 0, bt, fleets...)
		for _, r := range reqs {
			status, body := e.post(e.router(owner), r.path, r.body)
			assertRefused(t, "owner "+r.path, status, body, r.wantStatus, r.wantReason)
		}
	})

	t.Run("Scenario: An unknown or foreign fleet still answers a bodyless 404", func(t *testing.T) {
		e := newRefusalEnv(t, 0, bt, fleets...)
		for _, requester := range []struct{ name, corp string }{{"foreign requester", "corp-other"}, {"requester with no corporation", ""}} {
			rt := e.router(requester.corp)
			for _, r := range reqs {
				status, body := e.post(rt, r.path, r.body)
				ghostPath := replaceFleetId(r.path, r.fleetId, "f-ghost")
				gStatus, gBody := e.post(rt, ghostPath, r.body)
				if status != 404 || len(body) != 0 {
					t.Errorf("%s %s: status %d body %q, want a bodyless 404", requester.name, r.path, status, body)
				}
				if gStatus != 404 || len(gBody) != 0 {
					t.Errorf("%s nonexistent fleet %s: status %d body %q, want a bodyless 404", requester.name, ghostPath, gStatus, gBody)
				}
				if status != gStatus || !bytes.Equal(body, gBody) {
					t.Errorf("%s %s: response (%d %q) is not byte-identical to the nonexistent fleet's (%d %q)", requester.name, r.path, status, body, gStatus, gBody)
				}
			}
		}
		for _, f := range fleets {
			e.assertNothingChanged(f.Id)
		}
	})
}

func replaceFleetId(path, from, to string) string {
	return string(bytes.Replace([]byte(path), []byte("/fleets/"+from), []byte("/fleets/"+to), 1))
}
