package fleet

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/board"
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

// DockedAt reports whether the transactionally-read fleet's EFFECTIVE state is
// docked to featureID at `now`. Effective, not stored: a burn past its arrival
// time already IS its settled dock, and board.StateAt is what folds that.
func (p *CargoDebitPlan) DockedAt(featureID string, now common.WorldMillis) bool {
	eff := board.StateAt(p.Fleet.State, now)
	return eff.Mode == board.ModeDocked && eff.Docked != nil && eff.Docked.ParentId == featureID
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
