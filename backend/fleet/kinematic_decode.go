package fleet

import (
	"errors"
	"fmt"

	"hexaverse/space"

	"github.com/rs/zerolog/log"
)

// DecodeCause names why a stored (or committed) kinematic-state value failed
// to decode (tasks.md 3.6; fleet-movement "Undecodable Stored Kinematic State
// Is Rejected, Never Panicked" — "coordinate rejections are countable per
// cause"). Values are the four cause strings that requirement names verbatim.
type DecodeCause string

const (
	CauseNonFiniteCoordinate   DecodeCause = "non-finite-coordinate"
	CauseCoordinateOutOfExtent DecodeCause = "coordinate-out-of-extent"
	CauseUndecodableShape      DecodeCause = "undecodable-shape"
	CauseUnknownBody           DecodeCause = "unknown-body"
)

// ErrKinematicDecode is the sentinel every KinematicDecodeError matches via
// errors.Is, regardless of cause (tasks.md 3.6).
var ErrKinematicDecode = errors.New("fleet: stored kinematic state failed to decode")

// KinematicDecodeError is DecodeKinematicState's named, countable failure —
// a cause plus, for an action-parameter decode, the action's type and id
// (tasks.md 3.6: "surface a decode failure as a named, countable error
// carrying cause ... plus actionType and the action id when decoding an
// action parameter").
type KinematicDecodeError struct {
	Cause      DecodeCause
	ActionType string
	ActionId   string
	// err is the underlying space-package (or structural) error this
	// wraps — never itself the identity errors.Is callers match on; that is
	// ErrKinematicDecode, via Unwrap.
	err error
}

func (e *KinematicDecodeError) Error() string {
	if e.ActionType != "" || e.ActionId != "" {
		return fmt.Sprintf("fleet: kinematic decode rejected (cause=%s actionType=%s actionId=%s): %v",
			e.Cause, e.ActionType, e.ActionId, e.err)
	}
	return fmt.Sprintf("fleet: kinematic decode rejected (cause=%s): %v", e.Cause, e.err)
}

func (e *KinematicDecodeError) Unwrap() error { return ErrKinematicDecode }

// decodeFail builds the named error and logs it once, at the point of
// rejection — the shared structured-log vocabulary a fleet-document decode
// (no action context) and an action-parameter decode (actionType/actionId
// populated) both go through. A fleet-read rejection carries `cause` alone;
// it never logs `actionType`/an action id it doesn't have.
func decodeFail(cause DecodeCause, actionType, actionId string, err error) error {
	event := log.Warn().Str("cause", string(cause))
	if actionType != "" {
		event = event.Str("actionType", actionType)
	}
	if actionId != "" {
		event = event.Str("actionId", actionId)
	}
	event.Err(err).Msg("Kinematic state decode rejected")
	return &KinematicDecodeError{Cause: cause, ActionType: actionType, ActionId: actionId, err: err}
}

// wrapSpaceDecodeErr maps one of space's own named decode errors onto this
// package's DecodeCause vocabulary — non-finite and out-of-extent coordinate
// failures propagate their specific cause; every other structural failure
// (not a map, a missing/mistyped key, a bad control-point count, a
// disagreeing stored curve length) is undecodable-shape.
func wrapSpaceDecodeErr(err error, actionType, actionId string) error {
	switch {
	case errors.Is(err, space.ErrNonFiniteCoordinate):
		return decodeFail(CauseNonFiniteCoordinate, actionType, actionId, err)
	case errors.Is(err, space.ErrCoordinateOutOfExtent):
		return decodeFail(CauseCoordinateOutOfExtent, actionType, actionId, err)
	default:
		return decodeFail(CauseUndecodableShape, actionType, actionId, err)
	}
}

// DecodeKinematicState is the shared decode+validate primitive every
// boundary that reads persisted or committed kinematic-state data routes
// through (tasks.md 3.6; design.md Decision 16-adjacent) — the fleet
// document boundary (an actionType-less call, actionType="" actionId="") and
// an action-parameter decode (actionType/actionId populated) alike. It never
// panics and never defaults to an implied park: every failure is a named,
// countable *KinematicDecodeError matching ErrKinematicDecode.
//
// The wire shape is a discriminated union — {"mode": "burn"|"park"|"drift",
// "value": <space.EncodeBurn/EncodePark/EncodeDrift output>} — mirroring how
// system.Feature's own SpaceDoc crosses the persistence boundary.
func DecodeKinematicState(bodies space.Bodies, doc map[string]any, actionType, actionId string) (space.ShipState, error) {
	if doc == nil {
		return space.ShipState{}, decodeFail(CauseUndecodableShape, actionType, actionId, errors.New("fleet: no stored kinematic state"))
	}
	modeRaw, ok := doc["mode"]
	if !ok {
		return space.ShipState{}, decodeFail(CauseUndecodableShape, actionType, actionId, errors.New("fleet: kinematic state document has no mode"))
	}
	mode, ok := modeRaw.(string)
	if !ok {
		return space.ShipState{}, decodeFail(CauseUndecodableShape, actionType, actionId, fmt.Errorf("fleet: mode is %T, not a string", modeRaw))
	}
	value, hasValue := doc["value"]
	if !hasValue {
		return space.ShipState{}, decodeFail(CauseUndecodableShape, actionType, actionId, errors.New("fleet: kinematic state document has no value"))
	}

	switch mode {
	case "burn":
		b, err := space.DecodeBurn(value)
		if err != nil {
			return space.ShipState{}, wrapSpaceDecodeErr(err, actionType, actionId)
		}
		if b.Target.BodyId != "" {
			if _, ok := bodies.Body(b.Target.BodyId); !ok {
				return space.ShipState{}, decodeFail(CauseUnknownBody, actionType, actionId,
					fmt.Errorf("fleet: burn target body %q not found", b.Target.BodyId))
			}
		}
		return space.ShipState{Mode: space.ModeBurn, Burn: &b}, nil

	case "park":
		p, err := space.DecodePark(value)
		if err != nil {
			return space.ShipState{}, wrapSpaceDecodeErr(err, actionType, actionId)
		}
		if p.Kind != space.ParkPoint && p.BodyId != "" {
			if _, ok := bodies.Body(p.BodyId); !ok {
				return space.ShipState{}, decodeFail(CauseUnknownBody, actionType, actionId,
					fmt.Errorf("fleet: park body %q not found", p.BodyId))
			}
		}
		return space.ShipState{Mode: space.ModeParked, Park: &p}, nil

	case "drift":
		d, err := space.DecodeDrift(value)
		if err != nil {
			return space.ShipState{}, wrapSpaceDecodeErr(err, actionType, actionId)
		}
		return space.ShipState{Mode: space.ModeDrift, Drift: &d}, nil

	default:
		return space.ShipState{}, decodeFail(CauseUndecodableShape, actionType, actionId, fmt.Errorf("fleet: unrecognized kinematic mode %q", mode))
	}
}

// EncodeKinematicState is DecodeKinematicState's exact inverse — the wire
// shape a fleet's kinematic state crosses the persistence (or action-param)
// boundary as. Returns nil for a zero-value/unrecognized ShipState (never
// asked to encode one in practice: every constructor below sets Mode
// explicitly).
func EncodeKinematicState(s space.ShipState) map[string]any {
	switch s.Mode {
	case space.ModeBurn:
		if s.Burn == nil {
			return nil
		}
		return map[string]any{"mode": "burn", "value": space.EncodeBurn(*s.Burn)}
	case space.ModeParked:
		if s.Park == nil {
			return nil
		}
		return map[string]any{"mode": "park", "value": space.EncodePark(*s.Park)}
	case space.ModeDrift:
		if s.Drift == nil {
			return nil
		}
		return map[string]any{"mode": "drift", "value": space.EncodeDrift(*s.Drift)}
	default:
		return nil
	}
}
