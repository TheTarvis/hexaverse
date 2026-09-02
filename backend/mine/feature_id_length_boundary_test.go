package mine

import (
	"context"
	"errors"
	"strings"
	"testing"

	"hexaverse/system"
)

// mine-extraction, "A Client-Supplied Feature Id Is Validated Before
// Resolution" — "A featureId at the maximum configured length is not
// rejected on length grounds" / "A featureId one byte past the maximum
// configured length is rejected" (re-express-economy-positions tasks.md
// 2.10).
//
// EXPECTED RED TODAY (compile error): MineParams carries no
// MaxFeatureIdBytes field yet — task 2.1 (golang-dev, NOT this SDET pass)
// adds it as part of implementing the two-phase featureId validation this
// field bounds. This is a deliberate red-phase compile contract, mirroring
// model.go's own existing "STUB: red-phase compile contract" note on
// MineParams: a developer landing a differently-named or differently-typed
// knob should raise it as a test dispute, not silently diverge.
//
// The pair is deliberately constructed so it cannot pass vacuously merely
// because no length check exists yet (design.md's own warning: "An earlier
// draft of this pair passed with no length check at all — do not reproduce
// that"): the "at max" half asserts an action is ACTUALLY CREATED (not
// merely "no error") against a real resource-bearing feature whose id is
// exactly MaxFeatureIdBytes UTF-8 bytes; the "one byte past" half asserts
// the SAME base id plus one ASCII byte is REJECTED, and specifically with a
// reason that is NOT one of the three existing sentinel reasons this
// package already reports (ErrNotDocked/ErrUnknownKind/
// ErrStationNotMineable) — a length check that accepted everything would
// fail this half; a length check that rejected everything would fail the
// "at max" half.
func TestCommit_Scenario_MaxFeatureIdBytesBoundary(t *testing.T) {
	params := validParams()
	params.MaxFeatureIdBytes = 256

	// Exactly params.MaxFeatureIdBytes ASCII (single-byte) characters, so
	// UTF-8 byte length and rune count coincide and the fixture is exact by
	// construction.
	base := strings.Repeat("a", params.MaxFeatureIdBytes-6) + "-belt0"
	if len(base) != params.MaxFeatureIdBytes {
		t.Fatalf("fixture broken: base id is %d bytes, want exactly %d", len(base), params.MaxFeatureIdBytes)
	}
	overlong := base + "x" // one ASCII byte past the configured maximum

	t.Run("at exactly the configured maximum: accepted", func(t *testing.T) {
		f := dockedFleet(testCorpA)
		f.AttachedTo = base
		interior := &system.GeneratedInterior{Features: []system.Feature{
			{Id: base, Type: system.FeatureBelt, Resources: []system.Resource{{Kind: system.ResourceMetals, Richness: 0.5}}},
		}}
		fa := &fakeMineActions{}
		svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: interior}, fa, params)
		req := validRequest()
		req.FeatureId = base

		a, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
		if err != nil {
			t.Fatalf("a featureId at exactly MaxFeatureIdBytes (%d bytes) = %v, want accepted", params.MaxFeatureIdBytes, err)
		}
		if a == nil || a.Id == "" || fa.committed == nil {
			t.Fatalf("expected a committed action at the length boundary, got action=%+v committed=%+v", a, fa.committed)
		}
	})

	t.Run("one byte past the configured maximum: rejected with a distinct overlong reason", func(t *testing.T) {
		f := dockedFleet(testCorpA)
		f.AttachedTo = overlong
		// An empty interior: the resolution phase must never even be
		// reached for an overlong id — the lexical phase rejects it first
		// (design.md Decision 2a's own ordering guarantee), so a lookup
		// against interior.Features that WOULD fail for an unrelated
		// reason (empty interior) never gets the chance to produce the
		// wrong rejection reason here.
		interior := &system.GeneratedInterior{}
		fa := &fakeMineActions{}
		svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: interior}, fa, params)
		req := validRequest()
		req.FeatureId = overlong

		_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
		if err == nil {
			t.Fatalf("a featureId one byte past MaxFeatureIdBytes (%d bytes) succeeded, want rejected", len(overlong))
		}
		if errors.Is(err, ErrNotDocked) || errors.Is(err, ErrUnknownKind) || errors.Is(err, ErrStationNotMineable) {
			t.Fatalf("an overlong featureId reused an existing rejection (%v) instead of its own distinguishable overlong-id reason", err)
		}
		if fa.committed != nil {
			t.Fatalf("an overlong-featureId commit must create no action, got %+v", fa.committed)
		}
	})
}
