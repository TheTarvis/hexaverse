package space

import (
	"errors"
	"math"

	"hexaverse/common"
)

// The Firestore / action.Params codec (design.md Decision 4) — the
// continuous-space analogue of backend/board/params.go: the one place a
// space.Vec3 or space.SubTurns is allowed to cross into an untyped
// map[string]any. A Vec3 encodes as []float64{x, y, z} and a SubTurns as an
// int64, matching action.Commit's existing ErrNonPrimitiveParam validator's
// allowlist exactly — no change to the action spine.

// ErrNonFiniteCoordinate is returned when a decoded coordinate is NaN or
// +/-infinity.
var ErrNonFiniteCoordinate = errors.New("space: coordinate is not finite")

// ErrCoordinateOutOfExtent is returned when a decoded coordinate's
// magnitude exceeds coordinateExtent.
var ErrCoordinateOutOfExtent = errors.New("space: coordinate magnitude exceeds the configured extent")

// coordinateExtent is the configured maximum magnitude a decoded coordinate
// may carry — generous relative to any plausible galaxy scale, but well
// short of a value (like math.MaxFloat64) that would itself poison a
// downstream squared-distance computation with an overflow to +Inf.
const coordinateExtent = 1e12

// EncodeVec writes a Vec3 as the Firestore-native primitive shape
// action.Params carries: []float64{x, y, z} (design.md Decision 4, pinned
// literally by the design text).
func EncodeVec(v Vec3) []float64 {
	return []float64{v.X, v.Y, v.Z}
}

// DecodeVec accepts the numeric-slice shapes a stored vector can arrive as
// — an in-memory []float64 (EncodeVec's own output, or a unit-test
// literal), a []interface{} of float64s (a JSON HTTP body decode), or a
// []any of int64s (a Firestore round trip) — mirroring board.decodeInt's
// reasoning that an in-memory literal, a Firestore round trip, and a JSON
// decode disagree on shape. It rejects a non-finite or out-of-extent
// component with a named, countable error before any decoded value reaches
// a downstream computation, returning the zero Vec3 on failure (never a
// partially-decoded value a caller might use).
func DecodeVec(v any) (Vec3, error) {
	nums, ok := decodeNumericSlice(v)
	if !ok || len(nums) != 3 {
		return Vec3{}, errNotAVector
	}
	x, err := checkedCoordinate(nums[0])
	if err != nil {
		return Vec3{}, err
	}
	y, err := checkedCoordinate(nums[1])
	if err != nil {
		return Vec3{}, err
	}
	z, err := checkedCoordinate(nums[2])
	if err != nil {
		return Vec3{}, err
	}
	return Vec3{X: x, Y: y, Z: z}, nil
}

// errNotAVector is returned for a value that is not one of DecodeVec's
// accepted numeric-slice shapes at all — distinct from the two named,
// spec-required failures (non-finite, out-of-extent), which fire only once
// a value has already been recognized as a coordinate.
var errNotAVector = errors.New("space: value is not a 3-element numeric slice")

func decodeNumericSlice(v any) ([]float64, bool) {
	switch s := v.(type) {
	case []float64:
		return s, true
	case []any: // == []interface{}; a JSON HTTP body decode and a Firestore round trip both arrive as this shape
		out := make([]float64, len(s))
		for i, e := range s {
			n, ok := decodeNumber(e)
			if !ok {
				return nil, false
			}
			out[i] = n
		}
		return out, true
	default:
		return nil, false
	}
}

// decodeNumber normalizes the three numeric shapes a decoded slice element
// can carry: an in-memory int, a Firestore int64, or a JSON float64.
func decodeNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float64:
		return n, true
	default:
		return 0, false
	}
}

// checkedCoordinate rejects a non-finite or out-of-extent value with its
// own named error, before it reaches any downstream computation.
func checkedCoordinate(n float64) (float64, error) {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return 0, ErrNonFiniteCoordinate
	}
	if math.Abs(n) > coordinateExtent {
		return 0, ErrCoordinateOutOfExtent
	}
	return n, nil
}

// ErrInvalidOrbit is returned when a decoded value is not a well-formed
// encoded space.Orbit map at all, or is missing/mistypes a required key
// (design.md Decision 12: "failing by name on a missing or mistyped key").
// A present-but-invalid radius fails with the more specific
// ErrNonFiniteCoordinate/ErrCoordinateOutOfExtent instead.
var ErrInvalidOrbit = errors.New("space: value is not a decodable orbit")

// EncodeOrbit writes an Orbit as the Firestore-native primitive map
// action.Params carries (design.md Decision 12, discharging
// space-kinematics' "every position, control point, and orbital element
// set" codec requirement): every value is a string, float64, or int64 —
// already inside action.Commit's ErrNonPrimitiveParam allowlist, so the
// action spine needs no change.
func EncodeOrbit(o Orbit) map[string]any {
	return map[string]any{
		"parentId":    o.ParentId,
		"radius":      o.Radius,
		"periodMs":    int64(o.PeriodMs),
		"phase":       int64(o.Phase),
		"inclination": int64(o.Inclination),
		"node":        int64(o.Node),
	}
}

// DecodeOrbit is EncodeOrbit's exact inverse: it accepts the numeric shapes
// an in-memory literal, a Firestore round trip, and a JSON body decode
// disagree on (routing radius through the existing checkedCoordinate and
// every angle through the existing DecodeSubTurns), and fails by name
// (ErrInvalidOrbit) on a value that isn't a map at all, or is missing or
// mistypes "parentId"/"radius"/"periodMs". DecodeSubTurns itself never
// rejects an out-of-range angle (it wraps), so an angle-shaped failure here
// is scoped to a missing key or a non-finite JSON number.
func DecodeOrbit(v any) (Orbit, error) {
	m, ok := v.(map[string]any)
	if !ok {
		return Orbit{}, ErrInvalidOrbit
	}
	parentId, ok := m["parentId"].(string)
	if !ok {
		return Orbit{}, ErrInvalidOrbit
	}
	radiusNum, ok := decodeNumber(m["radius"])
	if !ok {
		return Orbit{}, ErrInvalidOrbit
	}
	radius, err := checkedCoordinate(radiusNum)
	if err != nil {
		return Orbit{}, err
	}
	periodNum, ok := decodeNumber(m["periodMs"])
	if !ok {
		return Orbit{}, ErrInvalidOrbit
	}
	phase, err := DecodeSubTurns(m["phase"])
	if err != nil {
		return Orbit{}, err
	}
	inclination, err := DecodeSubTurns(m["inclination"])
	if err != nil {
		return Orbit{}, err
	}
	node, err := DecodeSubTurns(m["node"])
	if err != nil {
		return Orbit{}, err
	}
	return Orbit{
		ParentId:    parentId,
		Radius:      radius,
		PeriodMs:    common.WorldMillis(int64(periodNum)),
		Phase:       phase,
		Inclination: inclination,
		Node:        node,
	}, nil
}

// EncodeSubTurns writes a SubTurns angle as the Firestore-native int64
// action.Params carries (design.md Decision 4).
func EncodeSubTurns(a SubTurns) int64 {
	return int64(a)
}

// DecodeSubTurns accepts the numeric shapes a stored angle can arrive as —
// an in-memory int, a Firestore int64, or a JSON float64 — mirroring
// DecodeVec's own reasoning.
func DecodeSubTurns(v any) (SubTurns, error) {
	switch n := v.(type) {
	case int:
		return SubTurns(n), nil
	case int64:
		return SubTurns(n), nil
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return 0, ErrNonFiniteCoordinate
		}
		return SubTurns(int64(n)), nil
	default:
		return 0, errNotAVector
	}
}
