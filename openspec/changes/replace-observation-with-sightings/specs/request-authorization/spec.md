## REMOVED Requirements

### Requirement: Corporation Resolution Seam
**Reason**: Superseded — this requirement's own *The seam is not yet
consumed by mutating endpoints* scenario asserted, as current fact, that a
mutating fleet or action endpoint on an id owned by a different corporation
"currently succeeds." `replace-observation-with-sightings` closes exactly
that authorization defect on both doors it is reachable through
(`fleet-movement`'s "Fleet Command Endpoints Are Restricted to the Owning
Corporation" and `action-dispatch`'s "Action Endpoints Are Restricted to
the Owning Corporation"), so that scenario is no longer true the instant
this change lands, and this capability carried no delta of its own to say
so. Restated below under a name that states the seam is now consumed by
those checks too, with the four scenarios describing the resolution
mechanism itself carried forward unchanged.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

## MODIFIED Requirements

### Requirement: The Sell Endpoint Ignores a Client-Supplied Corporation Id
`POST /v1/fleets/:fleetId/sell` (`goods-sale`'s sale endpoint, the one
credit-mutating route this change adds) SHALL resolve its acting
corporation exclusively via `common.ActorCorp` (this capability's
"Corporation Resolution Seam Is Consumed By Ownership Checks"). If the
request body carries a `corporationId` (or equivalently-named) field, it
SHALL be ignored — never read, never compared, never substituted for the
resolved value — so a client cannot direct proceeds to, or act as, a
corporation other than the one its own bearer token resolves to. (The
broader design intent — that this pattern extends to any future
corporation-scoped route this game adds — is a stated design constraint,
recorded in design.md, rather than a second, independently unfalsifiable
universal restated here.)

#### Scenario: A client-supplied corporation id in the sale body has no effect
- **WHEN** a sale request body includes a `corporationId` field naming a
  corporation other than the requester's own resolved corporation
- **THEN** the sale settles (or is rejected) exactly as it would with that
  field entirely absent — the named corporation is never credited, and the
  requester's own resolved corporation is the only one affected

## ADDED Requirements

### Requirement: Corporation Resolution Seam Is Consumed By Ownership Checks
The system SHALL, once per authenticated request with a resolved account
id, resolve the account's living corporation (if any) and make it
available to downstream handlers via a single accessor, `common.ActorCorp`
(reading the one `common.CorpIdKey` context key), SHALL leave it unset for
a corpless account rather than rejecting the request, and SHALL fail open
(continue corpless, logging a warning) if resolution itself errors, never
leaking a prior request's or another corporation's identity. This seam is
consumed both by every fog-filtered GET read and, since
`replace-observation-with-sightings`, by every mutating fleet-movement and
action-dispatch endpoint's ownership check: a request naming an id owned by
a different corporation is rejected `404 Not Found` rather than acted on.

#### Scenario: A corpless request carries no corporation id
- **WHEN** an authenticated account with no living corporation makes a
  request
- **THEN** `common.ActorCorp` is unset, and the request proceeds — this is
  the expected state before spawn, not an error

#### Scenario: A spawned account's corporation is resolved
- **WHEN** an authenticated account with a living corporation makes a
  request
- **THEN** `common.ActorCorp` is set to that corporation's id

#### Scenario: A resolution error fails open, not closed
- **WHEN** the corporation-resolution lookup itself errors
- **THEN** the request proceeds with no corporation id set (fail-open to
  the corpless baseline), rather than rejecting the request

#### Scenario: A resolution failure is indistinguishable from genuine corplessness to the player (gap, not an endorsement)
- **WHEN** the corporation-resolution lookup errors for an already-spawned,
  actively-playing account, and a fog-filtered read (galaxy, system, or
  fleet) proceeds corpless per the fail-open behavior above
- **THEN** the read still returns `200` with corpless-baseline (heavily
  fogged) content — indistinguishable, to the player, from having no assets
  in view — because no consuming capability today renders a distinct
  "your view may be stale/degraded" state for this case, so a transient
  resolution error can read to the player as their fleets or colony having
  vanished

#### Scenario: Mutating fleet and action endpoints now enforce ownership
- **WHEN** an authenticated caller invokes a mutating fleet endpoint
  (`POST /v1/fleets/:fleetId/orders|cancel|cut-drive|stop|jump|scan`) or a
  generic action endpoint (`GET /v1/actions?actor=`,
  `GET /v1/actions/:actionId`, `POST /v1/actions/:actionId/acknowledge`,
  `POST /v1/actions/:actionId/cancel`) naming an id owned by a different
  corporation
- **THEN** the request is rejected `404 Not Found` — `common.ActorCorp` is
  compared against the named id's owning corporation before the handler
  acts, closing the gap the seam's predecessor scenario recorded as open
  (see `fleet-movement`'s "Fleet Command Endpoints Are Restricted to the
  Owning Corporation" and `action-dispatch`'s "Action Endpoints Are
  Restricted to the Owning Corporation")
