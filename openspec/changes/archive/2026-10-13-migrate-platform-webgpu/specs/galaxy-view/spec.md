## MODIFIED Requirements

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
