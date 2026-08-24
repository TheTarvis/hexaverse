package stations

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"hexaverse/common"
)

// The station lives in its OWN subcollection, distinct from interior/ and
// features/ which system.CreateInterior's atomic claim owns and never shares.

func TestDaoRef_NestsUnderTheGalaxySystemNode(t *testing.T) {
	db, _ := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWithClient(db)

	ref := dao.Ref("gal-1", "sys-1")
	want := fmt.Sprintf("%s/gal-1/%s/sys-1/%s/%s",
		galaxiesCollection, systemsSubcol, stationSubcol, stationDoc)
	if got := ref.Path; got[len(got)-len(want):] != want {
		t.Errorf("station path = %q, want it to end in %q", got, want)
	}
	// It must NOT collide with the interior's own subcollections.
	for _, forbidden := range []string{"/interior/", "/features/"} {
		if containsSub(ref.Path, forbidden) {
			t.Errorf("the station path %q reaches into %q, which CreateInterior owns", ref.Path, forbidden)
		}
	}
}

func TestDaoCreate_IsCreateIfAbsent(t *testing.T) {
	db, client := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWithClient(db)
	ctx := context.Background()
	const gid, sid = "gal-dao-test", "sys-dao-test"
	defer common.CleanupFirestoreTestData(t, client,
		fmt.Sprintf("%s/%s/%s/%s/%s", galaxiesCollection, gid, systemsSubcol, sid, stationSubcol))

	st := Station{SystemId: sid, FeatureId: StationFeatureId, CreatedAt: 1000}
	if err := dao.Create(ctx, gid, st); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	// A second claim must lose rather than overwrite — that is what makes two
	// corporations spawning into one system converge on a single station.
	if err := dao.Create(ctx, gid, st); !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("second Create = %v, want ErrAlreadyExists", err)
	}

	got, err := dao.Get(ctx, gid, sid)
	if err != nil || got == nil {
		t.Fatalf("Get = (%v, %v), want the stored station", got, err)
	}
	if got.SystemId != sid {
		t.Errorf("systemId = %q, want %q", got.SystemId, sid)
	}
}

func TestDaoGet_MissingStationIsNilNotAnError(t *testing.T) {
	db, _ := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWithClient(db)

	// Most systems carry no station; that is an ordinary answer, not a fault.
	got, err := dao.Get(context.Background(), "gal-absent", "sys-absent")
	if err != nil {
		t.Fatalf("Get for an unstationed system = %v, want no error", err)
	}
	if got != nil {
		t.Errorf("got %+v, want nil", got)
	}
}

func containsSub(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
