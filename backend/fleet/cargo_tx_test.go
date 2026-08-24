package fleet

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"hexaverse/board"
	"hexaverse/common"

	"cloud.google.com/go/firestore"
)

// The cargo debit is two-phase (prepare reads, apply writes) because Firestore
// requires every read before every write in a transaction, and a sale composes
// this primitive with the balance credit and the station's request decrement
// inside one transaction.

func cargoFixture(t *testing.T, cargo map[string]float64) (*DaoImpl, *firestore.Client, string, func()) {
	t.Helper()
	db, client := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWithClient(db).(*DaoImpl)
	fleetID := "fleet-cargo-" + t.Name()
	ctx := context.Background()

	if _, err := client.Collection(firestoreCollection).Doc(fleetID).Set(ctx, Fleet{
		Id: fleetID, CorporationId: "corp-1", SystemId: "sys-1",
		State: board.MovementState{
			Mode: board.ModeDocked, Docked: &board.Docked{ParentId: "feat-station"},
		},
		Cargo: cargo,
	}); err != nil {
		t.Fatalf("seeding fleet: %v", err)
	}
	return dao, client, fleetID, func() {
		common.CleanupFirestoreTestData(t, client, firestoreCollection)
	}
}

func (dao *DaoImpl) debit(t *testing.T, fleetID, kind string, tons float64) error {
	t.Helper()
	return dao.db.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		plan, err := dao.PrepareCargoDebitInTx(tx, fleetID, kind, tons)
		if err != nil {
			return err
		}
		return plan.Apply(tx)
	})
}

func TestPrepareCargoDebit_DebitsTheHold(t *testing.T) {
	dao, client, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 40, "water": 5})
	defer cleanup()

	if err := dao.debit(t, fleetID, "metals", 10); err != nil {
		t.Fatalf("debit: %v", err)
	}

	f, err := dao.Get(context.Background(), fleetID)
	if err != nil {
		t.Fatalf("re-reading fleet: %v", err)
	}
	if f.Cargo["metals"] != 30 {
		t.Errorf("metals = %v, want 30", f.Cargo["metals"])
	}
	// Other kinds are untouched.
	if f.Cargo["water"] != 5 {
		t.Errorf("water = %v, want 5 — an unrelated kind was disturbed", f.Cargo["water"])
	}
	_ = client
}

func TestPrepareCargoDebit_SellingAKindToZeroDropsItFromTheMap(t *testing.T) {
	dao, _, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 10})
	defer cleanup()

	if err := dao.debit(t, fleetID, "metals", 10); err != nil {
		t.Fatalf("debit: %v", err)
	}

	f, err := dao.Get(context.Background(), fleetID)
	if err != nil {
		t.Fatalf("re-reading fleet: %v", err)
	}
	// A fleet with no stored cargo already reads as empty, so leaving a 0-ton
	// entry behind would make "holds nothing" untestable.
	if _, present := f.Cargo["metals"]; present {
		t.Errorf("metals still present at %v after being sold to zero", f.Cargo["metals"])
	}
}

func TestPrepareCargoDebit_RefusesMoreThanIsHeld(t *testing.T) {
	dao, _, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 10})
	defer cleanup()

	// Refused IN FULL — never reduced to whatever happens to be aboard, which
	// would silently sell a different quantity than the caller asked for.
	if err := dao.debit(t, fleetID, "metals", 25); !errors.Is(err, ErrInsufficientCargo) {
		t.Fatalf("over-debit = %v, want ErrInsufficientCargo", err)
	}
	f, _ := dao.Get(context.Background(), fleetID)
	if f.Cargo["metals"] != 10 {
		t.Errorf("metals = %v after a refused debit, want 10 untouched", f.Cargo["metals"])
	}
}

func TestPrepareCargoDebit_RejectsInvalidTonnage(t *testing.T) {
	dao, _, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 10})
	defer cleanup()

	for name, tons := range map[string]float64{"zero": 0, "negative": -5} {
		if err := dao.debit(t, fleetID, "metals", tons); !errors.Is(err, ErrInvalidDebit) {
			t.Errorf("%s tonnage = %v, want ErrInvalidDebit", name, err)
		}
	}
}

func TestPrepareCargoDebit_UnknownKindIsInsufficientNotAPanic(t *testing.T) {
	dao, _, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 10})
	defer cleanup()

	if err := dao.debit(t, fleetID, "exotic", 1); !errors.Is(err, ErrInsufficientCargo) {
		t.Errorf("debiting a kind the fleet holds none of = %v, want ErrInsufficientCargo", err)
	}
}

func TestPrepareCargoDebit_DockedAtReadsTheEffectiveState(t *testing.T) {
	dao, _, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 10})
	defer cleanup()

	err := dao.db.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		plan, err := dao.PrepareCargoDebitInTx(tx, fleetID, "metals", 1)
		if err != nil {
			return err
		}
		if !plan.DockedAt("feat-station", 1000) {
			t.Error("the fleet reads as not docked to the station it is docked to")
		}
		if plan.DockedAt("feat-body-0", 1000) {
			t.Error("the fleet reads as docked to a feature it is not docked to")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("transaction: %v", err)
	}
}

func TestPrepareCargoDebit_ConcurrentDebitsNeverOversellOneHold(t *testing.T) {
	dao, _, fleetID, cleanup := cargoFixture(t, map[string]float64{"metals": 30})
	defer cleanup()

	// Two debits of 20 against a 30-ton hold. The transactional re-read is the
	// only thing stopping both from passing a stale pre-check.
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = dao.debit(t, fleetID, "metals", 20)
		}(i)
	}
	wg.Wait()

	settled := 0
	for _, err := range errs {
		if err == nil {
			settled++
		}
	}
	if settled != 1 {
		t.Fatalf("%d of 2 concurrent debits settled, want exactly 1 (errors: %v, %v)", settled, errs[0], errs[1])
	}
	f, _ := dao.Get(context.Background(), fleetID)
	if f.Cargo["metals"] != 10 {
		t.Errorf("metals = %v, want 10", f.Cargo["metals"])
	}
	_ = fmt.Sprint()
}
