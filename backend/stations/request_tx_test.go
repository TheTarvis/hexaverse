package stations

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
)

// The decrement is two-phase (prepare reads, apply writes) because Firestore
// forbids a read after a write inside one transaction, and a sale composes three
// domains' primitives into a single transaction.

func decrementFixture(t *testing.T) (*DaoImpl, *firestore.Client, string, func()) {
	t.Helper()
	db, client := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWithClient(db).(*DaoImpl)
	const gid = "gal-dec"
	sid := "sys-" + t.Name()
	ctx := context.Background()

	if _, err := dao.Ref(gid, sid).Set(ctx, Station{
		SystemId: sid, FeatureId: StationFeatureId, CreatedAt: 1000,
		Requests: []Request{
			{Id: "req-1", Kind: "metals", UnitPrice: 140, RemainingQuantity: 40, ExpiresAt: 1_000_000},
			{Id: "req-lapsed", Kind: "metals", UnitPrice: 200, RemainingQuantity: 40, ExpiresAt: 10},
		},
	}); err != nil {
		t.Fatalf("seeding station: %v", err)
	}
	cleanup := func() {
		common.CleanupFirestoreTestData(t, client,
			fmt.Sprintf("%s/%s/%s/%s/%s", galaxiesCollection, gid, systemsSubcol, sid, stationSubcol))
	}
	return dao, client, sid, cleanup
}

func TestPrepareRequestDecrement_AppliesAndTalliesTheWindow(t *testing.T) {
	dao, _, sid, cleanup := decrementFixture(t)
	defer cleanup()
	ctx := context.Background()

	err := dao.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		plan, err := dao.PrepareRequestDecrementInTx(tx, "gal-dec", sid,
			[]Decrement{{RequestId: "req-1", Tons: 10}}, "metals", 500, 10, 1000)
		if err != nil {
			return err
		}
		return plan.Apply(tx)
	})
	if err != nil {
		t.Fatalf("decrement transaction: %v", err)
	}

	st, err := dao.Get(ctx, "gal-dec", sid)
	if err != nil {
		t.Fatalf("re-reading station: %v", err)
	}
	for _, r := range st.Requests {
		if r.Id == "req-1" && r.RemainingQuantity != 30 {
			t.Errorf("remaining = %v, want 30 after filling 10 of 40", r.RemainingQuantity)
		}
	}
	if st.WindowSpend["metals"] != 500 {
		t.Errorf("windowSpend = %v, want the floor spend recorded against the ceiling", st.WindowSpend)
	}
	if st.WindowAbsorbed["metals"] != 10 {
		t.Errorf("windowAbsorbed = %v, want 10", st.WindowAbsorbed)
	}
}

func TestPrepareRequestDecrement_RefusesAnOversell(t *testing.T) {
	dao, _, sid, cleanup := decrementFixture(t)
	defer cleanup()

	err := dao.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		// 40 tons remain; asking for 60 must be refused IN FULL, never reduced to
		// the 40 that would fit — the caller decides what to do about it.
		_, err := dao.PrepareRequestDecrementInTx(tx, "gal-dec", sid,
			[]Decrement{{RequestId: "req-1", Tons: 60}}, "metals", 0, 60, 1000)
		return err
	})
	if !errors.Is(err, ErrRequestOversold) {
		t.Fatalf("oversell = %v, want ErrRequestOversold", err)
	}
}

func TestPrepareRequestDecrement_RefusesAnExpiredOrMissingRequest(t *testing.T) {
	dao, _, sid, cleanup := decrementFixture(t)
	defer cleanup()

	// An expired request stops being fillable even with tonnage left on it.
	expiredErr := dao.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		_, err := dao.PrepareRequestDecrementInTx(tx, "gal-dec", sid,
			[]Decrement{{RequestId: "req-lapsed", Tons: 1}}, "metals", 0, 1, 1000)
		return err
	})
	if !errors.Is(expiredErr, ErrRequestGone) {
		t.Errorf("expired request = %v, want ErrRequestGone", expiredErr)
	}

	missingErr := dao.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		_, err := dao.PrepareRequestDecrementInTx(tx, "gal-dec", sid,
			[]Decrement{{RequestId: "req-vanished", Tons: 1}}, "metals", 0, 1, 1000)
		return err
	})
	if !errors.Is(missingErr, ErrRequestGone) {
		t.Errorf("missing request = %v, want ErrRequestGone", missingErr)
	}
}

func TestPrepareRequestDecrement_ConcurrentFillsNeverOversell(t *testing.T) {
	dao, _, sid, cleanup := decrementFixture(t)
	defer cleanup()

	// Three sellers each filling 20 tons of a 40-ton request. Everything rides one
	// document, so Firestore's own transaction serialization is what bounds it —
	// at most two may settle.
	var wg sync.WaitGroup
	errs := make([]error, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = dao.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
				plan, err := dao.PrepareRequestDecrementInTx(tx, "gal-dec", sid,
					[]Decrement{{RequestId: "req-1", Tons: 20}}, "metals", 0, 20, 1000)
				if err != nil {
					return err
				}
				return plan.Apply(tx)
			})
		}(i)
	}
	wg.Wait()

	st, err := dao.Get(context.Background(), "gal-dec", sid)
	if err != nil {
		t.Fatalf("re-reading station: %v", err)
	}
	for _, r := range st.Requests {
		if r.Id == "req-1" && r.RemainingQuantity < 0 {
			t.Errorf("remaining = %v, went negative — the request was oversold", r.RemainingQuantity)
		}
	}
}
