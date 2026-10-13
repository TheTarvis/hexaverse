## MODIFIED Requirements

### Requirement: Renderer Unavailability Is an Explicit State
Rendering-context creation in this requirement includes asynchronous renderer initialization and first-frame submission. Unavailability means neither the WebGPU primary backend nor its WebGL2 compatibility backend can initialize and present the view; a WebGL capability probe alone SHALL NOT reject usable WebGPU. Pending initialization SHALL show a loading state until a frame is presented or failure is reported under the 15-second initialization and 15-second eligible first-presentation budgets in *Asynchronous Renderer Attempt Ownership*. Primary initialization or first-frame failure SHALL attempt fresh compatibility rendering; terminal failure SHALL end loading in the local retriable state. Initialization rejection SHALL follow the same local containment, panel usability and data-error precedence rules below.

IF a rendering context for the space view cannot be created, THEN the
system SHALL show an explicit unsupported state in place of the view's
canvas region, naming the failure as a browser- or graphics-hardware-
capability problem — never raw diagnostic text, a stack trace, or a GPU
vendor/model string — rather than an empty stage or an uncaught error, and
SHALL offer a retry affordance that attempts to re-establish the context.

The fleet selector, Objects browser, Console tabs, and station/resource
details SHALL remain mounted and usable while the unsupported or
interrupted state is shown. Mine, sell, refuel, station-keeping hold,
station-keeping release, and cancelling a running mine SHALL remain
invokable through their station/resource details when their existing
ownership, attachment, data, and running-action preconditions are met.
Rendering failure SHALL introduce no additional gameplay precondition.
The legacy Course card, system fleet roster, and Cut drive / Stop row SHALL
remain hidden during the current flight-control redesign; rendering failure
SHALL NOT restore retired controls. Galaxy navigation SHALL remain usable,
and the galaxy fleet roster SHALL continue to offer cut drive, stop, and
jump according to the selected fleet's served state. These commands require
no system-canvas target.

A control whose only effect is on the unavailable canvas SHALL be disabled
or hidden while the unsupported or interrupted state is shown. Objects
inspection SHALL remain available; Focus and Plot course SHALL be disabled.
The view SHALL NOT instruct the player to choose a burn target on an
unavailable canvas.

An error thrown while constructing, listening to, or retrying this view's
rendering context SHALL be contained to the view's canvas region: caught by
a boundary scoped to that region when the error is thrown during render or
commit, and by a local handler when the error is thrown inside a context-
loss/restore listener or an animation-frame callback (neither is reachable
by a React error boundary at any placement) — leaving the fleet selector, Objects browser, Console, station/resource
details, and system space view container mounted and usable.

The unsupported and interrupted states SHALL take precedence over this
view's data-loading and first-frame-pending states: once a rendering
context cannot be created, a loading placeholder SHALL NOT continue to be
shown in the view's canvas region. This state is triggered by a client
rendering-capability failure, never by a failure of the interior or
own-fleets data reads.

#### Scenario: Context creation failure shows a named unsupported state
- **WHEN** a rendering context for the space view cannot be created
- **THEN** the view's canvas region shows an explicit unsupported state
  naming browser or GPU unavailability as the cause
- **AND** no uncaught error is thrown

#### Scenario: Surrounding panels remain usable
- **WHEN** the view's canvas region shows the unsupported or interrupted state
- **THEN** the fleet selector, Objects browser, Console tabs, and station/resource details remain mounted and interactive
- **AND** mine, sell, refuel, station-keeping hold, station-keeping release, and cancelling a running mine remain invokable when their existing gameplay and data preconditions are met
- **AND** the retired Course card, system fleet roster, and Cut drive / Stop row remain hidden

#### Scenario: A burn can be ended while the canvas is unavailable
- **GIVEN** the selected fleet has a running burn
- **WHEN** the system view's canvas region shows the unsupported or interrupted state
- **THEN** Galaxy navigation remains usable
- **AND** after navigating to the galaxy, cut drive and stop remain invokable through that fleet's roster row and invoking either commits against that fleet

#### Scenario: A canvas-only control is disabled while the canvas is unavailable
- **WHEN** the view's canvas region shows the unsupported or interrupted
  state
- **THEN** a control whose only effect is on the canvas is disabled or
  hidden, not presented as operable

#### Scenario: Burn target selection is unreachable without the canvas
- **WHEN** the view's canvas region shows the unsupported or interrupted state
- **THEN** the view does not prompt the player to choose a body, gate, or point as a burn target
- **AND** Objects inspection remains available while Focus and Plot course are disabled
- **AND** Galaxy navigation remains available for the fleet's attachment-based Jump command

#### Scenario: The unsupported state is independent of the interior data read
- **WHEN** the system interior and own-fleets reads succeed but the
  rendering context cannot be created
- **THEN** the view's canvas region shows the unsupported state, not the
  interior-read error state

#### Scenario: A failed interior read takes precedence over the unsupported state
- **WHEN** the interior read fails and the rendering context also cannot be
  created
- **THEN** the canvas region shows the interior-read error state with its
  underlying message and its retry affordance
- **AND** no unsupported state is shown
- **AND** the fleet selector and Console remain mounted and usable, and the Objects browser exposes the failed interior read with its retry action

#### Scenario: A failed own-fleets read does not suppress the unsupported state
- **WHEN** the own-fleets read fails and the rendering context also cannot
  be created
- **THEN** the canvas region shows the unsupported state
- **AND** opening Objects exposes the fleet telemetry read error and its retry action separately from the renderer error

#### Scenario: The system space view container remains present
- **WHEN** the unsupported state is shown
- **THEN** the system space view container is still rendered, with the
  unsupported state occupying only the canvas region within it

#### Scenario: The unsupported state offers a retry affordance
- **WHEN** the view's canvas region shows the unsupported state
- **THEN** a retry affordance is offered
- **AND** invoking it attempts to create a new rendering context
- **AND** a successful attempt resumes rendering the live space view
- **AND** a failed attempt keeps the unsupported state, retriable again

#### Scenario: The displayed cause is a user-actionable category, not raw diagnostic text
- **WHEN** the unsupported or interrupted state names the cause to the
  player
- **THEN** the text identifies the failure as a browser or graphics-hardware
  capability problem
- **AND** it does not display raw exception text, stack traces, or GPU
  vendor/model strings

#### Scenario: An unexpected rendering error is contained to the canvas region
- **WHEN** an error is thrown while constructing, listening to, or retrying
  this view's rendering context — including an error not otherwise named by
  this requirement
- **THEN** the error is contained to the view's canvas region — caught by
  the region's error boundary when it is thrown during render or commit,
  and by a local handler when it is thrown inside a context-loss/restore
  listener or an animation-frame callback
- **AND** the fleet selector, Objects browser, Console, station/resource details, and system space view container remain mounted and usable

### Requirement: Lost Rendering Context Recovers Without Navigation
Rendering-context loss includes WebGPU device loss and WebGL2 compatibility context loss. A lost WebGPU device or post-readiness frame failure SHALL remain interrupted until explicit retry recreates the renderer; it SHALL NOT wait for a WebGL restoration event or start an automatic retry loop. Compatibility context restoration SHALL retain the automatic live-state recovery described below. Creation, loss and restoration diagnostics SHALL identify the backend and distinguish asynchronous initialization failure from runtime loss without exposing raw diagnostics in player-facing text.

WHEN this view's rendering context is lost at runtime, the system SHALL
show an interrupted state in the view's canvas region without an uncaught
error; WHEN the lost context is restored, the system SHALL resume
rendering the live space view — reflecting current world time and
body/fleet/contact state, never a stale pre-loss frame — without a page
navigation; and IF the context is not restored, the interrupted state
SHALL persist and SHALL offer a retry affordance that attempts to
re-establish the rendering context. Restore failure means an error thrown
while re-establishing compatibility rendering after its context-restored event; a
context that simply never restores is not itself a recordable failure
event. Retrying SHALL release the prior attempt's renderer resources and
event listeners before creating a new context, and SHALL hold no more than
one live rendering context for the view's canvas at any time. Once
invoked, the retry affordance SHALL be disabled and show an in-progress
indication until the attempt resolves; any invocation while disabled SHALL
start no further attempt. A second context loss arriving while the
interrupted state is already shown SHALL leave the view in the interrupted
state without duplicating listener registration or starting a second
in-flight creation attempt. A space-view selection, or an in-progress
input value in the `docked-fleet-actions` panel, active at the moment of
context loss SHALL remain shown throughout the interrupted state and SHALL
still be active once the view resumes. Each context-creation failure,
context loss, and restore failure SHALL be recorded distinguishably by
cause: a diagnostic entry emitted to the client error log naming which of
the three occurred and, when available, the browser-reported diagnostic
message.

#### Scenario: Context loss shows an interrupted state without an uncaught error
- **WHEN** this view's rendering context is lost at runtime
- **THEN** the view's canvas region shows an interrupted state
- **AND** no uncaught error is thrown

#### Scenario: A restored context resumes without navigation
- **WHEN** a lost rendering context is restored
- **THEN** the view resumes rendering the live space view
- **AND** no page navigation occurs

#### Scenario: A restored context's first frame reflects live state, not a stale one
- **WHEN** a lost rendering context is restored
- **THEN** the view's redraw is invoked with the post-restore world time and
  the latest interior/own-fleets read
- **AND** no pre-loss image is retained

#### Scenario: A context that never restores keeps the interrupted state with a retry affordance
- **WHEN** a rendering context is lost and is not restored
- **THEN** the interrupted state persists
- **AND** a retry affordance is offered

#### Scenario: Invoking the retry affordance attempts to re-establish the context
- **WHEN** the retry affordance is invoked while the interrupted state is
  shown
- **THEN** the system attempts to create a new rendering context for the
  view

#### Scenario: Retrying releases the prior attempt's resources first
- **WHEN** the retry affordance is invoked
- **THEN** any renderer resources and event listeners from the previous
  failed or lost context are released before a new context is created
- **AND** no more than one live rendering context is held for the view's
  canvas at any time

#### Scenario: A successful retry resumes the live space view
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation succeeds
- **THEN** the view resumes rendering the live space view
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
- **WHEN** this view's rendering context is lost again while the
  interrupted state is already shown
- **THEN** the view remains in the interrupted state
- **AND** no duplicate listener registration or in-flight context-creation
  attempt is started

#### Scenario: In-flight selection and typed input survive a context loss
- **WHEN** this view's rendering context is lost at runtime while a
  selection is active or an input value has been typed in the
  `docked-fleet-actions` panel
- **THEN** the selection and the typed value remain shown once the
  interrupted state is displayed
- **AND** a subsequent restore resumes the view with that same selection
  still active

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


### Requirement: Selected Spacecraft Detail Preview

An open detail panel for an explicitly inspected own fleet or selected served station SHALL show one real 3D preview below the object's name, using the same local model asset and eligibility as the map. Its height SHALL be between 180 and 220 CSS pixels, with a transparent background, dedicated lighting and a fixed initial three-quarter pose that frames the complete model. The station preview SHALL replace its existing decorative planet thumbnail. Except for the selected-star preview specified by *Selected Star Detail Preview*, other object thumbnails SHALL remain unchanged; list rows, anonymous contacts, sightings and arrival previews SHALL NOT gain model previews. The preview SHALL NOT infer a ship class, count or operational capability from model appearance.

#### Scenario: Station detail preview
- **WHEN** the player opens the selected served station's details
- **THEN** its name precedes a 180–220 CSS-pixel-tall real 3D station preview using the map's station asset, with the complete ring and hub visible against the transparent background
- **AND** its existing facts and actions remain available below the preview without the old planet thumbnail

#### Scenario: Own-fleet inspection preview
- **WHEN** the player deliberately opens inspection of an own fleet through a pointer- and keyboard-reachable affordance
- **THEN** a persistent detail panel names that fleet and shows the same ship asset as the map below its name
- **AND** inspection does not make the fleet a burn target or issue a gameplay command

#### Scenario: Ineligible objects retain existing presentation
- **WHEN** a planet, gate, contact, sighting or arrival preview is inspected, or an object list is shown without an eligible detail panel
- **THEN** no ship or station preview is created for it
- **AND** other object thumbnails and existing facts remain unchanged

## ADDED Requirements

### Requirement: Evolving Stellar Plasma and Corona

The system SHALL render each served star with luminous spatially varying surface detail that evolves over visible presentation time and a soft animated corona extending beyond the sphere. Evolution SHALL change the surface pattern rather than only rotate the entire sphere. Served spectral classes SHALL retain their warm/cool color distinction; a star without a recognized class SHALL use the documented warm fallback. Decorative surface and corona SHALL NOT enlarge the star's existing pick envelope, add entities or change world positions.

#### Scenario: Fixed-camera plasma evolves
- **GIVEN** normal-motion preference and an unchanged star, camera and world position
- **WHEN** two frames are captured at separated visible presentation times
- **THEN** the surface pattern and soft corona visibly evolve while the sphere's orientation need not change

#### Scenario: Stellar color follows served class
- **WHEN** warm-class, cool-class and unclassified served stars are rendered
- **THEN** warm and cool classes are visibly distinguishable and the unclassified star uses the documented warm fallback
- **AND** no class is inferred from undisclosed data

#### Scenario: Corona follows its star without becoming a target
- **WHEN** the camera orbits the star and the player clicks corona outside the original stellar pick envelope
- **THEN** the corona remains centered around its star and its edge fades into the scene
- **AND** the decoration does not select the star or create a new target

### Requirement: Selected Star Detail Preview

An inspected served star SHALL show one real 3D preview below its name in the left Objects detail panel, replacing the decorative planet thumbnail. The preview SHALL use the same stellar model/material family and served identity/class as the map with independently owned resources. It SHALL inherit *Isolated Accessible Preview Orientation*, *Preview Availability Does Not Block Details* and *Selected-Only Preview Resource Lifecycle*, including fixed initial pose, reset, accessible naming, local failure and selected-only ownership. Its height SHALL be 180–220 CSS pixels with a transparent background and the full sphere and corona framed. Object-list rows SHALL NOT create preview renderers and absent star data SHALL NOT create a fabricated stellar preview.

#### Scenario: Selected stellar model matches the map
- **WHEN** a served warm or cool star is inspected
- **THEN** the detail shows that star's name above a 180–220 CSS-pixel real preview with the same surface, corona and spectral appearance family as the map
- **AND** facts and focus action remain available without the old planet thumbnail

#### Scenario: Star change and absent data do not retain stale art
- **WHEN** inspection changes between stars with different served classes or to an entity with no served star
- **THEN** only the current eligible star receives a matching stellar preview and the previous preview is released
- **AND** absent star data produces no fabricated star preview

#### Scenario: Stellar orientation is isolated and accessible
- **WHEN** the player drags the star preview, rotates it with keyboard controls, resets and tabs onward
- **THEN** only the preview orientation changes, reset restores its initial pose and focus can leave normally
- **AND** its accessible name identifies the star and orientation instructions
- **AND** map camera, selection, acting fleet and gameplay commands remain unchanged

#### Scenario: Preview failure leaves stellar details usable
- **WHEN** stellar preview initialization is pending, fails or loses its backend
- **THEN** an accessible preview-local loading or unavailable state is shown
- **AND** name, facts, focus action and close remain usable while the map retains its independent renderer state
- **AND** successful pending initialization preserves orientation input already accepted in that session

#### Scenario: Stellar panel closure disposes only its instance
- **WHEN** the stellar detail is hidden, closed, removed or left by navigation and later reopened
- **THEN** old preview resources, listeners and pending draws are released without affecting the map's star
- **AND** reopening starts at the fixed initial pose with no renderer created for a list row

### Requirement: Bounded Stellar Presentation

Stellar preview drawing SHALL retain the existing preview bounds of at most 30 frames per second and at most 384 device pixels on its longest render-target dimension. Hidden, offscreen, zero-size, interrupted and disposed previews SHALL stop decorative drawing. Resuming visibility SHALL not apply hidden elapsed time as one animation catch-up step or introduce a duplicate loop. Reduced-motion preference SHALL freeze evolving stellar surface and corona decoration in both map and preview while published world positions and accepted manual preview orientation continue. Stellar animation SHALL NOT auto-rotate previews or cause per-frame React commits.

#### Scenario: Reduced motion freezes decoration without freezing state
- **WHEN** reduced-motion preference is enabled while the map and selected star preview are visible
- **THEN** surface and corona decorative time stop advancing in both
- **AND** current published world positions and manual preview orientation still update

#### Scenario: Hidden preview does not draw and resumes once
- **WHEN** the document, containing panel or preview becomes hidden or offscreen, or the preview becomes zero-size, interrupted or disposed
- **THEN** decorative preview draws stop
- **AND** a still-owned preview that becomes visible and renderable again resumes with one loop and without advancing through the hidden interval

#### Scenario: Preview rendering stays within its budget
- **WHEN** a stellar preview animates on a high-density display while its detail panel is repeatedly opened and closed
- **THEN** its drawing rate is at most 30 frames per second and render target longest extent at most 384 device pixels
- **AND** renderers and listeners do not accumulate, its pose does not rotate autonomously and animation creates no per-frame React commits
