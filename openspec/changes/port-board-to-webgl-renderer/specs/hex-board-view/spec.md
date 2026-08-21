## ADDED Requirements

### Requirement: Fog Band Determines a Feature's Board Treatment
This requirement governs only features carrying the three-band fog
projection defined by `system-interior`'s *Three-Band Fog Projection of
Features* (`visible`/`remembered`/`astronomical`); a board entity explicitly
exempt from that projection — for example, a system's trading station,
whose board visibility is governed by its own graph-tier rule — is out of
this requirement's scope and needs its own treatment rule.

The system SHALL determine each such feature's rendered treatment from the
fog band the server assigned it, and from no other input: a feature in the
`astronomical` band SHALL be drawn as an outline of its predicted geometry
only, with no lit surface and no `data-mineable` affordance; a feature in
the `remembered` band SHALL be drawn with a treatment visibly distinct from
`visible` (dimmed, and marked as a past observation), and SHALL keep its
stored resource detail available to the board's selection affordances — its
hit shape's `data-mineable` attribute, and the facts panel's `asOf` readout
once that feature is selected; a feature in the `visible` band SHALL be
drawn at full live strength, with its hit shape's `data-mineable` attribute
reflecting its current resources. The board SHALL NOT infer, randomise, or
otherwise derive a fog band client-side — a feature's band is read from the
data the server sent and never assigned or seeded locally. A feature whose
band is absent or is not one of `visible`, `remembered`, `astronomical`
SHALL receive the `astronomical` treatment. The band → treatment mapping
SHALL be a function of the fogged feature alone, evaluable and assertable
without a rendering context, and the renderer SHALL consume its output
without re-deriving any part of the mapping. The board SHALL treat the
server's fog projection as the sole source of a feature's detail, and SHALL
NOT hold, cache, or derive resource, activity, or composition detail that
the projection omitted for that requester.

#### Scenario: A visible-band feature is drawn at full live strength
- **WHEN** the interior read returns a feature with band `visible` and
  resources
- **THEN** the feature is drawn at full strength and its hit shape carries
  `data-mineable`

#### Scenario: An astronomical-band feature yields outline-only treatment
- **WHEN** the interior read returns a feature with band `astronomical`
- **THEN** the feature is drawn as an unfilled outline of its predicted
  geometry, with no lit surface and no `data-mineable` attribute on its hit
  shape

#### Scenario: A remembered-band feature carries its frozen detail
- **WHEN** the interior read returns a feature with band `remembered` and
  stored resources
- **THEN** the feature's treatment is visibly distinct from `visible`, its
  hit shape still carries `data-mineable`, and selecting it shows the
  observation's `asOf` in the facts panel's readout

#### Scenario: Band treatment is deterministic, not client-derived
- **WHEN** the same feature is rendered twice in the same session, and
  again in a new session, with an unchanged server-assigned band
- **THEN** its rendered treatment is identical each time — no seeded or
  randomised client-side band assignment influences it

#### Scenario: An unrecognised band falls back to the most restrictive treatment
- **WHEN** the interior read returns a feature whose `band` is absent or is
  not one of `visible`, `remembered`, `astronomical`
- **THEN** the feature is drawn with the `astronomical` treatment — outline
  only, no `data-mineable` attribute — and the board continues to render
  without error

#### Scenario: Band treatment is assertable without a rendering context
- **WHEN** a fogged feature is passed to the board's band → treatment
  mapping outside any renderer
- **THEN** the mapping returns that band's complete treatment values —
  including whether a lit surface is emitted at all — and those values are
  what the renderer draws, with no part of the band decision made inside
  the rendering backend

#### Scenario: An astronomical feature carries no detail to withhold
- **WHEN** the interior read returns a feature with band `astronomical`
- **THEN** that feature arrives with no `resources`, no `effects`, and no
  `asOf`, and the board's treatment mapping is given no such fields —
  the absence of detail is what the server sent, not what the renderer
  declined to draw

### Requirement: Board Picking Resolves to the Entity Under the Pointer
The system SHALL resolve a click on the board to the entity drawn under the
pointer: a click within a fleet, feature, or lane-gate mark SHALL select
that entity; a click elsewhere within the hex lattice SHALL select the hex
containing that point, and that hex SHALL be visibly marked as selected on
the board; and a click outside the lattice SHALL clear the selection. Hit
targets SHALL be positioned at the marks actually drawn, and a feature's
hit-target size SHALL be independent of its fog-band visual treatment — an
outline-only astronomical feature SHALL NOT be harder to select than a
filled feature of the same type. WHEN two or more marks' hit targets
contain the clicked point, the topmost drawn mark SHALL win, using the
board's documented draw order (fleets above features above lane gates; a
child feature above its parent).

#### Scenario: Clicking a fleet mark selects that fleet
- **WHEN** the pointer clicks within a fleet's drawn mark
- **THEN** that fleet becomes the selection

#### Scenario: Clicking the lattice away from any mark selects the hex
- **WHEN** the pointer clicks a point within the hex lattice that is not
  over a fleet, feature, or lane-gate mark
- **THEN** the hex containing that point becomes the selection

#### Scenario: A selected bare hex is visibly marked on the board
- **WHEN** a bare hex (not a fleet, feature, or lane-gate mark) becomes the
  selection
- **THEN** that hex is visibly marked as selected on the board

#### Scenario: An overlapping child mark wins over its parent
- **WHEN** the pointer clicks a point where a moon's hit target and its
  parent feature's hit target overlap
- **THEN** the moon (the child, drawn on top) becomes the selection, not
  its parent

#### Scenario: Clicking outside the lattice clears the selection
- **WHEN** the pointer clicks a point outside the hex lattice
- **THEN** the selection becomes empty

#### Scenario: A docked fleet's shrunk hit target falls through to its host body
- **WHEN** a fleet's effective state is `docked` to a feature and the
  pointer clicks just outside the fleet's hull but still over the feature's
  mark
- **THEN** the feature is selected, not the fleet

#### Scenario: An outline-only astronomical feature keeps a full-size hit target
- **WHEN** a feature in the `astronomical` band is drawn as an unfilled outline
- **THEN** its hit target is the same size used for a filled feature of the
  same type, not reduced to the outline's stroke width

### Requirement: Foreign Fleets Render as Contact Marks Only
The system SHALL render a fleet the requester does not own as a contact
mark carrying only its position — no ship count, no class composition, and
no movement-mode accent — and SHALL render an owned fleet from its
owner-only roster and effective movement state, including a mode accent and
heading. A foreign fleet's mark SHALL be derived from its position alone:
its size, hull-instance count, and formation SHALL be constant across all
foreign fleets and SHALL NOT vary with any field of that fleet's read.

#### Scenario: An own fleet shows its movement-mode accent and heading
- **WHEN** the board renders a fleet the requester owns
- **THEN** the fleet's mark carries a movement-mode accent and is oriented
  along its heading

#### Scenario: A foreign fleet renders as a generic contact mark
- **WHEN** the board renders a fleet read with `own: false`
- **THEN** the fleet's mark carries no ship count, no class composition,
  and no movement-mode accent

#### Scenario: A foreign fleet read with no roster renders without error
- **WHEN** a fleet read arrives with its `roster` field absent (audience
  fog on a foreign fleet)
- **THEN** the fleet renders as a contact mark and no error occurs

#### Scenario: Two foreign fleets of different composition render identically
- **WHEN** two fleets the requester does not own are visible in the same
  system and their owners' rosters differ in ship count
- **THEN** both marks are drawn with identical geometry — same size, same
  instance count, same formation — so the mark discloses nothing about
  either fleet's composition

#### Scenario: The own/foreign fork is decided outside the renderer
- **WHEN** a fleet read is passed to the board's fleet-mark mapping
  outside any renderer
- **THEN** the mapping returns the foreign contact mark's values for a
  fleet with `own: false`, and the owned composition values for a fleet
  with `own: true`, so the fork is assertable without a rendering context

#### Scenario: A fleet absent from the latest read is removed from the board
- **WHEN** a fleet that was drawn on the board is absent from the next
  fleet read (a foreign fleet that left the requester's live sensor
  coverage, or an own fleet that left the system)
- **THEN** its mark and its hit target are removed from the board on that
  read, leaving no stale contact at its last drawn position

### Requirement: Board Glyph Selection Is Keyboard-Operable
The system SHALL make every fleet, feature, and lane-gate hit target on the
board reachable via keyboard, in a consistent tab order — features, then
fleets, then lane gates, each group in stable id order; activating a
focused hit target with Enter or Space SHALL select it identically to a
pointer click; the currently focused hit target SHALL be distinguishable
from unfocused ones by a visible focus indicator; and a hit target that
currently holds keyboard focus SHALL retain that focus as the board's
per-frame world-time update re-renders — the overlay's animation loop SHALL
NOT itself unfocus the element the player is on.

#### Scenario: Tab reaches board glyphs in the defined order
- **WHEN** a user tabs through the board's interactive surface
- **THEN** focus moves through the board's feature hit targets first, then
  its fleet hit targets, then its lane-gate hit targets, each group in
  stable id order

#### Scenario: Focus survives the board's animation frames
- **WHEN** a glyph hit target has keyboard focus and world time advances
  several frames
- **THEN** focus remains on that same hit target

#### Scenario: A focused glyph shows a focus indicator
- **WHEN** a fleet, feature, or lane-gate hit target has keyboard focus
- **THEN** a focus indicator distinguishes it from unfocused targets

#### Scenario: Enter/Space selects the focused glyph
- **WHEN** Enter or Space is pressed while a fleet, feature, or lane-gate hit
  target has focus
- **THEN** that entity becomes the selection, identically to a pointer click

### Requirement: Board Respects Reduced-Motion Preference
WHILE the user's system indicates a reduced-motion preference, the system
SHALL hold the starfield, nebula, film-grain, body-surface, and fleet-plume
animation static (their time input frozen), while feature and fleet
positions continue to advance with world time, and selection and fog-band
state continue to render accurately.

#### Scenario: Reduced motion freezes decorative animation while positions keep advancing
- **WHEN** the user's system has a reduced-motion preference set and the
  board renders across several frames
- **THEN** the starfield, nebula, film-grain, body-surface, and fleet-plume
  animation hold static (their time input frozen)
- **AND** feature and fleet positions continue to advance with world time

## MODIFIED Requirements

### Requirement: System Board Route and Data Fan-In
The system SHALL render `/systems/:systemId` by reading the system's fogged
interior and the fogged fleets in that system, disabled until a non-empty
system id is known; SHALL show a loading state while either read is in
flight, or, while the board's rendering context is available and
uninterrupted, until it has produced its first rendered frame; and SHALL
show an error state (with the underlying error message when available) if
the interior read fails. The unsupported and interrupted states defined by
`### Requirement: Renderer Unavailability Is an Explicit State` and
`### Requirement: Lost Rendering Context Recovers Without Navigation` (both
`add-renderer-availability-states`) take precedence over this loading
state: once either fires, the board shows that state, not the loading
placeholder, regardless of whether a first frame has ever been produced.

#### Scenario: Loading state before data arrives
- **WHEN** the system board route is opened and its data has not yet
  loaded
- **THEN** a loading placeholder is shown

#### Scenario: Error state on a failed interior read
- **WHEN** the interior read fails
- **THEN** an error panel is shown instead of the board

#### Scenario: Loading persists through first frame after data arrives
- **WHEN** the interior and fleet reads have completed and the board's
  rendering context is available and uninterrupted, but it has not yet
  produced its first frame
- **THEN** the loading placeholder remains shown rather than an empty or
  black canvas

#### Scenario: An unsupported rendering context takes precedence over the loading placeholder
- **WHEN** the interior and fleet reads have completed but the board's
  rendering context cannot be created
- **THEN** the board's canvas region shows the unsupported state, not the
  loading placeholder

### Requirement: Toggle-to-Deselect Single Selection
The system SHALL maintain exactly one selection at a time, among a
feature, a bare hex, a fleet, or a lane gate; selecting the currently
selected item again SHALL clear the selection (deselect) rather than
re-select it; selecting a different item of any kind SHALL replace the
current selection.

#### Scenario: Re-selecting the same feature deselects it
- **WHEN** a feature is selected and then clicked again
- **THEN** the selection becomes empty

#### Scenario: Selecting a hex replaces a feature selection
- **WHEN** a feature is selected and a bare hex is then clicked
- **THEN** the selection becomes that hex, and the feature is no longer
  selected

#### Scenario: Clicking board background clears the selection
- **WHEN** a feature is selected and a point on the board outside the hex
  lattice is clicked
- **THEN** the selection becomes empty
