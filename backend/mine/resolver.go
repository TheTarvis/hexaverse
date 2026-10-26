package mine

import (
	"context"
	"fmt"
	"hexaverse/tuning"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/fleet"

	"github.com/rs/zerolog/log"
)

// toFloat coerces a frozen action.Params value (decoded from Firestore, so a
// float64 in production, but the resolver_test.go fixtures hand-build the
// map directly with Go float64 literals too) into a float64.
func toFloat(v interface{}) float64 {
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

// RegisterResolver wires mine's resolver onto the shared action service under
// its dispatch type (the unexported mineType), mirroring fleet.RegisterResolvers
// / fleet.RegisterTravelResolver — router.go calls this rather than reaching
// for the private type literal itself.
func RegisterResolver(a *action.Service, params MineParams, classStats map[fleet.ShipClass]fleet.ClassStats, clock common.WorldTime) {
	a.RegisterResolver(mineType, action.KindMutating, Resolver(params, classStats, clock))
}

// Resolver is mine's action.ResolveFunc, registered for type "mine" (design.md
// task 2.3): fold the frozen ledger key's deltas ≤ eta via r.Remaining,
// compute remainingAtEta = max(0, startTons + fold) and
// take = max(0, min(params.tons, remainingAtEta, freeHoldAtResolve)), append
// a delta (docId = actionId, amount = −take) and credit
// fleet.cargo[kind] += take via a nested merge patch ONLY when take > 0 —
// when take == 0, append NO delta document at all (Decision #15's extension,
// "Exactly-Once Lode Delta"'s ledger-growth bound) — and in both cases set an
// honest Outcome string (a caller-distinguishable prefix/substring per
// reason) and the structured ReasonCode (clean | lodeDry | holdFull).
//
// The frozen action.Action.Params this reads: {"featureId": string,
// "kind": string, "tons": float64, "rate": float64, "startTons": float64}
// (design.md Decision #8's "Consequence for the spec"; task 2.2(d)).
// classStats is the roster stats table freeHoldAtResolve is derived through
// (fleet.FreeHold — re-read live at resolve, never frozen; see "Resolve
// Clamps Yield to Reality"'s holdFull note).
// clock is the injected world clock the station-keeping settlement below is
// observed at — a fold is settled at the instant it is OBSERVED, which for a
// resolve is the world time the resolve actually runs at, not the action's
// own frozen ETA (a rewound or long-overdue ETA would otherwise read every
// live hold as still open).
func Resolver(params MineParams, classStats map[fleet.ShipClass]fleet.ClassStats, clock common.WorldTime) action.ResolveFunc {
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		liveStats := classStats
		if tuning.Enabled() {
			liveStats = fleet.DefaultClassStats()
		}
		var f fleet.Fleet
		if err := r.DecodeActor(&f); err != nil {
			return action.ResolveResult{}, err
		}

		p := r.Action.Params
		tons := toFloat(p["tons"])
		startTons := toFloat(p["startTons"])
		kind, _ := p["kind"].(string)
		featureId, _ := p["featureId"].(string)

		fold, err := r.Remaining(r.At)
		if err != nil {
			return action.ResolveResult{}, err
		}
		remainingAtEta := startTons + fold
		if remainingAtEta < 0 {
			remainingAtEta = 0
		}

		// A `stationkeep` hold at or after its stored dry instant is settled
		// FIRST, and inside THIS resolve's own transaction (fleet-movement
		// "FreeHold used by mine's resolve clamp reflects a settled hold";
		// "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold
		// First"). Without it the clamp reads the stale, over-reported fuel
		// figure and under-reports the fleet's available capacity. The
		// settlement only ever DEBITS fuel, so it can only widen free hold —
		// which is exactly the equality mine-extraction's "Resolve Clamps
		// Yield to Reality" retires: freeHoldAtResolve is no longer always
		// equal to freeHoldAtCommit.
		actorState, _ := fleet.SettleExpiredHold(&f, nil, fleet.DefaultFuelParams(), clock.Now())

		freeHoldAtResolve := fleet.FreeHold(f, liveStats)

		take := tons
		reason := ReasonClean
		if remainingAtEta < take {
			take = remainingAtEta
			reason = ReasonLodeDry
		}
		if freeHoldAtResolve < take {
			take = freeHoldAtResolve
			reason = ReasonHoldFull
		}
		if take < 0 {
			take = 0
		}

		log.Info().Ctx(ctx).Str("featureId", featureId).Str("kind", kind).
			Float64("remainingAtEta", remainingAtEta).Float64("take", take).
			Msg("Mine ledger folded at resolve")

		outcome := fmt.Sprintf("mined %g tons of %s", take, kind)
		switch reason {
		case ReasonLodeDry:
			outcome = fmt.Sprintf("lode ran dry at %g tons of %s", take, kind)
		case ReasonHoldFull:
			outcome = fmt.Sprintf("hold full at %g tons of %s", take, kind)
		}

		res := action.ResolveResult{Outcome: outcome, ReasonCode: string(reason)}
		if take > 0 {
			res.Delta = &action.Delta{Amount: -take}
			existing := 0.0
			if f.Cargo != nil {
				existing = f.Cargo[kind]
			}
			if actorState == nil {
				actorState = map[string]interface{}{}
			}
			cargo, _ := actorState["cargo"].(map[string]interface{})
			if cargo == nil {
				cargo = map[string]interface{}{}
			}
			cargo[kind] = existing + take
			actorState["cargo"] = cargo
		}
		// Non-nil whenever the settlement wrote, even for a zero take: the
		// hold's demotion is this transaction's to persist either way.
		res.ActorState = actorState
		return res, nil
	}
}
