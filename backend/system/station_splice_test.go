package system

import (
	"context"
	"errors"
	"testing"

	"hexaverse/board"
)

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
		Interior: SystemInterior{SystemId: "sys-1", Radius: 16},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 3, Slot: 0}}},
		},
	}
}

func TestSpliceStation_AppendsTheStationWhenOneExists(t *testing.T) {
	src := &fakeStationSource{feat: stationFeatureFixture()}
	s := &Service{stations: src}
	gen := interiorFixture()

	s.spliceStation(context.Background(), gen)

	if len(gen.Features) != 3 {
		t.Fatalf("interior holds %d features, want 3 (2 generated + the station)", len(gen.Features))
	}
	last := gen.Features[2]
	if last.Type != FeatureStation {
		t.Errorf("spliced feature type = %q, want station", last.Type)
	}
	// It must carry orbital elements: fleet.Position resolves a docked fleet
	// through the generic featureOrbit branch, so a station with no orbit would
	// leave a docked fleet unresolvable.
	if last.Orbit == nil {
		t.Error("spliced station carries no orbital elements")
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
