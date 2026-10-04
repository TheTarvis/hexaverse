package system

// RED-phase test for openspec change fix-burn-order-geometry-refusals task
// 1.7 (design.md Decision 9): over the tightest qualifying parent type, ring
// and star class combinations, a sweep of station phase and park phase on a
// fixed grid finds zero arrival and zero departure clearance refusals, and a
// ring-0 control finds some. Nothing is read from or written to a fixture;
// the grid, system ids and world times are all stated here. The test also
// asserts, through the criterion's own predicate, that each subject satisfies
// (d) and the control does not, which is what ties this sweep to the change.

import (
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
)

type sweepCombo struct {
	name   string
	id     string
	bt     galaxy.BodyType
	ring   int
	class  string
	refuse bool // control: must produce at least one clearance refusal
}

var sweepCombos = []sweepCombo{
	{"rocky ring 1 under F (tightest rocky pass)", "sys-sweep-rocky-r1-f", galaxy.BodyRocky, 1, "F", false},
	{"gas giant ring 2 under B (tightest gas pass)", "sys-sweep-gas-r2-b", galaxy.BodyGasGiant, 2, "B", false},
	{"ice ring 1 under K (tightest ice pass)", "sys-sweep-ice-r1-k", galaxy.BodyIce, 1, "K", false},
	{"control: rocky ring 0 under F", "sys-sweep-control-r0-f", galaxy.BodyRocky, 0, "F", true},
}

// Scenario: A home selected after this criterion yields no clearance refusal at its station
func TestStationShellSweep_Scenario_NoClearanceRefusalAtItsStation(t *testing.T) {
	t.Run("Scenario: A home selected after this criterion yields no clearance refusal at its station", func(t *testing.T) {
		phases := shellGridPhases()
		times := []common.WorldMillis{0, 7_777}
		const accel = 8.0
		for _, c := range sweepCombos {
			sk := singleBodySkeleton(c.bt, c.ring, c.class)
			clearance := space.StarClearanceRadius(StarSize(c.class))

			if got := StationShellClearsStar(shellTestGalaxySeed, c.id, sk); got == c.refuse {
				t.Errorf("%s: StationShellClearsStar = %v, want %v (the sweep's subject/control split must agree with criterion (d))", c.name, got, !c.refuse)
			}

			orbit := StationContinuousOrbit(shellTestGalaxySeed, c.id, sk)
			standoff := space.InsertionStandoff(space.Body{Size: StationSize})

			// Origins outside the clearance, on the star side of the station
			// (the worst case for arrival): sixteen directions at two radii.
			var origins []space.Vec3
			for _, r := range []float64{clearance + 2, clearance * 3} {
				for _, ph := range phases {
					cs, sn := space.CosSin(ph)
					origins = append(origins, space.Vec3{X: r * cs, Y: 0, Z: r * sn})
				}
			}
			departTo := space.Vec3{X: 150, Y: 5, Z: -90}
			if departTo.Length() <= clearance {
				t.Fatalf("fixture: departure destination must be outside the clearance")
			}

			arrivalRefusals, departureRefusals := 0, 0
			for i, pp := range phases {
				if i%2 != 0 {
					continue // parent phase on every other grid step; station and park phases on the full grid
				}
				for _, sp := range phases {
					bodies := shellBodies(sk, c.ring, orbit, pp, sp, orbit.Inclination)
					for _, at := range times {
						for _, from := range origins {
							if from.Length() <= clearance {
								t.Fatalf("fixture: origin %v inside clearance %v", from, clearance)
							}
							_, err := space.SolveBurn(bodies, from, space.Target{BodyId: "feat-station"}, at, accel, nil, clearance, space.SolveRounds)
							if errors.Is(err, space.ErrEndpointInsideClearance) {
								arrivalRefusals++
							}
						}
						for _, kp := range phases {
							park := space.Park{Kind: space.ParkOrbit, BodyId: "feat-station", Radius: standoff,
								PeriodMs: space.InsertionPeriod(standoff), Phase: kp, EpochMs: 0}
							from, err := park.Position(bodies, at)
							if err != nil {
								t.Fatalf("park position: %v", err)
							}
							_, err = space.SolveBurn(bodies, from, space.Target{Point: &departTo}, at, accel, nil, clearance, space.SolveRounds)
							if errors.Is(err, space.ErrEndpointInsideClearance) {
								departureRefusals++
							}
						}
					}
				}
			}
			if c.refuse {
				if arrivalRefusals == 0 {
					t.Errorf("%s: no arrival refusal over the grid — the control must refuse (else the sweep proves nothing)", c.name)
				}
				if departureRefusals == 0 {
					t.Errorf("%s: no departure refusal over the grid — the control must refuse", c.name)
				}
				continue
			}
			if arrivalRefusals != 0 {
				t.Errorf("%s: %d arrival clearance refusals, want 0", c.name, arrivalRefusals)
			}
			if departureRefusals != 0 {
				t.Errorf("%s: %d departure clearance refusals, want 0", c.name, departureRefusals)
			}
		}
	})
}
