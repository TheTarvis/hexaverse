package disclosure

import (
	"hexaverse/common"
	"hexaverse/space"
)

// Occluded reports whether a sphere of radius `size` centred at `centre`
// blocks the sightline from `from` to `to`.
//
// The star is this capability's ONLY occluder. Planets, moons, stations,
// and ships do not block: a system's bodies are small and its star is not,
// and every extra occluder buys ambiguity in exchange for a predicate
// nobody can reason about at the table.
//
// Squared throughout, with no square root: the closest point on the segment
// is taken with the segment parameter CLAMPED to [0,1] — which is what
// keeps a star lying beyond the target, along the extended line, from
// blocking a sightline it is not actually on — and its squared distance to
// the centre is compared against the squared size.
//
// STRICTLY less than, and that is the inclusive tie rule, not an exception
// to it. This test's polarity is inverted from a range test: nearer BLOCKS
// rather than discloses. Resolving the exact boundary toward disclosure
// therefore means a sightline exactly tangent to the star is CLEAR. Written
// out here because applying a range test's `<=` to this one would silently
// invert the rule.
//
// A zero-length segment — observer and target coincident — is not occluded,
// and returns before the division by the segment's squared length that
// would otherwise be a divide by zero.
func Occluded(from, to, centre space.Vec3, size float64) bool {
	segment := to.Sub(from)
	segmentLenSq := segment.Dot(segment)
	if segmentLenSq == 0 {
		return false
	}
	u := segment.Dot(centre.Sub(from)) / segmentLenSq
	if u < 0 {
		u = 0
	} else if u > 1 {
		u = 1
	}
	closest := from.Add(segment.Scale(u))
	return closest.DistSq(centre) < float64(size*size)
}

// starOccludes applies Occluded against the world's star at t. Every live
// channel and the focused scan alike run through this one function, so that
// "the plume is loud enough" can never become a path around the star.
func (w World) starOccludes(from, to space.Vec3, t common.WorldMillis) (bool, error) {
	star, err := w.starPosition(t)
	if err != nil {
		return false, err
	}
	return Occluded(from, to, star, w.StarSize), nil
}
