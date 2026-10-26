package market

import (
	"context"
	"errors"
	"math"
	"time"

	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/stations"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
)

// --- consumer-declared dependencies -----------------------------------------
//
// Every one of these is a narrow SERVICE-level interface implemented by the
// domain that owns the data (backend/CLAUDE.md: cross-domain calls go through
// services, never another domain's DAO). market never reaches into fleet's or
// corporations' persistence layer — it composes their transaction-scoped
// primitives inside the one transaction it owns.

type GraphSource interface {
	LiveGalaxyMeta(ctx context.Context) (*galaxy.Galaxy, error)
	GetLiveSystem(ctx context.Context, systemID string) (*galaxy.System, error)
}

type StationSource interface {
	Get(ctx context.Context, systemID string) (*stations.Station, error)
	GetVisible(ctx context.Context, corpID, systemID string) (*stations.Station, error)
	Visible(ctx context.Context, corpID, systemID string) (bool, error)
	EnsureRequests(ctx context.Context, systemID string, epoch int64, mint func() []stations.Request) (*stations.Station, error)
	PrepareRequestDecrementInTx(tx *firestore.Transaction, galaxyID, systemID string,
		decrements []stations.Decrement, spendKind string, spendCredits int64, absorbTons float64,
		now common.WorldMillis) (*stations.RequestDecrementPlan, error)
}

type FleetSource interface {
	Get(ctx context.Context, id string) (*fleet.Fleet, error)
	PrepareCargoDebitInTx(ctx context.Context, tx *firestore.Transaction, fleetID, kind string, tons float64) (*fleet.CargoDebitPlan, error)
}

type CreditSource interface {
	PrepareCreditInTx(ctx context.Context, tx *firestore.Transaction, corpID, operationKey string,
		entry corporations.LedgerEntry, now common.WorldMillis) (*corporations.CreditPlan, error)
}

type TierSource interface {
	SystemTiers(ctx context.Context, cid string) (map[string]charts.Tier, error)
}

type Service struct {
	params   Params
	graph    GraphSource
	stations StationSource
	fleets   FleetSource
	credits  CreditSource
	tiers    TierSource
	clock    common.WorldTime
	db       common.FirestoreService
}

func NewService(
	params Params, graph GraphSource, st StationSource, fleets FleetSource,
	credits CreditSource, tiers TierSource, clock common.WorldTime, db common.FirestoreService,
) *Service {
	return &Service{
		params: params, graph: graph, stations: st, fleets: fleets,
		credits: credits, tiers: tiers, clock: clock, db: db,
	}
}

// --- price board (the remote read) ------------------------------------------

// Quote is one venue's demand for one kind.
type Quote struct {
	Kind string `json:"kind"`
	// Entries is the uniform, price-descending demand list — never a
	// floor/requests split. The NPC floor rides it as the entry of last resort,
	// so M12's player asks can join the same list without forking the client
	// contract.
	Entries []DemandEntry `json:"entries"`
}

// VenueQuotes is every quote at one venue. The venue key is opaque: it happens
// to be a station's system id today, and no consumer may interpret it as one.
type VenueQuotes struct {
	Venue    string  `json:"venue"`
	SystemId string  `json:"systemId"`
	Quotes   []Quote `json:"quotes"`
	// OwnerCorpId is deliberately ABSENT from this struct entirely, never shipped
	// as null: the board discloses market data, not who owns what.
}

// Board is the aggregate price-board response.
type Board struct {
	Venues    []VenueQuotes      `json:"venues"`
	WorldTime common.WorldMillis `json:"worldTime"`
	// RefreshCadenceMs is the stated freshness contract: a client polls at this
	// cadence and may treat a price up to this stale as acceptable.
	RefreshCadenceMs int64 `json:"refreshCadenceMs"`
}

// GetBoard aggregates every visible station's live quotes.
//
// Quotes are computed LIVE from the station/request store on every read — never
// routed through the three-band feature projection and never frozen at an
// observation's asOf. Market data is information, not feature composition: a
// request another corporation exhausted shows exhausted on your very next read,
// with no travel and no scan.
//
// Implemented as a point-read fan-out over the requester's already-resolved
// visible system set, NOT a collectionGroup query — the visible set is bounded
// by the requester's own graph tier, and a point-read-per-station needs no new
// composite index.
func (s *Service) GetBoard(ctx context.Context, corpID string) (*Board, error) {
	now := s.clock.Now()
	// Named `out`, not `board`: this package imports the board package, and
	// shadowing it here would make the hex math unreachable further down.
	out := &Board{
		Venues:           []VenueQuotes{},
		WorldTime:        now,
		RefreshCadenceMs: int64(s.currentParams().BoardRefreshCadence),
	}
	if corpID == "" {
		// A corpless requester has no visible set to fan out over. An empty board
		// is the honest answer, not an error.
		return out, nil
	}

	tiers, err := s.tiers.SystemTiers(ctx, corpID)
	if err != nil {
		return nil, err
	}
	for systemID, tier := range tiers {
		if !tier.AtLeast(s.currentParams().MinVisibilityTier) {
			continue
		}
		vq, err := s.venueQuotes(ctx, systemID, now)
		if err != nil {
			// One unreachable station must not fail the whole board.
			log.Warn().Ctx(ctx).Err(err).Str("systemId", systemID).Msg("Skipping station in price board")
			continue
		}
		if vq != nil {
			out.Venues = append(out.Venues, *vq)
		}
	}
	return out, nil
}

// venueQuotes builds one station's quotes, provisioning its epoch's requests
// lazily on the way through.
func (s *Service) venueQuotes(ctx context.Context, systemID string, now common.WorldMillis) (*VenueQuotes, error) {
	st, err := s.ensureProvisioned(ctx, systemID, now)
	if err != nil || st == nil {
		return nil, err
	}
	region, err := s.regionOf(ctx, systemID)
	if err != nil {
		return nil, err
	}

	vq := &VenueQuotes{Venue: st.SystemId, SystemId: st.SystemId, Quotes: []Quote{}}
	for _, kind := range s.currentParams().TradableKinds {
		entries, tradable := s.currentParams().DemandFor(st, region, kind, now)
		if !tradable {
			// Not tradable in this region — omitted entirely rather than quoted at
			// a nonsensical zero.
			continue
		}
		vq.Quotes = append(vq.Quotes, Quote{Kind: kind, Entries: entries})
	}
	return vq, nil
}

// ensureProvisioned returns the station with its current epoch's requests,
// minting them if this epoch has not been claimed yet.
func (s *Service) ensureProvisioned(ctx context.Context, systemID string, now common.WorldMillis) (*stations.Station, error) {
	st, err := s.stations.Get(ctx, systemID)
	if err != nil || st == nil {
		return nil, err
	}
	epoch := s.currentParams().EpochAt(now)
	if st.RequestEpoch == epoch {
		return st, nil
	}
	region, err := s.regionOf(ctx, systemID)
	if err != nil {
		return nil, err
	}
	meta, err := s.graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	return s.stations.EnsureRequests(ctx, systemID, epoch, func() []stations.Request {
		return s.currentParams().ProvisionRequests(meta.Seed, systemID, region, epoch, now)
	})
}

func (s *Service) regionOf(ctx context.Context, systemID string) (string, error) {
	node, err := s.graph.GetLiveSystem(ctx, systemID)
	if err != nil {
		return "", err
	}
	return string(node.Region), nil
}

// --- the sell verb ----------------------------------------------------------

// SellRequest is POST /v1/fleets/:fleetId/sell.
type SellRequest struct {
	FeatureId string  `json:"featureId"`
	Kind      string  `json:"kind"`
	Tons      float64 `json:"tons"`
	// OperationKey is the client-supplied idempotency anchor. A sale claims no
	// action slot, so it inherits none of the spine's retry safety — this key is
	// the entire guard against a lost response becoming a double sale.
	OperationKey string `json:"operationKey"`
	// ExpectedUnitPrice / MinTotalProceeds are the two optional slippage guards.
	// POINTERS, not values: an omitted JSON field decodes to 0, which matches no
	// positive price — so a non-pointer field would reject every sale from a
	// client that simply didn't opt in.
	ExpectedUnitPrice *int64 `json:"expectedUnitPrice,omitempty"`
	MinTotalProceeds  *int64 `json:"minTotalProceeds,omitempty"`
}

// SellResult is a settled sale.
type SellResult struct {
	// Fills reports the applied price per filled demand-entry portion, so a split
	// fill is legible rather than collapsing into one blended number.
	Fills         []Fill             `json:"fills"`
	TotalProceeds int64              `json:"totalProceeds"`
	Cargo         map[string]float64 `json:"cargo"`
	Balance       int64              `json:"balance"`
	WorldTime     common.WorldMillis `json:"worldTime"`
	// No action id and no ETA: a sale is instant, not an action.
}

// contentionRetries is how many times the settlement transaction retries a
// contention abort before surfacing a distinguishable "busy" rejection. Small
// and finite: never retry forever, never surface a raw Firestore error.
const contentionRetries = 3

// Sell settles a sale from a docked fleet's hold.
func (s *Service) Sell(ctx context.Context, accountID, corpID, fleetID string, req SellRequest) (*SellResult, error) {
	now := s.clock.Now()

	// Operation-key format is validated FIRST, before any state read: an
	// unvalidated key becomes a Firestore document id.
	if err := corporations.ValidateOperationKey(req.OperationKey); err != nil {
		return nil, err
	}
	if corpID == "" {
		return nil, ErrUnauthenticated
	}
	if err := validateGuards(req); err != nil {
		return nil, err
	}
	if math.IsNaN(req.Tons) || math.IsInf(req.Tons, 0) || req.Tons <= 0 {
		return nil, ErrInvalidTonnage
	}

	// (a) Ownership. A foreign or unknown fleet is hidden behind ONE identical
	// rejection — and an empty requester corp never matches an empty/absent fleet
	// owner, which would otherwise let a corpless caller sell a dev-seeded fleet.
	f, err := s.fleets.Get(ctx, fleetID)
	if err != nil || f == nil || f.CorporationId == "" || f.CorporationId != corpID {
		return nil, ErrHidden
	}

	// (b) Station visibility — resolved through the SAME gate a direct station
	// read applies, and checked before any docked-state, tonnage, kind, or price
	// evaluation, so a sale can never be used to probe for a station's existence.
	st, err := s.stations.GetVisible(ctx, corpID, f.SystemId)
	if err != nil || st == nil {
		return nil, ErrHidden
	}
	if req.FeatureId != st.FeatureId {
		return nil, ErrHidden
	}
	st, err = s.ensureProvisioned(ctx, f.SystemId, now)
	if err != nil || st == nil {
		return nil, ErrHidden
	}

	region, err := s.regionOf(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}
	meta, err := s.graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}

	// (c)-(f) are PRE-checks only. Every one of them is re-evaluated inside the
	// transaction below against transactional reads — a pre-transaction pass is
	// never trusted on its own, because two concurrent sales with distinct keys
	// (the idempotency anchor deliberately does not fire across attempts) could
	// otherwise both pass here and both commit.
	if !dockedTo(f, st.FeatureId, now) {
		return nil, ErrNotDockedAtStation
	}
	if f.Cargo[req.Kind] < req.Tons {
		return nil, ErrInsufficientCargo
	}
	if _, tradable := s.currentParams().FloorFor(region, req.Kind); !tradable {
		return nil, ErrNotTradableHere
	}

	var result *SellResult
	for attempt := 0; ; attempt++ {
		result, err = s.settle(ctx, settleInput{
			accountID: accountID, corpID: corpID, fleetID: fleetID,
			galaxyID: meta.Id, systemID: f.SystemId, region: region,
			req: req, now: now,
		})
		if err == nil || !isContention(err) || attempt >= contentionRetries {
			break
		}
		// Short backoff, then retry: a popular station's request doc is a genuine
		// write hotspot, and a client should not see a failure for losing one race.
		time.Sleep(time.Duration(15*(attempt+1)) * time.Millisecond)
	}
	if err != nil {
		if isContention(err) {
			err = ErrBusy
		}
		corporations.AuditCreditAttempt(ctx, accountID, corpID, req.OperationKey, err)
		ObserveSale(ctx, corpID, err)
		return nil, err
	}
	corporations.AuditCreditAttempt(ctx, accountID, corpID, req.OperationKey, nil)
	ObserveSale(ctx, corpID, nil)
	return result, nil
}

type settleInput struct {
	accountID, corpID, fleetID string
	galaxyID, systemID, region string
	req                        SellRequest
	now                        common.WorldMillis
}

// settle is THE settlement transaction: opened exactly once, here, composing
// every domain's narrow transaction-scoped primitives.
//
// Ordering is forced by Firestore: ALL prepares (reads) before ALL applies
// (writes). Three sequential read-then-write calls would put the second one's
// read after the first one's write, which the SDK rejects.
func (s *Service) settle(ctx context.Context, in settleInput) (*SellResult, error) {
	var out *SellResult

	err := s.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		out = nil // reset on retry

		// ---------- reads / prepares ----------

		// Cargo, re-read transactionally. This is what stops two concurrent sales
		// from together overselling one hold.
		cargoPlan, err := s.fleets.PrepareCargoDebitInTx(ctx, tx, in.fleetID, in.req.Kind, in.req.Tons)
		if err != nil {
			return err
		}
		// Docked state re-evaluated against the SAME transactional read — a fleet
		// that undocked since the pre-check aborts the sale in full.
		if !cargoPlan.DockedAt(in.req.FeatureId, in.now) {
			return ErrNotDockedAtStation
		}

		// Station demand, re-read transactionally: the request another corporation
		// may have drained in the meantime.
		stSnapPlan, err := s.stations.PrepareRequestDecrementInTx(
			tx, in.galaxyID, in.systemID, nil, "", 0, 0, in.now)
		if err != nil {
			return err
		}
		live := stSnapPlan.Station

		entries, tradable := s.currentParams().DemandFor(&live, in.region, in.req.Kind, in.now)
		if !tradable {
			return ErrNotTradableHere
		}

		// Guards are evaluated against THESE transactional reads, not the
		// pre-transaction ones — otherwise the guard protects against a price that
		// is already stale by the time it is checked.
		fills, total, unfilled := FoldSale(entries, in.req.Tons)
		if unfilled > 1e-9 {
			// The floor is unlimited, so this is unreachable in practice; if demand
			// ever becomes fully finite, refusing beats silently selling less.
			return ErrInsufficientCargo
		}
		if err := checkGuards(in.req, entries, total); err != nil {
			return err
		}
		if total <= 0 {
			// A sub-ton fraction at a low floor can price to zero. Refuse rather
			// than debit cargo for nothing in return.
			return ErrZeroProceeds
		}
		if total < 0 || total > math.MaxInt64/2 {
			return ErrProceedsOverflow
		}

		// The budget/absorption ceiling applies to the FLOOR portion of the fold.
		var floorSpend int64
		var floorTons float64
		var decrements []stations.Decrement
		for _, fl := range fills {
			if fl.Source == SourceFloor {
				floorSpend += fl.Proceeds
				floorTons += fl.Tons
				continue
			}
			decrements = append(decrements, stations.Decrement{RequestId: fl.RequestId, Tons: fl.Tons})
		}
		if err := s.currentParams().BudgetCheck(&live, in.req.Kind, floorSpend, floorTons); err != nil {
			return err
		}

		// The real decrement plan, now that the fold is known.
		decPlan, err := s.stations.PrepareRequestDecrementInTx(
			tx, in.galaxyID, in.systemID, decrements, in.req.Kind, floorSpend, in.req.Tons, in.now)
		if err != nil {
			return err
		}

		// Balance + ledger. This also runs the O(1) write-time chained check
		// against the previous entry's recorded resulting balance.
		creditPlan, err := s.credits.PrepareCreditInTx(ctx, tx, in.corpID, in.req.OperationKey,
			corporations.LedgerEntry{
				AccountId:    in.accountID,
				FleetId:      in.fleetID,
				Kind:         corporations.EntrySaleProceeds,
				Counterparty: live.SystemId,
				Item:         in.req.Kind,
				Quantity:     in.req.Tons,
				UnitPrice:    blendedUnitPrice(total, in.req.Tons),
				Amount:       total,
			}, in.now)
		if err != nil {
			return err
		}

		// A replay: the identical sale already settled under this key. Return the
		// recorded result and stage NOTHING — re-applying would double-sell.
		if creditPlan.Replay {
			rec := creditPlan.Entry()
			out = &SellResult{
				Fills:         nil,
				TotalProceeds: rec.Amount,
				Cargo:         cargoPlan.Fleet.Cargo,
				Balance:       rec.ResultingBalance,
				WorldTime:     in.now,
			}
			return nil
		}

		// ---------- writes / applies ----------

		if err := cargoPlan.Apply(tx); err != nil {
			return err
		}
		if err := decPlan.Apply(tx); err != nil {
			return err
		}
		if err := creditPlan.Apply(tx); err != nil {
			return err
		}

		out = &SellResult{
			Fills:         fills,
			TotalProceeds: total,
			Cargo:         cargoPlan.Cargo(),
			Balance:       creditPlan.NewBalance,
			WorldTime:     in.now,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// dockedTo reports whether a fleet is docked to featureID. AttachedTo is a
// relationship the commit/resolve paths keep current directly (design.md
// Decision 13) — never re-derived from a kinematic fold, so `now` is
// accepted only for interface stability with existing callers.
func dockedTo(f *fleet.Fleet, featureID string, _ common.WorldMillis) bool {
	host, docked := f.DockedTo()
	return docked && host == featureID
}

// validateGuards rejects a guard value that is NaN, infinite, or negative —
// never treating it as "no guard supplied", which would silently drop the
// protection the caller asked for.
func validateGuards(req SellRequest) error {
	if req.ExpectedUnitPrice != nil && *req.ExpectedUnitPrice < 0 {
		return ErrInvalidGuard
	}
	if req.MinTotalProceeds != nil && *req.MinTotalProceeds < 0 {
		return ErrInvalidGuard
	}
	return nil
}

// checkGuards evaluates both optional slippage guards.
//
// The first-ton guard alone is NOT sufficient, which is why the total-proceeds
// guard exists beside it: if a rival drains all but one ton of a large request
// just before you dock, the first ton still prices at the premium and a
// first-ton-only guard passes — while the other 199 tons quietly settle at the
// floor, on exactly the haul the guard was meant to protect.
func checkGuards(req SellRequest, entries []DemandEntry, total int64) error {
	if req.ExpectedUnitPrice != nil {
		if FirstTonPrice(entries) != *req.ExpectedUnitPrice {
			return ErrPriceChanged
		}
	}
	if req.MinTotalProceeds != nil && total < *req.MinTotalProceeds {
		return ErrPriceChanged
	}
	return nil
}

// blendedUnitPrice is the effective credits-per-ton a sale achieved. Recorded on
// the ledger entry for legibility; the authoritative per-portion breakdown rides
// the sale response, not the ledger.
func blendedUnitPrice(total int64, tons float64) int64 {
	if tons <= 0 {
		return 0
	}
	return int64(math.Floor(float64(total) / tons))
}

// isContention reports a Firestore transaction-conflict abort, as opposed to a
// business-rule rejection.
func isContention(err error) bool {
	if err == nil {
		return false
	}
	// Business rejections are all sentinels; anything wrapping one is not
	// contention.
	for _, sentinel := range []error{
		ErrHidden, ErrNotDockedAtStation, ErrInvalidTonnage, ErrInsufficientCargo,
		ErrNotTradableHere, ErrPriceChanged, ErrInvalidGuard, ErrZeroProceeds,
		ErrProceedsOverflow, ErrBudgetExhausted, ErrAbsorptionExhausted,
		corporations.ErrInsufficientCredits, corporations.ErrOperationConflict,
		corporations.ErrReconciliationDivergence, corporations.ErrChainBroken,
		stations.ErrRequestGone, stations.ErrRequestOversold, fleet.ErrInsufficientCargo,
	} {
		if errors.Is(err, sentinel) {
			return false
		}
	}
	return true
}

// ObserveSale emits the per-outcome countable signal, keyed separately from
// ordinary precondition rejections so contention aborts stay visible on their
// own.
func ObserveSale(ctx context.Context, corpID string, rejection error) {
	e := log.Info().Ctx(ctx).Str("corpId", corpID).Str("signal", "sale_outcome")
	if rejection != nil {
		e.Str("outcome", "rejected").Str("reason", rejection.Error()).Msg("Sale rejected")
		return
	}
	e.Str("outcome", "settled").Msg("Sale settled")
}
