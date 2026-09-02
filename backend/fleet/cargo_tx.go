package fleet

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	// ErrInsufficientCargo: the hold does not carry that much of the kind. The
	// debit is refused in full — never reduced to whatever happens to be there,
	// which would silently sell a different quantity than the caller asked for.
	ErrInsufficientCargo = errors.New("fleet: insufficient cargo of that kind")
	// ErrNotDockedTo: the fleet's effective state is not docked to the named
	// feature. Re-checked inside the settlement transaction because a fleet can
	// undock between a sale's pre-check and its commit.
	ErrInvalidDebit = errors.New("fleet: cargo debit must be a positive finite tonnage")
)

// CargoDebitPlan is a validated, staged cargo debit: the read is done, the write
// is not.
//
// Two-phase because Firestore requires EVERY read before EVERY write in a
// transaction (see action/dao.go's ResolveOne, which says so in a comment). A
// sale composes three domains' primitives into one transaction, so each must
// offer its read and its write separately — a single read-then-write call would
// put this domain's Get after another domain's Set and the SDK would reject it.
type CargoDebitPlan struct {
	ref      *firestore.DocumentRef
	fleetID  string
	kind     string
	newTons  float64
	newCargo map[string]float64
	// Fleet is the transactionally-read fleet, so the caller can re-evaluate its
	// own preconditions (docked state, ownership) against the SAME read this plan
	// was validated from rather than a staler one.
	Fleet Fleet
}

// PrepareCargoDebitInTx is the READ half: it re-reads the fleet inside the
// caller's transaction and validates that the hold really carries `tons` of
// `kind` right now — the check that stops two concurrent sales, each with its
// own operation key, from both passing a stale pre-check and overselling one
// hold.
func (dao *DaoImpl) PrepareCargoDebitInTx(
	tx *firestore.Transaction, fleetID, kind string, tons float64,
) (*CargoDebitPlan, error) {
	if math.IsNaN(tons) || math.IsInf(tons, 0) || tons <= 0 {
		return nil, ErrInvalidDebit
	}

	ref := dao.db.Collection(firestoreCollection).Doc(fleetID)
	snap, err := tx.Get(ref)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("reading fleet for cargo debit: %w", err)
	}
	var f Fleet
	if err := snap.DataTo(&f); err != nil {
		return nil, fmt.Errorf("decoding fleet: %w", err)
	}

	held := f.Cargo[kind]
	if held < tons {
		return nil, ErrInsufficientCargo
	}

	// Copy rather than mutate: the plan must not disturb the caller's view of the
	// fleet if the transaction later aborts and retries.
	next := make(map[string]float64, len(f.Cargo))
	for k, v := range f.Cargo {
		next[k] = v
	}
	remaining := held - tons
	// Drop a kind that reaches (or rounds to) zero rather than leaving a 0-ton
	// entry behind: a fleet with no stored Cargo already reads as empty, and a
	// residual key would make "holds nothing" untestable.
	if remaining <= 1e-9 {
		delete(next, kind)
		remaining = 0
	} else {
		next[kind] = remaining
	}

	return &CargoDebitPlan{
		ref: ref, fleetID: fleetID, kind: kind,
		newTons: remaining, newCargo: next, Fleet: f,
	}, nil
}

// Apply is the WRITE half: it stages the debited hold.
//
// Update, NOT Set(..., MergeAll): a merge writes only the leaf paths present in
// the data, so merging an EMPTY cargo map writes nothing at all and the old hold
// survives — selling a fleet's last tons of a kind would silently leave them
// aboard. Update replaces the whole `cargo` field, which is what a debit means.
func (p *CargoDebitPlan) Apply(tx *firestore.Transaction) error {
	if err := tx.Update(p.ref, []firestore.Update{
		{Path: "cargo", Value: p.newCargo},
	}); err != nil {
		return fmt.Errorf("debiting cargo: %w", err)
	}
	return nil
}

// RemainingTons is the fleet's tonnage of the debited kind after this plan
// applies — the figure a sale response reports back as the updated hold.
func (p *CargoDebitPlan) RemainingTons() float64 { return p.newTons }

// Cargo is the whole post-debit hold.
func (p *CargoDebitPlan) Cargo() map[string]float64 { return p.newCargo }

// DockedAt reports whether the transactionally-read fleet is docked to
// featureID. AttachedTo is a relationship the commit/resolve paths keep
// current directly (design.md Decision 13) — never re-derived from a
// kinematic fold, so `now` is accepted only for interface stability with
// callers that still pass it.
func (p *CargoDebitPlan) DockedAt(featureID string, _ common.WorldMillis) bool {
	host, docked := p.Fleet.DockedTo()
	return docked && host == featureID
}

// PrepareCargoDebitInTx on the service delegates to the DAO, keeping the
// cross-domain call at the service level (backend/CLAUDE.md: cross-domain calls
// go through services, never another domain's DAO).
func (s *Service) PrepareCargoDebitInTx(
	_ context.Context, tx *firestore.Transaction, fleetID, kind string, tons float64,
) (*CargoDebitPlan, error) {
	impl, ok := s.dao.(*DaoImpl)
	if !ok {
		return nil, errors.New("fleet: cargo debit requires the Firestore-backed DAO")
	}
	return impl.PrepareCargoDebitInTx(tx, fleetID, kind, tons)
}

// FuelCreditPlan is a validated, staged fuel credit: mirrors CargoDebitPlan's
// own two-phase shape (Firestore requires every read before every write in a
// transaction) — the primitive corporation-spawn's starting-fuel grant and
// the refuel verb both compose inside the ONE transaction each of THEM owns.
type FuelCreditPlan struct {
	ref            *firestore.DocumentRef
	newFuel        float64
	freeHoldBefore float64
	// newStateDoc, when non-nil, is the restamped `stationkeep` park this
	// credit lands into — the SAME transaction's settle-restamp-recompute
	// step (fuel-purchase "A refuel into an open hold settles, credits, and
	// restamps in the one transaction"). nil for every credit that does not
	// land into an open hold, which is every one before this change.
	newStateDoc map[string]any
	// Fleet is the transactionally-read fleet, BEFORE this credit — so a
	// caller can re-evaluate its own preconditions (docked state, free
	// hold) against the SAME read this plan was validated from, and so a
	// replayed idempotent operation can report the already-settled state
	// without applying a second credit (mirrors CargoDebitPlan.Fleet /
	// market.settle's own cargoPlan.Fleet.Cargo replay pattern).
	Fleet Fleet
}

// PrepareFuelCreditInTx is the READ half: it re-reads the fleet inside the
// caller's transaction and stages a credit of tons onto cargo.fuel, creating
// the entry if absent. No free-hold ceiling is enforced here — that
// precondition differs by caller (spawn's starting grant is unconditional;
// the refuel verb enforces it itself, using FreeHold() below, since only
// refuel's own requirement rejects an over-capacity request rather than
// clamping it).
func (dao *DaoImpl) PrepareFuelCreditInTx(
	_ context.Context, tx *firestore.Transaction, fleetID string, tons float64,
) (*FuelCreditPlan, error) {
	ref := dao.db.Collection(firestoreCollection).Doc(fleetID)
	snap, err := tx.Get(ref)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("reading fleet for fuel credit: %w", err)
	}
	var f Fleet
	if err := snap.DataTo(&f); err != nil {
		return nil, fmt.Errorf("decoding fleet: %w", err)
	}
	return &FuelCreditPlan{
		ref: ref, Fleet: f,
		freeHoldBefore: FreeHold(f, DefaultClassStats()),
		newFuel:        f.Cargo["fuel"] + tons,
	}, nil
}

// FreeHold is the fleet's free hold BEFORE this credit applies (capacity
// minus the sum of every held cargo kind, including any fuel already
// aboard) — the figure a caller enforces its own "within free hold"
// precondition against.
func (p *FuelCreditPlan) FreeHold() float64 { return p.freeHoldBefore }

// NewFuelTons is the fleet's cargo.fuel tonnage AFTER this plan applies.
func (p *FuelCreditPlan) NewFuelTons() float64 { return p.newFuel }

// DockedAt reports whether the transactionally-read fleet is docked to
// featureID (mirrors CargoDebitPlan.DockedAt).
func (p *FuelCreditPlan) DockedAt(featureID string) bool {
	host, docked := p.Fleet.DockedTo()
	return docked && host == featureID
}

// Apply is the WRITE half: it stages the credited cargo.fuel value.
//
// Set+MergeAll, not Update: Firestore's merge semantics touch only the leaf
// path explicitly present in the data (cargo.fuel), leaving every OTHER held
// cargo kind untouched — unlike CargoDebitPlan.Apply's Update, which
// deliberately replaces the whole cargo map because a debit already
// recomputed every kind's post-debit value.
func (p *FuelCreditPlan) Apply(tx *firestore.Transaction) error {
	data := map[string]interface{}{
		"cargo": map[string]interface{}{"fuel": p.newFuel},
	}
	// The restamped hold rides the SAME write — never a follow-up and never
	// a compensating one, so a failed settlement leaves neither the credit
	// nor the restamp visible.
	if p.newStateDoc != nil {
		data["state"] = p.newStateDoc
	}
	if err := tx.Set(p.ref, data, firestore.MergeAll); err != nil {
		return fmt.Errorf("crediting fuel: %w", err)
	}
	return nil
}

// PrepareFuelCreditInTx on the service delegates to the DAO (backend/
// CLAUDE.md: cross-domain calls go through services, never another domain's
// DAO) — the seam corporations' starting-fuel grant and the refuel package's
// settlement transaction both call.
func (s *Service) PrepareFuelCreditInTx(
	ctx context.Context, tx *firestore.Transaction, fleetID string, tons float64,
) (*FuelCreditPlan, error) {
	impl, ok := s.dao.(*DaoImpl)
	if !ok {
		return nil, errors.New("fleet: fuel credit requires the Firestore-backed DAO")
	}
	plan, err := impl.PrepareFuelCreditInTx(ctx, tx, fleetID, tons)
	if err != nil {
		return nil, err
	}
	if err := s.applyMidHoldSettlement(ctx, plan, tons); err != nil {
		return nil, err
	}
	return plan, nil
}
