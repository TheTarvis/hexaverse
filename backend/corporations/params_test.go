package corporations

import (
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/system"
)

// TestDefaultSpawnParams pins the slice placeholder knobs — a guard so a careless
// edit to the constants (which tune where new players wake) is a visible change.
func TestDefaultSpawnParams(t *testing.T) {
	p := DefaultSpawnParams()
	if p.MinSpawnDistance < 0 {
		t.Fatalf("MinSpawnDistance = %d, must be non-negative", p.MinSpawnDistance)
	}
	if !p.RequireMineable {
		t.Fatal("RequireMineable should default true — the bootstrap guarantee is on")
	}
	// The walk's two defensive rails must be positive, or the search fences
	// itself in (depth) or cannot recover from a reservation race (re-picks).
	if err := p.Validate(); err != nil {
		t.Fatalf("the shipped defaults must validate: %v", err)
	}
	// DELETED (migrate-fleet-to-continuous-burns, design.md Decision 4/14,
	// tasks.md 3.9): "the starting hull coasts one ring inside the
	// lane-gate ring" — SpawnParams.RimRing no longer exists. A fleet's
	// spawn position is now a continuous space.Vec3 (homeSpawnPosition,
	// spawn_position.go), not a discrete cell derived from RimRing. Successor
	// coverage: spawn_position_test.go's TestHomeSpawnPosition_Scenario_*
	// (not to be touched by this pass).
}

// The one surviving wiring guard on the central generation-index knob: system
// generates every interior out to the index the knob names. This is the ONLY
// live assertion that the knob still drives system generation, which is
// precisely what keeps the knob alive — SystemInterior.Extent =
// ContinuousRadius(params.Radius) reads it, so deleting it would silently
// change every system's continuous extent.
//
// DELETED, not migrated: two former legs. (1) spawn resting the starting hull
// one ring inside the gate ring via SpawnParams.RimRing
// (migrate-fleet-to-continuous-burns, design.md Decision 4/14, tasks.md 3.9)
// — RimRing is gone; a fleet's spawn position is a continuous space.Vec3, its
// own invariant covered by spawn_position_test.go. (2) fleet placing lane
// gates at that same index — that field is gone too; a lane gate is a body
// with a continuous orbit, so fleet holds no index to keep in lockstep.
func TestMaxOrbitalIndexInvariant(t *testing.T) {
	maxIndex := common.Tuning().MaxOrbitalIndex

	if got := system.DefaultParams().Radius; got != maxIndex {
		t.Errorf("system generation index = %d, want %d (common.Tuning().MaxOrbitalIndex)", got, maxIndex)
	}
}

// Turning the central knob must move the surviving leg — this is the property
// that makes a future admin page safe to point at the knob, and the
// SetTuning-and-observe structure is what proves the wiring is live rather
// than coincidental. (See TestMaxOrbitalIndexInvariant's DELETED note for the
// two legs that no longer exist to track anything.)
func TestMaxOrbitalIndexInvariant_TracksTuning(t *testing.T) {
	original := common.Tuning()
	t.Cleanup(func() { common.SetTuning(original) })

	retuned := common.DefaultTuning()
	retuned.MaxOrbitalIndex = 20
	common.SetTuning(retuned)

	if got := system.DefaultParams().Radius; got != 20 {
		t.Errorf("system generation index = %d, want 20 — it did not follow the central knob", got)
	}
}

// The rails must be REJECTED when non-positive: a zero walk depth fences the
// search into its own starting blocks, and a zero re-pick budget makes any
// reservation race unrecoverable.
func TestSpawnParams_ValidateRejectsDegenerateRails(t *testing.T) {
	for name, mutate := range map[string]func(*SpawnParams){
		"zero walk depth":     func(p *SpawnParams) { p.MaxSpawnWalkBlocks = 0 },
		"negative walk depth": func(p *SpawnParams) { p.MaxSpawnWalkBlocks = -1 },
		"zero re-picks":       func(p *SpawnParams) { p.MaxSpawnRepicks = 0 },
	} {
		t.Run(name, func(t *testing.T) {
			p := DefaultSpawnParams()
			mutate(&p)
			err := p.Validate()
			if err == nil {
				t.Fatal("expected a validation error")
			}
			if !errors.Is(err, ErrInvalidSpawnParams) {
				t.Fatalf("error %v does not wrap ErrInvalidSpawnParams", err)
			}
		})
	}
}
