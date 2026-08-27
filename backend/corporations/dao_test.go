package corporations

import (
	"context"
	"errors"
	"testing"

	"hexaverse/common"
)

func newDaoUnderTest(t *testing.T) (Dao, context.Context) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	t.Cleanup(func() {
		common.CleanupFirestoreTestData(t, client, corporationsCollection, accountPointerCollection, spawnClaimsCollection)
	})
	return NewDaoWithClient(fs), context.Background()
}

// TestDao_CreateWithPointer_UniquePerAccount is the spawn anchor: the first corp
// for an account commits (corp doc + pointer), a second for the SAME account is
// rejected — the one-living-corp-per-account guard.
func TestDao_CreateWithPointer_UniquePerAccount(t *testing.T) {
	dao, ctx := newDaoUnderTest(t)

	first := Corporation{Id: "corp_1", AccountId: "acct-1", Name: "One", CreatedAt: 1000, HomeSystemId: "sys_1_0"}
	if err := dao.CreateWithPointer(ctx, first); err != nil {
		t.Fatalf("first create: %v", err)
	}
	second := Corporation{Id: "corp_2", AccountId: "acct-1", Name: "Two", CreatedAt: 2000, HomeSystemId: "sys_2_0"}
	if err := dao.CreateWithPointer(ctx, second); !errors.Is(err, ErrAccountHasCorp) {
		t.Fatalf("second create for same account: err = %v, want ErrAccountHasCorp", err)
	}

	// The pointer still resolves to the first corp; the second doc was never written.
	got, err := dao.CorpIdForAccount(ctx, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if got != "corp_1" {
		t.Fatalf("pointer = %s, want corp_1", got)
	}
	if c2, _ := dao.Get(ctx, "corp_2"); c2 != nil {
		t.Fatal("rejected corp doc should not exist")
	}
}

// TestDao_CorpIdForAccount_Absent returns "" (not an error) for an account that
// hasn't woken — the corpless signal the ActorCorp seam relies on.
func TestDao_CorpIdForAccount_Absent(t *testing.T) {
	dao, ctx := newDaoUnderTest(t)
	got, err := dao.CorpIdForAccount(ctx, "nobody")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "" {
		t.Fatalf("corpId = %q, want empty", got)
	}
}

// TestDao_ListLiving_ExcludesDead folds only the living corps (a dead one carries
// a diedAt stamp) — the set site selection unions claimed space across.
func TestDao_ListLiving_ExcludesDead(t *testing.T) {
	dao, ctx := newDaoUnderTest(t)

	alive := Corporation{Id: "corp_alive", AccountId: "a", Name: "Alive", CreatedAt: 1, HomeSystemId: "sys_alive_0"}
	dead := Corporation{Id: "corp_dead", AccountId: "b", Name: "Dead", CreatedAt: 1, HomeSystemId: "sys_dead_0"}
	if err := dao.CreateWithPointer(ctx, alive); err != nil {
		t.Fatal(err)
	}
	if err := dao.CreateWithPointer(ctx, dead); err != nil {
		t.Fatal(err)
	}
	if err := dao.SetDiedAt(ctx, dead.Id, common.WorldMillis(5000)); err != nil {
		t.Fatal(err)
	}

	living, err := dao.ListLiving(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(living) != 1 || living[0].Id != "corp_alive" {
		t.Fatalf("living = %+v, want just corp_alive", living)
	}

	// The dead corp is retrievable as history, with its stamp.
	d, err := dao.Get(ctx, "corp_dead")
	if err != nil {
		t.Fatal(err)
	}
	if d == nil || d.Living() || d.DiedAt != 5000 {
		t.Fatalf("dead corp = %+v, want diedAt=5000", d)
	}
}
