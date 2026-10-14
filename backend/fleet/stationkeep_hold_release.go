package fleet

// The `hold` and `release` verbs themselves: their named rejections, the
// two closed-form quantities a hold turns on (its accrued upkeep and its
// dry instant), and the one-transaction-against-a-transactional-re-read seam
// they and every station-keeping settlement ride (add-stationkeep-hold-verb;
// fleet-movement "Station-Keeping Hold and Release Are Fleet Verbs",
// "Station-Keeping Upkeep Never Drains a Fleet Below Its Reserve",
// "Hold and Release Settle In One Transaction Against a Transactional
// Re-Read"). The settlement every OTHER consumer owes a hold lives in
// stationkeep_settlement_consumers.go.
//
// The one invariant the whole feature turns on: a fleet's STORED
// `cargo.fuel` is never a function of elapsed hold time. It moves only at
// discrete settlement events, which is what keeps FreeHold — and all five of
// its production call sites — a pure, time-independent read with no
// world-time parameter threaded through any of their signatures.

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	// ErrNotOrbiting rejects `hold` against a fleet whose EFFECTIVE park
	// mode is not `orbit` — a burn, a drift, a `point` park, or an
	// already-`stationkeep` park (fleet-movement "Holding a fleet that is
	// not orbiting is rejected by name").
	ErrNotOrbiting = errors.New("fleet: station-keeping hold requires a fleet in an orbit park")
	// ErrNotStationKeeping rejects `release` against a fleet whose
	// EFFECTIVE park mode is not `stationkeep` — including one whose hold
	// is at or after its stored dry instant, which the fold has already
	// released (fleet-movement "Releasing a fleet that is not
	// station-keeping is rejected by name", "A release at exactly the dry
	// instant is rejected, the fold having already released the hold").
	ErrNotStationKeeping = errors.New("fleet: release requires a fleet currently station-keeping")
	// ErrHoldWithoutFuel rejects `hold` against an orbiting fleet whose
	// currently held `fuel` is at or below FuelParams.StationKeepReserveTons
	// — the tonnage a hold may never spend — since the dry instant such a
	// hold would compute is not strictly after its own start time, and
	// persisting that park would brick the fleet: space-kinematics's own
	// decode rule rejects it outright (fleet-movement "Holding a fleet with
	// insufficient fuel is rejected, not silently bricked").
	//
	// It is also what `hold` surfaces when its own commit transaction
	// aborts on the in-transaction past-dry-instant guard below: the
	// settled figure is exactly the reserve by construction, so no hold is
	// affordable ("A hold whose dry instant passes between the settle-first
	// write and the commit is rejected, never restamped").
	ErrHoldWithoutFuel = errors.New("fleet: no spendable fuel above the station-keeping reserve to hold on")
	// ErrHoldExpiredMidCommit aborts a deciding transaction whose OWN
	// transactional re-read still shows a `stationkeep` park at or after its
	// stored dry instant — the window between the preceding, independent
	// settle-first write and the deciding transaction's own re-read
	// (fleet-movement "Every Decision Reading Fuel Settles a
	// Past-Dry-Instant Hold First", final scenario).
	//
	// It is RETRYABLE by construction and applies none of its transaction's
	// effects: the retry issues a fresh preceding settlement write, which
	// now observes the past dry instant and settles it before the decision
	// is re-evaluated. This check is fail-closed — its only failure mode is
	// a spurious abort of a decision that could have proceeded, never a
	// decision permitted to proceed against an unsettled figure.
	ErrHoldExpiredMidCommit = errors.New("fleet: the station-keeping hold's dry instant passed mid-commit; retry")
)

// settleFirstSeamHook is a TEST-ONLY seam, nil in production and a no-op
// when nil. Every consumer that performs the preceding, independent
// settle-first write invokes it immediately AFTER that write's own
// transaction has completed — whether or not it wrote anything — and BEFORE
// the deciding transaction opens.
//
// It exists because the window this change's in-transaction guard closes
// lives BETWEEN two transactions of one request and is otherwise
// unreachable from a test: the settle-first write reads the fleet at one
// instant and the deciding transaction re-reads it at a later one, and the
// dry instant may fall in between. add-stationkeep-hold-verb task 7.18
// authorises exactly this ("a hook after the settle write"). It carries
// zero production behaviour.
var settleFirstSeamHook func(fleetId string)

func fireSettleFirstSeam(fleetId string) {
	if settleFirstSeamHook != nil {
		settleFirstSeamHook(fleetId)
	}
}

// --- the two closed-form quantities -----------------------------------------

// upkeepTons is a hold's accrued upkeep between two world instants,
// converted to tons — the ONE accrual expression, delegated and never
// restated (fleet-movement "Station-Keeping Upkeep Is Settled at Discrete
// Events..."):
//
//	upkeepTons(from, to) = space.StationKeepUpkeep(rate, from, to) / FuelParams.DeltaVPerTon
//
// space.StationKeepUpkeep takes two WorldMillis stamps and ALREADY performs
// the milliseconds-to-seconds conversion internally, so this must not
// pre-divide the elapsed difference by 1000 and must not divide the returned
// figure by 1000 again — doing either under-charges by a factor of 1000.
// FuelParams.DeltaVPerTon is Δv PER TON, so the accrual side divides by it
// (the budget side, below, multiplies).
func upkeepTons(rate float64, from, to common.WorldMillis, p FuelParams) float64 {
	if p.DeltaVPerTon <= 0 {
		return 0
	}
	tons := space.StationKeepUpkeep(rate, from, to) / p.DeltaVPerTon
	if tons < 0 {
		return 0
	}
	return tons
}

// dryInstantFor is upkeepTons's ceiling-quantized INVERSE: the earliest
// world time T, quantized UP to an integer millisecond, at which
// space.StationKeepUpkeep(rate, holdStart, T) reaches or exceeds the hold's
// SPENDABLE Δv budget
//
//	spendableDeltaV = (fuelAtHoldStart − FuelParams.StationKeepReserveTons)
//	                      × FuelParams.DeltaVPerTon
//
// Quantized UP, never down, mirroring space-kinematics's "Burn Timing
// Quantizes to Integer World-Milliseconds by Ceiling", so a hold is never
// folded dry one millisecond before it is truly exhausted — which also means
// any strictly positive spendable remainder carries the dry instant at least
// one whole millisecond past the hold's start.
//
// The RESERVE SUBTRACTION IS LOAD-BEARING: a dry instant computed against
// the full fuelAtHoldStart would settle the fleet to zero, the passive
// stranding decisions.md forbids. And the direction of the DeltaVPerTon
// conversion is load-bearing too: it is Δv per ton, so a Δv BUDGET
// multiplies by it — inverting that understates a hold's endurance by
// DeltaVPerTon².
//
// A non-positive rate (impossible: space.StationKeepRate is floored strictly
// positive) or a non-positive spendable remainder yields holdStart itself,
// which the caller rejects rather than persists.
func dryInstantFor(holdStart common.WorldMillis, fuelTons, rate float64, p FuelParams) common.WorldMillis {
	spendableDeltaV := (fuelTons - p.StationKeepReserveTons) * p.DeltaVPerTon
	if !(spendableDeltaV > 0) || !(rate > 0) {
		return holdStart
	}
	seconds := spendableDeltaV / rate
	offset := math.Ceil(seconds * 1000)
	if math.IsInf(offset, 0) || math.IsNaN(offset) || offset > float64(math.MaxInt64/4) {
		return holdStart
	}
	return holdStart + common.WorldMillis(int64(offset))
}

// --- stored-park helpers ----------------------------------------------------

// storedStationkeepPark decodes a RAW, transactionally-read actor document's
// stored kinematic state and reports its `stationkeep` park, if that is what
// it holds. Used by every transaction-scoped producer that must decide
// against its OWN re-read rather than a pre-transaction snapshot.
//
// A state that is not a park, not decodable, or not a `stationkeep` park at
// all reports false — never a zero-valued park, whose zero hold window would
// read as "dry since the world epoch".
func storedStationkeepPark(actorData map[string]interface{}) (space.Park, bool) {
	st, _ := actorData["state"].(map[string]interface{})
	if st == nil {
		return space.Park{}, false
	}
	if mode, _ := st["mode"].(string); mode != "park" {
		return space.Park{}, false
	}
	p, err := space.DecodePark(st["value"])
	if err != nil || p.Kind != space.ParkStationkeep {
		return space.Park{}, false
	}
	return p, true
}

// heldPark reports the fleet's STORED `stationkeep` park, if it has one —
// the stored value, never the fold, because the fold is exactly what hides
// an expired hold.
func heldPark(f *Fleet) (space.Park, bool) {
	if f == nil || f.State.Mode != space.ModeParked || f.State.Park == nil {
		return space.Park{}, false
	}
	if f.State.Park.Kind != space.ParkStationkeep {
		return space.Park{}, false
	}
	return *f.State.Park, true
}

// isExpiredHold reports whether p is a well-formed `stationkeep` park whose
// stored dry instant has been reached — the "at or after" boundary
// space.StateAt itself folds on.
func isExpiredHold(p space.Park, now common.WorldMillis) bool {
	return p.Kind == space.ParkStationkeep && p.DryInstantMs > p.HoldStartMs && now >= p.DryInstantMs
}

// releasedParkOf is the fold's own released orbit, as of the hold's DRY
// INSTANT — never as of the observation time (space-kinematics "A
// Station-Keeping Park Past Its Dry Instant Is Its Released Orbit").
func releasedParkOf(p space.Park) space.Park {
	return space.ReleaseStationkeep(p.BodyId, p.Offset, p.DryInstantMs)
}

// parkedState wraps a park as a stored kinematic state.
func parkedState(p space.Park) space.ShipState {
	return space.ShipState{Mode: space.ModeParked, Park: &p}
}

// --- the settlements --------------------------------------------------------

// stationKeepRateFor resolves the upkeep rate a park's host body charges.
// A park with no resolvable host cannot have been a legal hold, so this
// degrades to the configured floor rather than failing a verb outright.
func stationKeepRateFor(bt *system.BodyTable, bodyId string) float64 {
	rate, err := space.StationKeepRate(bt, bodyId)
	if err != nil || !(rate > 0) {
		return space.StationKeepFloor
	}
	return rate
}

// StationKeepUpkeepRate is the READ-SIDE station-keeping upkeep rate for a
// fleet, in FUEL TONS PER SECOND — what an `orbit` park would cost were the
// player to hold, and what a `stationkeep` park is costing now
// (serve-orbital-elements-and-burn-preview, fleet-movement "Fleet Read Serves
// the Station-Keeping Upkeep Rate in Fuel Tons"). ok is false for a fleet
// whose effective state resolves to anything without a host body — a burn, a
// drift, a `point` park, or a fleet in lane transit — which is what makes the
// wire field's ABSENCE the answer to "no rate" rather than a zero.
//
// TONS, NEVER DELTA-V. space.StationKeepRate yields a delta-v rate; the
// conversion by FuelParams.DeltaVPerTon is rule-bearing — it is the same
// conversion this capability records being got backwards once already, at a
// 5x error — and DeltaVPerTon is not on the wire, so a client asked to apply
// it would have to duplicate the constant as well as the rule. The hull-count
// multiplier is deliberately NOT applied: this is the rate the park charges,
// not a fleet-sized burn price.
//
// Purely derived: it settles nothing, debits nothing, and restamps nothing
// ("Serving this rate SHALL NOT alter, settle, or debit anything"). The
// effective state is read through the same space.StateAt fold every other
// answer to "what is this fleet doing" goes through, so a released hold reads
// as the orbit it became.
func (s *Service) StationKeepUpkeepRate(ctx context.Context, f *Fleet) (tonsPerSecond float64, ok bool, err error) {
	if f == nil || f.Jump != nil {
		return 0, false, nil
	}
	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return 0, false, err
	}
	eff, err := space.StateAt(bt, f.State, s.clock.Now())
	if err != nil {
		return 0, false, fmt.Errorf("fleet: folding state for the station-keeping upkeep rate: %w", err)
	}
	if eff.Mode != space.ModeParked || eff.Park == nil {
		return 0, false, nil
	}
	p := *eff.Park
	if p.Kind != space.ParkOrbit && p.Kind != space.ParkStationkeep {
		return 0, false, nil // a `point` park has no host body to charge a rate
	}
	if p.BodyId == "" {
		return 0, false, nil
	}
	if s.fuelParams.DeltaVPerTon <= 0 {
		return 0, false, nil
	}
	return stationKeepRateFor(bt, p.BodyId) / s.fuelParams.DeltaVPerTon, true, nil
}

// --- the verbs --------------------------------------------------------------

// Hold serves POST /v1/fleets/:fleetId/hold — an INSTANT verb (no action, no
// channel slot, no ETA) that converts an orbiting fleet to a `stationkeep`
// park holding its exact offset from its host body at the call instant,
// storing the hold's start time and its dry instant and debiting no fuel
// (fleet-movement "Station-Keeping Hold and Release Are Fleet Verbs").
//
// The ordered precondition sequence is load-bearing, not tidy:
//
//  1. LANE TRANSIT, before any evaluation of the fleet's stored kinematic
//     state at all — the one state this capability forbids evaluating.
//  2. A DUE-BUT-UNRESOLVED movement-channel BURN, settled first. A
//     body-targeted burn past its arrival folds to a `ParkOrbit`, so an
//     arrived-but-unresolved fleet would pass the orbit-mode precondition
//     while its slot is still claimed — and BurnResolver's already-settled
//     early return would then apply NONE of the arrival's exactly-once
//     effects (attachedTo, the arrived-at gate's lane charting).
//  3. A `stationkeep` park PAST ITS DRY INSTANT, settled first by the
//     preceding, independent, conditional write. Without this step `hold` is
//     free station-keeping forever: an elapsed hold IS an `orbit` park by the
//     fold, so the not-orbiting precondition accepts it; the stored `fuel`
//     still over-reports by the whole accrual; and `hold` would stamp a fresh
//     dry instant computed from that stale figure over the elapsed hold's,
//     forgiving the accrual and skipping the force-demotion.
//  4. Only then the verb's own state and fuel preconditions — re-evaluated
//     inside ONE transaction against a transactional re-read, since neither
//     verb claims a channel slot and so nothing else serializes them against
//     any other cargo.fuel mutator.
func (s *Service) Hold(ctx context.Context, id string) (*Fleet, error) {
	_, bt, err := s.beforeStationKeepVerb(ctx, id)
	if err != nil {
		return nil, err
	}
	// The settle-first write above has completed; the deciding transaction
	// has not yet opened. This is the seam task 7.18 authorises a hook at.
	fireSettleFirstSeam(id)

	var out *Fleet
	txErr := s.runFleetTx(ctx, id, func(cur *Fleet) (map[string]interface{}, error) {
		if cur.Jump != nil {
			return nil, ErrFleetInTransit
		}
		now := s.clock.Now()

		// The in-transaction guard on this transaction's OWN re-read. The
		// settle-first write above ran against an earlier read, and the dry
		// instant may have passed in between — a Firestore round trip, and
		// arbitrarily more WORLD time under a scaled clock. In that window
		// the park folds to `orbit` (so the not-orbiting precondition would
		// pass) alongside a stored fuel that still over-reports the whole
		// accrual. Surfaced as the insufficient-fuel rejection: the settled
		// figure is exactly the reserve by construction, so no hold is
		// affordable.
		if p, ok := heldPark(cur); ok && isExpiredHold(p, now) {
			return nil, ErrHoldWithoutFuel
		}

		folded, err := space.StateAt(bt, cur.State, now)
		if err != nil {
			return nil, fmt.Errorf("fleet: folding state to hold: %w", err)
		}
		if folded.Mode != space.ModeParked || folded.Park == nil || folded.Park.Kind != space.ParkOrbit {
			return nil, ErrNotOrbiting
		}
		host := folded.Park.BodyId

		parkPos, err := folded.Park.Position(bt, now)
		if err != nil {
			return nil, fmt.Errorf("fleet: resolving the orbit park's position to hold: %w", err)
		}
		bodyPos, err := space.Position(bt, host, now)
		if err != nil {
			return nil, fmt.Errorf("fleet: resolving the host body's position to hold: %w", err)
		}

		rate := stationKeepRateFor(bt, host)
		dry := dryInstantFor(now, cur.Cargo["fuel"], rate, s.fuelParams)
		if dry <= now {
			return nil, ErrHoldWithoutFuel
		}

		held := space.Park{
			Kind:         space.ParkStationkeep,
			BodyId:       host,
			Offset:       parkPos.Sub(bodyPos),
			HoldStartMs:  now,
			DryInstantMs: dry,
		}
		cur.State = parkedState(held)
		cur.UpdatedAt = now
		out = cur
		// No `cargo` entry: a hold's commit debits NOTHING. Upkeep is a
		// continuous draw priced at settlement, not a one-time price.
		return map[string]interface{}{
			"state":     EncodeKinematicState(cur.State),
			"updatedAt": int64(now),
		}, nil
	})
	if txErr != nil {
		return nil, txErr
	}
	return out, nil
}

// Release serves POST /v1/fleets/:fleetId/release — the instant inverse of
// Hold: it settles the hold's accrued upkeep and re-circularizes the park
// per space.ReleaseStationkeep, in ONE transaction against a transactional
// re-read (fleet-movement "Station-Keeping Hold and Release Are Fleet
// Verbs", "Hold and Release Settle In One Transaction Against a
// Transactional Re-Read").
//
// It runs the SAME ordered precondition sequence Hold does. A release at or
// after the hold's stored dry instant is REJECTED, not clamped: the "at or
// after" fold has already made the effective park an `orbit` park, so there
// is no hold left to release — and the settlement of that elapsed hold rides
// step 3's preceding, independent write, never this transaction, which
// rejects and would discard it.
//
// The debit itself carries NO CLAMP and none is possible: a release strictly
// before the dry instant is provably strictly less than the spendable
// budget, so the fleet is always left holding strictly more than the
// reserve.
func (s *Service) Release(ctx context.Context, id string) (*Fleet, error) {
	_, bt, err := s.beforeStationKeepVerb(ctx, id)
	if err != nil {
		return nil, err
	}

	var out *Fleet
	txErr := s.runFleetTx(ctx, id, func(cur *Fleet) (map[string]interface{}, error) {
		if cur.Jump != nil {
			return nil, ErrFleetInTransit
		}
		now := s.clock.Now()

		p, ok := heldPark(cur)
		if !ok || isExpiredHold(p, now) {
			return nil, ErrNotStationKeeping
		}
		folded, err := space.StateAt(bt, cur.State, now)
		if err != nil {
			return nil, fmt.Errorf("fleet: folding state to release: %w", err)
		}
		if folded.Mode != space.ModeParked || folded.Park == nil || folded.Park.Kind != space.ParkStationkeep {
			return nil, ErrNotStationKeeping
		}

		rate := stationKeepRateFor(bt, p.BodyId)
		fuel := cur.Cargo["fuel"] - upkeepTons(rate, p.HoldStartMs, now, s.fuelParams)
		if fuel < 0 {
			fuel = 0
		}

		cur.State = parkedState(space.ReleaseStationkeep(p.BodyId, p.Offset, now))
		if cur.Cargo == nil {
			cur.Cargo = map[string]float64{}
		}
		cur.Cargo["fuel"] = fuel
		cur.UpdatedAt = now
		out = cur
		return map[string]interface{}{
			"state":     EncodeKinematicState(cur.State),
			"cargo":     map[string]interface{}{"fuel": fuel},
			"updatedAt": int64(now),
		}, nil
	})
	if txErr != nil {
		return nil, txErr
	}
	return out, nil
}

// beforeStationKeepVerb runs the first three steps of both verbs' ordered
// precondition sequence — lane transit, a due burn, an elapsed hold — and
// resolves the request-scoped body table both verbs' own transactions fold
// through. See Hold's doc comment for why each step is load-bearing.
func (s *Service) beforeStationKeepVerb(ctx context.Context, id string) (*Fleet, *system.BodyTable, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	// (1) Lane transit, BEFORE the fleet's stored kinematic state is
	// evaluated at all: "a fleet in transit has no position in either system
	// and its stale stored state SHALL NOT be evaluated by any reader".
	if f.Jump != nil {
		return nil, nil, ErrFleetInTransit
	}
	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return nil, nil, err
	}
	// (2) A due-but-unresolved movement-channel BURN, through the same seam
	// OrderTo/CutDrive/Jump already use — scoped to a burn, matching that
	// seam's own guard, since a co-resident mine action leaves no stale
	// kinematic state for either verb to misread.
	if settled, due, serr := s.settleIfDue(ctx, f, bt); serr != nil {
		return nil, nil, serr
	} else if due {
		f = settled
	}
	// (3) An elapsed hold, by the preceding, independent, conditional write.
	f, err = s.settleExpiredHoldFirst(ctx, f)
	if err != nil {
		return nil, nil, err
	}
	return f, bt, nil
}

// --- the transactional re-read seam ----------------------------------------

// runFleetTx runs fn inside ONE Firestore transaction against a
// transactional re-read of the fleet document, applying fn's returned merge
// (or nothing at all, when fn returns a nil map). This is the seam
// "Hold and Release Settle In One Transaction Against a Transactional
// Re-Read" names, and the one the conditional settle-first write rides:
// neither verb claims a channel slot, so this transaction is the ONLY thing
// serializing them against a concurrent refuel, burn debit, or duplicate
// submission.
func (s *Service) runFleetTx(ctx context.Context, id string, fn func(*Fleet) (map[string]interface{}, error)) error {
	if impl, ok := s.dao.(*DaoImpl); ok {
		return impl.RunFleetTx(ctx, id, fn)
	}
	// Degraded path for a DAO that offers no transactional re-read (the
	// generated mock and hand fakes this package's unit tests wire): read,
	// apply, save. It is NOT serialized against a concurrent mutator — every
	// production Service holds the Firestore-backed DAO above — but it does
	// PERSIST, which is the property this seam exists to guarantee. Every fn
	// keeps its *Fleet in sync with the merge it returns so this path writes
	// the same thing the transactional one does.
	cur, err := s.load(ctx, id)
	if err != nil {
		return err
	}
	merge, err := fn(cur)
	if err != nil {
		return err
	}
	if merge == nil {
		return nil
	}
	return s.dao.Save(ctx, *cur)
}

// RunFleetTx is runFleetTx's DAO half: read the fleet inside the caller's
// transaction, hand the decoded, state-hydrated document to fn, and stage
// fn's merge. A nil merge writes nothing at all — which is exactly what the
// conditional settle-first write does when its re-read finds nothing to
// settle.
func (dao *DaoImpl) RunFleetTx(ctx context.Context, id string, fn func(*Fleet) (map[string]interface{}, error)) error {
	ref := dao.db.Collection(firestoreCollection).Doc(id)
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return fmt.Errorf("reading fleet %s in transaction: %w", id, err)
		}
		var f Fleet
		if err := snap.DataTo(&f); err != nil {
			return fmt.Errorf("decoding fleet %s: %w", id, err)
		}
		if err := hydrateState(ctx, &f, id); err != nil {
			return err
		}
		merge, err := fn(&f)
		if err != nil {
			return err
		}
		if merge == nil {
			return nil
		}
		merge, err = surveyTransition(snap.Data(), merge, asWorldMillis(merge["updatedAt"]))
		if err != nil {
			return err
		}
		return tx.Set(ref, merge, firestore.MergeAll)
	})
}

// holdRateFor resolves the station-keeping upkeep rate for whatever hold f
// currently carries, or zero when it carries none.
func (s *Service) holdRateFor(bt *system.BodyTable, f *Fleet) float64 {
	p, ok := heldPark(f)
	if !ok {
		return 0
	}
	return stationKeepRateFor(bt, p.BodyId)
}

// openHoldUpkeep is the accrual an OPEN hold (one strictly before its stored
// dry instant) has run up as of `now`, in tons — zero when the fleet holds
// no hold, or when its hold is already past its dry instant, whose whole
// accrual the automatic fold prices instead.
//
// In-memory only: a verb's authoritative debit is always computed inside its
// own transaction, from that transaction's own re-read.
func (s *Service) openHoldUpkeep(f *Fleet, rate float64, now common.WorldMillis) float64 {
	p, ok := heldPark(f)
	if !ok || p.DryInstantMs <= p.HoldStartMs || now >= p.DryInstantMs {
		return 0
	}
	return upkeepTons(rate, p.HoldStartMs, now, s.fuelParams)
}

// storedStationkeepParkFromDoc is storedStationkeepPark's form for a fleet
// document's own StateDoc (the discriminated {"mode","value"} map), rather
// than a whole raw actor document.
func storedStationkeepParkFromDoc(doc map[string]any) (space.Park, bool) {
	if doc == nil {
		return space.Park{}, false
	}
	if mode, _ := doc["mode"].(string); mode != "park" {
		return space.Park{}, false
	}
	p, err := space.DecodePark(doc["value"])
	if err != nil || p.Kind != space.ParkStationkeep {
		return space.Park{}, false
	}
	return p, true
}
