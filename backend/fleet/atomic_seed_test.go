package fleet

import (
	"context"
	"crypto/sha256"
	"fmt"
	"reflect"
	"sync"
	"testing"

	"hexaverse/space"
	"hexaverse/system"
)

type atomicSeedStore struct {
	Dao
	mu       sync.Mutex
	reads    int
	both     chan struct{}
	stored   map[string]Fleet
	existing *Fleet
	failure  error
}

func (d *atomicSeedStore) ListByCorporation(context.Context, string) ([]Fleet, error) {
	if d.existing != nil {
		return []Fleet{*d.existing}, nil
	}
	d.mu.Lock()
	d.reads++
	if d.reads == 2 {
		close(d.both)
	}
	d.mu.Unlock()
	<-d.both
	return nil, nil
}
func (d *atomicSeedStore) Save(_ context.Context, f Fleet) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.stored[f.Id] = f
	return nil
}
func (d *atomicSeedStore) CreateIfAbsent(_ context.Context, f Fleet) (*Fleet, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.failure != nil {
		return nil, d.failure
	}
	if old, ok := d.stored[f.Id]; ok {
		return &old, nil
	}
	d.stored[f.Id] = f
	return &f, nil
}
func TestAtomicSeed_IndependentServicesWithTwoEmptyReadsConverge(t *testing.T) {
	for _, mixed := range []bool{false, true} {
		t.Run(fmt.Sprintf("mixedLegacy=%v", mixed), func(t *testing.T) {
			d := &atomicSeedStore{both: make(chan struct{}), stored: map[string]Fleet{}}
			bt := testBodyTable(t, "sys-0", 6, system.Feature{Id: "station", Type: system.FeatureStation, Size: 1, SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: 60, PeriodMs: 10000})})
			services := []*Service{NewServiceWith(d, stubBodySourceFixed{bt: bt}, nil, nil, &fakeClock{now: 100}), NewServiceWith(d, stubBodySourceFixed{bt: bt}, nil, nil, &fakeClock{now: 200})}
			var wg sync.WaitGroup
			var got [2]*Fleet
			var errs [2]error
			for i := range services {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					if mixed && i == 1 {
						got[i], errs[i] = services[i].SeedFleet(context.Background(), "sys-0", "atomic-corp", space.Vec3{X: 30}, 6)
					} else {
						got[i], errs[i] = services[i].SeedFleetAtStation(context.Background(), "sys-0", "atomic-corp", "station")
					}
				}(i)
			}
			wg.Wait()
			for _, err := range errs {
				if err != nil {
					t.Fatal(err)
				}
			}
			if len(d.stored) != 1 {
				t.Fatalf("two empty observations created %d hulls; want one", len(d.stored))
			}
			expected := fmt.Sprintf("fleet_seed_%x", sha256.Sum256([]byte("atomic-corp")))
			if got[0].Id != expected || got[1].Id != expected {
				t.Fatalf("not stable corporation starter identity: %q %q", got[0].Id, got[1].Id)
			}
			if !reflect.DeepEqual(got[0], got[1]) {
				t.Fatal("loser returned its candidate rather than durable winner")
			}
		})
	}
}
func TestAtomicSeed_ExistingLegacyMovedFleetUnchanged(t *testing.T) {
	old := Fleet{Id: "legacy-random", CorporationId: "corp", SystemId: "elsewhere", AttachedTo: "other-host", Cargo: map[string]float64{"fuel": 17}, State: anyParkedState()}
	d := &atomicSeedStore{existing: &old, stored: map[string]Fleet{}}
	svc := NewServiceWith(d, nil, nil, nil, &fakeClock{})
	for _, station := range []bool{false, true} {
		var got *Fleet
		var err error
		if station {
			got, err = svc.SeedFleetAtStation(context.Background(), "new", "corp", "station")
		} else {
			got, err = svc.SeedFleet(context.Background(), "new", "corp", space.Vec3{X: 30}, 6)
		}
		if err != nil || !reflect.DeepEqual(got, &old) || len(d.stored) != 0 {
			t.Fatalf("existing legacy hull changed: %+v %v", got, err)
		}
	}
}
