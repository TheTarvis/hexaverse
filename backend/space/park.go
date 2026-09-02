package space

import (
	"fmt"
	"math"

	"hexaverse/common"
)

// ParkKind is an idle ship's resting mode (space-kinematics: "Idle Ships
// Park in Exactly One of Three Modes").
type ParkKind int

const (
	// ParkOrbit is a free rails orbit around a body — no ongoing cost.
	ParkOrbit ParkKind = iota
	// ParkStationkeep is a fixed offset held continuously in a body's
	// reference frame, at a continuous cost (StationKeepRate/StationKeepUpkeep).
	ParkStationkeep
	// ParkPoint is a fixed position in space — no ongoing cost.
	ParkPoint
)

// Park is an idle ship's resting state. Only the fields meaningful to Kind
// are populated: BodyId/Radius/PeriodMs/Phase/EpochMs for ParkOrbit,
// BodyId/Offset for ParkStationkeep, Point for ParkPoint.
type Park struct {
	Kind     ParkKind
	BodyId   string
	Radius   float64
	PeriodMs common.WorldMillis
	Phase    SubTurns
	EpochMs  common.WorldMillis
	Offset   Vec3
	Point    Vec3
	// HoldStartMs is the world time a ParkStationkeep hold began — the
	// epoch every upkeep accrual is measured from (space-kinematics: "A
	// newly created station-keep park stores its start time and dry
	// instant"). Meaningful only for ParkStationkeep; zero on every other
	// kind, and on a released orbit the fold writes over one.
	//
	// Named as persisted state deliberately: without it an implementer
	// reaches for Fleet.UpdatedAt as a hold-start proxy, which unrelated
	// writes re-stamp — a silent-corruption bug no formula-level test
	// would catch.
	HoldStartMs common.WorldMillis
	// DryInstantMs is the world time at which continued upkeep would have
	// drawn the fuel held at HoldStartMs down to the holding capability's
	// configured station-keeping reserve, computed once when the hold is
	// created and rewritten only when that capability restamps the hold at
	// a mid-hold fuel mutation. It moves ONLY together with HoldStartMs,
	// and never with the mere passage of time or the act of reading the
	// park. Observing the park at or after it folds the park to its
	// released orbit (see StateAt).
	DryInstantMs common.WorldMillis
}

// PhaseAt returns the orbit park's raw phase index at world time t — the
// same wrap-safe truncating advance Orbit.PhaseAt uses, but relative to the
// park's own EpochMs rather than the world epoch, since a park's orbit
// begins at whatever world time it was created or released (space-kinematics:
// "The Time Domain Is Explicit and Degenerate Orbital Elements Are
// Defined"). Meaningful only for ParkOrbit; a non-positive period returns
// the stored phase with no division.
func (p Park) PhaseAt(t common.WorldMillis) SubTurns {
	if p.PeriodMs <= 0 {
		return p.Phase
	}
	elapsed := int64(t - p.EpochMs)
	period := int64(p.PeriodMs)
	mod := floorMod(elapsed, period) // in [0, period) — see floorMod's doc for why a bare '%' breaks periodicity here
	advance := mod * int64(SubTurn) / period
	return wrapSubTurn(int64(p.Phase) + advance)
}

// ErrUnknownParkKind is returned for a Park whose Kind is none of the three
// documented modes — a programmer error, not a runtime condition this
// capability expects to hit.
var ErrUnknownParkKind = fmt.Errorf("space: unknown park kind")

// Position derives the park's position at world time t from its stored
// fields and t alone (space-kinematics: "Idle Ships Park in Exactly One of
// Three Modes"). ParkOrbit's local offset is planar (no inclination/node —
// a ship's own resting orbit is simpler than a body's generated one) and
// composes with the body's own (possibly moving) position at t, exactly as
// a body's own hierarchical position does (body.go).
func (p Park) Position(bodies Bodies, t common.WorldMillis) (Vec3, error) {
	switch p.Kind {
	case ParkPoint:
		return p.Point, nil
	case ParkStationkeep:
		bodyPos, err := Position(bodies, p.BodyId, t)
		if err != nil {
			return Vec3{}, err
		}
		return bodyPos.Add(p.Offset), nil
	case ParkOrbit:
		bodyPos, err := Position(bodies, p.BodyId, t)
		if err != nil {
			return Vec3{}, err
		}
		idx := p.PhaseAt(t)
		cosT, sinT := CosSin(idx)
		local := Vec3{X: float64(p.Radius * cosT), Y: 0, Z: float64(p.Radius * sinT)}
		return bodyPos.Add(local), nil
	default:
		return Vec3{}, ErrUnknownParkKind
	}
}

// Velocity derives the park's instantaneous velocity at world time t
// analytically, never by finite difference (space-kinematics: "A Body's
// Velocity Is Computed Analytically", extended to parks by "Arrival Is
// Tangent to the Target's Settled Motion").
func (p Park) Velocity(bodies Bodies, t common.WorldMillis) (Vec3, error) {
	switch p.Kind {
	case ParkPoint:
		return Vec3{}, nil
	case ParkStationkeep:
		return Velocity(bodies, p.BodyId, t)
	case ParkOrbit:
		bodyVel, err := Velocity(bodies, p.BodyId, t)
		if err != nil {
			return Vec3{}, err
		}
		if p.PeriodMs <= 0 {
			return bodyVel, nil
		}
		idx := p.PhaseAt(t)
		cosT, sinT := CosSin(idx)
		scale := angularRateScale(p.Radius, p.PeriodMs)
		local := Vec3{X: float64(-sinT * scale), Y: 0, Z: float64(cosT * scale)}
		return bodyVel.Add(local), nil
	default:
		return Vec3{}, ErrUnknownParkKind
	}
}

// InsertionStandoff is the documented per-body insertion radius: a base
// clearance plus a term scaled by the body's own size, so a larger body
// always resolves a strictly larger standoff (space-kinematics: "A larger
// body gets a proportionally larger standoff").
func InsertionStandoff(body Body) float64 {
	return float64(insertionStandoffBase + float64(insertionStandoffPerSize*body.Size))
}

// InsertionPeriod is the documented function of a standoff radius that
// gives the insertion orbit's period, in world-milliseconds (design.md
// Decision 5's own worked example: insertionPeriod(r) = 5 + r*0.9 seconds).
func InsertionPeriod(radius float64) common.WorldMillis {
	seconds := float64(insertionPeriodBaseSeconds + float64(insertionPeriodPerRadius*radius))
	return common.WorldMillis(seconds * 1000)
}

// StationKeepRate returns the continuous upkeep rate a station-keeping park
// at bodyId charges: the host body's own centripetal acceleration
// ((2*pi/period)^2 * radius), floored at StationKeepFloor. A body with no
// orbit of its own (or a non-positive period) charges exactly the floor
// (space-kinematics: "Station-Keeping Draws a Positive, Body-Derived
// Upkeep").
func StationKeepRate(bodies Bodies, bodyId string) (float64, error) {
	b, ok := bodies.Body(bodyId)
	if !ok {
		return 0, ErrUnknownBody
	}
	if b.Orbit == nil || b.Orbit.PeriodMs <= 0 {
		return StationKeepFloor, nil
	}
	periodSeconds := float64(b.Orbit.PeriodMs) / 1000
	omega := float64(twoPi / periodSeconds)
	omegaSq := float64(omega * omega)
	rate := float64(omegaSq * b.Orbit.Radius)
	if rate < StationKeepFloor {
		rate = StationKeepFloor
	}
	return rate, nil
}

// StationKeepUpkeep returns the upkeep accrued between two world times: the
// park's rate multiplied by the elapsed world time, computed from the two
// endpoints alone — never an accumulation over intermediate reads
// (space-kinematics: "No Value Is Derived From Accumulated Per-Tick
// State").
func StationKeepUpkeep(rate float64, fromMs, toMs common.WorldMillis) float64 {
	elapsedSeconds := float64(toMs-fromMs) / 1000
	return float64(rate * elapsedSeconds)
}

// ReleaseStationkeep converts a released station-keep hold into an orbit
// park whose radius is the planar (horizontal-plane) magnitude of the held
// offset, dropping any vertical component, or the configured MinOrbitRadius
// if that would be smaller. The phase is derived from the offset's planar
// components, or DefaultPhaseIndex if both are zero (space-kinematics:
// "Releasing a Station-Keep Hold Re-Circularizes at the Held Offset's
// Planar Radius").
func ReleaseStationkeep(bodyId string, offset Vec3, releaseMs common.WorldMillis) Park {
	planarRadius := math.Sqrt(float64(offset.X*offset.X) + float64(offset.Z*offset.Z)) // determinism:allow(pinned) sqrt is correctly-rounded and identical across Go build targets
	radius := planarRadius
	if radius < MinOrbitRadius {
		radius = MinOrbitRadius
	}
	var phase SubTurns
	if offset.X == 0 && offset.Z == 0 {
		phase = DefaultPhaseIndex
	} else {
		phase, _ = PhaseIndexOf(Vec3{X: offset.X, Z: offset.Z})
	}
	return Park{
		Kind:     ParkOrbit,
		BodyId:   bodyId,
		Radius:   radius,
		PeriodMs: InsertionPeriod(radius),
		Phase:    phase,
		EpochMs:  releaseMs,
	}
}

// StarClearanceRadius is the documented function of a star's size that
// gives the clearance radius a burn's curve must stay outside of
// (space-kinematics: "A Burn Path Is Displaced Perpendicular to the Chord
// to Clear the Star").
func StarClearanceRadius(starSize float64) float64 {
	return float64(starClearanceFactor * starSize)
}
