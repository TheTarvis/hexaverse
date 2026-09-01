package disclosure

// RED-phase tests for replace-observation-with-sightings §4, tasks.md 4.3
// (proximity-disclosure ADDED "A Disclosure-Computed Sighting Carries Its
// System") and tasks.md 4.2 (proximity-disclosure MODIFIED "A Docked Ship Is
// Masked and Registers Only As Its Host" — "The masking predicate applies to
// any attached id, not just ships").
//
// SIGNATURE NOTE (see the SDET handoff report): design.md Decision 16 and
// tasks.md 4.3 both say SystemId is "threaded through MintSighting". This
// file does NOT change MintSighting's or FocusedScan's existing exported
// signatures, because both already have call sites in the already-committed,
// immutable sighting_test.go (§3) — MintSighting(w.Bodies, fleet, hostId,
// asOf) and FocusedScan(w, scanner, hostId, ships, t) — and the kickoff
// instructions name only contact_test.go as touchable. Instead this file
// pins the OBSERVABLE requirement (every disclosure.Sighting value the
// capability computes carries its system) against World.SystemId, a new,
// purely ADDITIVE field (safe: every existing World{...} literal in this
// repo uses named fields, so a new field cannot break any of them) — and
// against FocusedScan's UNCHANGED signature, which already takes a World and
// can read w.SystemId internally with no call-site changes anywhere. If the
// implementer instead threads SystemId by changing MintSighting's own
// signature, sighting_test.go's existing calls must be mechanically updated
// to match — a call-site arity fix, not a scenario edit — and that dispute,
// if any, is the orchestrator's to adjudicate, not mine to pre-empt by
// guessing a signature I cannot verify compiles against §3's frozen tests.

import (
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// Scenario: A computed sighting names its system (proximity-disclosure "A
// Disclosure-Computed Sighting Carries Its System").
//
// EXPECTED RED TODAY: compile error — World has no SystemId field.
func TestWorld_HasASystemIdField(t *testing.T) {
	w := World{SystemId: "sys-alpha"}
	if w.SystemId != "sys-alpha" {
		t.Fatalf("World.SystemId = %q, want sys-alpha", w.SystemId)
	}
}

// Scenario: A computed sighting names its system, exercised through
// FocusedScan's composition-bearing path (a chained ship masked at the swept
// host).
func TestFocusedScan_Scenario_AComputedSightingNamesItsSystem(t *testing.T) {
	w := testWorld(fakeAttachments{"docked": "planet"})
	w.SystemId = "sys-alpha"

	// FIXTURE FIX (orchestrator-adjudicated, developer's report): the scanner
	// must sit within FocusedScanRange (48) of the swept host, not 200 units
	// out — mirroring sighting_test.go's own TestFocusedScan fixture, which
	// resolves the host's real position and offsets a small, in-range amount
	// from it, rather than assuming a hardcoded coordinate.
	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	scanner := space.Vec3{X: planetPos.X + 10, Y: planetPos.Y, Z: planetPos.Z}
	docked := parkedAt("docked", planetPos)
	ships := map[string]Ship{"docked": docked}

	got, err := FocusedScan(w, scanner, "planet", ships, 0)
	if err != nil {
		t.Fatalf("FocusedScan: %v", err)
	}
	if len(got) == 0 {
		t.Fatalf("expected at least one minted sighting")
	}
	for _, s := range got {
		if s.SystemId != w.SystemId {
			t.Errorf("minted sighting SystemId = %q, want %q — every computed disclosure.Sighting value must "+
				"carry the system it was computed in", s.SystemId, w.SystemId)
		}
	}
}

// Scenario: A computed sighting names its system, exercised through
// FocusedScan's clean-sweep path — the clean-sweep record is itself a
// computed Sighting value and must carry its system exactly like any other.
func TestFocusedScan_Scenario_ACleanSweepRecordNamesItsSystem(t *testing.T) {
	w := testWorld(nil)
	w.SystemId = "sys-beta"

	// FIXTURE FIX — see the identical note on the sibling test above: the
	// scanner must be within FocusedScanRange (48) of the host, not 200.
	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	scanner := space.Vec3{X: planetPos.X + 10, Y: planetPos.Y, Z: planetPos.Z}
	got, err := FocusedScan(w, scanner, "planet", map[string]Ship{}, 4_200)
	if err != nil {
		t.Fatalf("FocusedScan: %v", err)
	}
	if len(got) != 1 || !got[0].CleanSweep {
		t.Fatalf("expected exactly one clean-sweep record, got %+v", got)
	}
	if got[0].SystemId != w.SystemId {
		t.Errorf("clean-sweep record SystemId = %q, want %q", got[0].SystemId, w.SystemId)
	}
}

// Scenario: The masking predicate applies to any attached id, not just
// ships (proximity-disclosure "A Docked Ship Is Masked and Registers Only As
// Its Host"). A non-ship attachment fixture — any entity id the masking
// predicate is given, standing in for a future attachable entity such as a
// mine, per the requirement's own text — is masked by the identical rule a
// ship is.
//
// STRUCTURAL GUARD, PASSES TODAY: Masked/OutermostHost/chainBeneath already
// operate on bare string ids with no ship-specific type anywhere in their
// signatures (mask.go). This is included per the SDET's standing rule (every
// requirement gets a test reaching it through the real predicate, not an
// inference from reading the code) and reported as a guard, not a
// behavioral red — see the SDET handoff report.
func TestMasked_Scenario_MaskingPredicateAppliesToAnyAttachedIdNotJustShips(t *testing.T) {
	att := fakeAttachments{"mine-1": "planet"}
	// A deliberately generic, non-emitting state — nothing here is
	// ship-specific; the fixture's "shape" carries no information the
	// masking predicate consults beyond emission and attachment.
	idle := space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}}

	masked, err := Masked(att, "mine-1", idle, 0)
	if err != nil {
		t.Fatalf("Masked: %v", err)
	}
	if !masked {
		t.Errorf("a non-ship attachment fixture docked to a host must be masked by the identical rule a ship is")
	}
}

// Companion to the above at the Disclose level: the masked fixture is not
// disclosed, and the host (a body, never itself run through Disclose) is
// unaffected — proving the masking rule's DISCLOSURE consequence is equally
// generic, not merely the boolean predicate.
func TestDisclose_Scenario_MaskingPredicateAppliesToAnyAttachedIdNotJustShips(t *testing.T) {
	w := testWorld(fakeAttachments{"mine-1": "planet"})
	obs := observerAt(space.Vec3{X: 40, Y: 5})

	fixture := Ship{Id: "mine-1", State: space.ShipState{
		Mode: space.ModeParked,
		Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 40, Y: 0}},
	}}

	_, disclosed, err := Disclose(w, obs, fixture, common.WorldMillis(0))
	if err != nil {
		t.Fatalf("Disclose: %v", err)
	}
	if disclosed {
		t.Errorf("a non-ship attachment fixture masked at its host must not be disclosed, exactly as a masked " +
			"ship would not be")
	}
}
