package fleet

// The settlement every consumer OTHER than `hold`/`release` owes an open or
// elapsed station-keeping hold (add-stationkeep-hold-verb; fleet-movement
// "Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded Into
// the Stored Cargo Pool", "Every Decision Reading Fuel Settles a
// Past-Dry-Instant Hold First").
//
// Three distinct shapes live here, and the difference between them is the
// whole design:
//
//   - the PRECEDING, INDEPENDENT, CONDITIONAL write every fuel-reading
//     DECISION issues before deciding, because three of those decisions are
//     transactions that may abort with an answer and would discard a
//     settlement written inside them;
//   - the IN-TRANSACTION hold-ending settlement every verb that ends or
//     abandons a hold applies in the same transaction as its own effects,
//     never restamping, because no hold remains to restamp;
//   - the IN-TRANSACTION MID-HOLD settlement, the one event that leaves the
//     hold open afterward and therefore restamps it.

import (
	"context"
	"fmt"

	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"
)

// forceDemotionMerge is the automatic past-dry-instant settlement: the park
// folded to its released orbit and `cargo.fuel` persisted at EXACTLY
// FuelParams.StationKeepReserveTons — never zero, never negative
// (fleet-movement "Fuel exhaustion during a hold force-demotes to orbit,
// never negative"; "An exhausted hold leaves exactly the reserve, never
// zero"). Attachment and docked/undocked status are deliberately absent from
// the merge: they survive the transition untouched.
func (s *Service) forceDemotionMerge(p space.Park, now common.WorldMillis) map[string]interface{} {
	return map[string]interface{}{
		"state":     EncodeKinematicState(parkedState(releasedParkOf(p))),
		"cargo":     map[string]interface{}{"fuel": s.currentFuelParams().StationKeepReserveTons},
		"updatedAt": int64(now),
	}
}

// settleExpiredHoldFirst is the PRECEDING, INDEPENDENT, CONDITIONAL write
// every fuel-reading decision performs before evaluating anything
// (fleet-movement "Every Decision Reading Fuel Settles a Past-Dry-Instant
// Hold First").
//
// It is a separate write, not a step inside the decision, because three of
// the deciding transactions may abort WITH AN ANSWER — `hold`'s own commit,
// a burn commit, and the transaction-scoped free-hold figure a refuel
// re-evaluates — and action-dispatch guarantees a rejecting producer
// persists nothing, so a settlement written inside one is discarded by
// construction.
//
// It is CONDITIONAL and TRANSACTIONAL because it is itself a `cargo.fuel`
// mutator that nothing serializes: it re-reads the park and the cargo inside
// its own transaction and applies the settlement only if that re-read still
// shows an unfolded `stationkeep` park at or after its dry instant,
// otherwise writing NOTHING. An unconditional absolute set from a
// pre-transaction read would destroy a refuel that landed in between — the
// purchased tonnage and the credits spent on it both.
//
// Returns the fleet as it stands after the write (reloaded when it wrote).
func (s *Service) settleExpiredHoldFirst(ctx context.Context, f *Fleet) (*Fleet, error) {
	// A fleet in lane transit has no position in either system and its stale
	// stored state SHALL NOT be evaluated by any reader — including this one.
	if f == nil || f.Jump != nil {
		return f, nil
	}
	p, ok := heldPark(f)
	if !ok || !isExpiredHold(p, s.clock.Now()) {
		return f, nil
	}
	wrote := false
	err := s.runFleetTx(ctx, f.Id, func(cur *Fleet) (map[string]interface{}, error) {
		// The re-read decides, never the snapshot this call was entered
		// with: a refuel may have settled and credited in between, in which
		// case there is no longer a hold to settle and this write must do
		// nothing at all.
		p, ok := heldPark(cur)
		if !ok || !isExpiredHold(p, s.clock.Now()) {
			return nil, nil
		}
		wrote = true
		now := s.clock.Now()
		cur.State = parkedState(releasedParkOf(p))
		if cur.Cargo == nil {
			cur.Cargo = map[string]float64{}
		}
		cur.Cargo["fuel"] = s.currentFuelParams().StationKeepReserveTons
		cur.UpdatedAt = now
		return s.forceDemotionMerge(p, now), nil
	})
	if err != nil {
		return nil, fmt.Errorf("fleet: settling an elapsed station-keeping hold: %w", err)
	}
	if !wrote {
		return f, nil
	}
	return s.load(ctx, f.Id)
}

// settledFuelInTx is the HOLD-ENDING settlement, evaluated against a
// transaction's OWN re-read (fleet-movement "Station-Keeping Upkeep Is
// Settled at Discrete Events...", the universal hold-ending bullet): every
// verb that ends or abandons an open `stationkeep` park debits
// upkeepTons(holdStart, eventTime) in the same transaction that ends it,
// before applying its own effects, and NEVER restamps — no hold remains to
// restamp.
//
// A hold already at or past its stored dry instant settles instead by the
// automatic fold, to exactly the reserve, and NO upkeepTons debit is stacked
// on top of it: the fold has already priced the whole hold, and charging
// both would debit one accrual twice.
//
// Reports the post-settlement fuel figure, the released park to store in the
// ended hold's place, and whether there was a hold at all. `rate` is
// space.StationKeepRate for the held body.
func (s *Service) settledFuelInTx(p space.Park, storedFuel, rate float64, now common.WorldMillis) (fuel float64, released space.Park, ended bool) {
	if p.Kind != space.ParkStationkeep || p.DryInstantMs <= p.HoldStartMs {
		return storedFuel, space.Park{}, false
	}
	if now >= p.DryInstantMs {
		return s.currentFuelParams().StationKeepReserveTons, releasedParkOf(p), true
	}
	fuel = storedFuel - upkeepTons(rate, p.HoldStartMs, now, s.currentFuelParams())
	if fuel < 0 {
		fuel = 0
	}
	return fuel, space.ReleaseStationkeep(p.BodyId, p.Offset, now, p.PeriodMs), true
}

// holdEndingMergeInTx folds settledFuelInTx into the actor-doc merge a
// hold-ending verb's own transaction carries: the settled `cargo.fuel` and
// the released park in the ended hold's place. Returns the post-settlement
// fuel figure so the verb can evaluate its own cost against it, and whether
// a hold was ended at all.
//
// `merge` is mutated in place. Attachment is never touched.
func (s *Service) holdEndingMergeInTx(merge map[string]interface{}, actorData map[string]interface{}, rate float64, now common.WorldMillis) (fuel float64, ended bool) {
	storedFuel := readCargoFuel(actorData)
	p, ok := storedStationkeepPark(actorData)
	if !ok {
		return storedFuel, false
	}
	settled, released, ended := s.settledFuelInTx(p, storedFuel, rate, now)
	if !ended {
		return storedFuel, false
	}
	merge["cargo"] = map[string]interface{}{"fuel": settled}
	merge["state"] = EncodeKinematicState(parkedState(released))
	return settled, true
}

// stopInPlaceWrite is stop-in-place's free, below-the-speed-floor branch's
// own persistence: ONE transaction against a transactional re-read that
// stores the `point` park, clears `attachedTo`, stamps `updatedAt`, credits
// any prior running burn's discard refund, and settles any station-keeping
// hold this stop ends — UNCONDITIONALLY, whether or not there is an action
// to cancel (add-stationkeep-hold-verb task 4.5).
//
// A fleet holding at a lane gate ALWAYS reaches this branch: a `stationkeep`
// park's velocity is exactly its host body's, and every lane gate is
// motionless by construction, so that velocity is zero. Without this write
// "hold, stop, pay nothing" makes camping a gate free — and, independently
// of any hold, the branch persisted nothing at all for a fleet with no
// active action.
//
// Returns the fleet's post-write `fuel` figure.
func (s *Service) stopInPlaceWrite(ctx context.Context, f *Fleet, bt *system.BodyTable, newState space.ShipState, now common.WorldMillis) (float64, error) {
	var fuelAfter float64
	err := s.runFleetTx(ctx, f.Id, func(cur *Fleet) (map[string]interface{}, error) {
		merge := map[string]interface{}{
			"state":      EncodeKinematicState(newState),
			"attachedTo": "",
			"updatedAt":  int64(now),
		}
		// Read everything the settlement depends on BEFORE overwriting the
		// re-read fleet's own state with the point park below: the hold to
		// settle and the refund to credit are both properties of the state
		// this stop is REPLACING.
		var settledFuel float64
		if fuelTrackingEngaged(cur) {
			settledFuel = cur.Cargo["fuel"]
			if p, ok := heldPark(cur); ok {
				settled, _, ended := s.settledFuelInTx(p, settledFuel, stationKeepRateFor(bt, p.BodyId), now)
				if ended {
					settledFuel = settled
				}
			}
			settledFuel += priorBurnRefund(cur, now)
			if settledFuel < 0 {
				settledFuel = 0
			}
		}

		cur.State = newState
		cur.AttachedTo = ""
		cur.UpdatedAt = now
		if !fuelTrackingEngaged(cur) {
			return merge, nil
		}
		fuelAfter = settledFuel
		cur.Cargo["fuel"] = settledFuel
		cur.BurnFuelCostTons = 0
		merge["cargo"] = map[string]interface{}{"fuel": settledFuel}
		merge["burnFuelCostTons"] = float64(0)
		return merge, nil
	})
	if err != nil {
		return 0, fmt.Errorf("fleet: persisting a stop in place: %w", err)
	}
	return fuelAfter, nil
}

// SettleExpiredHold is the IN-TRANSACTION settlement seam `mine`'s
// resolve-time clamp uses (fleet-movement "FreeHold used by mine's resolve
// clamp reflects a settled hold").
//
// That clamp is deliberately NOT one of the consumers owing a preceding,
// independent settlement write. Its FreeHold read runs inside a ResolveFunc
// that action.ResolveOne invokes WITHIN its own transaction, reached from
// three fleet-unaware entry points and with no per-type pre-transaction hook,
// so a preceding write would oblige a new pre-resolve seam in the action
// spine that no requirement authorizes. Nor does the abort-with-an-answer
// hazard reach it: a resolver error aborts that transaction and leaves the
// action `running` for a later resolve to retry, so a settlement written
// inside it is retried rather than dropped, and the resolve result's own
// actor-state merge lands on the same fleet document in the same
// transaction. And no outcome depends on the choice: a settlement only ever
// DEBITS fuel, so it can only widen free hold.
//
// It mutates f in place — so the caller's own FreeHold read sees the settled
// figure — and merges its writes into actorState (allocating one if given
// nil), which the caller returns as its ResolveResult.ActorState. It reports
// the resulting map and whether anything was settled.
func SettleExpiredHold(f *Fleet, actorState map[string]interface{}, params FuelParams, now common.WorldMillis) (map[string]interface{}, bool) {
	if f == nil {
		return actorState, false
	}
	p, ok := storedStationkeepParkFromDoc(f.StateDoc)
	if !ok || !isExpiredHold(p, now) {
		return actorState, false
	}
	f.State = parkedState(releasedParkOf(p))
	f.StateDoc = EncodeKinematicState(f.State)
	if f.Cargo == nil {
		f.Cargo = map[string]float64{}
	}
	f.Cargo["fuel"] = params.StationKeepReserveTons

	if actorState == nil {
		actorState = map[string]interface{}{}
	}
	actorState["state"] = f.StateDoc
	cargo, _ := actorState["cargo"].(map[string]interface{})
	if cargo == nil {
		cargo = map[string]interface{}{}
	}
	cargo["fuel"] = params.StationKeepReserveTons
	actorState["cargo"] = cargo
	return actorState, true
}

// applyMidHoldSettlement is the MID-HOLD MUTATION step: the one settlement
// event that leaves the hold OPEN afterward, and therefore the only one that
// restamps it (fleet-movement "A refuel during an open hold settles the
// accrual, restamps the hold, and recomputes the dry instant";
// `fuel-purchase` "A refuel into an open hold settles, credits, and restamps
// in the one transaction").
//
// Reachable, not hypothetical: `hold` never alters `attachedTo` and
// `fuel-purchase` requires only "docked to a station", so dock-hold-refuel is
// ordinary play. Without the restamp the dry instant stays fixed against the
// PRE-refuel fuel baseline, and a player who holds with 1 t, buys 200 t and
// drifts past that stale instant loses all 200 t and the credits spent on
// them to the automatic fold.
//
// Ordered exactly as the requirement states: first debit the upkeep accrued
// since the hold's stored start time, then apply the mutation's own delta
// against the resulting balance, then restamp the hold's start time to the
// mutation's own instant and recompute the dry instant from the fuel level
// immediately after it. Both stamps move TOGETHER — a half-restamp either
// leaves the dry instant fixed against a moved baseline, or leaves every
// later accrual running from the original hold-start and double-charging.
//
// A hold already AT OR AFTER its stored dry instant is a different case
// entirely: this transaction-scoped free-hold figure is one of the three
// deciding transactions that may abort with an answer, so it aborts
// retryably rather than proceeding on the stale figure (task 4.10). Its
// retry's own preceding settlement write observes the past dry instant and
// settles it, and the retried credit then lands on the settled balance.
func (s *Service) applyMidHoldSettlement(ctx context.Context, plan *FuelCreditPlan, tons float64) error {
	p, ok := storedStationkeepParkFromDoc(plan.Fleet.StateDoc)
	if !ok {
		return nil
	}
	now := s.clock.Now()
	if isExpiredHold(p, now) {
		return ErrHoldExpiredMidCommit
	}
	bt, err := s.bodiesFor(ctx, plan.Fleet.SystemId)
	if err != nil {
		return fmt.Errorf("fleet: resolving bodies to settle a mid-hold fuel mutation: %w", err)
	}
	rate := stationKeepRateFor(bt, p.BodyId)

	settled := plan.Fleet.Cargo["fuel"] - upkeepTons(rate, p.HoldStartMs, now, s.currentFuelParams())
	if settled < 0 {
		settled = 0
	}
	credited := settled + tons

	restamped := p
	restamped.HoldStartMs = now
	restamped.DryInstantMs = dryInstantFor(now, credited, rate, s.currentFuelParams())
	if restamped.DryInstantMs <= restamped.HoldStartMs {
		// Unreachable for a CREDIT, which can only push the recomputed dry
		// instant later: exactly one mutation reachable today lands during an
		// open hold and leaves it open, and it is a credit. Guarded anyway
		// rather than persisting a park this capability's own codec cannot
		// read back — the brick `hold`'s insufficient-fuel precondition
		// exists to prevent.
		return ErrHoldWithoutFuel
	}

	plan.newFuel = credited
	plan.newStateDoc = EncodeKinematicState(parkedState(restamped))
	plan.surveyAt = now
	return nil
}
