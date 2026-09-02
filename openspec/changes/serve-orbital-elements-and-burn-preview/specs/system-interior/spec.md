## MODIFIED Requirements

### Requirement: Interior Read Endpoint
The system SHALL serve `GET /v1/systems/:systemId`, returning the system's
radius, character, star class, current world time, every body (including
each lane-gate body, unfiltered by any charted-knowledge gate — see "Bodies
Are Public; Ships Are Disclosed"), and a `contacts` array reflecting the
requester's own live disclosure of foreign ship presence in that system
(see "Foreign Presence Is Served As System Contacts"). Every field already
served before this change — a body's lattice footprint, its lattice `orbit`
object (`ring`/`angle0`/`period`/`dir`), its `parentId`, its `fixed` flag,
its `band` value (always `"visible"`), its `live` value (always `true`), its
`asOf` stamp, and a lane-gate body's lattice `cell` — SHALL continue to be
served unchanged, with unchanged meaning: this response is additive over its
prior shape, not a replacement of it, never removing a field a caller already
reads and never redefining one.

Every non-star body, and every lane-gate body, SHALL additionally carry its
continuous orbital element set under the wire key `orbitElements`, an object
carrying `parentId`, `radius`, `periodMs`, `phase`, `inclination`, and `node`
— the same element set "Interiors Emit Continuous Orbital Elements For Every
Body" already generates and persists for a feature body, and the same one the
system's body table already derives for a lane-gate body, each now serialized
rather than held server-side only, so a client can evaluate that body's
position at any world time from the served elements alone without a further
read per rendered frame.

The element set SHALL be served under the key `orbitElements` and SHALL NOT
be served under the key `orbit`: `orbit` is already occupied on this response
by the lattice orbit, a different object with different fields and a different
meaning, and this response's separate `space` key is already occupied by the
body's resolved continuous position. Serving the element set under either name
would redefine a field a caller already reads.

The star SHALL carry no `orbitElements` (it is parentless and positioned at
the origin). Every other body reaching this response carries a complete
element set by construction — a body whose stored element set is missing or
undecodable is omitted from the response entirely rather than served
partially (see "Interior Feature Decode Validates Its Orbital Element Set,
Omitting Rather Than Failing", "A Feature Omission Cascades to a Fixpoint
Through the Parent Chain", and "A Spliced Body Is Complete or Omitted, and
Its Incompleteness Is Loud") — so there is no partially-populated
`orbitElements` case on this wire.

#### Scenario: Unknown or ungenerated system
- **WHEN** `GET /v1/systems/:systemId` is called for a system id absent
  from the live galaxy
- **THEN** the response is `404 Not Found`

#### Scenario: No live galaxy
- **WHEN** `GET /v1/systems/:systemId` is called and no galaxy has been
  generated
- **THEN** the response is `404 Not Found`

#### Scenario: A materialized system's read carries every body's continuous position and size
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every body in the response, including each lane-gate body,
  carries a continuous position and a size, alongside its pre-existing
  lattice placement (a feature body's `footprint`, a lane-gate body's
  `cell`)

#### Scenario: Pre-existing wire fields are unchanged
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every feature body's `band` value is `"visible"`, its `live`
  value is `true`, and its lattice footprint is still present, and every
  lane-gate body still carries its lattice `cell` — exactly as before this
  change

#### Scenario: A non-star body's read carries its full orbital element set
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every non-star feature body in the response carries an
  `orbitElements` object with `parentId`, `radius`, `periodMs`, `phase`,
  `inclination`, and `node`, each equal to the value that body's stored
  element set holds

#### Scenario: A lane-gate body's read carries its full orbital element set
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every lane-gate body in the response carries an `orbitElements`
  object with the same six fields, equal to the element set the system's
  body table derived for that gate

#### Scenario: The star carries no orbital element set
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** the star's response entry carries no `orbitElements` key

#### Scenario: The lattice orbit key keeps its lattice meaning
- **WHEN** an authenticated requester reads a materialized system's
  interior for a body that carries a lattice orbit
- **THEN** that body's `orbit` key still carries the lattice object
  (`ring`, `angle0`, `period`, `dir`) and not the continuous element set
- **AND** its continuous element set is reachable only under
  `orbitElements`

#### Scenario: A body served without a resolvable continuous position is still element-complete
- **WHEN** a body's continuous position could not be resolved for this read
  (no body table was available) and it is therefore served with a
  zero-valued `space` position
- **THEN** its `orbitElements` object is still served in full from its
  stored element set, since the elements are stored data and not a
  resolution result
