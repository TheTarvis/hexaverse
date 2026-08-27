package space

import "hexaverse/common"

// ShipMode is a ship's current kinematic mode.
type ShipMode int

const (
	// ModeBurn is mid-transfer, riding a committed Burn.
	ModeBurn ShipMode = iota
	// ModeParked is idle, holding a Park.
	ModeParked
)

// ShipState is a ship's stored kinematic state: exactly one of Burn or Park
// is set, matching Mode.
type ShipState struct {
	Mode ShipMode
	Burn *Burn
	Park *Park
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
// already-parked state folds to itself, unchanged.
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
	default:
		return Vec3{}, ErrUnknownParkKind
	}
}
