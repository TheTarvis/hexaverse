## ADDED Requirements

### Requirement: Eligible Scan Targets Are Served Per Fleet, To Their Owner Alone
The system SHALL serve, at `GET /v1/fleets/:fleetId/scan-targets`, the set of
hosts against which a focused-scan commit by that fleet would be accepted at
the world time the read is answered, and SHALL serve it only to the
corporation that owns the named fleet. A request naming a fleet owned by
another corporation, naming a fleet that does not exist, or made by a
requester with no corporation at all SHALL be answered `404 Not Found`
with an empty body — indistinguishable from one another, and never a `403` or
a body naming the fleet, its owner, or the reason — exactly as that fleet's own
command endpoints already answer, because a distinguishable response would
itself confirm the fleet id exists.

WHILE the named fleet is in lane transit, and WHILE it already has a running
focused scan, the system SHALL answer with an empty target set rather than an
error: a scan commit is rejected in both of those states (*A Focused Sweep
Commits On the Sensor Channel*: a scanner in lane transit is rejected, and a
second sweep is rejected while one is running), so there is nothing to list,
and an error would be indistinguishable from the ownership rejection above.
The set is empty rather than full in the running-sweep case because this
capability's whole contract is that a served target is one a commit would
accept, and while the sensor channel is claimed no commit is accepted at all.

#### Scenario: An owner reads its own fleet's eligible targets
- **GIVEN** a fleet whose system contains a body within focused-scan range with
  a clear sightline, and a second fleet owned by the same corporation
- **WHEN** the owning corporation reads that fleet's scan targets
- **THEN** the response lists both hosts, each carrying its host id, whether it
  is a body or an own fleet, and the sweep duration a commit against it would
  cost

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

#### Scenario: A fleet already running a sweep has an empty target set
- **GIVEN** a fleet with a running focused scan on its sensor channel, and a
  body within focused-scan range with a clear sightline
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

**A derived belt member SHALL never appear in the set, and a commit naming
one SHALL be rejected identically to an unresolvable `hostId`** — the same
named error, the same response shape, no field distinguishing the two. A belt
is one body on every surface this game serves: its members are derived at
body-table build time and never persisted, and **no read enumerates them** —
the interior read serves features and lane gates only. (A member id can already
reach the wire in one narrow way: a fleet docked at a member has that member id
in its served `attachedTo`, which `mine-extraction` explicitly contemplates. That
is an echo of a host the fleet already occupies, not a catalogue of bodies to
choose from.) Serving them here would make this endpoint the first surface to
offer member ids as **selectable bodies**, contradicting `system-space-view`'s
*Belt Members Render as Decorative Detail, Never as Separate Pickable Bodies*
(no member carries its own hit target, selection, or facts display) and offering
a target list in which one belt appears as many entries the client has no name,
mark, or facts surface for. A fleet parked at a
belt is the canonical mining position, so this is the ordinary case rather than
a corner of one. The belt feature itself remains an eligible host on its own
terms; only its members are excluded.

**The reading fleet itself SHALL never appear in its own set.** It satisfies
every geometric predicate trivially — the distance from a fleet to itself is
zero, so the range test passes, and a zero-length sightline is never occluded —
so without this rule the set would list the scanner as a target of itself. A
sweep aimed at one's own hull discloses nothing: its own composition is
already served in full to its owner, so the sweep would spend sensor-channel
time and exposure to learn nothing. The commit rejects it too (*A Fleet Is
Never a Host For Its Own Sweep*); the list and the commit agree.

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

#### Scenario: The reading fleet is absent from its own target list
- **GIVEN** a fleet whose owner reads its scan targets
- **WHEN** the served set is inspected
- **THEN** that same fleet's own id is absent from it, though it trivially
  satisfies the range test at distance zero and is never self-occluded

#### Scenario: A belt is served as one host, never as its members
- **GIVEN** a fleet within focused-scan range of a belt with a clear sightline
- **WHEN** its scan targets are read
- **THEN** the belt appears as exactly one entry, and no derived belt member
  appears as an entry of its own

#### Scenario: A commit naming a belt member is rejected as unresolvable
- **WHEN** a fleet commits a focused scan whose `hostId` names a derived member
  of a belt rather than the belt itself
- **THEN** the commit is rejected with the same named error and response shape
  as an unresolvable `hostId`, no scan action is created, and no
  sensor-channel slot is claimed

#### Scenario: An own fleet in lane transit is absent
- **GIVEN** a second fleet owned by the same corporation that is in lane transit
- **WHEN** the reading fleet's scan targets are read
- **THEN** that fleet is absent from the served set, matching the commit's own
  rejection of it as a host

### Requirement: A Fleet Is Never a Host For Its Own Sweep
The system SHALL reject a focused-scan commit whose `hostId` names the
scanning fleet itself, creating no action and claiming no sensor-channel slot,
and SHALL reject it identically to a `hostId` that does not resolve at all —
same named error, same response shape, no field distinguishing the two — so
this client needs no copy for a rejection its own target list can never
produce.

Without this rule a self-sweep is *accepted*: host resolution finds the
scanner among its own system's fleets, it is owned by the scanning
corporation and is not in lane transit, the range test passes at distance
zero, and a zero-length sightline is never occluded. What it buys is nothing —
a corporation already reads its own fleet's composition in full — while
costing the sensor channel for the sweep's duration and unmasking the scanner
(*A Sweep Unmasks Its Scanner*). Rejecting it at commit is what makes the
served target list's omission of the scanner (*A Served Scan Target Is One a
Commit Would Accept, Priced at the Duration a Commit Would Freeze*) an
agreement between the two surfaces rather than a disagreement.

#### Scenario: A fleet sweeping itself is rejected
- **GIVEN** a fleet not in lane transit
- **WHEN** it commits a focused scan whose `hostId` is its own fleet id
- **THEN** the commit is rejected with the same named error and response shape
  as an unresolvable `hostId`, no scan action is created, and no
  sensor-channel slot is claimed

#### Scenario: A self-sweep is rejected even at zero range with a clear sightline
- **GIVEN** a fleet whose own position trivially satisfies the focused-scan
  range test and whose zero-length sightline is not occluded
- **WHEN** it commits a focused scan against its own fleet id
- **THEN** the commit is still rejected, and neither the range test nor the
  occlusion test is what admits it
