package market

import (
	"hexaverse/charts"
	"hexaverse/common"
)

// Params holds every knob this milestone's market introduces: the starting
// grant, the per-region floor table, the request-provisioning bands, the NPC
// budget/absorption ceilings, and the visibility tier.
//
// These live HERE, not in common.GameTuning, and the line is deliberate.
// GameTuning is for PACING on a running world — values an operator would
// plausibly hot-retune (LaneMsPerDistance). Pricing explicitly never responds
// to anything happening in a running world (that is this capability's own
// stated non-goal), which by definition makes it not a mid-session knob
// either. It is closer to mine.MineParams' richness curve than to
// Tuning().LaneMsPerDistance, and it follows the same shape: one struct, one
// Default*Params() constructor, read at service construction.
type Params struct {
	// StartingCredits is the one-time opening grant at spawn. Injected into the
	// corporations service rather than imported by it — market imports
	// corporations for the credit primitive, so the reverse would cycle.
	StartingCredits int64

	// Floors is the static NPC floor price table: region → kind → credits/ton.
	//
	// BOTH levels are keyed by the STRING form of their types, never the named
	// galaxy region or system.ResourceKind types. This is not style: fleet.Cargo's
	// doc comment records a Firestore SDK transform-extraction reflection panic on
	// a map keyed by a named string type, and these tables are the same shape.
	//
	// A (region, kind) pair ABSENT from this table means that kind is not
	// tradable at any station in that region — never "sells for zero" (a value
	// that passes every numeric check while being economically nonsense) and
	// never an interpolated price (which would itself be the pricing engine this
	// version rules out).
	Floors map[string]map[string]int64

	// TradableKinds bounds which kinds may ever be quoted or sold.
	TradableKinds []string

	// --- Request provisioning (the premium demand entries above the floor) ---

	// ConcurrentRequestCount is how many open requests a station carries at once.
	ConcurrentRequestCount int
	// RequestKinds are the kinds eligible to be requested.
	RequestKinds []string
	// PremiumBandLow/High are the multipliers over that station's floor a request
	// prices at, e.g. 1.2–1.6 ⇒ +20%..+60%.
	PremiumBandLow  float64
	PremiumBandHigh float64
	// QuantityBandLow/High bound a request's tonnage.
	QuantityBandLow  float64
	QuantityBandHigh float64
	// RequestLifetime is how long a request quotes before expiring unfulfilled.
	RequestLifetime common.WorldMillis
	// RegenerationCadence is the floor on how soon a filled or expired slot may
	// be replaced — without it demand refreshes instantly and the "haul it before
	// it's gone" tension this whole mechanic depends on evaporates.
	RegenerationCadence common.WorldMillis
	// EpochWidth is the provisioning bucket: a (station, epoch) pair is claimed
	// create-if-absent, so concurrent readers converge on one request set.
	EpochWidth common.WorldMillis

	// --- NPC budget / absorption ceilings ---

	// BudgetPerWindow caps credits a station spends per window; AbsorptionPerWindow
	// caps tonnage it buys. Zero means UNLIMITED, which is what this version ships
	// — but the binding behaviour is specified and tested (reject the sale in
	// full, never a silent partial clamp), so the hook is not dead code wearing a
	// config field.
	BudgetPerWindow     int64
	AbsorptionPerWindow float64

	// MinVisibilityTier is the graph tier a requester must reach before a station
	// and its quotes disclose. Follows system-interior's existing charted-lane-gate
	// precedent (a gate ships once its destination clears `rumored`), and is the
	// SAME tier the station splice and the price board both read, so the two
	// surfaces can never disagree about which stations are "known".
	MinVisibilityTier charts.Tier

	// BoardRefreshCadence is the price board's stated poll cadence — the freshness
	// contract the UI honours and the staleness a player may assume.
	BoardRefreshCadence common.WorldMillis
}

// DefaultParams are this milestone's starting numbers. Every value here is a
// playtest-tunable placeholder, the same status mine.MineParams' numbers carry.
func DefaultParams() Params {
	return Params{
		StartingCredits: 1000,

		// Floors are dialed by region character: a star_rich region is
		// well-supplied and pays less; a dead one pays a premium for anything
		// hauled in. Research and exotic are absent from the poorer regions
		// entirely — not priced at zero, simply not tradable there.
		Floors: map[string]map[string]int64{
			"star_rich": {"metals": 8, "volatiles": 10, "water": 6, "organics": 12, "research": 30, "exotic": 45},
			"normal":    {"metals": 10, "volatiles": 12, "water": 8, "organics": 15, "research": 35, "exotic": 55},
			"dead":      {"metals": 14, "volatiles": 18, "water": 14, "organics": 22},
			"barrier":   {"metals": 12, "volatiles": 16, "water": 11, "organics": 18, "exotic": 70},
		},
		TradableKinds: []string{"metals", "volatiles", "water", "organics", "research", "exotic"},

		ConcurrentRequestCount: 2,
		RequestKinds:           []string{"metals", "volatiles", "water", "organics"},
		PremiumBandLow:         1.2,
		PremiumBandHigh:        1.6,
		QuantityBandLow:        20,
		QuantityBandHigh:       120,
		// World-milliseconds, written raw with digit separators the way every
		// other pacing value in this codebase is (see common.GameTuning).
		RequestLifetime:     21_600_000, // 6 world-hours
		RegenerationCadence: 7_200_000,  // 2 world-hours
		EpochWidth:          3_600_000,  // 1 world-hour

		// Unlimited this version — a pure faucet with no buy side has nothing to
		// balance against yet. The reject path stays specified and tested via a
		// fixtured finite value, exactly the way mine's holdFull clamp does.
		BudgetPerWindow:     0,
		AbsorptionPerWindow: 0,

		MinVisibilityTier:   charts.TierRumored,
		BoardRefreshCadence: 30_000, // 30s — a price that stale is fine for a
		// decision that itself costs minutes of travel to act on.
	}
}

// FloorFor returns the NPC floor price for a kind in a region. tradable is false
// when no entry is configured — the caller MUST report that distinguishably
// ("not tradable here") rather than substituting zero.
func (p Params) FloorFor(region, kind string) (price int64, tradable bool) {
	byKind, ok := p.Floors[region]
	if !ok {
		return 0, false
	}
	price, ok = byKind[kind]
	return price, ok
}

// EpochAt buckets a world time into the provisioning epoch it falls in.
func (p Params) EpochAt(now common.WorldMillis) int64 {
	if p.EpochWidth <= 0 {
		return 0
	}
	return int64(now) / int64(p.EpochWidth)
}
