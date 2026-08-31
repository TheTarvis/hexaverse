package corporations

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 3.9 — `corporations.rimCell`/`RimRing` deleted; replaced with a
// deterministic continuous spawn position derived from the home interior's
// `Extent` and the `GateRadiusFactor` (1.1), phase-seeded by account id
// (design.md Decision 16 [sic, Open Question 3]; corporation-spawn ADDED
// "One Starting Hull at a Deterministic Home Park" — "its position derives
// deterministically from that account id", never inside the home star's
// clearance).
//
// This file deliberately does NOT reference `rimCell`/`RimRing`/`SpawnParams
// .RimRing` — those are deleted by this task, and referencing them here
// would recreate the very dependency 3.9 removes.
//
// CONTRACT this file assumes (design.md Decision 16/Open Question 3 leaves
// the exact geometric target open — "the exact geometric target ... is left
// open by design.md; pick and document the default inline" — so this SDET
// pass documents the choice it tests against): a package-level, pure
// function `homeSpawnPosition(accountId string, extent float64) space.Vec3`
// mirroring rimCell's own exact style (a free function of (accountId,
// extent), account-seeded via the SAME `seedFromAccount` this package
// already uses for `pickUniform`) — radius `extent * system.GateRadiusFactor`
// (the named constant, never a duplicated literal 1.1), phase drawn from the
// account seed via `space.CosSin`. A developer converging on a materially
// different (but still deterministic, extent/GateRadiusFactor-anchored)
// shape should raise it as a dispute rather than silently diverge — the
// PROPERTIES this file tests (determinism, radius scaling, distinctness
// across systems of differing extent) do not depend on this exact formula
// and should survive a dispute's resolution either way.

import (
	"fmt"
	"testing"

	"hexaverse/space"
	"hexaverse/system"
)

func TestHomeSpawnPosition_Scenario_DeterministicPerAccount(t *testing.T) {
	const extent = 200.0
	a := homeSpawnPosition("account-heal-me", extent)
	b := homeSpawnPosition("account-heal-me", extent)
	if a != b {
		t.Fatalf("homeSpawnPosition is not deterministic per account: %+v vs %+v", a, b)
	}
}

func TestHomeSpawnPosition_Scenario_RadiusIsExtentTimesGateRadiusFactor(t *testing.T) {
	const extent = 150.0
	want := extent * system.GateRadiusFactor
	for i := 0; i < 50; i++ {
		pos := homeSpawnPosition(fmt.Sprintf("account-%d", i), extent)
		if got := pos.Length(); !closeEnough(got, want) {
			t.Fatalf("homeSpawnPosition(%q, %v).Length() = %v, want extent*GateRadiusFactor = %v",
				fmt.Sprintf("account-%d", i), extent, got, want)
		}
	}
}

// SDET-added boundary probe: two different accounts should not collapse to
// the identical phase in general — a constant-phase implementation would
// technically satisfy "deterministic per account" and "radius = extent *
// GateRadiusFactor" while failing the spirit of "phase-seeded by account
// id". Sweeps a generous sample and requires at least one distinct pair.
func TestHomeSpawnPosition_Scenario_DifferentAccountsCanLandAtDifferentPhases(t *testing.T) {
	const extent = 200.0
	first := homeSpawnPosition("account-0", extent)
	distinct := false
	for i := 1; i < 200; i++ {
		if homeSpawnPosition(fmt.Sprintf("account-%d", i), extent) != first {
			distinct = true
			break
		}
	}
	if !distinct {
		t.Fatal("200 different accounts all produced the identical spawn position — phase is not account-seeded")
	}
}

// Never at the star: at the smallest extent a real generated system can
// ever carry (system.BaseOrbitRadius — itself already pinned, by
// system.TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell,
// to exceed every configured star's clearance shell), the derived radius
// must still clear the largest star's clearance (design.md: "a radius
// inside the clearance shell is a site-selection bug, not a runtime
// rejection" — this test is what would catch that bug at the PURE
// function, before it ever reaches SeedFleet). Deliberately NOT tested
// against an arbitrarily tiny extent no real interior can produce — that
// would pin a property nothing guarantees.
func TestHomeSpawnPosition_Scenario_NeverInsideAnyConfiguredStarsClearanceAtMinimumRealisticExtent(t *testing.T) {
	maxClearance := 0.0
	for _, c := range []string{"O", "B", "A", "F", "G", "K", "M"} {
		if cl := space.StarClearanceRadius(system.StarSize(c)); cl > maxClearance {
			maxClearance = cl
		}
	}
	extent := system.BaseOrbitRadius
	pos := homeSpawnPosition("account-min-extent", extent)
	if pos.Length() <= maxClearance {
		t.Fatalf("homeSpawnPosition at the minimum realistic extent (%v, system.BaseOrbitRadius) landed at "+
			"radius %v, inside the largest configured star's clearance shell (%v)",
			extent, pos.Length(), maxClearance)
	}
}

func closeEnough(a, b float64) bool {
	const eps = 1e-6
	d := a - b
	if d < 0 {
		d = -d
	}
	return d <= eps
}
