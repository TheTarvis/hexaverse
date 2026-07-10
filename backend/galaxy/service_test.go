package galaxy

import (
	"context"
	"errors"
	"testing"
	"time"

	"hexaverse/common"

	"go.uber.org/mock/gomock"
)

func testClock() common.WorldTime {
	return common.NewWorldTime(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), 1)
}

func TestService_Generate_PersistsAndPointsLive(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	var savedID string
	dao.EXPECT().SaveGalaxy(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, g GeneratedGalaxy) error {
			savedID = g.Galaxy.Id
			if g.Galaxy.Id == "" {
				t.Error("galaxy saved without id")
			}
			if len(g.Systems) == 0 || len(g.Lanes) == 0 {
				t.Error("galaxy saved without systems/lanes")
			}
			return nil
		})
	dao.EXPECT().SetLivePointer(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, id string) error {
			if id != savedID {
				t.Errorf("live pointer %q != saved galaxy %q", id, savedID)
			}
			return nil
		})

	svc := NewServiceWith(dao, testClock())
	gen, err := svc.Generate(context.Background(), 5, smallParams())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if gen.Galaxy.Id == "" {
		t.Fatal("returned galaxy has no id")
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

func TestService_GetLive_Assembles(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetLivePointer(gomock.Any()).Return("gal_x", nil)
	dao.EXPECT().GetGalaxyMeta(gomock.Any(), "gal_x").Return(&Galaxy{Id: "gal_x", Seed: 5}, nil)
	dao.EXPECT().ListSystems(gomock.Any(), "gal_x").Return([]System{{Id: "sys-0"}}, nil)
	dao.EXPECT().ListLanes(gomock.Any(), "gal_x").Return([]Lane{{Id: "lane-0-1"}}, nil)

	svc := NewServiceWith(dao, testClock())
	gen, err := svc.GetLive(context.Background())
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	if gen.Galaxy.Id != "gal_x" || len(gen.Systems) != 1 || len(gen.Lanes) != 1 {
		t.Fatalf("unexpected assembly: %+v", gen)
	}
}
