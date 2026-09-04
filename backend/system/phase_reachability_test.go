package system

// RED-phase test for openspec change delete-the-lattice, task 2.11 — the
// replacement coverage for the retired ring-slot scenario "Placement reaches
// every slot on a ring whose slot count exceeds six times its ring index"
// (system-interior's REMOVED "Lazy, Deterministic Interior Generation").
// The surviving requirement is system-interior's ADDED "Interior Generation
// Is Lazy and Deterministic" › "Generated phases span the whole turn":
//
//   (a) collected phases occupy every quadrant of [0, SubTurn)
//   (b) the gcd of the PAIRWISE DIFFERENCES of the collected phases is 1
//
// Both legs are load-bearing. Leg (a) alone is only four buckets over a
// million values — a generator drawing 16 evenly-spaced phases around the
// whole circle passes it while leaving 99.999% of phases unreachable, which
// is the continuous restatement of the very defect the retired
// every-slot-is-reached scenario existed to catch. Leg (b) must be computed
// over pairwise differences, not raw phase values: the gcd of the raw
// values is fooled by a shifted coarse sub-lattice (a set containing the
// value 1 has raw gcd 1 regardless of how coarse the underlying sub-lattice
// is), while the gcd of pairwise differences is invariant to any additive
// shift and correctly reports the sub-lattice's true spacing.
//
// This test is *not* expected to fail against today's generator (or the
// post-deletion one) — the underlying continuous phase draw
// (system/continuous.go's wrapSubTurnFraction(r2.Float64())) already spans
// the whole turn; nothing here is new production behaviour. Its
// red-for-the-right-reason proof is therefore not "run against production
// and watch it fail" but "run against a fake, sub-lattice-confined
// generator and watch it fail there" — done in a scratch copy per the
// coverage report for this change, not committed here. See
// docs/plans/continous_space/handoffs/link9-red-coverage.md.

import (
	"testing"

	"hexaverse/galaxy"
	"hexaverse/space"
)

// phaseReachabilitySkeleton is deliberately rich (four bodies spanning a
// wide ring range, including a gas giant so moons are generated too) so one
// generation pass produces many star-parented and body-parented continuous
// phases, not just one or two.
var phaseReachabilitySkeleton = galaxy.Skeleton{
	StarClass: "K",
	Bodies: []galaxy.Body{
		{Type: galaxy.BodyMoltenz, Ring: 0}, {Type: galaxy.BodyRocky, Ring: 3},
		{Type: galaxy.BodyGasGiant, Ring: 7}, {Type: galaxy.BodyIce, Ring: 11},
	},
}

var phaseReachabilityRegions = []string{"star_rich", "normal", "dead", "barrier"}

// collectGeneratedPhases generates `count` interiors, crossing every region
// character and a run of seeds starting at seedBase, and collects every
// generated feature's continuous phase (space.Orbit.Phase). The star is
// skipped — it carries no continuous orbit at all.
func collectGeneratedPhases(seedBase int64, count int) []space.SubTurns {
	params := DefaultParams()
	var phases []space.SubTurns
	seed := seedBase
	for i := 0; i < count; i++ {
		region := phaseReachabilityRegions[i%len(phaseReachabilityRegions)]
		gen := Generate(seed, region, phaseReachabilitySkeleton, params)
		seed++
		for _, f := range gen.Features {
			if f.Space == nil {
				continue
			}
			phases = append(phases, f.Space.Phase)
		}
	}
	return phases
}

// gcdInt64 is the standard Euclidean algorithm, operating on the absolute
// values of its inputs (a sub-turn difference is a signed quantity but the
// gcd of a difference set is conventionally reported as non-negative).
func gcdInt64(a, b int64) int64 {
	if a < 0 {
		a = -a
	}
	if b < 0 {
		b = -b
	}
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

// pairwiseDifferenceGCD computes the gcd of every pairwise difference among
// phases: gcd({phases[i] - phases[j] : i != j}). Anchoring at a fixed index
// k0 and folding gcd over {phases[i] - phases[k0]} is an O(n) equivalent of
// the literal O(n^2) pairwise form, not a weaker computation — for any i, j:
// phases[i] - phases[j] = (phases[i] - phases[k0]) - (phases[j] - phases[k0]),
// a linear combination (with coefficients +1/-1) of anchor-differences, and
// gcd is invariant under exactly this kind of integer linear combination.
// This function anchors at several distinct starting indices (not only
// index 0) and folds the gcd of all of them together, so a pathological
// choice of a single anchor — e.g. one that happens to coincide with a
// duplicate value, or with the one value nearest a sub-lattice node — cannot
// under-report the true spacing.
func pairwiseDifferenceGCD(phases []space.SubTurns) int64 {
	if len(phases) < 2 {
		return 0
	}
	var g int64
	anchors := len(phases)
	if anchors > 8 {
		anchors = 8
	}
	for a := 0; a < anchors; a++ {
		anchor := int64(phases[a])
		for _, p := range phases {
			g = gcdInt64(g, int64(p)-anchor)
		}
	}
	return g
}

// quadrantsReached reports which of the four quadrants of [0, SubTurn) at
// least one collected phase falls into.
func quadrantsReached(phases []space.SubTurns) [4]bool {
	quadrant := int64(space.SubTurn) / 4
	var seen [4]bool
	for _, p := range phases {
		q := int64(p) / quadrant
		if q >= 0 && q < 4 {
			seen[q] = true
		}
	}
	return seen
}

// Scenario: Generated phases span the whole turn.
func TestInteriorGeneration_Scenario_GeneratedPhasesSpanTheWholeTurn(t *testing.T) {
	phases := collectGeneratedPhases(90001, 500)
	if len(phases) < 100 {
		t.Fatalf("fixture: only %d phases collected from 500 generation passes — the swept skeleton/region set must produce a larger sample for this scenario to be meaningful", len(phases))
	}

	// Leg (a): every quadrant of [0, SubTurn) is reached.
	seen := quadrantsReached(phases)
	for q, ok := range seen {
		if !ok {
			t.Errorf("leg (a): quadrant %d of [0, SubTurn=%d) is never reached by any of the %d collected phases", q, space.SubTurn, len(phases))
		}
	}

	// Leg (b): the gcd of the pairwise differences is 1 — the draw is not
	// confined to a coarse sub-lattice of the turn at any offset.
	g := pairwiseDifferenceGCD(phases)
	if g != 1 {
		t.Errorf("leg (b): gcd of pairwise differences of the %d collected phases = %d, want 1 (the draw is confined to a sub-lattice of spacing %d, at some offset)", len(phases), g, g)
	}
}
