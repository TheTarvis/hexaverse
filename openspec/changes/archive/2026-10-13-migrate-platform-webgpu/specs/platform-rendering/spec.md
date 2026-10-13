## ADDED Requirements

### Requirement: WebGPU Primary Backend

The platform SHALL render the system map, selected detail previews, galaxy graph, Intel spike and Space 3D spike through WebGPU when WebGPU initialization succeeds. When WebGPU is absent or initialization fails, each surface SHALL attempt the renderer's WebGL2 compatibility backend. No listed surface SHALL retain an independently owned legacy WebGL renderer. A surface whose two backends fail SHALL expose a local accessible unavailable state and retry without an uncaught rejection. Backend readiness SHALL mean at least one frame has been presented, not merely that a renderer object exists. For every listed surface, first-frame shader compilation or submission failure SHALL follow the same fallback policy as adapter/device initialization failure, for both synchronous exceptions and asynchronous rejections. A failed primary attempt SHALL release its resources before a fresh compatibility attempt. If compatibility also fails, the surface SHALL show its local retriable unavailable state, or retain its retriable interrupted state during recovery.

#### Scenario: Every owner presents through WebGPU
- **GIVEN** WebGPU initialization succeeds
- **WHEN** the system map, a selected detail preview, galaxy graph, Intel spike and Space 3D spike are each opened
- **THEN** each presents its scene using the actual WebGPU backend
- **AND** production configuration does not force any of them onto WebGL

#### Scenario: Missing WebGPU uses compatibility rendering
- **GIVEN** the browser exposes no WebGPU API and WebGL2 can initialize
- **WHEN** each listed surface is opened
- **THEN** each presents its scene through the WebGL2 compatibility backend

#### Scenario: Rejected WebGPU initialization uses compatibility rendering
- **GIVEN** WebGPU adapter acquisition or device initialization rejects and WebGL2 can initialize
- **WHEN** each listed surface initializes
- **THEN** it presents using the compatibility backend without an uncaught rejection or an unsupported notice

#### Scenario: Both backends fail locally
- **WHEN** WebGPU and compatibility initialization both fail for a surface
- **THEN** that surface shows accessible unavailable text and retry in its own region
- **AND** surrounding facts and controls remain mounted subject to their existing eligibility

#### Scenario: Primary first-frame rejection tries compatibility
- **GIVEN** the primary renderer initializes but its first frame throws or rejects
- **WHEN** each listed surface attempts presentation
- **THEN** failed primary resources are released and a fresh compatibility attempt starts
- **AND** readiness is published only after a frame is presented by the current successful backend

#### Scenario: Compatibility first-frame failure is retriable
- **WHEN** the compatibility backend initializes but its first frame throws or rejects
- **THEN** initial loading ends in local unavailable text with retry, or recovery retains local interrupted text with retry enabled again
- **AND** no readiness is published and no exception or rejection escapes

### Requirement: Asynchronous Renderer Attempt Ownership

Each surface SHALL associate initialization and frame submission with its current mounted renderer attempt. Replaced or disposed attempts SHALL cancel their scheduled draws and listeners, release acquired resources, and release resources acquired by late completion. They SHALL NOT publish readiness or errors into the current attempt or draw after ownership ends. Cancellation SHALL NOT require a pending adapter promise to settle before a replacement attempt can start. A zero-size surface SHALL defer drawing until it has positive dimensions. Each backend attempt SHALL have a 15-second wall-clock initialization budget, followed after successful initialization by a separate 15-second eligible first-presentation budget. The first-presentation budget SHALL count only time when presentation is eligible; hidden, offscreen and zero-size suspension SHALL not consume it. At budget expiry without completion, the attempt SHALL be abandoned without waiting for pending promises. Primary expiry SHALL start fresh compatibility initialization; compatibility expiry SHALL expose a retriable unavailable state or retain a retriable interrupted state during recovery. Late completion after expiry SHALL obey obsolete-attempt disposal rules. Cleanup SHALL cancel deadline callbacks and callbacks SHALL not alter a replacement attempt.

#### Scenario: Preview closes before initialization settles
- **WHEN** the selected detail panel closes while renderer initialization remains pending and initialization later resolves
- **THEN** the obsolete preview presents no frame or ready callback and releases its acquired resources

#### Scenario: Route replacement ignores stale completion
- **WHEN** the player changes system during initialization and the old attempt subsequently resolves or rejects
- **THEN** only the current system's attempt may publish a frame, readiness or unavailable state
- **AND** late failure is contained without an uncaught rejection

#### Scenario: Retry and development remount retain one owner
- **WHEN** an attempt is replaced by retry or a setup-cleanup-setup development remount while initialization remains pending
- **THEN** the replacement may initialize without waiting for the abandoned promise
- **AND** no abandoned attempt draws or installs surviving listeners after it settles
- **AND** the visible surface owns at most one live drawing loop

#### Scenario: Zero-size initialization defers presentation
- **WHEN** a surface initializes at zero width or height and later receives positive dimensions
- **THEN** no zero-size frame is submitted
- **AND** presentation starts at the current size without a second renderer or duplicated loop

#### Scenario: Stalled primary initialization reaches compatibility
- **WHEN** primary initialization remains unsettled at its 15-second budget expiry
- **THEN** the primary attempt is abandoned and fresh compatibility initialization starts without waiting for its promise
- **AND** primary completion after expiry cannot publish readiness or install a drawing loop

#### Scenario: First presentation has its own eligible-time bound
- **GIVEN** primary initialization has succeeded
- **WHEN** no first frame has been presented after 15 seconds of eligible presentation time
- **THEN** the primary attempt is abandoned and fresh compatibility initialization starts
- **AND** a first frame completed before budget expiry would instead establish readiness without starting compatibility

#### Scenario: Stalled compatibility retry becomes retriable again
- **GIVEN** the surface is interrupted and explicit retry is pending
- **WHEN** compatibility initialization reaches its 15-second budget expiry or its first presentation reaches 15 seconds of eligible time without completion
- **THEN** the interrupted state remains visible and retry becomes available again
- **AND** surrounding eligible controls, input and selection remain usable

#### Scenario: Deliberate presentation suspension does not time out
- **WHEN** initialization completes while the surface is hidden, offscreen or zero-size
- **THEN** its first-presentation budget consumes none of that suspended interval
- **AND** presentation and eligible-time accounting resume only for the current owner when drawable

### Requirement: Backend Loss Containment

Device or compatibility-context loss SHALL stop drawing on the affected surface and expose its local interrupted state without invalidating other surfaces. Explicit retry SHALL release prior renderer resources and recreate against current state; duplicate loss or retry signals SHALL NOT create duplicate loops or concurrent retry attempts. Diagnostic recording SHALL NOT prevent the interrupted or unavailable presentation even if the logger throws. Map and galaxy recovery SHALL additionally satisfy their existing panel and selection preservation requirements. After readiness, a frame, resize or scene-update failure SHALL stop affected drawing and expose its local interrupted state with explicit retry even without a device/context-loss event. Synchronous exceptions and asynchronous rejections SHALL be contained. No autonomous retry SHALL start for those failures.

#### Scenario: Preview loss is independent of map
- **WHEN** a selected preview loses its device or compatibility context while the system map remains available
- **THEN** its preview-local interrupted text and retry are accessible while the map continues drawing
- **AND** name, facts, focus action and panel-close control remain usable

#### Scenario: Repeated loss and retry are bounded
- **WHEN** loss is signaled twice and retry is invoked again while an earlier retry is pending
- **THEN** drawing stays interrupted with at most one retry in flight
- **AND** successful retry starts one loop using current data

#### Scenario: Broken diagnostics cannot block recovery UI
- **WHEN** a renderer failure occurs and the client diagnostic logger itself throws
- **THEN** the surface still presents its local unavailable or interrupted state with retry
- **AND** the diagnostic exception does not escape

#### Scenario: Post-readiness frame failure is local
- **GIVEN** a listed surface has presented successfully
- **WHEN** a later frame submission throws or rejects without a device-loss or context-loss event
- **THEN** its drawing stops and accessible local interrupted text with retry is shown
- **AND** no rejection escapes, no autonomous retry starts and other surfaces remain usable

#### Scenario: Resize or scene-update failure is local
- **GIVEN** a listed surface has presented successfully
- **WHEN** a resize or scene-update operation throws or rejects
- **THEN** only that surface enters interrupted state with explicit retry and its drawing stops
- **AND** surrounding eligible controls remain usable and no automatic retry begins

### Requirement: Migrated Scene Interaction Preservation

Both rendering backends SHALL retain each migrated surface's existing served objects, camera controls, picking and scene effects without changing gameplay eligibility or introducing data absent from the served projection. The migration SHALL preserve the existing no-per-frame-React-render and navigation responsiveness contracts.

#### Scenario: System effects and picking survive migration
- **WHEN** the system scene is rendered and its camera is orbited, panned and zoomed on each backend
- **THEN** orbit lines, selection reticles, local ship and station assets, transparent atmospheres and the hex reference-plane mask remain visible in their existing roles
- **AND** selecting bodies, gates, fleets and vacuum positions retains the existing pick envelopes and selection behavior

#### Scenario: Galaxy graph preserves visual and input behavior
- **WHEN** the galaxy graph is exercised on each backend
- **THEN** supplied system positions, region-colored sprites, bridge lanes, grid, own-fleet presence and hover labels are rendered
- **AND** node selection toggling, background selection clearing, camera orbit/pan/zoom, recenter and double-click focus retain their current behavior
- **AND** no additional undisclosed system or lane is drawn

#### Scenario: Spike scenes present and release resources
- **WHEN** Intel spike and Space 3D spike are each opened, resized, interacted with and left on each backend
- **THEN** their existing scene content and camera controls operate
- **AND** departure releases their renderers, listeners and pending drawing callbacks

#### Scenario: Animation does not block navigation
- **WHEN** a system or galaxy scene animates while the player changes selection and navigates away
- **THEN** animation causes no per-frame React view commits
- **AND** existing selection and navigation operations complete without waiting for an animation loop to end
