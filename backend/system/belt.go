package system

// Belt member derivation (openspec add-orbital-system-bodies, design.md
// Decision 5). A belt stays exactly one persisted Feature; its
// AsteroidsPerBelt member bodies are derived, never persisted, and are
// synthesized only at BodyTable-build time (bodies.go), after the
// decode-omission cascade has run — so a dropped belt feature mints no
// members.

import (
	"fmt"

	"hexaverse/space"
)

// beltMemberSalt namespaces beltMemberOrbit's four independent draws (radius
// jitter, phase, inclination jitter, size) so each draws a distinct value
// from the same (beltId, k) pair rather than reusing one hash four times.
const (
	beltDrawRadius = 0
	beltDrawPhase  = 1
	beltDrawIncl   = 2
	beltDrawSize   = 3
)

// beltMemberUnit derives a [0,1) fraction for belt member k's `draw`-th
// independent value, via the splitmix64 finalizer over an FNV-1a hash of
// the belt's own feature id, salted by k and draw — reproducible from
// (beltFeatureId, k) alone, with no persisted state (design.md Decision 5).
func beltMemberUnit(beltId string, k, draw int) float64 {
	h := fnv1a64(beltId)
	h ^= uint64(k)*0x9E3779B97F4A7C15 + uint64(draw)*0xBF58476D1CE4E5B9 + 0xD1B54A32D192ED03
	return unitFraction(mix64(h))
}

// beltMemberOrbit derives one belt member's body: a discrete, mineable
// position on the belt's shared radius (design.md Decision 5). Radius,
// phase, inclination jitter, and size are all derived from (belt.Id, k);
// every member shares the belt's OWN period (PeriodMs) and Node, so the
// belt rotates as one rigid body. Reads the belt's STORED Width — never a
// live re-derivation from BeltWidthFraction — so a later constant retune
// never moves an already-generated belt's members.
func beltMemberOrbit(belt Feature, k int) space.Body {
	id := fmt.Sprintf("%s#%d", belt.Id, k)
	base := belt.Space.Radius
	width := belt.Width

	uRadius := beltMemberUnit(belt.Id, k, beltDrawRadius)
	uPhase := beltMemberUnit(belt.Id, k, beltDrawPhase)
	uIncl := beltMemberUnit(belt.Id, k, beltDrawIncl)
	uSize := beltMemberUnit(belt.Id, k, beltDrawSize)

	radius := float64(base + float64((uRadius-0.5)*width))
	phase := wrapSubTurnFraction(uPhase)
	retrograde := belt.Space.Inclination > space.SubTurn/4
	incl := inclinationFor(retrograde, uIncl)
	size := float64(BeltMemberSizeMin + float64(uSize*(BeltMemberSizeMax-BeltMemberSizeMin)))

	return space.Body{
		Id:   id,
		Size: size,
		Orbit: &space.Orbit{
			ParentId:    belt.Space.ParentId,
			Radius:      radius,
			PeriodMs:    belt.Space.PeriodMs,
			Phase:       phase,
			Inclination: incl,
			Node:        belt.Space.Node,
		},
	}
}
