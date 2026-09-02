## MODIFIED Requirements

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
action-dispatch endpoint's ownership check, widened by this change to
cover the station-keeping `hold` and `release` verbs: a request naming an
id owned by a different corporation is rejected `404 Not Found` rather than
acted on.

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
  (`POST /v1/fleets/:fleetId/orders|cancel|cut-drive|stop|jump|scan|hold|release`)
  or a generic action endpoint (`GET /v1/actions?actor=`,
  `GET /v1/actions/:actionId`, `POST /v1/actions/:actionId/acknowledge`,
  `POST /v1/actions/:actionId/cancel`) naming an id owned by a different
  corporation
- **THEN** the request is rejected `404 Not Found` — `common.ActorCorp` is
  compared against the named id's owning corporation before the handler
  acts, closing the gap the seam's predecessor scenario recorded as open
