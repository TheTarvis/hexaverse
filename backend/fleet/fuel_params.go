package fleet

import "hexaverse/tuning"

// FuelParams holds fuel-currency tuning constants (add-fuel-as-cargo
// design.md's "Fuel is a reserved cargo kind" decision family). "Tuning is
// data" — DefaultFuelParams sources these three placeholders; a future
// admin surface writes through here, never through a hardcoded literal at
// a call site.
type FuelParams struct {
	// DeltaVPerTon converts a burn's space-computed delta-v price into a
	// tons cost: cost = burn.DeltaV() * hullCount / DeltaVPerTon
	// (fleet-movement "A Burn's Fuel Cost Scales With Roster Hull Count,
	// Never Loaded Mass"). This EXACT placeholder value (5.0) is written
	// into that requirement's own normative text — a future retune is
	// itself a spec change, not a silent constant edit.
	DeltaVPerTon float64
	// StartingFuelTons is spawn's forced grant (corporation-spawn "Starting
	// Fuel Is a Configured Constant, Guarded By a Reachability Sample") —
	// never solved at spawn time, guarded instead by a generated-sample
	// invariant test priced at the fleet's acceleration CEILING, the one
	// deliberate carve-out from this change's floor-pricing rule.
	StartingFuelTons float64
	// PricePerTon is fuel-purchase's single global price constant
	// (fuel-purchase "A Single Global Fuel Price, Unlimited Station
	// Supply, No Station-Side Write") — no per-station or per-region
	// variance, served to clients on the fleet's own read so the refuel
	// offer's preview and the settlement's charged cost can never diverge.
	PricePerTon float64
	// StationKeepReserveTons is the tonnage of `fuel` that station-keeping
	// upkeep may never spend (fleet-movement "Station-Keeping Upkeep Never
	// Drains a Fleet Below Its Reserve"). A hold's dry instant is computed
	// against `fuelAtHoldStart − StationKeepReserveTons`, and the automatic
	// force-demotion at that instant leaves the fleet holding exactly this
	// much — never zero, never negative, because station-keeping is the one
	// path on which a fleet strands PASSIVELY, while doing nothing, and
	// stranding is permanent (decisions.md 2026-08-29 and its own 2026-09-02
	// correction).
	//
	// It constrains upkeep ALONE: a burn may still spend it down to zero, and
	// nothing on the burn path reads it. It is explicitly NOT "enough to get
	// home" — no such quantity is locally computable, which is exactly why a
	// blanket reserve against burns stays rejected.
	//
	// **PLACEHOLDER — ITS VALUE IS AN OPEN QUESTION FOR TRAVIS**
	// (add-stationkeep-hold-verb design.md Open Questions). The structural
	// rule — strictly positive, subtracted from the spendable budget, left
	// behind by the fold — is what that change specifies; the number is a
	// play-feel call that has not been made, and this constant is deliberately
	// carrying no derivation to justify it.
	StationKeepReserveTons float64
}

// DefaultFuelParams is the live tuning-knob source. All three values are
// placeholders pending in-play validation (design.md Open Questions) —
// StartingFuelTons in particular is checked, not merely asserted, by
// corporation-spawn's own generated-sample reachability test: a failing
// sample is a signal to retune this constant, per that requirement's own
// instruction.
func DefaultFuelParams() FuelParams {
	return FuelParams{
		DeltaVPerTon: tuning.Number("fuel.deltaVPerTon", 5.0),
		// 100 tons comfortably affords a fresh hull's default (ceiling-
		// priced) spawn-to-home-station burn (observed ~25-36 tons across a
		// generated sample at this generation's typical spawn-to-station
		// distances) while staying well under the seed hull's own 200-ton
		// hold capacity (roster.go's defaultSeedHoldCapacity) — a grant at
		// or above capacity would leave a fresh corp with zero free hold to
		// ever buy MORE fuel at a station. Validated by corporation-spawn's
		// own generated-sample reachability test; a failing sample is a
		// signal to retune this constant, per that requirement's own
		// instruction.
		StartingFuelTons: tuning.Number("fuel.startingTons", 100.0),
		PricePerTon:      tuning.Number("fuel.pricePerTon", 10.0),
		// Placeholder, pending Travis's ruling — see the field's own doc
		// comment. Strictly positive is the only property this change
		// specifies, and the only one any test asserts.
		StationKeepReserveTons: tuning.Number("fuel.reserveTons", 5.0),
	}
}
