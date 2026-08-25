# Board Tactical Math Specification

## Purpose
Pure, deterministic hex-grid geometry and kinematics shared by every backend
domain that reasons about a system's tactical board (`system-interior`,
`fleet-movement`, `observation-fog-and-scan`) and mirrored byte-for-byte in
the frontend (`lib/hex`). No Firestore or clock dependency — every function
is a pure function of its inputs, so Go and TypeScript can be asserted
against the same golden fixtures (`/fixtures/board/cases.json`).

## Requirements

### Requirement: Axial Hex Coordinates and Distance
The system SHALL represent board positions as axial `(Q, R)` hexes centred
on the star at `(0,0)`, and SHALL compute hex distance and ring number via
the standard cube-coordinate conversion.

#### Scenario: Distance is symmetric hex-grid distance
- **WHEN** the distance between two axial hexes is computed
- **THEN** it equals the cube-coordinate distance between them, converted
  back to axial

#### Scenario: A hex's ring is its distance from the star
- **WHEN** a hex's ring is computed
- **THEN** it equals its distance from `(0,0)`

### Requirement: Contiguous Hex-Line Paths
The system SHALL compute the contiguous hex path between two hexes via
cube-coordinate linear interpolation and rounding, inclusive of both
endpoints, with each consecutive pair of hexes exactly one step apart.

#### Scenario: A degenerate line is a single hex
- **WHEN** the line from a hex to itself is computed
- **THEN** the result is that single hex

#### Scenario: A line's length matches hex distance
- **WHEN** the line between two distinct hexes is computed
- **THEN** its length is `Distance(a, b) + 1` and every consecutive pair is
  one step apart

### Requirement: Core-Avoiding Routes
The system SHALL compute a burn route between two hexes that never passes
through the star's core hex `(0,0)`: the direct line when it does not cross
the core, or the shortest two-leg detour via a ring-1 hex beside the star
otherwise (ties broken by `RingHexes(1)` order). When avoidance is
impossible (an endpoint is the core itself), the direct line is returned.

#### Scenario: A route through the core detours
- **WHEN** the direct line between two hexes passes through `(0,0)`
- **THEN** the routed path avoids the core, remains contiguous between the
  same two endpoints, and is never shorter than the direct line

#### Scenario: A clear route is unchanged
- **WHEN** the direct line between two hexes does not pass through the core
- **THEN** the routed path is identical to the direct line

### Requirement: Deterministic Orbital State
The system SHALL compute a body's board hex at a given world time as a pure
function of its orbital elements (ring, epoch angle index, period,
direction) using integer-only arithmetic (no floating-point drift) so Go
and TypeScript compute byte-identical results. A period of zero or below
SHALL leave the body motionless at its epoch angle; ring 0 is always the
centre hex.

#### Scenario: An effectively infinite period is motionless
- **WHEN** a body's orbit has a very large period
- **THEN** its computed hex is identical at every sampled world time within
  the observed window, and equals its epoch-angle hex

#### Scenario: A full period returns the body to its start
- **WHEN** world time advances by exactly one full orbital period
- **THEN** the body's computed hex equals its hex at the epoch

#### Scenario: Half a period advances half the ring's cells
- **WHEN** world time advances by exactly half a body's orbital period
- **THEN** the body has advanced exactly half of its ring's `6 * ring` cells
  in its configured direction

### Requirement: Anti-Teleport Orbit Back-Solve
The system SHALL, when a moving body settles onto a hex at a given world
time (`OrbitThrough`), back-solve the orbit's epoch angle so that evaluating
the resulting orbit at that same world time (`OrbState`) yields exactly the
settle hex — never a different hex on the ring.

#### Scenario: Settling reproduces the settle hex exactly
- **WHEN** an orbit is back-solved to settle a body onto hex `h` at world
  time `at`, for any ring, period, settle time, and direction
- **THEN** evaluating that orbit at `at` yields exactly `h`

#### Scenario: A settled body still drifts afterward
- **WHEN** a back-solved orbit is evaluated at one ring-cell-time after the
  settle instant
- **THEN** the body's computed hex differs from the settle hex
- **AND** evaluating it a full period after the settle instant returns it
  to the settle hex

### Requirement: Effective Movement State Fold
The system SHALL compute a fleet's *effective* movement state at a world
time (`StateAt`) by folding a stored burn whose `arriveTime` has passed into
its settled result — docked on its target if `DockOnArrive` was set,
otherwise coasting a free orbit anchored at the arrival instant on the
burn's final hex's ring. A stored state that is not a completed burn is
returned unchanged. Lane transit is deliberately never folded by `StateAt`:
a due lane transit continues to report its stored (pre-arrival) position
until the authoritative resolve runs.

#### Scenario: A completed burn folds to a coast
- **WHEN** the effective state is computed for a stored burn whose
  `arriveTime` has passed and no `DockOnArrive` was set
- **THEN** the effective state is `coast`, anchored on the burn's final hex

#### Scenario: A completed dock-on-arrive burn folds to docked
- **WHEN** the effective state is computed for a stored burn whose
  `arriveTime` has passed and `DockOnArrive` names a parent feature
- **THEN** the effective state is `docked` to that parent

#### Scenario: An in-progress burn is unchanged
- **WHEN** the effective state is computed for a stored burn whose
  `arriveTime` has not yet passed
- **THEN** the effective state is the stored burn, unchanged

#### Scenario: A due lane transit does not fold
- **WHEN** the effective state is computed for a stored lane transit whose
  `arriveTime` has passed
- **THEN** the effective state remains the stored lane transit (positioned
  at its lane endpoint), not a settled/arrived state

### Requirement: Computed Ship Board Position
The system SHALL compute a fleet's board hex (`ShipPos`) by evaluating its
*effective* state (via the state fold) at a world time: the live orbital
position while coasting, the interpolated path position while burning, the
board-leg burn position while a lane transit's board leg is still in
progress, and "no board hex" (ok = false) once docked, parked mid-lane
(lane-hold), or already past the lane transit's departure gate.

#### Scenario: A burn interpolates along its path
- **WHEN** a fleet's ship position is computed partway through an
  in-progress burn
- **THEN** the returned hex lies along the burn's path, strictly between
  its start and end

#### Scenario: A completed burn reports the settled coast position
- **WHEN** a fleet's ship position is computed at or after a stored burn's
  `arriveTime`
- **THEN** the returned hex is on the burn's final hex's ring, and the call
  reports ok = true (position folds through `StateAt` — a caller that reads
  the raw stored burn still gets a correct, non-frozen position)

#### Scenario: Docked and lane-parked fleets have no board hex
- **WHEN** a fleet's ship position is computed while it is docked or parked
  mid-lane (lane-hold)
- **THEN** the call reports ok = false

#### Scenario: A lane transit is on-board only during its board leg
- **WHEN** a fleet's ship position is computed during a lane transit's
  board leg (before the gate ETA)
- **THEN** the returned hex is the board-leg burn's interpolated position
  and ok = true
- **AND** once world time passes the gate ETA, ok = false (the fleet is out
  on the lane, no board hex)

### Requirement: Due-Kinematics Detection
The system SHALL report a stored (non-folded) movement state as "arrived"
(`Arrived`) exactly when its completion instant (a burn's `arriveTime` or a
lane transit's `arriveTime`) has passed, and never for coast, docked, or
lane-hold states.

#### Scenario: A burn is due at and after its arrival time
- **WHEN** `Arrived` is evaluated on a stored burn at a world time at or
  past its `arriveTime`
- **THEN** it reports true

#### Scenario: A burn is not due before its arrival time
- **WHEN** `Arrived` is evaluated on a stored burn at a world time before
  its `arriveTime`
- **THEN** it reports false

### Requirement: Deterministic Movement Solve to a Fixed Hex
The system SHALL compute (`SolveHex`) a core-avoiding path to a fixed
destination hex and an arrival world time of `now + (pathLength - 1) *
msPerTile` — the ETA following the routed path length, not straight-line
distance.

#### Scenario: ETA follows the routed path
- **WHEN** a burn to a fixed hex is solved
- **THEN** the arrival time equals `now` plus the routed path's hex-step
  count times `msPerTile`

### Requirement: Deterministic Intercept Lead-Solve
The system SHALL compute (`SolveIntercept`) the earliest future world time
at which a fleet departing now can reach a coasting body's future position,
by walking the body's orbital cell-entry instants forward from `now` and
accepting the first one the fleet can physically reach in time (travel time
≤ elapsed time), bounded by a horizon. The system SHALL immediately return a
"dock in place" solution (zero travel) if the fleet already occupies the
body's current hex. If no reachable cell-entry instant exists within the
horizon, or the body is motionless (huge/zero period), the solve SHALL fall
back to a plain burn against the body's current position.

#### Scenario: Already co-located intercepts instantly
- **WHEN** the fleet's current hex equals the target's current position
- **THEN** the solution is a zero-length path arriving at `now`

#### Scenario: A moving target is met exactly as it enters the meet cell
- **WHEN** an intercept is solved against a body in motion
- **THEN** the returned meet hex equals the body's computed position at the
  returned arrival time, and the body's position one millisecond before
  arrival differs from the meet hex (the fleet meets the body as it enters
  the cell, not mid-transit)

#### Scenario: A motionless target collapses to a fixed-hex solve
- **WHEN** an intercept is solved against a body with an effectively
  infinite orbital period
- **THEN** the solution is identical to `SolveHex` against the body's
  (unmoving) current position

#### Scenario: The intercept is physically feasible
- **WHEN** any intercept is solved
- **THEN** the fleet's required travel time (routed distance × msPerTile)
  does not exceed the elapsed time to the returned arrival time

### Requirement: Occlusion-Aware Line of Sight
The system SHALL report a target hex visible from an origin hex
(`LineOfSight`) unless an occluding hex lies strictly between them on the
hex line — an occluder's own hex, and everything in front of it, remains
visible; only hexes strictly behind an occluder are shadowed.

#### Scenario: An occluder shadows hexes behind it, not itself or in front
- **WHEN** line of sight is checked from an origin through a hex holding an
  occluder to a hex beyond it
- **THEN** hexes before and including the occluder are visible, and hexes
  strictly behind it are not

#### Scenario: No occluders means unconditional visibility
- **WHEN** line of sight is checked with an empty occluder set
- **THEN** every target is reported visible

### Requirement: Widening Scan Beam Corridor
The system SHALL compute a scan beam's hex-set corridor (`BeamHexes`) as a
hex-line spine from the origin through the aim hex extended to the
configured rim ring, widened at each spine step `i` by
`HalfWidthBase + floor(Spread * i)` hexes, clipped to hexes within the rim
ring. An aim hex equal to the origin (no direction) SHALL yield an empty
beam.

#### Scenario: The corridor widens with distance from the origin
- **WHEN** a beam is computed with a nonzero spread
- **THEN** hexes near the origin form a narrow corridor and the corridor
  widens at farther spine indices

#### Scenario: Nothing ships beyond the rim
- **WHEN** a beam is computed with a given rim ring
- **THEN** every hex in the result lies at or within that rim ring

#### Scenario: An aim on the origin yields no beam
- **WHEN** the aim hex equals the origin hex
- **THEN** the beam is empty

### Requirement: Deterministic Lane Gate Projection
The system SHALL compute (`LaneGateHex`) the fixed board tile where a lane
to a neighbouring system meets a system's board: the hex on the gate ring
(three rings inside the board radius, clamped to at least ring 1) whose
board-direction bearing is angularly closest to the lane's galaxy-coordinate
bearing (ties resolved to the earliest hex in `RingHexes` order).

#### Scenario: The gate lies on the gate ring
- **WHEN** a lane gate hex is computed for a system and a neighbour
- **THEN** the returned hex's ring equals `GateRing(radius)`

#### Scenario: A non-positive radius degenerates to the core
- **WHEN** a lane gate hex is computed with `radius <= 0`
- **THEN** the returned hex is the core `(0,0)`

### Requirement: Lane Transit Position Fraction
The system SHALL compute (`LaneFraction`) which lane leg a lane transit
occupies at a world time and how far along it (0..1), clamping to the first
leg at fraction 0 before the board-leg gate ETA and to the last leg at
fraction 1 after the transit's overall arrival time.

#### Scenario: Before the gate ETA reports the first leg at fraction 0
- **WHEN** lane fraction is evaluated at a world time at or before the
  transit's gate ETA
- **THEN** it reports the first route leg at fraction 0

#### Scenario: Past arrival clamps to the last leg at fraction 1
- **WHEN** lane fraction is evaluated at a world time at or after the
  transit's overall arrival time
- **THEN** it reports the last route leg at fraction 1

#### Scenario: Mid-leg interpolates linearly
- **WHEN** lane fraction is evaluated strictly between two consecutive leg
  ETAs
- **THEN** it reports that leg with a fraction linearly interpolated
  between those two ETAs

## Notes for future maintainers

- Cross-language and cross-build-target determinism — the golden-fixture
  discipline around `/fixtures/board/cases.json`, which arithmetic may
  produce a rule-bearing value, re-recording rules, and the deviation
  register for known divergences — is governed by the
  `cross-stack-determinism` capability
  (`openspec/specs/cross-stack-determinism/spec.md`). Any change to this
  package's math must satisfy that capability's requirements.
- `StateAt`/`ShipPos` are the only sanctioned way to read "where is this
  fleet" from a stored `MovementState`; only resolvers and the settle path
  are meant to read raw stored state (enforced by convention, not the type
  system — see `fleet-movement`).
