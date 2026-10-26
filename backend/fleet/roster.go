package fleet

import (
	"hexaverse/tuning"
	"math"
)

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
	// Accel is this class's configured commanded acceleration — a fleet's
	// derived acceleration CEILING is the MINIMUM (not sum) of its roster's
	// per-class values: the slowest hull gates the fleet ("Derived Fleet
	// Acceleration and Drive Output", replacing the removed "Derived Fleet
	// Speed"). Independent of LaneRate — a continuous-space burn and a lane
	// leg measure distance in different, non-proportional units.
	Accel float64
	// DriveOutput is this class's configured drive output — a fleet's
	// derived drive output is the SUM across its roster: a bigger fleet is
	// louder ("Derived Fleet Acceleration and Drive Output"). It is the
	// input disclosure.PlumeRadius scales from.
	DriveOutput float64
	// LaneRate is 3D lane-length-units / unit-world-time — the fleet's
	// effective lane rate is the MINIMUM of the roster's per-class lane
	// rates (design.md Decision 10: kept for the single-hop lane-jump ETA).
	LaneRate float64
}

// Tuning-time "starting numbers" (design.md Open Questions) for the one
// generalist ClassSeed hull this slice ships. MiningRate is tons per
// world-ms (0.001 ⇒ roughly one ton per world-second at scale 1); a full
// hold (200 tons) therefore takes ~200 world-seconds to fill — slower than a
// typical in-system burn, which is the intended pacing: mining is the
// strategic, time-costly verb; movement is quick.
// HoldCapacity (200 tons) is sized against MineParams' default richness
// curve (see mine.DefaultMineParams) so a typical mid-richness lode is
// roughly one hold's worth.
const (
	defaultSeedMiningRate   = 0.001 // tons / world-ms
	defaultSeedHoldCapacity = 200.0 // tons
	// defaultSeedAccel matches space's own nominal worked-example
	// acceleration (space/params_const.go's nominalAccel) and Stop's
	// defaultAccel, so a single-seed-class fleet's omitted-Accel ceiling is
	// the same familiar number every other worked example in this codebase
	// already uses.
	defaultSeedAccel = 8.0
	// defaultSeedDriveOutput matches disclosure/params.go's own "a default
	// class-2 hull" worked example (MinCommandedAccel's doc comment), so the
	// seed hull's plume behavior lines up with the numbers already written
	// down there.
	defaultSeedDriveOutput = 2.0
)

// DefaultClassStats is the live per-class stats table (#0010 Decision #1;
// "Derived Fleet Acceleration and Drive Output", replacing "Derived Fleet
// Speed"). The seed class's LaneRate is configured as the inverse of today's
// global LaneMsPerDistance (DefaultMovementParams) so a single-seed-class
// fleet's lane-jump ETAs are unchanged (design.md Decision 10).
// MiningRate/HoldCapacity/Accel/DriveOutput are the tuning-time "starting
// numbers" design.md's Open Questions leave to implementation.
func DefaultClassStats() map[ShipClass]ClassStats {
	mp := DefaultMovementParams()
	return map[ShipClass]ClassStats{
		ClassSeed: {
			MiningRate:   tuning.Number("hulls.miningRate", defaultSeedMiningRate),
			HoldCapacity: tuning.Number("hulls.holdCapacity", defaultSeedHoldCapacity),
			Accel:        tuning.Number("hulls.acceleration", defaultSeedAccel),
			DriveOutput:  tuning.Number("hulls.driveOutput", defaultSeedDriveOutput),
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

// DerivedAccelCeiling is the MINIMUM of the roster's per-class accelerations
// — the slowest hull gates the fleet, independently of DerivedLaneRate
// ("Derived Fleet Acceleration and Drive Output").
func DerivedAccelCeiling(f Fleet, stats map[ShipClass]ClassStats) float64 {
	roster := effectiveRoster(f)
	if len(roster) == 0 {
		return 0
	}
	min := math.MaxFloat64
	for _, s := range roster {
		if r := stats[s.Class].Accel; r < min {
			min = r
		}
	}
	return min
}

// DerivedDriveOutput is the SUM of the roster's per-class drive outputs —
// a bigger fleet is louder ("Derived Fleet Acceleration and Drive Output").
// This is the input disclosure.PlumeRadius scales from.
func DerivedDriveOutput(f Fleet, stats map[ShipClass]ClassStats) float64 {
	var total float64
	for _, s := range effectiveRoster(f) {
		total += stats[s.Class].DriveOutput
	}
	return total
}

// DerivedLaneRate is the MINIMUM of the roster's per-class lane rates
// (design.md Decision 10: kept for the single-hop lane-jump ETA).
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
