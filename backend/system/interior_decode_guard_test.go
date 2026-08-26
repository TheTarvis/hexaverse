package system

import (
	"bytes"
	"context"
	"strconv"
	"strings"
	"testing"

	"hexaverse/board"
	"hexaverse/galaxy"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"go.uber.org/mock/gomock"
)

// system-interior, ADDED requirement: "Interior Feature Decode Validates Ring
// Against the Live Schedule" — scenario "A stored feature outside the live
// board radius is rejected at the boundary". No production guard exists yet
// (task 2.7): today's readInterior/GetOrCreateInterior hands every decoded
// feature straight to the caller, and any lattice computation reaching
// board.Canon on an out-of-range ring panics (polar.Schedule.Slots panics
// above MaxRing).
//
// captureLog swaps the global zerolog logger for the duration of fn so the
// test can assert on structured log content without a production seam —
// production code logs through the package-level github.com/rs/zerolog/log
// singleton (see system/service.go's log.Warn().Ctx(ctx)... calls), and this
// is the only way to observe it from a black-box test.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()
	fn()
	return buf.String()
}

// runGuarded calls GetOrCreateInterior and converts a panic into a normal test
// failure (rather than crashing the whole suite) — the very failure mode this
// requirement exists to close off.
func runGuarded(t *testing.T, svc *Service, systemID string) (gen *GeneratedInterior, err error, panicked any) {
	t.Helper()
	defer func() {
		panicked = recover()
	}()
	gen, err = svc.GetOrCreateInterior(context.Background(), systemID)
	return
}

func TestGetOrCreateInterior_Scenario_StoredFeatureOutsideLiveRadiusIsRejectedAtBoundary(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	const radius = 16 // board.Schedule(16).MaxRing == 16
	sched := board.Schedule(radius)
	const badRing = 20 // > sched.MaxRing
	if badRing <= sched.MaxRing {
		t.Fatalf("fixture: badRing %d must exceed the schedule's MaxRing %d", badRing, sched.MaxRing)
	}

	good := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Dir: 1}, Footprint: []board.Cell{{Ring: 3, Slot: 0}}},
	}
	bad := Feature{Id: "feat-corrupt", Type: FeatureRocky, Orbit: &Orbit{Ring: badRing, Angle0: 0, Dir: 1}, Footprint: []board.Cell{{Ring: badRing, Slot: 0}}}

	dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-corrupt").
		Return(&SystemInterior{SystemId: "sys-corrupt", Radius: radius}, nil)
	dao.EXPECT().ListFeatures(gomock.Any(), "gal_1", "sys-corrupt").
		Return(append(append([]Feature{}, good...), bad), nil)

	svc := NewServiceWith(dao, &fakeGalaxy{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	var gen *GeneratedInterior
	var err error
	var panicked any
	logged := captureLog(t, func() {
		gen, err, panicked = runGuarded(t, svc, "sys-corrupt")
	})

	if panicked != nil {
		t.Fatalf("GetOrCreateInterior panicked on an out-of-range stored feature: %v", panicked)
	}
	if err != nil {
		t.Fatalf("GetOrCreateInterior returned an error for a read with one bad feature, want the read to still succeed: %v", err)
	}
	if gen == nil {
		t.Fatal("GetOrCreateInterior returned a nil interior")
	}

	var sawGood, sawBad int
	for _, f := range gen.Features {
		if f.Id == "feat-corrupt" {
			sawBad++
		} else {
			sawGood++
		}
	}
	if sawBad != 0 {
		t.Errorf("the out-of-range feature was NOT omitted from the read (found %d copies)", sawBad)
	}
	if sawGood != len(good) {
		t.Errorf("remaining features served = %d, want %d (the good features, untouched)", sawGood, len(good))
	}

	// The rejection is recorded with the offending feature id and ring.
	if !strings.Contains(logged, "feat-corrupt") {
		t.Errorf("captured log does not mention the offending feature id feat-corrupt: %q", logged)
	}
	if !strings.Contains(logged, strconv.Itoa(badRing)) {
		t.Errorf("captured log does not mention the offending ring %d: %q", badRing, logged)
	}
	if !strings.Contains(logged, "sys-corrupt") {
		t.Errorf("captured log does not mention the system id sys-corrupt: %q", logged)
	}
}

// A second bad feature amid several good ones must not cascade: only the bad
// one is dropped, and it must not stop the loop over the rest.
func TestGetOrCreateInterior_Scenario_MultipleBadFeaturesAllOmittedIndependently(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	const radius = 16
	sched := board.Schedule(radius)
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-bad-1", Type: FeatureRocky, Orbit: &Orbit{Ring: sched.MaxRing + 4, Dir: 1}},
		{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 5, Dir: 1}, Footprint: []board.Cell{{Ring: 5, Slot: 0}}},
		{Id: "feat-bad-2", Type: FeatureBelt, Orbit: &Orbit{Ring: sched.MaxRing + 9, Dir: 1}},
	}

	dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-multi").
		Return(&SystemInterior{SystemId: "sys-multi", Radius: radius}, nil)
	dao.EXPECT().ListFeatures(gomock.Any(), "gal_1", "sys-multi").Return(feats, nil)

	svc := NewServiceWith(dao, &fakeGalaxy{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	gen, err, panicked := runGuarded(t, svc, "sys-multi")
	if panicked != nil {
		t.Fatalf("panicked: %v", panicked)
	}
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	ids := map[string]bool{}
	for _, f := range gen.Features {
		ids[f.Id] = true
	}
	if ids["feat-bad-1"] || ids["feat-bad-2"] {
		t.Fatalf("bad features survived the guard: %v", ids)
	}
	if !ids["feat-star"] || !ids["feat-body-0"] {
		t.Fatalf("good features were dropped alongside the bad ones: %v", ids)
	}
}
