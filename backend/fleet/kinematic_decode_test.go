package fleet

// RED-phase tests for tasks.md 3.6 — every stored kinematic-state value is
// validated through the `space` codec at every boundary that reads
// persisted or committed coordinate data; a decode failure surfaces as a
// named, countable error carrying `cause` (one of `non-finite-coordinate`,
// `coordinate-out-of-extent`, `undecodable-shape`, `unknown-body`) plus
// `actionType`/the action id when decoding an action parameter — never a
// panic, never a default to an implied origin park (fleet-movement:
// "Single Kinematic-State Fleet Record" — "a fleet with no stored
// kinematic state is rejected by name"; "Undecodable Stored Kinematic
// State Is Rejected, Never Panicked").
//
// CONTRACT this file assumes (documented since nothing pins these names
// elsewhere): a package-level `fleet.DecodeKinematicState(bodies
// space.Bodies, doc map[string]any, actionType, actionId string)
// (space.ShipState, error)` — the shared decode+validate primitive both the
// fleet document boundary (an "actionType"-less call) and an action-param
// decode (a populated actionType/actionId call) route through — and a
// `fleet.KinematicDecodeError` type exposing `Cause fleet.DecodeCause`,
// `ActionType string`, `ActionId string`, retrievable via `errors.As` and
// matching `errors.Is(err, fleet.ErrKinematicDecode)`. The wire `doc` shape
// is this SDET's own choice: `{"mode": "burn"|"park"|"drift", "value":
// <space.EncodeBurn/EncodePark/EncodeDrift output>}` — a discriminated
// union, mirroring how `system.Feature`'s own SpaceDoc crosses the
// boundary. `fleet.DecodeCause` values are exported string constants
// (`fleet.CauseNonFiniteCoordinate` etc.) equal to the four cause strings
// the spec names verbatim, checked directly in these tests. A developer
// converging on different names/shapes should raise it as a dispute, not
// silently diverge.
//
// This file reuses coordinate_guard_test.go's captureLog/runRecovered
// helpers (already declared in this package by that pre-existing file) —
// redeclaring them here would not compile.

import (
	"errors"
	"math"
	"strings"
	"testing"

	"hexaverse/space"
)

// noBodies is a space.Bodies fake that resolves nothing — used for decode
// cases that never need a body lookup (a point-targeted burn, an explicit
// point park, a drift).
type noBodies struct{}

func (noBodies) Body(string) (space.Body, bool) { return space.Body{}, false }

// oneBody is a space.Bodies fake resolving exactly one known id.
type oneBody struct {
	id string
	b  space.Body
}

func (o oneBody) Body(id string) (space.Body, bool) {
	if id == o.id {
		return o.b, true
	}
	return space.Body{}, false
}

func burnDoc(b space.Burn) map[string]any {
	return map[string]any{"mode": "burn", "value": space.EncodeBurn(b)}
}

func parkDoc(p space.Park) map[string]any {
	return map[string]any{"mode": "park", "value": space.EncodePark(p)}
}

func driftDoc(d space.Drift) map[string]any {
	return map[string]any{"mode": "drift", "value": space.EncodeDrift(d)}
}

func validPointBurn() space.Burn {
	// Length is set from the curve's OWN recomputed arc length, not a
	// hand-picked literal — DecodeBurn rejects any stored length that
	// disagrees with the length recomputed from the decoded control points
	// (space-kinematics: "a disagreeing stored curve length fails by
	// name"), so an internally-inconsistent fixture would make every
	// "valid burn" test fail for the wrong reason.
	curve := space.Curve{P5: space.Vec3{X: 100}}
	return space.Burn{
		Origin: space.Vec3{}, Target: space.Target{Point: &space.Vec3{X: 100}},
		Intercept: space.Vec3{X: 100}, Curve: curve, Length: curve.Length(),
		Accel: 8, DepartMs: 0, ArriveMs: 100_000,
	}
}

// --- round trips -------------------------------------------------------

func TestDecodeKinematicState_Scenario_ValidBurnRoundTrips(t *testing.T) {
	b := validPointBurn()
	got, err := DecodeKinematicState(noBodies{}, burnDoc(b), "", "")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Mode != space.ModeBurn || got.Burn == nil || got.Burn.ArriveMs != b.ArriveMs {
		t.Fatalf("decoded state = %+v, want a burn matching the encoded input", got)
	}
}

func TestDecodeKinematicState_Scenario_ValidParkRoundTrips(t *testing.T) {
	p := space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 5, Y: 0, Z: 5}}
	got, err := DecodeKinematicState(noBodies{}, parkDoc(p), "", "")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Mode != space.ModeParked || got.Park == nil || got.Park.Point != p.Point {
		t.Fatalf("decoded state = %+v, want a point park matching the encoded input", got)
	}
}

func TestDecodeKinematicState_Scenario_ValidDriftRoundTrips(t *testing.T) {
	d := space.Drift{Anchor: space.Vec3{X: 1}, Velocity: space.Vec3{X: 2}, EpochMs: 10}
	got, err := DecodeKinematicState(noBodies{}, driftDoc(d), "", "")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Mode != space.ModeDrift || got.Drift == nil || got.Drift.EpochMs != d.EpochMs {
		t.Fatalf("decoded state = %+v, want a drift matching the encoded input", got)
	}
}

// Scenario: A fleet with no stored kinematic state is rejected by name.
func TestDecodeKinematicState_Scenario_NoStoredStateRejectedByName(t *testing.T) {
	_, err := DecodeKinematicState(noBodies{}, map[string]any{}, "", "")
	if err == nil {
		t.Fatal("decode of an empty document succeeded — want a named rejection")
	}
	if !errors.Is(err, ErrKinematicDecode) {
		t.Fatalf("err = %v, want it to match ErrKinematicDecode by name (errors.Is)", err)
	}
}

// Scenario: A fleet's stored kinematic state fails to decode — never a
// panic, never a default to an implied origin park.
func TestDecodeKinematicState_Scenario_NeverPanicsOnGarbageInput(t *testing.T) {
	garbageInputs := []map[string]any{
		nil,
		{"mode": "burn", "value": "not-a-map"},
		{"mode": "park", "value": 12345},
		{"mode": "drift", "value": []any{1, 2, 3}},
		{"mode": 999, "value": nil},
		{"mode": "burn"}, // missing value entirely
	}
	for i, doc := range garbageInputs {
		panicked := runRecovered(t, func() {
			state, err := DecodeKinematicState(noBodies{}, doc, "", "")
			if err == nil {
				t.Errorf("case %d: garbage input decoded successfully as %+v, want a named rejection", i, state)
			}
			if err != nil && (state.Burn != nil || state.Park != nil || state.Drift != nil) {
				t.Errorf("case %d: a rejected decode returned a non-nil shape %+v — must never default to an implied park", i, state)
			}
		})
		if panicked != nil {
			t.Fatalf("case %d: DecodeKinematicState panicked on garbage input: %v", i, panicked)
		}
	}
}

// Scenario: A decoded action parameter coordinate fails the codec — cause
// non-finite-coordinate, on a burn's intercept.
func TestDecodeKinematicState_Scenario_NonFiniteCoordinateCause(t *testing.T) {
	doc := burnDoc(validPointBurn())
	// Corrupt the already-encoded intercept in place — simulating a stored
	// value that was fine at write time and corrupted (or hand-edited)
	// afterward, never a value this package's own encoder would produce.
	value := doc["value"].(map[string]any)
	value["intercept"] = []float64{math.NaN(), 0, 0}

	_, err := DecodeKinematicState(noBodies{}, doc, "", "")
	assertDecodeCause(t, err, CauseNonFiniteCoordinate)
}

// Scenario: A decoded action parameter coordinate fails the codec — cause
// coordinate-out-of-extent.
func TestDecodeKinematicState_Scenario_CoordinateOutOfExtentCause(t *testing.T) {
	doc := driftDoc(space.Drift{Anchor: space.Vec3{X: 1}, Velocity: space.Vec3{X: 1}, EpochMs: 10})
	value := doc["value"].(map[string]any)
	value["anchor"] = []float64{2e12, 0, 0} // beyond space's configured coordinateExtent (1e12)

	_, err := DecodeKinematicState(noBodies{}, doc, "", "")
	assertDecodeCause(t, err, CauseCoordinateOutOfExtent)
}

// Scenario: An unrecognized mode / malformed shape fails structurally —
// cause undecodable-shape.
func TestDecodeKinematicState_Scenario_UndecodableShapeCause(t *testing.T) {
	_, err := DecodeKinematicState(noBodies{}, map[string]any{"mode": "wormhole", "value": map[string]any{}}, "", "")
	assertDecodeCause(t, err, CauseUndecodableShape)
}

// Scenario: A park referencing a body id absent from the system's
// BodyTable fails — cause unknown-body. This is the fourth named cause,
// and it is NOT one of space's own structural decode failures (DecodeBurn/
// DecodePark never call into Bodies) — it is this shared guard's own
// cross-check against the injected table, per design.md Decision 16's
// "every stored kinematic-state value validated ... at every boundary".
func TestDecodeKinematicState_Scenario_UnknownBodyCause(t *testing.T) {
	doc := parkDoc(space.Park{Kind: space.ParkOrbit, BodyId: "feat-does-not-exist", Radius: 10, PeriodMs: 1000})
	_, err := DecodeKinematicState(oneBody{id: "feat-star", b: space.Body{Id: "feat-star", Size: 6}}, doc, "", "")
	assertDecodeCause(t, err, CauseUnknownBody)
}

// Scenario: A decoded action parameter coordinate fails the codec — the
// action-context form carries actionType and the action id.
func TestDecodeKinematicState_Scenario_ActionParamDecodeCarriesActionContext(t *testing.T) {
	doc := map[string]any{"mode": "wormhole", "value": map[string]any{}}
	_, err := DecodeKinematicState(noBodies{}, doc, "burn", "action_123")

	var kde *KinematicDecodeError
	if !errors.As(err, &kde) {
		t.Fatalf("err = %v (%T), want *KinematicDecodeError via errors.As", err, err)
	}
	if kde.ActionType != "burn" || kde.ActionId != "action_123" {
		t.Fatalf("KinematicDecodeError = %+v, want ActionType=burn ActionId=action_123", kde)
	}
}

// Scenario: Coordinate rejections are countable per cause — a fleet-read
// (non-action) decode logs its cause but never an actionType/action id;
// mirrors the pre-existing coordinate_guard_test.go convention exactly
// (same log-capture helper, same "must not carry actionType" assertion
// for the no-action-context case).
func TestDecodeKinematicState_Scenario_FleetReadRejectionLogsWithCauseNoActionContext(t *testing.T) {
	logged := captureLog(t, func() {
		_, _ = DecodeKinematicState(noBodies{}, map[string]any{}, "", "")
	})
	if !strings.Contains(logged, string(CauseUndecodableShape)) {
		t.Errorf("captured log does not carry cause=%s: %q", CauseUndecodableShape, logged)
	}
	if strings.Contains(logged, "actionType") {
		t.Errorf("a fleet-read rejection (no action context) must not log actionType: %q", logged)
	}
}

func TestDecodeKinematicState_Scenario_ActionParamRejectionLogsActionTypeAndId(t *testing.T) {
	logged := captureLog(t, func() {
		_, _ = DecodeKinematicState(noBodies{}, map[string]any{}, "burn", "action_42")
	})
	if !strings.Contains(logged, "actionType") || !strings.Contains(logged, "burn") {
		t.Errorf("captured log does not carry actionType=burn: %q", logged)
	}
	if !strings.Contains(logged, "action_42") {
		t.Errorf("captured log does not carry the action id: %q", logged)
	}
}

func assertDecodeCause(t *testing.T, err error, want DecodeCause) {
	t.Helper()
	var kde *KinematicDecodeError
	if !errors.As(err, &kde) {
		t.Fatalf("err = %v (%T), want *KinematicDecodeError via errors.As", err, err)
	}
	if kde.Cause != want {
		t.Fatalf("cause = %q, want %q", kde.Cause, want)
	}
	if !errors.Is(err, ErrKinematicDecode) {
		t.Fatalf("err does not match ErrKinematicDecode by errors.Is: %v", err)
	}
}
