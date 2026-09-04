package system

// StationContinuousOrbit — the station's orbit, derived without ever reading
// the materialized interior (openspec add-orbital-system-bodies, design.md
// Decision 6). It is the station's ONLY derivation: the `stations` package
// once carried a second, discrete one that this derivation coexisted with,
// and that one is gone along with the coordinate system it was expressed
// in. Nothing persists the result — the orbit is spliced onto the station
// body at interior-read time, from (galaxy seed, system id, skeleton).

import (
	"fmt"

	"hexaverse/galaxy"
	"hexaverse/space"
)

// StationContinuousOrbit derives a station's continuous orbit purely from
// galaxy-tier inputs — the galaxy seed, the system id, and its skeleton —
// with no store read and no clock (design.md Decision 6). A station parents
// to one of its system's skeleton major bodies, chosen by
// `k = mix64(mix64(systemSeed)) mod len(skeleton.Bodies)`; its local radius
// is a type-keyed ceiling (MaxFeatureSize(featureTypeForBody(parentType)) +
// space.InsertionStandoff(that same ceiling) + StationStandoff) — an upper
// bound on the parent's actual drawn size, never the size itself, which is
// what keeps this derivation pure. Falls back to a star-parented orbit at
// the configured StationFallbackRadius when the skeleton is empty
// (unreachable today: MinBodies = 1).
func StationContinuousOrbit(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) space.Orbit {
	seed := galaxy.SystemSeed(galaxySeed, systemId)
	incl := inclinationForDominant(seed)

	if len(skeleton.Bodies) == 0 {
		return space.Orbit{
			ParentId:    "feat-star",
			Radius:      StationFallbackRadius,
			PeriodMs:    space.InsertionPeriod(StationFallbackRadius),
			Inclination: incl,
		}
	}

	k := int(mix64(mix64(uint64(seed))) % uint64(len(skeleton.Bodies)))
	parentType := skeleton.Bodies[k].Type
	ceiling := MaxFeatureSize(featureTypeForBody(parentType))
	localRadius := float64(ceiling + float64(space.InsertionStandoff(space.Body{Size: ceiling})+StationStandoff))

	return space.Orbit{
		ParentId:    fmt.Sprintf("feat-body-%d", k),
		Radius:      localRadius,
		PeriodMs:    space.InsertionPeriod(localRadius),
		Inclination: incl,
	}
}

// inclinationForDominant reads the station's inclination side from the
// system's dominant orbital direction (design.md Decisions 6, 17) — the
// station is not a generated body and rolls no side of its own, so, like a
// moon, it takes its side from DominantOrbitDirection directly. No jitter:
// the station's placement
// is exact by construction, not a generated body among many.
func inclinationForDominant(systemSeed int64) space.SubTurns {
	if DominantOrbitDirection(systemSeed) < 0 {
		return space.SubTurn / 2
	}
	return 0
}
