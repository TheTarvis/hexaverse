package fleet

// RED-phase tests for fix-burn-order-geometry-refusals task 2.4: the
// stop-in-place burn branch is refused with the same reasons as an order, and
// a refused stop changes nothing. World time is the injected clock.

import (
	"testing"

	"hexaverse/space"
)

// Scenario: A stop whose origin is inside the clearance is refused with the origin reason
// Scenario: A stop whose lead point is inside the clearance is refused with the destination reason
func TestStop_Scenario_RefusedForOriginAndForLeadPoint(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	clr := refusalClearance()
	inward := space.Vec3{X: -5}
	if inward.Length() <= space.StopInPlaceSpeedFloor {
		t.Fatalf("arrangement no longer holds: the drift speed %.2f must exceed the stop-in-place floor %.2f", inward.Length(), space.StopInPlaceSpeedFloor)
	}

	t.Run("Scenario: A stop whose origin is inside the clearance is refused with the origin reason", func(t *testing.T) {
		f := driftingAt("f1", refusalOwnerCorp, space.Vec3{X: 10}, inward)
		f.AttachedTo = "feat-x"
		if f.State.Drift.Anchor.Length() >= clr {
			t.Fatalf("arrangement no longer holds: origin must be inside the clearance")
		}
		e := newRefusalEnv(t, 0, bt, f)
		status, body := e.post(e.router(refusalOwnerCorp), stopPath("f1"), nil)
		assertRefused(t, "stop", status, body, 409, reasonOrigin)
		e.assertNothingChanged("f1") // attachment, motion state, fuel, no action, no write
	})

	t.Run("Scenario: A stop whose lead point is inside the clearance is refused with the destination reason", func(t *testing.T) {
		// 1.0 outside the clearance, heading straight at the star, above the floor:
		// the stop's lead point (MinArcLength*2 ahead) lands inside the clearance.
		f := driftingAt("f1", refusalOwnerCorp, space.Vec3{X: clr + 1}, inward)
		f.AttachedTo = "feat-x"
		if got := f.State.Drift.Anchor.Length() - clr; got != 1.0 {
			t.Fatalf("arrangement no longer holds: fleet is %.3f outside the clearance, want 1.0", got)
		}
		if lead := f.State.Drift.Anchor.Length() - space.MinArcLength*2; !(lead < clr) {
			t.Fatalf("arrangement no longer holds: lead point at %.3f is not inside the clearance %.3f", lead, clr)
		}
		e := newRefusalEnv(t, 0, bt, f)
		status, body := e.post(e.router(refusalOwnerCorp), stopPath("f1"), nil)
		assertRefused(t, "stop", status, body, 409, reasonDestination)
		e.assertNothingChanged("f1")
	})
}
