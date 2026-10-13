package system

import (
	"context"
	"errors"
	"testing"

	"hexaverse/galaxy"
	"hexaverse/space"
)

// Simulate the storage arbitration deterministically; no timing or retry can
// conceal a missing projection on the race-loser branch.
type projectionRaceDao struct {
	mode      string
	created   bool
	winner    GeneratedInterior
	winnerErr error
	missing   bool
}

func (d *projectionRaceDao) GetInterior(context.Context, string, string) (*SystemInterior, error) {
	if d.mode != "existing" && !d.created {
		return nil, nil
	}
	if d.winnerErr != nil {
		return nil, d.winnerErr
	}
	if d.missing {
		return nil, nil
	}
	return &d.winner.Interior, nil
}
func (d *projectionRaceDao) ListFeatures(context.Context, string, string) ([]Feature, error) {
	return append([]Feature(nil), d.winner.Features...), nil
}
func (d *projectionRaceDao) CreateInterior(_ context.Context, _ string, g GeneratedInterior) error {
	d.created = true
	if d.mode == "loser" {
		return ErrAlreadyExists
	}
	d.winner = g
	return nil
}
func projectionService(mode string, station *Feature) (*Service, *projectionRaceDao) {
	interior, features := goodBodyTableInterior()
	d := &projectionRaceDao{mode: mode, winner: GeneratedInterior{Interior: interior, Features: features}}
	gx := noLanesGalaxy()
	gx.system = &galaxy.System{Id: interior.SystemId, Region: galaxy.RegionNormal, Skeleton: galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 2}}}}
	return NewServiceWith(d, gx, testClock()).WithStations(&stubStationBT{feat: station}), d
}
func TestMaterializationProjection_ConcurrentBootstrapResolvesProvisionedStation(t *testing.T) {
	for _, mode := range []string{"existing", "created", "loser"} {
		t.Run(mode, func(t *testing.T) {
			svc, _ := projectionService(mode, &Feature{Id: "feat-station", Type: FeatureStation})
			table, err := svc.BodyTable(context.Background(), "sys-bt")
			if err != nil {
				t.Fatal(err)
			}
			station, ok := table.Body("feat-station")
			if !ok {
				t.Fatal("provisioned station absent from returned body table")
			}
			if station.Size <= 0 {
				t.Fatal("station projection has invalid size")
			}
			if _, err := space.Position(table, "feat-station", testClock().Now()); err != nil {
				t.Fatalf("station orbit cannot resolve: %v", err)
			}
		})
	}
}
func TestMaterializationProjection_WinnerProjectionPreservesFailureAndFiltering(t *testing.T) {
	t.Run("invalid spliced parent omitted", func(t *testing.T) {
		svc, _ := projectionService("loser", &Feature{Id: "invalid-station", Type: FeatureStation, Size: 1, Space: &space.Orbit{ParentId: "missing", Radius: 10, PeriodMs: 1000}})
		table, err := svc.BodyTable(context.Background(), "sys-bt")
		if err != nil {
			t.Fatal(err)
		}
		if _, ok := table.Body("invalid-station"); ok {
			t.Fatal("invalid parent survived omission cascade")
		}
		if _, ok := table.Body("feat-star"); !ok {
			t.Fatal("unrelated valid star omitted")
		}
	})
	for _, missing := range []bool{false, true} {
		t.Run(map[bool]string{false: "winner read error", true: "winner missing"}[missing], func(t *testing.T) {
			svc, d := projectionService("loser", &Feature{Id: "feat-station", Type: FeatureStation})
			sentinel := errors.New("winner storage unavailable")
			d.missing = missing
			if !missing {
				d.winnerErr = sentinel
			}
			result, err := svc.GetOrCreateInterior(context.Background(), "sys-bt")
			if err == nil || result != nil {
				t.Fatal("unreadable winner returned incomplete success")
			}
			if !missing && !errors.Is(err, sentinel) {
				t.Fatalf("lost winner storage error: %v", err)
			}
		})
	}
}

func TestMaterializationProjection_LoserReturnedInteriorCascadesInvalidParentChain(t *testing.T) {
	svc, d := projectionService("loser", &Feature{Id: "feat-station", Type: FeatureStation})
	d.winner.Features = append(d.winner.Features,
		Feature{Id: "orphan", Type: FeatureRocky, Size: 1, SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "missing", Radius: 10, PeriodMs: 1000})},
		Feature{Id: "orphan-child", Type: FeatureMoon, Size: 1, SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "orphan", Radius: 2, PeriodMs: 1000})})
	result, err := svc.GetOrCreateInterior(context.Background(), "sys-bt")
	if err != nil {
		t.Fatal(err)
	}
	for _, feature := range result.Features {
		if feature.Id == "orphan" || feature.Id == "orphan-child" {
			t.Fatalf("race-loser returned invalid parent chain member %s", feature.Id)
		}
	}
}
