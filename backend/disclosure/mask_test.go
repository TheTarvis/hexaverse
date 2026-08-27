package disclosure

import (
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// Scenario: A masked ship is not disclosed inside passive range / The
// host's disclosure is identical either way (proximity-disclosure › "A
// Docked Ship Is Masked and Registers Only As Its Host"). tasks.md 6.1,
// 6.3, 6.5.
//
// The second half is the requirement that actually needs a test: it is easy
// to hide the docked ship and then leak it right back through a count, a
// size, or a signature term on the host. Two otherwise identical hosts —
// one loaded, one empty — must disclose field-for-field identically, and
// they do here structurally, because nothing on the live path can even see
// the chain (chainBeneath is reachable only from the focused scan).
func TestDisclose_MaskedShipIsAbsentAndItsHostIsUnchanged(t *testing.T) {
	// Held well off the star: this scenario is about masking, so nothing in
	// its geometry may be occluded.
	at := space.Vec3{X: 44, Y: 30}
	att := fakeAttachments{"docked": "loadedHost"}
	w := testWorld(att)
	obs := observerAt(space.Vec3{X: 40, Y: 30})

	docked := parkedAt("docked", at)
	if _, ok, err := Disclose(w, obs, docked, 0); err != nil || ok {
		t.Errorf("a ship docked well inside passive range is disclosed (ok=%v, err=%v)", ok, err)
	}

	loaded := parkedAt("loadedHost", at)
	empty := parkedAt("emptyHost", at)

	loadedContact, loadedOk, err := Disclose(w, obs, loaded, 0)
	if err != nil || !loadedOk {
		t.Fatalf("the loaded host is not disclosed (ok=%v, err=%v)", loadedOk, err)
	}
	emptyContact, emptyOk, err := Disclose(w, obs, empty, 0)
	if err != nil || !emptyOk {
		t.Fatalf("the empty host is not disclosed (ok=%v, err=%v)", emptyOk, err)
	}
	if loadedContact != emptyContact {
		t.Errorf("a loaded host discloses as %+v and an empty one as %+v; no field may vary with what is masked at it", loadedContact, emptyContact)
	}
}

// Scenario: A ship docked to a carrier at a body registers as the body
// (proximity-disclosure › "Masking Chains Through Its Host to the Outermost
// Host"). tasks.md 6.2, 6.6.
//
// Transitive resolution is the chosen starting point over the narrower
// alternative (sweeping the body reveals only the carrier). Neither the
// ship nor the carrier appears; the body is astronomical and is not a
// disclosure subject at all.
func TestOutermostHost_ChainsToTheOutermostHost(t *testing.T) {
	att := fakeAttachments{"ship": "carrier", "carrier": "planet"}
	w := testWorld(att)
	obs := observerAt(space.Vec3{X: 38})
	at := space.Vec3{X: 40}

	host, err := OutermostHost(att, "ship")
	if err != nil {
		t.Fatalf("resolving the chain: %v", err)
	}
	if host != "planet" {
		t.Errorf("OutermostHost(ship) = %q, want the chain's outermost host %q", host, "planet")
	}

	for _, id := range []string{"ship", "carrier"} {
		if _, ok, err := Disclose(w, obs, parkedAt(id, at), 0); err != nil || ok {
			t.Errorf("%s is disclosed (ok=%v, err=%v); a chained ship registers only as the outermost host", id, ok, err)
		}
	}

	// An unattached ship at the same place is disclosed, so the scenario is
	// testing masking and not an accident of the geometry.
	if _, ok, err := Disclose(w, obs, parkedAt("free", at), 0); err != nil || !ok {
		t.Errorf("an unattached ship at the same position is not disclosed (ok=%v, err=%v)", ok, err)
	}
}

// Scenario: An attachment cycle is a data error (proximity-disclosure ›
// "Masking Chains Through Its Host to the Outermost Host"). tasks.md 6.7.
//
// A cycle fails rather than looping or returning a partial chain, on both
// resolution paths: walking up to the outermost host, and walking down the
// chain a focused scan sweeps.
func TestOutermostHost_CycleIsADataError(t *testing.T) {
	att := fakeAttachments{"a": "b", "b": "c", "c": "a"}

	if _, err := OutermostHost(att, "a"); !errors.Is(err, ErrAttachmentCycle) {
		t.Errorf("OutermostHost on a cycle returned %v, want ErrAttachmentCycle", err)
	}
	if _, err := chainBeneath(att, "a"); !errors.Is(err, ErrAttachmentCycle) {
		t.Errorf("chainBeneath on a cycle returned %v, want ErrAttachmentCycle", err)
	}

	// A self-attachment is the degenerate cycle and fails the same way.
	if _, err := OutermostHost(fakeAttachments{"solo": "solo"}, "solo"); !errors.Is(err, ErrAttachmentCycle) {
		t.Errorf("OutermostHost on a self-attachment returned %v, want ErrAttachmentCycle", err)
	}
}

// Scenario: Departure is visible / Arrival re-masks on dock (proximity-
// disclosure › "Lighting a Drive Breaks Masking"). tasks.md 6.4, 6.8.
//
// Emission and masking can never hold at once, and the clock that decides
// it is the burn's own stored integer interval — so departure is detectable
// at exactly departMs, and the re-mask at arrival needs no separate write:
// the interval closes, the stored attachment is still there, and the ship
// is hidden again.
func TestMasked_LightingADriveBreaksMasking(t *testing.T) {
	const depart, arrive common.WorldMillis = 1_000, 5_000
	att := fakeAttachments{"ship": "planet"}
	ship := burningFrom("ship", space.Vec3{X: 40}, space.Vec3{X: 45}, depart, arrive, 8, 2)

	cases := []struct {
		name string
		at   common.WorldMillis
		want bool
	}{
		{"docked before departure", depart - 1, true},
		{"unmasked at exactly departure", depart, false},
		{"unmasked in flight", arrive - 1, false},
		{"re-masked at exactly arrival", arrive, true},
		{"still masked after arrival", arrive + 10_000, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := Masked(att, "ship", ship.State, c.at)
			if err != nil {
				t.Fatalf("Masked: %v", err)
			}
			if got != c.want {
				t.Errorf("Masked at %d = %v, want %v", c.at, got, c.want)
			}
		})
	}
}

// A ship attached to nothing is never masked, and a nil Attachments — a
// world where nothing docks at all — resolves every ship to itself rather
// than erroring.
func TestMasked_UnattachedAndNilAttachments(t *testing.T) {
	ship := parkedAt("free", space.Vec3{X: 1})

	got, err := Masked(fakeAttachments{}, "free", ship.State, 0)
	if err != nil || got {
		t.Errorf("an unattached ship is masked (got=%v, err=%v)", got, err)
	}
	got, err = Masked(nil, "free", ship.State, 0)
	if err != nil || got {
		t.Errorf("a ship in a world with no attachment store is masked (got=%v, err=%v)", got, err)
	}
	if host, err := OutermostHost(nil, "free"); err != nil || host != "free" {
		t.Errorf("OutermostHost with no attachment store = (%q, %v), want the id itself", host, err)
	}
}
