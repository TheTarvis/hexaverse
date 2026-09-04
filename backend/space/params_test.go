package space

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/common"

	"go.uber.org/mock/gomock"
)

// space-kinematics: "Coordinates Cross the Persistence Boundary Through a
// Named Codec" (design.md Decision 4 — the []float64/int64 wire shapes are
// pinned by the design text, not an SDET choice).
//
// The "bare domain vector is rejected by the action spine's existing
// validation" scenario is deliberately an integration test against the REAL
// hexaverse/action package (not a mock of it) — the requirement's own text
// is "unchanged by this capability", i.e. this suite is pinning that a
// pre-existing, already-tested behavior of a DIFFERENT package extends
// correctly to this new domain type once it exists, mirroring
// backend/action/commit_params_validator_test.go's own
// TestCommit_Scenario_DomainStructInParamsIsRejected pattern exactly, with
// space.Vec3 as the rejected domain struct. It uses action.NewServiceWith +
// a real common.WorldTime (frozen scale) + action's own generated MockDao,
// never action's private test-only fakeClock.

func testClock() common.WorldTime {
	return common.NewWorldTime(time.Unix(0, 0), 1)
}

func noopResolver(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
	return action.ResolveResult{}, nil
}

// Scenario: A position encodes to storage-native primitives and decodes
// back exactly.
func TestCodec_Scenario_VecRoundTripsThroughEncodeDecode(t *testing.T) {
	want := Vec3{X: 12.5, Y: -3.25, Z: 999.125}
	encoded := EncodeVec(want)

	// The wire shape design.md Decision 4 pins literally: []float64{x, y, z}.
	if len(encoded) != 3 {
		t.Fatalf("EncodeVec(%v) = %v, want a 3-element []float64", want, encoded)
	}
	if encoded[0] != want.X || encoded[1] != want.Y || encoded[2] != want.Z {
		t.Fatalf("EncodeVec(%v) = %v, want [X Y Z] in order", want, encoded)
	}

	got, err := DecodeVec(encoded)
	requireNoError(t, err)
	if got != want {
		t.Fatalf("DecodeVec(EncodeVec(%v)) = %v, want the identical vector", want, got)
	}
}

// SDET-added: DecodeVec must accept the shapes a Firestore round trip and a
// JSON HTTP body decode actually produce, not only the in-memory []float64
// EncodeVec itself returns. An in-memory literal, a Firestore
// []interface{}, and a JSON []interface{} of float64s are three different
// shapes for the same logical value, and the decoder must take all three.
func TestCodec_DecodeVec_AcceptsFirestoreAndJSONShapes(t *testing.T) {
	want := Vec3{X: 1, Y: 2, Z: 3}
	cases := map[string]any{
		"[]float64":     []float64{1, 2, 3},
		"[]interface{}": []interface{}{1.0, 2.0, 3.0},
		"[]any(int64)":  []any{int64(1), int64(2), int64(3)},
	}
	for name, v := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := DecodeVec(v)
			requireNoError(t, err)
			if got != want {
				t.Errorf("DecodeVec(%v) = %v, want %v", v, got, want)
			}
		})
	}
}

// Scenario: A coordinate decoding to a non-finite or out-of-extent value
// fails by name, not silently.
func TestCodec_Scenario_NonFiniteOrOutOfExtentFailsNamed(t *testing.T) {
	t.Run("NaN", func(t *testing.T) {
		_, err := DecodeVec([]float64{math.NaN(), 0, 0})
		if !errors.Is(err, ErrNonFiniteCoordinate) {
			t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate)", err)
		}
	})
	t.Run("positive infinity", func(t *testing.T) {
		_, err := DecodeVec([]float64{math.Inf(1), 0, 0})
		if !errors.Is(err, ErrNonFiniteCoordinate) {
			t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate)", err)
		}
	})
	t.Run("negative infinity", func(t *testing.T) {
		_, err := DecodeVec([]float64{0, math.Inf(-1), 0})
		if !errors.Is(err, ErrNonFiniteCoordinate) {
			t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate)", err)
		}
	})
	t.Run("beyond configured extent", func(t *testing.T) {
		_, err := DecodeVec([]float64{0, 0, math.MaxFloat64})
		if !errors.Is(err, ErrCoordinateOutOfExtent) {
			t.Fatalf("err = %v, want errors.Is(err, ErrCoordinateOutOfExtent)", err)
		}
	})
	// No computation must ever run on a rejected value — cheaply checked
	// here as "the returned vector is the zero value", since a real
	// downstream computation (e.g. Length()) on a poisoned NaN/Inf vector
	// would itself return NaN/Inf and silently propagate.
	t.Run("no zero-value leak past the error", func(t *testing.T) {
		got, err := DecodeVec([]float64{math.NaN(), 0, 0})
		if err == nil {
			t.Fatal("expected an error")
		}
		if got != (Vec3{}) {
			t.Errorf("DecodeVec on a rejected value returned %v, want the zero Vec3 (never a partially-decoded value a caller might use)", got)
		}
	})
}

// Scenario: A bare domain vector is rejected by the action spine's existing
// non-primitive-parameter validation, unchanged by this capability.
func TestCommit_Scenario_BareSpaceVectorInParamsIsRejected(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := action.NewMockDao(ctrl)
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Times(0)

	svc := action.NewServiceWith(dao, testClock(), nil)
	svc.RegisterResolver("burn", action.KindKinematic, noopResolver)

	_, err := svc.Commit(context.Background(), action.CommitSpec{
		Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params: map[string]interface{}{"origin": Vec3{X: 1, Y: 2, Z: 3}},
		Eta:    1000,
	})
	if !errors.Is(err, action.ErrNonPrimitiveParam) {
		t.Fatalf("err = %v, want errors.Is(err, action.ErrNonPrimitiveParam)", err)
	}
}

// SDET-added companion: the ENCODED form (what EncodeVec actually produces)
// must commit normally through the same, unchanged validator — the positive
// side of "encodes to a list of storage-native numeric primitives that the
// action spine's existing parameter validator accepts".
func TestCommit_Scenario_EncodedVecInParamsCommitsNormally(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := action.NewMockDao(ctrl)
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).Times(1)

	svc := action.NewServiceWith(dao, testClock(), nil)
	svc.RegisterResolver("burn", action.KindKinematic, noopResolver)

	_, err := svc.Commit(context.Background(), action.CommitSpec{
		Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params: map[string]interface{}{"origin": EncodeVec(Vec3{X: 1, Y: 2, Z: 3}), "phase": EncodeSubTurns(12345)},
		Eta:    1000,
	})
	requireNoError(t, err)
}

// --- SDET-added: closing a coverage gap found independent of file naming ---
//
// QA's independent coverage pass (go test -cover) found DecodeSubTurns at
// 0%: EncodeSubTurns is exercised above, but the value is never decoded
// back, so its non-finite/shape-handling was entirely untested, unlike
// DecodeVec above. These tests mirror DecodeVec's own round-trip and
// shape/finite coverage for the angle half of the same codec.

// Scenario: An angle encodes to a storage-native primitive and decodes
// back exactly.
func TestCodec_Scenario_SubTurnsRoundTripsThroughEncodeDecode(t *testing.T) {
	want := SubTurns(123456)
	encoded := EncodeSubTurns(want)
	if encoded != int64(want) {
		t.Fatalf("EncodeSubTurns(%d) = %d, want the identical int64 value", want, encoded)
	}
	got, err := DecodeSubTurns(encoded)
	requireNoError(t, err)
	if got != want {
		t.Fatalf("DecodeSubTurns(EncodeSubTurns(%d)) = %d, want the identical angle", want, got)
	}
}

// SDET-added: DecodeSubTurns must accept every numeric shape its own doc
// comment names — an in-memory int, a Firestore int64, and a JSON
// float64 — mirroring DecodeVec's own shape coverage above.
func TestCodec_DecodeSubTurns_AcceptsInMemoryAndJSONShapes(t *testing.T) {
	want := SubTurns(777)
	cases := map[string]any{
		"int":     int(777),
		"int64":   int64(777),
		"float64": float64(777),
	}
	for name, v := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := DecodeSubTurns(v)
			requireNoError(t, err)
			if got != want {
				t.Errorf("DecodeSubTurns(%v) = %d, want %d", v, got, want)
			}
		})
	}
}

// SDET-added boundary probe: a negative angle round-trips exactly — the
// codec must not assume angles are non-negative before wrapping.
func TestCodec_DecodeSubTurns_NegativeValueRoundTrips(t *testing.T) {
	want := SubTurns(-42)
	got, err := DecodeSubTurns(EncodeSubTurns(want))
	requireNoError(t, err)
	if got != want {
		t.Fatalf("DecodeSubTurns(EncodeSubTurns(%d)) = %d, want %d", want, got, want)
	}
}

// SDET-added boundary probe: DecodeSubTurns's float64 branch truncates
// toward zero (SubTurns(int64(n))), in both directions.
func TestCodec_DecodeSubTurns_FloatTruncatesTowardZero(t *testing.T) {
	got, err := DecodeSubTurns(1234.9)
	requireNoError(t, err)
	if got != SubTurns(1234) {
		t.Fatalf("DecodeSubTurns(1234.9) = %d, want 1234 (truncated toward zero)", got)
	}
	got2, err := DecodeSubTurns(-1234.9)
	requireNoError(t, err)
	if got2 != SubTurns(-1234) {
		t.Fatalf("DecodeSubTurns(-1234.9) = %d, want -1234 (truncated toward zero)", got2)
	}
}

// Scenario: A non-finite decoded angle fails by name, not silently —
// DecodeSubTurns's own float64 branch checks for NaN/Inf exactly as
// DecodeVec's checkedCoordinate does.
func TestCodec_DecodeSubTurns_NonFiniteFloatRejected(t *testing.T) {
	t.Run("NaN", func(t *testing.T) {
		_, err := DecodeSubTurns(math.NaN())
		if !errors.Is(err, ErrNonFiniteCoordinate) {
			t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate)", err)
		}
	})
	t.Run("positive infinity", func(t *testing.T) {
		_, err := DecodeSubTurns(math.Inf(1))
		if !errors.Is(err, ErrNonFiniteCoordinate) {
			t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate)", err)
		}
	})
	t.Run("negative infinity", func(t *testing.T) {
		_, err := DecodeSubTurns(math.Inf(-1))
		if !errors.Is(err, ErrNonFiniteCoordinate) {
			t.Fatalf("err = %v, want errors.Is(err, ErrNonFiniteCoordinate)", err)
		}
	})
}

// SDET-added boundary probe: an unsupported shape (not int/int64/float64)
// is rejected with a distinct error from the non-finite case.
func TestCodec_DecodeSubTurns_UnsupportedShapeRejected(t *testing.T) {
	_, err := DecodeSubTurns("not a number")
	if err == nil {
		t.Fatal("expected an error for an unsupported shape")
	}
	if errors.Is(err, ErrNonFiniteCoordinate) {
		t.Errorf("err = %v, unsupported-shape rejection should be distinct from the non-finite error", err)
	}
	if !errors.Is(err, errNotAVector) {
		t.Errorf("err = %v, want errors.Is(err, errNotAVector) (the named not-a-recognized-shape error)", err)
	}
}
