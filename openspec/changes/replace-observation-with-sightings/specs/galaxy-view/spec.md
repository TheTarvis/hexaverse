## ADDED Requirements

### Requirement: A Galaxy Link's Id Is Its Lane's Stable Id
A galaxy graph read's lane entry SHALL carry, as its `id`, the same stable
lane id `POST /v1/fleets/:fleetId/jump` accepts for that crossing — the
same id `system-interior`'s *Lane-Gate Bodies Carry Their Lane Id* serves
on that crossing's gate bodies (`galaxy.LaneIdBetween`, order-independent
over the unordered endpoint pair, is the sole derivation all three
surfaces agree on). One id names a lane, everywhere it is read or acted
on. A golden fixture file under `fixtures/` SHALL pin this equality,
governed by `cross-stack-determinism`'s Go-sole-authority regime
(`backend/galaxy` has no TypeScript mirror): a `fixtures/galaxy/` cases
file asserted across the Go build-target matrix, an accompanying
anti-mirror `mirror-map.json` with an empty `sharedNames` allowlist, and a
corresponding invocation in the repository's mirror-map check. The cases
SHALL include, at minimum: an ordinary lane between adjacent
positive-coordinate systems; a lane with at least one negative-coordinate
endpoint; a **bridge** lane (`Lane.Bridge == true`); and both orderings of
one endpoint pair, asserting the same id.

#### Scenario: A galaxy link's id matches the lane id the jump endpoint accepts
- **GIVEN** a lane crossing between two systems
- **WHEN** that lane's link is read from `GET /v1/galaxy` and its `id` is
  passed as `POST /v1/fleets/:fleetId/jump`'s `laneId`
- **THEN** the jump commits against that same crossing, with no id
  translation

#### Scenario: A galaxy link's id matches its gate bodies' served lane id
- **GIVEN** a lane crossing between two systems
- **WHEN** that lane's link `id` (from `GET /v1/galaxy`) is compared
  against the `laneId` served on either endpoint system's lane-gate body
  (`system-interior`: *Lane-Gate Bodies Carry Their Lane Id*)
- **THEN** the two ids are identical

#### Scenario: A cross-stack fixture pins the equality under the Go-sole-authority regime
- **WHEN** the Go build-target matrix runs the `fixtures/galaxy/` cases
- **THEN** each case asserts that the galaxy link's `id` equals
  `LaneIdBetween` of the crossing's two endpoint system ids, covering an
  ordinary lane, a negative-coordinate endpoint, a bridge lane, and both
  endpoint orderings of one pair
- **AND** a future divergence between the two derivations fails that
  fixture, with no TypeScript mirror to keep in sync (anti-mirror
  `mirror-map.json`, empty `sharedNames`)

### Requirement: Jump Commit
The system SHALL, when the jump command is invoked for a fleet attached to
a lane-gate body, submit a jump order for that fleet naming that gate's
lane id, resolved from a source that is neither filtered by nor derived
from the corporation's charted-lane set — `GET /v1/galaxy`'s `links[]`
ships only charted lanes and is not refreshed by a gate attachment, so a
fleet that has just attached (and whose lane the server has therefore
just charted) is precisely the case that source cannot serve. The command
SHALL NOT be a no-op or a client-side refusal for any gate the fleet is
attached to. On success it SHALL show a success toast, and on failure an
error toast carrying the server's rejection reason, leaving the fleet's
row unchanged.

#### Scenario: A gate absent from the fetched galaxy graph still commits
- **GIVEN** a fetched galaxy graph whose `links[]` is empty and a fleet
  attached to a lane-gate body
- **WHEN** the jump command is invoked on that fleet's roster row
- **THEN** a jump order is submitted naming that gate's lane id, neither
  refused client-side nor a no-op

#### Scenario: The jump command is offered for a gate absent from the graph
- **GIVEN** a fetched galaxy graph whose `links[]` is empty and a fleet
  attached to a lane-gate body
- **WHEN** that fleet's roster row is shown on the galaxy view
- **THEN** the jump command is offered (`fleet-roster`: *The Roster Row Is
  the Fleet Command Surface, Jump Gated by Attachment Alone*)

#### Scenario: A failed jump commit toasts the reason
- **WHEN** the jump command fails (for example: not attached, already in
  lane transit)
- **THEN** an error toast surfaces the server's rejection reason and the
  fleet's row is unchanged
