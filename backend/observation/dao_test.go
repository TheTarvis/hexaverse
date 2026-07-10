package observation

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"

	"github.com/google/uuid"
)

// TestUpsertSystemObservation_Monotonic proves the store never lowers a tier: a
// stale, lower-tier write leaves a higher stored tier intact (#0006 monotonicity).
func TestUpsertSystemObservation_Monotonic(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	dao := NewDaoWithClient(service)

	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: sys, Tier: TierSurveyed, AsOf: 2_000}); err != nil {
		t.Fatalf("surveyed upsert: %v", err)
	}
	// A stale, lower-tier write must not lower the stored tier.
	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: sys, Tier: TierRumored, AsOf: 500}); err != nil {
		t.Fatalf("stale upsert: %v", err)
	}
	got, err := dao.GetSystemObservation(ctx, corp, sys)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Tier != TierSurveyed {
		t.Errorf("tier lowered to %q; monotonicity broken (want surveyed)", got.Tier)
	}
	if got.AsOf != 2_000 {
		t.Errorf("asOf regressed to %d, want 2000 (the fresher survey)", got.AsOf)
	}
}

// TestFeatureObservation_RoundTrip proves per-feature board memory persists and
// lists back keyed by featureId (idempotent overwrite on repeat passes).
func TestFeatureObservation_RoundTrip(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	dao := NewDaoWithClient(service)

	obs := FeatureObservation{FeatureId: "feat-belt-0", Elements: &board.Orbit{Ring: 4, Angle0: 1, Period: 0, Dir: 1}, AsOf: 100}
	if err := dao.UpsertFeatureObservation(ctx, corp, sys, obs); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// Repeat pass with a fresher stamp — an idempotent overwrite, not a duplicate.
	obs.AsOf = 300
	if err := dao.UpsertFeatureObservation(ctx, corp, sys, obs); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}

	list, err := dao.ListFeatureObservations(ctx, corp, sys)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("listed %d feature observations, want 1 (keyed by featureId)", len(list))
	}
	if list[0].AsOf != 300 || list[0].Elements == nil {
		t.Errorf("round-trip lost data: asOf=%d elements=%v", list[0].AsOf, list[0].Elements)
	}
}
