package fleet

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"hexaverse/common"
	"hexaverse/space"
)

type atomicCreator interface {
	CreateIfAbsent(context.Context, Fleet) (*Fleet, error)
}

func requireAtomicCreator(t *testing.T, d Dao) atomicCreator {
	t.Helper()
	a, ok := d.(atomicCreator)
	if !ok {
		t.Fatal("DAO missing contracted CreateIfAbsent")
	}
	return a
}

type atomicErrorFirestore struct {
	common.FirestoreService
	createErr, readErr error
}

func (f atomicErrorFirestore) Create(context.Context, string, string, interface{}) error {
	return f.createErr
}
func (f atomicErrorFirestore) Get(context.Context, string, string) (*firestore.DocumentSnapshot, error) {
	return nil, f.readErr
}
func TestAtomicSeedDAO_CreateReadAndMissingWinnerErrors(t *testing.T) {
	sentinel := errors.New("storage unavailable")
	for _, row := range []struct {
		name         string
		create, read error
	}{{"create", sentinel, nil}, {"read", status.Error(codes.AlreadyExists, "exists"), sentinel}, {"missing", status.Error(codes.AlreadyExists, "exists"), status.Error(codes.NotFound, "missing")}} {
		t.Run(row.name, func(t *testing.T) {
			a := requireAtomicCreator(t, NewDaoWithClient(atomicErrorFirestore{createErr: row.create, readErr: row.read}))
			got, err := a.CreateIfAbsent(context.Background(), Fleet{Id: "candidate", CorporationId: "corp", State: anyParkedState()})
			if err == nil || got != nil {
				t.Fatal("persistence failure returned candidate success")
			}
			if row.name != "missing" && !errors.Is(err, sentinel) {
				t.Fatalf("storage cause not propagated: %v", err)
			}
		})
	}
}
func TestAtomicSeedDAO_RealAtomicContentionAndWinnerPreservation(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	id := "atomic-seed-contention-fixture"
	t.Cleanup(func() { _, _ = client.Collection(firestoreCollection).Doc(id).Delete(context.Background()) })
	dao := NewDaoWithClient(fs)
	a := requireAtomicCreator(t, dao)
	first := Fleet{Id: id, CorporationId: "atomic-real", SystemId: "home", AttachedTo: "station", State: anyParkedState(), Cargo: map[string]float64{"fuel": 100}}
	second := first
	second.AttachedTo = "different"
	second.Cargo = map[string]float64{"fuel": 5}
	var got [2]*Fleet
	var errs [2]error
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, candidate := range []Fleet{first, second} {
		wg.Add(1)
		go func(i int, c Fleet) {
			defer wg.Done()
			<-start
			got[i], errs[i] = a.CreateIfAbsent(context.Background(), c)
		}(i, candidate)
	}
	close(start)
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if !atomicDomainEqual(got[0], got[1]) {
		t.Fatal("atomic contenders returned different winners")
	}
	winner, err := dao.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	winner.SystemId = "moved"
	winner.AttachedTo = "moved-host"
	winner.Cargo = map[string]float64{"fuel": 13}
	winner.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 45}}}
	if err := dao.Save(context.Background(), *winner); err != nil {
		t.Fatal(err)
	}
	prior, err := dao.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	retry, err := a.CreateIfAbsent(context.Background(), first)
	if err != nil || !atomicDomainEqual(retry, prior) {
		t.Fatalf("loser overwrote moved winner: %+v %v", retry, err)
	}
	after, err := dao.Get(context.Background(), id)
	if err != nil || !atomicDomainEqual(after, prior) {
		t.Fatal("loser changed durable state")
	}
}
func TestAtomicSeedDAO_CorruptOrForeignWinnerRejected(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	for _, name := range []string{"corrupt", "foreign"} {
		t.Run(name, func(t *testing.T) {
			id := "atomic-seed-invalid-" + name
			t.Cleanup(func() { _, _ = client.Collection(firestoreCollection).Doc(id).Delete(context.Background()) })
			dao := NewDaoWithClient(fs)
			a := requireAtomicCreator(t, dao)
			if name == "corrupt" {
				if _, err := client.Collection(firestoreCollection).Doc(id).Set(context.Background(), map[string]interface{}{"id": id, "corporationId": "corp", "state": map[string]interface{}{"mode": "invalid"}}); err != nil {
					t.Fatal(err)
				}
			} else {
				if err := dao.Save(context.Background(), Fleet{Id: id, CorporationId: "foreign", State: anyParkedState()}); err != nil {
					t.Fatal(err)
				}
			}
			got, err := a.CreateIfAbsent(context.Background(), Fleet{Id: id, CorporationId: "corp", State: anyParkedState()})
			if err == nil || got != nil {
				t.Fatal("invalid existing winner returned as candidate success")
			}
		})
	}
}

// StateDoc is a storage codec representation (Firestore normalizes number types);
// compare all served/domain fields, not incidental map encoding types.
func atomicDomainEqual(a, b *Fleet) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	aa, bb := *a, *b
	aa.StateDoc = nil
	bb.StateDoc = nil
	return reflect.DeepEqual(aa, bb)
}
