package stations

import (
	"bytes"
	"context"
	"strconv"
	"strings"
	"testing"

	"hexaverse/board"
	"hexaverse/system"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// trading-station, ADDED requirement "A Station Orbit Outside the Live Board
// Radius Is Omitted, Never Panicked" — scenario "A stored station orbit
// outside the live board radius is omitted, not panicked", the
// interior-splice half (corrected 2026-08-26: the final clause now reads
// "the interior read still succeeds" — NOT "every fleet read succeeds"; the
// fleet-read half lives in backend/fleet/station_omission_test.go).
//
// task 2.8b: FeatureOf runs AHEAD of the interior's own feature-decode
// validation (system's guard, task 2.7) — it must reject a stored orbit ring
// beyond the live schedule's maximum itself, before board.Canon/sched.Slots
// ever sees it.
//
// SDET-CHOSEN CONTRACT (not pinned elsewhere): FeatureOf gains a second
// return value, `(*system.Feature, error)`, using board.ProductionSchedule()
// internally (stations holds no per-system interior — design.md Decision 3
// lists it among ProductionSchedule()'s default callers). If the developer
// shapes this differently, that is a mechanical rename, not a behavior
// dispute — the scenario is about OBSERVABLE omission + recording, not this
// exact signature.

func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()
	fn()
	return buf.String()
}

func runGuarded(t *testing.T, fn func()) (panicked any) {
	t.Helper()
	defer func() { panicked = recover() }()
	fn()
	return
}

func TestFeatureOf_Scenario_OrbitRingBeyondLiveScheduleIsRejectedNotPanicked(t *testing.T) {
	badRing := board.ProductionSchedule().MaxRing + 6
	st := &Station{
		SystemId:  "sys-orbit-guard",
		Orbit:     system.Orbit{Ring: badRing, Angle0: 0, Dir: 1},
		FeatureId: StationFeatureId,
	}

	var feat *system.Feature
	var err error
	panicked := runGuarded(t, func() {
		feat, err = FeatureOf(st)
	})
	if panicked != nil {
		t.Fatalf("FeatureOf panicked on an orbit ring (%d) beyond the live schedule's max (%d): %v",
			badRing, board.ProductionSchedule().MaxRing, panicked)
	}
	if err == nil && feat != nil {
		t.Fatalf("FeatureOf returned a feature for an out-of-range orbit ring (%d) — want an omission (nil feature or error), not a lattice computation on it", badRing)
	}
}

// The interior read (system.spliceStation) must still succeed and the good
// features remain intact — already generically covered by
// system/station_splice_test.go's TestSpliceStation_DegradesOnStoreFailureRatherThanFailingTheRead
// and TestSpliceStation_OmitsNothingWhenTheSystemHasNoStation (any station-
// source failure/nil already degrades to no-station there). This test adds
// the SPECIFIC "recorded with the system id and the offending ring" half,
// observed through the actual public entry point (StationFeature), which is
// what system.spliceStation calls.
func TestStationFeature_Scenario_OutOfRangeOrbitOmittedAndRecordedWithSystemIdAndRing(t *testing.T) {
	badRing := board.ProductionSchedule().MaxRing + 9
	const sysID = "sys-orbit-guard-2"
	src := &fixedStationSource{
		st: &Station{SystemId: sysID, Orbit: system.Orbit{Ring: badRing, Angle0: 0, Dir: 1}, FeatureId: StationFeatureId},
	}

	var feat *system.Feature
	var err error
	logged := captureLog(t, func() {
		runGuarded(t, func() {
			feat, err = src.StationFeature(context.Background(), sysID)
		})
	})

	if feat != nil {
		t.Fatalf("StationFeature returned a feature for an out-of-range orbit ring: %+v", feat)
	}
	_ = err // an error return is acceptable but not required — omission (nil, nil) also satisfies "degrade, don't fail"

	if !strings.Contains(logged, sysID) {
		t.Errorf("captured log does not carry the system id %q: %q", sysID, logged)
	}
	if !strings.Contains(logged, strconv.Itoa(badRing)) {
		t.Errorf("captured log does not carry the offending ring %d: %q", badRing, logged)
	}
}

// fixedStationSource is a minimal stand-in exercising the REAL
// Service.StationFeature/FeatureOf path against a fixed station, without a
// Firestore stack — it wraps FeatureOf exactly as Service.StationFeature
// does (see service.go), so the assertion is against production logic, not
// a re-implementation of it.
type fixedStationSource struct{ st *Station }

func (f *fixedStationSource) StationFeature(_ context.Context, systemID string) (*system.Feature, error) {
	if f.st == nil || f.st.SystemId != systemID {
		return nil, nil
	}
	return FeatureOf(f.st)
}
