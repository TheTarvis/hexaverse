package system

// RED-phase tests for openspec change fix-burn-order-geometry-refusals —
// corporation-spawn, "Home Site Selection" criterion (d): a home's station
// shell must clear the star. Tasks 1.1 and 1.2.
//
// The pass/fail table below is typed out by hand from the delta's scenario
// "The criterion's outcome is fixed for every parent type, ring and star
// class". It is never produced by calling the predicate, so a retune that
// moves any cell fails here (task 1.1).
//
// Pinned identifiers (impl-contract section 2.1): StationShellClearsStar,
// stationShellBound, shellClears.

import (
	"math"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
)

const shellTestGalaxySeed int64 = 424242

// shellStarClasses are the seven classes of the delta's table, plus the
// unknown class, which takes the G row ("also the unknown-class default").
var shellStarClasses = []string{"M", "K", "G", "F", "A", "B", "O"}

// shellTableRow: for one parent family and ring, the classes (by letter)
// that PASS criterion (d). Written by hand from the scenario text.
type shellTableRow struct {
	family string
	types  []galaxy.BodyType
	ring   int
	passes string
}

var rockyTypes = []galaxy.BodyType{galaxy.BodyRocky, galaxy.BodyMoltenz, galaxy.BodyOceanic, galaxy.BodyBarrenz}

var shellTable = []shellTableRow{
	// rocky parent (molten, oceanic and barren take this row)
	{"rocky", rockyTypes, 0, ""},
	{"rocky", rockyTypes, 1, "MKGF"},
	{"rocky", rockyTypes, 2, "MKGFABO"},
	{"rocky", rockyTypes, 3, "MKGFABO"},
	{"rocky", rockyTypes, 4, "MKGFABO"}, // SDET-added: "every ring above 3 passes"
	{"rocky", rockyTypes, 9, "MKGFABO"}, // SDET-added
	// ice parent
	{"ice", []galaxy.BodyType{galaxy.BodyIce}, 0, ""},
	{"ice", []galaxy.BodyType{galaxy.BodyIce}, 1, "MK"},
	{"ice", []galaxy.BodyType{galaxy.BodyIce}, 2, "MKGFABO"},
	{"ice", []galaxy.BodyType{galaxy.BodyIce}, 3, "MKGFABO"},
	{"ice", []galaxy.BodyType{galaxy.BodyIce}, 4, "MKGFABO"},
	{"ice", []galaxy.BodyType{galaxy.BodyIce}, 9, "MKGFABO"},
	// gas giant parent
	{"gas giant", []galaxy.BodyType{galaxy.BodyGasGiant}, 0, ""},
	{"gas giant", []galaxy.BodyType{galaxy.BodyGasGiant}, 1, ""},
	{"gas giant", []galaxy.BodyType{galaxy.BodyGasGiant}, 2, "MKGFAB"},
	{"gas giant", []galaxy.BodyType{galaxy.BodyGasGiant}, 3, "MKGFABO"},
	{"gas giant", []galaxy.BodyType{galaxy.BodyGasGiant}, 4, "MKGFABO"},
	{"gas giant", []galaxy.BodyType{galaxy.BodyGasGiant}, 9, "MKGFABO"},
}

// singleBodySkeleton: one body, so the station's derived parent index is 0
// whatever the seed (a one-element modulus).
func singleBodySkeleton(t galaxy.BodyType, ring int, class string) galaxy.Skeleton {
	return galaxy.Skeleton{StarClass: class, Bodies: []galaxy.Body{{Type: t, Ring: ring, Mineable: true}}}
}

// Scenario: The criterion's outcome is fixed for every parent type, ring and star class
func TestStationShellClearsStar_Scenario_OutcomeFixedForEveryTypeRingAndClass(t *testing.T) {
	t.Run("Scenario: The criterion's outcome is fixed for every parent type, ring and star class", func(t *testing.T) {
		for _, row := range shellTable {
			for _, bt := range row.types {
				for _, class := range shellStarClasses {
					want := strings.Contains(row.passes, class)
					sk := singleBodySkeleton(bt, row.ring, class)
					if got := StationShellClearsStar(shellTestGalaxySeed, "sys-shell-table", sk); got != want {
						t.Errorf("%s parent (%s) ring %d star class %s: StationShellClearsStar = %v, want %v",
							row.family, bt, row.ring, class, got, want)
					}
				}
				// The unknown class takes the G row (the default star size is G's). SDET-added: empty class too.
				for _, class := range []string{"", "Z"} {
					want := strings.Contains(row.passes, "G")
					sk := singleBodySkeleton(bt, row.ring, class)
					if got := StationShellClearsStar(shellTestGalaxySeed, "sys-shell-table", sk); got != want {
						t.Errorf("%s parent (%s) ring %d unknown star class %q: StationShellClearsStar = %v, want the G row's %v",
							row.family, bt, row.ring, class, got, want)
					}
				}
			}
		}
	})

	// SDET-added: the outcome does not depend on the galaxy seed or the system id
	// when the skeleton has a single body.
	t.Run("SDET-added: single-body outcome is seed- and id-independent", func(t *testing.T) {
		sk := singleBodySkeleton(galaxy.BodyRocky, 1, "G")
		for _, seed := range []int64{0, 1, -7, 9_999_999_999} {
			for _, id := range []string{"a", "sys-other", "séance-系"} {
				if !StationShellClearsStar(seed, id, sk) {
					t.Errorf("seed %d id %q: rocky ring 1 under G must pass", seed, id)
				}
			}
		}
	})
}

// Scenario: A bound exactly equal to the clearance radius is excluded and one just above it qualifies
func TestShellClears_Scenario_EqualityBoundary(t *testing.T) {
	t.Run("Scenario: A bound exactly equal to the clearance radius is excluded and one just above it qualifies", func(t *testing.T) {
		clearances := []float64{13.0, 15.0, 19.0, space.StarClearanceRadius(StarSize("G"))}
		for _, c := range clearances {
			if shellClears(c, c) {
				t.Errorf("shellClears(%v, %v) = true, want false: a bound equal to the clearance is excluded", c, c)
			}
			if !shellClears(c+1, c) {
				t.Errorf("shellClears(%v, %v) = false, want true: a bound above the clearance qualifies", c+1, c)
			}
			if shellClears(c-1, c) {
				t.Errorf("shellClears(%v, %v) = true, want false", c-1, c)
			}
			// SDET-added: one ulp either side of the boundary.
			if !shellClears(math.Nextafter(c, math.Inf(1)), c) {
				t.Errorf("shellClears(nextafter(%v), %v) = false, want true", c, c)
			}
			if shellClears(math.Nextafter(c, math.Inf(-1)), c) {
				t.Errorf("shellClears(prevafter(%v), %v) = true, want false", c, c)
			}
		}
	})
}

// SDET-added: the empty-skeleton fallback (star-parented station) must not
// panic, and a star-parented station at StationFallbackRadius clears every class.
func TestStationShellClearsStar_EmptySkeletonDoesNotPanic(t *testing.T) {
	for _, class := range shellStarClasses {
		sk := galaxy.Skeleton{StarClass: class}
		var got bool
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("class %s: StationShellClearsStar panicked on an empty skeleton: %v", class, r)
				}
			}()
			got = StationShellClearsStar(shellTestGalaxySeed, "sys-empty", sk)
		}()
		bound, clearance := stationShellBound(shellTestGalaxySeed, "sys-empty", sk)
		wantBound := float64(StationFallbackRadius - space.InsertionStandoff(space.Body{Size: StationSize}))
		if bound != wantBound {
			t.Errorf("class %s: empty-skeleton bound = %v, want %v (fallback radius less standoff)", class, bound, wantBound)
		}
		if got != (bound > clearance) {
			t.Errorf("class %s: StationShellClearsStar = %v disagrees with its own bound %v vs clearance %v", class, got, bound, clearance)
		}
	}
}

// shellBodies builds the map-backed body table for one single-body skeleton:
// the star at the origin, the station's parent in a star orbit at the
// ring's continuous radius, and the station on the derivation's own orbit.
func shellBodies(sk galaxy.Skeleton, ring int, orbit space.Orbit, parentPhase, stationPhase space.SubTurns, stationIncl space.SubTurns) fakeBodies {
	parentRadius := ContinuousRadius(ring)
	st := orbit
	st.Phase = stationPhase
	st.Inclination = stationIncl
	return fakeBodies{
		"feat-star": {Id: "feat-star", Size: StarSize(sk.StarClass)},
		orbit.ParentId: {Id: orbit.ParentId, Size: MaxFeatureSize(featureTypeForBody(sk.Bodies[0].Type)), Orbit: &space.Orbit{
			ParentId: "feat-star", Radius: parentRadius, PeriodMs: keplerPeriodMs(parentRadius), Phase: parentPhase,
		}},
		"feat-station": {Id: "feat-station", Size: StationSize, Orbit: &st},
	}
}

// shellGridPhases is a fixed grid of sub-turn phases (sixteen steps around the circle).
func shellGridPhases() []space.SubTurns {
	const n = 16
	out := make([]space.SubTurns, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, space.SubTurns(int64(space.SubTurn)*int64(i)/n))
	}
	return out
}

// Scenario: The criterion's outcome is fixed (task 1.2 — the bound is a lower
// bound on the real shell, and ring 0 really does reach the clearance)
func TestStationShellBound_Scenario_IsALowerBoundOnTheRealShell(t *testing.T) {
	t.Run("Scenario: The criterion's outcome is fixed for every parent type, ring and class (bound is a lower bound)", func(t *testing.T) {
		phases := shellGridPhases()
		times := []common.WorldMillis{0, 7_777, 123_456}
		inclinations := []space.SubTurns{0, space.SubTurn / 2, space.SubTurn / 4} // derived sides and a polar probe (SDET-added)
		for _, row := range shellTable {
			if row.ring > 4 {
				continue
			}
			bt := row.types[0]
			for _, class := range shellStarClasses {
				sk := singleBodySkeleton(bt, row.ring, class)
				id := "sys-shell-bound"
				bound, clearance := stationShellBound(shellTestGalaxySeed, id, sk)
				if want := space.StarClearanceRadius(StarSize(class)); clearance != want {
					t.Fatalf("%s ring %d class %s: clearance = %v, want %v", row.family, row.ring, class, clearance, want)
				}
				orbit := StationContinuousOrbit(shellTestGalaxySeed, id, sk)
				standoff := space.InsertionStandoff(space.Body{Size: StationSize})
				park := space.Park{Kind: space.ParkOrbit, BodyId: "feat-station", Radius: standoff, PeriodMs: space.InsertionPeriod(standoff)}
				minDist := math.Inf(1)
				for _, pp := range phases {
					for _, sp := range phases {
						for _, incl := range inclinations {
							bodies := shellBodies(sk, row.ring, orbit, pp, sp, incl)
							for _, kp := range phases {
								park.Phase = kp
								for _, at := range times {
									pos, err := park.Position(bodies, at)
									if err != nil {
										t.Fatalf("park position: %v", err)
									}
									d := pos.Length()
									if d < minDist {
										minDist = d
									}
									if d < bound-1e-6 {
										t.Fatalf("%s ring %d class %s: station-park position at distance %v is inside the claimed lower bound %v",
											row.family, row.ring, class, d, bound)
									}
								}
							}
						}
					}
				}
				if row.ring == 0 && minDist > clearance {
					t.Errorf("%s ring 0 class %s: no grid position reaches the clearance (closest %v, clearance %v) — a ring-0 row must have one",
						row.family, class, minDist, clearance)
				}
			}
		}
	})
}
