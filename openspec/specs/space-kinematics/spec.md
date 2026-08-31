# Space Kinematics Specification

## Purpose
Pure, deterministic continuous-space orbital mechanics and burn geometry for
the 3D pivot: a body's position and velocity as closed-form functions of world
time from stored orbital elements, a committed burn as a fixed quintic Bézier
walked by arc length under a brachistochrone profile, the fixed-round moving-
target intercept solve, the three idle park modes, and the coordinate codec
that carries all of it across the persistence boundary. No Firestore and no
clock dependency — every function is a pure function of its inputs, so the
family can be pinned by a golden fixture (`/fixtures/space/cases.json`).

**This capability has zero consumers as of the change that introduced it**
(`add-space-kinematics`, 2026-08-27). It adds a package, touches no stored
data, adds no endpoint, and deletes nothing. `board-tactical-math` (over
`backend/board` / `backend/polar`, mirrored in `frontend/lib/board` /
`frontend/lib/polar`) remains the lattice every shipped consumer — `system`,
`fleet`, `observation`, `market`, `mine`, `stations`, and the renderer —
actually uses. Nothing below is live in the game yet.

**Go is this capability's sole authority, and there is no TypeScript mirror**
(design.md Decision 1). `backend/space` computes every rule-bearing value:
every persisted field, every solve result, every ETA, every later disclosure
decision. `frontend/lib/space` — if it exists at all — is render-side geometry
only, drawing a curve from control points the server solved and bodies from
orbit elements the server stored; it never computes an arrival, a flight time,
a Δv price, or a visibility answer. That absence is enforced, not merely
intended: `cross-stack-determinism`'s mirror map runs a third invocation in
**anti-mirror mode** over `backend/space` ↔ `frontend/lib/space`, failing on
any name declared on both sides. The one carve-out is
`frontend/app/spike/space-3d` — the TypeScript PoC this capability was derived
from, which stays alive by that path as the feel bench and is not a mirror,
not authoritative, and not asserted against the fixture family.

The single largest stated cost of that decision is that a client-computed move
preview cannot show an ETA or Δv digit: `board-view`'s *Move Preview From the
Acting Fleet's Live Position* is written assuming the client computes a preview
end to end, and must become a server-quoted preview or be amended when a
consumer migrates.

**What remains open beyond this change** is recorded in `add-space-kinematics`'s
design.md — see its **Migration Plan** for the eight-step consumer sequencing
(this capability is step 1; the green build-target matrix is its gate, and
steps 2–8 each land as their own change, ending in the deletion of
`backend/board`, `backend/polar`, and their fixtures), and its **Open
Questions** for what is deliberately unanswered:

- **The determinism call is reversible.** Decision 1 is an architect's call
  under mandate, cheapest to reverse now while the package has zero consumers;
  Decisions 2–3 (integer time, integer angles over a pinned table) survive a
  reversal unchanged, Decision 4 (float64 positions) is the one that flips.
- **The arrival tangent threshold.** 0.95 is the spec's floor, carried from the
  PoC; the *recorded* value comes from the randomized sweep's worst case and
  may only tighten it.
- **The minimum-arc-length floor.** The PoC's 0.05 s minimum flight time is
  recommended re-expressed as a minimum arc length and rejected at commit with
  its own reason; the value itself is open.
- **The solve's fixed round count `N`.** Decision 7 gives the rule for choosing
  it (a 0 ms quantized residual at round `N` across the sweep) and recommends 8
  as a starting point; the actual value comes from the recording run.

One thing design.md flagged as open is **not** open here: the PoC's ~0.1-unit
insertion-continuity *position* tolerance, which design.md described as a
measured threshold, is resolved in this specification as **zero, exact by
construction** — the intercept *is* the settled park's position (Decision 10).
## Requirements
### Requirement: Orbital Position Is a Closed-Form Function of Time
The system SHALL derive a body's position at any world time from its stored
orbital elements (parent identity, radius, period, phase, inclination, and
ascending node) and that time alone — never from accumulated state, and
never by numerical integration. A body with no parent SHALL be positioned at
the origin. A body with a parent SHALL be positioned at its parent's
position plus its own local orbital offset, resolved recursively through the
parent chain.

#### Scenario: Distance from parent equals the stored orbit radius at any time
- **WHEN** a body's position and its parent's position are evaluated at world
  times 0, 3.7, and 111.9 (sim-seconds)
- **THEN** the distance between them equals the orbit's stored radius at
  every one of those times

#### Scenario: A non-zero inclination produces a genuinely three-dimensional path
- **WHEN** an orbit with non-zero inclination is evaluated at the phase
  index exactly one quarter turn past its ascending node
- **THEN** the absolute out-of-plane component of its local offset equals
  the orbit's radius times the pinned table's sine entry for its
  inclination, to within one unit in the last place of that product
- **AND** the out-of-plane component is zero at the ascending node's own
  phase index

#### Scenario: The star sits at the origin at every time
- **WHEN** a parentless body's position is evaluated at any world time
- **THEN** it equals the origin

#### Scenario: A moon's position composes its parent's position with its own offset
- **WHEN** a moon orbiting a planet is positioned at a given world time
- **THEN** its position equals the planet's position at that time plus the
  moon's own local orbital offset at that time

#### Scenario: An unknown parent identity fails with a named error, never a panic
- **WHEN** a body's stored parent identity does not resolve through the
  injected body lookup
- **THEN** position resolution fails with a named sentinel error
- **AND** no panic or unrecovered exception occurs

#### Scenario: A cyclic parent chain fails with a named error, not unbounded recursion
- **WHEN** a body's parent chain returns to a body already visited during the
  same resolution
- **THEN** position resolution fails with a named sentinel error at a bounded
  recursion depth
- **AND** no unbounded recursion occurs

### Requirement: A Body's Velocity Is Computed Analytically, Not by Finite Difference
The system SHALL compute a body's instantaneous velocity as an exact
analytic function of its orbital elements and the current time — never as a
finite difference of two sampled positions. A parented body's velocity SHALL
equal its parent's velocity at that time plus its own local orbital
velocity. A positive advance of the phase index SHALL correspond to a fixed,
documented direction of sweep in the orbital plane, and local orbital
velocity SHALL point along that direction.

#### Scenario: Velocity is prograde
- **WHEN** a body's velocity and its position relative to its parent are
  evaluated at the same world time
- **THEN** the dot product of the two, normalized by both magnitudes, is
  within 1e-9 of zero
- **AND** the body's position relative to its parent one millisecond later
  is closer to the point reached by stepping along that velocity than to the
  point reached by stepping against it — the velocity points in the direction
  of increasing phase index, not against it

#### Scenario: Velocity is a pure function of the body and the time
- **WHEN** the same body's velocity is evaluated twice at the same world time
- **THEN** both evaluations return the identical vector

### Requirement: The Time Domain Is Explicit and Degenerate Orbital Elements Are Defined
World time SHALL be an integer count of world milliseconds measured from the
world epoch. The system SHALL evaluate a body's position, a park's position,
and the effective-state fold at any world time at or after the world epoch,
including a time strictly before the epoch stored on the orbit or park being
evaluated: the orbital phase index SHALL be reduced onto `[0, SubTurn)` by a
wrap that is correct for a negative elapsed interval, never by a remainder
operation that can yield a negative index. A world time before the world
epoch is outside this capability's domain. An orbital period at or below zero
SHALL hold the body or park motionless at its stored phase for every world
time, never divide by it.

#### Scenario: A park evaluated before its own epoch wraps correctly, never panics
- **WHEN** an orbit park with epoch at world time 50,000 ms is evaluated at
  world time 10,000 ms
- **THEN** its phase index is the stored phase advanced backward by
  40,000 ms of the orbit's period, reduced onto `[0, SubTurn)`
- **AND** no negative index reaches the pinned table and no panic occurs

#### Scenario: One full period before the epoch returns the stored phase exactly
- **WHEN** an orbit is evaluated at exactly one full period before its epoch
- **THEN** the resulting integer sub-turn value is identical to the value at
  the epoch

#### Scenario: A non-positive period is motionless
- **WHEN** a body's or park's stored period is zero or negative
- **THEN** its computed position is identical at every world time and equals
  its position at its stored phase
- **AND** no division by the period is performed

### Requirement: A Committed Burn's Geometry Is Fixed at Commit and Evaluated Closed-Form
The system SHALL store a committed burn as: its origin point, its target's
identity, the solved intercept point, the curve's control points, the
curve's arc length, its depart and arrive times, its commanded
acceleration, and, for a body target, the insertion phase index the
intercept was built at. The system SHALL derive the ship's position, tangent, and
speed at any time from those stored fields and that time alone, never from
additional persisted state. A time before depart SHALL be clamped to the
origin; a time after arrive SHALL be clamped to the intercept with zero
speed — the system SHALL NOT extrapolate the curve beyond the stored burn
window.

#### Scenario: Position at depart is exactly the origin
- **WHEN** a burn's position is evaluated at its stored depart time
- **THEN** it equals the stored origin point exactly

#### Scenario: Position at arrive is exactly the intercept
- **WHEN** a burn's position is evaluated at its stored arrive time
- **THEN** it equals the stored intercept point exactly

#### Scenario: A time before depart clamps to the origin, never extrapolating
- **WHEN** a burn's position is evaluated at a time before its stored depart
  time
- **THEN** it equals the stored origin point exactly, not a linearly
  extrapolated point behind it

#### Scenario: A time after arrive clamps to the intercept at zero speed
- **WHEN** a burn's position and speed are evaluated at a time after its
  stored arrive time
- **THEN** the position equals the stored intercept point exactly
- **AND** the speed is zero

#### Scenario: The same burn evaluated twice at the same time is identical
- **WHEN** the same stored burn's position is evaluated twice at the same
  time
- **THEN** both evaluations return the identical position

### Requirement: Flight Time Is the Brachistochrone of the Curve's Arc Length
The system SHALL compute a burn's flight time from the solved curve's own
arc length — never from the straight-line distance between origin and
intercept — as `2 * sqrt(curveLength / acceleration)`. Against a moving
target the arrival a fixed-round solve stores is derived from the curve
length of the round that produced it, so the stored duration MAY trail the
brachistochrone of the finally-stored curve by the bounded, recorded amount
*Intercept Against a Moving Target Runs a Fixed Number of Rounds* pins. The curve's arc
length SHALL be at least as long as the straight-line chord between its
endpoints. A burn whose solved curve length falls below a configured minimum
arc length SHALL be rejected at commit with a reason distinct from every
other commit-rejection reason, rather than resolved to a near-zero-duration
burn.

#### Scenario: Flight time matches the closed-form brachistochrone value
- **WHEN** flight time is computed for a curve of length 200 units at an
  acceleration of 8 units per second squared
- **THEN** the result is 10 seconds

#### Scenario: Curve length is never shorter than the chord
- **WHEN** a burn's curve length and the straight-line distance between its
  origin and intercept are compared
- **THEN** the curve length is greater than or equal to the chord distance
- **AND** for a stationary target the burn's stored flight duration
  (`arrive - depart`, quantized per the burn-timing requirement) equals the
  brachistochrone of the curve's actual length, not the chord's

#### Scenario: Against a moving target the stored duration may trail the stored curve by a bounded amount
- **WHEN** a burn is solved against a target that moves during the flight, so
  that the arrival the final round stored was derived from the previous
  round's curve length
- **THEN** the difference between the stored duration and the brachistochrone
  of the stored curve's own length is at or below the bound the fixture family
  records
- **AND** that bound is a recorded consequence of the fixed-round solve (see
  *Intercept Against a Moving Target Runs a Fixed Number of Rounds*), not an
  unbounded drift

#### Scenario: A burn below the configured minimum arc length is rejected at commit
- **WHEN** a burn is committed whose solved curve length is below the
  configured minimum arc length
- **THEN** the commit is rejected with its own named reason
- **AND** no burn with that geometry is stored

#### Scenario: A burn at or above the configured minimum arc length is accepted
- **WHEN** a burn is committed whose solved curve length is at or above the
  configured minimum arc length
- **THEN** the commit succeeds and the burn resolves normally

### Requirement: Burn Timing Quantizes to Integer World-Milliseconds by Ceiling
The system SHALL store every time-valued field on a burn or a park —
depart, arrive, epoch, and period — as an integer count of world
milliseconds. The flight-time solve SHALL work in float seconds internally,
but SHALL quantize its final arrival to an integer by rounding up
(`arriveMs = departMs + ceil(flightSeconds * 1000)`), never by rounding to
nearest and never by truncating, so that a burn is never resolvable before
its underlying physics indicate arrival. Every computation that derives a
duration from a stored burn or park — its progress, its speed, its
arc-length profile — SHALL use the stored integer duration, never re-derive
a float duration from other stored fields.

#### Scenario: A fractional flight time quantizes upward, never downward
- **WHEN** a solved flight time of 1.4001 seconds is committed departing at
  world time `T`
- **THEN** the stored arrival is `T + 1401` milliseconds, not `T + 1400`

#### Scenario: An exact millisecond flight time is not over-rounded
- **WHEN** a solved flight time is already an exact integer number of
  milliseconds
- **THEN** the stored arrival is depart plus exactly that many milliseconds,
  not one millisecond later

#### Scenario: Arrival is an exact integer comparison
- **WHEN** the fold evaluates whether a burn has arrived at a world time
  equal to its stored arrival millisecond
- **THEN** the burn is treated as arrived, using an exact integer comparison
  with no floating-point epsilon

### Requirement: Burn Speed Follows an Accelerate-Flip-Decelerate Profile
The system SHALL compute a burn's instantaneous speed as `acceleration *
tau` for burn-relative time `tau` up to the arc-length midpoint, and as
`acceleration * (flightDuration - tau)` after the midpoint — accelerating to
the midpoint, then decelerating to a stop at arrival.

#### Scenario: Speed peaks at the arc-length midpoint
- **WHEN** a burn's speed is sampled at its midpoint and at times
  immediately before and after it
- **THEN** the midpoint's speed is greater than both neighboring samples

#### Scenario: The flip indicator flags the first half of the burn only
- **WHEN** the "before flip" indicator is evaluated just before and just
  after the arc-length midpoint
- **THEN** it is true just before the midpoint and false just after it

#### Scenario: Speed is zero at both ends of the burn
- **WHEN** a burn's speed is evaluated at its stored depart time and at its
  stored arrive time
- **THEN** both are zero

### Requirement: Position Along the Curve Follows Arc Length, Not the Curve Parameter
The system SHALL place a ship at burn-relative time `tau` at the point that
is `coveredLength(tau)` of arc length along the stored curve, where
`coveredLength` is the integral of the accelerate-flip-decelerate speed
profile — `0.5 * acceleration * tau^2` up to half the flight duration, and
`curveLength - 0.5 * acceleration * (flightDuration - tau)^2` after it —
never at the curve parameter `tau / flightDuration`. The curve's arc length
and the arc table it is read from SHALL both be the cumulative chord sums of
the curve sampled at 64 equal steps of the curve parameter, so that the arc
length used to price the flight and the arc length used to place the ship
are the same number. Within the bracketing segment the search resolves a
target arc length to, the parameter SHALL be the linear interpolation
between the bracketing segment's endpoints, in proportion to the target arc
length's position within that segment.

#### Scenario: Half the flight duration places the ship at half the arc length
- **WHEN** a burn's position is evaluated at the midpoint of its flight
  duration
- **THEN** the arc length from the origin to that position along the stored
  curve is half the stored curve length
- **AND** it is NOT the curve evaluated at parameter 0.5, for a curve whose
  control points make those two points differ

#### Scenario: Distance travelled between two instants matches the integral of the reported speed
- **WHEN** a burn's positions at burn-relative times `tau` and `tau + d` are
  compared for a small `d` in the first half of the flight
- **THEN** the arc length between them equals `coveredLength(tau + d) -
  coveredLength(tau)`, consistent with the speed the same burn reports at
  those instants

#### Scenario: The arc length that prices the flight is the arc length that places the ship
- **WHEN** the total arc length implied by walking the stored curve at 64
  equal parameter steps is compared with the curve length stored on the burn
- **THEN** the two are exactly equal

### Requirement: A Burn's Delta-V Price Equals Commanded Acceleration Times Flight Time
The system SHALL price a burn's delta-v cost as its commanded acceleration
multiplied by its stored flight duration (`arrive - depart`). The price
SHALL be strictly positive for any burn with a positive flight duration, and
SHALL scale as the square root of the commanded acceleration for a fixed
curve (`deltaV = 2 * sqrt(acceleration * curveLength)`, since flight duration
itself scales as the inverse square root): quartering the commanded
acceleration for the same path doubles the flight duration and halves the
delta-v price, so a deliberately slower burn is cheaper in delta-v and
dearer in time.

#### Scenario: Price equals acceleration times flight duration
- **WHEN** a burn's delta-v price is computed
- **THEN** it equals the burn's commanded acceleration multiplied by
  `arrive - depart`
- **AND** the result is strictly positive

#### Scenario: A slower burn over the same path costs proportionally less
- **WHEN** a burn to an explicit fixed point is solved at an acceleration of
  8 units per second squared, yielding a curve of length 200 units, and the
  same burn is solved again at 2 units per second squared over that same
  stored curve
- **THEN** the stored flight durations are 10,000 ms and 20,000 ms
- **AND** the delta-v prices are 80 and 40 units per second — the slower
  burn costing exactly half

### Requirement: Departure Is Tangent to the Ship's Actual Motion at Commit
The system SHALL construct a burn's departure tangent from the ship's actual
velocity direction at commit time, not from the straight-line chord to the
target, when that velocity is available. A ship departing a fixed point with
no velocity of its own SHALL depart along the chord direction.

#### Scenario: A crosswise departure velocity bends the path off the chord
- **WHEN** a burn is solved with a departure tangent that points crosswise to
  the straight-line chord toward the target, compared to the same burn
  solved with no departure tangent
- **THEN** the crosswise burn's curve is longer than the straight burn's
- **AND** the crosswise burn's path departs measurably from the chord line
  partway through the burn

#### Scenario: Departing a stationary park uses the chord direction
- **WHEN** a burn is solved from a ship holding a fixed-point park, which has
  no velocity of its own
- **THEN** the departure tangent is the direction of the straight-line chord
  to the target

### Requirement: Arrival Is Tangent to the Target's Settled Motion, With No Perceptible Discontinuity
The system SHALL construct a burn's arrival tangent from the target's
settled velocity at the entry point — the sum of the target body's
translation and the orbital sweep of the parking orbit the ship inserts
into — so that the ship's direction of motion is continuous through
insertion. The arrival tangent SHALL be the settled park's velocity at the
stored arrival millisecond at the insertion phase index stored on the burn
(per *A Committed Burn's Geometry Is Fixed at Commit and Evaluated
Closed-Form*), not the orbital sweep of the pre-quantization approach
direction. The positional discontinuity
across arrival SHALL be exactly zero: the settled park SHALL be constructed
at the same stored insertion phase index and with its epoch set to the
burn's stored arrival time, so that the settled park's position at the
arrival millisecond is bit-identical to the burn's stored intercept. The
alignment between the curve's end tangent and the settled park's velocity
direction SHALL be strictly greater than 0.95 (the value the source design
pins), and the threshold recorded in the fixture family SHALL be the
measured worst case only where it is stricter than 0.95 — a measured value
looser than 0.95 is a failure of this requirement, not a re-baselining of
it.

#### Scenario: The end tangent closely matches the settled orbit's velocity direction
- **WHEN** a burn targeting a body is evaluated at its arrival instant, and
  the resulting settled park's velocity direction is evaluated immediately
  after
- **THEN** the dot product of the curve's end tangent and the settled
  velocity direction exceeds the threshold recorded in the fixture family
  for this property

#### Scenario: Position does not visibly jump across arrival
- **WHEN** a ship's position is evaluated at its burn's arrival millisecond
  by the burn and by the settled park the fold produces
- **THEN** the two positions are bit-identical

#### Scenario: The insertion phase index is stored, not recovered from the intercept
- **WHEN** the fold reconstructs a settled burn's park
- **THEN** the park's phase equals the insertion phase index stored on the
  burn
- **AND** the park's position at the burn's stored arrival millisecond is
  bit-identical to the stored intercept, because both are the same function
  evaluated on the same operands

### Requirement: A Burn Path Is Displaced Perpendicular to the Chord to Clear the Star
The system SHALL keep a burn's curve outside a configured clearance radius
around the star. Where the curve's closest approach, among a fixed
33-sample evaluation of the curve at equal steps of the curve parameter,
falls inside that radius, the system SHALL displace the curve's INTERIOR
control points — those that determine neither end tangent — perpendicular to
the chord between origin and intercept, never along a direction that could
be nearly parallel to the chord, since a push in that direction
reparameterizes the line without bending it away from the star. The two
control points adjacent to the endpoints SHALL NOT be displaced, because a
Bézier curve's end tangents are exactly the differences across those
adjacent pairs, and displacing them would rotate the arrival heading the
insertion-tangency requirement pins (see *Arrival Is Tangent to the Target's
Settled Motion, With No Perceptible Discontinuity*). The transfer curve SHALL
therefore carry enough control points that this is possible at all: with both
endpoints fixed and both end-tangent directions fixed, a cubic retains only
its two tangent magnitudes as free parameters, which cannot satisfy an
arbitrary clearance constraint and cannot bend the curve off the chord line
at all when the control points are collinear. A
curve whose closest sampled approach is already outside the clearance radius
SHALL have its control points left unmodified. This requirement binds a
curve whose origin and intercept both lie outside the clearance radius. IF
either endpoint lies at or inside the clearance radius, THEN the commit
SHALL be rejected with its own named reason, rather than storing a curve
this requirement cannot be satisfied for.

#### Scenario: A burn crossing near the star bulges clear of it
- **WHEN** a burn is solved whose straight-line chord passes near the star
- **THEN** the burn's minimum distance from the star, over the fixed
  33-sample evaluation, exceeds the configured clearance radius

#### Scenario: A burn nowhere near the star is left unmodified
- **WHEN** a burn's closest sampled approach to the star is already outside
  the configured clearance radius
- **THEN** its control points are identical to the control points computed
  before star-avoidance was considered

#### Scenario: A burn whose endpoint is already inside the clearance radius is rejected
- **WHEN** a burn is committed whose origin point, or whose solved intercept,
  lies at or inside the configured star-clearance radius
- **THEN** the commit is rejected with its own named reason, distinct from
  the minimum-arc-length rejection
- **AND** no burn with that geometry is stored

#### Scenario: Star avoidance leaves both end tangents exactly unchanged
- **WHEN** a burn's curve is displaced to clear the star
- **THEN** its departure tangent and its arrival tangent are bit-identical to
  the tangents of the same curve built before star-avoidance was considered
- **AND** the alignment the insertion-tangency requirement measures is
  therefore unaffected by how large a displacement the clearance demanded

#### Scenario: A grazing point whose radial direction is nearly chord-parallel still clears the star
- **WHEN** a burn's closest sampled approach to the star lies at a point
  whose direction from the star is nearly parallel to the chord between
  origin and intercept
- **THEN** the displacement applied to the control points is still exactly
  perpendicular to the chord (not along the near-parallel radial direction)
- **AND** the resulting curve's minimum sampled distance from the star still
  exceeds the configured clearance radius

### Requirement: Orbital Angles Resolve Through a Pinned Table, Never Runtime Trigonometry
The system SHALL represent an orbit's phase, inclination, and node as
integer sub-turn units (a fixed fraction of one full revolution), never as
floating-point radians or degrees. The sine and cosine of any such angle
used in a rule-bearing computation SHALL be resolved by table lookup against
a committed, two-level pinned constant table, combined by the
angle-addition identity — never by calling a runtime trigonometric function.
Deriving a phase index from a Cartesian offset SHALL use a fixed, documented
number of exact comparisons (an octant reduction, then a bracketing search
over the table), with ties broken by selecting the lower index,
deterministically. An offset that lies exactly on a table entry's
direction — its exact cross product against that entry is zero and its dot
product against it is positive — SHALL resolve to that entry's own index. A
tie SHALL be defined only as an offset exactly equidistant between two
adjacent table directions under the search's comparison, and SHALL resolve
to the lower of the two indices.

#### Scenario: An orbit returns to exactly its stored phase after one period
- **WHEN** an orbit's angle is evaluated at its epoch and again at its epoch
  plus exactly one full period
- **THEN** the two evaluations produce the identical integer sub-turn value

#### Scenario: Deriving a phase index from an offset is deterministic
- **WHEN** the same Cartesian offset is resolved to a phase index twice
- **THEN** both resolutions return the identical index, including on an
  input that falls exactly on the documented tie-break boundary

#### Scenario: An offset exactly equidistant between two adjacent table directions resolves to the lower index
- **WHEN** a non-zero Cartesian offset equal to the sum of two adjacent table
  direction vectors — exactly equidistant between the two under the search's
  comparison — is resolved to a phase index
- **THEN** the resolved phase index is the lower of the two adjacent indices
- **AND** this scenario does not cover the zero offset; its resolution to a
  documented default phase index is defined by the requirements that produce
  it (Intercept Against a Moving Target Converges in a Fixed Number of
  Rounds; Releasing a Station-Keep Hold Re-Circularizes at the Held Offset's
  Planar Radius)

#### Scenario: The phase index round-trips with local position
- **WHEN** a phase index is used to compute a local orbital position and that
  position's offset is then resolved back to a phase index, for a swept set
  of phases
- **THEN** the round-tripped phase index equals the original phase index
  exactly for an offset built from that index's own table direction, and
  within one sub-turn unit otherwise

### Requirement: Fixed-Round Iteration Replaces Every Data-Dependent Loop Exit
No search or refinement procedure in this capability SHALL have a trip count
that depends on its input — no iterative procedure SHALL check its own
result for convergence and break early or continue based on that check. The
arc-length parameterization search SHALL run a fixed six-step binary search
over the pinned 64-segment arc table for every call. Deriving a phase index
from a Cartesian offset (see the orbital-angle requirement above) SHALL run
a fixed twenty-comparison search, never an early-exit loop. Each such
procedure SHALL report the number of steps it executed to its caller — as a
return value, an out-parameter, or a field of a per-call result — usable by
this capability's own test suite, never through package-level mutable
state, so the fixed trip count is an asserted observation rather than a
code-review claim, and so the count is observable without introducing
shared state into a package with no state.

#### Scenario: The arc-length search always runs the same number of steps
- **WHEN** the arc-length parameterization search is run for a fraction near
  the start of the curve and again for a fraction near the end of the curve
- **THEN** the reported step count is exactly six in both runs, and the two
  runs' step counts are equal, regardless of how quickly either could have
  converged

#### Scenario: The phase-index search always runs the same number of steps
- **WHEN** a phase index is derived from an offset that lands exactly on a
  table entry and from an offset that requires the full bracketing search
- **THEN** the reported step count is exactly twenty in both derivations, and
  the two derivations' step counts are equal, with no early exit for the
  on-entry case

### Requirement: Intercept Against a Moving Target Runs a Fixed Number of Rounds
The system SHALL solve a burn against a moving target by fixed-point
iteration: each round rebuilds the full transfer curve for the previous
round's flight-time estimate and re-derives a new flight time from that
curve's actual length. The solve SHALL run an unconditional, configured
fixed number of rounds — with no round-to-round convergence check and no
early-exit branch.

That iteration SHALL NOT be required to reach a fixed point, and the
configured round count SHALL NOT be justified by a zero round-to-round
residual, because for a target that moves appreciably during the flight the
map is not a contraction and the ceiling quantization of the arrival makes
its right-hand side a step function of the arrival — so an exact fixed point
need not exist. What the system SHALL guarantee instead is that the solve is
a deterministic function of its inputs and its configured round count: the
same inputs at the same round count SHALL always produce the identical stored
burn. The residual between the final two rounds SHALL be MEASURED across this
capability's fixture sweep and RECORDED in the fixture family as a pinned
bound, so that a change which worsens it fails the family rather than passing
silently; the bound SHALL NOT be re-recorded upward without a stated reason.
The insertion phase index SHALL be derived first, by resolving the
horizontal-plane projection of the direction from the target body's
position at the burn's stored integer arrival millisecond to the burn's
origin point to a phase index (a degenerate zero-length projection SHALL
use a fixed, documented default phase index). The intercept point SHALL
then be defined as the settled park's own position at that arrival
millisecond — the park built with that phase index, the body's insertion
standoff radius, the insertion period for that radius, and its epoch set to
that arrival millisecond — evaluated by the same position function the fold
calls, so the two agree bit-for-bit by construction rather than by two
arithmetic paths rounding alike. The intercept SHALL NOT be constructed as
the body's position displaced along the float-normalized approach
direction, and SHALL NOT be evaluated at the solve's pre-quantization float
arrival time. The insertion standoff radius SHALL be a documented function
of the body — not one global constant — and the insertion orbit's period
SHALL be a documented function of that radius; both SHALL be named
constants or named functions in this capability's parameter file, and the
period used to build the arrival tangent SHALL be the same period stored on
the settled park. The solve SHALL report the number of rounds it executed
to its caller — as a return value, an out-parameter, or a field of a
per-call result — usable by this capability's own test suite, never
through package-level mutable state, so the count is observable without
introducing shared state into a package with no state.

#### Scenario: The solved intercept sits at the insertion standoff from the target's arrival position
- **WHEN** a burn is solved against a body target
- **THEN** the intercept point is at the configured insertion standoff
  distance from that body's position evaluated at the burn's stored
  (quantized integer) arrival millisecond
- **AND** the solved arrival time is strictly after the solved depart time

#### Scenario: The solve never exits early regardless of how quickly the estimate stabilizes
- **WHEN** the solve is run against a target whose position barely changes
  during the flight (so the flight-time estimate would stabilize after the
  first round) and against a target whose position changes substantially
- **THEN** the reported round count is identical in both runs and equals the
  configured fixed number of rounds, regardless of how quickly either
  estimate stabilized

#### Scenario: The standoff is taken on the approaching side, in the horizontal plane
- **WHEN** the same body is targeted by two burns originating on opposite
  sides of it
- **THEN** the two solved intercept points lie on opposite sides of the body
- **AND** each intercept's offset from the body has a zero vertical component

#### Scenario: A larger body gets a proportionally larger standoff
- **WHEN** the insertion standoff is resolved for two bodies of different
  size
- **THEN** the larger body's standoff radius is larger, per the documented
  standoff function, not equal to it

#### Scenario: The round-to-round residual is measured and bounded, not assumed zero
- **WHEN** the solve is run for the configured number of rounds `N` and again
  for `N - 1` rounds, over every case in this capability's fixture sweep
- **THEN** the largest difference between the two quantized integer-millisecond
  arrivals is at or below the bound the fixture family records
- **AND** a change that increases that difference fails the family rather than
  passing silently

#### Scenario: A stationary target does reach a fixed point
- **WHEN** the solve is run for `N` and for `N - 1` rounds against a target
  that does not move — an explicit point, or a body whose orbital period is
  non-positive
- **THEN** the quantized integer-millisecond arrival is identical, with a
  residual of exactly zero
- **AND** the residual the family records is therefore attributable to target
  motion, not to the round count being too small

#### Scenario: The same inputs at the same round count always produce the same burn
- **WHEN** the same solve is run twice with identical inputs and the identical
  configured round count
- **THEN** both runs produce a bit-identical stored burn — curve, intercept,
  length, arrival, and insertion phase index

### Requirement: Targeting Names a Body or an Explicit Point, Never Requires a Precomputed Position
The system SHALL accept a burn's target as either a body identity or an
explicit point, and SHALL derive the standoff distance and approach geometry
internally from that identity — the caller SHALL NOT be required to supply a
target position.

#### Scenario: A point target resolves to exactly that point
- **WHEN** a burn's target is an explicit point
- **THEN** the target's resolved position at any time equals that point,
  unchanged

#### Scenario: The same body target at two different depart times yields two different intercepts
- **WHEN** the same body is targeted by two burns departing at different
  times
- **THEN** the two solved intercept points differ
- **AND** each burn stores the same target body identity, not a computed
  position

### Requirement: Idle Ships Park in Exactly One of Three Modes
The system SHALL represent an idle ship's resting state as exactly one of:
`orbit` (a free rails orbit around a body), `stationkeep` (a fixed offset
held continuously in a body's reference frame, at a continuous cost), or
`point` (a fixed position in space, free). `orbit` and `point` SHALL impose
no ongoing cost; `stationkeep` SHALL impose the continuous upkeep defined
below.

#### Scenario: An orbit park stays at its configured radius from its body forever
- **WHEN** an orbit park's position and its body's position are evaluated at
  world times 0, 8.3, and 55
- **THEN** the distance between them equals the park's configured radius at
  every one of those times

#### Scenario: A station-keep park holds the exact stored offset
- **WHEN** a station-keep park's position is evaluated at two different world
  times
- **THEN** at each time it equals its body's position at that time plus the
  park's exact stored offset

#### Scenario: A point park never moves
- **WHEN** a point park's position is evaluated at two different world times
- **THEN** both evaluations return the identical position

### Requirement: Station-Keeping Draws a Positive, Body-Derived Upkeep
The system SHALL charge a station-keeping park a continuous upkeep rate
equal to the host body's own centripetal acceleration (its orbital angular
rate squared, times its orbital radius), subject to a configured floor. A
body with no orbit of its own SHALL charge exactly the configured floor.
Accrued upkeep over an interval SHALL be the park's rate multiplied by the
elapsed world time, computed from the two endpoints alone.

#### Scenario: Every body in a generated system charges a positive rate
- **WHEN** the station-keep upkeep rate is computed for every body in a
  generated system
- **THEN** every computed rate is strictly positive

#### Scenario: A body with no orbit charges exactly the configured floor
- **WHEN** the station-keep upkeep rate is computed for a body with no orbit
  of its own
- **THEN** the result equals the configured floor exactly

#### Scenario: An inner, faster body charges more than an outer, slower one
- **WHEN** the station-keep upkeep rate is computed for a body at orbital
  radius 10 with period 20, and for a body at orbital radius 40 with period
  160, both around the same parent and both above the configured floor
- **THEN** the first body's rate is the higher of the two, being the larger
  value of `(2*pi/period)^2 * radius`

### Requirement: Releasing a Station-Keep Hold Re-Circularizes at the Held Offset's Planar Radius
The system SHALL convert a released station-keep hold into an orbit park
whose radius is the planar (horizontal-plane) magnitude of the held offset —
dropping any vertical component — with its epoch set to the release time.
The resulting radius SHALL be the planar magnitude of the held offset or a
configured minimum orbit radius, whichever is greater. The phase index SHALL
be derived from the offset's planar components; IF those components are both
zero, THEN a fixed, documented default phase index SHALL be used.

#### Scenario: A released hold's orbit radius drops the vertical offset component
- **WHEN** a station-keep hold at offset `(3, 2, 4)` is released at world
  time 50
- **THEN** the resulting orbit park's radius is 5 (the planar magnitude of
  the x/z components, vertical dropped)
- **AND** the resulting orbit park's epoch is 50

#### Scenario: A hold directly above the body re-circularizes at the minimum radius
- **WHEN** a station-keep hold at offset `(0, 5, 0)` is released
- **THEN** the resulting orbit park's radius is the configured minimum orbit
  radius, not zero
- **AND** its phase is the documented default phase index

### Requirement: A Burn Past Its Arrival Is Its Settled Park, With No Extra Persisted State

The system SHALL derive a ship's state entirely from its stored burn, park,
or drift: a burn whose arrival time has passed IS its settled park, computed
deterministically from the stored burn alone (the approach geometry set the
insertion phase at commit) — specifically, the settled park's body is the burn's
target body, its radius is that body's insertion standoff radius, its
period is the insertion period for that radius, its phase is the insertion
phase index stored on the burn — never re-derived from the intercept by
resolving its offset, a round trip this capability guarantees only to
within one sub-turn unit — and its epoch is the burn's stored arrival
millisecond — no field beyond what the burn already stores SHALL be
persisted to represent this transition, and evaluating it repeatedly at
different later times SHALL produce identical results. A burn targeting an
explicit point SHALL settle into a `point` park at the intercept.

#### Scenario: A burn is still burning immediately before arrival and settled immediately after

- **WHEN** a ship's state is evaluated one millisecond before its burn's
  stored arrival time
- **THEN** it is reported as still burning
- **WHEN** the same ship's state is evaluated one millisecond after its
  burn's stored arrival time
- **THEN** it is reported as settled into an idle park

#### Scenario: Folding at two later times gives identical results

- **WHEN** a settled burn's state is evaluated at two different times, both
  after its arrival
- **THEN** both evaluations produce the identical park

#### Scenario: A settled body-targeted burn rides its insertion orbit

- **WHEN** a settled burn's position is evaluated at a time well after its
  arrival
- **THEN** its distance from the target body at that same time equals the
  configured insertion radius

#### Scenario: A burn to a fixed point settles into a point park

- **WHEN** a burn targeting an explicit point is evaluated after its arrival
- **THEN** its settled state is a `point` park at the burn's intercept

### Requirement: A Large Time Jump Is Safe by Construction
The system SHALL produce the identical settled state and position whether a
ship's state is evaluated once at a far-future world time or by stepping
through many intermediate world times first — because every evaluation is a
pure function of stored data and the time asked for, not of any prior
evaluation.

#### Scenario: A single far-future evaluation matches many intermediate evaluations
- **WHEN** a ship's state is evaluated once at a world time long after a
  burn's arrival, and separately evaluated by stepping through a sequence of
  intermediate world times up to and including that same far-future time
- **THEN** the final settled state and position are identical in both cases

#### Scenario: A first read long after arrival returns the settled park, not a frozen burn
- **WHEN** a ship's state is read for the first time, long after its stored
  burn's arrival time, with no intermediate read having occurred
- **THEN** the state returned is the settled park, not the mid-flight burn

### Requirement: No Value Is Derived From Accumulated Per-Tick State
The system SHALL derive every value it reports — position, velocity,
remaining resource, park, or burn state — purely from stored data and the
world time of the read. No value SHALL depend on how many times it has
previously been read, nor on the size or number of intermediate time steps
taken to reach the current read.

#### Scenario: Reading a station-keeping fleet's remaining delta-v is read-count-independent
- **WHEN** the upkeep a station-keep park has accrued between two world times
  is computed in one call, and separately by summing 500 consecutive
  sub-intervals covering exactly the same span
- **THEN** both approaches report the identical figure, because accrued
  upkeep is the closed-form product of the park's rate and the elapsed world
  time, never an accumulation over reads or ticks

#### Scenario: Two independent readers at the same world time agree
- **WHEN** two independent reads of the same ship's position at the same
  world time occur without coordinating with each other
- **THEN** both reads return the identical position

### Requirement: Coordinates Cross the Persistence Boundary Through a Named Codec

The system SHALL encode every position, control point, and orbital element
set into storage-native primitives through one named codec before it
crosses into an untyped parameter map (a Firestore document or an
`action.Params` payload), and SHALL decode through that codec's exact
inverse. The codec SHALL reject a value that decodes to a non-finite number
(`NaN` or ±infinity) or to a magnitude beyond a configured extent, with a
named, countable failure — no such value SHALL reach a downstream
computation in this capability. This codec SHALL extend to a ship's whole
kinematic state: a burn (origin point, target identity or explicit point,
solved intercept point, all six curve control points, curve length, depart
and arrive world-milliseconds, commanded acceleration, and, for a body
target, the insertion phase index), a park (of any of its three kinds), and
a drift (anchor, velocity, epoch). The six curve control points SHALL NOT be
encoded as a slice of slices (`[][]float64`), which the action spine's
existing non-primitive parameter validation rejects; the codec SHALL encode
them as a flat list of numeric primitives, as a list of per-point primitive
lists wrapped in `[]any`, or as a keyed map — any shape the action spine's
allowlist accepts. A decode SHALL fail, by the same named, countable
decode-failure, when the stored control points do not number exactly six,
or when the decoded curve length is not bit-identical to the arc length
recomputed from the decoded control points — and no downstream computation
SHALL run on a partially-decoded state. A decode SHALL also fail, by the
same named error, when a drift's stored epoch is absent or non-positive.

#### Scenario: A position encodes to storage-native primitives and decodes back exactly

- **WHEN** a burn's origin position is encoded by the codec
- **THEN** it encodes to a list of storage-native numeric primitives that the
  action spine's existing parameter validator accepts
- **AND** decoding that encoded form returns a vector identical to the
  original

#### Scenario: A bare domain vector is rejected by the action spine's existing validation

- **WHEN** an attempt is made to commit an action whose parameters contain a
  raw vector or orbit struct rather than its encoded primitive form
- **THEN** the commit is rejected by the action spine's existing
  non-primitive-parameter validation, unchanged by this capability

#### Scenario: A coordinate decoding to a non-finite or out-of-extent value fails by name, not silently

- **WHEN** a stored coordinate decodes to `NaN`, positive or negative
  infinity, or a magnitude beyond the configured extent
- **THEN** decoding fails with a named, countable error
- **AND** no computation in this capability is performed on that value

#### Scenario: A solved burn round-trips exactly through the codec

- **WHEN** a fully solved burn (origin, target, intercept, six control
  points, curve length, depart/arrive milliseconds, commanded acceleration,
  and insertion phase index) is encoded and then decoded
- **THEN** every one of those fields on the decoded burn is identical to the
  original

#### Scenario: Every park kind and a drift round-trip exactly through the codec

- **WHEN** a park of each of its three kinds, and separately a drift, is
  encoded and then decoded
- **THEN** the decoded value is identical to the original in every case

#### Scenario: The wrong number of control-point components fails by name

- **WHEN** a stored value that should decode to six control points instead
  contains a different number of components
- **THEN** decoding fails with the existing named decode-failure, and no
  burn is produced

#### Scenario: A stored curve length disagreeing with the recomputed arc length fails by name

- **WHEN** a stored burn's control points, decoded and walked through this
  capability's own arc-length computation, produce a length that disagrees
  with the burn's separately stored curve length
- **THEN** decoding fails with the existing named decode-failure, and no
  burn is produced

#### Scenario: A non-finite component within a burn's control points fails by the existing named error

- **WHEN** a stored burn's control-point list decodes to a component that is
  `NaN` or ±infinity
- **THEN** decoding fails with this capability's existing named, countable
  decode-failure error
- **AND** no position, velocity, or arrival computation is performed on that
  value

#### Scenario: A drift with an absent or non-positive epoch fails to decode

- **WHEN** a stored drift's epoch field is absent, zero, or negative
- **THEN** decoding fails with the existing named, countable decode-failure
  error, and no drift is produced

### Requirement: Every Rule-Bearing Value of This Capability Is Computed Only in the Authoritative Implementation
The system SHALL compute every value this capability defines that is
persisted, returned as a solve result, used to compute an ETA or a delta-v
price, or used to decide what data is disclosed to a client only in this
capability's single authoritative implementation — the Go package
`backend/space`. No second implementation of
any of those computations SHALL exist anywhere in the repository, in any
language, under any name, whether or not it shares a name with the
authoritative one. A non-shipping prototype under `frontend/app/spike/` is
exempt while it is reachable only by direct URL under `/spike`, is linked
from no application navigation, and no value it computes is persisted,
returned to a client, or read by any module outside its own directory,
imports no production module of this capability, and no production module
imports it — it is a feel bench, not a second authority. The exemption SHALL be stated in
the capability's Purpose alongside the named path, so it is a recorded
carve-out rather than an unenforced absolute. A render-side module MAY draw screen or path geometry from
values the authoritative implementation already produced — control points, a
sampled polyline, stored orbital elements, an already-quantized arrival
millisecond — and SHALL NOT re-derive a flight time, an arrival time, an
intercept, a curve length, a delta-v price, a settled park, or a visibility
answer from raw inputs.

#### Scenario: A differently-named client-side arrival estimate is a violation
- **WHEN** a render-side module computes an arrival time, flight duration, or
  delta-v price from origin, target, and acceleration, under any function name
- **THEN** this is a violation of this requirement, regardless of whether the
  name-collision check flags it

#### Scenario: Drawing a solved curve is permitted
- **WHEN** a render-side module samples a polyline from control points the
  authoritative implementation solved and stored
- **THEN** this is permitted, because no rule-bearing value is derived — the
  points drawn are a projection of an already-authoritative result

#### Scenario: A rule-bearing computation declared as a non-`function` binding is still a violation
- **WHEN** a render-side module declares such a computation as an arrow
  function bound to a `const`, a class method, or a re-exported alias
- **THEN** it is a violation on the same terms as a `function` declaration,
  and the anti-mirror check's extractor recognizes that declaration form

### Requirement: A Free-Drifting Ship Coasts in a Straight Line at Constant Velocity

The system SHALL represent an unpowered ship's motion as a drift: a stored
anchor position, a stored velocity, and a stored epoch in world
milliseconds. The system SHALL compute a drift's position at any world time
`T` as `anchor + velocity * seconds(T - epoch)`, where `seconds` converts
the signed millisecond difference `T - epoch` to float seconds — with no
terminal condition and no clamp at either end. A drift SHALL NOT fold into a
park at any distance from its epoch, in either time direction; evaluating it
far in the past or far in the future SHALL use the identical linear
expression. A drift SHALL apply no gravity, no drag, and no acceleration of
any kind — its velocity is exactly its stored value at every world time.

#### Scenario: A drift's position follows the linear expression

- **WHEN** a drift's position is evaluated at a world time after its epoch
- **THEN** it equals the stored anchor plus the stored velocity scaled by
  the elapsed seconds since the epoch

#### Scenario: Velocity is identical at two different world times

- **WHEN** a drift's velocity is read at two different world times
- **THEN** both reads return the identical stored velocity vector, unchanged
  by elapsed time

#### Scenario: Evaluation before the stored epoch displaces backward, never panics

- **WHEN** a drift's position is evaluated at a world time before its stored
  epoch
- **THEN** it equals the stored anchor displaced backward along the stored
  velocity by the (negative) elapsed seconds, computed by the same linear
  expression
- **AND** no panic occurs

#### Scenario: A zero-velocity drift equals its anchor forever

- **WHEN** a drift whose stored velocity is the zero vector is evaluated at
  several different world times, both before and after its epoch
- **THEN** every evaluation returns exactly the stored anchor

#### Scenario: The fold at a far-future time returns the identical drift, not a park

- **WHEN** a ship's kinematic state is a drift and is folded to its
  effective state at a world time far after its epoch
- **THEN** the effective state is still the drift itself, unchanged, never a
  settled park

#### Scenario: A large time jump is safe by construction for a drift

- **WHEN** a drift's position is evaluated once at a far-future world time,
  and separately evaluated by stepping through a sequence of intermediate
  world times up to and including that same far-future time
- **THEN** the final position is identical in both cases

#### Scenario: The same drift evaluated twice at the same time is bit-identical

- **WHEN** the same stored drift's position is evaluated twice at the same
  world time
- **THEN** both evaluations return the bit-identical position

### Requirement: Cutting a Drive Converts the Burn to a Drift at Its Live Position and Velocity

The system SHALL, when a running burn is cut strictly before its stored
arrival time, replace the stored burn with a drift whose anchor is the
burn's position at the cut millisecond, whose velocity is the burn's tangent
at the cut millisecond scaled by the burn's speed at the cut millisecond,
and whose epoch is the cut millisecond. Cutting SHALL charge no delta-v and
SHALL NOT alter the burn's stored geometry before it is discarded. Cutting a
burn at or after its stored arrival millisecond SHALL be refused with its
own named reason, distinct from every other rejection this capability
defines — the arrival is already a fact and there is no burn left to cut.

#### Scenario: A mid-burn cut produces a drift anchored at the burn's live position and velocity

- **WHEN** a burn is cut at a millisecond strictly between its stored depart
  and arrive times
- **THEN** the resulting drift's anchor equals the burn's position at that
  millisecond, its velocity equals the burn's tangent at that millisecond
  scaled by the burn's speed at that millisecond, and its epoch equals the
  cut millisecond

#### Scenario: Position and velocity are bit-identical across the cut millisecond

- **WHEN** the burn's position and velocity at the cut millisecond are
  compared against the resulting drift's position and velocity evaluated at
  that same millisecond
- **THEN** both pairs are bit-identical, so the transition introduces no
  observable discontinuity

#### Scenario: Direction follows the tangent past the flip, not the direction of thrust

- **WHEN** a burn is cut after its arc-length midpoint (during its
  decelerating half)
- **THEN** the resulting drift's velocity points in the direction the ship
  was travelling at the cut instant, not in the reversed direction its
  decelerating thrust was pointed

#### Scenario: A cut exactly at depart time yields a zero-velocity drift

- **WHEN** a burn is cut at exactly its stored depart millisecond
- **THEN** the resulting drift has velocity equal to the zero vector and an
  anchor equal to the burn's stored origin point, produced by the same
  expression with no special case for this boundary

#### Scenario: A cut at or after arrival is refused by name

- **WHEN** cutting a burn is attempted at a millisecond at or after its
  stored arrival time
- **THEN** the operation is refused with its own named reason
- **AND** no drift is constructed and the burn's stored state is unchanged

#### Scenario: Cutting charges no delta-v

- **WHEN** a burn is cut
- **THEN** no delta-v is computed or charged for the conversion

