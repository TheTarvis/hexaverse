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
	if s.Mode == ModeParked || s.Burn == nil {
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
			PeriodMs: InsertionPeriod(standoff),
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
