# Board Tactical Math Specification

## Purpose
Pure, deterministic polar (ring-and-slot) geometry and kinematics shared by
every backend domain that reasons about a system's tactical board
(`system-interior`, `fleet-movement`, `observation-fog-and-scan`) and
mirrored byte-for-byte in the frontend (`lib/board`, over the `lib/polar`
lattice core). A position is a `Cell{Ring, Slot}` on a banded slot
schedule, ring 0 being the single core cell. No Firestore or clock
dependency — every function is a pure function of its inputs, so Go and
TypeScript can be asserted against the same golden fixtures
(`/fixtures/board/cases.json`, plus `/fixtures/polar/cases.json` for the
lattice core).

This capability absorbed `polar-lattice-math` when the board was rewritten
on the polar lattice (`rewrite-board-on-polar-lattice`, 2026-08-26); that
temporary capability's requirements are folded in below and it no longer
exists.

## Requirements

### Requirement: Effective Movement State Fold
The system SHALL compute a fleet's *effective* movement state at a world
time (`StateAt`) by folding a stored burn whose `arriveTime` has passed into
its settled result — docked on its target if `DockOnArrive` was set,
otherwise coasting a free orbit anchored at the arrival instant on the
burn's final cell's ring. A stored state that is not a completed burn is
returned unchanged. Lane transit is deliberately never folded by `StateAt`:
a due lane transit continues to report its stored (pre-arrival) position
until the authoritative resolve runs.

#### Scenario: A completed burn folds to a coast
- **WHEN** the effective state is computed for a stored burn whose
  `arriveTime` has passed and no `DockOnArrive` was set
- **THEN** the effective state is `coast`, anchored on the burn's final
  cell (the orbit back-solved so evaluating it at the arrival instant
  yields exactly that cell)

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
The system SHALL compute a fleet's board cell (`ShipPos`) by evaluating its
*effective* state (via the state fold) at a world time: the live orbital
position while coasting, the interpolated arc-path position while burning,
the board-leg burn position while a lane transit's board leg is still in
progress, and "no board cell" (ok = false) once docked, parked mid-lane
(lane-hold), or already past the lane transit's departure gate. The
interpolated burn position SHALL be an integer index into the burn's
emitted path cells, computed from elapsed and total burn time by exact
integer arithmetic.

#### Scenario: A burn interpolates along its arc path
- **WHEN** a fleet's ship position is computed partway through an
  in-progress burn
- **THEN** the returned cell lies along the burn's emitted path, strictly
  between its start and end

#### Scenario: A completed burn reports the settled coast position
- **WHEN** a fleet's ship position is computed at or after a stored burn's
  `arriveTime`
- **THEN** the returned cell is on the burn's final cell's ring, and the
  call reports ok = true (position folds through `StateAt` — a caller that
  reads the raw stored burn still gets a correct, non-frozen position)

#### Scenario: Docked and lane-parked fleets have no board cell
- **WHEN** a fleet's ship position is computed while it is docked or parked
  mid-lane (lane-hold)
- **THEN** the call reports ok = false

#### Scenario: A lane transit is on-board only during its board leg
- **WHEN** a fleet's ship position is computed during a lane transit's
  board leg (before the gate ETA)
- **THEN** the returned cell is the board-leg burn's interpolated position
  and ok = true
- **AND** once world time passes the gate ETA, ok = false (the fleet is out
  on the lane, no board cell)

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

### Requirement: Deterministic Intercept Lead-Solve
The system SHALL compute (`SolveIntercept`) the earliest future world time
at which a fleet departing now can reach a coasting body's future position,
by walking the body's orbital slot-entry instants forward from `now` and
accepting the first one the fleet can physically reach in time (travel time
≤ elapsed time), bounded by a horizon; travel time is
`(arcPathLength − 1) × msPerTile` against the candidate cell. The solve
SHALL take the target's orbit as an argument, not resolve it from a
feature lookup — the seam a future parent-composed (moon) orbit passes
through unchanged. The system SHALL immediately return a "dock in place"
solution (zero travel) if the fleet already occupies the body's current
cell. If no reachable slot-entry instant exists within the horizon, or the
body is motionless (huge/zero period), the solve SHALL fall back to a
plain burn against the body's current position.

#### Scenario: Already co-located intercepts instantly
- **WHEN** the fleet's current cell equals the target's current position
- **THEN** the solution is a zero-length path arriving at `now`

#### Scenario: A moving target is met exactly as it enters the meet cell
- **WHEN** an intercept is solved against a body in motion
- **THEN** the returned meet cell equals the body's computed position at
  the returned arrival time, and the body's position one millisecond
  before arrival differs from the meet cell (the fleet meets the body as
  it enters the cell, not mid-transit)

#### Scenario: A motionless target collapses to a fixed-cell solve
- **WHEN** an intercept is solved against a body with an effectively
  infinite orbital period
- **THEN** the solution is identical to `SolveCell` against the body's
  (unmoving) current position

#### Scenario: The intercept is physically feasible
- **WHEN** any intercept is solved
- **THEN** the fleet's required travel time (arc-path cell steps ×
  msPerTile) does not exceed the elapsed time to the returned arrival time

### Requirement: Occlusion-Aware Line of Sight
The system SHALL report a target cell visible from an origin cell
(`LineOfSight`) unless an occluder blocks the straight chord between the
two cell centers: an occluder whose center lies strictly between origin
and target along the chord (projection parameter strictly inside the open
segment) and whose pinned squared occlusion radius the chord passes
within. An occluder's own cell, and everything in front of it, remains
visible; only positions strictly behind an occluder are shadowed. The
geometry SHALL be computed on the pinned coordinate table in exact integer
arithmetic (per A Pinned Coordinate Table Grounds Board Geometry) — sight
is a straight chord, not an arc, and the star at the core occludes what
lies behind it.

#### Scenario: An occluder shadows cells behind it, not itself or in front
- **WHEN** line of sight is checked from an origin past an occluder to a
  cell beyond it along the same chord
- **THEN** cells before and including the occluder's own cell are visible,
  and cells strictly behind it within its shadow are not

#### Scenario: No occluders means unconditional visibility
- **WHEN** line of sight is checked with an empty occluder set
- **THEN** every target is reported visible

#### Scenario: The core star occludes the far side of the board
- **WHEN** line of sight is checked between two cells on opposite sides of
  the core, with the star registered as an occluder at the core
- **THEN** the target is not visible when the chord between the two cell
  centers passes within the star's pinned occlusion radius of the center

### Requirement: Widening Scan Beam Corridor
The system SHALL compute a scan beam's cell-set corridor (`BeamCells`) as
the cells within the configured rim ring whose centers lie within a
corridor around the straight ray from the origin cell's center through the
aim cell's center, whose half-width at a cell is `HalfWidthBase + Spread ×`
(the cell's along-ray distance from the origin), evaluated on the pinned
coordinate table in exact integer arithmetic (cross-multiplied
comparisons; no runtime trigonometry or `sqrt`). An aim cell equal to the
origin (no direction) SHALL yield an empty beam.

#### Scenario: The corridor widens with distance from the origin
- **WHEN** a beam is computed with a nonzero spread
- **THEN** cells near the origin form a narrow corridor and the corridor
  admits angularly wider cell sets at greater along-ray distances

#### Scenario: Nothing ships beyond the rim
- **WHEN** a beam is computed with a given rim ring
- **THEN** every cell in the result lies at or within that rim ring

#### Scenario: An aim on the origin yields no beam
- **WHEN** the aim cell equals the origin cell
- **THEN** the beam is empty

### Requirement: Deterministic Lane Gate Projection
The system SHALL compute (`LaneGateCell`) the fixed board cell where a lane
to a neighbouring system meets a system's board: the cell on the gate ring
(three rings inside the board radius, clamped to at least ring 1) whose
pinned-table direction has the maximum dot product with the lane's
galaxy-coordinate bearing vector (ties resolved to the lower slot index).
The bearing input remains inexact; it SHALL be rule-bearing only through
this discretized, tie-broken choice, under the `cross-stack-determinism`
capability's discretized-choice requirement and its existing deviation
register entry for near-tie divergence.

#### Scenario: The gate lies on the gate ring
- **WHEN** a lane gate cell is computed for a system and a neighbour
- **THEN** the returned cell's ring equals `GateRing(radius)`

#### Scenario: A non-positive radius degenerates to the core
- **WHEN** a lane gate cell is computed with `radius <= 0`
- **THEN** the returned cell is the core

#### Scenario: The gate choice is a discretized argmax on pinned directions
- **WHEN** a lane gate cell is computed from a lane bearing vector
- **THEN** the selection is among the gate ring's finite slot set, by
  integer comparison of cross-multiplied dot products on pinned table
  entries, with ties resolved to the lower slot index

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

### Requirement: Ring-and-Slot Cell Coordinates
The system SHALL represent a board position on the polar lattice as an
integer `(ring, slot)` pair. Ring 0 SHALL be a single core cell carrying no
angular index. A slot index outside `[0, slots(ring))` SHALL be normalized
into that range by wrapping in both directions (below zero and at or above
the ring's slot count).

#### Scenario: The core ring has exactly one cell
- **WHEN** a cell's ring is 0
- **THEN** its slot count is 1
- **AND** every slot index normalizes to the same single core cell

#### Scenario: A negative slot wraps from the top of the ring
- **WHEN** slot index `-1` is normalized against a ring with 24 slots
- **THEN** it normalizes to `23`

#### Scenario: An overflowing slot wraps from the bottom of the ring
- **WHEN** slot index `25` is normalized against a ring with 24 slots
- **THEN** it normalizes to `1`

### Requirement: Slot Schedule Shape
The system SHALL derive the number of angular slots on a ring from a
configured schedule, parameterized rather than fixed, that assigns every
ring the board uses a positive integer slot count: ring 0 SHALL have exactly
one slot (the core, per the Ring-and-Slot Cell Coordinates requirement) and
every ring at or above ring 1 SHALL have a slot count of at least 2. The
schedule SHALL declare its own maximum ring (inclusive), `maxRing`, and
SHALL be non-decreasing in ring and total over `[0, maxRing]` — every ring
in that range SHALL have a configured slot count, and a ring with no
configured slot count within that range is invalid.
Among rings at ring 1 or above, the slot count SHALL be constant across
every ring within a configured band and SHALL exactly double at each
configured band boundary, so the radial neighbor relation between two
adjacent rings both at ring 1 or above is exactly 1:1 within a band and
exactly 2:1 across a boundary — never fractional. The system SHALL reject as
invalid: any schedule under which some pair of adjacent rings, both at ring
1 or above, has a slot-count ratio other than 1 or 2; any schedule assigning
ring 0 a slot count other than 1; and any schedule assigning a ring at or
above ring 1 a slot count of 0 or 1. The ring-0-to-ring-1 step is exempt
from the ratio rule: ring 1's slot count MAY be any value at least 2,
independent of ring 0's fixed single slot.

#### Scenario: Adjacent rings within a band carry equal slot counts
- **WHEN** two adjacent rings, both at ring 1 or above, fall within the same
  configured band
- **THEN** their slot counts are equal

#### Scenario: Adjacent rings across a boundary double
- **WHEN** two adjacent rings, both at ring 1 or above, straddle a
  configured band boundary
- **THEN** the outer ring's slot count equals exactly twice the inner
  ring's slot count

#### Scenario: A non-1:1-or-2:1 schedule is rejected
- **WHEN** a schedule is configured whose slot counts give some adjacent
  ring pair, both at ring 1 or above, a ratio other than 1 or 2
- **THEN** the schedule is rejected as invalid

#### Scenario: The core-to-ring-1 step is exempt from the ratio rule
- **WHEN** a schedule is validated whose ring-1 slot count is greater than
  two
- **THEN** the ring-0-to-ring-1 ratio does not make the schedule invalid

#### Scenario: A zero or single-slot ring is rejected
- **WHEN** a schedule is configured assigning a ring at or above ring 1 a
  slot count of 0 or 1
- **THEN** the schedule is rejected as invalid

#### Scenario: A schedule undefined for a ring within its own bound is invalid
- **WHEN** a schedule does not assign a slot count to a ring within
  `[0, maxRing]`, the schedule's own declared maximum ring
- **THEN** the schedule is rejected as invalid

### Requirement: The Production Slot Schedule Is Pinned to Isotropic
The system SHALL construct every production board's slot schedule from two
pinned, exported constants — an inner slot count of `6` and doubling
boundaries at rings `[2, 3, 5, 9, 17]` (the Isotropic schedule, settled
2026-08-25) — parameterized only by the board's maximum ring, which is
per-system. The pinned values SHALL live in the board package, not the
lattice-core package, which remains value-agnostic. Every recorded fixture
case SHALL name the schedule it was generated under, and both language
suites SHALL apply the named schedule when reproducing it, so a future
schedule change cannot silently invalidate a recorded case.

#### Scenario: Production boards derive slot counts from the pinned values
- **WHEN** a production board's schedule is constructed for any maximum
  ring
- **THEN** ring 1 carries 6 slots and the slot count doubles exactly at
  rings 2, 3, 5, 9, and 17 (those within the board's maximum ring)

#### Scenario: A recorded case is reproduced under the schedule it names
- **WHEN** a fixture case recorded under a named schedule is asserted by
  either language suite
- **THEN** the suite applies that named schedule, not whichever schedule
  the implementation currently defaults to

### Requirement: Lattice Adjacency Is True Corner Contact
The system SHALL decide whether two polar cells are adjacent using integer
arithmetic alone, with no floating-point intermediate, and the predicate
SHALL admit exactly the cell pairs that geometrically touch — edge or
corner contact — and no others (tightened from the loose spike-faithful
predicate, settled 2026-08-25). Two cells are adjacent when their ring
indices differ by at most one and, where neither cell is the core, twice
their angular separation does not exceed the sum of the two cells' angular
widths; where either cell is the core, the ring difference alone decides.
Concretely, where neither cell is the core and their ring indices differ by
at most one, with `Sa` and `Sb` the two rings' slot counts,
`D = max(Sa, Sb)`, and `g` the wrapped shorter-way separation between
`slotA × (D / Sa)` and `slotB × (D / Sb)` in `1/D`-turn units, the cells
are adjacent when `2 × g ≤ D/Sa + D/Sb`. Adjacency SHALL include corner
contact: a step that changes both ring and slot is adjacent where the
cells touch at a point, and a path is permitted to take one. At a doubling
boundary this predicate counts a coarse cell as adjacent to exactly the
outer cells it touches; the two outer cells one further slot away — whose
centers the loose bound `g × min(Sa, Sb) ≤ D` admitted despite half a
fine cell of empty lattice between them — are NOT adjacent under this
predicate.

#### Scenario: Neighbouring slots on one ring are adjacent
- **WHEN** two cells on the same ring occupy consecutive slot indices,
  including the wrap from the ring's last slot to slot 0
- **THEN** they are adjacent

#### Scenario: A coarse cell is adjacent only to the fine cells it touches
- **WHEN** a cell on the inner side of a band boundary is tested against
  cells on the outer ring, whose slot count is exactly double
- **THEN** it is adjacent to the outer cells whose doubled-index separation
  satisfies `2 × g ≤ 3` — the cells it geometrically touches — and to no
  other outer cell

#### Scenario: A doubling-boundary phantom neighbor is rejected
- **WHEN** a coarse cell is tested against the outer cell whose
  doubled-index separation is exactly 2 — the pair the loose predicate
  admitted with no geometric contact
- **THEN** they are not adjacent

#### Scenario: Within a band the tight and loose bounds coincide
- **WHEN** two cells on adjacent rings with equal slot counts are tested
- **THEN** they are adjacent exactly when their slot separation is at most
  one — identical to the loose predicate's answer within a band

#### Scenario: The core is adjacent to every ring-1 cell
- **WHEN** the core cell is tested against any cell on ring 1
- **THEN** they are adjacent

#### Scenario: Cells two rings apart are never adjacent
- **WHEN** two cells' ring indices differ by two or more
- **THEN** they are not adjacent, at any slot

### Requirement: Every Cell On a Ring Sits At One Radius
The system SHALL assign every cell on a ring, at every slot, the same
distance from the board's center — a function of the ring index alone — so
a body confined to a single ring holds a constant radius through a full
revolution regardless of which slot it occupies. The mapping from ring index
to radius SHALL be a configured property of the lattice; this requirement
does not constrain it to a uniform multiple of a radial unit, because
non-uniform radial spacing remains an open lever on inner-detail tuning.

#### Scenario: Sampled slots on a ring share one radius
- **WHEN** the radius of cells at several different slots on the same ring
  is computed, per this requirement's mapping
- **THEN** every cell's assigned radius is identical and equals that
  ring's configured radius, exactly
- **AND** the equality is a property of the lattice's definition itself; a
  render-side projection of that radius to board or screen coordinates is
  exempt from byte-identical reproduction and is not what this scenario
  asserts

#### Scenario: The core projects to the center
- **WHEN** the core cell (ring 0) is projected to board coordinates
- **THEN** its distance from the board center is zero

### Requirement: A Straight Path Is an Arc
The system SHALL compute the path between two polar cells according to the
following ordering discipline: the ring at each sample SHALL be resolved
before the angle at that sample; every intermediate value SHALL be integer
or exact rational, with no floating-point intermediate, through to the
final rounding; the sweep between the two endpoints' angles SHALL take the
shorter of the two angular directions; a path between two cells on the same
ring SHALL stay on that ring; the resulting path SHALL be inclusive of both
endpoints; and every consecutive pair of emitted cells SHALL be adjacent on
the lattice (per the Lattice Adjacency Is True Corner Contact requirement).
Three exact-tie cases arise under this discipline and SHALL each resolve by
one fixed, documented rule, chosen for determinism rather than for
behaviour: (1) an interpolated ring landing exactly halfway between two
integer rings SHALL round toward the destination ring; (2) an interpolated
angle landing exactly equidistant between two adjacent slots on the rounded
ring SHALL resolve to the slot in the sweep's direction of travel, and where
the sweep is zero — every purely radial path, including every path with the
core as an endpoint — SHALL resolve to the higher of the two candidate slot
indices before normalization onto the ring, so a tie between the ring's
last slot and slot 0 resolves to slot 0; (3) an angular difference of
exactly half a turn SHALL always sweep in the increasing-slot-index
direction.

The currently specified realization of this discipline is interpolate-and-
round with a boundary stitch: linearly interpolate ring and angle between
the two endpoints, round the interpolated ring to its nearest integer ring
first, then select the angularly nearest slot on that rounded ring for each
sample. The path SHALL be sampled once per cell it crosses measured on the
finest — outermost — ring the path spans, not on its mean ring: the path
SHALL be divided into
`N = max(2, |ringTo − ringFrom|, sweepInSlotUnitsOfTheFinestRingSpanned)`
equal interpolation intervals, sampled at `t = i/N` for every integer `i`
in `[0, N]` — that is, `N+1` samples, inclusive of both endpoints.
Consecutive samples resolving to the same cell SHALL emit that cell once:
the path is the sample sequence with consecutive duplicates collapsed, so
a path's length is the number of distinct cells it crosses, not `N+1`.
`sweepInSlotUnitsOfTheFinestRingSpanned` SHALL always be an exact integer:
the finest ring spanned is `max(ringFrom, ringTo)`, and the schedule's 1:2
radial steps (Slot Schedule Shape) make that ring's slot count an exact
integer multiple of both endpoints' slot counts, so the angular sweep
expressed in that ring's slot units carries no fractional remainder.

After duplicate collapse (and covering the appended destination cell where
sampling does not land on it exactly), any consecutive pair of emitted
cells that fails the tight adjacency predicate — possible only where the
interpolation steps diagonally across a doubling boundary past the
half-fine-cell gap — SHALL be repaired by a **stitch pass** that inserts
one bridging cell between the pair: the cell on the finer of the two
rings, one slot from the pair's finer-ring cell toward the coarse cell's
doubled slot position. That cell is adjacent to both ends of the repaired
pair under the tight predicate. The bridging cell SHALL always be taken
from the finer ring — a coarse-ring cell also bridging the pair exists and
SHALL NOT be chosen — so the stitch is a fixed, deterministic rule, not a
choice. The stitch inserts cells only to restore contiguity; it SHALL
never be used to route a path around anything (see A Path Reaches the Core
Only If an Endpoint Is the Core). This realization is the specified
quantizer for this change; a future change MAY supersede it with a
different quantizer provided the ordering discipline and tie rules above
continue to hold.

Where either endpoint is the core, the path SHALL sweep no angle: it SHALL
follow the non-core endpoint's bearing, with every cell in the path lying on
that bearing to within half of its own ring's cell width — an inner ring
carrying fewer slots cannot represent that bearing exactly and SHALL NOT be
required to.

#### Scenario: A same-ring transfer never leaves its ring
- **WHEN** a path is computed between two cells on the same ring
- **THEN** every cell in the path is on that same ring

#### Scenario: Coincident endpoints yield a single cell
- **WHEN** a path is computed from a cell to itself
- **THEN** the result is that single cell

#### Scenario: Every consecutive pair is adjacent under the tight predicate
- **WHEN** a path is computed between two cells whose rings fall on
  opposite sides of a configured band boundary
- **THEN** every consecutive pair of cells in the path is adjacent per the
  Lattice Adjacency Is True Corner Contact requirement — geometric
  contact at every step, with the stitch pass applied where the raw
  sampling stepped past a doubling-boundary gap

#### Scenario: The stitch inserts the finer-ring bridging cell
- **WHEN** the raw interpolation emits a consecutive pair whose
  doubled-index separation across a doubling boundary is exactly 2 (the
  step the loose predicate permitted and the tight predicate rejects)
- **THEN** the emitted path contains one inserted cell between the pair:
  the finer-ring cell one slot from the pair's finer-ring cell toward the
  coarse cell's doubled slot position
- **AND** both resulting consecutive pairs are adjacent under the tight
  predicate

#### Scenario: The sample count is measured against the finest ring the path spans, not the mean ring
- **WHEN** a path's finest-ring sample count, computed per this
  requirement, differs from what a mean-ring sample count would have
  produced for the same two endpoints
- **THEN** the implementation uses the finest-ring count
- **AND** the resulting path still satisfies full adjacency between every
  consecutive pair

#### Scenario: A path to or from the core is purely radial
- **WHEN** a path is computed between the core cell and a non-core cell
- **THEN** the path sweeps no angle
- **AND** every cell in the path lies on the non-core endpoint's bearing to
  within half of its own ring's cell width — an inner ring carrying fewer
  slots cannot represent that bearing exactly and SHALL NOT be required to

#### Scenario: A half-turn sweep resolves identically across the seam
- **WHEN** a path is computed between two cells whose angular difference is
  exactly half a turn, in both the Go implementation and the TypeScript
  implementation
- **THEN** both implementations sweep the same fixed direction and produce
  the identical path

#### Scenario: A ring interpolation tie resolves identically across the seam
- **WHEN** a path's interpolated ring at some sample lands exactly halfway
  between two integer rings, in both the Go implementation and the
  TypeScript implementation
- **THEN** both implementations round to the same integer ring

#### Scenario: An angular slot tie resolves identically across the seam
- **WHEN** a path's interpolated angle at some sample lands exactly
  equidistant between two adjacent slots on the rounded ring, in both
  implementations
- **THEN** both implementations select the same slot

#### Scenario: A zero-sweep angular tie resolves identically across the seam
- **WHEN** a purely radial path — one whose two endpoints share an angle,
  or one with the core as an endpoint — produces a sample whose angle is
  exactly equidistant between two slots on a coarser inner ring, in both
  implementations
- **THEN** both implementations select the higher of the two candidate slot
  indices before normalization onto the ring
- **AND** where the tie candidates are the ring's last slot and slot 0 —
  the wrap case — both implementations resolve to slot 0, not to the
  ring's last slot

### Requirement: A Path Reaches the Core Only If an Endpoint Is the Core
The system SHALL NOT route a path between two polar cells through the core
cell unless one of the path's two endpoints is itself the core. No waypoint,
detour, or avoidance rule SHALL be applied to route a path around the core
or around any other cell to avoid it: the only cell insertion permitted
beyond the endpoint-to-endpoint interpolation the "A Straight Path Is an
Arc" requirement defines is that requirement's contiguity stitch, which
repairs adjacency at a doubling boundary and never alters which region of
the board the path crosses.

#### Scenario: An across-the-star transfer never touches the core
- **WHEN** a path is computed between two non-core cells whose direct
  interpolation would otherwise sweep near or across the center
- **THEN** the path does not include the core cell
- **AND** no cell is inserted or altered for the purpose of detouring
  around the core

#### Scenario: Targeting the core still reaches it
- **WHEN** a path is computed with the core cell as one endpoint
- **THEN** the path includes the core cell as that endpoint

### Requirement: Lattice Hop Distance
The system SHALL compute the distance between two polar cells as the
minimum number of adjacency steps between them — the graph metric induced
by the Lattice Adjacency Is True Corner Contact requirement — in pure
integer arithmetic with no floating-point intermediate. This is the board's
`Distance`, the successor of hex distance for every "within N" rule
(fog ambient radius and any future range check): under the pinned
near-square schedule, one hop tracks one radial unit closely in every
direction, which is what makes a hop budget a meaningful range.

#### Scenario: Distance zero is identity
- **WHEN** the distance between a cell and itself is computed
- **THEN** it is 0

#### Scenario: Adjacent cells are at distance one
- **WHEN** the distance between two adjacent cells is computed
- **THEN** it is 1

#### Scenario: Distance is symmetric and realized by a path
- **WHEN** the distance between two cells is computed in both argument
  orders
- **THEN** both orders return the same value
- **AND** a sequence of that many adjacency steps exists between the two
  cells, and no shorter sequence does

### Requirement: Orbital Advance Is Integer Arithmetic Over the Ring's Slot Count
The system SHALL compute a body's cell at a given world time as a pure
integer function of its ring, its epoch slot index, its orbital period, and
its direction. World time and period SHALL be integers. World time SHALL be
measured from the world epoch — never from an arbitrary or component-local
origin — and SHALL be non-negative; a negative world time is out of this
requirement's domain. Direction SHALL be `+1` or `−1`; a direction value of
`0` SHALL be treated as `+1`. The slot index advances by the truncating
integer quotient of (world time measured from the world epoch, times the
ring's slot count) divided by the period, added to the epoch slot index in
the configured direction, and normalized onto the ring; that quotient's
intermediate SHALL be computed in a representation wide enough that it does
not overflow or lose precision before the final truncating division and
normalization (see the sweep-domain-bounds requirement for the bounded
range over which cross-language parity is claimed). A period at or below
zero SHALL leave the body motionless at its epoch slot for every sampled
world time. Ring 0 SHALL always resolve to the core cell regardless of the
body's other orbital elements.

#### Scenario: A full period returns the body to its epoch cell
- **WHEN** world time advances by exactly one full orbital period
- **THEN** the body's computed cell equals its cell at the epoch

#### Scenario: Half a period advances exactly half the ring's slots
- **WHEN** world time advances by exactly half a body's orbital period, and
  both the period and the ring's configured slot count are even
- **THEN** the body has advanced exactly half of its ring's configured slot
  count, in its configured direction, from its epoch slot

#### Scenario: A non-positive period is motionless
- **WHEN** a body's orbital period is zero or negative
- **THEN** its computed cell is identical at every sampled world time and
  equals its epoch cell

#### Scenario: Ring 0 is always the core
- **WHEN** a body's ring is 0, for any epoch slot, period, or direction
- **THEN** its computed cell is the core cell at every sampled world time

#### Scenario: A direction of zero advances as if positive
- **WHEN** a body's configured orbital direction is `0`
- **THEN** its computed cell advances as though its direction were `+1`

### Requirement: Orbit Back-Solve Settles Without Teleporting
The system SHALL, when a body settles onto a cell at a given world time,
back-solve the orbit's epoch slot index using the same truncating integer
arithmetic as the forward advance, so that evaluating the resulting orbit at
that same world time yields exactly the settle cell — never a different
slot on the ring. The back-solve SHALL use no floating-point intermediate.

#### Scenario: Settling reproduces the settle cell exactly
- **WHEN** an orbit is back-solved to settle a body onto a cell at world
  time `at`, for any ring, slot, period, and direction
- **THEN** evaluating that orbit at `at` yields exactly that cell

#### Scenario: A settled body still drifts afterward
- **WHEN** a back-solved orbit whose period is at least its ring's slot
  count is evaluated at the smallest integer world time `t > at` for which
  `⌊t × slots ÷ period⌋ > ⌊at × slots ÷ period⌋`
- **THEN** the computed cell differs from the settle cell by exactly one
  slot in the configured direction
- **AND** evaluating it a full period after the settle instant returns it
  to the settle cell

#### Scenario: The core back-solves to the core
- **WHEN** a body settles onto the core cell
- **THEN** the back-solved orbit evaluates to the core cell at every world
  time

### Requirement: The Sweep Domain Is Bounded and Its Enumeration Is Fixed
The system SHALL bound the input domain over which any cross-language
exhaustive sweep of this capability's lattice functions claims parity: a
maximum ring (inclusive), the slot count per ring implied by the schedule
under test up to that maximum ring, a fixed, named, finite list of periods
recorded by the sweep case, and — for orbital advance and the orbit
back-solve, whose domains otherwise include an unbounded world-time axis —
a world-time range expressed as the fixed, named set of offsets `0`, one
quarter, one half, three quarters, and one full period, relative to each
swept period, not an absolute wall-clock bound. Because world time SHALL be
an integer, each fractional offset SHALL be computed as `floor(period × k
÷ 4)` for `k` in `0, 1, 2, 3, 4` (`k = 4` is the full period, computed
exactly since `period × 4 ÷ 4 = period`), never by rounding a
floating-point fraction of the period.

The sweep for `arcPath` SHALL enumerate all ordered pairs of cells with
ring indices in `[0, maxRing]` under the schedule named by the sweep case,
ordered by `fromRing`, then `fromSlot`, then `toRing`, then `toSlot`, all
ascending, and SHALL serialize each output path as the newline-joined
decimal `ring:slot` cells (comma-separated within a path), in that
enumeration order.

The sweep for the Lattice Adjacency Is True Corner Contact requirement
SHALL enumerate all ordered pairs of cells with ring indices in
`[0, maxRing]` under the schedule named by the sweep case, in the same
`fromRing`, then `fromSlot`, then `toRing`, then `toSlot` ascending
enumeration order as the `arcPath` sweep, and SHALL serialize each output
as `1` if the pair is adjacent or `0` otherwise, newline-joined in that
enumeration order.

The sweep for orbital advance SHALL enumerate every `(ring, epochSlot,
period, direction)` combination within the bound, ordered by `ring`
ascending, then `epochSlot` ascending, then `period` in the sweep case's
listed order, then `direction` in the order `−1, +1`, then offset in the
listed order (`0`, one quarter, one half, three quarters, one full
period), and SHALL serialize each output as the newline-joined decimal
`ring:slot` cell per offset, in that enumeration order.

The sweep for the orbit back-solve SHALL enumerate every `(ring,
settleSlot, period, direction, at)` combination within the bound — a
distinct domain tuple from orbital advance's forward-advance tuple, since
the back-solve is evaluated at one world time `at` per combination rather
than swept across period-relative offsets from a fixed epoch — with `at`
drawn from the same fixed, period-relative offset list above, ordered by
`ring` ascending, then `settleSlot` ascending, then `period` in the sweep
case's listed order, then `direction` in the order `−1, +1`, then `at` in
the listed offset order, and SHALL serialize each output as the
newline-joined decimal `ring:epochSlot` pair — the input ring together with
its back-solved epoch-slot result — per `at` value, in that enumeration
order.

Every sweep SHALL use an integer representation in both
languages — Go's `int64` or an arbitrary-precision fallback; TypeScript's
`BigInt` — wide enough that no intermediate silently wraps; a value that
would overflow a signed 64-bit integer in Go is out of the bounded domain
this requirement claims parity over. Every sweep's digest SHALL be the
SHA-256 hex digest of the serialized enumeration described above.

#### Scenario: The arcPath sweep is bounded and reproducible
- **WHEN** the `arcPath` sweep's digest is recomputed from each
  implementation over its bounded, ordered enumeration
- **THEN** both digests equal the recorded digest
- **AND** recomputing a third time from the same bound produces the
  identical digest

#### Scenario: An input outside the bounded domain is not claimed by the sweep
- **WHEN** an input's ring exceeds the sweep's configured maximum ring, or
  its world-time offset falls outside the configured range
- **THEN** the sweep makes no parity claim about that input, and neither
  suite treats it as covered by the sweep case

### Requirement: A Pinned Coordinate Table Grounds Board Geometry
The system SHALL derive every rule-bearing geometric computation over cell
positions — line of sight, the beam corridor, and lane-gate bearing
selection — from a pinned coordinate table, never from runtime
trigonometry. The table SHALL record, for each distinct slot count in the
pinned production schedule family and each slot index below it, the
fixed-point integer `(x, y)` of that slot's angle at unit radius, scaled
by a pinned power of two; a cell's center is its ring index times its
slot's table entry. The table SHALL be generated only by the
fixture-recording flow — the sole place its trigonometry ever executes —
committed as data, loaded (never recomputed) by both the Go and TypeScript
implementations, and asserted byte-identical by both suites and across the
Go build-target matrix. All runtime geometry over table values SHALL be
exact integer arithmetic: squared distances, cross products, and
cross-multiplied comparisons, with no floating-point intermediate and no
runtime `sqrt`.

#### Scenario: Both languages load the identical table
- **WHEN** the Go and TypeScript suites each assert the pinned coordinate
  table
- **THEN** every entry is byte-identical across the seam and across the Go
  build-target matrix

#### Scenario: Runtime geometry never recomputes the table
- **WHEN** a rule-bearing geometric computation executes at runtime in
  either language
- **THEN** it reads pinned table entries and combines them with integer
  arithmetic only; no trigonometric function or `sqrt` executes on its
  path

#### Scenario: A table regeneration is a recorded, reviewable diff
- **WHEN** the pinned coordinate table changes (a scale bump or schedule
  extension)
- **THEN** the change lands as a re-record through the fixture-recording
  flow, as a reviewable diff, with both suites and the cross-target check
  re-asserted against the new table

### Requirement: Rule-Bearing Values Are Integer or Exact Rational
The system SHALL compute every value this capability persists, returns as a
solve result, or uses to compute an ETA or a disclosure decision without a
floating-point intermediate — every such value SHALL be computed from
integer or exact rational arithmetic through to its final rounding.
Trigonometric functions and `sqrt` SHALL appear only in projection of a
cell or continuous orbital angle to screen or board pixel space, in path
sampling performed solely for rendering, and in the fixture-recording flow
that generates the pinned coordinate table (see A Pinned Coordinate Table
Grounds Board Geometry); they SHALL NOT execute at runtime in the
computation of a stored value, a path or intercept solve result, an ETA,
or a disclosure decision. The one admitted float input is a lane's
galaxy-coordinate bearing, which SHALL be rule-bearing only through the
discretized, tie-broken gate-slot choice the `cross-stack-determinism`
capability's discretized-choice requirement governs. This requirement
applies that capability's discipline to the polar board, and is the reason
the path-interpolation and orbital-advance requirements above are
specified in rational-turns integer terms rather than in radians.

#### Scenario: A rule-bearing board computation is byte-identical across the seam and across build targets
- **WHEN** the same path, adjacency, distance, schedule, orbital-advance,
  orbit back-solve, solve, line-of-sight, or beam computation is evaluated
  by the Go implementation and the TypeScript implementation, and by the
  Go implementation compiled for `GOARCH=arm64` and for `GOARCH=amd64` at
  `GOAMD64=v1`
- **THEN** all evaluations produce identical results
- **AND** projection of a cell to board or screen coordinates is outside
  this scenario, being render-side under this requirement's own exemption

### Requirement: Deterministic Movement Solve to a Fixed Cell
The system SHALL compute (`SolveCell`) the arc path to a fixed destination
cell (per A Straight Path Is an Arc, stitch included) and an arrival world
time of `now + (pathLength − 1) × msPerTile` — the ETA following the
emitted path's cell-step count. No routing or avoidance applies: the path
is the arc itself.

#### Scenario: ETA follows the arc path
- **WHEN** a burn to a fixed cell is solved
- **THEN** the arrival time equals `now` plus the emitted path's cell-step
  count times `msPerTile`
- **AND** the path is exactly the arc path between the fleet's cell and
  the destination, stitch included

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
