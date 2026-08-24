package stations

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	// ErrRequestGone: the named request no longer exists, has expired, or has
	// been drained by someone else since the caller quoted it.
	ErrRequestGone = errors.New("stations: demand request is no longer available")
	// ErrRequestOversold: the request cannot absorb that much tonnage. Refused in
	// full rather than reduced — the caller decides what to do about it.
	ErrRequestOversold = errors.New("stations: demand request cannot absorb that tonnage")
)

// RequestDecrementPlan is a validated, staged decrement of a station's demand
// requests plus its window consumption tallies.
//
// Two-phase for the same reason the other settlement primitives are: Firestore
// forbids a read after a write within one transaction, so a sale composing three
// domains must run all reads, then all writes.
//
// Everything here rides ONE document — the station doc embeds its requests — so
// concurrent sales against the same request contend on that single doc and
// Firestore's own transaction serialization is what prevents an oversell. No
// cross-document coordination is involved.
type RequestDecrementPlan struct {
	ref      *firestore.DocumentRef
	requests []Request
	spend    map[string]int64
	absorbed map[string]float64
	// Station is the transactionally-read station, so the caller re-evaluates its
	// own preconditions against the same read this plan was validated from.
	Station Station
}

// Decrement is one request's fill, as the caller computed it.
type Decrement struct {
	RequestId string
	Tons      float64
}

// PrepareRequestDecrementInTx is the READ half: it re-reads the station inside
// the caller's transaction and validates that every named request can still
// absorb its tonnage RIGHT NOW — the check that stops two concurrent sales from
// both quoting the same 40-ton request and together filling 80.
//
// spendKind/spendCredits/absorbTons record this sale's consumption against the
// station's per-window ceilings.
func (dao *DaoImpl) PrepareRequestDecrementInTx(
	tx *firestore.Transaction,
	galaxyID, systemID string,
	decrements []Decrement,
	spendKind string, spendCredits int64, absorbTons float64,
	now common.WorldMillis,
) (*RequestDecrementPlan, error) {
	ref := dao.Ref(galaxyID, systemID)
	snap, err := tx.Get(ref)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("reading station for decrement: %w", err)
	}
	var st Station
	if err := snap.DataTo(&st); err != nil {
		return nil, fmt.Errorf("decoding station: %w", err)
	}

	// Copy the request slice — an aborted-and-retried transaction must not see a
	// half-mutated view.
	next := make([]Request, len(st.Requests))
	copy(next, st.Requests)

	for _, d := range decrements {
		if d.Tons <= 0 {
			continue
		}
		idx := -1
		for i := range next {
			if next[i].Id == d.RequestId {
				idx = i
				break
			}
		}
		if idx < 0 {
			return nil, ErrRequestGone
		}
		// An expired request stops being fillable even with quantity left, and is
		// reported distinguishably from an exhausted one.
		if next[idx].Expired(now) {
			return nil, ErrRequestGone
		}
		if next[idx].RemainingQuantity < d.Tons {
			return nil, ErrRequestOversold
		}
		next[idx].RemainingQuantity -= d.Tons
	}

	spend := copyInt64Map(st.WindowSpend)
	absorbed := copyFloatMap(st.WindowAbsorbed)
	if spendKind != "" {
		spend[spendKind] += spendCredits
		absorbed[spendKind] += absorbTons
	}

	return &RequestDecrementPlan{
		ref: ref, requests: next, spend: spend, absorbed: absorbed, Station: st,
	}, nil
}

// Apply is the WRITE half: it stages the decremented requests and the updated
// window tallies.
//
// Update, NOT Set(..., MergeAll): a merge writes only the leaf paths present in
// the data, so an emptied map or a shortened list would leave stale entries
// behind. Update replaces each field wholesale, which is what these writes mean.
func (p *RequestDecrementPlan) Apply(tx *firestore.Transaction) error {
	if err := tx.Update(p.ref, []firestore.Update{
		{Path: "requests", Value: p.requests},
		{Path: "windowSpend", Value: p.spend},
		{Path: "windowAbsorbed", Value: p.absorbed},
	}); err != nil {
		return fmt.Errorf("decrementing station requests: %w", err)
	}
	return nil
}

func copyInt64Map(in map[string]int64) map[string]int64 {
	out := make(map[string]int64, len(in)+1)
	for k, v := range in {
		out[k] = v
	}
	return out
}

func copyFloatMap(in map[string]float64) map[string]float64 {
	out := make(map[string]float64, len(in)+1)
	for k, v := range in {
		out[k] = v
	}
	return out
}

// PrepareRequestDecrementInTx on the service delegates to the DAO, keeping the
// cross-domain call at the service level.
func (s *Service) PrepareRequestDecrementInTx(
	tx *firestore.Transaction,
	galaxyID, systemID string,
	decrements []Decrement,
	spendKind string, spendCredits int64, absorbTons float64,
	now common.WorldMillis,
) (*RequestDecrementPlan, error) {
	impl, ok := s.dao.(*DaoImpl)
	if !ok {
		return nil, errors.New("stations: request decrement requires the Firestore-backed DAO")
	}
	return impl.PrepareRequestDecrementInTx(tx, galaxyID, systemID, decrements, spendKind, spendCredits, absorbTons, now)
}

// EnsureRequests provisions a station's request set for an epoch if that epoch
// has not been claimed yet. The claim rides the station doc's own transaction —
// two concurrent readers that each trigger provisioning for the same
// (station, epoch) converge on ONE set, never two, mirroring
// system.CreateInterior's atomic claim discipline.
//
// Read-triggered rather than scheduled (mirroring GetOrCreateInterior), so this
// introduces no new Terraform. mint is called only when a claim is actually
// needed, and must be a pure function of (station, epoch, world seed) so a
// re-derivation is identical.
//
// Returns the station as it stands after provisioning.
func (s *Service) EnsureRequests(
	ctx context.Context, systemID string, epoch int64, mint func() []Request,
) (*Station, error) {
	meta, err := s.graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	ref := s.dao.Ref(meta.Id, systemID)

	var out Station
	err = s.dao.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return fmt.Errorf("reading station for provisioning: %w", err)
		}
		var st Station
		if err := snap.DataTo(&st); err != nil {
			return fmt.Errorf("decoding station: %w", err)
		}
		out = st

		// Already provisioned for this epoch — nothing to do. This is also the
		// path a concurrent loser takes on its retry.
		if st.RequestEpoch == epoch {
			return nil
		}

		fresh := mint()
		out.Requests = fresh
		out.RequestEpoch = epoch
		out.WindowSpend = map[string]int64{}
		out.WindowAbsorbed = map[string]float64{}
		// Update, not a merge: the window reset writes EMPTY maps, and a merge of
		// an empty map is a no-op — the old tallies would survive every epoch
		// rollover and permanently tighten the budget ceiling.
		return tx.Update(ref, []firestore.Update{
			{Path: "requests", Value: fresh},
			{Path: "requestEpoch", Value: epoch},
			// A new epoch resets the per-window consumption tallies the budget and
			// absorption ceilings measure against.
			{Path: "windowSpend", Value: map[string]int64{}},
			{Path: "windowAbsorbed", Value: map[string]float64{}},
		})
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}
