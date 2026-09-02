## REMOVED Requirements

### Requirement: Interior Read Endpoint
**Reason**: The requirement's body is built around the polar-lattice placement
fields this change deletes from the response, and it carries a scenario —
*Pre-existing wire fields are unchanged* — that asserts those fields survive.
A `## MODIFIED` block cannot shed a scenario the current spec carries:
`openspec validate --strict` passes such a delta, but `openspec archive`
refuses it outright ("current spec contains scenario(s) not present in the
modified block ... Aborted. No files were changed."). The endpoint is
therefore retired here and re-added below under a name that describes what it
now serves, carrying every scenario that survives the removal.
**Migration**: None. The endpoint, its route, and its `404` behaviour are
unchanged; it is re-added immediately below as *Interior Read Serves
Continuous Bodies*, and no caller of the surviving fields is affected. The
lattice fields' own removal is the change this retirement exists to express.

## ADDED Requirements

### Requirement: Interior Read Serves Continuous Bodies
The system SHALL serve `GET /v1/systems/:systemId`, returning the system's
radius, character, star class, current world time, every body (including
each lane-gate body, unfiltered by any charted-knowledge gate — see "Bodies
Are Public; Ships Are Disclosed"), and a `contacts` array reflecting the
requester's own live disclosure of foreign ship presence in that system
(see "Foreign Presence Is Served As System Contacts").

Every non-star body, and every lane-gate body, SHALL carry its continuous
orbital element set under the wire key `orbitElements`, an object carrying
`parentId`, `radius`, `periodMs`, `phase`, `inclination`, and `node`, so a
client can evaluate that body's position at any world time from the served
elements alone without a further read per rendered frame. The star SHALL
carry no `orbitElements` (it is parentless and positioned at the origin).
Every other body reaching this response carries a complete element set by
construction — a body whose stored element set is missing or undecodable is
omitted from the response entirely rather than served partially (see
"Interior Feature Decode Validates Its Orbital Element Set, Omitting Rather
Than Failing", "A Feature Omission Cascades to a Fixpoint Through the Parent
Chain", and "A Spliced Body Is Complete or Omitted, and Its Incompleteness Is
Loud") — so there is no partially-populated `orbitElements` case on this wire.

This response SHALL carry the simulation clock's **scale** — the number of
world-milliseconds the world advances per wall-clock millisecond — alongside
the `worldTime` it serves, taken from the same clock, so a client
extrapolating live world time between reads projects at the world's own rate
rather than at an assumed rate of 1.

This response SHALL NOT carry any polar-lattice placement field. Specifically,
a body SHALL carry no `footprint`, no `orbit` object (the lattice orbit
`{ring, angle0, period, dir}`), no `parentId` at the top level of the body (the
continuous parent is `orbitElements.parentId`), no `fixed` flag, no `band`
value, no `live` value, and no `asOf` stamp; and a lane-gate body SHALL carry
no `cell`. These fields described a position on the polar ring-and-slot board
and a visibility banding that no longer exists — `band` has been constant
`"visible"`, `live` constant `true`, and `asOf` constant absent since bodies
became public — and this capability's continuous-space consumer reads none of
them. Their removal is what allows `backend/board` and `backend/polar` to be
deleted: while this response promised them, a caller could still be reading
them.

This is a deliberate removal of fields previously served, not an additive
change; the additivity clause this requirement previously carried is withdrawn
with them.

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
  carries a continuous position and a size

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

#### Scenario: The read carries the world clock's scale alongside its world time
- **WHEN** an authenticated requester reads a materialized system's
  interior on a world whose simulation clock runs at a scale other than 1
- **THEN** the response carries that clock's scale alongside its
  `worldTime`, so a client can project live world time at the world's own
  rate

#### Scenario: A body served without a resolvable continuous position is still element-complete
- **WHEN** a body's continuous position could not be resolved for this read
  (no body table was available) and it is therefore served with a
  zero-valued `space` position
- **THEN** its `orbitElements` object is still served in full from its
  stored element set, since the elements are stored data and not a
  resolution result

#### Scenario: Lattice-only fields are absent from the response
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** no body carries `footprint`, `orbit`, a top-level `parentId`,
  `fixed`, `band`, `live`, or `asOf`, and no lane-gate body carries `cell`
