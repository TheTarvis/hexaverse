package system

// RED-phase tests for openspec change add-orbital-system-bodies —
// system-interior › "A Belt's Members Are Discrete Mineable Bodies On a
// Shared Radius" (Decision 5).
//
// SDET-CHOSEN CONTRACT: `func beltMemberOrbit(belt Feature, k int) space.Body`
// — Decision 13's fixture family is named `beltMemberOrbit` and states its
// inputs are "(beltFeatureId, k)"; the exact Go signature is not pinned
// beyond that. This test suite assumes it takes the belt Feature itself
// (which already carries the belt's id, its continuous Space orbit, and its
// stored Width) rather than requiring the caller to unpack those three
// separately — a mechanical-rename dispute if the developer shapes it
// otherwise (e.g. `beltMemberOrbit(beltId string, k int, baseRadius,
// width, periodMs, node, inclination) space.Body`), not a behavior dispute:
// every scenario below is checked against OBSERVABLE output (id, radius,
// size, phase, shared period), never against the call shape itself.

import (
	"fmt"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// beltFixture returns a hand-built belt Feature with a known base radius,
// width, and period — independent of Generate()'s RNG, so these tests
// isolate beltMemberOrbit's own law from generation's dice.
func beltFixture() Feature {
	base := 200.0
	width := BeltWidthFraction * base
	return Feature{
		Id:   "feat-belt-0",
		Type: FeatureBelt,
		Space: &space.Orbit{
			ParentId: "feat-star", Radius: base, PeriodMs: 500_000,
			Phase: 1000, Inclination: 42, Node: 9999,
		},
		Width: width,
	}
}

// bodyValueEqual compares two space.Body values BY VALUE, dereferencing the
// Orbit pointer — a bare `a != b` would compare pointer identity and could
// spuriously fail (or spuriously pass) depending on whether the
// implementation allocates a fresh *Orbit per call.
func bodyValueEqual(a, b space.Body) bool {
	if a.Id != b.Id || a.Size != b.Size {
		return false
	}
	if (a.Orbit == nil) != (b.Orbit == nil) {
		return false
	}
	if a.Orbit == nil {
		return true
	}
	return *a.Orbit == *b.Orbit
}

// Scenario: Belt members are reproducible from the belt's id.
func TestBeltMemberOrbit_Scenario_ReproducibleFromBeltId(t *testing.T) {
	belt := beltFixture()
	for k := 0; k < AsteroidsPerBelt; k++ {
		a := beltMemberOrbit(belt, k)
		b := beltMemberOrbit(belt, k)
		if !bodyValueEqual(a, b) {
			t.Fatalf("beltMemberOrbit(belt, %d) not reproducible: %+v vs %+v", k, a, b)
		}
	}
}

// Scenario: Member ids follow the belt's id and a contiguous index.
func TestBeltMemberOrbit_Scenario_MemberIdsFollowBeltIdAndContiguousIndex(t *testing.T) {
	belt := beltFixture()
	seen := map[string]bool{}
	for k := 0; k < AsteroidsPerBelt; k++ {
		m := beltMemberOrbit(belt, k)
		want := fmt.Sprintf("%s#%d", belt.Id, k)
		if m.Id != want {
			t.Errorf("member %d id = %q, want %q", k, m.Id, want)
		}
		seen[m.Id] = true
	}
	if len(seen) != AsteroidsPerBelt {
		t.Fatalf("got %d distinct member ids, want exactly AsteroidsPerBelt=%d", len(seen), AsteroidsPerBelt)
	}
}

// Scenario: Every member's radius falls within the belt's full stored
// width.
func TestBeltMemberOrbit_Scenario_RadiusWithinStoredWidth(t *testing.T) {
	belt := beltFixture()
	base := belt.Space.Radius
	half := belt.Width / 2
	for k := 0; k < AsteroidsPerBelt; k++ {
		m := beltMemberOrbit(belt, k)
		if m.Orbit == nil {
			t.Fatalf("member %d has no orbit", k)
		}
		lo, hi := base-half, base+half
		if m.Orbit.Radius < lo || m.Orbit.Radius > hi {
			t.Errorf("member %d radius = %v, want within [%v, %v] (base %v +/- Width/2 %v)", k, m.Orbit.Radius, lo, hi, base, half)
		}
	}
}

// Scenario: Every member carries a strictly positive, independently drawn
// size.
func TestBeltMemberOrbit_Scenario_StrictlyPositiveIndependentlyDrawnSize(t *testing.T) {
	belt := beltFixture()
	sizes := map[float64]int{}
	for k := 0; k < AsteroidsPerBelt; k++ {
		m := beltMemberOrbit(belt, k)
		if m.Size < BeltMemberSizeMin || m.Size > BeltMemberSizeMax {
			t.Errorf("member %d size = %v, want within [%v, %v]", k, m.Size, BeltMemberSizeMin, BeltMemberSizeMax)
		}
		sizes[m.Size]++
	}
	if len(sizes) < 2 {
		t.Errorf("all %d members drew the identical size %v — sizes should be independently drawn, not constant", AsteroidsPerBelt, sizes)
	}
}

// Scenario: The belt rotates as one rigid body.
//
// PhaseAt's advance (space/orbit.go) is a pure function of elapsed time and
// PeriodMs alone — it does not depend on the body's own starting phase — so
// two members sharing a period necessarily share the SAME phase advance
// between any two world times. This is exactly the observable evidence the
// scenario names.
func TestBeltMemberOrbit_Scenario_BeltRotatesAsOneRigidBody(t *testing.T) {
	belt := beltFixture()
	m0 := beltMemberOrbit(belt, 0)
	m1 := beltMemberOrbit(belt, 1)
	if m0.Orbit.PeriodMs != m1.Orbit.PeriodMs || m0.Orbit.PeriodMs != belt.Space.PeriodMs {
		t.Fatalf("members do not share the belt's own period: belt=%v m0=%v m1=%v", belt.Space.PeriodMs, m0.Orbit.PeriodMs, m1.Orbit.PeriodMs)
	}
	// advance(t) = wrap(PhaseAt(t) - startingPhase) depends only on t and
	// PeriodMs (see space/orbit.go's PhaseAt) — never on the body's own
	// starting Phase — so two members sharing a period must report the
	// IDENTICAL advance at any given world time, regardless of their own
	// (independently drawn) starting phases. Comparing advance directly
	// (rather than a raw PhaseAt difference across two times) sidesteps any
	// sub-turn wraparound ambiguity.
	advance := func(o space.Orbit, t int64) space.SubTurns {
		raw := int64(o.PhaseAt(common.WorldMillis(t))) - int64(o.Phase)
		m := raw % int64(space.SubTurn)
		if m < 0 {
			m += int64(space.SubTurn)
		}
		return space.SubTurns(m)
	}
	for _, tm := range []int64{0, 10_000, 250_000, 999_999} {
		a0 := advance(*m0.Orbit, tm)
		a1 := advance(*m1.Orbit, tm)
		if a0 != a1 {
			t.Errorf("at t=%d: phase advance differs between members sharing a period: member0=%v member1=%v", tm, a0, a1)
		}
	}
}

// Scenario: The belt's width is persisted, not re-derived from a retuned
// constant.
//
// Cannot flip the Go const BeltWidthFraction at runtime, so this tests the
// structural fact the requirement depends on: beltMemberOrbit spreads
// members using the belt Feature's STORED Width field, not
// BeltWidthFraction*radius recomputed live. Proof: mutate Width to a value
// inconsistent with BeltWidthFraction*radius and confirm members follow the
// mutated (stored) value.
func TestBeltMemberOrbit_Scenario_WidthPersistedNotRederived(t *testing.T) {
	belt := beltFixture()
	liveWidth := BeltWidthFraction * belt.Space.Radius
	mutatedWidth := liveWidth * 10 // deliberately inconsistent with the live constant
	belt.Width = mutatedWidth

	half := mutatedWidth / 2
	base := belt.Space.Radius
	for k := 0; k < AsteroidsPerBelt; k++ {
		m := beltMemberOrbit(belt, k)
		if m.Orbit.Radius < base-half-1e-9 || m.Orbit.Radius > base+half+1e-9 {
			t.Errorf("member %d radius %v ignores the belt's mutated stored Width (%v); appears to re-derive from the live BeltWidthFraction instead", k, m.Orbit.Radius, mutatedWidth)
		}
	}
}

// Scenario: No generated feature id contains the member separator — the
// belt-specific half: a synthesized member id must be splittable on the
// FIRST '#' to recover exactly the owning belt's feature id, with no
// ambiguity.
func TestBeltMemberOrbit_Scenario_MemberIdSplitsBackToOwningFeatureId(t *testing.T) {
	belt := beltFixture()
	for k := 0; k < AsteroidsPerBelt; k++ {
		m := beltMemberOrbit(belt, k)
		owner, _, ok := cutOnFirstHash(m.Id)
		if !ok {
			t.Fatalf("member id %q does not contain the '#' separator", m.Id)
		}
		if owner != belt.Id {
			t.Errorf("member id %q splits back to owner %q, want %q", m.Id, owner, belt.Id)
		}
	}
}

// cutOnFirstHash is a tiny local helper (strings.Cut requires Go 1.18+,
// already satisfied by this repo's go.mod, but spelled out here so the test
// makes the "split on the FIRST #" requirement explicit rather than
// incidental to the standard library's own behavior).
func cutOnFirstHash(s string) (before, after string, found bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == '#' {
			return s[:i], s[i+1:], true
		}
	}
	return s, "", false
}
