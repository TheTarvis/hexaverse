# Polar Lattice Math Specification

## Purpose
Pure, shared math for the polar (ring-and-slot) lattice: cell coordinates
and normalization, the banded slot schedule, integer adjacency, arc paths,
orbital advance and back-solve, ring-radius, and the cross-language fixture
discipline that pins Go↔TS parity on all of it.

**This capability has zero consumers as of the change that added it
(`add-polar-lattice-math`, 2026-08-25).** `board-tactical-math` remains the
lattice every shipped consumer — `fleet`, `observation`, `system`, the
renderer — actually uses. This is step 3 of the polar migration: the math
core proven parity-safe before any consumer moves.

It is also a **temporary capability**, not a permanent second owner of "the
board": at consumer migration, `backend/board` is rewritten behind its
existing signatures, `board-tactical-math` becomes the polar capability,
and this capability is REMOVED in the same change. The migration and
eventual-removal plan lives in
`docs/handoffs/2026-08-24-polar-lattice-migration.md` Section 9 and the
archived change's design.md capability-boundary Decision (including its
Exit note) at
`openspec/changes/archive/2026-08-25-add-polar-lattice-math/design.md`.

## Requirements

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

### Requirement: Lattice Adjacency Is an Integer Predicate
The system SHALL decide whether two polar cells are adjacent using integer
arithmetic alone, with no floating-point intermediate. Two cells are
adjacent when their ring indices differ by at most one and, where neither
cell is the core, their angular separation does not exceed one cell width of
the coarser of the two rings; where either cell is the core, the ring
difference alone decides. Concretely, where neither cell is the core and their ring indices differ
by at most one, with `Sa` and `Sb` the two rings' slot counts,
`D = max(Sa, Sb)`, and `g` the wrapped shorter-way separation between
`slotA × (D / Sa)` and `slotB × (D / Sb)` in `1/D`-turn units, the cells are
adjacent when `g × min(Sa, Sb) ≤ D`. Adjacency SHALL include corner contact:
a step that changes both ring and slot is adjacent, and a path is permitted
to take one. At a doubling boundary this predicate counts a coarse cell as
adjacent to every outer cell within one coarse cell width, including one
outer cell beyond each of the coarse cell's two angular edges that does not
geometrically touch the coarse cell — true corner contact there is the
tighter bound
`2g ≤ D/Sa + D/Sb`, which this predicate does not enforce (open fork, not
resolved by this change — see design.md Open Questions).

#### Scenario: Neighbouring slots on one ring are adjacent
- **WHEN** two cells on the same ring occupy consecutive slot indices,
  including the wrap from the ring's last slot to slot 0
- **THEN** they are adjacent

#### Scenario: A coarse cell is adjacent to the fine cells it faces across a band boundary
- **WHEN** a cell on the inner side of a band boundary is tested against
  cells on the outer ring, whose slot count is exactly double
- **THEN** it is adjacent to the outer cells whose doubled-index separation
  is at most one coarse cell width, and to no other outer cell

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
non-uniform radial spacing remains an open lever on the slot-schedule
decision.

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
the lattice (per the Lattice Adjacency Is an Integer Predicate requirement).
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
round: linearly interpolate ring and angle between the two endpoints, round
the interpolated ring to its nearest integer ring first, then select the
angularly nearest slot on that rounded ring for each sample. The path SHALL
be sampled once per cell it crosses measured on the finest — outermost —
ring the path spans, not on its mean ring: the path SHALL be divided into
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
Sampling against a coarser reference ring undersamples the outer,
finer-slotted portion of the path and emits slot jumps that are not
adjacent. Under this sampling rule no gap-fill or stitching pass is
required, and the emitted destination cell is always adjacent to the sample
preceding it. This realization is the specified quantizer for this change;
a future change MAY supersede it with a different quantizer (Decision 3 —
see design.md) provided the ordering discipline and tie rules above continue
to hold.

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

#### Scenario: Every consecutive pair is adjacent, including across a band boundary
- **WHEN** a path is computed between two cells whose rings fall on
  opposite sides of a configured band boundary
- **THEN** every consecutive pair of cells in the path is adjacent on the
  lattice, per the loose doubling-boundary adjacency this capability
  specifies (Lattice Adjacency Is an Integer Predicate) — not necessarily
  true geometric corner contact at every step

#### Scenario: A path from a coarse inner ring to a fine outer ring has adjacent consecutive cells
- **WHEN** a path is computed from a cell on an inner, coarse-slotted ring
  to a cell several bands outward on a finer-slotted ring
- **THEN** every consecutive pair of emitted cells is adjacent
- **AND** the emitted destination cell is adjacent to the cell preceding it,
  with no gap-fill or stitching pass applied

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
to avoid it: the path SHALL be exactly the endpoint-to-endpoint
interpolation the "A Straight Path Is an Arc" requirement defines, with no
additional cell inserted or altered for the purpose of keeping the path
clear of the core.

#### Scenario: An across-the-star transfer never touches the core
- **WHEN** a path is computed between two non-core cells whose direct
  interpolation would otherwise sweep near or across the center
- **THEN** the path does not include the core cell
- **AND** no cell is inserted or altered for the purpose of detouring
  around the core

#### Scenario: Targeting the core still reaches it
- **WHEN** a path is computed with the core cell as one endpoint
- **THEN** the path includes the core cell as that endpoint

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
exhaustive sweep of this capability's functions claims parity: a maximum
ring (inclusive), the slot count per ring implied by the schedule under
test up to that maximum ring, a fixed, named, finite list of periods
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

The sweep for the Lattice Adjacency Is an Integer Predicate requirement
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

### Requirement: Rule-Bearing Values Are Integer or Exact Rational
The system SHALL compute every value this capability persists, returns as a
solve result, or uses to compute an ETA without a floating-point
intermediate — every such value SHALL be computed from integer or exact
rational arithmetic through to its final rounding. Trigonometric functions
and `sqrt` SHALL appear only in projection of a cell or continuous orbital
angle to screen or board pixel space, and in path sampling performed solely
for rendering; they SHALL NOT appear in the computation of a stored value, a
path or intercept solve result, or an ETA. This requirement applies the
`cross-stack-determinism` capability's discipline to the polar lattice, and
is the reason the path-interpolation and orbital-advance requirements above
are specified in rational-turns integer terms rather than in radians.

#### Scenario: A rule-bearing polar computation is byte-identical across the seam and across build targets
- **WHEN** the same path, adjacency, schedule, orbital-advance, or orbit
  back-solve computation is evaluated by the Go implementation and the TypeScript
  implementation, and by the Go implementation compiled for `GOARCH=arm64`
  and for `GOARCH=amd64` at `GOAMD64=v1`
- **THEN** all evaluations produce identical results
- **AND** projection of a cell to board or screen coordinates is outside
  this scenario, being render-side under this requirement's own exemption

### Requirement: A New Cross-Language Fixture Family Pins the Lattice
The system SHALL record, in a new sibling fixture file, one fixture family
per function mirrored between the Go package and its TypeScript mirror for
this capability, following the `cross-stack-determinism` capability's
both-languages-assert and one-family-per-function conventions. The system
SHALL have every recorded family asserted by both the Go test suite and the
TypeScript test suite. A mirrored function with no fixture family covering
it SHALL be listed in the capability's coverage inventory. Each recorded
case SHALL name the slot schedule it was generated under, and both suites
SHALL apply the named schedule when reproducing that case, rather than
whichever schedule the implementation currently defaults to, so resolving
the open slot-schedule decision (Decision 2) does not silently invalidate a
recorded case.

#### Scenario: Both languages reproduce every recorded polar case
- **WHEN** the Go and TypeScript test suites each run against the polar
  lattice's fixture family
- **THEN** both suites reproduce every recorded case, each under the slot
  schedule that case names
- **AND** a divergence between the two implementations on any recorded
  case fails both suites

#### Scenario: An uncovered mirrored function is caught by the coverage inventory check
- **WHEN** a function is exported from both the Go package and its
  TypeScript mirror as a mirrored pair
- **THEN** a check confirms the function's name appears either in a
  fixture family or in the capability's coverage inventory
- **AND** the check fails if the function appears in neither

### Requirement: The Polar Fixture File Reproduces On Every Build Target
The system SHALL reproduce the polar lattice's fixture file identically from
build targets whose floating-point contraction behaviour differs, and from
the JavaScript runtime. The fixture file SHALL record the build target —
`GOARCH=arm64`, `GOARCH=amd64` at `GOAMD64=v1`, and the JavaScript runtime —
it was last generated and verified against. The automated check SHALL
assert the fixture reproduces on all three.

#### Scenario: The polar fixture is asserted on the full build-target matrix
- **WHEN** the Go fixture suite for this capability is run compiled for
  `GOARCH=arm64`, again compiled for `GOARCH=amd64` with `GOAMD64=v1`, and
  the TypeScript fixture suite is run in the JavaScript runtime
- **THEN** every recorded case reproduces identically on all three

#### Scenario: The polar fixture records its recording provenance
- **WHEN** the polar lattice's fixture file is generated or re-recorded
- **THEN** the file records the `GOARCH` (and `GOAMD64` level, where
  applicable) and the JavaScript runtime it was last verified against
