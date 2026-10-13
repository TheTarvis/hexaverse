## Context

The platform has five renderer owners: system scene, selected detail preview,
galaxy graph, Intel spike and Space 3D spike. Three.js 0.185.1 and matching
0.185 types are already installed. The galaxy currently delegates renderer
ownership to react-force-graph-3d. Four custom effects use WebGL-only shader
hooks: stellar granulation, gas cloud UV drift, atmosphere and background haze.
The existing canvas guards probe WebGL before scene creation; that probe would
bind the canvas to the wrong API for WebGPU.

Source scope and binding decisions are the migration brief and rulings R1–R5.
This is a frontend rendering change; served projections, API wire types,
authentication, React Query caching, Go services and database remain unchanged.
Existing pending art changes are not completed or rewritten by this migration.

## Goals / Non-Goals

All five owners use WebGPU first and Three's WebGL2 compatibility backend when
needed. Preserve interactions, assets, scene composition, fog boundaries and
local failure recovery. Share one animated stellar model family between map
and selected detail preview, including accessible independent orientation.

No new GPU requirement for players, force simulation, gameplay calculation,
external shader service, asset purchase, deployment, or physical stellar
simulation is introduced. Two-dimensional canvas texture generation stays.

## Decisions

### 1. One renderer family and public Three entry points

Use `WebGPURenderer` and node materials from `three/webgpu`, TSL operations
from `three/tsl`, and existing geometry/math/addon imports through the package's
public exports. Installed `three.module.js` and `three.webgpu.js` share
`three.core.js`; there is no need to alias every `three` import to a different
build. Do not mix source-file imports with built entry points or introduce a
second Three version. Audit the production bundle and lockfile after removing
the galaxy renderer dependency. Preserve the installed version unless an
observed compatibility failure demands a reviewed bump.

The renderer's StandardNodeLibrary converts ordinary supported materials,
including the standard materials produced by GLTFLoader. Custom effects must
use node materials; exporting ShaderMaterial from the package is not evidence
that its rendering is supported. No migrated path retains ShaderMaterial,
RawShaderMaterial or onBeforeCompile customization.

### 2. Shared asynchronous attempt owner

Place a small typed renderer adapter under `components/render-guard/`; all five
owners use it. Its injectable constructor is the unit-test seam. It owns
initialization, backend identification, loss listeners, cancellation and safe
diagnostics; each scene owns camera, geometry, material and domain draw state.
Client effects create it; no renderer is constructed during React render or SSR.

States are pending, ready, unavailable, interrupted and disposed. Every attempt
has a generation token. Await `init()` explicitly, check ownership after every
await, then allow rendering at a positive size. Publish ready only after the
first successful frame submission; construction and init resolution alone are
not readiness. Read the actual backend flag after init, not navigator.gpu or
isWebGPURenderer (the latter is true on both backends). Expose backend identity
on a diagnostic/test seam attached to the actual surface. Real-frame acceptance
also captures the rendered scene; a diagnostic attribute by itself is not proof.

Production does not force WebGL. The constructor's built-in fallback handles
ordinary adapter/device acquisition rejection. If initialization fails after
the native backend has already bound its canvas, a compatibility attempt must
use a fresh canvas with `forceWebGL: true`; reusing an API-bound canvas cannot
switch its context type. Such a fresh compatibility attempt is bounded to one,
with the previous candidate disposed first. Canvas replacement must rebind
controls and observers and preserve outer selection, preview pose and forms.
Remove all pre-init getContext probes, including the system stencil probe.

Cleanup invalidates the token immediately, stops scene RAF, removes listeners
and releases currently acquired resources. It never waits for an unresolved
adapter promise before allowing a new attempt. Late resolution disposes the
obsolete renderer again and never draws or publishes. In r185.1 `dispose()`
only frees renderer internals when `_initialized` is true; an early dispose
alone is insufficient. Handle rejection and partially acquired backend cleanup
without assuming uninitialized backend utilities exist. Cleanup is idempotent.
An abandoned initializing candidate may settle in the background, but cannot
own a visible drawing loop or survive settlement. This differs from retaining
two ready contexts for one visible surface, which is forbidden.

Bound a primary candidate's initialization to 15 seconds using an owned timer.
Expiration abandons that generation and starts a fresh forced-compatibility
candidate with its own 15-second budget; compatibility expiration yields local
unavailable/retriable UI. If the built-in fallback completes within the primary
budget it needs no second candidate. After init, allow at most 15 seconds of
positive-size, visible presentation eligibility for the first successful frame;
native first-frame expiration starts a fresh forced-compatibility candidate,
while compatibility first-frame expiration yields local unavailable/retriable
UI. Only one fresh compatibility candidate is allowed per attempt. Suspend that frame budget
while hidden or zero-size, without suspending the init deadline. Clear all
timers on settlement, cancellation and disposal. Timers are injectable in unit
tests. These conservative finite recovery bounds prevent endless loading; they
are engineering defaults, not hardware performance promises.

### 3. Loss and restoration

Use the public `renderer.onDeviceLost` callback, installed before initialization,
to stop drawing and notify the owning surface. The installed fallback backend
also uses this callback for `webglcontextlost`; do not double-report it through
two independently active listeners. User-facing copy stays categorical;
diagnostics distinguish initialization, runtime loss and restore failure, and
include the actual backend and browser diagnostic when available. A throwing
logger is contained. Rendering and async failures are handled locally, not
solely through a React error boundary.

Every owner, including previews and spikes, contains failures from resize,
scene update and frame submission. Native failure before any frame attempts
fresh compatibility within the same bounded recovery policy; compatibility
failure before any frame is unavailable. A failure after readiness is
interrupted and requires retry. Stop the loop, retain outer controls,
record a distinct frame/scene failure diagnostic, and expose bounded retry.
Do not treat an exception as a successful frame or publish ready afterward.

WebGPU loss requires explicit retry and a new renderer. Compatibility recovery
listens for `webglcontextrestored` and automatically constructs a new attempt
from latest refs, preserving outer state. The installed fallback backend has
no restoration handler; resuming its old renderer is unsafe. A single retry
gate excludes overlapping manual retry and restoration. Disposed attempts
ignore device-loss notifications caused by their own device destruction.

System and galaxy guards preserve existing data-error precedence and panel
mounts. Selected previews have their own pending/unavailable/interrupted state
and retry; failure never changes map availability. Retry remounts only the
render region, not the parent holding selection, typed actions or preview pose.

### 4. Cross-backend materials and stencil

Port gas-cloud texture UV drift to a MeshStandardNodeMaterial color/texture
node with an explicitly advanced time uniform. Retain existing seeded surface
textures. Port atmosphere Fresnel opacity and background directional haze to
MeshBasicNodeMaterial expressions; preserve alpha, blending, depth settings,
back-face settings and output color-space handling without duplicating it.

Construct the system renderer with `stencil: true`. Installed WebGPU pipeline
code supports material stencil compare/operations/read/write masks. Keep the
opaque silhouette stencil pass and reference-grid test/order. Exclude additive
atmosphere/corona decoration from writing the silhouette mask, so decoration
does not carve an enlarged hole. Browser evidence must verify depth, mask and
transparent ordering on both actual backends; source support alone is not proof.

### 5. Shared stellar model and presentation clock

Create a factory in the existing scene-art area that returns the sphere plus
corona, an explicit advance(seconds) operation and idempotent disposal of its
owned materials/textures/geometries. Caller-supplied shared geometry is not
disposed by the model. Each instance owns its time uniform; no global mutable
material or global TSL time drives animation. Map and preview share factory
logic and served ID/class inputs, not disposable instances.

Use a bounded multi-frequency local-space field with time-dependent domain
warping for luminous plasma; time changes the pattern while sphere orientation
can remain fixed. Use a soft radially faded additive corona whose intensity or
shape also evolves, centered on the sphere for every camera angle. This can
be a camera-facing node-material sprite with angular modulation. Neither the
corona nor its enlarged visual bounds participates in selection. Preserve the
existing CPU picking envelope and selection reticle.

Move the existing spectral palette into the shared factory: O 0x9bb0ff,
B 0xaabfff, A 0xcad7ff, F 0xf8f3e6, G 0xffe7b8, K 0xffc98a,
M 0xff9f6a; absent or unrecognized class uses 0xffd9a0. Normalize only the
served first class character. No undisclosed data lookup supplies appearance.

Explicit visible presentation deltas advance stars and gas clouds, clamped to
0.1 seconds. Reset the previous timestamp on visibility/size resumption; never
apply accumulated hidden time. Reduced motion freezes all stellar decoration
without freezing published world positions or accepted preview orientation.
Time updates do not call React state setters. Selected previews retain the
30fps and 384-device-pixel bounds, visibility/intersection/resize suspension,
200 CSS-pixel target height and existing pointer/keyboard/reset controls.
Preview eligibility expands only to the served selected star; list rows create
no renderer. Inputs accepted during pending init are applied on first frame.

### 6. Explicitly owned galaxy scene

Replace the force-graph wrapper with an owned Scene, PerspectiveCamera, canvas
and shared renderer attempt. Keep CameraRig and its imperative controller seam.
The graph already uses supplied fixed coordinates and cooldownTicks=0; no
layout solver is needed. Build region glow sprites, charted lanes, bridge
distinction, disk grid and own-fleet markers directly from served galaxy props.
Use typed ID maps; never let a graph library mutate the served DTOs.

Raycast only eligible node pick proxies, not halos or grid. Pointer click uses
the existing selection toggle; empty click clears; drag does not click. Preserve
the 350ms same-node double-click focus and 600ms focus glide, camera pan/orbit/
zoom and recenter target. Preserve bridge thickness as well as opacity; ordinary
WebGL line width is not portable, so use thin geometry or the supported wide-line
node material if needed. Hover names remain DOM text, not HTML interpolation.
Refresh scene resources on data changes and read latest selection/home/own-fleet
refs without per-frame React commits. Dispose removed materials and geometries;
do not dispose a shared glow texture from one node while others still use it.

### 7. Spikes, evidence and sequencing

Intel and Space 3D spikes retain their scenes and camera interactions while
using the same owner, local retry, resize and disposal. They are migration
surfaces, not optional proof-of-concept exceptions.

SDET first writes tier-1 coverage using deferred injectable renderer promises,
actual scene factory calls and externally observable callbacks. Integration
checks compile the real installed node graphs and the Next production bundle.
Unit tests cannot prove GPU compilation, native backend use or stellar quality.
Real browser evidence records actual backend, first-frame image, time-separated
star images, preview match, stencil/transparency and interaction observations.
Force fallback only through a test/dev injection seam, never normal production
configuration. If native GPU execution is unavailable, retain BLOCKED evidence
and do not describe the migration as fully verified. Follow docs/testing-tiers.md:
one final journey after implementation, locked tree, no per-task Playwright runs.

## Risks / Trade-offs

Async renderer ownership is the largest shared regression risk; late completion,
Strict Mode remount, loss and zero-size tests must exercise real consumers of
the adapter. Galaxy replacement is larger than a renderer prop change, but
avoids patching transitive libraries and their WebGL-only composer. GPU visual
parity needs actual frames; shader mocks are insufficient. Independent preview
devices cost more than shared rendering but preserve current isolation and
selected-only resource bounds. Hardware FPS promises are intentionally absent.

Official API reference: https://threejs.org/docs/pages/WebGPURenderer.html .
Version-specific checks above are from installed Three 0.185.1 Renderer.js,
WebGPURenderer.js, WebGLBackend.js and WebGPUPipelineUtils.js, not assumptions
about a future release.

## Migration Plan

Settle spec review and implementation contract; write and freeze red tests.
Implement shared owner/guards first, then system materials and stellar factory,
preview wiring, galaxy replacement and both spikes. Integrate against the same
adapter contract, audit remaining renderer/shader constructors, build and run
tier-1 checks. Capture real backend/visual evidence, then run the final journey
and archive gates. Do not archive pending predecessor changes. A rollback is a
revert of this coherent frontend migration; no persisted data migration exists.

## Open Questions

No product-scope questions remain. Native WebGPU availability in the verification
environment is an evidence prerequisite to establish during implementation; a
missing adapter is a recorded verification limitation, not implicit approval to
substitute compatibility screenshots for native proof.
