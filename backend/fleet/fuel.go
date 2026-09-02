package fleet

// The fuel-currency primitives add-fuel-as-cargo introduces: the burn-cost
// and discard-refund formulas (fleet-movement "A Burn's Fuel Cost Scales
// With Roster Hull Count, Never Loaded Mass", "Discarding a Running Burn
// Refunds Its Unspent Fuel, Closed-Form"), the acceleration-floor-priced
// range estimate ("Fleet Read Reports an Estimated Maximum Range From
// Current Fuel"), and the shared reachability evaluation both the
// commit-time stranding warning and the persistent stranded indication
// consume ("A Burn Commit Warns, But Does Not Block...", "A Fleet's Read
// Reports a Persistent Stranded Indication, Computed at the Acceleration
// Floor"). One implementation, two consumers — never a second, divergent
// evaluation.

import (
	"context"
	"errors"

	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/space"
	"hexaverse/stations"
	"hexaverse/system"
)

// ErrInsufficientFuel rejects a burn commit whose fuel cost exceeds the
// fleet's available fuel — distinct from the persistent stranded indication
// (fleet-movement "A Burn Commit Is Rejected When Its Fuel Cost Exceeds
// Available Fuel..."): this names only that THIS SPECIFIC commit is
// unaffordable, never "this fleet cannot move under its own power to
// anything reachable" (FuelStatus's own job).
var ErrInsufficientFuel = errors.New("fleet: fuel cost exceeds available fuel")

// FuelCostTons prices a burn's fuel cost: space's own delta-v price times
// roster hull count, converted to tons by FuelParams.DeltaVPerTon
// (fleet-movement "A Burn's Fuel Cost Scales With Roster Hull Count, Never
// Loaded Mass"). hullCount is read ONCE, from the roster as it stands at
// the instant of commit — never re-read at discard (see DiscardRefundTons).
func FuelCostTons(b *space.Burn, hullCount int, params FuelParams) float64 {
	if params.DeltaVPerTon <= 0 {
		return 0
	}
	return b.DeltaV() * float64(hullCount) / params.DeltaVPerTon
}

// DiscardRefundTons is the closed-form partial refund for a burn discarded
// (cut, superseded, cancelled) before its own stored arrival (fleet-
// movement "Discarding a Running Burn Refunds Its Unspent Fuel, Closed-
// Form"): the unspent fraction of flight duration — (flightDuration − τ) /
// flightDuration — applied to storedCostTons, the cost ACTUALLY DEBITED AND
// STORED on the burn record at its own original commit. Never a
// re-derivation from hull count/acceleration, and never a roster re-read,
// at discard time.
//
// atMs is clamped to [departMs, arriveMs] so a discard requested at or
// after the burn's own stored arrival (a settled fact, not a live discard)
// never produces a negative refund, and one requested before the burn's own
// depart (impossible in practice) never over-refunds past the full cost.
func DiscardRefundTons(storedCostTons float64, departMs, arriveMs, atMs common.WorldMillis) float64 {
	duration := float64(arriveMs - departMs)
	if duration <= 0 {
		return 0
	}
	tau := float64(atMs - departMs)
	if tau < 0 {
		tau = 0
	}
	if tau > duration {
		tau = duration
	}
	unspentFraction := (duration - tau) / duration
	return storedCostTons * unspentFraction
}

// EstimatedRangeTons inverts the burn fuel-cost/brachistochrone formulas at
// the acceleration FLOOR (disclosure.MinCommandedAccel) — fleet-movement
// "Fleet Read Reports an Estimated Maximum Range From Current Fuel": since
// Δv = 2·√(a·L) rises with commanded acceleration, a fleet's maximum
// affordable range is achieved at its MINIMUM legal acceleration, never its
// ceiling. Zero fuel (or a fleet with no hulls at all) yields exactly zero
// range.
func EstimatedRangeTons(fuelTons float64, hullCount int, params FuelParams) float64 {
	if fuelTons <= 0 || hullCount <= 0 || params.DeltaVPerTon <= 0 {
		return 0
	}
	deltaV := fuelTons * params.DeltaVPerTon / float64(hullCount)
	return (deltaV * deltaV) / (4 * disclosure.MinCommandedAccel)
}

// gateBodyIdPrefix mirrors system.gateId's own naming convention
// ("gate-"+destSystemId, system/bodies.go) — system does not export it, so
// every consumer that needs to recognize a gate body id by shape mirrors it
// independently (fleet/handler.go's own gateBodyPrefix constant does the
// same for the attached-lane-id read).
const gateBodyIdPrefix = "gate-"

// gateSource is an OPTIONAL capability a fleet Service's own BodySource may
// additionally implement — resolving a system's lane gates WITHOUT this
// package ever enumerating a body table's full id list into anything it
// computes (system-body-table's unfiltered-seam rule, restated by tasks.md
// 3.5's own text and this package's own structural source-scan guard).
// *system.Service, fleet's real production BodySource, satisfies this
// structurally; a hand-written BodySource test stub that implements only
// the BodyTable method simply yields no gate candidates — degrading the
// reachability scan to the station alone, never failing it.
type gateSource interface {
	LaneGates(ctx context.Context, systemID string, radius int) ([]system.LaneGate, error)
}

// candidateHosts is the bounded candidate set a floor-priced reachability
// evaluation solves against: the system's one station (if provisioned) plus
// every lane-gate body confirmed present in bt — never the system's full
// body table (fleet-movement design.md: "N bounded by that system's
// station/gate count, not its full body count"). A gateSource lookup
// failure degrades to the station-only candidate set rather than failing
// the whole evaluation.
func (s *Service) candidateHosts(ctx context.Context, bt *system.BodyTable, systemID string) []string {
	var out []string
	if _, ok := bt.Body(stations.StationFeatureId); ok {
		out = append(out, stations.StationFeatureId)
	}
	gs, ok := s.bodies.(gateSource)
	if !ok {
		return out
	}
	gates, err := gs.LaneGates(ctx, systemID, s.params.BoardRadius)
	if err != nil {
		return out
	}
	for _, g := range gates {
		gateId := gateBodyIdPrefix + g.DestSystemId
		if _, ok := bt.Body(gateId); ok {
			out = append(out, gateId)
		}
	}
	return out
}

// reachableAtFloor reports whether SOME candidate station or lane-gate body
// in bt is affordable at disclosure.MinCommandedAccel from position `from`
// at time `now`, given `availableFuel` tons and a roster of `hullCount`
// hulls (fleet-movement's shared reachability evaluation — consumed by both
// the commit-time stranding warning, task 2.4, and the persistent stranded
// indication, task 4.2; never a second, divergent implementation).
//
// A candidate whose solve fails with space.ErrArcTooShort counts as
// reachable at ZERO cost — the fleet is already at, or arriving at, that
// candidate's own insertion standoff (the routine case of burning to the
// very station being evaluated). Any OTHER named space error counts as
// unreachable for that candidate only; the scan continues to the rest.
func (s *Service) reachableAtFloor(ctx context.Context, bt *system.BodyTable, systemID string, from space.Vec3, now common.WorldMillis, hullCount int, availableFuel float64, starClearance float64) (bool, error) {
	for _, candidateId := range s.candidateHosts(ctx, bt, systemID) {
		sol, err := space.SolveBurn(bt, from, space.Target{BodyId: candidateId}, now,
			disclosure.MinCommandedAccel, nil, starClearance, space.SolveRounds)
		if err == nil {
			cost := FuelCostTons(&sol.Burn, hullCount, s.fuelParams)
			if cost <= availableFuel {
				return true, nil
			}
			continue
		}
		if errors.Is(err, space.ErrArcTooShort) {
			return true, nil
		}
		// Any other named space error: unreachable for THIS candidate only.
	}
	return false, nil
}

// readCargoFuel reads the "fuel" entry off a RAW, transactionally-decoded
// actor doc's "cargo" field (map[string]interface{}, exactly as a Firestore
// transaction's own snapshot.Data() shape) — the shared coercion every
// transaction-scoped fuel producer (the burn-commit debit, the generic
// action-cancel refund) uses so a numeric value decoded as either float64
// or int64 reads identically.
func readCargoFuel(actorData map[string]interface{}) float64 {
	cargo, _ := actorData["cargo"].(map[string]interface{})
	return asFloat64(cargo["fuel"])
}

// asFloat64 coerces a decoded Firestore numeric value (float64 or int64,
// depending on how it was originally written) to float64, defaulting to 0
// for an absent or non-numeric value.
func asFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	default:
		return 0
	}
}

// asWorldMillis coerces a decoded Firestore numeric value to
// common.WorldMillis — the same coercion asFloat64 performs, retyped for the
// stored burn window's departMs/arriveMs fields.
func asWorldMillis(v interface{}) common.WorldMillis {
	return common.WorldMillis(int64(asFloat64(v)))
}
