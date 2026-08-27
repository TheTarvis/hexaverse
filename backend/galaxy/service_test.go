package galaxy

import (
	"context"
	"errors"
	"testing"

	"go.uber.org/mock/gomock"
)

func TestService_Seed_ValidatesParamsBeforePersistingAnything(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl) // no EXPECTs: a rejected seed must touch storage zero times

	p := DefaultParams()
	p.MaxLaneLength = 0

	svc := NewServiceWith(dao, testClock())
	_, err := svc.Seed(context.Background(), 1, p)
	if !errors.Is(err, ErrInvalidParams) {
		t.Fatalf("expected ErrInvalidParams, got %v", err)
	}
}

func TestService_Seed_RejectsADegenerateStartArea(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl) // again: nothing persisted, so no live pointer moves

	p := DefaultParams()
	p.MinOriginComponentSystems = 1_000_000 // no start area can clear this floor

	svc := NewServiceWith(dao, testClock())
	_, err := svc.Seed(context.Background(), 1, p)
	if !errors.Is(err, ErrDegenerateStartArea) {
		t.Fatalf("expected ErrDegenerateStartArea, got %v", err)
	}
}

func TestService_Seed_RecordsOriginAndPointsLiveLast(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	p := StartAreaParams()
	want := GenerateStartArea(StartAreaSeed, p)
	blocks := len(StartAreaBlocks(p))

	var savedID string
	pointed := false
	gomock.InOrder(
		dao.EXPECT().SaveGalaxyMeta(gomock.Any(), gomock.Any()).
			DoAndReturn(func(_ context.Context, g Galaxy) error {
				if g.Id == "" {
					t.Error("galaxy saved without an id")
				}
				if g.OriginSystemId != want.Galaxy.OriginSystemId {
					t.Errorf("origin recorded as %q, want %q", g.OriginSystemId, want.Galaxy.OriginSystemId)
				}
				savedID = g.Id
				return nil
			}),
		dao.EXPECT().MaterializedBlocks(gomock.Any(), gomock.Any(), gomock.Len(blocks)).
			Return(map[Block]bool{}, nil),
	)
	dao.EXPECT().MaterializeBlock(gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, id string, m BlockMaterialization) (bool, error) {
			if id != savedID {
				t.Errorf("materialized into %q, want the new galaxy %q", id, savedID)
			}
			if pointed {
				t.Error("blocks materialized AFTER the live pointer moved")
			}
			return true, nil
		}).Times(blocks)
	dao.EXPECT().MergeExtent(gomock.Any(), gomock.Any(), gomock.Any(), blocks).Return(nil)
	dao.EXPECT().SetLivePointer(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, id string) error {
			if id != savedID {
				t.Errorf("live pointer %q != saved galaxy %q", id, savedID)
			}
			pointed = true
			return nil
		})

	svc := NewServiceWith(dao, testClock())
	meta, err := svc.Seed(context.Background(), StartAreaSeed, p)
	if err != nil {
		t.Fatalf("Seed: %v", err)
	}
	if meta.OriginSystemId == "" || meta.Id == "" {
		t.Fatalf("unexpected metadata: %+v", meta)
	}
}

// A block already anchored must cost nothing: no transaction, no extent merge.
func TestService_EnsureBlocks_SkipsMaterializedBlocks(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	p := DefaultParams()
	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().GetGalaxyMeta(gomock.Any(), "gal_x").Return(&Galaxy{Id: "gal_x", Seed: 3, Params: p}, nil)
	dao.EXPECT().MaterializedBlocks(gomock.Any(), "gal_x", gomock.Any()).
		Return(map[Block]bool{{X: 0, Y: 0}: true}, nil)

	svc := NewServiceWith(dao, testClock())
	if err := svc.EnsureBlocks(context.Background(), Block{X: 0, Y: 0}); err != nil {
		t.Fatalf("EnsureBlocks: %v", err)
	}
}

// The lane horizon is the 3×3 block window plus incident-bridge far blocks —
// diagonals included (adversary B2).
func TestService_EnsureLaneHorizon_CoversTheWindow(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	p := DefaultParams()
	f := NewField(3, p)
	sysID := ""
	for _, s := range f.BlockSystems(Block{X: 0, Y: 0}) {
		sysID = s.Id
		break
	}
	if sysID == "" {
		t.Fatal("no system in the origin block")
	}

	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().GetGalaxyMeta(gomock.Any(), "gal_x").Return(&Galaxy{Id: "gal_x", Seed: 3, Params: p}, nil)

	var asked []Block
	dao.EXPECT().MaterializedBlocks(gomock.Any(), "gal_x", gomock.Any()).
		DoAndReturn(func(_ context.Context, _ string, blocks []Block) (map[Block]bool, error) {
			asked = blocks
			out := map[Block]bool{}
			for _, b := range blocks {
				out[b] = true // all present — the ensure is then a pure no-op
			}
			return out, nil
		})

	svc := NewServiceWith(dao, testClock())
	if err := svc.EnsureLaneHorizon(context.Background(), sysID); err != nil {
		t.Fatalf("EnsureLaneHorizon: %v", err)
	}
	got := map[Block]bool{}
	for _, b := range asked {
		got[b] = true
	}
	for _, want := range BlockWindow(Block{X: 0, Y: 0}) {
		if !got[want] {
			t.Fatalf("horizon missed block %+v; asked for %v", want, asked)
		}
	}
}

// An id that is not a field coordinate (a station, a legacy id) has no derivable
// horizon — the ensure is a no-op rather than an error.
func TestService_EnsureLaneHorizon_IgnoresNonFieldIds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().GetGalaxyMeta(gomock.Any(), "gal_x").Return(&Galaxy{Id: "gal_x", Params: DefaultParams()}, nil)

	svc := NewServiceWith(dao, testClock())
	if err := svc.EnsureLaneHorizon(context.Background(), "sys-legacy-7"); err != nil {
		t.Fatalf("EnsureLaneHorizon on a non-field id: %v", err)
	}
}

func TestService_GetLive_NoPointer(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	dao.EXPECT().GetLivePointer(gomock.Any()).Return("", nil)

	svc := NewServiceWith(dao, testClock())
	_, err := svc.GetLive(context.Background())
	if !errors.Is(err, ErrNoLiveGalaxy) {
		t.Fatalf("expected ErrNoLiveGalaxy, got %v", err)
	}
}

func TestService_GetLive_AssemblesTheMaterializedSubset(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().GetGalaxyMeta(gomock.Any(), "gal_x").Return(&Galaxy{Id: "gal_x", Seed: 5}, nil)
	dao.EXPECT().ListSystems(gomock.Any(), "gal_x").Return([]System{{Id: "sys_0_0"}}, nil)
	dao.EXPECT().ListLanes(gomock.Any(), "gal_x").Return([]Lane{{Id: "lane_0_0_1_0"}}, nil)

	svc := NewServiceWith(dao, testClock())
	gen, err := svc.GetLive(context.Background())
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	if gen.Galaxy.Id != "gal_x" || len(gen.Systems) != 1 || len(gen.Lanes) != 1 {
		t.Fatalf("unexpected assembly: %+v", gen)
	}
}

func TestService_GetLiveSystem_UnmaterializedIsNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().GetSystem(gomock.Any(), "gal_x", "sys_99_99").Return(nil, nil)

	svc := NewServiceWith(dao, testClock())
	_, err := svc.GetLiveSystem(context.Background(), "sys_99_99")
	if !errors.Is(err, ErrSystemNotFound) {
		t.Fatalf("expected ErrSystemNotFound, got %v", err)
	}
}

func TestService_NeighborsOf_ProjectsBothEndpoints(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().ListLanesForSystems(gomock.Any(), "gal_x", []string{"sys_0_0"}).Return([]Lane{
		{Id: "l1", AId: "sys_0_0", BId: "sys_1_0"},
		{Id: "l2", AId: "sys_0_-1", BId: "sys_0_0"},
	}, nil)

	svc := NewServiceWith(dao, testClock())
	got, err := svc.NeighborsOf(context.Background(), "sys_0_0")
	if err != nil {
		t.Fatalf("NeighborsOf: %v", err)
	}
	set := map[string]bool{}
	for _, id := range got {
		set[id] = true
	}
	if len(got) != 2 || !set["sys_1_0"] || !set["sys_0_-1"] {
		t.Fatalf("neighbors = %v, want both far endpoints", got)
	}
}
