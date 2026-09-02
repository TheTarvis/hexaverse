// Package refuel is the fuel-purchase capability (add-fuel-as-cargo,
// section 6): an instant (not an action) verb modelled on market's own
// architecture wherever it transfers — ownership 404 before any other
// precondition, station resolved from the acting fleet's own system,
// idempotent by operation key — and departing from it exactly where fuel's
// economics differ: one single global price constant, unlimited station
// supply (no station-side write), cost arithmetic that rounds UP against
// the buyer, and all-or-nothing fill (never goods-sale's partial-fill
// demand-entry fold).
package refuel

import "hexaverse/common"

// Request is POST /v1/fleets/:fleetId/refuel's body — tons + operationKey,
// the fleet id in the path. NO system id, NO station identifier at all
// (fuel-purchase "Refuel Resolves the Station From the Acting Fleet's Own
// System, Never a Client-Supplied Identifier"). A client-supplied
// corporationId is deliberately absent from this shape too
// (request-authorization "The Sell and Refuel Endpoints Ignore a
// Client-Supplied Corporation Id") — the acting corporation resolves
// exclusively through common.ActorCorp at the handler.
type Request struct {
	Tons         float64 `json:"tons"`
	OperationKey string  `json:"operationKey"`
}

// Result is a settled refuel — no action id and no ETA (fuel-purchase
// "Instant, Not an Action").
type Result struct {
	Cost      int64              `json:"cost"`
	Cargo     map[string]float64 `json:"cargo"`
	Balance   int64              `json:"balance"`
	WorldTime common.WorldMillis `json:"worldTime"`
}
