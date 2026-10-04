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

	k := stationParentIndex(seed, len(skeleton.Bodies))
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

// stationParentIndex is the station's parent choice among the skeleton's major
// bodies, `mix64(mix64(systemSeed)) mod bodyCount`. Shared by
// StationContinuousOrbit and stationShellBound so the two cannot disagree.
// Never called with bodyCount == 0 (callers guard the empty skeleton).
func stationParentIndex(systemSeed int64, bodyCount int) int {
	return int(mix64(mix64(uint64(systemSeed))) % uint64(bodyCount))
}

// StationShellClearsStar reports whether the station's whole orbital shell
// stays strictly outside its star's clearance radius, so no station park
// position can lie inside the clearance (home-site criterion (d)). Pure over
// galaxy-tier data: no store read, no clock, no square root, no trigonometry.
func StationShellClearsStar(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) bool {
	return shellClears(stationShellBound(galaxySeed, systemId, skeleton))
}

// stationShellBound returns a lower bound on the station's star distance (the
// parent's ring radius less the station's local radius less the parent's
// insertion standoff) and the star clearance it is compared with.
func stationShellBound(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) (bound, clearance float64) {
	orbit := StationContinuousOrbit(galaxySeed, systemId, skeleton)
	standoff := space.InsertionStandoff(space.Body{Size: StationSize})
	if len(skeleton.Bodies) == 0 {
		bound = float64(orbit.Radius - standoff)
	} else {
		k := stationParentIndex(galaxy.SystemSeed(galaxySeed, systemId), len(skeleton.Bodies))
		bound = float64(float64(ContinuousRadius(skeleton.Bodies[k].Ring)-orbit.Radius) - standoff)
	}
	clearance = space.StarClearanceRadius(StarSize(skeleton.StarClass))
	return bound, clearance
}

// shellClears is the strict comparison deciding criterion (d).
func shellClears(bound, clearance float64) bool {
	return bound > clearance
}
