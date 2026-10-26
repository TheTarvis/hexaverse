package space

import "hexaverse/common"

// ShipMode is a ship's current kinematic mode.
type ShipMode int

const (
	// ModeBurn is mid-transfer, riding a committed Burn.
	ModeBurn ShipMode = iota
	// ModeParked is idle, holding a Park.
	ModeParked
	// ModeDrift is a free, unpowered coast at constant velocity — a third
	// mode, not a fourth ParkKind, because a drift has velocity and is not
	// idle (design.md Decision 5).
	ModeDrift
)

// ShipState is a ship's stored kinematic state: exactly one of Burn, Park,
// or Drift is set, matching Mode.
type ShipState struct {
	Mode  ShipMode
	Burn  *Burn
	Park  *Park
	Drift *Drift
}

// StateAt is the effective-state fold: a burn whose arrival time has
// passed IS its settled park, computed deterministically from the stored
// burn alone, using an exact integer t >= burn.ArriveMs comparison — no
// floating-point epsilon, no additional persisted "already settled" field
// (space-kinematics: "A Burn Past Its Arrival Is Its Settled Park, With No
// Extra Persisted State"). A body-targeted burn settles into an orbit park
// built from the burn's own stored insertion phase index — never
// re-derived from the intercept — with the insertion standoff radius and
// period for that body, epoched at the burn's stored arrival millisecond. A
// point-targeted burn settles into a point park at the intercept. An
// already-parked or already-drifting state folds to itself, unchanged — a
// drift never settles into a park at any fold distance, in either time
// direction (space-kinematics: "A Free-Drifting Ship Coasts in a Straight
// Line at Constant Velocity").
func StateAt(bodies Bodies, s ShipState, t common.WorldMillis) (ShipState, error) {
	if s.Mode == ModeParked {
		if released, folded := releasedIfDry(s.Park, t); folded {
			return ShipState{Mode: ModeParked, Park: &released}, nil
		}
		return s, nil
	}
	if s.Burn == nil {
		return s, nil
	}
	b := *s.Burn
	if t < b.ArriveMs {
		return ShipState{Mode: ModeBurn, Burn: &b}, nil
	}

	var park Park
	if b.Target.Point != nil {
		park = Park{Kind: ParkPoint, Point: b.Intercept}
	} else {
		body, ok := bodies.Body(b.Target.BodyId)
		if !ok {
			return ShipState{}, ErrUnknownBody
		}
		standoff := InsertionStandoff(body)
		park = Park{
			Kind:     ParkOrbit,
			BodyId:   b.Target.BodyId,
			Radius:   standoff,
			PeriodMs: InsertionPeriodFor(bodies, standoff),
			Phase:    b.InsertionPhase,
			EpochMs:  b.ArriveMs,
		}
	}
	return ShipState{Mode: ModeParked, Park: &park}, nil
}

// StatePosition folds s to its effective state at t and returns that
// state's position — a pure function of stored data and t alone
// (space-kinematics: "No Value Is Derived From Accumulated Per-Tick
// State").
func StatePosition(bodies Bodies, s ShipState, t common.WorldMillis) (Vec3, error) {
	folded, err := StateAt(bodies, s, t)
	if err != nil {
		return Vec3{}, err
	}
	switch folded.Mode {
	case ModeBurn:
		return folded.Burn.Position(t), nil
	case ModeParked:
		return folded.Park.Position(bodies, t)
	case ModeDrift:
		return folded.Drift.Position(t), nil
	default:
		return Vec3{}, ErrUnknownParkKind
	}
}

// releasedIfDry is the station-keeping half of the effective-state fold: a
// `stationkeep` park observed AT OR AFTER its stored dry instant IS its
// released orbit, computed deterministically from the stored park alone —
// exactly mirroring "a burn past its arrival IS its settled park", with the
// hold's dry instant substituted for the burn's arrival, and on the same
// exact integer comparison with no epsilon (space-kinematics: "A
// Station-Keeping Park Past Its Dry Instant Is Its Released Orbit, With No
// Extra Persisted State").
//
// The release time is the DRY INSTANT, never the observation time, which is
// what makes evaluating a past-dry park at two different later times
// produce identical results. It is a derivation, not a write: the park it
// is handed is never mutated.
//
// A park whose stored window is not well-formed (a dry instant not strictly
// after its hold start) never folds — that park is undecodable by this
// capability's own codec, so no such value reaches here through the
// persistence boundary, and an in-memory one is left exactly as given
// rather than silently released against a meaningless instant.
func releasedIfDry(p *Park, t common.WorldMillis) (Park, bool) {
	if p == nil || p.Kind != ParkStationkeep {
		return Park{}, false
	}
	if p.DryInstantMs <= p.HoldStartMs || t < p.DryInstantMs {
		return Park{}, false
	}
	return ReleaseStationkeep(p.BodyId, p.Offset, p.DryInstantMs, p.PeriodMs), true
}
