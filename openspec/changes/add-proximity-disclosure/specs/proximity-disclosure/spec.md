## ADDED Requirements

### Requirement: Live Disclosure Is Recomputed, Never Persisted
The system SHALL decide every *live* disclosure — passive proximity and
plume detection — by evaluating a predicate over live positions at the
requested world time, and SHALL NOT store, accumulate, or carry forward that
result. No stored record SHALL influence a live disclosure decision: there
is no monotonic knowledge ladder, no per-feature memory, and no "once seen,
always known" state on this path. A live disclosure decision is a pure
function of (requester, world time, live positions, burn intervals, engine
and drive parameters).

Scan-minted sighting records are a separate, deliberately persisted artifact
governed by their own requirement below; they are a historical claim about
the past and are never consulted to decide live disclosure.

#### Scenario: A target that leaves coverage stops being disclosed
- **GIVEN** a foreign fleet inside the requester's proximity range at time T
- **WHEN** the same fleet is outside that range at a later time T'
- **THEN** it is not disclosed at T'
- **AND** its earlier disclosure at T does not make it disclosed at T'

#### Scenario: Live disclosure writes no record
- **WHEN** a passive-proximity or plume disclosure decision resolves to
  disclosed
- **THEN** no document, field, or in-memory cache recording that disclosure
  is written
- **AND** the decision is reached again from live state on the next read

#### Scenario: A stored sighting does not make a target live-disclosed
- **GIVEN** a corporation holding a scan-minted sighting record for a target
- **WHEN** that target is outside every live detection radius at the
  requested world time
- **THEN** the target is not live-disclosed
- **AND** the sighting record remains readable as a historical claim

#### Scenario: The same query at the same world time is stable
- **WHEN** the same requester evaluates the same target at the same world
  time twice, through independently constructed calls
- **THEN** both evaluations return the same disclosure result

### Requirement: Proximity Comparisons Are Squared, Never Rooted
The system SHALL express every proximity predicate as a comparison of
squared distance against squared range, and SHALL NOT compute a square root
anywhere on a disclosure path. Squaring keeps the comparison inside the
capability's guarded-product arithmetic and removes an operation whose
result is never otherwise needed, since only the ordering is consumed.

#### Scenario: Disclosure at a radius matches the squared comparison
- **GIVEN** a requester with proximity range R and a target at distance d
- **WHEN** the disclosure predicate is evaluated
- **THEN** the result equals the result of comparing d*d against R*R

#### Scenario: No square root reaches a disclosure decision
- **WHEN** the determinism check scans this capability's disclosure paths
- **THEN** no `sqrt` call site is found outside a colocated pragma
- **AND** the check fails the build if one is introduced

### Requirement: Every Exact Boundary Resolves Toward Disclosure
The system SHALL resolve every exact-equality boundary in this capability in
favour of disclosing the target. For a range test, whose polarity is
"nearer discloses", that means the comparison is inclusive (`<=`) and the
disclosed set is closed at its boundary. For an occlusion test, whose
polarity is inverted — blocking hides — that means the comparison is strict
(`<`), so a sightline exactly tangent to an occluder is clear. Each tie rule
SHALL be stated at its predicate rather than left to the comparison
operator's incidental choice, so that a later reimplementation cannot
silently invert it or apply one polarity's operator to the other's test.

#### Scenario: Squared distance exactly equal to squared range discloses
- **GIVEN** a target whose squared distance from the requester is exactly
  equal to the squared proximity range
- **WHEN** the disclosure predicate is evaluated
- **THEN** the target is disclosed

#### Scenario: One representable step beyond range does not disclose
- **GIVEN** a target whose squared distance is the next representable
  floating-point value above the squared proximity range
- **WHEN** the disclosure predicate is evaluated
- **THEN** the target is not disclosed

### Requirement: Every Disclosure Predicate Reads Position Through the Canonical Path
The system SHALL obtain every position used in a disclosure predicate from
the kinematics capability's single position entry point, and SHALL NOT
recompute, cache, round, or otherwise re-derive a position on a disclosure
path. Two disclosure decisions about the same entity at the same world time
SHALL therefore rest on bit-identical positions regardless of which call
path reached them.

#### Scenario: Two call paths agree bit-for-bit
- **GIVEN** an entity whose position at world time T is reachable both
  directly and through an effective-state fold
- **WHEN** a position is obtained by each route
- **THEN** the two positions are bit-identical in every component

#### Scenario: A disclosure path does not round a position
- **WHEN** the determinism check scans this capability's disclosure paths
- **THEN** no rounding, truncation, or quantization of a position component
  is found on a disclosure path

### Requirement: Whether a Plume Exists Is an Exact Integer Test
The system SHALL decide whether a fleet is emitting a plume at the requested
world time solely by the integer comparison
`departTime <= T < arriveTime` over `common.WorldMillis` values, half-open
at its end so that arrival is the instant emission stops. This test SHALL
NOT consult any distance, range, or occlusion value, and is therefore exact
by construction with no floating-point boundary. Whether an existing plume
*reaches* a given observer is a separate, geometric question governed by the
plume-radius requirement.

#### Scenario: Emission is on during the burn interval
- **GIVEN** a fleet with a committed burn
- **WHEN** the world time is at or after `departTime` and strictly before
  `arriveTime`
- **THEN** the fleet is emitting

#### Scenario: The arrival instant ends the emission
- **GIVEN** a fleet whose burn has `arriveTime` equal to T
- **WHEN** emission is evaluated at exactly T
- **THEN** the fleet is not emitting, the interval being half-open at its end

#### Scenario: A parked fleet never emits
- **GIVEN** a fleet in any parked mode with no committed burn
- **WHEN** emission is evaluated at any world time
- **THEN** the fleet is not emitting

### Requirement: Plume Radius Derives From Drive Output and Is Floored
The system SHALL derive an emitting fleet's plume radius from the aggregate
drive output of its hulls and the burn's commanded acceleration — both
stored values, read directly rather than re-derived from motion — and SHALL
clamp that radius to a named floor so that igniting a drive is always a
detectable event regardless of how gently the burn was commanded. Because
drive output aggregates across hulls, a larger fleet is louder than a
smaller one burning identically; this is the intended coarse size signal and
is the reason silent running has value. A fleet SHALL be disclosed to an
observer when it is emitting and the squared distance between them is within
the squared sum of the observer's passive range and the emitter's plume
radius, evaluated under the squared, inclusive, canonical-path rules that
govern every predicate in this capability.

#### Scenario: A burning fleet is disclosed beyond passive range
- **GIVEN** a foreign fleet outside the observer's passive proximity range
- **WHEN** that fleet is emitting and lies within the combined passive-plus-
  plume radius
- **THEN** the fleet is disclosed

#### Scenario: Reducing commanded acceleration shrinks the signature
- **GIVEN** two burns by identical hulls over the same path, one commanded
  at a lower acceleration than the other
- **WHEN** each fleet's plume radius is derived
- **THEN** the lower-acceleration burn yields the strictly smaller radius,
  unless both are clamped to the floor

#### Scenario: The floor makes ignition an event
- **GIVEN** a burn commanded at the minimum permitted acceleration
- **WHEN** its plume radius is derived
- **THEN** the radius is not less than the named plume floor
- **AND** that floor exceeds the default passive proximity range

#### Scenario: A larger fleet is louder at equal acceleration
- **GIVEN** two fleets burning at the same commanded acceleration, one with
  strictly greater aggregate drive output than the other
- **WHEN** each plume radius is derived
- **THEN** the greater aggregate drive output yields the strictly larger
  radius

### Requirement: A Fleet In Lane Transit Is Disclosed By No Channel
The system SHALL disclose a fleet in lane transit to no requester by any
channel: it is absent from the origin system, absent from the destination
system, and cannot be minted into a sighting record by any scan. It becomes
disclosable again only when its transit resolves. A fleet's own corporation
SHALL still see it, as it sees its own fleets unconditionally.

#### Scenario: A transiting fleet is absent from both endpoints
- **GIVEN** a foreign fleet in lane transit between two systems
- **WHEN** live disclosure is evaluated for observers in the origin system
  and in the destination system
- **THEN** the fleet is disclosed to neither

#### Scenario: A scan cannot mint a transiting fleet
- **WHEN** a scan resolves in either endpoint system while a foreign fleet
  is in transit on a lane touching it
- **THEN** no sighting record is minted for that fleet

#### Scenario: Arrival ends the immunity
- **GIVEN** a fleet whose lane transit has resolved at the destination gate
- **WHEN** live disclosure is evaluated for an observer within passive range
  of that gate
- **THEN** the fleet is disclosed

### Requirement: The Star Occludes Both Live Channels and the Focused Scan
The system SHALL treat the system's star, and only the star, as an occluder
of live disclosure. A fleet SHALL NOT be disclosed to an observer — by
passive proximity or by its plume, however loud — when the segment between
the two intersects the star's sphere at the requested world time. A focused
scan SHALL likewise be rejected when its target is occluded from the
scanning fleet. Planets, moons, stations, and ships SHALL NOT occlude.

The test SHALL be performed against squared quantities with no square root:
the closest point on the observer-to-target segment is taken with the
segment parameter clamped to the segment, and occlusion holds when the
squared distance from the star's centre to that point is strictly less than
the square of the star's size. A zero-length segment — observer and target
coincident — SHALL NOT be treated as occluded, and SHALL NOT divide by the
segment's zero squared length.

#### Scenario: A fleet directly behind the star is not disclosed
- **GIVEN** a foreign fleet well inside the observer's passive range
- **WHEN** the star lies between the observer and that fleet
- **THEN** the fleet is not disclosed

#### Scenario: Occlusion hides a plume too
- **GIVEN** a foreign fleet emitting with a plume radius that would
  otherwise reach the observer
- **WHEN** the star lies between the observer and that fleet
- **THEN** the fleet is not disclosed

#### Scenario: A tangent sightline is clear
- **GIVEN** an observer and a target whose segment passes at a squared
  distance from the star's centre exactly equal to the square of the star's
  size
- **WHEN** disclosure is evaluated
- **THEN** the sightline is not occluded, the boundary resolving toward
  disclosure

#### Scenario: A body beside the sightline does not occlude
- **GIVEN** a planet, moon, or station intersecting the segment between an
  observer and an in-range target
- **WHEN** disclosure is evaluated
- **THEN** the target is disclosed, only the star being an occluder

#### Scenario: The star does not block past the endpoints
- **GIVEN** an observer and an in-range target on the same side of the star,
  with the star beyond the target along the extended line
- **WHEN** disclosure is evaluated
- **THEN** the target is disclosed, the closest approach being clamped to
  the segment

#### Scenario: A focused scan cannot reach an occluded target
- **WHEN** a focused scan is commanded against a host occluded from the
  scanning fleet by the star
- **THEN** the command is rejected

#### Scenario: Coincident observer and target is not occluded
- **WHEN** disclosure is evaluated for an observer and target at the same
  position
- **THEN** the target is not occluded
- **AND** no division by the segment's zero squared length occurs

### Requirement: A Docked Ship Is Masked and Registers Only As Its Host
The system SHALL treat a ship docked or attached to a host — a body, a
station, or another ship — as masked: no live disclosure channel SHALL
disclose it, and the host SHALL be disclosed exactly as it would be with
nothing docked to it. No field of the host's disclosure — including counts,
aggregates, size, or signature — SHALL vary with what is masked by it. A
masked ship is absent from the response under the absence rule, not marked
as hidden.

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

### Requirement: Masking Chains Through Its Host to the Outermost Host
The system SHALL resolve a masking chain transitively: a ship attached to a
host that is itself masked SHALL register as that chain's outermost host.
Attachment SHALL NOT form a cycle, and the resolver SHALL treat a cycle as a
data error rather than looping.

#### Scenario: A ship docked to a carrier at a body registers as the body
- **GIVEN** a ship docked to a carrier, and that carrier docked to a body
- **WHEN** live disclosure is evaluated for an observer in range
- **THEN** neither the ship nor the carrier is disclosed
- **AND** the body is disclosed as it normally would be

#### Scenario: An attachment cycle is a data error
- **WHEN** resolving a masking chain encounters a cycle
- **THEN** resolution fails with an error rather than looping or returning a
  partial chain

### Requirement: Lighting a Drive Breaks Masking
The system SHALL treat a ship as unmasked from the moment its burn's
emission interval opens, so that departing a host is a detectable event.
Masking and emission SHALL NOT hold simultaneously for the same ship.

#### Scenario: Departure is visible
- **GIVEN** a ship masked at a host
- **WHEN** it commits a burn and the world time reaches its `departTime`
- **THEN** the ship is no longer masked
- **AND** it is disclosed to every observer its plume reaches

#### Scenario: Arrival re-masks on dock
- **GIVEN** a ship whose burn has resolved into a docked park at a host
- **WHEN** live disclosure is evaluated after that arrival
- **THEN** the ship is masked again

### Requirement: A Focused Scan Reveals the Ships Masked At Its Target
The system SHALL, when a focused scan resolves against a host, mint sighting
records for every ship masked at that host, including those masked further
down the chain, and SHALL mint a record attesting the sweep even when the
host is clean. A focused scan SHALL be permitted only against a host within
the named focused-scan range of the scanning fleet.

#### Scenario: A focused scan finds a chained ship
- **GIVEN** a ship docked to a carrier, and that carrier docked to a body
- **WHEN** a focused scan resolves against that body
- **THEN** sighting records are minted for both the ship and the carrier

#### Scenario: A clean sweep is itself a record
- **GIVEN** a host with nothing masked at it
- **WHEN** a focused scan resolves against it
- **THEN** a sighting record attesting the clean sweep is minted, stamped
  `asOf` the resolution time

#### Scenario: A host beyond focused-scan range cannot be swept
- **WHEN** a focused scan is commanded against a host farther from the
  scanning fleet than the named focused-scan range
- **THEN** the command is rejected

### Requirement: A Scan Resolves Composition That a Live Contact Withholds
The system SHALL include, in a scan-minted sighting record, the sighted
fleet's hull count and the hull types present, stamped `asOf` the sighting
like every other field. A live contact — passive or plume — SHALL NOT carry
hull count, hull types, or any field from which either could be derived; it
reports position, velocity, and whether the fleet is emitting, and nothing
further. Neither a live contact nor a sighting record SHALL name the owning
corporation.

#### Scenario: A live contact withholds composition
- **WHEN** a fleet is disclosed by passive proximity or by its plume
- **THEN** the contact carries position, velocity, and emitting state
- **AND** it carries no hull count, hull type, or owner field

#### Scenario: A scan resolves hull count and types
- **WHEN** a scan resolves against a fleet of known composition
- **THEN** the minted sighting record reports its hull count and the hull
  types present

#### Scenario: Composition is frozen at the sighting's stamp
- **GIVEN** a sighting record minted when a fleet had a given composition
- **WHEN** that fleet later loses or gains hulls
- **THEN** the record still reports the composition it was minted with

### Requirement: A Scan-Minted Sighting Is a Stamped Historical Claim
The system SHALL, when a scan resolves, mint sighting records stamped `asOf`
the world time the pulse reached each target, and SHALL treat those records
as immutable historical claims rather than live truth. A sighting record
SHALL NOT be updated, invalidated, or deleted as the world moves on, and
SHALL NOT be consulted by any live disclosure decision. The predicate
deciding which targets a resolving scan mints SHALL follow the same squared,
inclusive, canonical-path rules as every other predicate in this capability.

#### Scenario: A sighting keeps its stamp as the world moves
- **GIVEN** a sighting record minted at world time T
- **WHEN** the sighted fleet has since moved elsewhere
- **THEN** the record still reports the position and time it was minted with
- **AND** no field of the record has changed

#### Scenario: Scan mint uses the same boundary rule
- **GIVEN** a target whose squared distance from the pulse origin is exactly
  equal to the squared echo radius at the moment the pulse reaches it
- **WHEN** the scan resolves
- **THEN** a sighting record is minted for that target

### Requirement: Disclosure Is Decided Server-Side and Undisclosed Entities Are Absent
The system SHALL apply every disclosure decision before a response is
serialized, and SHALL omit an undisclosed entity from the response entirely
rather than including it with redacted, nulled, or placeholder fields. No
response SHALL carry any field derived from an undisclosed entity's state,
including counts, aggregates, or bounding information that would narrow its
position.

#### Scenario: An undisclosed fleet is absent, not redacted
- **WHEN** a response is built for a requester and a foreign fleet is not
  disclosed
- **THEN** no element representing that fleet appears in the response
- **AND** no count or aggregate in the response varies with its presence

#### Scenario: A direct read of an undisclosed entity is indistinguishable from absence
- **WHEN** a requester reads a specific undisclosed foreign entity by id
- **THEN** the response is the same one a nonexistent id would produce

### Requirement: Contact Smoothing Is Render-Only and Never Feeds Back
The system MAY smooth or debounce the display of a contact at the client to
suppress single-tick flicker at a range boundary. Such smoothing SHALL be
confined to presentation: it SHALL NOT alter, delay, or filter any request
the client makes, SHALL NOT be persisted, and SHALL NOT be read back into
any rule-bearing value. The server's disclosure answer remains the sole
authority for what the client is permitted to know.

#### Scenario: Smoothing changes display only
- **GIVEN** a contact that the server discloses at time T and not at T'
- **WHEN** the client applies contact smoothing across that transition
- **THEN** the requests the client issues are identical to those it would
  issue without smoothing

#### Scenario: Smoothed state never becomes an input
- **WHEN** the determinism check scans for rule-bearing values
- **THEN** no smoothed or debounced contact state is found feeding a
  persisted value, a solve result, an ETA, or a disclosure decision
