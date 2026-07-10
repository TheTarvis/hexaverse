package galaxy

import (
	"math/rand"
	"sort"
)

// rollSkeleton generates a system's major-body inventory deterministically from
// its per-system seed. Body *count* is deliberately independent of region: the
// character dial drives the paid detail's worth (#0003), not the free inventory,
// so the skeleton doesn't leak the survey appraisal (#0001 Decision #9).
func rollSkeleton(systemSeed int64, _ Region, params GenerationParams) Skeleton {
	r := newRand(systemSeed)

	minB, maxB := params.MinBodies, params.MaxBodies
	if maxB < minB {
		maxB = minB
	}
	count := minB
	if maxB > minB {
		count += r.Intn(maxB - minB + 1)
	}

	rings := distinctRings(r, count, params.MaxRings)
	bodies := make([]Body, count)
	for i, ring := range rings {
		bt := rollBodyType(r, ring, params.MaxRings)
		bodies[i] = Body{
			Type:     bt,
			Ring:     ring,
			Mineable: isMineable(bt),
		}
	}

	return Skeleton{
		StarClass: rollStarClass(r, params.StarClassWeights),
		Bodies:    bodies,
	}
}

// distinctRings picks `count` distinct orbital indices in [0, maxRings),
// returned ascending so bodies read inner-to-outer.
func distinctRings(r *rand.Rand, count, maxRings int) []int {
	if maxRings < count {
		maxRings = count
	}
	perm := r.Perm(maxRings)[:count]
	sort.Ints(perm)
	return perm
}

// rollStarClass draws from the weighted distribution. Map keys are sorted first
// so the draw is deterministic (Go map iteration order is not).
func rollStarClass(r *rand.Rand, weights map[string]int) string {
	if len(weights) == 0 {
		return "G"
	}
	classes := make([]string, 0, len(weights))
	for c := range weights {
		classes = append(classes, c)
	}
	sort.Strings(classes)

	total := 0
	for _, c := range classes {
		total += weights[c]
	}
	if total <= 0 {
		return classes[0]
	}
	roll := r.Intn(total)
	for _, c := range classes {
		roll -= weights[c]
		if roll < 0 {
			return c
		}
	}
	return classes[len(classes)-1]
}

// rollBodyType biases inner rings toward rock/molten and outer rings toward
// gas/ice, the way real systems layer.
func rollBodyType(r *rand.Rand, ring, maxRings int) BodyType {
	frac := 0.0
	if maxRings > 1 {
		frac = float64(ring) / float64(maxRings-1)
	}
	roll := r.Float64()
	switch {
	case frac < 0.25:
		if roll < 0.5 {
			return BodyMoltenz
		}
		return BodyRocky
	case frac < 0.55:
		if roll < 0.55 {
			return BodyRocky
		}
		if roll < 0.8 {
			return BodyOceanic
		}
		return BodyBarrenz
	case frac < 0.8:
		if roll < 0.5 {
			return BodyGasGiant
		}
		if roll < 0.75 {
			return BodyBarrenz
		}
		return BodyIce
	default:
		if roll < 0.6 {
			return BodyIce
		}
		return BodyGasGiant
	}
}

// isMineable marks the solid archetypes as bootstrap-mineable (#0009 hint).
// Gas giants and ocean worlds carry no free lode.
func isMineable(t BodyType) bool {
	switch t {
	case BodyRocky, BodyIce, BodyBarrenz, BodyMoltenz:
		return true
	default:
		return false
	}
}
