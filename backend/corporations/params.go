package corporations

import (
	"fmt"
)

// SpawnParams are the spawn-placement knobs (#0009). The numbers still wait for
// whole-graph tuning; the SHAPE — an outward lane-graph walk that materializes
// as it goes, filtered by the four criteria, drawn uniformly within the first
// qualifying ring — is what survives that tuning. Frontier weighting retired
// with the finite galaxy: the nearest-qualifying-ring rule already lands new
// corporations just beyond the settled fringe.
type SpawnParams struct {
	// MinSpawnDistance is the minimum graph distance (lane hops) a candidate must
	// keep from every OTHER living corporation's explored set — "unclaimed" space.
	MinSpawnDistance int
	// RequireMineable gates on the bootstrap guarantee: a candidate must carry ≥1
	// Mineable body on its #0001 skeleton, so a new player can never softlock.
	RequireMineable bool
	// MaxSpawnWalkBlocks is the walk's DEFENSIVE expansion-depth cap: the maximum
	// block-hop (Chebyshev) distance from the block set where the walk began.
	// Deliberately NOT a count of blocks touched (which would grow with the
	// frontier's width and make the cap population-dependent) and NOT a distance
	// from the field origin (which would be a world boundary — the very thing
	// this change deletes). Exceeding it means misconfiguration or field
	// degeneracy, never accumulating players.
	MaxSpawnWalkBlocks int
	// MaxSpawnRepicks bounds how many times a spawn losing the create-if-absent
	// reservation race re-runs selection against the now-visible reservation.
	MaxSpawnRepicks int
}

// DefaultSpawnParams are the slice placeholders. The placement knobs stay here —
// they're spawn RULES, applied once at wake, not live pacing an admin would retune
// on a running world.
func DefaultSpawnParams() SpawnParams {
	return SpawnParams{
		MinSpawnDistance:   3,
		RequireMineable:    true,
		MaxSpawnWalkBlocks: 64,
		MaxSpawnRepicks:    4,
	}
}

// Validate rejects placement knobs that would make the walk unusable. Both caps
// must be positive: a non-positive walk depth fences the search into its own
// starting blocks, and a non-positive re-pick budget makes any reservation race
// unrecoverable.
func (p SpawnParams) Validate() error {
	if p.MaxSpawnWalkBlocks < 1 {
		return fmt.Errorf("%w: maxSpawnWalkBlocks must be positive, got %d", ErrInvalidSpawnParams, p.MaxSpawnWalkBlocks)
	}
	if p.MaxSpawnRepicks < 1 {
		return fmt.Errorf("%w: maxSpawnRepicks must be positive, got %d", ErrInvalidSpawnParams, p.MaxSpawnRepicks)
	}
	return nil
}
