package disclosure

import (
	"testing"

	"hexaverse/space"
)

// fleet-movement, "Every Body In the System's Body Table Is a Valid
// Attachment Host" — "A sweep of a belt feature does not reveal a fleet
// masked at one of its members" (re-express-economy-positions tasks.md
// 3.4).
//
// NO CODE CHANGE EXPECTED: chainBeneath/FocusedScan resolve a host's masked
// chain via Attachments.AttachedTo(hostId) — an EXACT string match against
// a masked ship's stored host id. A belt member id ("feat-belt-0#3") is,
// and always has been, a distinct string from its parent belt feature's
// own id ("feat-belt-0"), so sweeping one was never going to reveal a
// fleet masked at the other. Deliberately parking the belt feature and its
// member at the IDENTICAL physical position (same orbital elements) makes
// this the strongest possible version of the test: even with zero
// geometric separation, only an EXACT host-id match discloses anything —
// proving the discrimination is id-based, not incidentally geometric. This
// pins that fact against a regression (e.g. a future "resolve a member
// sweep to its parent" convenience shortcut).
func TestFocusedScan_Scenario_SweepOfBeltDoesNotRevealFleetMaskedAtMember(t *testing.T) {
	const beltId, memberId = "feat-belt-0", "feat-belt-0#3"
	att := fakeAttachments{"scanner": memberId}
	sharedOrbit := &space.Orbit{ParentId: "star", Radius: 40, PeriodMs: 0, Phase: 0}
	w := World{
		Bodies: fakeBodies{
			"star":   {Id: "star", Size: starSize},
			beltId:   {Id: beltId, Size: 3, Orbit: sharedOrbit},
			memberId: {Id: memberId, Size: 1, Orbit: sharedOrbit},
		},
		Attachments: att,
		StarId:      "star",
		StarSize:    starSize,
	}
	beltPos, err := space.Position(w.Bodies, beltId, 0)
	if err != nil {
		t.Fatalf("resolving the belt feature: %v", err)
	}
	scanner := space.Vec3{X: beltPos.X + 10, Y: beltPos.Y, Z: beltPos.Z}

	masked := parkedAt("scanner", beltPos)
	ships := map[string]Ship{"scanner": masked}

	t.Run("sweeping the parent belt feature reveals nothing", func(t *testing.T) {
		got, err := FocusedScan(w, scanner, beltId, ships, 0)
		if err != nil {
			t.Fatalf("FocusedScan of the belt feature: %v", err)
		}
		if len(got) != 1 || !got[0].CleanSweep {
			t.Errorf("sweeping %q with a fleet masked at %q (a DIFFERENT host id) minted %+v, want a clean sweep only", beltId, memberId, got)
		}
	})

	t.Run("sweeping the exact member id it is masked at DOES reveal it", func(t *testing.T) {
		got, err := FocusedScan(w, scanner, memberId, ships, 0)
		if err != nil {
			t.Fatalf("FocusedScan of the member: %v", err)
		}
		if len(got) != 1 || got[0].TargetId != "scanner" {
			t.Errorf("sweeping the exact host id the fleet is masked at minted %+v, want the fleet revealed", got)
		}
	})
}
