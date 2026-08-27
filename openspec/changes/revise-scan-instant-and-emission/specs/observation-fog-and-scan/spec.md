# Observation Fog and Scan — Delta

## ADDED Requirements

### Requirement: Scan Mints the Reveal at Commit
The system SHALL, when a scan order is accepted, mint the sweep
synchronously at the commit instant from the fleet's live board hex: a
board-tier feature observation (geometry always; scanned
composition/threat detail) for every feature in the system with clear
line of sight from that hex (occluders evaluated at the commit instant),
chart every lane incident to the system as `scanned`, and rumor each such
lane's far-endpoint system to at least `rumored` (never downgrading,
never granting `surveyed`, and never granting any graph tier to the
scanned system itself from a scan). There is no running state, no ETA,
and no deferred resolve.

#### Scenario: Only line-of-sight-clear features are minted
- **WHEN** a scan commits
- **THEN** every feature with clear line of sight from the fleet's hex at
  the commit instant is minted with its geometry and composition, and
  features in shadow are not minted

#### Scenario: Every incident lane is charted regardless of occlusion
- **WHEN** a scan commits on a system with lanes
- **THEN** every lane incident to that system is charted `via: scanned`,
  and lanes whose far endpoint is below `rumored` are upgraded to
  `rumored` — lane detection is never occluded by line of sight

#### Scenario: A scan grants no graph tier to its own system
- **WHEN** a scan commits
- **THEN** the scanned system's own graph tier for the requester is
  unchanged by the scan (only feature/lane/contact records are minted)

#### Scenario: A mid-burn scan emits from the live position
- **WHEN** a mid-burn fleet's scan commits
- **THEN** the sweep is evaluated from the fleet's board position at the
  commit instant, and the burn is unaffected

### Requirement: Scan Emission Contact
The system SHALL, when a scan commits, mint an `emission` contact record —
system id, the scanning fleet's hex, the commit world-time, and no
identity or fleet detail — for every OTHER corporation that has at least
one fleet with board presence in that system at the commit instant.
Emission contacts SHALL NOT be line-of-sight filtered (a ping is heard
system-wide), and the scanning corporation SHALL NOT receive a contact
for its own ping.

#### Scenario: Every other corp present hears the ping
- **WHEN** corporation A scans in a system where corporation B has a
  fleet on the board
- **THEN** B gains an `emission` contact carrying the system id, A's
  fleet's hex at commit, and the commit time — with no corporation or
  fleet identity

#### Scenario: An occluded listener still hears the ping
- **WHEN** the scanning fleet is behind an occluding feature relative to
  another corp's fleet at commit time
- **THEN** that corp still gains the `emission` contact (hearing is not
  line-of-sight filtered)

#### Scenario: A corp with no board presence hears nothing
- **WHEN** a corporation has no fleet with board presence in the scanned
  system at commit time
- **THEN** no contact is minted for it

### Requirement: Ping Sightings of Foreign Fleets
The system SHALL, when a scan commits, mint a `sighted` contact record for
the SCANNING corporation — system id, the sighted fleet's hex, the commit
world-time, no identity — for every foreign fleet with board presence in
the system that has clear line of sight from the scanning fleet's hex at
the commit instant (occluded fleets are not sighted — hiding behind a
body defeats the ping).

#### Scenario: A ping sights a foreign fleet in the open
- **WHEN** corporation A scans while corporation B's fleet sits
  line-of-sight clear on the same board
- **THEN** A gains a `sighted` contact at B's fleet's hex with the commit
  time, and no identity

#### Scenario: A fleet behind a planet is not sighted
- **WHEN** a foreign fleet lies behind an occluding feature relative to
  the scanning fleet at commit time
- **THEN** no `sighted` contact is minted for it

### Requirement: Contact Records Are Append-Only Memory
The system SHALL store contact records (`emission` and `sighted`) as
append-only per-corporation memory — never updated, never spoiled by
later world changes — and SHALL expose, for a corporation and system, the
contacts it holds there so board reads can project them.

#### Scenario: Contacts accumulate rather than replace
- **WHEN** a corporation holds a contact in a system and a later ping
  mints another
- **THEN** both records exist, each with its own hex and world-time

## REMOVED Requirements

### Requirement: Running Scan Echo Disc
**Reason**: Scan is instant — there is no running scan, so no growing
echo disc contributes to live coverage. Live sensor coverage is ambient
bubbles only.
**Migration**: The disc's two jobs are re-homed: foreign-fleet detection
by a ping becomes stored `sighted` contacts (see ADDED "Ping Sightings of
Foreign Fleets"); the visual front becomes the client-side commit-time
bloom (`board-view`).

### Requirement: Scan Resolution Mints the Reveal
**Reason**: There is no resolution step — the scan left the action spine
and mints synchronously at commit. The fizzle path (fleet left the origin
system before eta) and the frozen-`asOf`-eta semantics are meaningless
with no window between commit and mint.
**Migration**: Replaced by ADDED "Scan Mints the Reveal at Commit", which
preserves the sweep's mint semantics (LOS-filtered features, all incident
lanes, far-endpoint rumors, no graph tier) verbatim minus the deferral.

## MODIFIED Requirements

### Requirement: Fleet Audience Visibility
The system SHALL report a fleet visible to a requester if it belongs to
the requester's own corporation (always, unconditionally), or if it lies
inside the requester's live sensor coverage — the union of its ambient
bubbles — in its current system.

#### Scenario: A requester's own fleet is always visible
- **WHEN** fleet visibility is checked for a fleet owned by the
  requesting corporation
- **THEN** it is reported visible regardless of sensor coverage

#### Scenario: A foreign fleet outside coverage is not visible
- **WHEN** fleet visibility is checked for a fleet owned by another
  corporation, sitting outside the requester's ambient sensor coverage in
  its system
- **THEN** it is reported not visible (a past `sighted` contact does not
  make the live fleet visible)
