package fleet

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
}

// DefaultFuelParams is the live tuning-knob source. All three values are
// placeholders pending in-play validation (design.md Open Questions) —
// StartingFuelTons in particular is checked, not merely asserted, by
// corporation-spawn's own generated-sample reachability test: a failing
// sample is a signal to retune this constant, per that requirement's own
// instruction.
func DefaultFuelParams() FuelParams {
	return FuelParams{
		DeltaVPerTon: 5.0,
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
		StartingFuelTons: 100.0,
		PricePerTon:      10.0,
	}
}
