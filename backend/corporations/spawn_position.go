package corporations

import (
	"hexaverse/space"
	"hexaverse/system"
)

// homeSpawnPosition derives the starting hull's continuous spawn park
// (migrate-fleet-to-continuous-burns, design.md Decision 16, Open Question
// 3), replacing rimCell/SpawnParams.RimRing (tasks.md 3.9) now that a fleet's
// position is a space.Vec3, never a discrete cell.
//
// design.md's Open Question 3 leaves the exact geometric target open ("a
// ParkOrbit around the star vs. docked at the home station... is a feel
// question... not settled here"). This change's default, documented here
// since silence is the failure mode: a point at radius
// extent*system.GateRadiusFactor — the SAME radius every lane gate in the
// system sits at (system/bodies.go's gateOrbit) — phase-seeded by account id
// so a healed retry reproduces the same position. Landing a fresh hull on
// the gate ring (rather than docked at the home station, the design doc's
// "most defensible" alternative) is chosen because it needs no new fleet-
// station docking wiring in this change (link 6, re-express-economy-
// positions, is what redefines what a valid dock host is) and it is
// trivially provable never to land inside any configured star's clearance
// shell (spawn_position_test.go's own calibration check) — the same
// checked-math property Decision 14 already relies on for gate placement.
//
// Deterministic and idempotent per account: the same accountId at the same
// extent always reproduces the same position (a healed spawn retry lands the
// hull in the same spot, never a second one at a different point).
func homeSpawnPosition(accountId string, extent float64) space.Vec3 {
	radius := extent * system.GateRadiusFactor
	idx := space.SubTurns(uint64(seedFromAccount(accountId)) % uint64(space.SubTurn))
	cos, sin := space.CosSin(idx)
	return space.Vec3{X: float64(radius * cos), Z: float64(radius * sin)}
}
