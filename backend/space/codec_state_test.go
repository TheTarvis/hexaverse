package space

import (
	"errors"
	"math"
	"testing"

	"hexaverse/action"
	"hexaverse/common"

	"go.uber.org/mock/gomock"
)

// The test file for codec_state.go — the widened kinematic-state codec.
//
// RENAMED 2026-09-02 (SDET) from codec_kinematic_state_test.go, to
// codec_state_test.go: the repo's changed-file validator
// (.claude/scripts/check-backend-tests.sh) pairs a Go file with its tests by
// FILENAME, and reported codec_state.go as untested while its tests sat here
// and in codec_stationkeep_park_test.go. Resolved by renaming rather than by
// adding a stub — this file IS codec_state.go's test file, and the name now
// says so.
//
// space-kinematics MODIFIED: "Coordinates Cross the Persistence Boundary
// Through a Named Codec" — widened to a ship's whole kinematic state
// (design.md Decision 9; the widened codec is tasks.md 2.5).
//
// ============================================================================
// ASSUMED API CONTRACT — the widened codec (this handoff's own choice where
// design.md does not pin a literal Go signature; the []float64/int64 wire
// shapes for Vec3/SubTurns themselves are already pinned and unchanged,
// section 1)
// ============================================================================
//
// Control points encode as a FLAT []float64 of 18 numbers — 6 points * 3
// components, P0,C1,C2,C3,C4,P5 in that order — the flat-list option
// design.md's requirement text names as one of three acceptable shapes, and
// deliberately NOT [][]float64 (rejected outright by action.ErrNonPrimitiveParam,
// per design.md Decision 15 / the requirement's own "never [][]float64" clause).
//
//	func EncodeBurn(b Burn) map[string]any
//	func DecodeBurn(v any) (Burn, error)
//
// EncodeBurn's map carries (all Firestore/JSON-native primitives, recursively
// validated by action's existing allowlist):
//
//	"origin"          []float64        (EncodeVec)
//	"targetBodyId"    string           ("" when the target is an explicit point)
//	"targetPoint"     []float64 or nil (nil when the target is a body)
//	"intercept"       []float64        (EncodeVec)
//	"controlPoints"   []float64        (len 18, flat, P0..P5 x,y,z order)
//	"curveLength"     float64
//	"departMs"        int64
//	"arriveMs"        int64
//	"accel"           float64
//	"insertionPhase"  int64            (EncodeSubTurns)
//
// DecodeBurn fails with ErrInvalidBurn for every STRUCTURAL failure (not a
// map, missing/mistyped key, a control-point list whose length isn't
// exactly 18, a decoded curve length that disagrees with the recomputed arc
// length) — mirroring DecodeOrbit's existing ErrInvalidOrbit/checkedCoordinate
// split (params.go). A non-finite/out-of-extent COMPONENT within origin,
// intercept, or a control point fails with the pre-existing
// ErrNonFiniteCoordinate/ErrCoordinateOutOfExtent instead (the codec's
// existing named component-level errors, unchanged).
//
//	var ErrInvalidBurn error
//
// Park (any of its three kinds) encodes/decodes with all fields present
// (Park's own struct always carries every field; only the ones meaningful to
// Kind are populated) and a structural failure (not a map, unknown/missing
// "kind") fails with ErrInvalidPark:
//
//	func EncodePark(p Park) map[string]any
//	func DecodePark(v any) (Park, error)
//	var ErrInvalidPark error
//
// Drift encodes/decodes anchor, velocity, epoch; a structural failure (not a
// map, missing "epochMs") OR an absent/non-positive epoch fails with
// ErrInvalidDrift — "the same named error" the MODIFIED requirement text
// calls for, read as this codec's own structural-decode-failure sentinel,
// mirroring the Burn/Park split above:
//
//	func EncodeDrift(d Drift) map[string]any
//	func DecodeDrift(v any) (Drift, error)
//	var ErrInvalidDrift error
//
// ============================================================================

// --- fixtures ----------------------------------------------------------

func solvedBodyBurnFixture(t *testing.T) Burn {
	t.Helper()
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	return result.Burn
}

func solvedPointBurnFixture(t *testing.T) Burn {
	t.Helper()
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 0, Y: 0, Z: 0}, pointTarget(Vec3{X: 300, Y: 10, Z: -40}), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	return result.Burn
}

// --- Scenario: A solved burn round-trips exactly through the codec -----

func TestCodec_Scenario_SolvedBodyTargetedBurnRoundTripsExactly(t *testing.T) {
	want := solvedBodyBurnFixture(t)

	encoded := EncodeBurn(want)
	got, err := DecodeBurn(encoded)
	requireNoError(t, err)

	if got.Origin != want.Origin {
		t.Errorf("Origin: got %v, want %v", got.Origin, want.Origin)
	}
	if got.Target != want.Target {
		t.Errorf("Target: got %+v, want %+v", got.Target, want.Target)
	}
	if got.Intercept != want.Intercept {
		t.Errorf("Intercept: got %v, want %v", got.Intercept, want.Intercept)
	}
	if got.Curve != want.Curve {
		t.Errorf("Curve: got %+v, want %+v", got.Curve, want.Curve)
	}
	if got.Length != want.Length {
		t.Errorf("Length: got %v, want %v", got.Length, want.Length)
	}
	if got.DepartMs != want.DepartMs {
		t.Errorf("DepartMs: got %d, want %d", got.DepartMs, want.DepartMs)
	}
	if got.ArriveMs != want.ArriveMs {
		t.Errorf("ArriveMs: got %d, want %d", got.ArriveMs, want.ArriveMs)
	}
	if got.Accel != want.Accel {
		t.Errorf("Accel: got %v, want %v", got.Accel, want.Accel)
	}
	if got.InsertionPhase != want.InsertionPhase {
		t.Errorf("InsertionPhase: got %d, want %d", got.InsertionPhase, want.InsertionPhase)
	}
}

// SDET-added companion: an explicit-point target burn (Target.Point set,
// Target.BodyId empty, InsertionPhase meaningless/zero) round-trips exactly
// too — the codec's target-identity-or-point branch is exercised both ways.
func TestCodec_Scenario_SolvedPointTargetedBurnRoundTripsExactly(t *testing.T) {
	want := solvedPointBurnFixture(t)

	encoded := EncodeBurn(want)
	got, err := DecodeBurn(encoded)
	requireNoError(t, err)

	if got.Target.BodyId != "" {
		t.Errorf("Target.BodyId = %q, want empty (a point target)", got.Target.BodyId)
	}
	if got.Target.Point == nil || *got.Target.Point != *want.Target.Point {
		t.Errorf("Target.Point = %v, want %v", got.Target.Point, want.Target.Point)
	}
	if got.Intercept != want.Intercept {
		t.Errorf("Intercept: got %v, want %v", got.Intercept, want.Intercept)
	}
	if got.Curve != want.Curve {
		t.Errorf("Curve: got %+v, want %+v", got.Curve, want.Curve)
	}
	if got.Length != want.Length {
		t.Errorf("Length: got %v, want %v", got.Length, want.Length)
	}
	if got.DepartMs != want.DepartMs || got.ArriveMs != want.ArriveMs {
		t.Errorf("timing: got depart=%d arrive=%d, want depart=%d arrive=%d", got.DepartMs, got.ArriveMs, want.DepartMs, want.ArriveMs)
	}
	if got.Accel != want.Accel {
		t.Errorf("Accel: got %v, want %v", got.Accel, want.Accel)
	}
}

// --- Scenario: Every park kind and a drift round-trip exactly ----------

func TestCodec_Scenario_EveryParkKindRoundTripsExactly(t *testing.T) {
	cases := map[string]Park{
		"orbit": {
			Kind: ParkOrbit, BodyId: "planet1", Radius: 12.5,
			PeriodMs: 45_000, Phase: SubTurns(1000), EpochMs: 7_000,
		},
		// REVISED for add-stationkeep-hold-verb (cause: spec change —
		// space-kinematics MODIFIED "Coordinates Cross the Persistence
		// Boundary Through a Named Codec", whose scenario "Every park kind
		// and a drift round-trip exactly through the codec" now reads
		// "including — for a `stationkeep` park — its stored hold-start time
		// and dry instant"). A stationkeep park with NO hold window no
		// longer round-trips at all: the same requirement's own decode rule
		// rejects a dry instant that is not strictly after its hold start,
		// which zero/zero is not. See codec_stationkeep_park_test.go.
		"stationkeep": {
			Kind: ParkStationkeep, BodyId: "moon1",
			Offset:      Vec3{X: 1.5, Y: 0, Z: -2.5},
			HoldStartMs: common.WorldMillis(12_000), DryInstantMs: common.WorldMillis(98_765),
		},
		"point": {
			Kind: ParkPoint, Point: Vec3{X: -300, Y: 12, Z: 88},
		},
	}
	for name, want := range cases {
		t.Run(name, func(t *testing.T) {
			encoded := EncodePark(want)
			got, err := DecodePark(encoded)
			requireNoError(t, err)
			if got != want {
				t.Fatalf("DecodePark(EncodePark(%+v)) = %+v, want the identical park", want, got)
			}
		})
	}
}

func TestCodec_Scenario_DriftRoundTripsExactly(t *testing.T) {
	want := Drift{
		Anchor:   Vec3{X: 12.5, Y: -3.25, Z: 999.125},
		Velocity: Vec3{X: 1.5, Y: 0, Z: -0.75},
		EpochMs:  common.WorldMillis(1_700_000_000_000),
	}
	encoded := EncodeDrift(want)
	got, err := DecodeDrift(encoded)
	requireNoError(t, err)
	if got != want {
		t.Fatalf("DecodeDrift(EncodeDrift(%+v)) = %+v, want the identical drift", want, got)
	}
}

// SDET-added boundary probe: an unrecognized Park kind fails structurally,
// with the codec's own named park-decode-failure — rounding out the three
// codec families (Burn/Park/Drift) to each have at least one structural
// negative case, mirroring DecodeOrbit's existing ErrInvalidOrbit coverage.
func TestCodec_Park_UnknownKindFailsByName(t *testing.T) {
	encoded := map[string]any{
		"kind":     int64(99), // not one of the three documented ParkKind values
		"bodyId":   "planet1",
		"radius":   10.0,
		"periodMs": int64(1000),
		"phase":    int64(0),
		"epochMs":  int64(0),
		"offset":   EncodeVec(Vec3{}),
		"point":    EncodeVec(Vec3{}),
	}
	_, err := DecodePark(encoded)
	if !errors.Is(err, ErrInvalidPark) {
		t.Fatalf("err = %v, want errors.Is(err, ErrInvalidPark)", err)
	}
}

// --- Scenario: The wrong number of control-point components fails by name

func TestCodec_Scenario_WrongControlPointCountFailsByName(t *testing.T) {
	b := solvedBodyBurnFixture(t)
	encoded := EncodeBurn(b)

	cp, ok := encoded["controlPoints"].([]float64)
	if !ok || len(cp) != 18 {
		t.Fatalf("test fixture error: encoded controlPoints = %v (%T), want an 18-element []float64", encoded["controlPoints"], encoded["controlPoints"])
	}

	t.Run("too few", func(t *testing.T) {
		tampered := cloneMap(encoded)
		tampered["controlPoints"] = cp[:15] // 5 points instead of 6
		_, err := DecodeBurn(tampered)
		if !errors.Is(err, ErrInvalidBurn) {
			t.Fatalf("err = %v, want errors.Is(err, ErrInvalidBurn)", err)
		}
	})
	t.Run("too many", func(t *testing.T) {
		tampered := cloneMap(encoded)
		tampered["controlPoints"] = append(append([]float64{}, cp...), 0, 0, 0) // 7 points
		_, err := DecodeBurn(tampered)
		if !errors.Is(err, ErrInvalidBurn) {
			t.Fatalf("err = %v, want errors.Is(err, ErrInvalidBurn)", err)
		}
	})
}

// --- Scenario: A stored curve length disagreeing with the recomputed arc
// length fails by name -------------------------------------------------

func TestCodec_Scenario_DisagreeingCurveLengthFailsByName(t *testing.T) {
	b := solvedBodyBurnFixture(t)
	encoded := EncodeBurn(b)
	tampered := cloneMap(encoded)

	storedLength, ok := tampered["curveLength"].(float64)
	if !ok {
		t.Fatalf("test fixture error: encoded curveLength = %v (%T), want float64", tampered["curveLength"], tampered["curveLength"])
	}
	tampered["curveLength"] = storedLength + 1.0 // finite, in-extent, simply wrong

	_, err := DecodeBurn(tampered)
	if !errors.Is(err, ErrInvalidBurn) {
		t.Fatalf("err = %v, want errors.Is(err, ErrInvalidBurn) (disagreeing curve length)", err)
	}
}

// --- Scenario: A non-finite component within a burn's control points
// fails by the existing named error --------------------------------------

func TestCodec_Scenario_NonFiniteControlPointComponentFailsByExistingNamedError(t *testing.T) {
	b := solvedBodyBurnFixture(t)
	encoded := EncodeBurn(b)
	tampered := cloneMap(encoded)

	cp, ok := tampered["controlPoints"].([]float64)
	if !ok || len(cp) != 18 {
		t.Fatalf("test fixture error: encoded controlPoints = %v (%T)", tampered["controlPoints"], tampered["controlPoints"])
	}
	poisoned := append([]float64{}, cp...)
	poisoned[4] = math.NaN() // second component of C1
	tampered["controlPoints"] = poisoned

	_, err := DecodeBurn(tampered)
	if !errors.Is(err, ErrNonFiniteCoordinate) {
		t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate) (the pre-existing named coordinate error, not a new one)", err)
	}
}

// --- Scenario: A drift with an absent or non-positive epoch fails to
// decode ------------------------------------------------------------------

func TestCodec_Scenario_DriftAbsentOrNonPositiveEpochFailsToDecode(t *testing.T) {
	base := Drift{Anchor: Vec3{X: 1, Y: 2, Z: 3}, Velocity: Vec3{X: 0, Y: 0, Z: 0}, EpochMs: 100}
	encoded := EncodeDrift(base)

	t.Run("absent", func(t *testing.T) {
		tampered := cloneMap(encoded)
		delete(tampered, "epochMs")
		_, err := DecodeDrift(tampered)
		if !errors.Is(err, ErrInvalidDrift) {
			t.Fatalf("err = %v, want errors.Is(err, ErrInvalidDrift) (absent epoch)", err)
		}
	})
	t.Run("zero", func(t *testing.T) {
		tampered := cloneMap(encoded)
		tampered["epochMs"] = int64(0)
		_, err := DecodeDrift(tampered)
		if !errors.Is(err, ErrInvalidDrift) {
			t.Fatalf("err = %v, want errors.Is(err, ErrInvalidDrift) (zero epoch)", err)
		}
	})
	t.Run("negative", func(t *testing.T) {
		tampered := cloneMap(encoded)
		tampered["epochMs"] = int64(-1)
		_, err := DecodeDrift(tampered)
		if !errors.Is(err, ErrInvalidDrift) {
			t.Fatalf("err = %v, want errors.Is(err, ErrInvalidDrift) (negative epoch)", err)
		}
	})
	t.Run("positive epoch decodes fine (control)", func(t *testing.T) {
		got, err := DecodeDrift(encoded)
		requireNoError(t, err)
		if got != base {
			t.Fatalf("control case: got %+v, want %+v", got, base)
		}
	})
}

// --- Scenario (SDET-added, the trap design.md itself names): a missing
// epoch resolves to zero, which sits INSIDE coordinateExtent and would
// otherwise pass every other check silently. This is the exact regression
// design.md warns about; it is deliberately a second, more pointed
// assertion than the "absent" subtest above (which only checks the error
// identity), confirming no drift is ever produced on this path at all. ---

func TestCodec_Scenario_MissingEpochNeverProducesAZeroEpochDrift(t *testing.T) {
	encoded := map[string]any{
		"anchor":   EncodeVec(Vec3{X: 10, Y: 0, Z: 0}),
		"velocity": EncodeVec(Vec3{X: 1, Y: 0, Z: 0}),
		// "epochMs" deliberately omitted
	}
	got, err := DecodeDrift(encoded)
	if !errors.Is(err, ErrInvalidDrift) {
		t.Fatalf("err = %v, want errors.Is(err, ErrInvalidDrift)", err)
	}
	if got != (Drift{}) {
		t.Errorf("DecodeDrift on a rejected value returned %+v, want the zero Drift (never a partially-decoded value with an implied zero epoch)", got)
	}
}

// --- Scenario: the encoding is NOT [][]float64 (the action spine's
// ErrNonPrimitiveParam rejects that shape) -------------------------------

// SDET-added, mirroring params_test.go's own
// TestCommit_Scenario_EncodedVecInParamsCommitsNormally pattern exactly:
// proves the widened codec's control-point encoding survives a REAL
// action.Commit call through the unmodified action-spine validator, which is
// the only assertion that actually exercises "the action spine's
// ErrNonPrimitiveParam validation rejects [][]float64" — checking the Go
// type of EncodeBurn's output alone would not prove the validator accepts
// it.
func TestCommit_Scenario_EncodedBurnInParamsCommitsNormally(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := action.NewMockDao(ctrl)
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).Times(1)

	svc := action.NewServiceWith(dao, testClock(), nil)
	svc.RegisterResolver("burn", action.KindKinematic, noopResolver)

	b := solvedBodyBurnFixture(t)
	_, err := svc.Commit(t.Context(), action.CommitSpec{
		Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params: map[string]interface{}{"burn": EncodeBurn(b)},
		Eta:    1000,
	})
	requireNoError(t, err)
}

// SDET-added: the literal negative control this scenario exists to guard —
// a hand-built [][]float64 IS rejected by the unchanged validator, so the
// codec's choice to avoid that shape is not a no-op.
func TestCommit_Scenario_BareSliceOfSlicesControlPointsIsRejected(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := action.NewMockDao(ctrl)
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Times(0)

	svc := action.NewServiceWith(dao, testClock(), nil)
	svc.RegisterResolver("burn", action.KindKinematic, noopResolver)

	badShape := [][]float64{{0, 0, 0}, {1, 1, 1}}
	_, err := svc.Commit(t.Context(), action.CommitSpec{
		Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params: map[string]interface{}{"controlPoints": badShape},
		Eta:    1000,
	})
	if !errors.Is(err, action.ErrNonPrimitiveParam) {
		t.Fatalf("err = %v, want errors.Is(err, action.ErrNonPrimitiveParam) — [][]float64 must stay rejected", err)
	}
}

// --- helpers -------------------------------------------------------------

func cloneMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
