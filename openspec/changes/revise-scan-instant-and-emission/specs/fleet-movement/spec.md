# Fleet Movement — Delta

## MODIFIED Requirements

### Requirement: Single Movement-State Fleet Record
The system SHALL represent each fleet as one document carrying exactly one
movement-state shape at a time (coast, burn, docked, lane transit, or lane
hold — see `board-tactical-math`), a `corporationId`, its current
`systemId`, and at most one active action id — `activeActionId`, the
movement channel. There is no sensor channel: scanning is a synchronous
verb that claims no slot. A stored `activeScanId` from before this change
is ignored on read and dropped on the fleet's next write.

#### Scenario: A scan during a burn claims nothing
- **WHEN** a fleet has an active burn and is ordered to scan
- **THEN** the scan completes synchronously, `activeActionId` (the burn)
  is untouched, and no second action id is recorded on the fleet

### Requirement: Sensor Scan Order
The system SHALL, on a scan order from the fleet's owning corporation,
validate board presence, then mint the 360° sweep synchronously through
the observation capability from the fleet's live board position at that
instant — no action commit, no ETA, no running state — and return the
fleet. Consecutive scans are permitted back-to-back; there is no slot to
conflict on.

#### Scenario: Scan is rejected with no board presence
- **WHEN** a fleet whose effective state is `laneHold`, or `laneTransit`
  past its departure gate, is ordered to scan
- **THEN** the order fails with `ErrNotOnBoard` and nothing is minted

#### Scenario: A mid-burn scan emits from the live position
- **WHEN** a mid-burn fleet is ordered to scan
- **THEN** the sweep is minted from the fleet's board position at that
  instant, and the burn continues unaffected

#### Scenario: Back-to-back scans both mint
- **WHEN** a fleet is ordered to scan twice in quick succession
- **THEN** both orders succeed and each mints from the fleet's position
  at its own commit instant

## REMOVED Requirements

### Requirement: Command Endpoints Enforce No Fleet Ownership
**Reason**: This documented the retrofit report's suspected authorization
defect as observable behavior. The scan emission cost turns it from a
latent defect into a live griefing vector (ping someone else's fleet to
light it up system-wide), so the defect is fixed rather than carried.
**Migration**: Replaced by ADDED "Command Endpoints Enforce Fleet
Ownership" — all three mutating fleet endpoints now verify ownership and
reject foreign callers with `403`.

## ADDED Requirements

### Requirement: Command Endpoints Enforce Fleet Ownership
The system SHALL, on `POST /v1/fleets/:fleetId/orders`,
`POST /v1/fleets/:fleetId/cancel`, and `POST /v1/fleets/:fleetId/scan`,
resolve the requester's corporation and reject the request with `403
Forbidden` when the fleet's `corporationId` does not match it, before any
state change or mint occurs.

#### Scenario: A foreign corp cannot order another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/orders` with a valid target
- **THEN** the response is `403` and F's movement state is unchanged

#### Scenario: A foreign corp cannot cancel another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/cancel`
- **THEN** the response is `403` and F's active order is untouched

#### Scenario: A foreign corp cannot force another corp's fleet to ping
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/scan`
- **THEN** the response is `403` and no reveal or contact is minted
