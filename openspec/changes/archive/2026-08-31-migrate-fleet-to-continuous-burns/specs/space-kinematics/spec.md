## ADDED Requirements

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

## MODIFIED Requirements

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
