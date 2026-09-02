package refuel

import (
	"context"
	"math"

	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/stations"

	"cloud.google.com/go/firestore"
)

// --- consumer-declared dependencies -----------------------------------------
//
// Every one of these is a narrow SERVICE-level interface implemented by the
// domain that owns the data (backend/CLAUDE.md: cross-domain calls go
// through services, never another domain's DAO) — refuel composes fleet's
// and corporations' transaction-scoped primitives inside the ONE
// transaction it owns here, exactly as market.Service.Sell does.

type FleetSource interface {
	Get(ctx context.Context, id string) (*fleet.Fleet, error)
	PrepareFuelCreditInTx(ctx context.Context, tx *firestore.Transaction, fleetID string, tons float64) (*fleet.FuelCreditPlan, error)
}

type CreditSource interface {
	PrepareCreditInTx(ctx context.Context, tx *firestore.Transaction, corpID, operationKey string,
		entry corporations.LedgerEntry, now common.WorldMillis) (*corporations.CreditPlan, error)
}

type Service struct {
	params  fleet.FuelParams
	fleets  FleetSource
	credits CreditSource
	clock   common.WorldTime
	db      common.FirestoreService
}

func NewService(params fleet.FuelParams, fleets FleetSource, credits CreditSource, clock common.WorldTime, db common.FirestoreService) *Service {
	return &Service{params: params, fleets: fleets, credits: credits, clock: clock, db: db}
}

// PricePerTon serves the configured global fuel price — the same value
// fleet.Service.FuelPricePerTon serves on the fleet's own read, so the
// refuel offer's preview and this settlement's charged cost can never
// diverge (fuel-purchase "A Single Global Fuel Price..."; fleet-movement
// "Fleet Read Serves the Configured Fuel Price, Never Duplicated
// Client-Side").
func (s *Service) PricePerTon() float64 { return s.params.PricePerTon }

// Refuel settles POST /v1/fleets/:fleetId/refuel.
func (s *Service) Refuel(ctx context.Context, accountID, corpID, fleetID string, req Request) (*Result, error) {
	now := s.clock.Now()

	// Operation-key format is validated FIRST, before any state read: an
	// unvalidated key becomes a Firestore document id (mirrors
	// market.Service.Sell's own ordering).
	if err := corporations.ValidateOperationKey(req.OperationKey); err != nil {
		return nil, err
	}
	if corpID == "" {
		return nil, ErrUnauthenticated
	}
	if math.IsNaN(req.Tons) || math.IsInf(req.Tons, 0) || req.Tons <= 0 {
		return nil, ErrInvalidTonnage
	}

	// (a) Ownership — 404 BEFORE any other precondition (fuel-purchase
	// "Refuel Requires Fleet Ownership, 404 Before Any Other Precondition").
	// A foreign or unknown fleet is hidden behind ONE identical rejection —
	// and an empty requester corp never matches an empty/absent fleet
	// owner, which would otherwise let a corpless caller refuel a
	// dev-seeded fleet.
	f, err := s.fleets.Get(ctx, fleetID)
	if err != nil || f == nil || f.CorporationId == "" || f.CorporationId != corpID {
		return nil, ErrHidden
	}

	// (b) Docked to a station, resolved from the fleet's OWN system, with
	// NO client-supplied identifier at all (fuel-purchase "Refuel Requires
	// the Fleet Docked To the Selling Station"; "Refuel Resolves the
	// Station From the Acting Fleet's Own System, Never a Client-Supplied
	// Identifier") — the station's feature id is a fixed, global constant
	// (one station per system), so no station lookup is needed at all.
	if host, docked := f.DockedTo(); !docked || host != stations.StationFeatureId {
		return nil, ErrNotDockedAtStation
	}

	// (c) Tonnage validated positive/finite/within free hold BEFORE cost is
	// ever computed (fuel-purchase "Positive Finite Tonnage Within the
	// Fleet's Free Hold"; "Cost Arithmetic Rounds Against the Buyer...").
	if fleet.FreeHold(*f, fleet.DefaultClassStats()) < req.Tons {
		return nil, ErrExceedsFreeHold
	}

	cost, err := computeCost(req.Tons, s.params.PricePerTon)
	if err != nil {
		return nil, err
	}

	// (d)-(f) above are PRE-checks only. Every one of them is re-evaluated
	// inside the transaction below against transactional reads — a
	// pre-transaction pass is never trusted alone, since two concurrent
	// refuels with distinct keys could otherwise both pass here and both
	// commit past the fleet's real free hold.
	var result *Result
	err = s.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		result = nil // reset on retry

		// ---------- reads / prepares ----------

		fuelPlan, err := s.fleets.PrepareFuelCreditInTx(ctx, tx, fleetID, req.Tons)
		if err != nil {
			return err
		}
		if !fuelPlan.DockedAt(stations.StationFeatureId) {
			return ErrNotDockedAtStation
		}
		if fuelPlan.FreeHold() < req.Tons {
			return ErrExceedsFreeHold
		}

		// Balance + ledger. This also runs the O(1) write-time chained
		// check against the previous entry's recorded resulting balance,
		// and the reconciliation-divergence halt (corporation-credits "A
		// corporation with a confirmed divergence cannot refuel either").
		creditPlan, err := s.credits.PrepareCreditInTx(ctx, tx, corpID, req.OperationKey,
			corporations.LedgerEntry{
				AccountId: accountID,
				FleetId:   fleetID,
				Kind:      corporations.EntryFuelPurchase,
				Item:      "fuel",
				Quantity:  req.Tons,
				UnitPrice: int64(s.params.PricePerTon),
				Amount:    -cost,
			}, now)
		if err != nil {
			return err
		}

		// A replay: the identical refuel already settled under this key.
		// Return the recorded result and stage NOTHING — re-applying would
		// double-credit the fuel (fuel-purchase "A retried refuel after a
		// lost response does not double-charge").
		if creditPlan.Replay {
			rec := creditPlan.Entry()
			result = &Result{
				Cost:      -rec.Amount,
				Cargo:     map[string]float64{"fuel": fuelPlan.Fleet.Cargo["fuel"]},
				Balance:   rec.ResultingBalance,
				WorldTime: now,
			}
			return nil
		}

		// ---------- writes / applies ----------

		if err := fuelPlan.Apply(tx); err != nil {
			return err
		}
		if err := creditPlan.Apply(tx); err != nil {
			return err
		}

		result = &Result{
			Cost:      cost,
			Cargo:     map[string]float64{"fuel": fuelPlan.NewFuelTons()},
			Balance:   creditPlan.NewBalance,
			WorldTime: now,
		}
		return nil
	})
	if err != nil {
		corporations.AuditCreditAttempt(ctx, accountID, corpID, req.OperationKey, err)
		return nil, err
	}
	corporations.AuditCreditAttempt(ctx, accountID, corpID, req.OperationKey, nil)
	return result, nil
}

// computeCost prices tons at pricePerTon, rounding UP against the buyer —
// the mirror image of goods-sale's seller-adverse floor (fuel-purchase
// "Cost Arithmetic Rounds Against the Buyer, Is Overflow-Safe, and Is Never
// Zero"). The reject-if-non-positive-price and overflow guards are
// misconfiguration guards, never live gameplay paths once tonnage is
// already validated positive and bounded by free hold: ceil(tons*price) ≥ 1
// for any tons > 0, price > 0.
func computeCost(tons, pricePerTon float64) (int64, error) {
	if math.IsNaN(pricePerTon) || math.IsInf(pricePerTon, 0) || pricePerTon <= 0 {
		return 0, ErrMisconfiguredPrice
	}
	raw := tons * pricePerTon
	if math.IsNaN(raw) || math.IsInf(raw, 0) || raw < 0 || raw > float64(math.MaxInt64)/2 {
		return 0, ErrCostOverflow
	}
	cost := int64(math.Ceil(raw))
	if cost <= 0 {
		return 0, ErrZeroCost
	}
	return cost, nil
}
