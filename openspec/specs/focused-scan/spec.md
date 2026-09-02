# focused-scan Specification

## Purpose
TBD - created by archiving change replace-observation-with-sightings. Update Purpose after archive.
## Requirements
### Requirement: A Focused Sweep Commits On the Sensor Channel
The system SHALL commit a focused scan as an action of type `scan` claiming
the actor's sensor-channel slot, distinct from the movement-channel slot a
burn or lane transit claims, so that a fleet's sensor and movement commands
are independent single-slot claims rather than one shared channel. The
scan's `hostId` SHALL name either a body, or a fleet owned by the scanning
fleet's own corporation, present in the scanning fleet's own system at
commit time. A `hostId` naming a fleet owned by a **different** corporation
SHALL be rejected identically to a `hostId` that does not resolve at all —
same error, same response shape, no field distinguishing the two — because
a commit that succeeded against a foreign fleet id would itself disclose
that fleet's presence, range, and occlusion state, which
`proximity-disclosure`'s absence rule forbids for an undisclosed entity,
and because no surface in this model ever hands a client a foreign fleet's
id to name in the first place. A scan commit SHALL be rejected — creating
no action and claiming no sensor-channel slot — when the named `hostId`
does not resolve this way, or when the scanning fleet is itself in lane
transit at commit time.

#### Scenario: An unresolvable host is rejected
- **WHEN** a focused scan is commanded with a `hostId` that does not resolve
  to any body or own fleet in the scanning fleet's system
- **THEN** the commit is rejected with a named error, no scan action is
  created, and no sensor-channel slot is claimed

#### Scenario: A host outside the scanning fleet's system is rejected
- **GIVEN** a `hostId` naming a body or own fleet present in a different
  system than the scanning fleet's own
- **WHEN** a focused scan is commanded against it
- **THEN** the commit is rejected the same way, with no action created and
  no sensor-channel slot claimed

#### Scenario: A foreign fleet's id is rejected identically to an unresolvable one
- **GIVEN** a `hostId` naming a fleet owned by a different corporation than
  the scanning fleet's own
- **WHEN** a focused scan is commanded against it
- **THEN** the commit is rejected with the same named error and the same
  response shape as an unresolvable `hostId`

#### Scenario: A scanner in lane transit at commit is rejected
- **GIVEN** a fleet in lane transit
- **WHEN** it attempts to commit a focused scan
- **THEN** the commit is rejected the same way, with no action created and
  no sensor-channel slot claimed

#### Scenario: A burning fleet can commit a sweep
- **GIVEN** a fleet with a running action on its movement channel
- **WHEN** that fleet commits a focused scan
- **THEN** the scan commits successfully on the sensor channel
- **AND** the movement-channel action is unaffected

#### Scenario: A second sweep is rejected while one is running
- **GIVEN** a fleet with a running focused scan on its sensor channel
- **WHEN** that fleet commits a second focused scan
- **THEN** the commit is rejected and no second scan action is created

#### Scenario: A sweep does not cancel a running burn
- **GIVEN** a fleet with a running burn on its movement channel
- **WHEN** that fleet commits a focused scan
- **THEN** the burn continues running on the movement channel, uninterrupted
  by the scan's commit

### Requirement: Sweep Duration Scales With Range to the Target
The system SHALL price a focused scan's duration as a round trip over the
distance from the scanning fleet to the target host at commit time, using a
named base duration and a named signal speed, quantized upward to a whole
unit of world time, and SHALL freeze that duration — and therefore the
scan's ETA — at commit; the scanning fleet's motion after commit SHALL NOT
change an already-committed sweep's ETA. The committed sweep window SHALL
span the entire sweep: its depart time SHALL be the commit world time and
its arrive time SHALL be the committed ETA, so the emission interval, the
masking break, and the action's own lifetime are the same interval, and the
pulse-reach instant is their exact midpoint. No other depart time SHALL be
stored — in particular, a depart time set to anything short of the full
sweep's duration (for example, one millisecond before arrival) would leave
the scanner detectable for only a sliver of the sweep it is actually
running, silently reopening free gate interrogation.

#### Scenario: The committed window spans the entire sweep
- **GIVEN** a focused scan committed at world time `T0` with a duration `D`
- **WHEN** the fleet's stored sweep window is read
- **THEN** the window's depart time is `T0` and its arrive time is `T0 + D`
- **AND** that arrive time is exactly the action's own committed ETA

#### Scenario: A farther host costs a longer sweep
- **GIVEN** two hosts at different distances from the same scanning fleet
  at commit time
- **WHEN** a focused scan is committed against each in turn
- **THEN** the sweep against the strictly farther host has a duration at
  least as long as the sweep against the nearer one, and strictly longer
  when the distance is not clamped by the named base

#### Scenario: A sweep against a host at zero range still costs a positive duration
- **GIVEN** a scanning fleet parked at the same position as its target host
- **WHEN** a focused scan is committed against that host
- **THEN** the committed duration is still positive, bounded below by the
  named base

#### Scenario: The scanner's later motion does not change the committed ETA
- **GIVEN** a running focused scan committed against a host
- **WHEN** the scanning fleet's own position changes after commit (for
  example by drifting)
- **THEN** the scan's ETA remains what was frozen at commit

### Requirement: A Sweep Is Rejected Beyond Range or Behind the Star
The system SHALL reject a focused-scan commit, at commit time and against
live positions, when the target host is farther from the scanning fleet
than the named focused-scan range, or when the star occludes the sightline
between them — reusing `proximity-disclosure`'s own range and occlusion
predicates and their tie rules unchanged: the range boundary is inclusive
and the occlusion boundary is strict.

#### Scenario: A host beyond focused-scan range is rejected
- **WHEN** a focused scan is commanded against a host farther from the
  scanning fleet than the named focused-scan range
- **THEN** the commit is rejected and no scan action is created

#### Scenario: A host occluded by the star is rejected
- **WHEN** a focused scan is commanded against a host the star occludes
  from the scanning fleet at commit time
- **THEN** the commit is rejected and no scan action is created

#### Scenario: A host at exactly the named range is accepted
- **GIVEN** a target host whose squared distance from the scanning fleet is
  exactly equal to the squared focused-scan range
- **WHEN** a focused scan is commanded against it
- **THEN** the commit is accepted, the range boundary resolving toward
  disclosure

### Requirement: A Sweep Emits For Its Duration
**Ownership note**: the sweeping-flag interval test stated below is
`proximity-disclosure`'s own predicate ("An Active Sweep Emits For Its
Duration"), which is the canonical, authoritative statement of this rule.
It is restated here at the verb level because a reader of this capability
needs to know a sweep is detectable for its whole run; if the two ever
diverge, `proximity-disclosure`'s wording governs.

The system SHALL decide whether a fleet is sweeping at a requested world
time by the exact integer interval test over its stored sweep window —
`departTime <= T < arriveTime` — consulting no distance, and SHALL report
this as a distinct flag from whether the fleet is emitting a drive plume: a
parked, sweeping fleet reports sweeping without reporting plume emission,
and a fleet doing both reports both independently.

#### Scenario: A fleet is sweeping during its scan window
- **GIVEN** a fleet with a committed focused scan
- **WHEN** the world time is at or after the scan's depart time and
  strictly before its arrive time
- **THEN** the fleet is reported as sweeping

#### Scenario: Sweeping ends at the scan's arrival instant
- **GIVEN** a fleet whose focused scan has an arrive time equal to T
- **WHEN** sweeping is evaluated at exactly T
- **THEN** the fleet is not reported as sweeping

#### Scenario: A parked, sweeping fleet reports no plume emission from the sweep alone
- **GIVEN** a fleet parked with no committed burn, running a focused scan
- **WHEN** its emission and sweeping flags are each evaluated
- **THEN** it is reported as sweeping and not reported as emitting a plume

### Requirement: A Sweep Unmasks Its Scanner
**Ownership note**: this masking-break rule is `proximity-disclosure`'s own
predicate ("Lighting a Drive Breaks Masking", the sweep disjunct added
alongside emission), which is the canonical, authoritative statement of it.
It is restated here at the verb level for the same reason as the sibling
note above; if the two ever diverge, `proximity-disclosure`'s wording
governs.

The system SHALL treat a fleet as unmasked for the full interval its
focused scan is running, exactly as it is unmasked while emitting a drive
plume: masking and an active sweep SHALL NOT hold simultaneously for the
same fleet.

#### Scenario: Committing a sweep ends masking for its duration
- **GIVEN** a fleet masked at a host
- **WHEN** it commits a focused scan and the world time reaches the scan's
  depart time
- **THEN** the fleet is no longer masked for as long as the sweep is
  running

#### Scenario: Masking resumes once the sweep ends
- **GIVEN** a fleet that was unmasked for the duration of a focused scan
  while remaining docked at its host throughout
- **WHEN** the scan's arrive time passes
- **THEN** the fleet is masked again

### Requirement: A Sweep Resolves Into Sightings, Or Fizzles
The system SHALL, when a focused scan resolves, mint one sighting record
per ship masked at the target host — including ships masked further down
an attachment chain beneath it — or one clean-sweep record when nothing is
masked there. Every minted record's `asOf` SHALL be the world time the
pulse reached the target: the midpoint of the scan's depart and arrive
times, not the resolution time. Before minting, the system SHALL re-check
range and occlusion from the scanning fleet's folded position at that
pulse-reach instant, and SHALL fizzle — minting nothing at all, and
recording a reason code distinguishing "out of range at pulse-reach" from
"occluded at pulse-reach" — when that re-check fails. The system SHALL
likewise fizzle, minting nothing, when the scanning fleet has left the
target host's system or is in lane transit by pulse-reach, or when the
target host itself cannot be resolved in the scanning fleet's system at
pulse-reach — for a body host, because a degraded body-table build omitted
it (`system-body-table`'s "The Table Degrades to Fewer Bodies Rather Than
a Failed Build"); for an own-fleet host, because that fleet has since left
the system or entered lane transit. A fizzle for any of these reasons
SHALL still release the sensor-channel
slot at resolve, exactly as a successful mint does: an unresolvable host
SHALL NOT leave the resolve transaction returning an error on every
subsequent read, which would strand the slot claimed and the fleet
unable to commit a new scan.

#### Scenario: A resolving sweep mints sightings for the chain masked at its host
- **GIVEN** a ship docked to a carrier, and that carrier docked to the
  swept host
- **WHEN** the focused scan against that host resolves
- **THEN** a sighting record is minted for both the ship and the carrier

#### Scenario: A resolving sweep against an empty host mints a clean-sweep record
- **GIVEN** a host with nothing masked at it
- **WHEN** the focused scan against that host resolves
- **THEN** a single clean-sweep sighting record is minted for it

#### Scenario: A resolving sweep stamps its records at pulse-reach, not resolution time
- **GIVEN** a focused scan whose depart and arrive times are known
- **WHEN** it resolves and mints its sighting records
- **THEN** every minted record's `asOf` is the midpoint of the depart and
  arrive times, not the world time the resolve transaction actually ran

#### Scenario: A geometry failure at pulse-reach mints nothing
- **GIVEN** a running focused scan whose target host has become occluded
  by the star, or is now beyond focused-scan range, by the time its
  pulse-reach instant arrives
- **WHEN** the scan resolves
- **THEN** no sighting record is minted
- **AND** the resolved action carries a reason code identifying whether the
  failure was range or occlusion

#### Scenario: A scanning fleet that left the host's system mints nothing
- **GIVEN** a running focused scan whose scanning fleet is no longer in the
  target host's system by pulse-reach
- **WHEN** the scan resolves
- **THEN** no sighting record is minted

#### Scenario: A scanning fleet in lane transit at pulse-reach mints nothing
- **GIVEN** a running focused scan whose scanning fleet is in lane transit
  at the pulse-reach instant
- **WHEN** the scan resolves
- **THEN** no sighting record is minted

#### Scenario: An unresolvable body host mints nothing and releases the slot
- **GIVEN** a running focused scan whose target host is a body that cannot
  be resolved in the scanning fleet's system at pulse-reach — for example,
  a lane-gate body a degraded body-table build omits
  (`system-body-table`'s "The Table Degrades to Fewer Bodies Rather Than a
  Failed Build")
- **WHEN** the scan resolves
- **THEN** no sighting record is minted
- **AND** the resolved action carries a reason code identifying the host as
  unresolved
- **AND** the fleet's sensor-channel slot is released, exactly as it would
  be on a successful resolution

### Requirement: Cancelling a Sweep Releases the Slot, Mints Nothing, and Ends Emission
The system SHALL, on cancel of a running focused scan, release its claimed
sensor-channel slot, apply no resolver effect (no sighting record is
minted for a cancelled sweep), and end the fleet's sweeping flag at the
instant of cancellation rather than at the scan's original arrive time.
Cancellation of a running sweep is through `POST /v1/actions/:actionId/
cancel` naming the scan action's own id — the action-dispatch spine's
generic cancel surface, not a fleet-scoped one. `POST
/v1/fleets/:fleetId/cancel` releases only the fleet's movement-channel
slot (its running burn or lane-transit order, if any) and SHALL NOT affect
a running sweep on the sensor channel; the two channels are cancelled
independently, exactly as they are claimed independently.

#### Scenario: Cancelling a running sweep releases the sensor slot
- **WHEN** a running focused scan is cancelled via
  `POST /v1/actions/:actionId/cancel`
- **THEN** the fleet's sensor-channel slot is released
- **AND** the fleet may commit a new focused scan immediately after

#### Scenario: A cancelled sweep mints no sighting
- **WHEN** a running focused scan is cancelled before its arrive time
- **THEN** no sighting record, including a clean-sweep record, is minted
  for it

#### Scenario: Cancelling a sweep ends sweeping immediately
- **GIVEN** a fleet reported as sweeping under a running focused scan
- **WHEN** that scan is cancelled
- **THEN** the fleet is no longer reported as sweeping from that instant
  on, rather than continuing until the scan's original arrive time

#### Scenario: The fleet-level cancel endpoint never touches a running sweep
- **GIVEN** a fleet with a running movement-channel order and a running
  focused scan
- **WHEN** `POST /v1/fleets/:fleetId/cancel` is submitted
- **THEN** the movement-channel order is cancelled
- **AND** the running focused scan continues unaffected, releasable only
  through its own `POST /v1/actions/:actionId/cancel`

