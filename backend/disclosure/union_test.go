package disclosure

// Unit coverage for DiscloseUnion (task 4.4, proximity-disclosure
// "Disclosure to a Corporation Is the Union Over Its Own Assets"), written
// at this package's own grain rather than relying solely on the emulator-
// backed e2e suite (disclosure_wiring_e2e_test.go) that exercises the same
// requirement through the full HTTP stack. Table-driven, per the repo's own
// testing bar.

import (
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

func TestDiscloseUnion(t *testing.T) {
	w := testWorld(nil)
	const t0 common.WorldMillis = 0

	near := observerAt(space.Vec3{X: 44, Y: 200})
	far := observerAt(space.Vec3{X: 4_000, Y: 4_000})
	target := parkedAt("target", space.Vec3{X: 40, Y: 200})
	unseen := parkedAt("far-away", space.Vec3{X: 9_000, Y: 9_000})

	t.Run("a target seen by only one of several observers is disclosed", func(t *testing.T) {
		got, err := DiscloseUnion(w, []Observer{far, near}, []Ship{target}, t0)
		if err != nil {
			t.Fatalf("DiscloseUnion: %v", err)
		}
		if len(got) != 1 {
			t.Fatalf("got %d contacts, want exactly 1: %+v", len(got), got)
		}
	})

	t.Run("a target seen by more than one observer is disclosed exactly once", func(t *testing.T) {
		got, err := DiscloseUnion(w, []Observer{near, near}, []Ship{target}, t0)
		if err != nil {
			t.Fatalf("DiscloseUnion: %v", err)
		}
		if len(got) != 1 {
			t.Errorf("got %d contacts, want exactly 1 — a target seen by two observers must not appear twice: %+v", len(got), got)
		}
	})

	t.Run("a target disclosed by no observer is absent", func(t *testing.T) {
		got, err := DiscloseUnion(w, []Observer{near}, []Ship{unseen}, t0)
		if err != nil {
			t.Fatalf("DiscloseUnion: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("got %d contacts, want 0: %+v", len(got), got)
		}
	})

	t.Run("no observers discloses nothing", func(t *testing.T) {
		got, err := DiscloseUnion(w, nil, []Ship{target}, t0)
		if err != nil {
			t.Fatalf("DiscloseUnion: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("got %d contacts, want 0 with zero observers: %+v", len(got), got)
		}
	})

	t.Run("a masked target is absent even with an observer in range", func(t *testing.T) {
		masked := testWorld(fakeAttachments{"masked-target": "planet"})
		hidden := Ship{Id: "masked-target", State: space.ShipState{
			Mode: space.ModeParked,
			Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 44, Y: 200}},
		}}
		got, err := DiscloseUnion(masked, []Observer{near}, []Ship{hidden}, t0)
		if err != nil {
			t.Fatalf("DiscloseUnion: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("got %d contacts, want 0 — a masked target must not be disclosed: %+v", len(got), got)
		}
	})
}
