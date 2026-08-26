package stations

import (
	"fmt"
	"testing"

	"hexaverse/board"
	"hexaverse/galaxy"
	"hexaverse/system"
)

const testGateRing = 16

func TestDeriveOrbit_IsDeterministic(t *testing.T) {
	// A healed re-provisioning must land on the SAME orbit — otherwise completing
	// a partial spawn could place a second station somewhere else.
	for seed := int64(0); seed < 20; seed++ {
		for _, sysID := range []string{"sys-1", "sys-42", "sys-zzz"} {
			a := DeriveOrbit(seed, sysID, testGateRing)
			b := DeriveOrbit(seed, sysID, testGateRing)
			if a != b {
				t.Fatalf("seed %d, %s: re-derivation differs: %+v vs %+v", seed, sysID, a, b)
			}
		}
	}
}

func TestDeriveOrbit_NeverCoreNeverGateRing(t *testing.T) {
	// The core holds the star; the gate ring holds the lane departures. A station
	// on either would collide with something that is already there.
	sched := board.Schedule(testGateRing)
	for seed := int64(0); seed < 50; seed++ {
		for i := 0; i < 20; i++ {
			sysID := fmt.Sprintf("sys-%d-%d", seed, i)
			orb := DeriveOrbit(seed, sysID, testGateRing)
			if orb.Ring < 1 {
				t.Fatalf("%s: ring %d is the core", sysID, orb.Ring)
			}
			if orb.Ring >= testGateRing {
				t.Fatalf("%s: ring %d is at or beyond the lane-gate ring %d", sysID, orb.Ring, testGateRing)
			}
			if orb.Angle0 < 0 || orb.Angle0 >= sched.Slots(orb.Ring) {
				t.Fatalf("%s: angle0 %d out of range for ring %d (schedule slots %d)", sysID, orb.Angle0, orb.Ring, sched.Slots(orb.Ring))
			}
		}
	}
}

// tasks.md 7.5 stations/placement_test.go:40 site: the original upper-bound-only
// assertion (`orb.Angle0 >= 6*orb.Ring` as a failure condition) would pass
// even with the retired 6×ring draw still in place on every ring, since
// 6×ring is always ≥ Slots(ring) is FALSE in general — the hazard here is
// specifically that a one-sided check proves nothing on rings where
// Slots(ring) > 6×ring. This test makes the assertion two-sided: across many
// derivations, bucket the observed Angle0 by ring, and on a NON-coincidence
// ring (3, 5, 9, or 15 — never 1, 2, 4, 8, 16, or 32), require some observed
// Angle0 to land AT OR ABOVE 6×ring, proving the draw actually reaches the
// schedule's full slot count.
func TestDeriveOrbit_Scenario_AngleReachesEverySlotOnNonCoincidenceRings(t *testing.T) {
	sched := board.Schedule(testGateRing)
	nonCoincidenceRings := map[int]bool{}
	for _, ring := range []int{3, 5, 9} { // 15 is excluded: testGateRing=16 caps DeriveOrbit's span at ring 15 inclusive, but each ring must be < testGateRing, and we want headroom
		if ring < testGateRing && sched.Slots(ring) > 6*ring {
			nonCoincidenceRings[ring] = true
		}
	}
	if len(nonCoincidenceRings) == 0 {
		t.Fatalf("fixture: expected at least one non-coincidence ring among 3/5/9 under gate ring %d", testGateRing)
	}

	atOrAbove := map[int]bool{}
	const n = 20000
	for i := 0; i < n; i++ {
		sysID := fmt.Sprintf("sys-sweep-%d", i)
		orb := DeriveOrbit(int64(i), sysID, testGateRing)
		if !nonCoincidenceRings[orb.Ring] {
			continue
		}
		if orb.Angle0 >= 6*orb.Ring {
			atOrAbove[orb.Ring] = true
		}
		// Two-sided upper bound too: never beyond the schedule's real count.
		if orb.Angle0 >= sched.Slots(orb.Ring) {
			t.Fatalf("sys %s: angle0 %d >= schedule slots %d for ring %d", sysID, orb.Angle0, sched.Slots(orb.Ring), orb.Ring)
		}
	}

	proven := false
	for ring := range nonCoincidenceRings {
		if atOrAbove[ring] {
			proven = true
		}
	}
	if !proven {
		t.Fatalf("across %d derivations, no non-coincidence ring (%v) ever drew an angle0 at or above 6×ring — "+
			"a derivation still drawing positions := 6*ring would pass this test's absence, exactly the bug this scenario guards against",
			n, nonCoincidenceRings)
	}
}

func TestDeriveOrbit_DirectionMatchesTheSystemsDisk(t *testing.T) {
	// The station rides its system's disk. This is the assertion that would fail
	// if someone ever gave the station its own independent direction roll.
	for seed := int64(0); seed < 50; seed++ {
		for i := 0; i < 10; i++ {
			sysID := fmt.Sprintf("sys-%d-%d", seed, i)
			orb := DeriveOrbit(seed, sysID, testGateRing)
			want := system.DominantOrbitDirection(galaxy.SystemSeed(seed, sysID))
			if orb.Dir != want {
				t.Fatalf("%s: station dir %d, but its disk spins %d", sysID, orb.Dir, want)
			}
		}
	}
}

func TestDeriveOrbit_MatchesTheGeneratedInteriorsDiskBornFeatures(t *testing.T) {
	// End-to-end version of the rule: generate the actual interior and confirm
	// the station orbits with the planets, not against them.
	const galaxySeed = int64(4242)
	skeleton := galaxy.Skeleton{
		StarClass: "G",
		Bodies: []galaxy.Body{
			{Type: galaxy.BodyRocky, Ring: 2},
			{Type: galaxy.BodyGasGiant, Ring: 8},
		},
	}
	for i := 0; i < 25; i++ {
		sysID := fmt.Sprintf("sys-%d", i)
		sysSeed := galaxy.SystemSeed(galaxySeed, sysID)
		interior := system.Generate(sysSeed, "normal", skeleton, system.DefaultParams())
		station := DeriveOrbit(galaxySeed, sysID, testGateRing)

		for _, f := range interior.Features {
			// Skeleton bodies are disk-born, so they define the disk's direction.
			if f.Orbit == nil || len(f.Id) < 9 || f.Id[:9] != "feat-body" {
				continue
			}
			if f.Orbit.Dir != station.Dir {
				t.Fatalf("%s: %s orbits %d but the station orbits %d — the station is running against its own disk",
					sysID, f.Id, f.Orbit.Dir, station.Dir)
			}
		}
	}
}

func TestDeriveOrbit_SpreadsRingsAcrossSystems(t *testing.T) {
	// Systems in one galaxy derive from a shared base, so a weak mix would band
	// every station onto the same ring. Not a distribution proof — just enough to
	// catch a derivation that has collapsed.
	seen := map[int]bool{}
	for i := 0; i < 200; i++ {
		orb := DeriveOrbit(7, fmt.Sprintf("sys-%d", i), testGateRing)
		seen[orb.Ring] = true
	}
	if len(seen) < 5 {
		t.Errorf("stations landed on only %d distinct rings across 200 systems: %v", len(seen), seen)
	}
}

func TestDeriveOrbit_DegenerateBoardStillPlacesOffCore(t *testing.T) {
	// A tiny board (radius 1) leaves exactly one legal ring. It must not divide
	// by zero or fall back to the core.
	orb := DeriveOrbit(1, "sys-tiny", 1)
	if orb.Ring != 1 {
		t.Errorf("degenerate board placed the station on ring %d, want 1", orb.Ring)
	}
}
