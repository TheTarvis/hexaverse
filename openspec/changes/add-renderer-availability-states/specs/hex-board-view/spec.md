## ADDED Requirements

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
