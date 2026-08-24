package stations

import (
	"fmt"
	"testing"

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
			if orb.Angle0 < 0 || orb.Angle0 >= 6*orb.Ring {
				t.Fatalf("%s: angle0 %d out of range for ring %d", sysID, orb.Angle0, orb.Ring)
			}
		}
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
