package refuel

import "errors"

// Sentinel errors — one per rejection this capability defines, so every
// refusal reports a distinguishable reason (fuel-purchase "Rejections
// Report a Distinguishable Reason"). The TWO existence-hiding rejections
// (an unknown fleet, a foreign fleet) are the deliberate exception: both
// collapse to ONE byte-identical reason string, mirroring goods-sale's own
// ErrHidden pattern.
var (
	// ErrHidden is the single existence-hiding rejection.
	ErrHidden = errors.New("not found")
	// ErrUnauthenticated: no requester account resolved.
	ErrUnauthenticated = errors.New("refuel: requester is not authenticated")
	// ErrNotDockedAtStation: the fleet's effective state is not docked to a
	// station in its own system (fuel-purchase "Refuel Requires the Fleet
	// Docked To the Selling Station").
	ErrNotDockedAtStation = errors.New("refuel: fleet is not docked at a station")
	// ErrInvalidTonnage: tons is not a finite number > 0.
	ErrInvalidTonnage = errors.New("refuel: tons must be a positive finite number")
	// ErrExceedsFreeHold: the requested tonnage exceeds the fleet's free
	// hold — rejected outright, never clamped (fuel-purchase "Positive
	// Finite Tonnage Within the Fleet's Free Hold").
	ErrExceedsFreeHold = errors.New("refuel: requested tonnage exceeds the fleet's free hold")
	// ErrMisconfiguredPrice: FuelParams.PricePerTon is non-positive or
	// non-finite — a misconfiguration guard, never a live gameplay path
	// (fuel-purchase "A misconfigured non-positive price rejects every
	// refuel, rather than settling for free").
	ErrMisconfiguredPrice = errors.New("refuel: fuel price is misconfigured")
	// ErrCostOverflow: the tons*price computation is non-finite, negative,
	// or large enough to risk overflowing the balance's integer type — a
	// misconfiguration guard (fuel-purchase "A misconfigured price causing
	// an overflowing cost computation is rejected, not wrapped").
	ErrCostOverflow = errors.New("refuel: cost computation is out of range")
	// ErrZeroCost: the rounded-up cost is non-positive — unreachable under
	// a correctly configured, positive price and a positive tonnage
	// (fuel-purchase "The reject-zero guard is unreachable under a
	// correctly configured, positive price"), reachable only alongside a
	// misconfigured price.
	ErrZeroCost = errors.New("refuel: cost computation rounds to zero or fewer credits")
)
