package market

import (
	"fmt"

	"hexaverse/common"
	"hexaverse/stations"
)

// ProvisionRequests derives a station's whole request set for one epoch as a
// PURE function of (worldSeed, stationId, epoch, region) — the same
// seeded-pick discipline spawn's site selection already uses. Because it is
// derived, there is nothing to store beyond the resulting set, and a concurrent
// re-derivation produces an identical one.
//
// Provisioning is lazy and read-triggered (a station read, the price board, or a
// sale consulting demand), mirroring GetOrCreateInterior — deliberately NOT a
// scheduled job, so this adds no Terraform.
//
// Deliberately ONE function rather than a mint/price pair: two functions each
// replaying the same hash stream would silently diverge the moment either one's
// draw order changed.
func (p Params) ProvisionRequests(worldSeed int64, stationID, region string, epoch int64, now common.WorldMillis) []stations.Request {
	if p.ConcurrentRequestCount <= 0 || len(p.RequestKinds) == 0 {
		return nil
	}
	h := mixStation(worldSeed, stationID, epoch)

	out := make([]stations.Request, 0, p.ConcurrentRequestCount)
	for i := 0; i < p.ConcurrentRequestCount; i++ {
		h = mix64(h)
		kind := p.RequestKinds[int(h%uint64(len(p.RequestKinds)))]

		h = mix64(h)
		premium := p.PremiumBandLow + unitFloat(h)*(p.PremiumBandHigh-p.PremiumBandLow)

		h = mix64(h)
		quantity := p.QuantityBandLow + unitFloat(h)*(p.QuantityBandHigh-p.QuantityBandLow)

		// A kind with no configured floor in this region is simply not tradable
		// here, so it gets no request either — dropped, never priced at zero.
		floor, ok := p.FloorFor(region, kind)
		if !ok {
			continue
		}
		price := int64(float64(floor) * premium)
		// A premium must actually BE a premium: a request quoting at or below the
		// floor is pointless, and would make the whole "spot the spread" moment
		// this mechanic is built around meaningless.
		if price <= floor {
			price = floor + 1
		}

		out = append(out, stations.Request{
			// Deterministic id: the same (station, epoch, slot) always names the
			// same request, so a re-derivation after a lost write cannot mint a
			// second one under a fresh id.
			Id:                fmt.Sprintf("req-%d-%d", epoch, i),
			Kind:              kind,
			UnitPrice:         price,
			RemainingQuantity: quantity,
			ExpiresAt:         now + p.RequestLifetime,
		})
	}
	return out
}

// BudgetCheck reports whether a floor-priced portion fits within the station's
// remaining budget and absorption for the current window.
//
// A ceiling breach rejects the sale IN FULL — never a partial clamp. This is
// deliberately the opposite of the demand-entry fold's split across entries:
// that split exists because there is a genuine second buyer to fall back to
// (the floor, once a request is exhausted). An exhausted ceiling has no third
// buyer behind it, so there is nothing sensible to partially fill into, and
// inventing a fractional buyer-less clamp would be dishonest.
//
// Both ceilings ship UNLIMITED (zero) this version, so the reject path is
// unreachable in play — exercised in tests via a fixtured finite value, exactly
// the way mine's holdFull clamp stays specified while structurally unreachable.
func (p Params) BudgetCheck(st *stations.Station, kind string, spend int64, tons float64) error {
	if p.BudgetPerWindow > 0 {
		used := st.WindowSpend[kind]
		if used+spend > p.BudgetPerWindow {
			return fmt.Errorf("%w: station's credit budget for %s is exhausted", ErrBudgetExhausted, kind)
		}
	}
	if p.AbsorptionPerWindow > 0 {
		used := st.WindowAbsorbed[kind]
		if used+tons > p.AbsorptionPerWindow {
			return fmt.Errorf("%w: station's absorption capacity for %s is exhausted", ErrAbsorptionExhausted, kind)
		}
	}
	return nil
}

// --- deterministic derivation helpers ---------------------------------------

// mixStation folds (worldSeed, stationId, epoch) into one derivation base.
func mixStation(worldSeed int64, stationID string, epoch int64) uint64 {
	h := uint64(worldSeed)
	for i := 0; i < len(stationID); i++ {
		h = (h ^ uint64(stationID[i])) * 0x100000001B3 // FNV-style stir
	}
	return mix64(h ^ uint64(epoch)*0x9E3779B97F4A7C15)
}

func mix64(x uint64) uint64 {
	x += 0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	return x ^ (x >> 31)
}

// unitFloat maps a hash to [0,1).
func unitFloat(h uint64) float64 { return float64(h>>11) / float64(1<<53) }
