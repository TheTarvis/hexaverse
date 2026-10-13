# Galaxy View Specification

## Purpose
The frontend's primary screen (the home route): a 3D renderer of the
galactic graph with an intel summary, a per-system inspector, the
requester's fleet roster, and the select→preview→commit gesture for
graph-tier travel — serving both authenticated players (the live,
per-corporation-fogged galaxy) and logged-out visitors (a frozen static
start area).
## Requirements
### Requirement: Live-vs-Start-Area Data Source by Auth State
The system SHALL, once authentication has resolved, fetch the live galaxy
(`GET /v1/galaxy`) for an authenticated user or the frozen static
start-area asset for a logged-out visitor, and SHALL hold the fetch
disabled while authentication is still resolving (never flashing the
start area to a user about to be recognized as signed in).

#### Scenario: An authenticated user sees the live galaxy
- **WHEN** the galaxy view loads for an authenticated user
- **THEN** it fetches and renders the live galaxy from the backend

#### Scenario: A logged-out visitor sees the frozen start area
- **WHEN** the galaxy view loads for a visitor with no auth session
- **THEN** it fetches and renders the static start-area asset, never the
  live backend endpoint

#### Scenario: No fetch fires while auth is still resolving
- **WHEN** the galaxy view mounts and the authentication state has not yet
  resolved
- **THEN** neither the live nor the start-area fetch is issued until
  resolution completes

### Requirement: Intel Panel Summary
The system SHALL show a left-hand panel with the current data source
label (live vs. frozen start area), a system count, a lane count, and a
per-region breakdown (count per region present in the data), and, only
when viewing the frozen start area, a sign-in prompt.

#### Scenario: Region breakdown lists only present regions
- **WHEN** the intel panel renders for a galaxy with systems in some but
  not all region types
- **THEN** only regions with at least one system are listed, each with its
  count

#### Scenario: Sign-in prompt shown only on the start area
- **WHEN** viewing the frozen start area
- **THEN** a sign-in prompt is shown
- **AND** it is not shown when viewing the live galaxy

### Requirement: System Inspector on Selection
The system SHALL show, on selecting a system node, its name, region, lane
(connection) count, star class, and its full major-body skeleton — the
free astronomical layer, shown regardless of the requester's fog tier for
that system — and, when that system carries a station visible to the
requester (per `trading-station`'s visibility gate), the station's
presence and its current quotes (its price-ordered demand entries, per
`market-price-board`'s uniform quote shape — never a separate floor/
requests split). The system SHALL show an empty-state prompt when nothing
is selected.

#### Scenario: Selecting a node populates the inspector
- **WHEN** a system node is selected
- **THEN** the inspector shows its name, region, star class, lane count,
  and major-body list

#### Scenario: The major-body skeleton is never fog-gated
- **WHEN** a system with tier `starVisible` (no earned knowledge) is
  selected
- **THEN** its major-body skeleton is still shown in full

#### Scenario: Selecting a system with a visible station shows its quotes
- **WHEN** a system carrying a station visible to the requester (per the
  configured minimum visibility tier) is selected
- **THEN** the inspector shows the station's presence alongside its
  current price-ordered demand entries

#### Scenario: A system below the station visibility gate, or with none, shows no station section
- **WHEN** a system whose station (if any) does not clear the configured
  minimum visibility tier is selected
- **THEN** the inspector shows no station section for that system

### Requirement: Drill-In Navigation to the System Board
The system SHALL offer an "Enter system" action on a selected system when
authenticated, navigating to that system's space-view route (the
continuous-space `/systems/:systemId` view — `system-space-view`), and
SHALL NOT offer it on the frozen start area (a read-only showcase with no
space view to enter).

#### Scenario: Entering a system navigates to its board
- **WHEN** "Enter system" is invoked for a selected system while
  authenticated
- **THEN** the view navigates to that system's space-view route

#### Scenario: No drill-in on the start area
- **WHEN** viewing the frozen start area
- **THEN** no "Enter system" action is offered

### Requirement: Own-Fleet Presence and Recenter Target

The system SHALL mark systems hosting at least one of the requester's own
fleets that are not currently mid-jump (crossing a lane) as presence
markers on the graph, and SHALL drive the recenter control to snap to the
requester's active fleet's system when one exists, falling back to a
whole-galaxy framing otherwise. A jump is atomic and single-hop — there is
no held-mid-lane state for a fleet to occupy (design.md Decision 4,
Decision 10).

#### Scenario: A traveling fleet is not marked at the system it left

- **WHEN** an own fleet's `jump` field is set (a lane crossing is underway)
- **THEN** its origin system is not marked with a presence indicator for
  that fleet

### Requirement: Self-Scheduled Arrival Refresh
The system SHALL, for each of the requester's fleets in transit with a
known arrival time, schedule a refresh shortly after that arrival time
that re-reads the fleet (forcing the server's lazy arrival settlement) and
then refreshes the requester's fleet list and the galaxy read, so a
destination's reveal appears without a manual page reload.

#### Scenario: An arrival refresh reveals the destination
- **WHEN** a transiting fleet's scheduled arrival time passes
- **THEN** the fleet and galaxy reads are refreshed shortly afterward,
  reflecting the settled arrival and any newly revealed systems/lanes

### Requirement: Wake-Up Focus Handoff
The system SHALL, on first mount after a fresh spawn hands off a home
system id, select that system and glide the camera to it once the graph
is ready, then clear the handoff so it fires only once.

#### Scenario: A fresh spawn's home system is auto-selected and focused
- **WHEN** the galaxy view mounts with a pending wake-up focus handoff for
  a system present in the loaded galaxy
- **THEN** that system becomes selected and the camera glides to it,
  exactly once

### Requirement: Loading and Error States
The system SHALL show a loading placeholder while the galaxy data is in
flight, and an error panel (with the underlying error message when
available) if the galaxy read fails.

#### Scenario: Error panel on a failed galaxy read
- **WHEN** the galaxy read fails
- **THEN** an error panel is shown instead of the renderer

### Requirement: Renderer Unavailability Is an Explicit State
Rendering-context creation in this requirement includes asynchronous renderer initialization and first-frame submission. Unavailability means neither the WebGPU primary backend nor its WebGL2 compatibility backend can initialize and present the view; a WebGL capability probe alone SHALL NOT reject usable WebGPU. Pending initialization SHALL show a loading state until a frame is presented or failure is reported under the 15-second initialization and 15-second eligible first-presentation budgets in *Asynchronous Renderer Attempt Ownership*. Primary initialization or first-frame failure SHALL attempt fresh compatibility rendering; terminal failure SHALL end loading in the local retriable state. Initialization rejection SHALL follow the same local containment, panel usability and data-error precedence rules below.

IF a rendering context for the galaxy graph cannot be created, THEN the
system SHALL show an explicit unsupported state in place of the graph's
canvas region, naming the failure as a browser- or graphics-hardware-
capability problem — never raw diagnostic text, a stack trace, or a GPU
vendor/model string — rather than an empty stage or an uncaught error, and
SHALL offer a retry affordance that attempts to re-establish the context.

For an authenticated requester with at least one own fleet, the intel panel
and the fleet roster SHALL remain mounted and usable while the unsupported
state is shown: selecting an own fleet from the roster remains available
without a graph selection, and reaches that fleet's system, populates the
inspector, and keeps the travel and drill-in affordances for that system
usable. For a logged-out visitor, the intel panel's counts, region
breakdown, and sign-in prompt SHALL remain shown. A control in the
surrounding panels whose only effect is on the unavailable graph (e.g.
recenter) SHALL be disabled or hidden while the unsupported or interrupted
state is shown, rather than presented as operable.

WHEN no system is already selected and the requester has no own fleet in
the roster, the inspector's selection prompt SHALL NOT instruct the player
to select a system on the graph, and SHALL instead indicate that a system
can be reached by selecting an own fleet in the roster, or that the graph
must be available to pick any other.

An error thrown while constructing, listening to, or retrying the graph's
rendering context SHALL be contained to the graph's canvas region: caught by a
boundary scoped to that region when the error is thrown during render or
commit, and by a local handler when the error is thrown inside a context-
loss/restore listener or an animation-frame callback (neither is reachable
by a React error boundary at any placement) — leaving the intel panel, the
inspector, and the galaxy view container mounted and usable.

The unsupported and interrupted states SHALL take precedence over the
galaxy view's data-loading and first-frame-pending states: once a rendering
context cannot be created, a loading placeholder SHALL NOT continue to be
shown in the graph's canvas region. This state is triggered by a client
rendering-capability failure, never by a failure of the galaxy data read.

#### Scenario: Context creation failure shows a named unsupported state
- **WHEN** a rendering context for the galaxy graph cannot be created
- **THEN** the graph's canvas region shows an explicit unsupported state
  naming browser or GPU unavailability as the cause
- **AND** no uncaught error is thrown

#### Scenario: Surrounding galaxy affordances remain usable
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state for an authenticated requester with at least one own fleet
- **THEN** the intel panel and the fleet roster remain mounted and
  interactive
- **AND** selecting an own fleet from the roster remains available without
  a graph selection

#### Scenario: Roster selection still reaches a system, its inspector, and travel
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state and an own fleet's roster row is selected
- **THEN** that fleet's system becomes the selection, the inspector
  populates, and the travel and drill-in affordances offered for that
  system remain usable

#### Scenario: Surrounding galaxy affordances remain usable for a logged-out visitor
- **WHEN** the graph's canvas region shows the unsupported state for a
  logged-out visitor
- **THEN** the intel panel's counts, region breakdown, and sign-in prompt
  remain shown

#### Scenario: Choosing a system on the graph is unreachable without the canvas
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state AND no system is selected AND the requester has no own fleet in
  the roster
- **THEN** the inspector's selection prompt SHALL NOT instruct the player
  to select a system on the graph
- **AND** the inspector indicates that a system can be reached by selecting
  an own fleet in the roster, or that the graph must be available to pick
  any other

#### Scenario: A canvas-only control is disabled while the canvas is unavailable
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state
- **THEN** a control whose only effect is on the graph canvas (e.g.
  recenter) is disabled or hidden, not presented as operable

#### Scenario: The unsupported state is independent of the galaxy data read
- **WHEN** the galaxy read succeeds but the rendering context cannot be
  created
- **THEN** the graph's canvas region shows the unsupported state, not the
  galaxy-read error state

#### Scenario: A failed data read takes precedence over the unsupported state
- **WHEN** the galaxy read fails and the rendering context also cannot be
  created
- **THEN** the galaxy-read error panel is shown with its underlying message
- **AND** no unsupported state is shown

#### Scenario: The galaxy view container remains present
- **WHEN** the unsupported state is shown
- **THEN** the galaxy view container is still rendered, with the
  unsupported state occupying only the graph's canvas region within it

#### Scenario: The unsupported state offers a retry affordance
- **WHEN** the graph's canvas region shows the unsupported state
- **THEN** a retry affordance is offered
- **AND** invoking it attempts to create a new rendering context
- **AND** a successful attempt resumes rendering the live galaxy graph
- **AND** a failed attempt keeps the unsupported state, retriable again

#### Scenario: The displayed cause is a user-actionable category, not raw diagnostic text
- **WHEN** the unsupported or interrupted state names the cause to the player
- **THEN** the text identifies the failure as a browser or graphics-hardware
  capability problem
- **AND** it does not display raw exception text, stack traces, or GPU
  vendor/model strings

#### Scenario: An unexpected rendering error is contained to the canvas region
- **WHEN** an error is thrown while constructing, listening to, or retrying
  the graph's rendering context — including an error not otherwise named by
  this requirement
- **THEN** the error is contained to the graph's canvas region — caught by
  the region's error boundary when it is thrown during render or commit,
  and by a local handler when it is thrown inside a context-loss/restore
  listener or an animation-frame callback
- **AND** the intel panel, the inspector, and the galaxy view container
  remain mounted and usable

### Requirement: Lost Rendering Context Recovers Without Navigation
Rendering-context loss includes WebGPU device loss and WebGL2 compatibility context loss. A lost WebGPU device or post-readiness frame failure SHALL remain interrupted until explicit retry recreates the renderer; it SHALL NOT wait for a WebGL restoration event or start an automatic retry loop. Compatibility context restoration SHALL retain the automatic live-state recovery described below. Creation, loss and restoration diagnostics SHALL identify the backend and distinguish asynchronous initialization failure from runtime loss without exposing raw diagnostics in player-facing text.

WHEN the galaxy graph's rendering context is lost at runtime, the system
SHALL show an interrupted state in the graph's canvas region without an
uncaught error; WHEN the lost context is restored, the system SHALL resume
rendering the live galaxy graph — reflecting current world time and
system/fleet state, never a stale pre-loss frame — without a page
navigation; and IF the context is not restored, the interrupted state SHALL
persist and SHALL offer a retry affordance that attempts to re-establish the
rendering context. Restore failure means an error thrown while
re-establishing compatibility rendering after its context-restored event; a context
that simply never restores is not itself a recordable failure event.
Retrying SHALL release the prior attempt's renderer resources and event
listeners before creating a new context, and SHALL hold no more than one
live rendering context for the graph's canvas at any time. Once invoked,
the retry affordance SHALL be disabled and show an in-progress indication
until the attempt resolves; any invocation while disabled SHALL start no
further attempt. A second context loss arriving while the interrupted state
is already shown SHALL leave the galaxy graph in the interrupted state
without duplicating listener registration or starting a second in-flight
creation attempt. A system or fleet selection active at the moment of
context loss SHALL remain shown in the intel panel/inspector throughout the
interrupted state and SHALL still be active once the graph resumes. Each
context-creation failure, context loss, and restore failure SHALL be
recorded distinguishably by cause: a diagnostic entry emitted to the client
error log naming which of the three occurred and, when available, the
browser-reported diagnostic message.

#### Scenario: Context loss shows an interrupted state without an uncaught error
- **WHEN** the galaxy graph's rendering context is lost at runtime
- **THEN** the graph's canvas region shows an interrupted state
- **AND** no uncaught error is thrown

#### Scenario: A restored context resumes without navigation
- **WHEN** a lost rendering context is restored
- **THEN** the galaxy graph resumes rendering
- **AND** no page navigation occurs

#### Scenario: A restored context's first frame reflects live state, not a stale one
- **WHEN** a lost rendering context is restored
- **THEN** the graph's redraw is invoked with the post-restore world time
  and the latest system/fleet read
- **AND** no pre-loss image is retained

#### Scenario: A context that never restores keeps the interrupted state with a retry affordance
- **WHEN** a rendering context is lost and is not restored
- **THEN** the interrupted state persists
- **AND** a retry affordance is offered

#### Scenario: Invoking the retry affordance attempts to re-establish the context
- **WHEN** the retry affordance is invoked while the interrupted state is
  shown
- **THEN** the system attempts to create a new rendering context for the
  galaxy graph

#### Scenario: Retrying releases the prior attempt's resources first
- **WHEN** the retry affordance is invoked
- **THEN** any renderer resources and event listeners from the previous
  failed or lost context are released before a new context is created
- **AND** no more than one live rendering context is held for the graph's
  canvas at any time

#### Scenario: A successful retry resumes the live galaxy graph
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation succeeds
- **THEN** the galaxy graph resumes rendering
- **AND** no page navigation occurs

#### Scenario: A retry that fails again keeps the interrupted state retriable
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation fails
- **THEN** the interrupted state persists
- **AND** the retry affordance remains available for another attempt

#### Scenario: The retry affordance prevents duplicate concurrent attempts
- **WHEN** the retry affordance is invoked
- **THEN** it is disabled and shows an in-progress indication until the
  attempt resolves
- **AND** any invocation while disabled starts no further attempt

#### Scenario: A second context loss while already interrupted is a no-op state change
- **WHEN** the galaxy graph's rendering context is lost again while the
  interrupted state is already shown
- **THEN** the galaxy graph remains in the interrupted state
- **AND** no duplicate listener registration or in-flight context-creation
  attempt is started

#### Scenario: In-flight selection survives a context loss
- **WHEN** the galaxy graph's rendering context is lost at runtime while a
  system or fleet selection is active
- **THEN** the selection remains shown in the intel panel/inspector once the
  interrupted state is displayed
- **AND** a subsequent restore resumes the galaxy graph with that same
  selection still active

#### Scenario: Renderer failures are recorded distinguishably by cause
- **WHEN** a rendering context fails to be created, is lost, or fails to
  restore
- **THEN** a diagnostic entry is emitted to the client error log naming
  which of the three occurred and, when available, the browser-reported
  diagnostic message (e.g. `webglcontextcreationerror`'s `statusMessage`)
- **AND** the recording does not itself throw or block the unsupported/
  interrupted state from rendering

#### Scenario: WebGPU device loss requires explicit recreation
- **GIVEN** the view has presented frames using WebGPU
- **WHEN** its GPU device is lost
- **THEN** drawing stops and the interrupted state preserves the current selection and surrounding panel state
- **AND** no automatic retry or context-restoration wait begins
- **AND** invoking retry recreates the renderer and its first successful frame uses the newest available view data without navigation

#### Scenario: Asynchronous retry rejection remains contained
- **GIVEN** a device loss has interrupted the view
- **WHEN** retry's asynchronous initialization rejects after both backends fail
- **THEN** the interrupted state remains retriable with surrounding panels usable
- **AND** no rejection escapes and no second attempt starts while retry is pending

### Requirement: Renderer Unavailability States Are Accessible
WHEN the galaxy graph's canvas region shows the unsupported or interrupted
state, the system SHALL convey the change to assistive technology through a
live region naming the state and its cause, SHALL make any retry affordance
reachable via Tab and activatable via Enter or Space, and SHALL move focus
to the retry affordance (or, when none is shown, to the state's explanatory
text) if focus was within the canvas region at the moment the state
appeared. That focus-preservation clause applies only while the canvas
region contains a focusable element to lose focus from at the moment of
transition.

#### Scenario: The state change is announced to assistive technology
- **WHEN** the galaxy graph's canvas region transitions into the unsupported
  or interrupted state
- **THEN** a live region conveys the state change and its named cause
  without requiring the player to navigate to it

#### Scenario: The retry affordance is keyboard-operable
- **WHEN** the interrupted or unsupported state offers a retry affordance
- **THEN** a keyboard-only player can reach it via Tab
- **AND** activate it via Enter or Space

#### Scenario: Focus does not get lost when the canvas region changes under the player
- **GIVEN** the graph's canvas region contains a focusable element at the
  moment the unsupported or interrupted state replaces it
- **WHEN** focus is within that element
- **THEN** focus moves to the retry affordance, or to the state's
  explanatory text if no retry affordance is shown
- **AND** focus is never silently dropped to the document body

### Requirement: Bridge Lane Rendering Is Visually Distinct

The galaxy view SHALL render lanes carrying the `bridge` marker visually
distinct from ordinary lanes (a fainter/differentiated style), so
void-crossing routes read differently from local roads. The galaxy view
offers no route preview or travel-commit interaction on any lane, bridge or
ordinary — a lane crossing is commanded as a single-hop `jump` from the
roster panel, not by interacting with a lane in this view (design.md
Decision 10, Decision 12).

#### Scenario: A bridge lane renders distinctly

- **WHEN** the galaxy view renders a charted lane whose `bridge` flag is set
- **THEN** its visual style differs from ordinary charted lanes

### Requirement: A Galaxy Link's Id Is Its Lane's Stable Id
A galaxy graph read's lane entry SHALL carry, as its `id`, the same stable
lane id `POST /v1/fleets/:fleetId/jump` accepts for that crossing — the
same id `system-interior`'s *Lane-Gate Bodies Carry Their Lane Id* serves
on that crossing's gate bodies (`galaxy.LaneIdBetween`, order-independent
over the unordered endpoint pair, is the sole derivation all three
surfaces agree on). One id names a lane, everywhere it is read or acted
on. A golden fixture file under `fixtures/` SHALL pin this equality,
governed by `cross-stack-determinism`'s Go-sole-authority regime
(`backend/galaxy` has no TypeScript mirror): a `fixtures/galaxy/` cases
file asserted across the Go build-target matrix, an accompanying
anti-mirror `mirror-map.json` with an empty `sharedNames` allowlist, and a
corresponding invocation in the repository's mirror-map check. The cases
SHALL include, at minimum: an ordinary lane between adjacent
positive-coordinate systems; a lane with at least one negative-coordinate
endpoint; a **bridge** lane (`Lane.Bridge == true`); and both orderings of
one endpoint pair, asserting the same id.

#### Scenario: A galaxy link's id matches the lane id the jump endpoint accepts
- **GIVEN** a lane crossing between two systems and a fleet attached to
  that crossing's gate body
- **WHEN** that lane's link is read from `GET /v1/galaxy` and its `id` is
  passed as `POST /v1/fleets/:fleetId/jump`'s `laneId`
- **THEN** the jump commits against that same crossing, with no id
  translation

#### Scenario: A galaxy link's id matches its gate bodies' served lane id
- **GIVEN** a lane crossing between two systems
- **WHEN** that lane's link `id` (from `GET /v1/galaxy`) is compared
  against the `laneId` served on either endpoint system's lane-gate body
  (`system-interior`: *Lane-Gate Bodies Carry Their Lane Id*)
- **THEN** the two ids are identical

#### Scenario: A cross-stack fixture pins the equality under the Go-sole-authority regime
- **WHEN** the Go build-target matrix runs the `fixtures/galaxy/` cases
- **THEN** each case asserts that the galaxy link's `id` equals
  `LaneIdBetween` of the crossing's two endpoint system ids, covering an
  ordinary lane, a negative-coordinate endpoint, a bridge lane, and both
  endpoint orderings of one pair
- **AND** a future divergence between the two derivations fails that
  fixture, with no TypeScript mirror to keep in sync (anti-mirror
  `mirror-map.json`, empty `sharedNames`)

### Requirement: Jump Commit
The system SHALL, when the jump command is invoked for a fleet attached to
a lane-gate body, submit a jump order for that fleet naming that gate's
lane id, resolved from a source that is neither filtered by nor derived
from the corporation's charted-lane set — the fleet's own read
(`fleet-movement`: *Fleet Read Serves the Attached Gate's Lane Id*), with
no second read — never `GET /v1/galaxy`'s `links[]`, which ships only
charted lanes and is not refreshed by a gate attachment, so a fleet that
has just attached (and whose lane the server has therefore just charted)
is precisely the case that source cannot serve. The command SHALL NOT be a
no-op or a client-side refusal for any gate the fleet is attached to. The
server's distinguishable jump-rejection reasons include, at minimum: not
attached to the named gate; already in lane transit; lane not incident to
the fleet's current system; and the destination's lane horizon could not
be materialized (retryable). A jump against a fleet the requester's
corporation does not own is deliberately NOT among them: it is a bare
`404` indistinguishable from a nonexistent fleet (`fleet-movement`: *Fleet
Command Endpoints Are Restricted to the Owning Corporation*), and
therefore falls to the generic fallback copy rather than to a mapped
reason. On success it SHALL show a success toast, and on failure an
error toast whose copy is mapped from the server's distinguishable
rejection reason (`docked-fleet-actions`: *Rejection Reasons Map to
Player-Facing Copy, Not Raw Server Text*), never the raw reason string,
leaving the fleet's row unchanged.

#### Scenario: A gate absent from the fetched galaxy graph still commits
- **GIVEN** a fetched galaxy graph whose `links[]` is empty and a fleet
  attached to a lane-gate body
- **WHEN** the jump command is invoked on that fleet's roster row
- **THEN** a jump order is submitted naming that gate's lane id, neither
  refused client-side nor a no-op

#### Scenario: The jump command is offered for a gate absent from the graph
- **GIVEN** a fetched galaxy graph whose `links[]` is empty and a fleet
  attached to a lane-gate body
- **WHEN** that fleet's roster row is shown on the galaxy view
- **THEN** the jump command is offered (`fleet-roster`: *The Roster Row Is
  the Fleet Command Surface, Jump Gated by Attachment Alone*)

#### Scenario: A failed jump commit toasts the reason
- **WHEN** the jump command fails (for example: not attached, already in
  lane transit)
- **THEN** an error toast surfaces mapped, player-facing copy for the
  server's rejection reason and the fleet's row is unchanged

#### Scenario: A jump against a fleet the requester does not own toasts generically
- **WHEN** the jump command is invoked against a fleet the requester's
  corporation does not own
- **THEN** the generic fallback toast is shown, with no copy that would
  distinguish the fleet from one that does not exist

#### Scenario: A destination-not-ready rejection toasts as retryable, not generically
- **WHEN** the jump command fails with the server's
  destination-lane-horizon-could-not-be-materialized reason
- **THEN** the error toast surfaces that reason's own mapped copy, telling the
  player the jump can be retried — not the generic fallback used for a
  response carrying no distinguishable reason

#### Scenario: A failure with no distinguishable reason still toasts safely
- **WHEN** the jump command fails with a response carrying no mapped
  rejection reason (for example a **bodyless** `5xx`)
- **THEN** a generic, non-technical error toast is shown and the fleet's
  row is unchanged

### Requirement: Animation Never Re-Renders the Galaxy View, and Never Starves a Navigation
The galaxy view SHALL NOT, by itself, cause any component of its tree to
render because an animation frame has passed: the live world time it projects
SHALL NOT be held in component state, in a React external store, or in any
other value a component subscribes to per frame, and no effect SHALL write
component state in response to a per-frame value. A frame-rate subscription
in a leaf is the same default-priority update at a smaller scope, and is
equally prohibited. This view's clock drives no picture at all — its only
consumer is the fleet roster's countdowns and command gating (`fleet-roster`)
— so a per-frame render here buys nothing and costs a navigation.

Every figure this view presents that counts in time, and every roster command
whose availability turns on a served instant passing, SHALL update within one
wall-clock second of that instant, and SHALL NOT require a per-frame render to
do so.

An in-app navigation issued from this view while it is mounted — the drill-in
to a system's space view (*Drill-In Navigation to the System Board*), and the
roster's burn redirect, which sends a fleet's burn command to that fleet's
system view (`fleet-roster`'s *The Roster Row Is the Fleet Command Surface
Where the Mounting View Provides None, Jump Gated by Attachment Alone*) —
SHALL commit, and SHALL arrive within 20 seconds of the action that requested
it — a ceiling taken from the journey budget this defect was measured against
(`defect-cross-system-chevron-nav-stall.md`), not a target, and not to be
relaxed. A route transition renders at a lower priority than an ordinary
state update; `system-space-view`'s own cross-system navigation — sharing
this mechanism by construction — measured 4 of 6 solo repeats failing to
arrive within 20 seconds with the per-frame update in place, and 0 of 6 with
it silenced (`defect-cross-system-chevron-nav-stall.md`); this view's own
navigations have not been separately measured (this change's proposal,
"Unmeasured, stated"). This view SHALL NOT be the reason a requested
navigation fails to arrive. A roster row's *selection* on this view SHALL
continue to select and reframe without navigating.

The world time this view projects SHALL be extrapolated at the served
world-clock scale — the same scale it hands the roster for formatting — never
at an assumed scale of 1. A clock advancing at one rate while its countdowns
are formatted at another disagrees with itself the moment a world runs at any
scale but 1. WHILE no world-clock scale has been served — the own-fleets
read has not yet landed, so the only served world time is the galaxy read's,
which carries no scale — the view SHALL hold the last served world instant
rather than projecting it forward at an assumed rate, the same protection
`system-console`'s clock cell takes.

#### Scenario: Frames pass without the galaxy view rendering
- **GIVEN** the galaxy view is mounted with its reads settled and no input,
  refetch, or coarse tick occurring
- **WHEN** several animation frames elapse
- **THEN** the view's component tree has not rendered in that interval

#### Scenario: A roster countdown advances without a per-frame render
- **GIVEN** an own fleet is burning with a served arrival in the future
- **WHEN** two wall-clock seconds elapse with no read landing
- **THEN** that fleet's roster row countdown's raw span (`data-raw`) has
  decreased by the elapsed world-millisecond span
- **AND** the view rendered no more than three times in that interval

#### Scenario: A drill-in issued while the view animates arrives
- **WHEN** "Enter system" is invoked for a selected system while the view is
  mounted and animating
- **THEN** the browser arrives at that system's space-view route within 20
  seconds of the invocation

#### Scenario: A roster burn redirect from the galaxy view commits while the graph animates
- **GIVEN** the galaxy graph is mounted and animating
- **WHEN** a fleet's burn command is invoked from the roster on this view
- **THEN** the browser arrives at that fleet's system route within 20 seconds
  of the command

#### Scenario: The projected clock runs at the served scale
- **GIVEN** a world whose simulation clock runs at a scale other than 1
- **WHEN** the view projects world time for the roster between reads
- **THEN** it projects at the scale the read served — the same scale it passes
  to the roster for formatting

#### Scenario: The projected clock holds when no scale has been served
- **GIVEN** the view has a served world time but no served scale
- **WHEN** wall-clock time passes with no read landing
- **THEN** the projected world time holds at the last served instant

