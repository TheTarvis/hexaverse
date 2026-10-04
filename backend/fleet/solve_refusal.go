package fleet

import (
	"context"
	"errors"

	"github.com/rs/zerolog/log"

	"hexaverse/common"
	"hexaverse/space"
)

// Served burn-solve refusals (fix-burn-order-geometry-refusals). Each wraps the
// matching `space` sentinel, so existing errors.Is checks against the space
// sentinels still hold, while respond can tell the four apart and serve each
// its own fixed reason text. The text carries no body id, point or route.

type solveRefusal struct {
	text string
	base error
}

func (e *solveRefusal) Error() string { return e.text }
func (e *solveRefusal) Unwrap() error { return e.base }

var (
	// ErrTargetBodyAbsent: the requested target body id is not in the table (404).
	ErrTargetBodyAbsent error = &solveRefusal{"fleet: target body is not present in this system", space.ErrUnknownBody}
	// ErrOriginInsideClearance: the fleet itself is at or inside the star clearance (409).
	ErrOriginInsideClearance error = &solveRefusal{"fleet: burn origin is at or inside the star-clearance radius", space.ErrEndpointInsideClearance}
	// ErrDestinationInsideClearance: the solved destination is at or inside it (409).
	ErrDestinationInsideClearance error = &solveRefusal{"fleet: burn destination is at or inside the star-clearance radius", space.ErrEndpointInsideClearance}
	// ErrBurnArcTooShort: the solved curve is below the minimum arc length (409).
	ErrBurnArcTooShort error = &solveRefusal{"fleet: burn curve is below the minimum arc length", space.ErrArcTooShort}
)

// burnRoute names the service entry point a solve came from; it appears only
// in the refusal log entry.
type burnRoute string

const (
	routeOrder   burnRoute = "order"
	routePreview burnRoute = "preview"
	routeStop    burnRoute = "stop"
)

// solveBurnClassified solves a burn and classifies the geometry refusals. Fixed
// decision order: target body presence, origin against the clearance, then the
// solve (destination clearance, minimum arc). A served refusal is logged once
// here, below error level, with its cause; any other error is returned
// unchanged and unlogged.
func solveBurnClassified(
	ctx context.Context, route burnRoute, fleetID, systemID string,
	bodies space.Bodies, from space.Vec3, target space.Target,
	departMs common.WorldMillis, accel float64, departDir *space.Vec3,
	starClearance float64,
) (space.SolveResult, error) {
	refuse := func(err error, cause string) (space.SolveResult, error) {
		log.Info().Ctx(ctx).
			Str("refusalCause", cause).
			Str("route", string(route)).
			Str("fleetId", fleetID).
			Str("systemId", systemID).
			Msg("fleet: burn solve refusal served")
		return space.SolveResult{}, err
	}

	if target.BodyId != "" {
		if _, ok := bodies.Body(target.BodyId); !ok {
			return refuse(ErrTargetBodyAbsent, "absent-body")
		}
	}
	if starClearance > 0 && from.Length() <= starClearance {
		return refuse(ErrOriginInsideClearance, "origin-inside-clearance")
	}
	sol, err := space.SolveBurn(bodies, from, target, departMs, accel, departDir, starClearance, space.SolveRounds)
	switch {
	case err == nil:
		return sol, nil
	case errors.Is(err, space.ErrEndpointInsideClearance):
		return refuse(ErrDestinationInsideClearance, "destination-inside-clearance")
	case errors.Is(err, space.ErrArcTooShort):
		return refuse(ErrBurnArcTooShort, "minimum-arc")
	default:
		return space.SolveResult{}, err
	}
}
