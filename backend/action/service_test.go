package action

import (
	"context"
	"errors"
	"testing"

	"go.uber.org/mock/gomock"
)

// Commit freezes the action from the spec — type, kind (from the registered
// resolver), channel slot, params, and the commit-time clock — before the DAO
// claims the slot transactionally. The channel (#0006 Decision #19) must ride
// the action doc, or resolve/cancel would release the wrong slot.
func TestCommit_FreezesSpecAndChannel(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	clk := &fakeClock{now: 500}
	svc := NewServiceWith(dao, clk, nil)
	svc.RegisterResolver("scan-t", KindMutating, noopResolver)

	var got Action
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, a Action, _ map[string]interface{}) error {
			got = a
			return nil
		})

	a, err := svc.Commit(context.Background(), CommitSpec{
		Type: "scan-t", Actor: "fleet-1", ActorCollection: "fleets",
		Scope: "sys-1", Slot: SlotSensor, Eta: 9_000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Slot != SlotSensor {
		t.Errorf("stored slot = %q, want the sensor channel", got.Slot)
	}
	if got.Kind != KindMutating {
		t.Errorf("stored kind = %q, want the registered resolver's kind", got.Kind)
	}
	if got.CommittedAt != 500 || got.Eta != 9_000 || got.Status != StatusRunning {
		t.Errorf("frozen lifecycle wrong: %+v", got)
	}
	if a.Id == "" || got.Id != a.Id {
		t.Errorf("returned action must be the stored one (id %q vs %q)", a.Id, got.Id)
	}
}

// A type with no registered resolver can never commit — there would be nothing
// to run at its eta.
func TestCommit_RejectsUnknownType(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	svc := NewServiceWith(NewMockDao(ctrl), &fakeClock{}, nil)

	if _, err := svc.Commit(context.Background(), CommitSpec{Type: "nope"}); !errors.Is(err, ErrUnknownType) {
		t.Fatalf("err = %v, want ErrUnknownType", err)
	}
}
