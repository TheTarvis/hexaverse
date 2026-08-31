## MODIFIED Requirements

### Requirement: A Docked Ship Is Masked and Registers Only As Its Host
The system SHALL treat any object docked or attached to a host — a body, a
station, another ship, or any other attachable entity — as masked: no live
disclosure channel SHALL disclose it, and the host SHALL be disclosed
exactly as it would be with nothing docked to it. No field of the host's
disclosure — including counts, aggregates, size, or signature — SHALL vary
with what is masked by it. A masked object is absent from the response
under the absence rule, not marked as hidden. Ships are the only
attachable entity this capability implements today; a body-attached mine
is masked by this same rule the instant a mine entity exists in the game,
with no second masking implementation to build for it — mines themselves,
and the combat they belong to, are deferred to a later change.

#### Scenario: A masked ship is not disclosed inside passive range
- **GIVEN** a foreign ship docked to a body, well inside the observer's
  passive proximity range
- **WHEN** live disclosure is evaluated
- **THEN** the ship is not disclosed
- **AND** the host body is disclosed as it normally would be

#### Scenario: The host's disclosure is identical either way
- **GIVEN** two otherwise identical hosts, one with ships masked by it and
  one with none
- **WHEN** each host is disclosed to the same observer at the same world
  time
- **THEN** the two disclosures are field-for-field identical

#### Scenario: A body-attached mine is masked like any other attached object
- **GIVEN** a mine entity attached to a body, well inside the observer's
  passive proximity range
- **WHEN** live disclosure is evaluated
- **THEN** the mine is not disclosed
- **AND** the host body is disclosed as it normally would be, exactly as
  it would be with a ship masked at it instead

### Requirement: Lighting a Drive Breaks Masking
The system SHALL treat a ship as unmasked from the moment its burn's
emission interval opens, so that departing a host is a detectable event,
and SHALL likewise treat a ship as unmasked for the full interval any
focused scan it is running is active, exactly as for emission. Masking
SHALL NOT hold simultaneously with emission, or with an active sweep, for
the same ship.

#### Scenario: Departure is visible
- **GIVEN** a ship masked at a host
- **WHEN** it commits a burn and the world time reaches its `departTime`
- **THEN** the ship is no longer masked
- **AND** it is disclosed to every observer its plume reaches

#### Scenario: Arrival re-masks on dock
- **GIVEN** a ship whose burn has resolved into a docked park at a host
- **WHEN** live disclosure is evaluated after that arrival
- **THEN** the ship is masked again

#### Scenario: A sweeping ship is unmasked for its sweep
- **GIVEN** a ship masked at a host
- **WHEN** it commits a focused scan and the world time reaches the scan's
  depart time
- **THEN** the ship is no longer masked for as long as the sweep is
  running

### Requirement: A Focused Scan Reveals the Ships Masked At Its Target
The system SHALL, when a focused scan resolves against a host, mint
sighting records for every ship masked at that host, including those
masked further down the chain, and SHALL mint a record attesting the sweep
even when the host is clean. A focused scan SHALL be evaluated only
against a host within the named focused-scan range of the scanning fleet,
and rejected otherwise. The scan's endpoint, commit-time channel claim,
ETA, pricing, and cancellation are the sensor-channel verb `focused-scan`
owns; this requirement governs only what the predicate reveals when a
sweep resolves against a host, and the range boundary it shares with
`focused-scan`'s own commit-time check.

This capability shipped self-contradictory about a clean sweep's stamp:
this requirement's own clean-sweep scenario said the resolution time,
while "A Scan-Minted Sighting Is a Stamped Historical Claim" said
pulse-reach. The clean-sweep scenario below is corrected here: every
scan-minted record, clean or not, is stamped `asOf` pulse-reach — the
exact timing `focused-scan`'s own resolution requirement defines — never
the resolution time.

#### Scenario: A focused scan finds a chained ship
- **GIVEN** a ship docked to a carrier, and that carrier docked to a body
- **WHEN** a focused scan resolves against that body
- **THEN** sighting records are minted for both the ship and the carrier

#### Scenario: A clean sweep is itself a record
- **GIVEN** a host with nothing masked at it
- **WHEN** a focused scan resolves against it
- **THEN** a sighting record attesting the clean sweep is minted, stamped
  `asOf` pulse-reach exactly as any other scan-minted record — never the
  resolution time

#### Scenario: A host beyond focused-scan range cannot be swept
- **WHEN** a focused scan is commanded against a host farther from the
  scanning fleet than the named focused-scan range
- **THEN** the command is rejected

## ADDED Requirements

### Requirement: An Active Sweep Emits For Its Duration
The system SHALL decide whether a ship is scanning at a requested world
time by the exact integer interval test over its stored sweep window —
`departTime <= T < arriveTime` — consulting no distance, exactly as
"Whether a Plume Exists Is an Exact Integer Test" decides emission, and
SHALL report scanning as a flag independent of emission: a ship may be
scanning without emitting, emitting without scanning, both, or neither.

#### Scenario: Scanning is on during the sweep's committed interval
- **GIVEN** a ship with a stored, running sweep window
- **WHEN** the world time is at or after the window's depart time and
  strictly before its arrive time
- **THEN** the ship is reported as scanning

#### Scenario: The sweep's arrive instant ends scanning
- **GIVEN** a ship whose stored sweep window has an arrive time equal to T
- **WHEN** scanning is evaluated at exactly T
- **THEN** the ship is not reported as scanning, the interval being
  half-open at its end

#### Scenario: A ship with no stored sweep window is never reported as scanning
- **GIVEN** a ship with no stored sweep window
- **WHEN** scanning is evaluated at any world time
- **THEN** the ship is not reported as scanning

### Requirement: A Sweep's Emission Radius Scales With Its Range
The system SHALL derive a scanning ship's emission radius as the greater
of a named floor and a named per-range factor times the commit-time
distance to its target host — both named constants, distinct from the
plume-radius constants — and SHALL report scanning through its own
`Contact.Scanning` flag, distinct from `Contact.Emitting`, since a
zero-velocity ship running a sweep has no drive output to report as
emission. A ship's detection radius to a given observer SHALL be the
observer's passive range plus the greater of its plume radius and its
sweep-emission radius, with the emission and scanning flags each reported
independently — a ship both burning and sweeping SHALL report both flags.

`disclosure/contact_test.go` asserts `Contact`'s field set by reflection;
adding `Scanning` to that field set is a deliberate edit to that test,
made in this change, and not a silent drift the test happened to permit.

#### Scenario: A closer sweep target yields a smaller emission radius than a farther one
- **GIVEN** two sweeps committed by the same ship against hosts at
  different distances at commit time
- **WHEN** each sweep's emission radius is derived
- **THEN** the sweep against the strictly farther host has an emission
  radius at least as large as the sweep against the nearer one, and
  strictly larger when neither is clamped to the named floor

#### Scenario: A sweep at zero range still emits at the named floor
- **GIVEN** a ship sweeping a host at its own position at commit time
- **WHEN** its emission radius is derived
- **THEN** the radius equals the named floor, not zero

#### Scenario: Scanning is reported on its own flag, not as emission
- **GIVEN** a parked ship, running a sweep, with no committed burn
- **WHEN** its `Contact` is projected
- **THEN** `Contact.Scanning` is true and `Contact.Emitting` is false

#### Scenario: A ship burning and sweeping reports both flags
- **GIVEN** a ship with both a running burn and a running sweep
- **WHEN** its `Contact` is projected
- **THEN** both `Contact.Emitting` and `Contact.Scanning` are true

#### Scenario: Detection radius combines passive range with the louder of plume or sweep emission
- **GIVEN** an observer with a passive range, and a target ship whose plume
  radius and sweep-emission radius differ
- **WHEN** the target's detection radius to that observer is derived
- **THEN** it equals the observer's passive range plus whichever of the
  plume radius and sweep-emission radius is greater

### Requirement: Disclosure to a Corporation Is the Union Over Its Own Assets
The system SHALL evaluate a corporation's disclosure of a system's foreign
presence as the union, across every one of that corporation's own fleets
present in the system, of what each fleet alone would disclose as an
observer — deduplicated by target before the result is returned, so that
a target disclosed to more than one of the corporation's own fleets
appears exactly once and no aggregate in the response varies with how many
of the corporation's own fleets can see it. A masked or docked fleet of
the requesting corporation's own SHALL still contribute as an observer to
this union; only a fleet in lane transit contributes nothing, having no
position to observe from.

#### Scenario: A target seen by only one of several own fleets is disclosed
- **GIVEN** a corporation with more than one fleet in a system, and a
  foreign target within only one of those fleets' detection range
- **WHEN** disclosure is evaluated for that corporation
- **THEN** the target is disclosed

#### Scenario: A target seen by more than one own fleet is disclosed exactly once
- **GIVEN** a corporation with two fleets in a system, each independently
  within detection range of the same foreign target
- **WHEN** disclosure is evaluated for that corporation
- **THEN** the target appears exactly once in the result, and no field of
  the result reveals that more than one of the corporation's own fleets
  can see it

#### Scenario: A masked, docked own fleet still observes
- **GIVEN** a corporation's own fleet masked and docked at a host, with a
  foreign target within that fleet's detection range
- **WHEN** disclosure is evaluated for that corporation
- **THEN** the target is disclosed, the observing fleet's own masked state
  notwithstanding

#### Scenario: A fleet in lane transit contributes no observation
- **GIVEN** a corporation with one fleet in lane transit and no other
  fleet in the destination system, and a foreign target that would be
  within detection range of the transiting fleet's last known position
- **WHEN** disclosure is evaluated for that corporation in that system
- **THEN** the target is not disclosed on the strength of the transiting
  fleet alone, which contributes no observation

### Requirement: A Disclosure-Computed Sighting Carries Its System
The system SHALL include the id of the system a sighting was computed in
on every `disclosure.Sighting` value the capability produces, since a bare
position is not resolvable to a place without the system it is in.

#### Scenario: A computed sighting names its system
- **WHEN** the capability computes a `disclosure.Sighting` value for a
  target
- **THEN** the value includes the id of the system the target was in at
  the moment it was computed
