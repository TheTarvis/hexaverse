# Hex Board View — Delta

## ADDED Requirements

### Requirement: Scan Bloom Renders at Commit
The system SHALL, on a successful scan response, play a short theatrical
radial bloom (client-clocked, roughly two seconds — a frontend theater
dial, not server pacing) centred on the acting fleet's hex at the commit
instant: an expanding echo front with per-feature blips popping
nearest-first as the front passes them, honoring the same line-of-sight
shadows as the mint. The bloom is pure theater — the reveal is already
minted server-side — and SHALL NOT gate, delay, or filter the refetched
data it plays over.

#### Scenario: A successful scan plays the bloom once
- **WHEN** a scan order succeeds
- **THEN** a radial bloom expands once from the fleet's hex, features
  blip nearest-first, and the effect ends on its own without further
  interaction

#### Scenario: The bloom never hides fresh data
- **WHEN** the post-scan refetch lands while the bloom is still playing
- **THEN** the refetched board state renders immediately; the bloom
  overlays it without masking or deferring it

### Requirement: Scan Command Availability
The system SHALL, when the scan command is invoked with an active fleet,
submit a scan order; the scan control SHALL be disabled only while a verb
request is in flight, and SHALL NOT be disabled because the fleet is
burning or because a previous scan just completed (scans are instant and
repeatable).

#### Scenario: Scan is available while burning
- **WHEN** the acting fleet's effective state is `burn`
- **THEN** the scan control remains enabled

#### Scenario: Scan re-enables as soon as the order round-trips
- **WHEN** a scan order's response arrives
- **THEN** the scan control is enabled again — no countdown, no cooldown

### Requirement: Contact Markers Render
The system SHALL render the viewing corporation's contact records for the
open system as minimal markers at their recorded hexes — distinguishing
nothing beyond position and age (no identity, no fleet detail) — with a
recency treatment (a fresh contact reads stronger than a stale one; the
fade window is a frontend theater dial).

#### Scenario: A heard ping shows where and roughly when
- **WHEN** the viewing corporation holds an `emission` contact in the
  open system
- **THEN** a marker renders at the contact's hex conveying how recent it
  is, with no identity shown

## REMOVED Requirements

### Requirement: Running Scan Renders From Its Pinned Emission Hex
**Reason**: There is no running scan to render — the scan mints at commit
and the 15s committed sweep (pinned origin, stop-at-ETA) no longer
exists.
**Migration**: Replaced by ADDED "Scan Bloom Renders at Commit" — a
short client-side bloom at the commit hex, anchored where the ship fired
from (the ship cannot meaningfully leave that hex within the bloom).

### Requirement: Scan Commit and Single-Slot Gating
**Reason**: The sensor channel is retired; there is no unexpired-ETA
state to gate on and no countdown to show.
**Migration**: Replaced by ADDED "Scan Command Availability" —
in-flight-request gating only.

## MODIFIED Requirements

### Requirement: Realtime Refetch Rules While the Board Is Open
The system SHALL keep the open board's interior and fleet reads current
via three independent mechanisms: (1) a self-scheduled refetch shortly
after the soonest known future ETA among the requester's own fleets'
arrivals and the running mine's ETA, (2) a live subscription to the
system's event channel that refetches on a completion event and again on
reconnect after a drop, and (3) a steady periodic poll. A successful scan
SHALL refetch the board's interior and fleet reads immediately (its
reveal is already minted); no poll tightening or scan-ETA scheduling
exists.

#### Scenario: An own fleet's arrival self-schedules a refetch
- **WHEN** an own fleet in the system has a burn with a known arrival
  time
- **THEN** a refetch is scheduled to fire shortly after that arrival time

#### Scenario: A running mine self-schedules a refetch at its ETA
- **WHEN** the acting fleet has a running mine with a known ETA
- **THEN** a refetch is scheduled to fire shortly after that ETA, so the
  resolved cargo and freed movement channel land without user action

#### Scenario: A missed event on reconnect triggers a resync
- **WHEN** the system channel's live connection drops and later
  reconnects
- **THEN** a refetch fires on reconnect to resync any missed completions

#### Scenario: A successful scan refetches immediately
- **WHEN** the acting fleet's scan order succeeds
- **THEN** the board's interior and fleet queries refetch at once, with
  no waiting on a poll tick or scheduled ETA
