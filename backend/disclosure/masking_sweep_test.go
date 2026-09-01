package disclosure

// RED-phase tests for openspec change replace-observation-with-sightings §5,
// task 5.7 (specs/proximity-disclosure/spec.md MODIFIED "Lighting a Drive
// Breaks Masking" — "A sweeping ship is unmasked for its sweep"; restated at
// the verb level by specs/focused-scan/spec.md "A Sweep Unmasks Its
// Scanner").
//
// SIGNATURE NOTE (SDET judgment call): unlike emission — which `Masked`
// already reads internally off `space.ShipState.Burn` — a sweep window
// lives on `Ship.Scan` (scanning_test.go's own contract note), and
// `Masked`'s existing 4-argument signature
// (`Masked(att Attachments, id string, s space.ShipState, t) (bool, error)`)
// is exercised by the ALREADY-COMMITTED, IMMUTABLE mask_test.go
// (`TestMasked_LightingADriveBreaksMasking`,
// `TestMasked_UnattachedAndNilAttachments`) at that exact arity — widening
// it to also accept a `*ScanWindow` would force an unauthorized edit to
// that file. This file therefore assumes the sweep disjunct is composed at
// the CALLER (`Disclose`), exactly the way `mask.go`'s own doc comment
// already frames emission as "ORDER... emission wins": `Disclose` computes
// `Masked(...)` and then un-masks the result when `Scanning(target, t)` is
// true, mirroring the base predicate's existing `Emitting` short-circuit
// one level up rather than inside `Masked` itself. Tested here entirely
// through the exported `Disclose` function — no assumption about an
// internal call shape inside package-private code.
//
// EXPECTED RED TODAY: `Ship.Scan`/`ScanWindow` do not exist (compile
// error), and once they do, `Disclose` does not yet un-mask a sweeping
// ship — a masked, sweeping ship stays absent, which is the behavioral red
// this file is really for.

import (
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// Scenario: Committing a sweep ends masking for its duration / A sweeping
// ship is unmasked for its sweep.
func TestDisclose_Scenario_CommittingASweepEndsMaskingForItsDuration(t *testing.T) {
	att := fakeAttachments{"scanner": "host"}
	w := testWorld(att)
	obs := observerAt(space.Vec3{X: 40, Y: 30})
	at := space.Vec3{X: 44, Y: 30} // well off the star; masking is the subject, not occlusion

	scanner := parkedAt("scanner", at)

	// Before the sweep begins: masked, exactly as an ordinary docked ship.
	if _, ok, err := Disclose(w, obs, scanner, 500); err != nil || ok {
		t.Fatalf("a masked ship with no active sweep yet is disclosed (ok=%v, err=%v); the scenario needs it hidden first", ok, err)
	}

	sweeping := scanner
	sweeping.Scan = &ScanWindow{DepartMs: 1_000, ArriveMs: 5_000, Range: 10}

	for _, tt := range []common.WorldMillis{1_000, 3_000, 4_999} {
		contact, ok, err := Disclose(w, obs, sweeping, tt)
		if err != nil {
			t.Fatalf("Disclose during sweep at %d: %v", tt, err)
		}
		if !ok {
			t.Errorf("a fleet masked at a host but running an active sweep at t=%d is still absent — "+
				"committing a sweep must end masking for its duration, exactly as emission does", tt)
			continue
		}
		if !contact.Scanning {
			t.Errorf("the unmasked-by-sweep contact at t=%d does not report Scanning", tt)
		}
	}
}

// Scenario: Masking resumes once the sweep ends.
func TestDisclose_Scenario_MaskingResumesOnceSweepEnds(t *testing.T) {
	att := fakeAttachments{"scanner": "host"}
	w := testWorld(att)
	obs := observerAt(space.Vec3{X: 40, Y: 30})
	at := space.Vec3{X: 44, Y: 30}

	sweeping := parkedAt("scanner", at)
	sweeping.Scan = &ScanWindow{DepartMs: 1_000, ArriveMs: 5_000, Range: 10}

	if _, ok, err := Disclose(w, obs, sweeping, 5_000); err != nil || ok {
		t.Errorf("a fleet whose sweep has reached its arrive time, remaining docked at its host throughout, "+
			"is still disclosed (ok=%v, err=%v) — masking must resume", ok, err)
	}
}
