package corporations

import (
	"fmt"
	"testing"

	"hexaverse/galaxy"
)

// lineGalaxy builds an n-system path graph s0—s1—…—s(n-1), coords along x, with
// per-system control of the Mineable skeleton flag. A path makes graph distances
// trivially checkable (distance(si,sj) = |i-j|).
func lineGalaxy(n int, mineable func(i int) bool) *galaxy.GeneratedGalaxy {
	g := &galaxy.GeneratedGalaxy{}
	for i := 0; i < n; i++ {
		g.Systems = append(g.Systems, galaxy.System{
			Id:     fmt.Sprintf("s%d", i),
			Coords: galaxy.Coords{X: float64(i)},
			Skeleton: galaxy.Skeleton{
				Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 1, Mineable: mineable(i)}},
			},
		})
		if i > 0 {
			g.Lanes = append(g.Lanes, galaxy.Lane{
				Id: fmt.Sprintf("l%d", i), AId: fmt.Sprintf("s%d", i-1), BId: fmt.Sprintf("s%d", i),
			})
		}
	}
	return g
}

func allMineable(int) bool { return true }

// TestSiteSelection_RequiresMineable — every pick carries the bootstrap guarantee,
// even when only a minority of systems qualify. (Criterion a.)
// Spec: 0009/S3
func TestSiteSelection_RequiresMineable(t *testing.T) {
	// Only even-indexed systems are mineable.
	gal := lineGalaxy(8, func(i int) bool { return i%2 == 0 })
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 0 // isolate the mineable criterion

	for n := 0; n < 200; n++ {
		acct := fmt.Sprintf("acct-%d", n)
		site, err := selectSpawnSite(gal, nil, params, acct)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", acct, err)
		}
		if !hasMineableBody(site) {
			t.Fatalf("%s: picked non-mineable site %s", acct, site.Id)
		}
	}
}

// TestSiteSelection_KeepsDistanceFromClaimed — no pick lands within
// MinSpawnDistance lane-hops of a claimed (explored) system. (Criterion b.)
// Spec: 0009/S3
func TestSiteSelection_KeepsDistanceFromClaimed(t *testing.T) {
	gal := lineGalaxy(8, allMineable)
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 3
	claimed := map[string]bool{"s0": true} // another corp owns the s0 end

	for n := 0; n < 200; n++ {
		acct := fmt.Sprintf("acct-%d", n)
		site, err := selectSpawnSite(gal, claimed, params, acct)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", acct, err)
		}
		// distance from s0 in a path graph is the index; must be ≥ 3.
		var idx int
		if _, e := fmt.Sscanf(site.Id, "s%d", &idx); e != nil {
			t.Fatalf("bad id %s", site.Id)
		}
		if idx < params.MinSpawnDistance {
			t.Fatalf("%s: picked %s, only %d hops from claimed s0 (want ≥ %d)",
				acct, site.Id, idx, params.MinSpawnDistance)
		}
	}
}

// TestSiteSelection_Deterministic — the same account re-picks the same site, so a
// spawn that partially failed heals to the same home (idempotency).
func TestSiteSelection_Deterministic(t *testing.T) {
	gal := lineGalaxy(10, allMineable)
	params := DefaultSpawnParams()
	for _, acct := range []string{"a", "b", "carol", "acct-xyz"} {
		first, err := selectSpawnSite(gal, nil, params, acct)
		if err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 5; i++ {
			again, err := selectSpawnSite(gal, nil, params, acct)
			if err != nil {
				t.Fatal(err)
			}
			if again.Id != first.Id {
				t.Fatalf("%s: non-deterministic pick %s vs %s", acct, again.Id, first.Id)
			}
		}
	}
}

// TestSiteSelection_PeripheryWeighted — with a positive periphery weight, the
// frontier ends are chosen more often than the graph centre. (Criterion c.) A
// distribution check over many account seeds, not a single-pick assertion.
// Spec: 0009/S3
func TestSiteSelection_PeripheryWeighted(t *testing.T) {
	gal := lineGalaxy(7, allMineable) // centre ≈ s3
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 0
	params.PeripheryWeight = 3.0 // strong frontier bias

	counts := map[string]int{}
	const samples = 3000
	for n := 0; n < samples; n++ {
		site, err := selectSpawnSite(gal, nil, params, fmt.Sprintf("acct-%d", n))
		if err != nil {
			t.Fatal(err)
		}
		counts[site.Id]++
	}
	// The frontier ends (s0, s6) should each be picked more than the centre (s3).
	centre := counts["s3"]
	for _, edge := range []string{"s0", "s6"} {
		if counts[edge] <= centre {
			t.Fatalf("periphery bias failed: %s picked %d ≤ centre s3 %d (counts=%v)",
				edge, counts[edge], centre, counts)
		}
	}
}

// TestSiteSelection_NoQualifiers — when nothing satisfies the criteria the caller
// gets ErrNoSpawnSite rather than a bad pick or a panic.
func TestSiteSelection_NoQualifiers(t *testing.T) {
	// No system carries a mineable body.
	gal := lineGalaxy(5, func(int) bool { return false })
	if _, err := selectSpawnSite(gal, nil, DefaultSpawnParams(), "acct"); err != ErrNoSpawnSite {
		t.Fatalf("no mineable: err = %v, want ErrNoSpawnSite", err)
	}

	// Every system is within MinSpawnDistance of claimed space.
	gal = lineGalaxy(4, allMineable)
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 10
	claimed := map[string]bool{"s0": true}
	if _, err := selectSpawnSite(gal, claimed, params, "acct"); err != ErrNoSpawnSite {
		t.Fatalf("all too close: err = %v, want ErrNoSpawnSite", err)
	}
}
