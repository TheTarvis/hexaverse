package space

import (
	"errors"

	"hexaverse/common"
)

// ErrCutAfterArrival is returned when a cut is attempted at or after a
// burn's stored arrival millisecond — the arrival is already a fact and
// there is no burn left to cut (space-kinematics: "Cutting a Drive Converts
// the Burn to a Drift at Its Live Position and Velocity"). Distinct from
// every other rejection this capability defines.
var ErrCutAfterArrival = errors.New("space: cannot cut a burn at or after its stored arrival")

// CutDrive converts a running burn to a drift at the burn's live position
// and velocity at cutMs: Anchor = burn.Position(cutMs), Velocity =
// burn.Tangent(cutMs).Scale(burn.Speed(cutMs)), EpochMs = cutMs. It
// REPLACES the burn — it never truncates its stored geometry, and it
// charges no delta-v. A cut at or after the burn's stored arrival
// millisecond is refused with ErrCutAfterArrival, leaving b unchanged; a
// cut at exactly the burn's depart millisecond falls out of the same
// expression as a zero-velocity drift with no special case, since
// Burn.Speed(t) is zero at or before DepartMs (design.md Decision 6, 7).
func CutDrive(b Burn, cutMs common.WorldMillis) (Drift, error) {
	if cutMs >= b.ArriveMs {
		return Drift{}, ErrCutAfterArrival
	}
	return Drift{
		Anchor:   b.Position(cutMs),
		Velocity: b.Tangent(cutMs).Scale(b.Speed(cutMs)),
		EpochMs:  cutMs,
	}, nil
}
