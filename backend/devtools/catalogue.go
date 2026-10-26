package devtools

import (
	"hexaverse/common"
	"hexaverse/config"
	"hexaverse/disclosure"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/market"
	"hexaverse/mine"
	"hexaverse/space"
	"hexaverse/system"
	"hexaverse/tuning"
	"sort"
)

// Catalogue uses the actual domain defaults, including local env overrides.
func Catalogue() []tuning.Field {
	hull := fleet.DefaultClassStats()[fleet.ClassSeed]
	fuel := fleet.DefaultFuelParams()
	mining := mine.DefaultMineParams()
	markets := market.DefaultParams()
	gen := galaxy.DefaultParams()
	f := func(key, label, group, unit string, value, min, max float64, integer, regenerate bool) tuning.Field {
		return tuning.Field{Key: key, Label: label, Group: group, Unit: unit, Default: value, Min: min, Max: max, Integer: integer, Regenerate: regenerate}
	}
	fields := []tuning.Field{
		f("world.speed", "Game speed", "World", "× real time", config.ServiceConfig.WorldTimeScale, .01, 1000, false, false),
		f("travel.laneMsPerDistance", "Lane travel cost", "Travel", "world-ms/unit", common.Tuning().LaneMsPerDistance, 1, 1000000, false, false),
		f("travel.minimumAcceleration", "Minimum acceleration", "Travel", "units/s²", disclosure.MinCommandedAccel, .01, 100, false, false),
		f("hulls.acceleration", "Seed hull acceleration", "Ships", "units/s²", hull.Accel, .01, 1000, false, false),
		f("hulls.holdCapacity", "Seed hull hold", "Ships", "tons", hull.HoldCapacity, 0, 1000000, false, false),
		f("hulls.miningRate", "Seed hull mining rate", "Ships", "tons/world-ms", hull.MiningRate, .000001, 10, false, false),
		f("hulls.driveOutput", "Seed hull drive output", "Ships", "output", hull.DriveOutput, 0, 10000, false, false),
		f("fuel.deltaVPerTon", "Fuel efficiency", "Fuel", "delta-v/ton", fuel.DeltaVPerTon, .01, 10000, false, true),
		f("fuel.startingTons", "Starting fuel", "Fuel", "tons", fuel.StartingFuelTons, 0, 1000000, false, false),
		f("fuel.pricePerTon", "Fuel price", "Fuel", "credits/ton", fuel.PricePerTon, 1, 1000000, true, false),
		f("fuel.reserveTons", "Station-keeping reserve", "Fuel", "tons", fuel.StationKeepReserveTons, .01, 100000, false, true),
		f("orbits.baseRadius", "Kepler reference radius", "Orbits", "units", system.KeplerBaseRadius, 1, 1000, false, true),
		f("orbits.baseSeconds", "Kepler reference period", "Orbits", "world-seconds", system.KeplerBaseSeconds, .1, 100000, false, true),
		f("orbits.parkingBaseSeconds", "Parking base period", "Orbits", "world-seconds", float64(space.InsertionPeriod(0))/1000, .1, 10000, false, true),
		f("orbits.parkingSecondsPerRadius", "Parking period per radius", "Orbits", "seconds/unit", float64(space.InsertionPeriod(10)-space.InsertionPeriod(0))/10000, .001, 1000, false, true),
		f("sensors.passiveRange", "Passive sensor range", "Sensors", "units", disclosure.PassiveRange, .1, 10000, false, false),
		f("sensors.focusedRange", "Focused sensor range", "Sensors", "units", disclosure.FocusedScanRange, .1, 10000, false, false),
		f("sensors.plumeFloor", "Minimum drive plume", "Sensors", "units", disclosure.PlumeFloor, .1, 10000, false, false),
		f("sensors.plumePerDrive", "Plume per drive output", "Sensors", "units", disclosure.PlumePerDriveOutput, .01, 1000, false, false),
		f("sensors.scanEmissionFloor", "Minimum scan emission", "Sensors", "units", disclosure.ScanEmissionFloor, .1, 10000, false, false),
		f("sensors.scanEmissionPerRange", "Scan emission per range", "Sensors", "multiplier", disclosure.ScanEmissionPerRange, .01, 1000, false, false),
		f("sensors.baseDurationMs", "Scan base duration", "Sensors", "world-ms", float64(fleet.ScanBaseDurationMs), 1, 1000000, true, false),
		f("sensors.roundTripMsPerUnit", "Scan round-trip cost", "Sensors", "world-ms/unit", fleet.ScanRoundTripMsPerUnit, 0, 100000, false, false),
		f("mining.minRunTons", "Minimum mining run", "Mining", "tons", mining.MinRunTons, .01, 100000, false, false),
		f("mining.tonsPerRichness", "Resources per richness", "Mining", "tons", mining.TonsPerRichness, 1, 1000000, false, true),
		f("markets.startingCredits", "Starting credits", "Markets", "credits", float64(markets.StartingCredits), 0, 100000000, true, false),
		f("markets.requestCount", "Concurrent requests", "Markets", "requests", float64(markets.ConcurrentRequestCount), 0, 20, true, false),
		f("markets.premiumLow", "Minimum premium", "Markets", "multiplier", markets.PremiumBandLow, 1, 100, false, false),
		f("markets.premiumHigh", "Maximum premium", "Markets", "multiplier", markets.PremiumBandHigh, 1, 100, false, false),
		f("markets.quantityLow", "Minimum requested quantity", "Markets", "tons", markets.QuantityBandLow, 1, 1000000, false, false),
		f("markets.quantityHigh", "Maximum requested quantity", "Markets", "tons", markets.QuantityBandHigh, 1, 1000000, false, false),
		f("markets.requestLifetimeMs", "Request lifetime", "Markets", "world-ms", float64(markets.RequestLifetime), 1, 1000000000, true, false),
		f("markets.regenerationMs", "Request regeneration cadence", "Markets", "world-ms", float64(markets.RegenerationCadence), 1, 1000000000, true, false),
		f("markets.budget", "NPC budget (0 = unlimited)", "Markets", "credits/window", float64(markets.BudgetPerWindow), 0, 100000000, true, false),
		f("markets.absorption", "NPC absorption (0 = unlimited)", "Markets", "tons/window", markets.AbsorptionPerWindow, 0, 1000000, false, false),
		f("generation.seed", "Galaxy seed", "Generation", "seed", float64(galaxy.StartAreaSeed), 0, 9007199254740991, true, true),
		f("generation.halfHeight", "Galaxy half-height", "Generation", "units", gen.HalfHeightZ, 1, 1000, false, true),
		f("generation.minBodies", "Minimum bodies", "Generation", "bodies", float64(gen.MinBodies), 1, 16, true, true),
		f("generation.maxBodies", "Maximum bodies", "Generation", "bodies", float64(gen.MaxBodies), 1, 16, true, true),
		f("generation.maxRings", "Galaxy orbital shells", "Generation", "shells", float64(gen.MaxRings), 1, 17, true, true),
		f("generation.maxOrbitalIndex", "Maximum system orbital index", "Generation", "index", float64(common.Tuning().MaxOrbitalIndex), 11, 24, true, true),
		f("generation.noiseFrequency", "Galaxy noise frequency", "Generation", "frequency", gen.NoiseFrequency, .000001, 1, false, true),
		f("generation.retrogradeChance", "Retrograde orbit probability", "Generation", "probability", system.DefaultParams().RetrogradeChance, 0, 1, false, true),
	}
	regions := make([]string, 0, len(markets.Floors))
	for region := range markets.Floors {
		regions = append(regions, region)
	}
	sort.Strings(regions)
	for _, region := range regions {
		for _, kind := range markets.TradableKinds {
			if price, ok := markets.Floors[region][kind]; ok {
				fields = append(fields, f("markets.floor."+region+"."+kind, region+" · "+kind+" floor", "Markets", "credits/ton", float64(price), 1, 1000000, true, false))
			}
		}
	}
	return fields

}
