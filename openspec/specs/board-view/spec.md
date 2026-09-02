# Board View Specification

## Purpose
The frontend's per-system tactical view (`/systems/[systemId]`): renders a
system's fogged interior on the polar ring-and-slot lattice, lets the player
select a body, cell, fleet, or lane gate, previews the order that selection
would commit (a led intercept, a direct burn, or a graph-tier departure), and
commits move/scan/cancel/travel verbs — kept in lockstep with the server via a
set of realtime refetch rules, never a client-side simulation of outcomes the
server hasn't confirmed. A position on this board is a `{ring, slot}` cell,
drawn as an annular sector; the star occupies the single core cell,
`{ring: 0, slot: 0}`.
## Requirements
### Requirement: System Board Route and Data Fan-In

The system SHALL render `/systems/:systemId` by reading the system's
interior — an unfogged interim read (design.md Decision 11: every feature
is served live to any authenticated requester until link 5 replaces this
with a `disclosure` projection) — disabled until a non-empty system id is
known; SHALL show a loading state while that read is in flight, or, while
the board's rendering context is available and uninterrupted, until it has
produced its first rendered frame; and SHALL show an error state (with the
underlying error message when available) if the interior read fails. The
board fetches no fleet data (design.md Decision 12). The unsupported and
interrupted states defined by `### Requirement: Renderer Unavailability Is
an Explicit State` and `### Requirement: Lost Rendering Context Recovers
Without Navigation` (both `add-renderer-availability-states`) take
precedence over this loading state: once either fires, the board shows
that state, not the loading placeholder, regardless of whether a first
frame has ever been produced.

#### Scenario: Loading state before data arrives

- **WHEN** the system board route is opened and its data has not yet
  loaded
- **THEN** a loading placeholder is shown

#### Scenario: Error state on a failed interior read

- **WHEN** the interior read fails
- **THEN** an error panel is shown instead of the board

#### Scenario: Loading persists through first frame after data arrives

- **WHEN** the interior read has completed and the board's rendering
  context is available and uninterrupted, but it has not yet produced its
  first frame
- **THEN** the loading placeholder remains shown rather than an empty or
  black canvas

#### Scenario: An unsupported rendering context takes precedence over the loading placeholder

- **WHEN** the interior read has completed but the board's rendering
  context cannot be created
- **THEN** the board's canvas region shows the unsupported state, not the
  loading placeholder

### Requirement: Toggle-to-Deselect Single Selection

The system SHALL maintain exactly one selection at a time, among a
feature, a bare cell, or a lane gate; selecting the currently selected item
again SHALL clear the selection (deselect) rather than re-select it;
selecting a different item of any kind SHALL replace the current
selection. The board draws no fleet layer, so a fleet is never a member of
this selection set (design.md Decision 12).

#### Scenario: Re-selecting the same feature deselects it

- **WHEN** a feature is selected and then clicked again
- **THEN** the selection becomes empty

#### Scenario: Selecting a hex replaces a feature selection

- **WHEN** a feature is selected and a bare cell is then clicked
- **THEN** the selection becomes that cell, and the feature is no longer
  selected

#### Scenario: Clicking board background clears the selection

- **WHEN** a feature is selected and a point on the board outside the
  lattice is clicked
- **THEN** the selection becomes empty

### Requirement: Departure Hand-Off to the Galaxy View
The system SHALL, when an own fleet that was being watched on this board
transits its departure gate (leaving it with no cell on this board), navigate
away from the board to the galaxy view, so the player follows their fleet
onto the lane crawl it now belongs to — but SHALL NOT navigate away merely
because a fleet already elsewhere is in transit when the board is opened
(only a departure actually watched on this board triggers the hand-off).

#### Scenario: Watching a fleet depart navigates to the galaxy view
- **WHEN** an own fleet on this board's departure gate transit completes
  while the board is open and being watched
- **THEN** the view navigates to the galaxy route

#### Scenario: Opening a board with an already-departed fleet does not navigate
- **WHEN** the board is opened for a system where an own fleet is already
  mid-lane-transit (departed before this board was opened)
- **THEN** no automatic navigation occurs

### Requirement: Fleet Roster Cross-Navigation
The system SHALL, via the shared fleet roster panel, make selecting a row
for a fleet on the current board set it as the acting fleet and select it;
selecting a row for a fleet in a different system navigate to that
system's board; and selecting a row for a fleet with no current board
presence (out on a lane) navigate to the galaxy view.

#### Scenario: Selecting a fleet in another system navigates there
- **WHEN** a roster row for an own fleet located in a different system is
  selected
- **THEN** the view navigates to that system's board route

#### Scenario: Selecting a fleet with no board presence navigates to the galaxy
- **WHEN** a roster row for an own fleet currently out on a lane (no board
  cell) is selected
- **THEN** the view navigates to the galaxy route

### Requirement: Mine Offer on the Docked Fleet
The system SHALL offer the mine verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a feature
carrying at least one visible resource AND the fleet's movement channel is
free (no running mine, not burning) — anchored to the fleet's docked
state, requiring no board selection: a fleet can only mine what it is
docked to, so selecting the body underneath it (which its own glyph
occludes) is never a precondition. The offer SHALL present a resource-kind
picker limited to the docked feature's visible resource kinds, defaulting
to the richest, and a tonnage input defaulting to the fleet's free hold
and constrained to a positive value no greater than the free hold.

#### Scenario: Mine is offered while docked at a resource-bearing body
- **WHEN** the acting fleet's effective state is `docked` to a feature
  carrying visible resources
- **THEN** the fleet panel offers the mine verb with a kind picker and a
  tonnage input defaulted to the fleet's free hold, with no board
  selection required

#### Scenario: Mine is not offered when merely co-located, not docked
- **WHEN** the acting fleet is parked at or near a resource feature's
  position but its effective state is not `docked` to it
- **THEN** the mine verb is not offered

#### Scenario: Mine is not offered when the docked body has no visible resources
- **WHEN** the acting fleet is docked to a feature that carries no visible
  resources
- **THEN** the mine verb is not offered

#### Scenario: Tonnage input clamps to free hold
- **WHEN** a tonnage greater than the fleet's free hold is entered
- **THEN** the input clamps the value to the free hold

### Requirement: Mine ETA Preview From the Served Mining Rate
The system SHALL, while the mine offer is shown, preview the run's duration
as the entered tonnage divided by the fleet's served derived mining rate
(from the fleet read's roster fields), recomputed live as the tonnage or
kind selection changes; after commit, countdowns SHALL use the ETA frozen
on the returned action, not the client preview.

#### Scenario: The preview tracks the tonnage input
- **WHEN** the tonnage input value changes
- **THEN** the previewed duration updates to the new tonnage divided by the
  fleet's served mining rate

#### Scenario: The committed countdown uses the server's ETA
- **WHEN** a mine run commits successfully
- **THEN** the running countdown derives from the action's returned ETA,
  not from the pre-commit client preview

### Requirement: Mine Commit
The system SHALL, when the mine command is invoked with a chosen kind and
tonnage, submit the mine order against the acting fleet's docked feature;
on success it SHALL show a success toast and arm the ETA refetch; on
failure it SHALL show an error toast carrying the server's distinguishable
rejection reason and leave the offer's state unchanged.

#### Scenario: A successful mine commit arms the countdown
- **WHEN** the mine command succeeds
- **THEN** a success toast is shown and a refetch is armed for the run's
  ETA

#### Scenario: A failed mine commit toasts the reason
- **WHEN** the mine command fails (for example: over free hold, depleted
  lode, busy movement slot)
- **THEN** an error toast surfaces the server's rejection reason and the
  offer remains available

### Requirement: Fleet Panel Hold Readout
The system SHALL show, for the acting (own) fleet, a hold readout derived
from the fleet read's owner-only roster fields: cargo contents by resource
kind and used versus total capacity; the readout SHALL reflect the
post-resolution cargo after a mine run resolves (via the board's refetch
rules), without requiring navigation.

#### Scenario: The hold readout shows contents and capacity
- **WHEN** the board renders an acting fleet whose fleet read carries
  roster fields
- **THEN** the fleet panel shows cargo tons by kind and the used/total
  hold capacity

#### Scenario: The hold visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the board's refetch lands the
  updated fleet read
- **THEN** the hold readout shows the credited cargo without a page
  navigation

### Requirement: Renderer Unavailability Is an Explicit State
IF a rendering context for the board cannot be created, THEN the system
SHALL show an explicit unsupported state in place of the board's canvas
region, naming the failure as a browser- or graphics-hardware-capability
problem — never raw diagnostic text, a stack trace, or a GPU vendor/model
string — rather than an empty stage or an uncaught error, and SHALL offer a
retry affordance that attempts to re-establish the context.

The facts panel and the fleet roster SHALL remain mounted and usable while
the unsupported state is shown: a verb anchored to the acting fleet's own
state (docked, burning, or a running action) rather than to a board
selection SHALL remain invokable through the facts panel without requiring
a board selection — today: scan, mine, cancel-burn, cancel-mine. A control
in the surrounding panels whose only effect is on the unavailable canvas
SHALL be disabled or hidden while the unsupported or interrupted state is
shown, rather than presented as operable. The facts panel's selection
prompt SHALL NOT instruct the player to select a body, tile, or gate while
no canvas exists to select one on.

An error thrown while constructing, listening to, or retrying the board's
rendering context SHALL be contained to the board's canvas region: caught by a
boundary scoped to that region when the error is thrown during render or
commit, and by a local handler when the error is thrown inside a context-
loss/restore listener or an animation-frame callback (neither is reachable
by a React error boundary at any placement) — leaving the facts panel, the
fleet roster, and the system board view container mounted and usable.

The unsupported and interrupted states SHALL take precedence over the
board's data-loading and first-frame-pending states: once a rendering
context cannot be created, a loading placeholder SHALL NOT continue to be
shown in the board's canvas region. This state is triggered by a client
rendering-capability failure, never by a failure of the interior or fleet
data reads.

#### Scenario: Context creation failure shows a named unsupported state
- **WHEN** a rendering context for the board cannot be created
- **THEN** the board's canvas region shows an explicit unsupported state
  naming WebGL or GPU unavailability as the cause
- **AND** no uncaught error is thrown

#### Scenario: Surrounding board affordances remain usable
- **WHEN** the board's canvas region shows the unsupported or interrupted state
- **THEN** the facts panel and the fleet roster remain mounted and interactive
- **AND** a verb anchored to the acting fleet's own state rather than to a
  board selection remains invokable through the facts panel without
  requiring a board selection — today: scan, mine, cancel-burn, cancel-mine

#### Scenario: A canvas-only control is disabled while the canvas is unavailable
- **WHEN** the board's canvas region shows the unsupported or interrupted
  state
- **THEN** a control whose only effect is on the board canvas is disabled
  or hidden, not presented as operable

#### Scenario: Move and departure verbs are unreachable without the canvas
- **WHEN** the board's canvas region shows the unsupported or interrupted
  state AND no target is already selected
- **THEN** the facts panel's selection prompt SHALL NOT instruct the player
  to select a body, tile, or gate
- **AND** the facts panel indicates that choosing a move or departure target
  requires the board to be available

#### Scenario: The unsupported state is independent of the interior data read
- **WHEN** the system interior and fleet reads succeed but the rendering
  context cannot be created
- **THEN** the board's canvas region shows the unsupported state, not the
  interior-read error state

#### Scenario: A failed data read takes precedence over the unsupported state
- **WHEN** the interior or fleet read fails and the rendering context also
  cannot be created
- **THEN** the interior-read error panel is shown with its underlying
  message
- **AND** no unsupported state is shown

#### Scenario: The system board view container remains present
- **WHEN** the unsupported state is shown
- **THEN** the system board view container is still rendered, with the
  unsupported state occupying only the canvas region within it

#### Scenario: The unsupported state offers a retry affordance
- **WHEN** the board's canvas region shows the unsupported state
- **THEN** a retry affordance is offered
- **AND** invoking it attempts to create a new rendering context
- **AND** a successful attempt resumes rendering the live board
- **AND** a failed attempt keeps the unsupported state, retriable again

#### Scenario: The displayed cause is a user-actionable category, not raw diagnostic text
- **WHEN** the unsupported or interrupted state names the cause to the player
- **THEN** the text identifies the failure as a browser or graphics-hardware
  capability problem
- **AND** it does not display raw exception text, stack traces, or GPU
  vendor/model strings

#### Scenario: An unexpected rendering error is contained to the canvas region
- **WHEN** an error is thrown while constructing, listening to, or retrying
  the board's rendering context — including an error not otherwise named by
  this requirement
- **THEN** the error is contained to the board's canvas region — caught by
  the region's error boundary when it is thrown during render or commit,
  and by a local handler when it is thrown inside a context-loss/restore
  listener or an animation-frame callback
- **AND** the facts panel, the fleet roster, and the system board view
  container remain mounted and usable

### Requirement: Lost Rendering Context Recovers Without Navigation
WHEN the board's rendering context is lost at runtime, the system SHALL show
an interrupted state in the board's canvas region without an uncaught error;
WHEN the lost context is restored, the system SHALL resume rendering the
live board — reflecting current world time and feature/fleet state, never a
stale pre-loss frame — without a page navigation; and IF the context is not
restored, the interrupted state SHALL persist and SHALL offer a retry
affordance that attempts to re-establish the rendering context. Restore
failure means an error thrown while re-establishing rendering after
`webglcontextrestored` fires; a context that simply never restores is not
itself a recordable failure event. Retrying SHALL release the prior
attempt's renderer resources and event listeners before creating a new
context, and SHALL hold no more than one live rendering context for the
board's canvas at any time. Once invoked, the retry affordance SHALL be
disabled and show an in-progress indication until the attempt resolves; any
invocation while disabled SHALL start no further attempt. A second context
loss arriving while the interrupted state is already shown SHALL leave the
board in the interrupted state without duplicating listener registration or
starting a second in-flight creation attempt. A board selection or a typed
mine tonnage value active at the moment of context loss SHALL remain shown
in the facts panel throughout the interrupted state and SHALL still be
active once the board resumes. Each context-creation failure, context loss,
and restore failure SHALL be recorded distinguishably by cause: a
diagnostic entry emitted to the client error log naming which of the three
occurred and, when available, the browser-reported diagnostic message.

#### Scenario: Context loss shows an interrupted state without an uncaught error
- **WHEN** the board's rendering context is lost at runtime
- **THEN** the board's canvas region shows an interrupted state
- **AND** no uncaught error is thrown

#### Scenario: A restored context resumes without navigation
- **WHEN** a lost rendering context is restored
- **THEN** the board resumes rendering the live board
- **AND** no page navigation occurs

#### Scenario: A restored context's first frame reflects live state, not a stale one
- **WHEN** a lost rendering context is restored
- **THEN** the board's redraw is invoked with the post-restore world time
  and the latest feature/fleet read
- **AND** no pre-loss image is retained

#### Scenario: A context that never restores keeps the interrupted state with a retry affordance
- **WHEN** a rendering context is lost and is not restored
- **THEN** the interrupted state persists
- **AND** a retry affordance is offered

#### Scenario: Invoking the retry affordance attempts to re-establish the context
- **WHEN** the retry affordance is invoked while the interrupted state is
  shown
- **THEN** the system attempts to create a new rendering context for the
  board

#### Scenario: Retrying releases the prior attempt's resources first
- **WHEN** the retry affordance is invoked
- **THEN** any renderer resources and event listeners from the previous
  failed or lost context are released before a new context is created
- **AND** no more than one live rendering context is held for the board's
  canvas at any time

#### Scenario: A successful retry resumes the live board
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation succeeds
- **THEN** the board resumes rendering the live board
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
- **WHEN** the board's rendering context is lost again while the interrupted
  state is already shown
- **THEN** the board remains in the interrupted state
- **AND** no duplicate listener registration or in-flight context-creation
  attempt is started

#### Scenario: In-flight selection and typed input survive a context loss
- **WHEN** the board's rendering context is lost at runtime while a board
  selection is active or a mine tonnage value has been typed
- **THEN** the selection and the typed value remain shown in the facts panel
  once the interrupted state is displayed
- **AND** a subsequent restore resumes the board with that same selection
  still active

#### Scenario: Renderer failures are recorded distinguishably by cause
- **WHEN** a rendering context fails to be created, is lost, or fails to
  restore
- **THEN** a diagnostic entry is emitted to the client error log naming
  which of the three occurred and, when available, the browser-reported
  diagnostic message (e.g. `webglcontextcreationerror`'s `statusMessage`)
- **AND** the recording does not itself throw or block the unsupported/
  interrupted state from rendering

### Requirement: Renderer Unavailability States Are Accessible
WHEN the board's canvas region shows the unsupported or interrupted state,
the system SHALL convey the change to assistive technology through a live
region naming the state and its cause, SHALL make any retry affordance
reachable via Tab and activatable via Enter or Space, and SHALL move focus
to the retry affordance (or, when none is shown, to the state's explanatory
text) if focus was within the canvas region at the moment the state
appeared. That focus-preservation clause applies only while the canvas
region contains a focusable element to lose focus from at the moment of
transition.

#### Scenario: The state change is announced to assistive technology
- **WHEN** the board's canvas region transitions into the unsupported or
  interrupted state
- **THEN** a live region conveys the state change and its named cause
  without requiring the player to navigate to it

#### Scenario: The retry affordance is keyboard-operable
- **WHEN** the interrupted or unsupported state offers a retry affordance
- **THEN** a keyboard-only player can reach it via Tab
- **AND** activate it via Enter or Space

#### Scenario: Focus does not get lost when the canvas region changes under the player
- **GIVEN** the board's canvas region contains a focusable element at the
  moment the unsupported or interrupted state replaces it
- **WHEN** focus is within that element
- **THEN** focus moves to the retry affordance, or to the state's
  explanatory text if no retry affordance is shown
- **AND** focus is never silently dropped to the document body

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

### Requirement: Sell Offer on the Docked Fleet
The system SHALL offer the sell verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a station and
the fleet's cargo pool holds at least one kind of tonnage — anchored to the
fleet's docked state, requiring no board selection, mirroring `### Requirement:
Mine Offer on the Docked Fleet`'s anchoring rationale (a fleet can only
sell what it is docked to and currently holds). The offer SHALL present a
resource-kind picker limited to kinds the fleet currently holds AND that
the station is configured to buy (excluding a kind with no configured floor
for the station's region, so the picker never offers a guaranteed-fail
selection), defaulting to the kind with the greatest held tonnage among
those eligible, and a tonnage input defaulting to the fleet's full held
tonnage of the selected kind, constrained to a positive value no greater
than that held tonnage, alongside a live proceeds preview computed by
folding the selected tonnage across the station's demand entries for the
selected kind (per `goods-sale`'s "Settlement Folds Tonnage Across a
Venue's Ordered Demand Entries" and per-portion rounding rule), pinned to
the exact same fold and rounding the server settlement uses via the shared
`fixtures/market/cases.json` golden (design.md Decision 22) — so a player
is never shown a split or a total the settlement won't honor.

#### Scenario: Sell is offered while docked at a station with cargo aboard
- **WHEN** the acting fleet's effective state is `docked` to a station and
  its cargo pool holds at least one kind of tonnage
- **THEN** the fleet panel offers the sell verb with a kind picker and a
  tonnage input, with no board selection required

#### Scenario: Sell is not offered when merely co-located, not docked
- **WHEN** the acting fleet is parked at or near a station's position but
  its effective state is not `docked` to it
- **THEN** the sell verb is not offered

#### Scenario: Sell is not offered when the cargo pool is empty
- **WHEN** the acting fleet is docked to a station but its cargo pool holds
  no tonnage of any kind
- **THEN** the sell verb is not offered

#### Scenario: Tonnage input clamps to held tonnage of the selected kind
- **WHEN** a tonnage greater than the fleet's held tonnage of the selected
  kind is entered
- **THEN** the input clamps the value to that held tonnage

#### Scenario: The proceeds preview reflects the served quote
- **WHEN** the tonnage or kind selection changes while the sell offer is
  shown
- **THEN** the previewed proceeds update to reflect the served quote for
  the newly selected kind and tonnage

#### Scenario: A kind with no configured floor at this station is excluded from the picker
- **WHEN** the acting fleet holds a kind for which the docked station's
  region has no configured floor price
- **THEN** that kind does not appear in the sell offer's kind picker, even
  though the fleet holds tonnage of it

#### Scenario: A split-fill preview matches the settlement fold exactly
- **WHEN** the selected tonnage exceeds the station's highest-priority open
  demand entry's remaining quantity for the selected kind
- **THEN** the preview's reported per-entry portions and total proceeds are
  the exact values the shared fixture (`fixtures/market/cases.json`) pins
  for that case, identical to what the server's settlement would apply

### Requirement: Sell Commit
The system SHALL, when the sell command is invoked with a chosen kind and
tonnage, submit the sale against the acting fleet's docked station; on
success it SHALL show a success toast and refresh the fleet's hold and the
requester's credit balance without requiring navigation; on failure it
SHALL show an error toast carrying player-facing copy mapped from the
server's distinguishable rejection reason and leave the offer's state
unchanged — except for a "price changed" (slippage guard) rejection, which
SHALL instead refresh the offer to the server's current applicable price(s)
and proceeds total, showing that refreshed figure alongside the one the
player originally expected, so the player can accept or abandon the new
price from inside the flow without re-navigating; re-committing after such
a refresh SHALL use a newly generated operation key (a re-priced sale is a
new intent, never a retry of the old one).

#### Scenario: A successful sale refreshes hold and balance
- **WHEN** the sell command succeeds
- **THEN** a success toast is shown, and the fleet's hold readout and the
  requester's credit balance both reflect the sale's effect without a page
  navigation

#### Scenario: A failed sale toasts player-facing copy, not raw server text
- **WHEN** the sell command fails (for example: over-held tonnage, no
  configured floor for the kind, or a budget/absorption limit)
- **THEN** an error toast surfaces player-facing, actionable copy mapped
  from the server's distinguishable rejection reason (never the raw
  sentinel-error string verbatim), and the offer remains available for
  retry

#### Scenario: A price-changed rejection refreshes the offer instead of freezing it
- **WHEN** the sell command fails with the "price changed" slippage
  rejection
- **THEN** the offer refreshes to the server's current applicable price(s)
  and total proceeds, displaying that figure alongside the player's
  originally expected one, rather than leaving the stale pre-rejection
  offer on screen

#### Scenario: Re-committing a re-priced sale uses a new operation key
- **WHEN** a player re-commits a sale after a price-changed refresh
- **THEN** the re-commit is submitted with a newly generated operation key,
  distinct from the original attempt's key

### Requirement: Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text
Every server-distinguishable rejection reason the sell endpoint can return
— including this capability's own `400`/`404`/`409` reasons, the
contention-retry "busy, try again" rejection, AND the per-corporation
write-quota's `429` (`request-authorization`'s "Per-Corporation Write
Quota on Player-Initiated Trade Routes") — SHALL be mapped to player-facing,
actionable copy before display; the server's raw reason string SHALL be
treated as an internal contract for distinguishing outcomes, never
displayed to the player verbatim. This corrects the current, observable
pattern (`SystemBoardView.tsx`'s `toast.error(e.message || 'Order
failed')`, used in five places today) of surfacing a raw Go sentinel-error
string (e.g. `"mine: requester does not own this fleet"`) directly to the
player.

#### Scenario: A distinguishable server reason renders as player-facing copy
- **WHEN** a market mutation fails with any of this capability's
  distinguishable server reasons
- **THEN** the displayed error text is mapped, player-facing copy, never
  the raw server reason string rendered verbatim

#### Scenario: An unmapped reason still renders safely
- **WHEN** a server rejection reason has no specific mapped copy (e.g. a
  reason added later without an accompanying copy update)
- **THEN** a generic, non-technical fallback message is shown rather than
  the raw server string

### Requirement: Sell Control Guards Against Double-Submit
The sell control SHALL be disabled from the moment of commit until the
request settles or fails, so a double-click or repeated-Enter cannot
submit two sales. Exactly one operation key SHALL be generated per
user-initiated sell attempt; that same key SHALL be reused across
transport-level retries of that one attempt (so a network retry dedups
against the original), while a freshly initiated or re-priced sell attempt
SHALL always generate a new key.

#### Scenario: A double-click yields exactly one sale
- **WHEN** the sell control is double-clicked in rapid succession
- **THEN** exactly one sale request is submitted, using one operation key

#### Scenario: A transport-level retry of the same attempt yields exactly one sale
- **WHEN** the sell command's request is retried at the transport layer
  after a lost response, without the player initiating a new attempt
- **THEN** the retry reuses the same operation key as the original attempt,
  and the settlement remains a single sale

#### Scenario: A fresh attempt after a completed sale is a second, independent sale
- **WHEN** a player completes one sale and then initiates a new sell
  command
- **THEN** the new attempt generates a new operation key, distinct from the
  completed sale's key

### Requirement: Credit Balance Readout
The system SHALL show, for the requester's own corporation, a credit
balance readout on the board, sourced from the corporation's own session
data (see `corporation-spawn`'s balance-bearing session bootstrap),
reflecting the post-settlement balance after a sale resolves via the
board's own sale-commit response, without requiring navigation, and
SHALL announce a balance change to assistive technology (an `aria-live`
region or equivalent) at the moment it updates, not solely as a visual
change.

#### Scenario: The board shows the current credit balance
- **WHEN** the board renders for an authenticated, spawned requester
- **THEN** the requester's current credit balance is shown

#### Scenario: The balance visibly updates when a sale resolves
- **WHEN** a sale settles from the board's sell commit
- **THEN** the displayed credit balance updates to reflect the sale's
  proceeds, with no page navigation

#### Scenario: A balance change is announced to assistive technology
- **WHEN** a sale settles and the credit balance readout updates
- **THEN** the updated balance is announced via an accessible live region,
  not conveyed by a purely visual change

#### Scenario: A failed sale's error is announced to assistive technology
- **WHEN** a sell command fails and an error toast is shown
- **THEN** the error's player-facing copy is announced via an accessible
  live region, not conveyed by a purely visual toast

### Requirement: The Board Renders on the Polar Lattice
The system SHALL render the tactical board on the polar ring-and-slot
lattice, drawing each lattice cell as the annular sector bounded by its
ring's inner and outer radius and by its slot's angular extent, rather than
as a hexagonal tile. Feature footprints, fleet positions, lane gates, scan
sweeps, and move-preview paths SHALL all be drawn at the positions the
shared board math resolves for their ring-and-slot coordinates, so the
board the player sees agrees with the coordinates the server computes.

#### Scenario: A lattice cell is drawn as an annular sector
- **WHEN** the board renders a system's lattice
- **THEN** each cell is drawn as an annular sector bounded by its ring's
  radii and its slot's angular extent, not as a hexagon

#### Scenario: A feature is drawn at its ring-and-slot footprint
- **WHEN** a system interior is rendered with a feature whose footprint is
  a list of ring-and-slot cells
- **THEN** the feature is drawn covering exactly those cells' positions

#### Scenario: A lane gate is drawn at its gate cell
- **WHEN** a system interior is rendered with a lane gate
- **THEN** the gate mark is drawn at the position resolved for its gate
  cell

### Requirement: Board Coordinates Are Ring-and-Slot Throughout
The system SHALL express every board coordinate it receives, renders,
selects, or submits as a ring-and-slot cell. The board SHALL treat the core
as the single cell `{ring: 0, slot: 0}` — the lattice has exactly one core
cell, occupied by the star — rather than as an origin among coplanar
neighbours.

#### Scenario: A selection resolves to a ring-and-slot cell
- **WHEN** the player selects a bare cell on the board
- **THEN** the selection identifies that cell by its ring and slot

#### Scenario: The core is a single cell
- **WHEN** the board resolves the innermost position of the lattice
- **THEN** it resolves to exactly one cell, `{ring: 0, slot: 0}`

### Requirement: Board Camera Pan and Zoom
The board's *default framing* — the framing this capability resets and
recenters to — is the fit-to-lattice framing at zoom `1×` with the pan
target at the core cell `{ring: 0, slot: 0}`: the framing the board presents on
first render before any camera input. The system SHALL let the player pan
the board's camera by pointer drag and zoom it by a wheel gesture, clamped
to a zoom range of `0.25×` to `6×` and to a pan range that confines the
camera's pan target to the lattice's bounding disc, so the board's
centre of view is always over the lattice. A wheel-zoom gesture SHALL keep
the point the camera is currently centred on fixed at the same screen
position after the zoom, rather than re-centring on the cursor or any
other point. For the purposes of `### Requirement: Board Picking Resolves
to the Entity Under the Pointer`, a pointer sequence whose movement
between press and release stays under **8 CSS pixels** SHALL resolve as a
click and SHALL NOT be treated as a pan; a pointer sequence whose movement
meets or exceeds that threshold SHALL resolve as a pan and SHALL NOT
change the selection. A pointer drag that begins over a fleet, feature, or
lane-gate mark and meets or exceeds that threshold SHALL pan the camera
exactly as a drag beginning over bare board would, and a wheel gesture
used with the pointer over such a mark SHALL zoom the camera exactly as it
would over bare board — a gesture is never dead-zoned merely because it
begins over a mark. Also for the purposes of that same requirement,
activating an on-screen camera control (the recenter control, or a
keyboard-operable pan/zoom affordance) by pointer or keyboard SHALL NOT
itself be treated as a board click for selection purposes, regardless of
any cell or mark drawn beneath it. The camera's pan and zoom state SHALL persist
unchanged across a selection change and across a realtime data refetch,
and SHALL reset to the board's default framing immediately, with no
animated or eased transition, when the route's `systemId` changes.
Regardless of the camera's current pan and zoom, hit targets for fleets,
features, and lane gates SHALL remain positioned at the marks actually
drawn, and a click on any point within the lattice that lies over no
such mark SHALL resolve to the cell containing that point — so a click
anywhere on the board, at any reachable pan and zoom, resolves to the same
entity or cell it would resolve to at the board's default framing.

#### Scenario: Pointer drag pans the camera
- **WHEN** the pointer drags across the board
- **THEN** the visible portion of the lattice shifts to follow the drag

#### Scenario: Wheel gesture zooms the camera
- **WHEN** a wheel gesture is used over the board
- **THEN** the board's visible scale changes in the scrolled direction

#### Scenario: Zooming keeps the current pan target fixed on screen
- **WHEN** a wheel-zoom gesture changes the camera's zoom level
- **THEN** the point the camera is currently centred on remains at the
  same screen position after the zoom, rather than the view re-centring
  on the cursor or any other point

#### Scenario: Zoom clamps at the minimum
- **WHEN** a wheel gesture continues zooming out past `0.25×`
- **THEN** the effective zoom stops at `0.25×` and does not decrease further

#### Scenario: Zoom clamps at the maximum
- **WHEN** a wheel gesture continues zooming in past `6×`
- **THEN** the effective zoom stops at `6×` and does not increase further

#### Scenario: Pan clamps to the lattice's bounding disc
- **WHEN** the pointer drags the camera repeatedly toward one edge of the
  lattice
- **THEN** panning stops with the camera's pan target confined to the
  lattice's bounding disc, so the board's centre of view remains over the
  lattice rather than the lattice being dragged entirely off-screen

#### Scenario: A drag that pans the camera does not change the selection
- **WHEN** a pointer drag that pans the camera is released over a fleet,
  feature, or lane-gate mark
- **THEN** the selection is unchanged

#### Scenario: A sub-threshold pointer press-release still resolves as a click
- **WHEN** a pointer press-release over a mark moves 7 CSS pixels between
  press and release
- **THEN** that mark's entity becomes the selection
- **AND** a pointer press-release over the same mark that moves 8 CSS
  pixels between press and release resolves as a pan and does not change
  the selection

#### Scenario: A gesture that begins over a mark still moves the camera
- **WHEN** a pointer drag begins over a fleet, feature, or lane-gate mark
  and meets or exceeds the movement threshold, or a wheel gesture is used
  with the pointer over such a mark
- **THEN** the camera pans and zooms exactly as it would over bare board,
  and the selection is unchanged

#### Scenario: Activating a camera control does not change the selection
- **WHEN** a camera control (recenter, or a keyboard-operable pan/zoom
  affordance) is activated by pointer or keyboard while an entity is
  selected
- **THEN** the selection is unchanged and no cell under the control becomes
  selected

#### Scenario: Camera state survives a selection change
- **WHEN** the camera has been panned or zoomed and a different entity is
  then selected
- **THEN** the camera's pan and zoom remain unchanged

#### Scenario: Camera state survives a realtime refetch
- **WHEN** the camera has been panned or zoomed and a realtime refetch
  lands updated board data
- **THEN** the camera's pan and zoom remain unchanged

#### Scenario: Camera resets when the system changes
- **WHEN** the player navigates from one system's board to a different
  system's board
- **THEN** the camera returns to that board's default framing immediately,
  with no animated or eased transition

#### Scenario: Picking survives pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a mark is then clicked at its currently drawn position
- **THEN** that mark's entity becomes the selection

#### Scenario: A bare-cell click resolves correctly after pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a point within the lattice that is over no mark is
  clicked
- **THEN** the cell containing that point becomes the selection

#### Scenario: Clicking outside the lattice still clears the selection after pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a point outside the lattice is clicked
- **THEN** the selection becomes empty

### Requirement: Board Camera Touch Pinch-Zoom
The system SHALL let the player zoom the board's camera with a two-finger
pinch gesture on a touch-capable device, clamped to the same `0.25×`–`6×`
range as wheel zoom. A pinch gesture SHALL keep the point the camera is
currently centred on fixed at the same screen position, identically to
wheel zoom, rather than anchoring on the pinch midpoint. A single-finger
touch drag SHALL pan the camera using the same behavior and pan clamp as
pointer drag. A single-finger touch that begins and ends staying under
the same **8 CSS pixel** movement threshold defined in `###
Requirement: Board Camera Pan and Zoom` SHALL be treated as a tap,
resolving to a selection identically to a pointer click, rather than a
pan; a single-finger touch that meets or exceeds that threshold SHALL
resolve as a pan — the touch-gesture suppression this requirement needs to
keep native pinch from competing with the board SHALL NOT itself prevent a
tap within that threshold from producing a selection.

#### Scenario: Pinching outward zooms in
- **WHEN** a two-finger pinch-outward gesture is performed on the board
- **THEN** the board's visible scale increases

#### Scenario: Pinching inward zooms out
- **WHEN** a two-finger pinch-inward gesture is performed on the board
- **THEN** the board's visible scale decreases

#### Scenario: Pinch zoom respects the same clamp as wheel zoom
- **WHEN** a pinch gesture continues zooming past `0.25×` or past `6×`
- **THEN** the effective zoom stops at that bound, the same as it would for
  a wheel gesture

#### Scenario: Pinch zoom keeps the centred point fixed on screen
- **WHEN** a two-finger pinch gesture changes the camera's zoom level
- **THEN** the point the camera is currently centred on remains at the
  same screen position after the zoom, rather than the view re-centring
  on the pinch midpoint

#### Scenario: A single-finger touch drag pans instead of zooming
- **WHEN** a single-finger touch drag is performed across the board
- **THEN** the camera pans, following the same behavior and pan clamp as a
  pointer drag

#### Scenario: A stationary single-finger touch selects rather than pans
- **WHEN** a single-finger touch begins and ends staying under the 8 CSS
  pixel threshold (a tap, not a drag)
- **THEN** the touch is treated as a selection input, resolving to the
  entity under it the same as a pointer click, and the camera does not pan

#### Scenario: A single-finger touch that moves past the tap threshold pans
- **WHEN** a single-finger touch moves beyond the tap threshold before
  release
- **THEN** the camera pans by the moved distance and no selection change
  occurs on release

#### Scenario: Movement at and past the tap/pan threshold resolves as a pan
- **WHEN** a single-finger touch moves exactly 8 CSS pixels between
  touchstart and touchend
- **THEN** the touch resolves as a pan, not a selection
- **AND** a touch moving 9 CSS pixels (one pixel past the threshold) also
  resolves as a pan

### Requirement: Board Camera Is Keyboard-Operable
The system SHALL let the player pan and zoom the board's camera from the
keyboard, without requiring a pointer or touch input: arrow-key input SHALL
pan the camera by one radial unit, at the camera's current zoom, per key
press, and dedicated zoom-in/zoom-out key input SHALL zoom the camera by
one wheel-notch equivalent per key press, both respecting the same clamps
as pointer and touch input. The board's keyboard-operable camera controls,
together with the recenter control, SHALL occupy the board's tab order
before the fleet, feature, and lane-gate hit targets (the port's
"features first" ordering applies among the glyph groups), leaving the
glyph group order the port's `### Requirement: Board Glyph Selection Is
Keyboard-Operable` defines intact; they SHALL be reachable via the board's
normal tab order, and SHALL be distinguishable by a visible focus
indicator while focused. WHEN keyboard focus moves, via Tab, to a fleet,
feature, or lane-gate hit target that lies outside the camera's current
pan/zoom framing, the camera SHALL pan by the minimum displacement that
brings that hit target's focus indicator fully within the visible
viewport, preserving the current zoom where pan alone suffices,
immediately and with no animated or eased transition. WHEN arrow-key pan
or zoom-key input is given while the camera is already at the pan or zoom
clamp in the direction of that input, the camera control SHALL expose an
at-limit state in the DOM (an attribute or a status message conveyed to
assistive technology) that is absent when the same input is given away
from the clamp.

#### Scenario: Arrow keys pan the camera
- **WHEN** arrow-key input is given while the board's camera controls have
  keyboard focus
- **THEN** the camera pans by one radial unit in the corresponding
  direction, respecting the same pan clamp as pointer drag

#### Scenario: Zoom keys zoom the camera
- **WHEN** zoom-in or zoom-out key input is given while the board's camera
  controls have keyboard focus
- **THEN** the camera zooms in or out by one wheel-notch equivalent,
  respecting the same `0.25×`–`6×` clamp as wheel zoom

#### Scenario: A focused camera control shows a focus indicator
- **WHEN** the board's keyboard-operable camera controls receive keyboard
  focus
- **THEN** a visible focus indicator distinguishes them from their
  unfocused state

#### Scenario: Focus moving to an off-screen glyph brings it into view
- **WHEN** keyboard focus moves (via Tab) to a fleet, feature, or
  lane-gate hit target that is outside the camera's current pan/zoom
  framing
- **THEN** the camera pans by the minimum displacement that brings that
  hit target's focus indicator fully within the visible viewport,
  preserving the current zoom where pan alone suffices, immediately and
  with no animated or eased transition

#### Scenario: Keyboard input at a clamp is distinguishable from no input
- **WHEN** arrow-key pan or zoom-key input is given while the camera is
  already at a pan or zoom clamp, in the direction of that clamp
- **THEN** the camera control exposes an at-limit state in the DOM (an
  attribute or a status message conveyed to assistive technology) that is
  absent when the same input is given away from the clamp

### Requirement: Board Camera Manual Recenter
The system SHALL offer a control, reachable via the board's normal tab
order, that resets the camera's pan and zoom to the board's default
framing on demand, immediately and with no animated or eased transition;
invoking it SHALL leave the current selection unchanged.

#### Scenario: Recenter restores default framing on demand
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and the recenter control is invoked
- **THEN** the camera returns to the board's default framing immediately,
  with no animated or eased transition

#### Scenario: Recenter is reachable from the keyboard
- **WHEN** a user tabs to the recenter control and activates it with
  Enter or Space
- **THEN** the camera returns to the board's default framing, identically
  to a pointer activation

#### Scenario: Recentering while already at default framing is a no-op
- **WHEN** the recenter control is invoked while the camera is already at
  the board's default framing
- **THEN** the camera remains at the default framing and the current
  selection is unchanged

### Requirement: Camera Controls Are Inert While the Board Is Unavailable
WHILE the board's canvas region shows the unsupported or interrupted
state, the camera controls (the keyboard-operable pan/zoom affordances and
the recenter control) SHALL NOT be rendered or reachable in the tab order,
and board camera gestures SHALL NOT intercept or suppress pointer, wheel,
or touch input over that region. IF keyboard focus is on a camera control
at the moment that state appears, focus SHALL move as `### Requirement:
Renderer Unavailability States Are Accessible` specifies.

#### Scenario: Camera controls are absent while the board is unavailable
- **WHEN** the board's canvas region shows the unsupported or interrupted
  state
- **THEN** no camera control is present in the tab order
- **AND** a wheel gesture over that region scrolls the page normally
- **AND** if keyboard focus was on a camera control at that moment, focus
  moves per `### Requirement: Renderer Unavailability States Are
  Accessible` and is never silently dropped to the document body

### Requirement: Board Picking Resolves to the Feature, Cell, or Lane Gate Under the Pointer

The system SHALL resolve a click on the board to the entity drawn under the
pointer: a click within a feature or lane-gate mark SHALL select that
entity; a click elsewhere within the lattice SHALL select the cell
containing that point, and that cell SHALL be visibly marked as selected on
the board; and a click outside the lattice SHALL clear the selection. Hit
targets SHALL be positioned at the marks actually drawn. WHEN two or more
marks' hit targets contain the clicked point, the topmost drawn mark SHALL
win, using the board's documented draw order (features above lane gates; a
child feature above its parent).

#### Scenario: Clicking a feature mark selects that feature

- **WHEN** the pointer clicks within a feature's drawn mark
- **THEN** that feature becomes the selection

#### Scenario: Clicking a lane-gate mark selects that gate

- **WHEN** the pointer clicks within a lane gate's drawn mark
- **THEN** that gate becomes the selection

#### Scenario: Clicking the lattice away from any mark selects the hex

- **WHEN** the pointer clicks a point within the lattice that is not over a
  feature or lane-gate mark
- **THEN** the cell containing that point becomes the selection

#### Scenario: A selected bare hex is visibly marked on the board

- **WHEN** a bare cell (not a feature or lane-gate mark) becomes the
  selection
- **THEN** that cell is visibly marked as selected on the board

#### Scenario: An overlapping child mark wins over its parent

- **WHEN** the pointer clicks a point where a moon's hit target and its
  parent feature's hit target overlap
- **THEN** the moon (the child, drawn on top) becomes the selection, not its
  parent

#### Scenario: Clicking outside the lattice clears the selection

- **WHEN** the pointer clicks a point outside the lattice
- **THEN** the selection becomes empty

### Requirement: Running Mine Gates the Fleet Panel's Commands

The system SHALL, while the acting fleet has a running mine action whose
ETA has not yet passed, disable the roster panel's burn, cut-drive, stop,
and jump commands and show a countdown to the run's ETA; and a cancel-mine
control SHALL be offered that cancels the run via the generic action cancel
endpoint, leaving the fleet's kinematic state and attachment untouched.
Once the ETA passes, the gating SHALL lift without requiring navigation.

#### Scenario: Burn, cut-drive, stop, and jump are disabled while a mine is running

- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** the roster panel's burn, cut-drive, stop, and jump commands are
  unavailable and a countdown to the mine's ETA is shown

#### Scenario: A running mine can be cancelled

- **WHEN** the cancel-mine control is invoked during a running mine
- **THEN** the cancellation is submitted through the generic action cancel
  endpoint, the movement channel frees on success, and the fleet's
  kinematic state and attachment are left untouched

### Requirement: Realtime Refetch Rules While the Board Is Open, With No Fleet Layer to Track

The system SHALL keep the open board's interior read current via two
independent mechanisms, since the board renders no fleet layer and offers no
scan control to accelerate a poll for: (1) a self-scheduled refetch shortly
after the acting fleet's running mine action's ETA, when one exists, and
(2) a live subscription to the system's event channel that refetches on a
completion event and again on reconnect after a drop; and SHALL otherwise
poll the interior read at a constant baseline interval, never tightened for
a scan or self-scheduled for an own fleet's burn arrival.

#### Scenario: A running mine self-schedules a refetch at its ETA

- **WHEN** the acting fleet has a running mine with a known ETA
- **THEN** a refetch is scheduled to fire shortly after that ETA, so the
  resolved cargo and freed movement channel land without user action

#### Scenario: A missed event on reconnect triggers a resync

- **WHEN** the system channel's live connection drops and later reconnects
- **THEN** a refetch fires on reconnect to resync any missed completions

#### Scenario: The poll runs at a constant interval, with no fleet arrival or scan to tighten it

- **WHEN** the board is open with no running mine action pending
- **THEN** the periodic poll continues at its constant baseline interval,
  unaffected by any own fleet's burn arrival or by scan state — the board
  tracks neither

### Requirement: Jump Commit
The system SHALL, when the jump command is invoked for a fleet attached to
a lane-gate body, submit a jump order for that fleet naming that gate's
lane id, resolved from a source that is neither filtered by nor derived
from the corporation's charted-lane set and that is available for a fleet
attached to a gate in any system — the open interior read's own gate body
(`system-interior`: *Lane-Gate Bodies Carry Their Lane Id*) when the fleet
is on the open board, and the fleet's own read (`fleet-movement`: *Fleet
Read Serves the Attached Gate's Lane Id*) otherwise — with no charted-lane
condition and no second read. The server's distinguishable jump-rejection
reasons include, at minimum: not attached to the named gate; already in
lane transit; lane not incident to the fleet's current system; and the
destination's lane horizon could not be materialized (retryable). A jump
against a fleet the requester's corporation does not own is deliberately
NOT among them: it is a bare `404` indistinguishable from a nonexistent
fleet (`fleet-movement`: *Fleet Command Endpoints Are Restricted to the
Owning Corporation*), and therefore falls to the generic fallback copy
rather than to a mapped reason. On success it SHALL show a success toast,
and on failure an error toast whose copy is mapped from the server's
distinguishable rejection reason (`board-view`: *Rejection Reasons Map to
Player-Facing Copy, Not Raw Server Text*), never the raw reason string,
leaving the fleet's row unchanged. The command SHALL NOT be a no-op or a
refusal for any gate the interior read served.

#### Scenario: Invoking jump submits the attached gate's lane
- **GIVEN** a fleet attached to a lane-gate body carrying `laneId` on the
  open interior read
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** a jump order is submitted for that fleet naming that `laneId`

#### Scenario: A gate whose lane the corporation has not charted still commits
- **GIVEN** a corporation with no charted lanes and a fleet attached to a
  lane-gate body
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** the jump order is submitted, not refused client-side

#### Scenario: A fleet attached to a gate in another system still commits
- **GIVEN** the board for system A is open and an own fleet is attached to
  a lane-gate body in system B
- **WHEN** the jump command is invoked on that fleet's roster row
- **THEN** a jump order is submitted naming that fleet's own gate's lane
  id — never system A's like-named gate, and never a client-side refusal

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

### Requirement: Burn Command Targets a Selected Lane-Gate Body Like Any Other Body
The system SHALL, when a lane-gate body is the current board selection,
allow the burn command to be invoked and submit an order naming that body
— through the exact same command path used for a planet, belt, or any
other selectable body, with no lane-gate-specific branch and no distinct
refusal copy for a gate target (gates are bodies — `docs/plans/
continous_space/decisions.md`: "you dock at bodies, mine at bodies,
stations and gates ARE bodies"). This requirement is satisfied by unifying
the two into one command path, not by adding a working case alongside an
unremoved gate-specific one. Unifying the selection kinds SHALL NOT
change what a selected lane-gate body presents: the facts panel SHALL
continue to describe a selected gate (its destination system and its
dock-then-jump instruction), and the gate's drawn mark SHALL continue to
show the selected state.

#### Scenario: Commanding a burn toward a selected lane-gate body submits an order
- **GIVEN** a lane-gate body is the current board selection
- **WHEN** the burn command is invoked
- **THEN** a burn order is submitted naming that gate body's body id — the
  same id that fleet's `attachedTo` reports once it arrives — exactly as
  for a selected planet or belt

#### Scenario: Attachment from a gate-targeted burn makes the jump command available
- **GIVEN** a fleet burns toward a selected lane-gate body and arrives
  attached to it
- **WHEN** that fleet's roster row is shown
- **THEN** the jump command becomes available for that fleet (`board-view`:
  *Jump Commit*)

#### Scenario: No gate-specific refusal copy exists
- **WHEN** the burn command is invoked with a lane-gate body selected
- **THEN** no refusal message is shown and an order is submitted — the
  "select a body to target first" refusal is reachable only from an empty
  or bare-cell selection

#### Scenario: A selected gate still shows its facts and its selected mark
- **WHEN** a lane-gate body is the current board selection
- **THEN** the facts panel describes that gate, naming its destination
  system, and the gate's drawn mark shows the selected state

#### Scenario: No gate-specific selection branch survives the unification
- **WHEN** the board's selection model and its burn-command path are
  inspected
- **THEN** no lane-gate-specific selection kind and no gate-aware command
  branch exists — a selected gate reaches the order mutation through the
  identical code path a selected planet does — a gate-aware lookup used
  only to present a selected gate's facts and its drawn mark is not such
  a branch

