## ADDED Requirements

### Requirement: A Client-Supplied Feature Id Is Validated Before Resolution
The system SHALL validate a mine commit's client-supplied `featureId` in
two phases. A **lexical phase**, run before the string is parsed for the
belt-member separator `#` at all, rejects it outright when it: contains a
`/` character; is exactly `.` or `..`; matches the regular expression
`^__.*__$` (Firestore's reserved document-id pattern); or exceeds
`MineParams.MaxFeatureIdBytes` (default 256 bytes, measured as UTF-8
bytes, below Firestore's 1500-byte document-id limit). A **resolution
phase**, run only for a string the lexical phase passed, after the `#`
separator is parsed but before the resulting prefix is used to resolve any
target, rejects it when it: contains more than one `#`; carries a `#`
whose suffix is not a base-10 integer within `[0, AsteroidsPerBelt)`; or
carries a `#` whose prefix does not resolve, in the fleet's own current
system's `interior.Features`, to an existing feature of the belt type.
Each rejection carries its own distinguishable reason and creates no
action.

These checks do not depend on the docked-to-the-named-feature precondition
for their correctness — they SHALL remain in force unchanged if a future
change ever writes `attachedTo` from anything other than a resolved
body-table id — but they SHALL run only after, never before, the ownership
check ("Mine Command Requires Fleet Ownership") and the not-docked
rejection ("Mine Commit Preconditions"'s docked-state check): an invalid
or unresolvable `featureId` rejected any earlier would let a caller probe
the shape or existence of a foreign fleet's docked target before ownership
is established, turning this endpoint into an existence oracle.

Each of these rejections SHALL report a reason distinct from the
not-docked, unknown-kind, and station-not-mineable reasons and SHALL
surface as `400 Bad Request` carrying that reason. Because the
docked-state check runs first and a fleet's `attachedTo` is today written
only from a resolved body-table id, these rejections are reachable only
for a fleet whose stored `attachedTo` is exactly the submitted `featureId`;
their acceptance evidence is service-level, with the stored attachment
supplied by the test fixture, not an end-to-end commit.

Once a target resolves, the run's ledger key SHALL be composed from the
**resolved** feature's own id (the named feature itself, or, for a member
id, its resolved parent belt feature — see "Belt Member Targets Resolve
Through Their Parent Belt Feature") and the acting fleet's own stored
`systemId` — never from the client-supplied `featureId` string verbatim,
and never from a client-supplied system identifier — the same doctrine
`goods-sale`'s "Sale Resolves the Station From the Acting Fleet's Own
System, Never a Client-Supplied Identifier" already applies to sale.

#### Scenario: A featureId containing a path separator is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which contains a `/` character
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — no
  action is created, and the string is never parsed for a `#` separator

#### Scenario: A featureId of exactly `.` or `..` is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which is exactly `.` or `..`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A reserved dunder-pattern featureId is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which matches the regular expression
  `^__.*__$`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: An overlong featureId is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, whose UTF-8 byte length exceeds
  `MineParams.MaxFeatureIdBytes`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A featureId at the maximum configured length is not rejected on length grounds
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId` — a resolvable, resource-bearing
  feature's own id whose UTF-8 byte length is exactly
  `MineParams.MaxFeatureIdBytes`
- **WHEN** a mine commit is submitted naming that `featureId` and a kind
  that feature carries
- **THEN** the commit is accepted and an action is created

#### Scenario: A featureId one byte past the maximum configured length is rejected
- **GIVEN** the same fleet and the same `featureId` extended by one ASCII
  byte, with `attachedTo` set to the extended string
- **WHEN** a mine commit is submitted naming that extended `featureId`
- **THEN** the commit fails with `400 Bad Request` and the overlong-id
  reason — distinct from the not-docked, unknown-kind, and every other
  id-validation reason — and no action is created

#### Scenario: A featureId with more than one member separator is rejected
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which contains more than one `#`
  character
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A member suffix outside the valid index range is rejected
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which carries a `#` whose suffix is
  not a base-10 integer, or is a base-10 integer outside
  `[0, AsteroidsPerBelt)`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A member prefix that does not resolve to a belt feature is rejected
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which carries a `#` whose prefix does
  not resolve, in the fleet's own current system, to an existing feature,
  or resolves to a feature that is not of the belt type
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: An unresolvable member rejection never precedes ownership or the not-docked rejection
- **WHEN** a mine commit is submitted for a fleet the requester does not
  own, or for a fleet not docked to the named target, and the commit's
  `featureId` is also malformed or unresolvable as a member id
- **THEN** the ownership check or the not-docked rejection fires first,
  and the malformed-id rejection is never reached — a caller can never
  learn whether a foreign fleet's target id would have resolved

#### Scenario: A resolved run's ledger key never contains the raw client string or a client-supplied system id
- **WHEN** a mine commit resolves against a belt member id
- **THEN** the appended ledger key's feature component is the resolved
  parent belt feature's own id, and its system component is the acting
  fleet's own stored `systemId` — neither is read from the request body

### Requirement: Belt Member Targets Resolve Through Their Parent Belt Feature
The system SHALL, when a mine commit's `featureId` denotes a belt member id
(`<beltFeatureId>#<k>`, per `system-interior`'s "A Belt's Members Are
Discrete Mineable Bodies On a Shared Radius") that has already passed the
validation defined in "A Client-Supplied Feature Id Is Validated Before
Resolution," resolve mineability, resource kinds, and the run's
ledger key alike from the **parent belt feature** — located by looking up,
in `interior.Features`, the feature named by the member id's validated
prefix — rather than by searching `interior.Features` for the member id
itself, which never appears there (belt members are synthesized only into
the system's body table, never persisted as `interior.Features` entries).
A member's `startTons` for a given `kind` SHALL be computed exactly as the
parent belt feature's own richness-derived starting tonnage for that
`kind` is computed for a direct mine of the belt feature (see "ETA From
Tonnage Target") — a member draws no different tonnage or richness of its
own; the belt is one lode, per `system-interior`'s "A Belt's Members Are
Discrete Mineable Bodies On a Shared Radius." A mine run resolved through a
member id SHALL use the ledger key `${systemId}::${parentBeltFeatureId}::
${kind}` (per "Ledger Key Is System-And-Kind-Qualified, Channel Scope Is
Per-System"), where `parentBeltFeatureId` is the resolved parent's own id
and `systemId` is the acting fleet's own stored system id — never the
member id, and never a client-supplied system identifier — so a run
committed through a member and a run committed by naming the belt feature
directly fold the identical ledger key and deplete the identical lode.

#### Scenario: A fleet docked to a belt member can mine its inherited resource kind
- **WHEN** a fleet's effective state is `docked` to a belt member id (e.g.
  `feat-belt-0#3`) and it commits a mine run naming a `kind` its parent
  belt feature carries
- **THEN** the commit succeeds, resolving the requested kind's richness and
  computing `startTons` from the parent belt feature, never by searching
  `interior.Features` for the member id itself

#### Scenario: A member's mine run depletes the same lode as its parent belt feature
- **WHEN** a fleet mines a kind through a belt member's id, and a mine run
  against that same belt feature's own id (whether earlier, later, or by a
  different fleet) targets the same kind
- **THEN** both runs fold and append to the identical
  `${systemId}::${beltFeatureId}::${kind}` ledger key, and each depletes
  what the other can still yield

#### Scenario: Naming the belt feature while docked to one of its members is rejected as not docked
- **WHEN** a fleet is docked to a belt member and commits a mine run naming
  the parent belt feature's own id rather than the member it is actually
  docked to
- **THEN** the commit fails with the existing not-docked rejection (the
  fleet's stored `attachedTo` names the member, not the belt feature)

## MODIFIED Requirements

### Requirement: Mine Commit Preconditions
The system SHALL accept a mine commit (`POST /v1/fleets/:fleetId/mine
{featureId, kind, tons}`) only when, at commit time: the requesting
corporation owns the fleet (see "Mine Command Requires Fleet Ownership");
the requested `tons` is a positive finite number at or above
`MineParams.MinRunTons` (see "Mine Tonnage Is a Positive Finite Number" and
"Minimum Mine Run Size"); the fleet's effective state is `docked` to the
named feature — a fleet merely parked at, near, or coincident with a body's
position, with its stored `attachedTo` unset or naming a different body, is
not docked to it (see "A fleet parked near a body but not attached to it is
rejected"); the submitted `featureId` has passed the validation defined in
"A Client-Supplied Feature Id Is Validated Before Resolution" (enforced
only after, never before, this ownership and docked-state ordering); the
resolved target's detail — the named feature
itself, or, for a belt member id, its parent belt feature (see "Belt
Member Targets Resolve Through Their Parent Belt Feature") — carries at
least one resource entry of the requested `kind`; the feature's best-known
remaining tonnage of that `kind` is not already at or below zero (see
"Already-Depleted Lode Rejected At Commit"); the fleet's derived mining
rate is greater than zero;
the requested `tons` does not exceed the fleet's current free hold (derived
capacity minus current cargo); and the fleet's movement-channel action slot
(`activeActionId`) is free — rejecting the commit with the matching
sentinel error and creating no action when any precondition fails. No prior
scan of the feature is required to commit.

#### Scenario: Not docked to the feature is rejected
- **WHEN** a fleet whose effective state is not `docked` to the named
  feature (coasting, burning, or docked elsewhere) commits a mine run
- **THEN** the commit fails and no action is created

#### Scenario: A fleet parked near a body but not attached to it is rejected
- **WHEN** a fleet's resolved position coincides with or lies near a body —
  for example, a fleet freshly arrived via a lane jump and parked near the
  destination gate, per `fleet-movement`'s "Jump Arrival Parks Near the
  Destination Gate, Unmasked" — but its stored `attachedTo` does not name
  that body
- **THEN** the commit fails with the same not-docked rejection as any other
  non-docked state; positional proximity or apparent co-location never
  substitutes for the stored attachment string

#### Scenario: An unknown resource kind is rejected
- **WHEN** the run names a `kind` the target feature's resources do not
  include
- **THEN** the commit fails and no action is created

#### Scenario: A request over free hold is rejected at commit
- **WHEN** the requested `tons` exceeds the fleet's current free hold
- **THEN** the commit fails and no action is created

#### Scenario: A busy movement slot is rejected
- **WHEN** the fleet already holds a running action on the movement
  channel (`activeActionId` claimed)
- **THEN** the commit fails with the action spine's active-action conflict

#### Scenario: A fleet with no mining capability is rejected
- **WHEN** a fleet whose derived mining rate is zero (a roster with no
  mining-capable ship) commits a mine run
- **THEN** the commit fails and no action is created — a zero rate would
  yield an undefined (`+Inf`) ETA that would permanently hold the movement
  slot

#### Scenario: No scan is required to commit
- **WHEN** a fleet docked to a feature it has never scanned commits a mine
  run for a resource kind that feature actually carries
- **THEN** the commit succeeds — prospecting by scanning first is
  advantageous, never required

### Requirement: Ledger Key Is System-And-Kind-Qualified, Channel Scope Is Per-System
The system SHALL key a mine run's depletion ledger by a
Firestore-document-id-safe join of the **resolved** target feature's
system id, its feature id, and the run's resource kind (`${systemId}::
${featureId}::${kind}` — joined with `::`, never `/`, since Firestore
document ids cannot contain `/`), never by feature id alone (feature ids
are assigned per-system by the system-interior generator and are not
unique across the galaxy — every system with a belt has a feature
literally named `feat-belt-0`), never by system id and feature id alone
without the kind (a single feature may carry more than one resource kind —
see "One Resource Kind Per Run" — and folding two kinds' deltas into one
ledger would let extraction of one kind falsely deplete another's readable
remaining), and never by system id alone (two features in one system would
then share a ledger). The mine action's `scope` — the read-resolution
query key (`ResolveDue(systemId)`) and the SSE completion channel — SHALL
remain the containing `systemId` and SHALL NOT be set to the ledger key, so
a completed mine resolves on the same board read and broadcasts on the
same system channel as a burn or scan; the per-feature, per-kind
granularity lives only in the ledger key, decoupled from the action scope
(see the `action-dispatch` capability's "Ledger Key Decoupled From Channel
Scope").

#### Scenario: Identically-id'd features in different systems do not share a ledger
- **WHEN** two fleets each commit a mine run against a feature with the
  same feature id (e.g. `feat-belt-0`) but in two different systems
- **THEN** each run's delta is appended to, and its remaining tonnage is
  folded from, only that run's own system-and-kind-qualified ledger key —
  the other system's identically-id'd feature's ledger is neither read nor
  written

#### Scenario: Two features in one system keep separate ledgers
- **WHEN** two mine runs in one system target two different features
  (`feat-belt-0` and `feat-belt-1`)
- **THEN** each folds and appends to its own `${systemId}::${featureId}::
  ${kind}` ledger key, and depleting one does not reduce the other's
  remaining tonnage

#### Scenario: Two kinds on one feature deplete independently
- **WHEN** a feature carries both `metals` and `volatiles`, and a fleet
  mines `volatiles` from it
- **THEN** the folded remaining tonnage of `metals` on that same feature is
  unchanged, and a subsequent `metals` commit's already-depleted check and
  resolve-time clamp read only the `metals` ledger key, never the
  `volatiles` deltas

#### Scenario: A ledger key never contains a path separator
- **WHEN** a mine run's ledger key is constructed from a system id, a
  feature id, and a resource kind
- **THEN** the resulting key contains no `/` character, so it is a valid
  Firestore document id for the ledger's parent document

#### Scenario: A completed mine resolves and pushes on the system scope
- **WHEN** a mine run's ETA passes and the containing system's board is
  read or its channel is subscribed
- **THEN** the due mine is resolved by the system-scoped read
  (`ResolveDue(systemId)`) and its completion event is delivered on the
  system channel, the same as a burn or scan

### Requirement: Mine Commit Rejections Report a Distinguishable Reason
The system SHALL, for every commit-time rejection defined in this
capability (ownership, invalid or sub-minimum tonnage, not-docked to the
target, unknown resource kind, over-free-hold, no mining capability,
already-depleted lode, busy movement slot, and each
client-supplied-feature-id validation failure defined in "A
Client-Supplied Feature Id Is Validated Before Resolution"), include a
human-readable reason in the response body that distinguishes it from
every other rejection in this list — following the `gin.H{"error":
"<reason>"}` convention already established in `backend/fleet/handler.go`'s
`RoutePreview`/`Scan`/`Order` handlers — so a caller can present the player
a specific, actionable message rather than a generic failure. Every
rejection in this list SHALL surface as a 4xx response carrying that
reason in its body — never a bodiless 5xx, regardless of which check in
this capability fails. A busy-movement-slot rejection's reason SHALL
further name which kind of action currently holds the slot (burning, in
lane transit, or already mining), since mine sharing the movement channel
with burn and lane travel makes "busy" ambiguous between three materially
different player situations for the first time.

#### Scenario: Each commit rejection reason is distinguishable from the others
- **WHEN** any two different mine-commit preconditions fail on two separate
  requests (e.g. not-docked vs. unknown-kind)
- **THEN** the two responses' reason text differs, so a caller never has to
  guess which precondition failed from a shared generic message

#### Scenario: A busy-slot rejection names the occupying action kind
- **WHEN** a mine commit is rejected because the fleet's movement slot
  already holds a running burn, lane-transit, or mine action
- **THEN** the response's reason text names which of the three currently
  occupies the slot
