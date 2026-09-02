## ADDED Requirements

### Requirement: Eligible Scan Targets Are Served Per Fleet, To Their Owner Alone
The system SHALL serve, at `GET /v1/fleets/:fleetId/scan-targets`, the set of
hosts against which a focused-scan commit by that fleet would be accepted at
the world time the read is answered, together with that world time, and SHALL
serve it only to the corporation that owns the named fleet. A request naming a
fleet owned by another corporation, naming a fleet that does not exist, or made
by a requester with no corporation at all SHALL be answered `404 Not Found`
with an empty body — indistinguishable from one another, and never a `403` or
a body naming the fleet, its owner, or the reason — exactly as that fleet's own
command endpoints already answer, because a distinguishable response would
itself confirm the fleet id exists.

WHILE the named fleet is in lane transit, the system SHALL answer with an empty
target set rather than an error: a scan commit is rejected in that state, so
there is nothing to list, and an error would be indistinguishable from the
ownership rejection above.

#### Scenario: An owner reads its own fleet's eligible targets
- **GIVEN** a fleet whose system contains a body within focused-scan range with
  a clear sightline, and a second fleet owned by the same corporation
- **WHEN** the owning corporation reads that fleet's scan targets
- **THEN** the response lists both hosts, each carrying its host id, whether it
  is a body or an own fleet, and the sweep duration a commit against it would
  cost
- **AND** the response carries the world time the set was computed at

#### Scenario: Another corporation's fleet id is rejected as nonexistent
- **WHEN** a requester reads scan targets for a fleet owned by a different
  corporation
- **THEN** the response is `404 Not Found` with an empty body, identical to the
  response for a fleet id that does not exist at all

#### Scenario: A corpless requester is rejected the same way
- **WHEN** an authenticated requester with no living corporation reads any
  fleet's scan targets
- **THEN** the response is `404 Not Found` with an empty body

#### Scenario: A fleet in lane transit has an empty target set
- **GIVEN** a fleet in lane transit
- **WHEN** its owner reads its scan targets
- **THEN** the response is successful and its target set is empty

#### Scenario: A system with nothing in reach yields an empty set, not an error
- **GIVEN** a fleet with no body and no own fleet inside focused-scan range
  with a clear sightline
- **WHEN** its owner reads its scan targets
- **THEN** the response is successful and its target set is empty

### Requirement: A Served Scan Target Is One a Commit Would Accept, Priced at the Duration a Commit Would Freeze
The system SHALL include a host in a fleet's served scan-target set only when a
focused-scan commit by that fleet against that host, at the same world time,
would be accepted — applying the same host resolution, the same focused-scan
range test, and the same star-occlusion test the commit applies, with the same
tie rules unchanged (the range boundary inclusive, the occlusion boundary
strict, so a sightline exactly tangent to the star is clear). For each included
host the system SHALL serve the sweep duration that a commit against it at that
same world time would freeze, so the listed price and the committed price are
one computation rather than two that can drift apart.

A host that commit would reject SHALL be **absent** from the set, carrying no
entry and no reason field. A fleet owned by a different corporation SHALL never
appear whatever its range or sightline, because an entry for it would disclose
its presence, range, and occlusion state — the same disclosure `focused-scan`'s
identical-rejection rule exists to prevent — and no surface in this model hands
a client a foreign fleet's id in the first place.

#### Scenario: A host beyond focused-scan range is absent
- **GIVEN** a body farther from the fleet than the named focused-scan range
- **WHEN** the fleet's scan targets are read
- **THEN** that body is absent from the served set

#### Scenario: A host the star occludes is absent
- **GIVEN** a body whose sightline from the fleet the star occludes at the read's
  world time
- **WHEN** the fleet's scan targets are read
- **THEN** that body is absent from the served set

#### Scenario: A host at exactly the named range is served
- **GIVEN** a body whose squared distance from the fleet is exactly equal to the
  squared focused-scan range
- **WHEN** the fleet's scan targets are read
- **THEN** that body is present in the served set, the range boundary resolving
  toward disclosure

#### Scenario: A host on a sightline exactly tangent to the star is served
- **GIVEN** a body whose sightline from the fleet is exactly tangent to the star
- **WHEN** the fleet's scan targets are read
- **THEN** that body is present in the served set, the occlusion boundary being
  strict

#### Scenario: A served duration equals the duration a commit freezes
- **GIVEN** a served target entry for a host, carrying duration `D`, computed at
  world time `T`
- **WHEN** a focused scan is committed against that same host at that same world
  time `T`
- **THEN** the committed scan's arrive time is `T + D`

#### Scenario: A foreign fleet in the same system is absent
- **GIVEN** a fleet owned by a different corporation, present in the reading
  fleet's system, within range and with a clear sightline
- **WHEN** the reading fleet's scan targets are read
- **THEN** it is absent from the served set, and no entry, count, or field
  reflects its presence

#### Scenario: An own fleet in lane transit is absent
- **GIVEN** a second fleet owned by the same corporation that is in lane transit
- **WHEN** the reading fleet's scan targets are read
- **THEN** that fleet is absent from the served set, matching the commit's own
  rejection of it as a host
