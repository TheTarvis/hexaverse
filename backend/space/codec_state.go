package space

import (
	"errors"

	"hexaverse/common"
)

// The widened persistence codec (design.md Decision 9; space-kinematics
// MODIFIED: "Coordinates Cross the Persistence Boundary Through a Named
// Codec") — extends params.go's Vec3/SubTurns codec to a ship's whole
// kinematic state: a burn, a park, and a drift. Every encoded shape is one
// of action.Commit's existing ErrNonPrimitiveParam allowlist primitives
// (string, bool, int64, float64, []float64, []any, map[string]any, nil,
// recursed) — no change to the action spine (design.md Decision 15).
//
// The six curve control points encode as a FLAT []float64 of 18 numbers (6
// points * 3 components, P0,C1,C2,C3,C4,P5 in that order) — one of the
// three shapes the MODIFIED requirement text permits, and deliberately NOT
// [][]float64, which the action spine's validator rejects outright.

// ErrInvalidBurn is returned when a decoded value is not a well-formed
// encoded space.Burn map at all, is missing or mistypes a required key, its
// control-point list does not number exactly six, or its decoded curve
// length disagrees with the length recomputed from the decoded control
// points. A present-but-invalid coordinate component fails with the more
// specific ErrNonFiniteCoordinate/ErrCoordinateOutOfExtent instead
// (mirroring ErrInvalidOrbit's own split, params.go).
var ErrInvalidBurn = errors.New("space: value is not a decodable burn")

// ErrInvalidPark is returned when a decoded value is not a well-formed
// encoded space.Park map at all, is missing or mistypes a required key, or
// carries an unrecognized Kind.
var ErrInvalidPark = errors.New("space: value is not a decodable park")

// ErrInvalidDrift is returned when a decoded value is not a well-formed
// encoded space.Drift map at all, is missing or mistypes a required key, or
// carries an absent or non-positive epoch (space-kinematics: "A drift with
// an absent or non-positive epoch fails to decode").
var ErrInvalidDrift = errors.New("space: value is not a decodable drift")

// controlPointCount is the fixed number of curve control points a Curve
// carries (P0,C1,C2,C3,C4,P5) and the count the flat encoding's length is
// checked against.
const controlPointCount = 6

// decodeCoordField decodes a coordinate-shaped value (one of DecodeVec's
// accepted numeric-slice shapes), translating "not recognized as a
// coordinate at all" (a missing key, or a value of some other shape
// entirely) into the caller-supplied structural error, while letting
// DecodeVec's own named component-level failures
// (ErrNonFiniteCoordinate/ErrCoordinateOutOfExtent) propagate unchanged.
func decodeCoordField(v any, structuralErr error) (Vec3, error) {
	vec, err := DecodeVec(v)
	if err != nil {
		if errors.Is(err, errNotAVector) {
			return Vec3{}, structuralErr
		}
		return Vec3{}, err
	}
	return vec, nil
}

// --- Burn ----------------------------------------------------------------

// EncodeBurn writes a Burn as the Firestore-native primitive map
// action.Params carries.
func EncodeBurn(b Burn) map[string]any {
	var targetPoint any
	if b.Target.Point != nil {
		targetPoint = EncodeVec(*b.Target.Point)
	}
	return map[string]any{
		"origin":         EncodeVec(b.Origin),
		"targetBodyId":   b.Target.BodyId,
		"targetPoint":    targetPoint,
		"intercept":      EncodeVec(b.Intercept),
		"controlPoints":  encodeControlPoints(b.Curve),
		"curveLength":    b.Length,
		"departMs":       int64(b.DepartMs),
		"arriveMs":       int64(b.ArriveMs),
		"accel":          b.Accel,
		"insertionPhase": EncodeSubTurns(b.InsertionPhase),
	}
}

// encodeControlPoints writes a Curve's six control points as a flat
// []float64 of 18 numbers, P0,C1,C2,C3,C4,P5 in that order — never
// [][]float64 (design.md Decision 15).
func encodeControlPoints(c Curve) []float64 {
	out := make([]float64, 0, controlPointCount*3)
	for _, p := range [controlPointCount]Vec3{c.P0, c.C1, c.C2, c.C3, c.C4, c.P5} {
		out = append(out, p.X, p.Y, p.Z)
	}
	return out
}

// decodeControlPoints is encodeControlPoints's exact inverse: it accepts
// any of DecodeVec's numeric-slice shapes, fails structurally with
// ErrInvalidBurn when the decoded count is not exactly 18, and fails with
// the existing named coordinate errors on a non-finite or out-of-extent
// component — before any curve is constructed from it.
func decodeControlPoints(v any) (Curve, error) {
	nums, ok := decodeNumericSlice(v)
	if !ok || len(nums) != controlPointCount*3 {
		return Curve{}, ErrInvalidBurn
	}
	var pts [controlPointCount]Vec3
	for i := 0; i < controlPointCount; i++ {
		x, err := checkedCoordinate(nums[i*3])
		if err != nil {
			return Curve{}, err
		}
		y, err := checkedCoordinate(nums[i*3+1])
		if err != nil {
			return Curve{}, err
		}
		z, err := checkedCoordinate(nums[i*3+2])
		if err != nil {
			return Curve{}, err
		}
		pts[i] = Vec3{X: x, Y: y, Z: z}
	}
	return Curve{P0: pts[0], C1: pts[1], C2: pts[2], C3: pts[3], C4: pts[4], P5: pts[5]}, nil
}

// DecodeBurn is EncodeBurn's exact inverse. It fails with ErrInvalidBurn on
// every structural failure (not a map, a missing/mistyped key, a
// control-point count other than six, or a decoded curve length that
// disagrees with the length recomputed from the decoded control points —
// space-kinematics: "the decoded curve length is not bit-identical to the
// arc length recomputed from the decoded control points"). A non-finite or
// out-of-extent coordinate component fails with the pre-existing named
// ErrNonFiniteCoordinate/ErrCoordinateOutOfExtent instead.
func DecodeBurn(v any) (Burn, error) {
	m, ok := v.(map[string]any)
	if !ok {
		return Burn{}, ErrInvalidBurn
	}

	targetBodyId, ok := m["targetBodyId"].(string)
	if !ok {
		return Burn{}, ErrInvalidBurn
	}

	var target Target
	if targetBodyId != "" {
		target = Target{BodyId: targetBodyId}
	} else {
		tp, present := m["targetPoint"]
		if !present || tp == nil {
			return Burn{}, ErrInvalidBurn
		}
		point, err := decodeCoordField(tp, ErrInvalidBurn)
		if err != nil {
			return Burn{}, err
		}
		target = Target{Point: &point}
	}

	origin, err := decodeCoordField(m["origin"], ErrInvalidBurn)
	if err != nil {
		return Burn{}, err
	}
	intercept, err := decodeCoordField(m["intercept"], ErrInvalidBurn)
	if err != nil {
		return Burn{}, err
	}

	curve, err := decodeControlPoints(m["controlPoints"])
	if err != nil {
		return Burn{}, err
	}

	storedLength, ok := decodeNumber(m["curveLength"])
	if !ok {
		return Burn{}, ErrInvalidBurn
	}
	if recomputed := curve.Length(); recomputed != storedLength {
		return Burn{}, ErrInvalidBurn
	}

	departNum, ok := decodeNumber(m["departMs"])
	if !ok {
		return Burn{}, ErrInvalidBurn
	}
	arriveNum, ok := decodeNumber(m["arriveMs"])
	if !ok {
		return Burn{}, ErrInvalidBurn
	}
	accel, ok := decodeNumber(m["accel"])
	if !ok {
		return Burn{}, ErrInvalidBurn
	}
	insertionPhase, err := DecodeSubTurns(m["insertionPhase"])
	if err != nil {
		if errors.Is(err, errNotAVector) {
			return Burn{}, ErrInvalidBurn
		}
		return Burn{}, err
	}

	return Burn{
		Origin:         origin,
		Target:         target,
		Intercept:      intercept,
		Curve:          curve,
		Length:         storedLength,
		DepartMs:       common.WorldMillis(int64(departNum)),
		ArriveMs:       common.WorldMillis(int64(arriveNum)),
		Accel:          accel,
		InsertionPhase: insertionPhase,
	}, nil
}

// --- Park ------------------------------------------------------------------

// EncodePark writes a Park as the Firestore-native primitive map
// action.Params carries, with every field present (Park's own struct
// always carries every field; only the ones meaningful to Kind are
// populated).
func EncodePark(p Park) map[string]any {
	return map[string]any{
		"kind":     int64(p.Kind),
		"bodyId":   p.BodyId,
		"radius":   p.Radius,
		"periodMs": int64(p.PeriodMs),
		"phase":    EncodeSubTurns(p.Phase),
		"epochMs":  int64(p.EpochMs),
		"offset":   EncodeVec(p.Offset),
		"point":    EncodeVec(p.Point),
	}
}

// DecodePark is EncodePark's exact inverse. It fails with ErrInvalidPark on
// every structural failure: not a map, a missing/mistyped key, or a Kind
// outside the three documented values.
func DecodePark(v any) (Park, error) {
	m, ok := v.(map[string]any)
	if !ok {
		return Park{}, ErrInvalidPark
	}

	kindNum, ok := decodeNumber(m["kind"])
	if !ok {
		return Park{}, ErrInvalidPark
	}
	kind := ParkKind(int64(kindNum))
	if kind != ParkOrbit && kind != ParkStationkeep && kind != ParkPoint {
		return Park{}, ErrInvalidPark
	}

	bodyId, ok := m["bodyId"].(string)
	if !ok {
		return Park{}, ErrInvalidPark
	}
	radiusNum, ok := decodeNumber(m["radius"])
	if !ok {
		return Park{}, ErrInvalidPark
	}
	radius, err := checkedCoordinate(radiusNum)
	if err != nil {
		return Park{}, err
	}
	periodNum, ok := decodeNumber(m["periodMs"])
	if !ok {
		return Park{}, ErrInvalidPark
	}
	phase, err := DecodeSubTurns(m["phase"])
	if err != nil {
		if errors.Is(err, errNotAVector) {
			return Park{}, ErrInvalidPark
		}
		return Park{}, err
	}
	epochNum, ok := decodeNumber(m["epochMs"])
	if !ok {
		return Park{}, ErrInvalidPark
	}
	offset, err := decodeCoordField(m["offset"], ErrInvalidPark)
	if err != nil {
		return Park{}, err
	}
	point, err := decodeCoordField(m["point"], ErrInvalidPark)
	if err != nil {
		return Park{}, err
	}

	return Park{
		Kind:     kind,
		BodyId:   bodyId,
		Radius:   radius,
		PeriodMs: common.WorldMillis(int64(periodNum)),
		Phase:    phase,
		EpochMs:  common.WorldMillis(int64(epochNum)),
		Offset:   offset,
		Point:    point,
	}, nil
}

// --- Drift -----------------------------------------------------------------

// EncodeDrift writes a Drift as the Firestore-native primitive map
// action.Params carries.
func EncodeDrift(d Drift) map[string]any {
	return map[string]any{
		"anchor":   EncodeVec(d.Anchor),
		"velocity": EncodeVec(d.Velocity),
		"epochMs":  int64(d.EpochMs),
	}
}

// DecodeDrift is EncodeDrift's exact inverse. It fails with ErrInvalidDrift
// on every structural failure (not a map, a missing/mistyped key) OR when
// the decoded epoch is absent or non-positive — checked before any
// coordinate is decoded, so a rejected value never produces a
// partially-decoded drift with an implied zero epoch.
func DecodeDrift(v any) (Drift, error) {
	m, ok := v.(map[string]any)
	if !ok {
		return Drift{}, ErrInvalidDrift
	}

	epochNum, ok := decodeNumber(m["epochMs"])
	if !ok || epochNum <= 0 {
		return Drift{}, ErrInvalidDrift
	}

	anchor, err := decodeCoordField(m["anchor"], ErrInvalidDrift)
	if err != nil {
		return Drift{}, err
	}
	velocity, err := decodeCoordField(m["velocity"], ErrInvalidDrift)
	if err != nil {
		return Drift{}, err
	}

	return Drift{Anchor: anchor, Velocity: velocity, EpochMs: common.WorldMillis(int64(epochNum))}, nil
}
