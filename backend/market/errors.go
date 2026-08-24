package market

import "errors"

// Sentinel errors — one per rejection this capability defines, so every refusal
// reports a distinguishable reason.
//
// The FOUR existence-hiding rejections are the deliberate exception: they all
// surface as 404 with ONE byte-identical reason string, so a caller cannot use
// a sale to probe for which fleets or stations exist. They are distinct Go
// values (the code needs to tell them apart) that map to identical HTTP output.
var (
	// ErrHidden is the single existence-hiding rejection: an unknown fleet, a
	// foreign fleet, an unknown station, or a station below the requester's
	// visibility tier. All four produce this one reason, byte-identical.
	ErrHidden = errors.New("not found")

	// ErrUnauthenticated: no requester account resolved.
	ErrUnauthenticated = errors.New("market: requester is not authenticated")
	// ErrNotDockedAtStation: the fleet's effective state is not docked to the
	// named station.
	ErrNotDockedAtStation = errors.New("market: fleet is not docked at that station")
	// ErrInvalidTonnage: tons is not a finite number > 0.
	ErrInvalidTonnage = errors.New("market: tons must be a positive finite number")
	// ErrInsufficientCargo: the fleet holds less of the kind than the sale names.
	ErrInsufficientCargo = errors.New("market: fleet does not hold that much of the requested kind")
	// ErrNotTradableHere: the kind has no configured floor for this station's
	// region — not tradable at any station there, which is distinct from a price
	// of zero.
	ErrNotTradableHere = errors.New("market: that resource is not tradable at this station")
	// ErrPriceChanged: a supplied slippage guard no longer matches the price the
	// server would apply. The board the caller read is stale — most commonly
	// because another corporation drained a request in between.
	ErrPriceChanged = errors.New("market: price changed since your quote")
	// ErrInvalidGuard: a slippage guard value that is NaN, infinite, or negative.
	// Rejected outright rather than treated as "no guard".
	ErrInvalidGuard = errors.New("market: slippage guard value is not a valid price")
	// ErrZeroProceeds: the sale's total proceeds round down to zero whole credits.
	// Rejected rather than debiting cargo for nothing in return.
	ErrZeroProceeds = errors.New("market: proceeds round to zero credits")
	// ErrProceedsOverflow: the computed proceeds would overflow or go negative.
	ErrProceedsOverflow = errors.New("market: proceeds computation is out of range")
	// ErrBudgetExhausted / ErrAbsorptionExhausted: a station ceiling would be
	// breached. Rejects the sale IN FULL — there is no third buyer to partially
	// fill into.
	ErrBudgetExhausted     = errors.New("market: station budget exhausted")
	ErrAbsorptionExhausted = errors.New("market: station absorption exhausted")
	// ErrBusy: the settlement transaction lost to contention more times than the
	// server retries. Distinguishable so a client knows to retry rather than
	// treating it as a rejection of the sale's terms.
	ErrBusy = errors.New("market: station is busy, try again")
)
