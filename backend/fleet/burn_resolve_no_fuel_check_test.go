package fleet

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 2.3
// ("Confirm resolve performs no fuel check of any kind (regression guard
// against a resolve-time re-check creeping in)") — fleet-movement "A Burn
// Commit Is Rejected When Its Fuel Cost Exceeds Available Fuel, Debited At
// Commit Never At Resolve":
//
//   - "A committed burn can never fail to resolve for lack of fuel"
//
// THIS IS DELIBERATELY A REGRESSION GUARD, NOT AN ADVERSARIALLY RED TEST:
// BurnResolver (resolver.go) today reads NOTHING from the decoded Fleet
// except its SystemId/State/AttachedTo-adjacent fields to fold
// space.StateAt and settle motion — it already never looks at Cargo at all.
// So this test is GREEN from the moment it is written, and stays green
// through this change's implementation: it exists to CATCH a future
// implementer who "fixes" fuel-at-commit by also adding a defensive re-check
// at resolve (which the requirement explicitly forbids — the whole point of
// commit-time debit is that resolve can never fail for lack of fuel). Per
// the scenario-test-automation skill, a guard confirming existing behavior
// doesn't regress is legitimate red-phase content even when it does not
// itself go red first; it is reported honestly as such in the SDET coverage
// table rather than presented as new adversarial coverage.
//
// A fleet arriving with cargo.fuel driven NEGATIVE (impossible if commit-time
// debit is implemented correctly, since a debit can never exceed what commit
// verified was available — but exactly what a resolve-time re-check bug
// would need to trip on) is the sharpest fixture: if any future resolve path
// starts comparing fuel against the burn's cost, a negative balance is
// guaranteed to fail it, while a resolve path that (correctly) never looks at
// fuel at all sails through unaffected.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/space"
)

func TestBurnResolver_Scenario_ACommittedBurnCanNeverFailToResolveForLackOfFuel(t *testing.T) {
	bodies := testBodyTable(t, "sys-fuel-resolve", 6.0)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	point := space.Vec3{X: 300}
	burning := Fleet{
		Id: "fleet_fuel_resolve", CorporationId: "corp-1", SystemId: "sys-fuel-resolve",
		// A fleet arriving with a NEGATIVE fuel balance is unreachable under a
		// correctly-implemented commit-time debit (task 2.1/2.2 verify
		// affordability against the SAME fleet, in the SAME transaction, before
		// ever storing this burn) — it exists purely to poison any resolve path
		// that starts comparing fuel against cost. A resolve that (correctly)
		// never reads Cargo at all is unaffected by this value either way.
		Cargo: map[string]float64{"fuel": -1_000_000},
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: 20}, Target: space.Target{Point: &point}, Intercept: point,
			Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     150_000, // past ArriveMs
		Action: action.Action{Id: "action_fuel_resolve"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = burning
			return nil
		},
	})
	if err != nil {
		t.Fatalf("fleet-movement \"A committed burn can never fail to resolve for lack of fuel\": resolve "+
			"returned an error for a fleet whose stored fuel is deeply negative — resolution must proceed exactly "+
			"as it would with fuel-as-cargo absent from the game, because the full cost was already paid, and can "+
			"never have been paid only partially, at commit. Got: %v", err)
	}
	if res.Outcome != "arrived" {
		t.Errorf("resolve outcome = %q, want %q — a fuel re-check must never block or alter an ordinary arrival",
			res.Outcome, "arrived")
	}
	// The settled ActorState must carry no fuel-shaped mutation of its own —
	// resolve settles motion state ONLY (state/attachedTo/updatedAt), never a
	// cargo field. A future resolve-time "helpfully" zeroing or clamping fuel
	// would trip this.
	if _, touched := res.ActorState["cargo"]; touched {
		t.Errorf("fleet-movement \"A committed burn can never fail to resolve for lack of fuel\": resolve's " +
			"ActorState names \"cargo\" — resolve must never mutate a fleet's cargo pool at all; fuel moves only " +
			"at commit (debit), discard (refund), refuel (credit), and spawn healing (grant)")
	}
}
