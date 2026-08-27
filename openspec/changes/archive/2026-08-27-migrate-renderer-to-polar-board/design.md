## Context

This is **step 7 of the approved polar migration** — the renderer step —
which also lands the camera gestures `port-board-to-webgl-renderer`
deferred. Two jobs, one change, because they collide on the same file.

**The migration half.** Steps 5 and 6 (`rewrite-board-on-polar-lattice`,
`migrate-consumers-to-polar-board`, archived 2026-08-26) rewrote the board's
math on the polar ring-and-slot lattice and moved every Go consumer onto it,
deliberately leaving the frontend red. Step 6's Non-Goals: *"No renderer
work, no `frontend/lib/types/*` edits, no e2e repair. Those are step 7. The
47 frontend files still importing `lib/hex` stay broken."* Measured today:
**39 files** import the deleted `@/lib/hex`, `npx tsc --noEmit` reports **69
errors**, and the frontend does not build. Step 6 also left a verified
**Frontend Wire-Shape Handoff** (`migrate-consumers-to-polar-board/
design.md:838+`) naming every DTO field that moves, and recorded two things
as explicitly this step's: the capability rename plus coordinate rewording
(*"That is step 7's spec work"*), and the `MsPerTile`/`AmbientRadius` retune,
to be done *"with the renderer up, so the two are tuned against one another
rather than in isolation."*

**The camera half.** `docs/plans/webgl-board-port.md` phase 5 (line ~192) is
one short paragraph: "Pan, zoom, and touch pinch-zoom, always on (the spike
gates them off to keep the wipe in register). Overlay follows automatically
via `useBoardProjection`." No bound, clamp, or reset rule anywhere in the
source doc. The port's own design.md is explicit that it ships the projection
*seam*, not the *gestures*, at a fixed camera — see its `### Decision: the
overlay renders in board coordinates under a camera-matched CSS 3D
transform`, "On camera parity" subsection: "this change ships the seam at a
fixed camera, tilted 14° … `add-board-camera-controls` is what feeds
pan/zoom into the hook; its signature must not need to change when that
lands." (That named follow-on is this change, under its pre-widening name.)

**Why they are one change.** `useBoardProjection` — the hook the gestures
write into — is itself one of the 39 broken files, and it is broken
*precisely* at the camera seam: it is built on `fitViewBox`, whose signature
and return type both changed in the rewrite
(`fitViewBox(hexesWithinRadius(radius)) → ViewBox` became
`fitViewBox(maxRing, unit) → string`; the `ViewBox` type no longer exists).
Repairing that hook and adding pan/zoom to it are edits to the same lines.
Sequencing them as two changes would mean writing the gesture handlers
against a shape that is about to change, then writing them again.

The only implementation evidence anywhere in the codebase is the spike
(`frontend/app/spike/webgl-board/WebGLBoard.tsx:157-195`): pointer-drag pan
via a `target` vector, wheel zoom clamped to `[0.25, 6]`, both gated behind
an `interactive` flag that stays off in production use of the spike (kept
off specifically so the wipe comparator's two panes stay in register). Pan
has no clamp at all. Pinch has no implementation — `touchAction: 'none'` is
set on the canvas (to suppress the browser's native touch gestures) but no
`touchstart`/`touchmove` handler exists.

The port also pins an overlay pointer policy this change must live inside
rather than reopen: the overlay `<svg>` root is `pointer-events: none`, and
only the per-entity hit shapes set `pointer-events: auto`. A gesture handler
bound to the canvas element underneath therefore never sees a pointerdown or
wheel event that lands on a glyph — see the first Decision below, which is
where that constraint turns into a binding rule for this change.

## Goals / Non-Goals

- Goal: **the frontend builds again.** `npx tsc --noEmit` clean, `npx vitest
  run` green, `npm run e2e` green. This is the change's headline acceptance
  signal; every other goal is subordinate to it.
- Goal: every one of the 39 `@/lib/hex` importers moves to `@/lib/board` /
  `@/lib/polar`, and the three `lib/types/*.ts` wire-shape files carry step
  6's handoff table exactly as recorded — `{q,r}` → `{ring,slot}`,
  `laneGates[].hex` → `laneGates[].cell`, `Orbit` unchanged in shape.
- Goal: the lattice tile is drawn as the annular sector the polar lattice
  actually specifies, replacing the hexagon SDF, at every tier that draws it
  (the instanced GL lattice, the selection/preview outlines, the scan
  overlays).
- Goal: the pacing retune step 6 handed forward (`MsPerTile`,
  `AmbientRadius`, the `move-preview.ts:13` 24× ETA drift) is *performed*,
  with the renderer up, and its chosen values recorded — not left at the
  step-6 placeholders by default.
- Goal: pointer-drag pan, wheel-gesture zoom, touch pinch-zoom, and
  keyboard-driven pan/zoom, all writing into `useBoardProjection`'s existing
  camera-parameter React state with no change to the hook's `project`/
  `unproject` signature.
- Goal: picking continues to resolve correctly (a click on a drawn mark
  selects that mark, a click on a bare cell selects that cell, a click outside
  the lattice clears the selection) at any reachable pan/zoom state — the
  property the port's design explicitly left for this change to own.
- Goal: a gesture that pans or zooms the camera is discriminated from one
  that selects an entity, on both pointer and touch input. The same primary
  input drives both, on the same interactive surface as the port's picking
  requirement; this change is what keeps them from colliding.
- Goal: camera bounds and reset policy stated as testable, confirmable
  behavior — not invented numbers presented as settled.
- Non-goal: **any backend change.** Steps 5–6 moved every Go consumer and
  pinned the wire shapes; this change consumes them and must not reopen them.
  If a DTO looks wrong, that is a step-6 defect to raise, not to patch here.
- Non-goal: **any fixture re-record**, in `fixtures/board/`,
  `fixtures/polar/`, or `fixtures/market/`. The Go↔TS contract is already
  recorded and green; this change consumes it. A frontend change that needs a
  fixture re-record is a signal the mirror drifted, not a licence to re-record.
- Non-goal: the world reset. That is migration **step 8**, independent of
  this change and not blocked by it.
- Non-goal: new gameplay of any kind — no moon targeting, no propellant/
  delta-v, no directional beam, no station occlusion. Step 6 listed these as
  its non-goals and they stay out here too.
- Non-goal: galaxy-tier camera work. `docs/plans/camera-and-input.md` is
  explicitly the **galaxy** 3D camera and says so in its own scope boundary
  ("The board tier is 2D … its 'camera' is plain 2D pan/zoom with a different
  input model; noted here, owned there"). That doc does not govern this
  change, and this change does not touch `galaxy-view`'s camera. The only
  galaxy-tier edits here are the two `@/lib/hex` importers in
  `components/galaxy/`, which are import moves, not behavior changes.
- Non-goal: tilt control. Tilt stays the port's fixed `14°` production
  constant; the spike's tilt slider does not carry over.
- Non-goal: camera presets or bookmarks (e.g., "jump to home system").
- Non-goal: a minimap or any secondary navigation surface.
- Non-goal: a follow-cam (camera auto-tracking a selected or moving fleet).
- Non-goal: inertia/momentum panning or eased/animated camera transitions.
  An animated transition would need to reconcile with the port's `###
  Requirement: Board Respects Reduced-Motion Preference`; deferring the
  question entirely (camera moves land immediately, no easing) sidesteps
  that interaction rather than silently under-specifying it. A future
  change that adds eased transitions must address reduced-motion at that
  time.
- Non-goal: bare-cell keyboard traversal. `port-board-to-webgl-renderer`'s
  proposal defers bare-cell keyboard selection and names this change as the
  candidate to pair it with ("roving tabindex, arrow-key hex traversal").
  This change declines it, and the decline is load-bearing rather than
  incidental: it claims the arrow keys for camera pan — the same key set an
  arrow-key cell cursor would need. See Open Questions.
- Non-goal: zoom-driven level of detail. A working zoom plus
  `uWorldPerPixel` is precisely what a later LOD tier needs (the port's
  `uWorldPerPixel` decision names it), which makes it the most likely thing
  to leak in here. It does not: every mark renders identically at every
  zoom in this change.

## Decisions

### Decision: the tile is an annular sector, carved by a wedge SDF replacing `sdHexagon`

**Choice.** `webgl/scene-lattice.ts` today instances one quad per tile and
carves a hexagon out of it in the fragment shader — `sdHexagon(vLocal.yx,
uApothem - 1.2)` at line ~115, with the comment "Fed p.yx so the flat edges
land where lib/hex/pixel draws." That function and that uniform go away. The
replacement is a wedge SDF bounded by two ring radii and two slot angles,
fed the cell's ring index and the ring's slot count so the angular half-width
is `π / slotsForRing(ring)`.

**Why this is not optional.** `lib/board/pixel.ts` has no `hexPolygonPoints`
and will not grow one: a polar cell is not a hexagon, and the two shapes do
not tile the same plane. Every surface that draws a tile boundary inherits
this — the instanced GL lattice, the SVG selection/preview outlines
(`SelectionPreview.tsx`, `ScanOverlay.tsx`, `ArcScan.tsx`), and
`board-pack.ts`'s `PackedLatticeTile`. `lib/board/pixel.ts`'s own header
already assigns the work here: *"The real renderer work (board SVG, glides,
wedge outlines) rides the renderer step of the polar migration — this module
carries only the basic projection the board components will rebuild on."*

**What the packer owns vs. the shader.** Unchanged from the port's
plumbing/decision rule: `packLatticeTiles` (outside `webgl/`) owns the
ring-band decisions and resolves tints; the shader receives geometry and
draws it. The wedge's *bounds* are packer output (ring inner/outer radius,
slot angular half-width); the SDF is shader plumbing.

**Consequence for the camera half.** A wedge's screen extent grows with ring
index, unlike a hexagon's fixed apothem. The `1.2`-pixel inset the hexagon
SDF used as a constant border becomes ring-dependent if expressed in world
units — so the border is expressed in *screen* units via `uWorldPerPixel`,
which is exactly the uniform the camera half must already re-derive on every
camera change (see the `uWorldPerPixel` Decision below). The two halves of
this change meet here, and it is the strongest argument that they belong in
one change.

### Decision: `useBoardProjection` re-points onto the new `fitViewBox` in the same edit that adds camera state

**Choice.** `use-board-projection.ts:22` imports `fitViewBox`,
`hexesWithinRadius`, `Point`, and `ViewBox` from `@/lib/hex/pixel`.
`hexesWithinRadius` and `ViewBox` are both gone; `fitViewBox` survives with a
changed signature *and* a changed return type — it took a point list and
returned a `ViewBox` object, and now takes `(maxRing, unit)` and returns the
viewBox **string**. `createBoardProjection(radius, w, h, tiltDeg)` currently
does `fitViewBox(hexesWithinRadius(radius))` and reads fields off the result;
it becomes a call on `maxRing` with the string consumed directly by the
overlay `<svg>`.

**Why one edit.** The camera half adds pan-target and zoom to the same
`BoardCameraState` this function constructs, and the fit distance the camera
derives is computed from exactly the value `fitViewBox` returns. Repairing
the import and adding the camera fields are the same three lines. Doing them
in two changes means the first one writes a `ViewBox`-shaped intermediate
that the second one immediately deletes.

**The `project`/`unproject` signature still does not change** — the port's
constraint holds. What changes is what `createBoardProjection` computes
internally and what `BoardCameraState` carries.

### Decision: the capability is renamed by moving the spec directory, and the move must precede archive

**Choice.** `openspec/specs/hex-board-view/` → `openspec/specs/board-view/`,
performed as a repo move during implementation (a task), with this change's
delta already living at `specs/board-view/spec.md`.

**Why a move and not a delta operation.** OpenSpec has `## RENAMED
Requirements` for renaming a *requirement*; it has no operation for renaming
a *capability*. If the delta simply appeared under a new capability name, the
archiver would create a fresh `openspec/specs/board-view/` holding only this
change's ADDED requirements and leave the old `hex-board-view/` behind with
its twenty-odd existing ones — a fork, not a rename.

**The ordering dependency, recorded because it is easy to get wrong.** This
change's delta contains `## MODIFIED Requirements` that target requirements
by character-for-character name. The archiver resolves those against
`openspec/specs/board-view/spec.md`. That file exists only after the move. So
the move is an **implementation task that must land before archive**, not an
archive-time step — see tasks.md. `galaxy-view` is the naming precedent for
dropping the geometry word from the capability name.

**A constraint the archiver enforces, found by rehearsing it.** Running
`openspec archive` against a throwaway copy of `openspec/` (with the move
applied) rejects a `## MODIFIED` block that does not carry **every scenario
title** the current spec has — it matches scenarios by title, and reports
*"current spec contains scenario(s) not present in the modified block"*. So a
MODIFIED requirement may reword scenario **bodies** freely but may not rename
a scenario **heading**. Four scenario titles in this delta therefore keep the
word "hex" while their bodies speak ring/slot; renaming them needs a separate
change that removes and re-adds those scenarios deliberately. This is
recorded because the mismatch looks like sloppiness and will otherwise be
"cleaned up" by the next person to read it — which breaks the archive. The
rehearsal itself is the check: it took the capability from 112 to 150
scenarios with none dropped, at 7 added / 10 modified / 1 renamed.

### Decision: per-frame board work is memoized on LOGICAL state, never on world time

**The problem, found by playing it.** The first working polar board ran at
roughly 1 fps. Two causes, both introduced by this change and both the same
mistake — putting lattice-scale work on the animation frame.

**1. `distance` is an unbounded BFS.** `sensorBubbleCells` was first written as
the obvious translation of the hex version: scan the board, keep every cell
with `distance(centre, cell) <= radius`. But `lib/board`'s `distance` is a
breadth-first search with per-call `Set` and string-key allocation, so that
shape costs a full lattice traversal *per cell per centre*, every frame.
Measured at radius 16 with two centres: **1373 ms per call**. It is now a
bounded multi-source BFS — the `Within` form Go already uses — which runs in
the size of the RESULT: **0.23 ms**, a 5894× reduction, identical output (92
cells both ways). CLAUDE.md names this trap outright: `board.Within` exists
"so a fog read never pays for an unbounded BFS". The client had no `Within`,
so the trap was re-entered on the client instead.

**2. The shadow solve re-ran on frames where nothing changed.** `planSweep` is
O(cells × occluders) with BigInt arithmetic inside `lineOfSight`, and it sat in
render bodies and in memos keyed on `worldTime` — which ticks every frame. Its
answer changes only when an occluder crosses a cell. It is now split:
`sweepOccluders` (cheap, per-frame) resolves the bodies, `occluderKey` is the
memo identity, and `planSweepFrom` (expensive) re-runs only when that key
changes. The committed sweep of a RUNNING scan is the sharper case — it is
evaluated at the frozen eta, so it never changes at all while the scan runs;
only whether it is still drawn does. That gate now sits outside the memo.

**The rule.** Anything that touches the lattice at large — the sensor bubble,
the shadow solve, any future coverage or range overlay — is memoized on the
LOGICAL state it actually depends on (cell keys, occluder sets), never on
`worldTime`. `worldTime` belongs in the glide interpolation and nowhere else:
that is the "quantize the simulation, interpolate the picture" split doing its
job. A memo listing `worldTime` next to lattice-scale work is a bug.

### Decision: the schedule is threaded explicitly, with a memoized default for the graph tier

**The problem, found in implementation.** The polar rewrite made `Schedule` a
required trailing parameter on nearly every board function — `stateAt`,
`shipPos`, `orbState`, `coastAt`, `solveCell`, `solveIntercept`, `distance`,
`neighbors`, `cellToPoint`, `pointToCell`, `ringCells`. Their hex-era
equivalents took none. That is 26 call sites across 11 frontend files, and how
the schedule reaches them was unspecified.

**Choice.** Thread it explicitly. A board read resolves `schedule(board.radius)`
once and passes it down alongside `worldTime`, which these components already
thread. This mirrors the backend rule CLAUDE.md records — *"every consumer
resolves its schedule through `board.ProductionSchedule()` … or
`board.Schedule(radius)` where a per-system radius is authoritative, never a
literal"* — and keeps the seam visible at every call site rather than ambient.

**The graph-tier exception.** Three consumers call schedule-taking functions
but never see a board radius, because they are graph-tier and work from a fleet
list with no `SystemBoard` in scope: `components/fleet/fleet-status.ts`,
`components/galaxy/GalaxyView.tsx`, and `components/board/board-frame.ts`.
These use a new `productionSchedule()` — the TS mirror of Go's
`board.ProductionSchedule()`, memoized on the default board radius.

**Why that is safe, and the bound on it.** `lib/board/board.ts` pins the
invariant: *"maxRing is per-system; the slot count of any given ring is the
same under every maxRing."* So for anything that only consults
`slotsForRing(cell.ring, …)` — projection, and every movement fold — a schedule
built at any radius gives identical answers. Only two operations actually
depend on `maxRing`: cell **enumeration** (`ringCells`) and **rim clamping**
(`pointToCell`). None of the three exception files does either. Any consumer
that does one of those MUST take the per-system schedule; `productionSchedule()`
is not a general escape hatch, and its doc comment says so.

**Alternative considered and rejected: a React context supplying the schedule.**
It reads cleaner inside the components, but it hides the seam, and it does
nothing for the three non-React modules — which would still need the memoized
default. That leaves two mechanisms where one suffices.

### Decision: the pacing retune is an owned task with recorded values, not a default

**Choice.** `MsPerTile`, `AmbientRadius`, and the `move-preview.ts:13` 24× ETA
drift are retuned in this change, by Travis, with the renderer running, and
the chosen values are recorded in tasks.md as they are set.

**Outcome (2026-08-26).** The drift was not a tuning question at all — it was a
stale mirror (`MS_PER_TILE` 60_000 against the backend's 2_500) and is fixed.
The two genuine knobs were exercised as this Decision demanded — surfaced with
their values, decided on deliberately — and Travis's decision was to keep both
(`MsPerTile = 2_500`, `AmbientRadius = 3`) and retune later. That satisfies the
"not a silent default" requirement this Decision is about, while leaving the
retune itself owed to a follow-up. The pairing constraint survives: both are
deferred together, never one without the other.

**Why it cannot be deferred again.** Step 6 kept these at their hex-era values
deliberately and said why: arc paths on a polar lattice are *materially
longer* than the chords they replaced, so `MsPerTile` now buys a different
amount of board than it did, and `AmbientRadius` should be reconsidered "only
in that same session, with the renderer up, so the two are tuned against one
another rather than in isolation." This change is the first moment a renderer
exists to tune against. If it ships without the retune, the numbers become
load-bearing by accident — the exact failure mode step 6 was avoiding by
deferring rather than guessing.

**Scope discipline.** Retuning these three is in scope. Re-recording any
fixture, or changing `OrbitPeriod`/`ScanDuration`/`BoardRadius` (which step 6
also froze), is not — those are cross-stack constants with a Go side, and
moving them is a separate change with a fixture story.

### Decision: consume `useBoardProjection`'s ownership model as designed, not reopened

The port's design.md is explicit: `useBoardProjection` owns the camera
parameters (container size, fit distance, tilt, and — per its own text —
"later — zoom and pan target") in React-side state and hands them *down* to
the canvas each frame; it never reads them back out of
`THREE.PerspectiveCamera`. This change's gesture handlers write pan and zoom
values into that same state, extending it with the zoom/pan-target fields
the port's design already anticipated. No new seam, no signature change to
`project`/`unproject`.

**Alternative considered and rejected: a second, independent camera state
for gestures, reconciled into the hook's output.** Rejected because it
reintroduces exactly the desync risk that motivated carving the camera out
into its own change in the first place — two sources of truth for "where is
the camera" is what breaks canvas/overlay registration, and registration is
the single property the whole three-layer architecture depends on.

### Decision: gestures bind at the stage, and a movement threshold separates a drag from a click

The port's overlay pointer policy makes the overlay `<svg>` root
`pointer-events: none` with per-entity hit shapes `pointer-events: auto`. A
handler bound to the canvas element therefore never sees a pointerdown or a
wheel event that lands on a glyph — pan and zoom would dead-zone over every
mark on the board. Camera gesture listeners bind on the `BoardStage`
container instead, in the capture phase, so a gesture works over any part of
the board while the overlay keeps its hit targets. **This is a normative
requirement, not only an implementation note:** `### Requirement: Board
Camera Pan and Zoom` states directly that a drag or wheel gesture that
begins over a mark pans/zooms exactly as it would over bare board — an
earlier draft of this change left that assertion only here and in tasks
2.1, which a `BoardCanvas`-bound implementation (the obvious-looking
choice) would still pass while dead-zoning every glyph.

Binding at the stage also puts the board's own on-screen camera controls
(recenter, and the keyboard-operable pan/zoom affordances) inside the same
capture-phase surface the picking path listens on. `### Requirement: Board
Camera Pan and Zoom` excludes activating those controls from the
click-to-pick path for the same reason the movement threshold excludes a
pan from it: the control is not a board click, even though it sits inside
the board region the picking listener covers.

That makes the primary button serve both pan and select, so the two must be
discriminated: a pointer sequence is a *click* only if total movement
between down and up stays under a threshold; at or past it the sequence is
a pan and MUST NOT change the selection. Without this, every pan that
happens to end over a mark selects it, and a pan ending over the currently
selected mark deselects it through `### Requirement: Toggle-to-Deselect
Single Selection` — the camera would silently reach into the selection
model.

**The threshold is pinned at 8 CSS pixels — the common touch-slop
convention — not left blank.** An earlier draft of this change treated
this the same as the pan-clamp margin or the key bindings: a genuinely
unknowable product choice, left as an Open Question with no default in the
spec. That was wrong for this specific value. Ship it blank (i.e., at the
implementation default of 1 device pixel) and every scenario still passes
— synthetic test events land at exact coordinates with zero jitter — while
on a real touchscreen finger contact wanders 2–5 px during a tap, so every
tap resolves as a pan and touch users cannot select anything at all: the
exact failure this discrimination exists to prevent. Ship it at, say, 40
px, and short intentional drags start stealing selections instead. Unlike
the pan-clamp margin (no standard convention — any number is a guess) or
the key bindings (a UX preference with no dominant convention on this
board), 8px sits on a well-known, near-universal touch-target/touch-slop
convention, so a blank is strictly more dangerous here than a stated
default. It is recorded as an Open Question purely for confirmation, not
because the value is unsourced.

The same threshold governs touch: the pinch/pan suppression this change
adds to the board's interactive surface MUST NOT prevent a tap that stays
under the threshold from producing a selection, or this change and the
port's picking requirement are not simultaneously satisfiable on touch —
suppressing the browser's native pinch requires `preventDefault()` on
`touchstart`, and that is exactly what stops the synthesized `click` from
firing after a tap in most engines.

React's `onWheel` is attached passively at the document root, so
`e.preventDefault()` inside a React wheel handler is a no-op and wheel zoom
would also scroll the page underneath the board. The wheel listener is
bound with `addEventListener('wheel', handler, { passive: false })`, the
same pattern the spike already uses (`WebGLBoard.tsx:195`), not React's
`onWheel` prop.

**Alternative considered and rejected: pan only on the board background
(canvas hits only).** Rejected — the board's marks are exactly the region a
player wants to drag from, and the dead zones would be invisible and
inconsistent.

### Decision: zoom clamp `[0.25, 6]`, inherited from the spike, as the shipped default

Cited from `WebGLBoard.tsx:187`
(`THREE.MathUtils.clamp(zoom * Math.pow(0.9984, e.deltaY), 0.25, 6)`) — the
only number in this entire area with any grounding. The clamp is
scale-relative by construction: zoom is a multiplier over the fit-to-lattice
framing (`dist = fitDist / zoom`), and every production system shares one
board radius — `common.Tuning().BoardRadius = 16`
(`backend/common/tuning.go:95-100`), sourced by `system.DefaultParams()`,
and matched by the spike's own mock board (`mock-board.ts:108`). There is no
varying system extent for this clamp to be mistuned against; what remains
genuinely open about it is narrower than "is this the right number" — see
Open Questions.

**Alternative considered and rejected: derive a clamp from system radius or
device pixel ratio.** Rejected for lack of any design-doc or spike
precedent; inventing a formula would be exactly the fabrication this
change's brief prohibits, and — per the grounding above — there is no
varying radius for such a formula to key off in the first place.

### Decision: pan clamp — the camera's pan target is confined to the lattice's bounding disc

Pan is clamped so the camera's pan target cannot leave the lattice's own
bounding **disc** — radius `ringRadius(maxRing) * RADIAL_UNIT` about the core
cell: the board's centre of view is always over the lattice. The disc is the
polar lattice's natural bound and replaces the hex era's bounding box; it is
also the cheaper test (one `Math.hypot` against a radius, no per-axis clamp),
and unlike a box it admits no corner region that is inside the bound but off
the board.
This is decided, not qualitative — it replaces an earlier draft that left
the exact bound (a pixel margin, a percentage of lattice radius) as an
Open Question. That draft's qualitative wording ("at least part of the
lattice within the visible viewport") is satisfied by one visible pixel of
rim in a screen corner, which is exactly the dead end this clamp exists to
forbid: an unrecoverable near-empty view a player should never reach by
accident. Confining the pan target to the lattice's bounding disc is
testable, decidable without a tuning value, and makes the pixel-margin
question moot at zero cost — there is no longer a number to confirm.

**Alternative considered and rejected: ship the spike's actual behavior
(no pan clamp at all).** Rejected because the spike never needed one — its
pan is gated off in the tuning bench's default mode, and the wipe comparator
was never exposed to a player who could get stuck. Production exposes pan
to every player on the primary play surface.

**Alternative considered and rejected: a qualitative "some part of the
lattice stays visible" bound, margin left open.** This is what the first
draft of this change shipped. Rejected on repair: it is satisfied by one
pixel of rim in a screen corner, which does not deliver the "board's
centre of view is always over the lattice" property the justification
above actually needs — the qualitative wording under-delivers its own
stated goal.

**Alternative considered and rejected: a fixed pixel margin or a
percentage of lattice radius.** Rejected as an arbitrary tuning value with
no design-doc or spike precedent — unlike the bounding-box rule, either of
these would need a specific number invented and defended, for no added
behavioral guarantee over the bounding-box rule.

### Decision: reset policy — reset on `systemId` change only

Camera state does **not** reset on a selection change or on a realtime
data refetch; it **does** reset to the board's default framing, immediately
and with no eased transition, when the route's `systemId` changes.

Reset is implemented as an effect on `systemId` inside the hook, not a
keyed remount of `BoardStage`. App Router reuses the component tree across
dynamic-segment navigation, so camera state does not reset by itself on a
`systemId` change — but forcing a reset with `key={systemId}` on the stage
would tear down and re-create the WebGL context on every system-to-system
navigation, an unnecessary cost on the primary play surface and an
unnecessary trip through the port's first-frame loading state every time a
player moves between systems.

**Alternative considered and rejected: reset on every refetch.** Rejected —
resetting a player's view mid-interaction (they panned to inspect a corner
of the system, a routine poll lands, their view snaps back) is hostile and
would make the camera feel unreliable to use.

**Alternative considered and rejected: never reset, even across `systemId`
changes.** Rejected — a fresh system is a fresh view; carrying over a
previous system's pan/zoom offset (which may not even correspond to
anything meaningful on the new board — different radius, different feature
layout) produces confusing initial framing with no way for a player to
recognize why the board looks that way.

Both halves of this policy are the brief's proposed defaults, not confirmed
product decisions — see Open Questions.

### Decision: a manual recenter control, decided together with the keyboard controls' focusable surface

The camera resets only on `systemId` change. A player who pans away has no
way home short of leaving the route entirely — and even that only helps if
route unmount/remount genuinely counts as a `systemId` change, which
nothing asserts. The baseline already establishes the *pattern* this board
lacks — a control that resets the view on demand: `galaxy-view`'s `###
Requirement: Own-Fleet Presence and Recenter Target`. That precedent is
**fleet-targeted**, not origin-framed — it drives the recenter control to
snap to the requester's active fleet's system when one exists, falling
back to a whole-galaxy framing otherwise. This board's recenter is a
different framing: it is explicitly **origin-framed**, resetting to the
*default framing* defined in `### Requirement: Board Camera Pan and Zoom`
(fit-to-lattice at zoom `1×`, pan target at the lattice origin `(0,0)`) —
not a snap to the acting fleet's current position. The galaxy-view
requirement is cited here only for the *pattern* (a manual reset-to-known-
framing control belongs on this board too, per established precedent),
not for its specific framing target; the two requirements resolve "reset
the camera" to different points by design, and the `systemId` reset and
this recenter control agree with each other because both point at the
same defined default framing. This change adds `### Requirement: Board
Camera Manual Recenter`: a control, reachable via the board's normal tab
order, that resets pan and zoom to the default framing on demand,
immediately and with no eased transition — the same immediacy the
`systemId`-triggered reset carries, so this control cannot reintroduce the
animated-transition question the reduced-motion non-goal above closes.

This is decided together with a question the keyboard-operability
requirement otherwise leaves implicit: "reachable via the board's normal
tab order" and "a visible focus indicator while focused" already presume a
focusable camera-control surface exists — on-screen affordances, most
plausibly — that nothing in this change has separately decided to build.
Landing the recenter control and the keyboard controls' concrete widget
shape as two independently-designed pieces of new board UI risks visual
collision (two controls competing for the same corner of the screen, or
redundant affordances). Both are specified here as behavior — what they do
— and their concrete visual form is left to one Open Question below,
resolved together rather than piecemeal.

### Decision: keyboard step magnitudes — one radial unit per pan press, one wheel-notch equivalent per zoom press

Arrow-key pan and zoom-key input had no magnitude in the first draft of
this change — "arrow-key input SHALL pan the camera" said nothing about
*how far* one key press moves it. The same reasoning that pins the tap/pan
threshold applies here: this is a value with a legible, defensible default
whose absence is actively harmful, not a genuinely unknowable product
choice like the exact key bindings. A 1-device-pixel step passes every
scenario written against it and takes several hundred keypresses to cross
a radius-16 board — keyboard-only pan would be practically unusable. A
whole-board step is equally useless in the other direction, overshooting
past anything the player meant to reach.

**Decided:** one key press pans the camera by one radial unit (`RADIAL_UNIT`,
`lib/board/pixel.ts:21`) at the
camera's current zoom (a legible, board-native unit — the same increment a
bare-cell arrow-key cursor would use, keeping the two candidate claims on
the arrow keys, see the Non-Goal above and its Open Question, comparable
in feel even though only one is built here) and zooms by one
wheel-notch equivalent (the zoom delta a single wheel-scroll notch
produces under this change's wheel-zoom handling) — a step size already
tuned once, for wheel input, rather than a second independently-invented
zoom increment.

**Alternative considered and rejected: a fixed pixel step for pan.** A
screen-pixel step's felt size changes with zoom (the same pixel count
covers less board at `6×` than at `0.25×`), while a radial-unit step stays
legible at any zoom — it always moves by "one tile," which is the unit the
board's own picking and selection already reason in.

Recorded as an Open Question purely for confirmation (see Open Questions),
the same as the tap/pan threshold — not because either magnitude is
unsourced.

### Decision: tilt stays fixed; this change does not add a tilt control

The port ships tilt as a fixed `14°` production constant, replacing the
spike's tuning slider. Phase 5 of the source doc names "pan, zoom, and touch
pinch-zoom" only — tilt is absent from that list. This change's scope
matches the doc's wording exactly; a tilt control (if ever wanted) is a
separate, later decision with its own bounds to source.

### Decision: picking-after-pan/zoom is this change's property to specify and test — for marks, bare cells, and outside the lattice alike

The port's design.md states directly that it does *not* carry a
camera-invariance scenario in its `### Requirement: Board Picking Resolves
to the Entity Under the Pointer` — that requirement is scoped to a fixed
camera, by design, because camera was carved out here. This change's `###
Requirement: Board Camera Pan and Zoom` is where that scenario lives: a
click on a mark at its drawn screen position resolves to that mark
regardless of the camera's current pan and zoom. This is the single most
important scenario in this change — it is the whole reason the projection
seam (`project`/`unproject`, camera-matched overlay registration) was built
during the port instead of being deferred alongside the gestures.

That coverage now explicitly extends past marks to the picking path that
touches no mark at all: a bare-cell click (canvas click → `unproject` →
`pointToCell`) and a click outside the lattice. `useBoardProjection`
publishes the camera in two forms — `project`/`unproject` for tile picking,
and the overlay's camera-matched CSS 3D transform for glyph hit targets.
Under the port's fixed camera those two expressions agree by construction:
they were tuned once, at one camera. This change is what makes them
agree-or-not across a genuinely two-dimensional domain (pan × zoom),
because it is the first thing in this codebase that moves the camera at
all. The bare-cell and outside-lattice scenarios below assert the two
expressions stay in agreement across that domain, not only at the marks the
mark-picking scenario exercises.

### Decision: zoom is anchored to the camera's current pan target, not the cursor

Every other camera parameter in this change gets an explicit Decision,
including under-sourced ones; the zoom anchor had none, silently inheriting
whatever the spike happens to do. The spike's only implementation zooms
about the camera target — centre-anchored — never the cursor
(`WebGLBoard.tsx:184-188`). This change pins that as the specified
behavior: a wheel-zoom gesture keeps the point the camera is currently
centred on fixed at the same screen position after the zoom. The same
anchor applies to pinch.

**Alternative considered and rejected (for now): cursor-anchored zoom (pinch
midpoint-anchored).** Cursor-anchoring is the near-universal map-application
convention, and it changes both the pan-target math and its interaction
with the pan clamp — a bigger change than a footnote. Rejected here
specifically because the spike is the only implementation evidence in this
codebase and Travis tuned it; switching to cursor-anchoring on the basis of
convention alone, with no evidence either way in the spike or the source
design doc, would silently change feel rather than confirm it. Recorded as
an Open Question rather than decided by fiat.

### Decision: the camera math is a pure module; the handlers are a thin shell

Clamping, wheel-delta → zoom, pinch-distance → zoom, drag-delta → pan
target, and the pan bound are a pure function of (current camera params,
gesture delta, lattice extent, container size) — one module outside
`components/board/webgl/`, importing neither React nor three.js,
table-tested in vitest. The event handlers only translate DOM events into
those inputs and write the result into the hook's state.

Two reasons this is not optional. The port's plumbing/decision rule makes
anything that *decides* something live outside `webgl/` and be tested
there, and a clamp is a decision. And multi-touch pinch specifically is not
reachable from Playwright's `page.touchscreen` without raw CDP touch
dispatch, so the pinch (two-finger) half of `### Requirement: Board Camera
Touch Pinch-Zoom` is only cheaply assertable at this level — the pure
reducer is what makes pinch's clamp and anchor behavior testable at all.

**This does not extend to the single-finger tap/pan half of the same
requirement, and an earlier draft of this change conflated the two.**
`page.touchscreen.tap()` and touch-drag dispatch *are* reachable from
Playwright in a `hasTouch: true` browser context — only multi-touch pinch
needs raw CDP. The pure reducer never touches DOM event plumbing at all
(`touchstart`'s `preventDefault()` suppressing the synthesized `click` is
exactly the risk `### Requirement: Board Camera Touch Pinch-Zoom`'s tap
scenario exists to catch), so a jsdom/vitest test against the reducer
cannot see that failure. The reachable e2e half needs its own test vehicle
— see tasks 3.4/3.5 — not a claim that the reducer already covers it.

### Decision: zoom reaches the shaders and the overlay through the two values the hook already publishes — both re-derived per camera change, not once at construction

`useBoardProjection` publishes the camera in two forms: `worldPerPixel` (fed
to `uWorldPerPixel` on every shader — the port's decision) and the overlay's
camera-matched CSS 3D transform. `worldPerPixel = (2 · dist · tan(fov/2)) /
containerHeightPx` with `dist = fitDist / zoom`, so zoom already flows to
every shader with no re-plumbing — *provided* the uniform is written
whenever the value changes rather than set once at scene construction.
Under the port's fixed camera the value changes only on resize, so a
construct-time write is indistinguishable from a correct one; this change
is where the two diverge. The overlay transform likewise must be recomposed
from pan and zoom, not have a scale appended — its composition order
relative to `rotateX(tilt)` is what keeps a tilted board in register at
non-unit zoom.

These are two expressions of one camera. Glyph hit targets ride the CSS
transform while tile picking rides `project`/`unproject`; they agree today
because they were tuned at one camera. The gate is a pure test asserting
`project(p)` and the published transform map the same board point to the
same screen point across the reachable domain — both ends of the zoom
clamp, and off-centre pan. It needs no GL context.

### Decision: the picking property stays an ADDED requirement, not a MODIFIED rewrite of the port's

This change's `### Requirement: Board Camera Pan and Zoom` restates that hit
targets for fleets, features, and lane gates "remain positioned at the marks
actually drawn," which the port's `### Requirement: Board Picking Resolves
to the Entity Under the Pointer` also states — two requirements in one
capability normatively covering one property, distinguished by trigger (a
fixed camera vs. any reachable pan/zoom). Keeping this an ADDED requirement,
rather than a MODIFIED rewrite of the port's picking requirement, is
deliberate: a MODIFIED delta would force a complete rewrite of a
requirement that does not yet exist in `openspec/specs/` — `port-board-to-
webgl-renderer` has not been archived at the time of writing — and
`add-renderer-availability-states` already used the same split-by-trigger
shape for an overlapping property. Recorded so the overlap reads as a
considered choice rather than an unnoticed duplication.

## Risks / Trade-offs

- **The change is large and its middle is unbuildable.** Steps 1–3 of the
  Migration Plan cannot be verified by the compiler until step 4, because the
  frontend does not build until then. This is the single biggest risk to
  landing it: a mistake made in step 1 is not observable until step 4. It is
  mitigated by ordering (types first, so the error list becomes a work-list),
  by the fact that `lib/board` and `lib/polar` are already green and
  fixture-tested, and by keeping the camera half — which is genuinely new
  behavior — strictly after the build goes green, so new code is never
  debugged against a broken baseline.
- **The rename table is mostly mechanical, which is exactly what makes the
  non-mechanical parts easy to miss.** `Hex`→`Cell`, `hexKey`→`cellKey`,
  `hexToPixel`→`cellToPoint` and friends are safe substitutions. The three
  that are **not** are `fitViewBox` (changed signature *and* return type — a
  call that still compiles after a careless edit can silently produce a wrong
  viewBox), `hexPolygonPoints` (no replacement at all — an annular sector),
  and the core cell (`{ring:0, slot:0}` is the *single* core cell, where
  `(0,0)` was one axial origin among many). A grep-and-replace pass that
  reports "done" is the failure mode; these three want individual attention.
- **A wedge's screen extent varies with ring index; a hexagon's did not.**
  Any constant expressed in world units that looked fine at a fixed apothem —
  border insets, glyph sizing, hit-target padding — may read wrong at ring 1
  versus ring 15. The mitigation is expressing them in screen units through
  `uWorldPerPixel`, which the camera half already forces to be correct per
  camera change.
- **Registration desync is the load-bearing risk.** If a gesture handler
  ever writes a camera value the overlay's registration transform hasn't
  yet applied (a stale frame, a race between two input sources), hit
  targets drift from what is drawn and picking silently breaks — for a
  mark's hit target and for bare-cell resolution alike. Mitigation: the
  picking-after-pan/zoom scenarios (mark, bare cell, outside lattice) are
  this change's primary e2e gate, not an afterthought, backed by the pure
  `project`/transform-agreement unit test.
- **Touch pinch competes with the browser's native page-zoom gesture, and
  suppressing it can silently break selection.** The spike already sets
  `touchAction: 'none'` on the canvas to suppress native touch gestures
  there; this change must extend the same suppression to the overlay's
  interactive surface. But the mechanism that suppresses native pinch
  (`preventDefault()` on `touchstart`) also suppresses the synthesized
  `click` a tap would otherwise produce in most engines — without the
  movement-threshold discrimination (see Decisions), touch users would be
  unable to select anything on the board at all, not merely inconvenienced.
- **Pointer-move-cadence state updates cost a re-render of the overlay's
  hit-shape tree on every drag frame.** The spike avoided React entirely by
  keeping `target`/`zoom` in the render-loop closure; production writes
  camera state into `useBoardProjection`'s React state instead (per the
  ownership-model decision above), which the overlay's hit-shape tree
  re-renders against on every frame of a drag. This is a cost, not a design
  flaw to fix by reopening camera ownership — the canvas reads the same
  values through a mirroring ref inside its render loop rather than the
  loop being rebuilt around React state. Named here so the rejected "second
  independent camera state" alternative isn't reinvented later as a
  performance fix under pressure; if the re-render cost proves material, the
  fix is memoizing/virtualizing the overlay's hit-shape tree, not
  duplicating camera state.
- **The zoom clamp's remaining open question is narrower than "is this
  number right."** The bound itself is scale-relative by construction and
  every production system shares one board radius (see the zoom-clamp
  Decision above), so it is not the under-sourced number the first draft of
  this change treated it as. What is genuinely unvalidated is density-
  dependent (whether `6×` separates co-located marks in a dense interior)
  and floor-usefulness (whether any zoom below `1×` does anything but shrink
  the board into empty void) — narrower risks than "wrong clamp for varying
  system sizes." The reset policy remains the brief's proposed default, not
  a confirmed decision; the pan clamp is now a decided rule (the camera's
  pan target confined to the lattice's bounding disc), not an open value —
  see the pan-clamp Decision above. The change is frontend-only and
  trivially revertible, so the cost of shipping a wrong default anywhere in
  this area is a follow-up tuning pass, not a data migration.

## Migration Plan

Frontend-only. No backend change, no schema change, no data migration, no
feature flag. The world reset is **step 8** and is independent of this change.
Rollback is a plain revert — but note the revert restores a *non-building*
frontend, because that is the state this change starts from.

The build is red for the whole middle of this sequence. That is expected and
is inherited from step 6, not introduced here; the first moment it can go
green is step 4.

1. **Types first.** Re-point `lib/types/{fleet,action,system-board}.ts` onto
   `@/lib/board`, applying step 6's handoff table. Everything downstream
   type-checks against these, so doing them first turns the remaining errors
   into a real work-list instead of a cascade.
2. **Non-board importers.** `components/galaxy/`, `components/fleet/`,
   `hooks/use-fleets.ts`, `lib/services/fleet-service.ts` — these are import
   moves and rename-table substitutions with no geometry in them. Clearing
   them early shrinks the error count to the genuinely hard set.
3. **Board components and the wedge renderer.** The rename table across
   `components/board/`, `use-board-projection.ts` onto the new `fitViewBox`,
   then the wedge SDF and the packer changes it needs. This is where the
   change stops being mechanical.
4. **Green the build.** `tsc --noEmit` clean and `vitest run` green. Every
   later step is additive on a building frontend.
5. **e2e repair.** `e2e/tests/{board,slice,new-user,spawn-exhaustion}.spec.ts`.
   Red since step 6 by design; this is the first point they can pass.
6. **The camera gestures.** The pure camera-math module, then the handlers,
   then the picking-under-pan/zoom gates. Additive on a green build.
7. **The pacing retune.** With the renderer up, in one session: `MsPerTile`,
   `AmbientRadius`, the `move-preview.ts:13` ETA drift. Owner: Travis.
8. **The spec move.** `openspec/specs/hex-board-view/` →
   `openspec/specs/board-view/`, before archive — see the capability-rename
   Decision for why this is an implementation task and not an archive step.

## Open Questions

- **`MsPerTile` after the play test** — **RESOLVED as a deferral, 2026-08-26.**
  Kept at `2_500`; Travis deferred the retune to a later session. Step 6
  froze it at its hex-era value and named this step as where it gets set,
  because arc paths on the polar lattice are materially longer than the chords
  they replaced — that reasoning still stands and the retune is still owed,
  just not here. Recorded as an explicit decision in tasks.md 14.1 rather than
  shipped as a silent default, which is the failure mode this question
  existed to prevent. Note for whoever picks it up: the number is unchanged
  but the FELT pace is not, because until this change's 14.3 fix the client
  previewed every board ETA at 24× the server's.
- **`AmbientRadius` after the play test** — **RESOLVED as a deferral,
  2026-08-26.** Kept at 3, deferred with `MsPerTile`. Step 6's instruction
  that the two be tuned against one another rather than in isolation is
  honoured by deferring BOTH: neither moves without the other.
- **The `move-preview.ts:13` 24× ETA drift** — **RESOLVED: a stale mirror,
  fixed outright.** The frontend held `MS_PER_TILE = 60_000` while the backend
  has been `MsPerTile: 2_500` since the 2026-07-13 pace retune
  (`common/tuning.go`). 60_000 / 2_500 is exactly the 24×; the mirror was
  never updated with it. Not a tuning constant, so it did NOT wait on the
  retune above. See tasks.md 14.3, including the `etaLabel` seconds-resolution
  fallout the correction exposed.
- **Does the star's widened shadow need a gameplay counterweight?** Inherited
  from step 6, unanswered there, and this is the first change where it is
  *visible*: the far side of the core is genuinely dark now, so a corp
  scanning from ring 3 can never see the opposite inner system without moving.
  Step 6 called this "a play question, not an architecture one." It becomes
  answerable the moment the renderer is up. Not blocking this change, but do
  not let it ship unlooked-at.
- **Zoom clamp bounds.** `[0.25, 6]` comes from the spike, and the "tuned
  against mock data" worry is narrower than it looks: the spike's mock
  board is radius 16 and every production board is also radius 16 —
  `BoardRadius` is a cross-domain invariant that `system.DefaultParams()`
  sources, so there are no varying system radii to validate against, and
  zoom is a multiplier over the fit framing, i.e. scale-relative by
  construction. What is genuinely unvalidated is (a) whether `6×` is enough
  magnification to separate co-located marks in a dense `star_rich`
  interior (density, not extent, is what varies), and (b) whether any zoom
  below `1×` is useful: at `zoom < 1` the whole lattice already fits, so
  zooming out only shrinks the board into empty void — and it makes the pan
  clamp trivially satisfiable, since a quarter-size board is hard to push
  off-screen. Confirm the floor: `1×` (fit) or the spike's `0.25×`.
- **Reset policy.** Proposed default: camera does **not** reset on
  selection change or on a realtime refetch; it **does** reset on
  `systemId` change. Confirm or correct.
- **Tilt.** Proposed: stays fixed at the port's `14°` production constant,
  not exposed as a user control in this change. Confirm this remains out of
  scope rather than something a near-term follow-up should add.
- **Exact keyboard bindings.** This change's keyboard requirement assumes
  arrow keys for pan and dedicated zoom-in/zoom-out key input, following the
  common map/board-navigation convention — there is no design-doc or spike
  precedent for this specific binding. Confirm the keys. **This is blocking,
  not merely open:** the requirement's "WHEN zoom-in or zoom-out key input
  is given" scenario (and, until the arrow-vs-cell-traversal question below
  is also resolved, the arrow-key pan scenario) names no inducible trigger
  today — no tester can write these two scenarios' test until the specific
  keys are confirmed. Tasks 4.1 and 4.2 are blocked on this answer, not
  merely deferred past it.
- **Tap/drag movement threshold — confirm the pinned value.** Pinned at 8
  CSS pixels (the common touch-slop convention) rather than left blank —
  see the movement-threshold Decision above for why a blank was rejected
  for this specific value. Confirm 8px, or correct it with evidence (e.g. a
  target device's measured touch jitter).
- **Keyboard step magnitudes — confirm the pinned values.** Pinned at one
  radial unit per pan key-press and one wheel-notch equivalent per zoom
  key-press — see the keyboard-step-magnitude Decision above. Confirm these
  defaults, or correct them with evidence (e.g. observed keyboard-only
  playtesting).
- **Arrow keys: camera pan or cell traversal.** The port deferred bare-cell
  keyboard selection and nominated this change as its home; this change
  instead binds arrows to camera pan. Confirm arrow-key pan is the right
  claim on those keys, or reassign one of the two (camera pan on WASD,
  arrows reserved for a future roving cell cursor) before the binding sets
  and a later change has to break it.
- **Pinch-zoom UX shape.** Two-finger pinch maps to zoom and single-finger
  touch drag reuses pan — a reasonable default by touch-interaction
  convention, but there is no design-doc or spike precedent to validate it
  against (pinch has no implementation anywhere in the codebase today).
- **Zoom anchor: cursor vs. centre.** This change pins the spike's actual
  behavior (zoom anchored to the camera's current pan target, i.e.
  centre-anchored) as specified. Whether zoom should instead be
  cursor-anchored (and pinch midpoint-anchored) — the more common map
  convention, but with no evidence in the spike or design doc — is left
  open; do not switch to it on the basis of convention alone.
- **UI surface: the recenter control and the keyboard camera controls'
  focusable widget, decided together.** This change specifies the recenter
  control's and the keyboard controls' *behavior*, not their visual form.
  "Reachable via the board's normal tab order" with "a visible focus
  indicator" for the keyboard controls implies some focusable on-screen
  affordance (pan/zoom buttons?) that nothing here decides to build; the
  recenter control is the same kind of new, visible board UI. Decide their
  concrete shape and placement together, so they don't land as two
  independently-designed widgets competing for the same corner of the
  screen. (Their tab-order *position* — before the fleet/feature/lane-gate
  hit targets — is now decided, see `### Requirement: Board Camera Is
  Keyboard-Operable`; what remains open here is their visual form and
  screen placement, not their place in the tab sequence.)
- **Camera state across a lost/restored rendering context.** `add-renderer-
  availability-states` defines lost → interrupted → restored; this change
  enumerates camera persistence across a selection change and a realtime
  refetch, and reset on `systemId` change, but a context restore is a
  fourth event neither change's spec currently names. Proposed answer,
  which falls out of the port's component split for free: the camera
  survives a context loss/restore unchanged, because camera state lives in
  React state in `BoardStage`, above `BoardCanvas`, and `BoardCanvas` — not
  `BoardStage` — is the thing that dies and is recreated. Confirm before
  this interacts with implementation.
