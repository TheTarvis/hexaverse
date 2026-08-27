package disclosure

import (
	"errors"
	"testing"

	"hexaverse/space"
)

// The star is the capability's only occluder, so resolving its position is
// on every disclosure path. It resolves through the same hierarchical body
// lookup every other position does — the star is simply the parentless body
// at the origin — rather than through a stored coordinate this package
// would then have to keep in step.
func TestWorld_StarPositionResolvesThroughTheBodyLookup(t *testing.T) {
	w := testWorld(nil)
	got, err := w.starPosition(123_456)
	if err != nil {
		t.Fatalf("resolving the star: %v", err)
	}
	if got != (space.Vec3{}) {
		t.Errorf("the star is at %v, want the origin — a parentless body does not move", got)
	}
}

// A world whose star does not resolve fails the disclosure rather than
// quietly falling back to an unoccluded sightline. Degrading to "nothing
// blocks" would be a disclosure regression dressed as resilience: it turns
// a data fault into free vision through the one thing that hides anything.
func TestWorld_AnUnresolvableStarFailsRatherThanUnblocking(t *testing.T) {
	w := testWorld(nil)
	w.StarId = "no-such-star"

	obs := observerAt(space.Vec3{X: 40, Y: 30})
	target := parkedAt("t", space.Vec3{X: 44, Y: 30})

	if _, ok, err := Disclose(w, obs, target, 0); !errors.Is(err, space.ErrUnknownBody) || ok {
		t.Errorf("Disclose with an unresolvable star returned (ok=%v, err=%v), want ErrUnknownBody and no disclosure", ok, err)
	}
}

// AttachedTo's ordering contract, asserted because a focused scan mints in
// the order it reports: an unstable order would make the same sweep produce
// different output from the same world.
func TestAttachments_AttachedToIsStablyOrdered(t *testing.T) {
	att := fakeAttachments{"zulu": "host", "alpha": "host", "mike": "host", "elsewhere": "other"}
	first := att.AttachedTo("host")
	for i := 0; i < 20; i++ {
		again := att.AttachedTo("host")
		if len(again) != len(first) {
			t.Fatalf("AttachedTo returned %d ids, then %d", len(first), len(again))
		}
		for j := range first {
			if first[j] != again[j] {
				t.Fatalf("AttachedTo order is unstable: %v then %v", first, again)
			}
		}
	}
	if len(first) != 3 {
		t.Errorf("AttachedTo(host) = %v, want exactly the three ships docked there", first)
	}
}
