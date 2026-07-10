package system

import (
	"context"
	"errors"
	"testing"
	"time"

	"hexaverse/common"
	"hexaverse/galaxy"

	"go.uber.org/mock/gomock"
)

func testClock() common.WorldTime {
	return common.NewWorldTime(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), 1)
}

// fakeGalaxy is a hand-rolled galaxy.ServiceInterface for the branching tests.
type fakeGalaxy struct {
	meta   *galaxy.Galaxy
	system *galaxy.System
	sysErr error
}

func (f *fakeGalaxy) Generate(context.Context, int64, galaxy.GenerationParams) (*galaxy.GeneratedGalaxy, error) {
	return nil, errors.New("unused")
}
func (f *fakeGalaxy) GetLive(context.Context) (*galaxy.GeneratedGalaxy, error) {
	return nil, errors.New("unused")
}
func (f *fakeGalaxy) GetLiveSystem(context.Context, string) (*galaxy.System, error) {
	return f.system, f.sysErr
}
func (f *fakeGalaxy) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return f.meta, nil
}

func testGalaxy() *fakeGalaxy {
	return &fakeGalaxy{
		meta:   &galaxy.Galaxy{Id: "gal_1", Seed: 42},
		system: &galaxy.System{Id: "sys-0", Region: galaxy.RegionStarRich, Skeleton: galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyGasGiant, Ring: 8}}}},
	}
}

func TestService_FastPath_ReturnsStored(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-0").
		Return(&SystemInterior{SystemId: "sys-0", Radius: 16}, nil)
	dao.EXPECT().ListFeatures(gomock.Any(), "gal_1", "sys-0").
		Return([]Feature{{Id: "feat-star", Type: FeatureStar}}, nil)
	// No CreateInterior — the fast path must not regenerate.

	svc := NewServiceWith(dao, testGalaxy(), testClock())
	gen, err := svc.GetOrCreateInterior(context.Background(), "sys-0")
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	if gen.Interior.SystemId != "sys-0" || len(gen.Features) != 1 {
		t.Fatalf("unexpected result: %+v", gen)
	}
}

func TestService_Generates_OnFirstRequest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-0").Return(nil, nil)
	dao.EXPECT().CreateInterior(gomock.Any(), "gal_1", gomock.Any()).
		DoAndReturn(func(_ context.Context, _ string, gen GeneratedInterior) error {
			if gen.Interior.SystemId != "sys-0" {
				t.Errorf("interior systemId = %q", gen.Interior.SystemId)
			}
			if len(gen.Features) < 2 {
				t.Errorf("expected generated features, got %d", len(gen.Features))
			}
			return nil
		})

	svc := NewServiceWith(dao, testGalaxy(), testClock())
	gen, err := svc.GetOrCreateInterior(context.Background(), "sys-0")
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	if gen.Interior.Character != string(galaxy.RegionStarRich) {
		t.Fatalf("character = %q", gen.Interior.Character)
	}
}

func TestService_RaceLost_ReadsWinner(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	gomock.InOrder(
		dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-0").Return(nil, nil),
		dao.EXPECT().CreateInterior(gomock.Any(), "gal_1", gomock.Any()).Return(ErrAlreadyExists),
		dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-0").
			Return(&SystemInterior{SystemId: "sys-0"}, nil),
		dao.EXPECT().ListFeatures(gomock.Any(), "gal_1", "sys-0").
			Return([]Feature{{Id: "feat-star"}}, nil),
	)

	svc := NewServiceWith(dao, testGalaxy(), testClock())
	gen, err := svc.GetOrCreateInterior(context.Background(), "sys-0")
	if err != nil {
		t.Fatalf("race path errored: %v", err)
	}
	if gen.Interior.SystemId != "sys-0" {
		t.Fatalf("didn't read the winner's copy: %+v", gen)
	}
}

func TestService_SystemNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-x").Return(nil, nil)

	gx := testGalaxy()
	gx.sysErr = galaxy.ErrSystemNotFound
	gx.system = nil

	svc := NewServiceWith(dao, gx, testClock())
	_, err := svc.GetOrCreateInterior(context.Background(), "sys-x")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
