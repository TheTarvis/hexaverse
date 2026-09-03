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
continuous `extent` — the star-frame upper bound over every generated body's
orbital radius — its character, star class, current world time, every body
(including each lane-gate body, unfiltered by any charted-knowledge gate —
see "Bodies Are Public; Ships Are Disclosed"), and a `contacts` array
reflecting the requester's own live disclosure of foreign ship presence in
that system (see "Foreign Presence Is Served As System Contacts"). The
`extent` is this response's only system-sized scalar: it is what a client
scales a camera, a pan bound, and a pick radius against, and it replaces the
lattice `radius` this requirement's predecessor served.

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
the response SHALL carry no top-level lattice `radius` (the continuous
`extent` above is its successor, and the two are different quantities in
different units — serving both would leave a consumer free to scale
continuous space off the lattice one); a body SHALL carry no `footprint`, no
`orbit` object (the lattice orbit `{ring, angle0, period, dir}`), no
`parentId` at the top level of the body (the continuous parent is
`orbitElements.parentId`), no `fixed` flag, no `band` value, no `live` value,
and no `asOf` stamp; and a lane-gate body SHALL carry no `cell`. These fields
described a position on the polar ring-and-slot board
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

#### Scenario: The read carries the interior's continuous extent
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** the response carries a continuous `extent` equal to the value
  that interior's stored document holds

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
- **THEN** the response carries no top-level lattice `radius`, no body
  carries `footprint`, `orbit`, a top-level `parentId`, `fixed`, `band`,
  `live`, or `asOf`, and no lane-gate body carries `cell`

### Requirement: Lane-Gate Bodies Carry Their Body Id
The system SHALL serve, for every lane-gate body in a materialized system's
interior read, that gate body's own body id under the wire key `id` — the
same key every other body in this response carries. That value SHALL be
identical to the id the server reports in a fleet's `attachedTo` once that
fleet arrives attached to that gate, and identical to the id a burn order
must name to target that gate, so one served string is the gate's identity
across the interior read, the burn command, and the fleet read. Like
`destSystemId` and `laneId`, it SHALL be served regardless of the
requester's charted knowledge.

This id SHALL be served rather than left for a client to reconstruct. The
server builds it by a naming convention — a fixed prefix joined to the
destination system id — that `backend/system` does not export, and that is
already mirrored independently by three backend packages (`backend/charts`,
`backend/fleet`'s handler, and `backend/fleet`'s fuel estimator each hold
their own copy of the prefix). A client copy would be a fourth, sitting on
the far side of the wire where no Go test can reach it and pinned by no
cross-stack fixture. A later change SHALL NOT withdraw this field in favour
of a client-side reconstruction of that convention (design.md Decision 15).

#### Scenario: The served gate body id is the id a fleet attaches to
- **GIVEN** a lane-gate body served with an `id` in a system interior read
- **WHEN** a fleet burns to that gate and arrives attached to it
- **THEN** that fleet's own read reports an `attachedTo` string exactly
  equal to the `id` served for that gate body — equality, not merely the
  presence of some id on each side

#### Scenario: A burn order naming the served gate body id targets that gate
- **WHEN** a burn order names, as its target, the `id` a lane-gate body was
  served with
- **THEN** the server resolves it as that gate body and accepts the order,
  requiring no separately-derived identifier from the client

#### Scenario: A fresh corporation with no charted lanes still receives the gate body id
- **GIVEN** a corporation with no charted lanes
- **WHEN** it reads a materialized system's interior
- **THEN** every lane-gate body in the response carries its `id`, unfiltered
  by the corporation's charted knowledge

#### Scenario: Every lane-gate body carries a non-empty, distinct id
- **WHEN** an authenticated requester reads a materialized system's interior
  that has two or more lane gates
- **THEN** every lane-gate body carries a non-empty `id`, and no two bodies
  in that response share one

## MODIFIED Requirements

### Requirement: Lane-Gate Bodies Carry Their Lane Id
The system SHALL serve, for every lane-gate body in a materialized
system's interior read, the stable id of the lane it serves (wire field
`laneId`), alongside — never replacing — that gate body's `destSystemId`
and its body `id` (per *Lane-Gate Bodies Carry Their Body Id*), so a client
can commit a jump (`POST /v1/fleets/:fleetId/jump {laneId}`) by passing this
value straight through, with no second lookup and no client-side
re-derivation of the id. This id SHALL be the same id the jump endpoint
accepts, and SHALL match the id the server derives for the same crossing on
either endpoint (`galaxy.LaneIdBetween`, order-independent over the
unordered system-pair, is the single derivation both gate attachment and
travel arrival already agree on). This field SHALL be served regardless of
the requester's charted knowledge, exactly as the gate body itself is served
regardless of charted knowledge under "Bodies Are Public; Ships Are
Disclosed": a fresh corporation with no charted lanes still receives a
usable `laneId` on every gate body it reads.

The `cell` this requirement previously named as a companion field is
withdrawn with the rest of the polar lattice (see *Interior Read Serves
Continuous Bodies*, which mandates that a lane-gate body carry no `cell`).
A gate body's position is now its continuous `space`, and its identity is
its `id`.

#### Scenario: A materialized system's read carries each lane-gate body's lane id
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every lane-gate body in the response carries a **non-empty**
  `laneId` field alongside its `destSystemId` and its body `id`

#### Scenario: The served lane id is the one the jump endpoint accepts
- **GIVEN** a lane-gate body's `laneId` from a system interior read
- **WHEN** that value is passed as `POST /v1/fleets/:fleetId/jump`'s
  `laneId` for a fleet attached to that gate
- **THEN** the server accepts it as naming that lane, with no additional
  lookup required of the client

#### Scenario: The served lane id matches the server's own derivation for the same crossing
- **GIVEN** a lane between two systems
- **WHEN** its id is derived via `galaxy.LaneIdBetween` for the crossing
  from either system's own gate-attachment or travel-arrival write
- **THEN** the id served on the corresponding lane-gate body in either
  system's interior read is identical to it

#### Scenario: A fresh corporation with no charted lanes still receives a usable lane id
- **GIVEN** a corporation with no charted lanes
- **WHEN** it reads a materialized system's interior
- **THEN** every lane-gate body in the response still carries its `laneId`,
  unfiltered by the corporation's charted knowledge
