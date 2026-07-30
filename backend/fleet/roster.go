package fleet

import "math"

// ClassStats is one ship class's stat contribution — looked up by
// ShipEntry.Class from configuration, never stored per-ship on the fleet
// document (#0010 "Fleet Ship Composition" / Decision #1).
type ClassStats struct {
	// MiningRate is tons/unit-world-time this class contributes to a fleet's
	// SUMMED derived mining rate ("Derived Cargo Capacity and Mining Rate").
	MiningRate float64
	// HoldCapacity is tons this class contributes to a fleet's SUMMED derived
	// cargo capacity.
	HoldCapacity float64
	// BurnRate is board hexes / unit-world-time — a fleet's effective burn rate
	// is the MINIMUM (not sum) of its roster's per-class burn rates: the
	// slowest hull gates the fleet ("Derived Fleet Speed"). Independent of
	// LaneRate — a burn and a lane leg measure distance in different,
	// non-proportional units.
	BurnRate float64
	// LaneRate is 3D lane-length-units / unit-world-time — the fleet's
	// effective lane rate is likewise the MINIMUM of the roster's per-class
	// lane rates, independently of BurnRate.
	LaneRate float64
}

// Tuning-time "starting numbers" (design.md Open Questions) for the one
// generalist ClassSeed hull this slice ships. MiningRate is tons per
// world-ms (0.001 ⇒ roughly one ton per world-second at scale 1); a full
// hold (200 tons) therefore takes ~200 world-seconds to fill — slower than
// crossing a system board (MsPerTile=2500ms/hex), which is the intended
// pacing: mining is the strategic, time-costly verb; movement is quick.
// HoldCapacity (200 tons) is sized against MineParams' default richness
// curve (see mine.DefaultMineParams) so a typical mid-richness lode is
// roughly one hold's worth.
const (
	defaultSeedMiningRate   = 0.001 // tons / world-ms
	defaultSeedHoldCapacity = 200.0 // tons
)

// DefaultClassStats is the live per-class stats table (#0010 Decision #1;
// "Derived Fleet Speed"). The seed class's BurnRate/LaneRate are configured
// as the inverse of today's global MsPerTile/LaneMsPerDistance
// (DefaultMovementParams) so a single-seed-class fleet's ETAs are unchanged
// (value-preservation — see "Derived Fleet Speed"'s corresponding scenario).
// MiningRate/HoldCapacity are the tuning-time "starting numbers" design.md's
// Open Questions leaves to implementation.
func DefaultClassStats() map[ShipClass]ClassStats {
	mp := DefaultMovementParams()
	return map[ShipClass]ClassStats{
		ClassSeed: {
			MiningRate:   defaultSeedMiningRate,
			HoldCapacity: defaultSeedHoldCapacity,
			BurnRate:     1.0 / float64(mp.MsPerTile),
			LaneRate:     1.0 / mp.LaneMsPerDistance,
		},
	}
}

// effectiveRoster is the Migration Plan's fallback: a fleet document with no
// stored Ships (every fleet SeedFleet wrote before this change) reads as one
// default ClassSeed hull, never as an empty roster ("Fleet Ship Composition"'s
// "pre-existing fleet with no stored roster" scenario). Every derived-*
// helper below routes through this, not raw f.Ships, so the fallback is
// applied exactly once, in exactly one place.
func effectiveRoster(f Fleet) []ShipEntry {
	if len(f.Ships) == 0 {
		return []ShipEntry{{Class: ClassSeed}}
	}
	return f.Ships
}

// DerivedCapacity sums the roster's per-class hold capacities — never a
// stored total field ("Derived Cargo Capacity and Mining Rate").
func DerivedCapacity(f Fleet, stats map[ShipClass]ClassStats) float64 {
	var total float64
	for _, s := range effectiveRoster(f) {
		total += stats[s.Class].HoldCapacity
	}
	return total
}

// DerivedMiningRate sums the roster's per-class mining rates — never a stored
// total field ("Derived Cargo Capacity and Mining Rate").
func DerivedMiningRate(f Fleet, stats map[ShipClass]ClassStats) float64 {
	var total float64
	for _, s := range effectiveRoster(f) {
		total += stats[s.Class].MiningRate
	}
	return total
}

// DerivedBurnRate is the MINIMUM of the roster's per-class burn rates — the
// slowest hull gates the fleet, independently of DerivedLaneRate ("Derived
// Fleet Speed").
func DerivedBurnRate(f Fleet, stats map[ShipClass]ClassStats) float64 {
	roster := effectiveRoster(f)
	if len(roster) == 0 {
		return 0
	}
	min := math.MaxFloat64
	for _, s := range roster {
		if r := stats[s.Class].BurnRate; r < min {
			min = r
		}
	}
	return min
}

// DerivedLaneRate is the MINIMUM of the roster's per-class lane rates,
// independently of DerivedBurnRate ("Derived Fleet Speed").
func DerivedLaneRate(f Fleet, stats map[ShipClass]ClassStats) float64 {
	roster := effectiveRoster(f)
	if len(roster) == 0 {
		return 0
	}
	min := math.MaxFloat64
	for _, s := range roster {
		if r := stats[s.Class].LaneRate; r < min {
			min = r
		}
	}
	return min
}

// FreeHold is derived capacity minus the sum of tons held across every cargo
// kind ("Fleet Cargo Pool"'s "free hold accounts for all kinds" scenario).
func FreeHold(f Fleet, stats map[ShipClass]ClassStats) float64 {
	capacity := DerivedCapacity(f, stats)
	var held float64
	for _, v := range f.Cargo {
		held += v
	}
	return capacity - held
}
