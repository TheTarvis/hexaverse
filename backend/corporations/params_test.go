package corporations

import (
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
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
	// spawn_position.go), not a board.Cell derived from RimRing. Successor
	// coverage: spawn_position_test.go's TestHomeSpawnPosition_Scenario_*
	// (not to be touched by this pass).
}

// The board-geometry invariant between system generation and fleet's lane-gate
// ring, previously enforced (together with a third, now-deleted leg — see the
// NOTE below) only by "must match" comments: system generates every interior
// at radius R and fleet places lane gates on ring R. Both still derive from
// common.Tuning().BoardRadius, so this asserts that half of the wiring still
// holds — a regression here silently puts gates in the void.
//
// DELETED, not migrated (migrate-fleet-to-continuous-burns, design.md
// Decision 4/14, tasks.md 3.9): the third leg this test used to check — spawn
// resting the starting hull on ring R-1 via SpawnParams.RimRing — no longer
// has a meaning to assert. RimRing is gone; a fleet's spawn position is a
// continuous space.Vec3 with no ring to be in lockstep with BoardRadius. Its
// own invariant (never inside the star's clearance shell) is covered by
// spawn_position_test.go.
func TestBoardRadiusInvariant(t *testing.T) {
	radius := common.Tuning().BoardRadius

	if got := system.DefaultParams().Radius; got != radius {
		t.Errorf("system generation radius = %d, want %d (common.Tuning().BoardRadius)", got, radius)
	}
	if got := fleet.DefaultMovementParams().BoardRadius; got != radius {
		t.Errorf("fleet gate ring = %d, want %d (common.Tuning().BoardRadius)", got, radius)
	}
}

// Turning the central knob must move both remaining legs in lockstep — this is
// the property that makes a future admin page safe to point at BoardRadius.
// (See TestBoardRadiusInvariant's DELETED note: the spawn/RimRing leg no
// longer exists to track anything.)
func TestBoardRadiusInvariant_TracksTuning(t *testing.T) {
	original := common.Tuning()
	t.Cleanup(func() { common.SetTuning(original) })

	retuned := common.DefaultTuning()
	retuned.BoardRadius = 20
	common.SetTuning(retuned)

	if got := system.DefaultParams().Radius; got != 20 {
		t.Errorf("system radius = %d, want 20 — it did not follow the central knob", got)
	}
	if got := fleet.DefaultMovementParams().BoardRadius; got != 20 {
		t.Errorf("fleet gate ring = %d, want 20 — it did not follow the central knob", got)
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
