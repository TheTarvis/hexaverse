package corporations

import (
	"context"
	"errors"
	"strings"
	"testing"

	"hexaverse/fleet"

	"go.uber.org/mock/gomock"
)

func TestSpawn_NameLengthBoundary(t *testing.T) {
	for _, tc := range []struct {
		label, name string
		tooLong     bool
	}{
		{"ASCII boundary", strings.Repeat("W", 40), false},
		{"ASCII over limit", strings.Repeat("W", 41), true},
		{"multibyte boundary", strings.Repeat("É", 40), false},
		{"multibyte over limit", strings.Repeat("É", 41), true},
		{"normalized boundary", "  " + strings.Repeat("E\u0301", 40) + "  ", false},
		{"normalized over limit", strings.Repeat("E\u0301", 41), true},
		{"supplementary boundary", strings.Repeat("🚀", 40), false},
		{"supplementary over limit", strings.Repeat("🚀", 41), true},
	} {
		t.Run(tc.label, func(t *testing.T) {
			dao := NewMockDao(gomock.NewController(t))
			dao.EXPECT().CorpIdForAccount(gomock.Any(), "new-account").Return("", nil)
			want := ErrNameTooLong
			if !tc.tooLong {
				// A valid name reaches site selection; no eligible site exists, so
				// no corporation or other spawn assets may be written in this test.
				dao.EXPECT().ListLiving(gomock.Any()).Return(nil, nil).AnyTimes()
				dao.EXPECT().ListSpawnClaims(gomock.Any()).Return(map[string]bool{}, nil).AnyTimes()
				want = ErrNoSpawnSite
			}
			svc := NewServiceWith(dao, shellGraph("ffff"), nil, &fakeChartsFog{}, &fakeClock{now: 1000})
			if _, err := svc.Spawn(context.Background(), "new-account", tc.name); !errors.Is(err, want) {
				t.Fatalf("Spawn error = %v, want %v", err, want)
			}
		})
	}
}

type namingRetryFleets struct {
	FleetSource
	err error
}

func (f namingRetryFleets) ListForCorp(context.Context, string) ([]fleet.Fleet, error) {
	return nil, f.err
}

func TestSpawn_LegacyLongNameStillReachesAssetHealing(t *testing.T) {
	dao := NewMockDao(gomock.NewController(t))
	legacyName := strings.Repeat("W", 60)
	corp := &Corporation{Id: "legacy", Name: legacyName}
	dao.EXPECT().CorpIdForAccount(gomock.Any(), "existing-account").Return(corp.Id, nil)
	dao.EXPECT().Get(gomock.Any(), corp.Id).Return(corp, nil)
	healingErr := errors.New("healing temporarily unavailable")
	svc := NewServiceWith(dao, nil, namingRetryFleets{err: healingErr}, nil, &fakeClock{now: 1000})
	if _, err := svc.Spawn(context.Background(), "existing-account", legacyName); !errors.Is(err, healingErr) {
		t.Fatalf("legacy retry error = %v, want healing attempt", err)
	}
	if corp.Name != legacyName {
		t.Fatal("legacy name changed")
	}
}
