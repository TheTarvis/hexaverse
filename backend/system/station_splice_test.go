package system

import (
	"context"
	"errors"
	"testing"

	"hexaverse/board"
)

// TEST REVISION 2026-09-01 (SDET, authorized): spec changed — system-interior
// ADDED "A Spliced Body Is Complete or Omitted, and Its Incompleteness Is
// Loud" (openspec change replace-observation-with-sightings, tasks.md 10.9/
// 10.14). TestSpliceStation_AppendsTheStationWhenOneExists previously
// constructed &Service{stations: src} with NO galaxySvc and asserted only
// that a lattice Orbit was attached — an unreachable production
// configuration (system.NewService always wires galaxySvc) that no longer
// reflects what "the station is appended" must mean now that appending an
// INCOMPLETE spliced body (no continuous orbital element set, no positive
// Size) is exactly the defect this capability forbids. Revised below to wire
// a fake galaxySvc (oneBodySkeletonGalaxy, already used by
// splice_completeness_test.go / spliced_body_complete_or_loud_test.go in this
// package) and assert the appended station is COMPLETE — non-nil Space and a
// strictly positive Size — rather than merely present with a lattice Orbit.

// fakeStationSource stands in for the station store: it either yields a station
// feature, yields none, or fails — the three cases the splice must handle.
type fakeStationSource struct {
	feat *Feature
	err  error
	// calls counts invocations, so a test can prove the splice consulted (or
	// skipped) the store.
	calls int
}

func (f *fakeStationSource) StationFeature(context.Context, string) (*Feature, error) {
	f.calls++
	return f.feat, f.err
}

func stationFeatureFixture() *Feature {
	return &Feature{
		Id:    "feat-station",
		Type:  FeatureStation,
		Name:  "Trading Station",
		Orbit: &Orbit{Ring: 6, Angle0: 3, Period: PeriodFor(6), Dir: 1},
		// A station has an owner; every generated feature leaves this empty.
		OwnerCorpId: "",
		Footprint:   []board.Cell{{Ring: 6, Slot: 3}},
	}
}

func interiorFixture() *GeneratedInterior {
	return &GeneratedInterior{
		Interior: SystemInterior{SystemId: "sys-1"},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 3, Slot: 0}}},
		},
	}
}

func TestSpliceStation_AppendsTheStationWhenOneExists(t *testing.T) {
	src := &fakeStationSource{feat: stationFeatureFixture()}
	// galaxySvc wired (the only reachable production configuration —
	// system.NewService always sets it), so spliceStation's own self-heal
	// derives the station's continuous orbit at the splice seam (design.md
	// Decision 29) rather than appending an incomplete body.
	s := &Service{stations: src, galaxySvc: oneBodySkeletonGalaxy()}
	gen := interiorFixture()

	s.spliceStation(context.Background(), gen)

	if len(gen.Features) != 3 {
		t.Fatalf("interior holds %d features, want 3 (2 generated + the station)", len(gen.Features))
	}
	last := gen.Features[2]
	if last.Type != FeatureStation {
		t.Errorf("spliced feature type = %q, want station", last.Type)
	}
	// system-interior "A Spliced Body Is Complete or Omitted, and Its
	// Incompleteness Is Loud": the appended station must be COMPLETE — a
	// non-nil continuous orbital element set and a strictly positive Size —
	// not merely carrying a lattice Orbit, which alone is not enough to
	// survive applyContinuousCascade's completeness contract.
	if last.Space == nil {
		t.Error("spliced station carries no continuous orbital element set (Space)")
	}
	if !(last.Size > 0) {
		t.Errorf("spliced station carries a non-positive Size (%v)", last.Size)
	}
}

func TestSpliceStation_OmitsNothingWhenTheSystemHasNoStation(t *testing.T) {
	src := &fakeStationSource{feat: nil}
	s := &Service{stations: src}
	gen := interiorFixture()

	s.spliceStation(context.Background(), gen)

	if len(gen.Features) != 2 {
		t.Errorf("interior holds %d features, want the 2 generated ones untouched", len(gen.Features))
	}
}

func TestSpliceStation_DegradesOnStoreFailureRatherThanFailingTheRead(t *testing.T) {
	// The interior read has no market dependency today, and this splice must not
	// introduce one: a station-store outage costs the station, never the system.
	// This is also the general mechanism trading-station's "A Station Orbit
	// Outside the Live Board Radius Is Omitted, Never Panicked" leans on: an
	// out-of-range orbit is exactly one more StationFeature failure mode this
	// same degrade path already absorbs.
	src := &fakeStationSource{err: errors.New("station store unavailable")}
	s := &Service{stations: src}
	gen := interiorFixture()

	s.spliceStation(context.Background(), gen)

	if len(gen.Features) != 2 {
		t.Fatalf("interior holds %d features, want the 2 generated ones intact", len(gen.Features))
	}
	for _, f := range gen.Features {
		if f.Type == FeatureStation {
			t.Error("a failed station read still spliced a station")
		}
	}
}

func TestSpliceStation_NoStationSourceWiredIsPreStationBehaviour(t *testing.T) {
	s := &Service{}
	gen := interiorFixture()
	s.spliceStation(context.Background(), gen)
	if len(gen.Features) != 2 {
		t.Errorf("interior holds %d features, want 2", len(gen.Features))
	}
}
