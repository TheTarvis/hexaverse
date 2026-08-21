## Context

`docs/plans/webgl-board-port.md` phase 5 (line ~192) is one short paragraph:
"Pan, zoom, and touch pinch-zoom, always on (the spike gates them off to
keep the wipe in register). Overlay follows automatically via
`useBoardProjection`." No bound, clamp, or reset rule anywhere in the source
doc. The port's own design.md is explicit that it ships the projection
*seam*, not the *gestures*, at a fixed camera — see its `### Decision: the
overlay renders in board coordinates under a camera-matched CSS 3D
transform`, "On camera parity" subsection: "this change ships the seam at a
fixed camera, tilted 14° … `add-board-camera-controls` is what feeds
pan/zoom into the hook; its signature must not need to change when that
lands." This change is that follow-on.

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

- Goal: pointer-drag pan, wheel-gesture zoom, touch pinch-zoom, and
  keyboard-driven pan/zoom, all writing into `useBoardProjection`'s existing
  camera-parameter React state with no change to the hook's `project`/
  `unproject` signature.
- Goal: picking continues to resolve correctly (a click on a drawn mark
  selects that mark, a click on a bare hex selects that hex, a click outside
  the lattice clears the selection) at any reachable pan/zoom state — the
  property the port's design explicitly left for this change to own.
- Goal: a gesture that pans or zooms the camera is discriminated from one
  that selects an entity, on both pointer and touch input. The same primary
  input drives both, on the same interactive surface as the port's picking
  requirement; this change is what keeps them from colliding.
- Goal: camera bounds and reset policy stated as testable, confirmable
  behavior — not invented numbers presented as settled.
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
- Non-goal: bare-hex keyboard traversal. `port-board-to-webgl-renderer`'s
  proposal defers bare-hex keyboard selection and names this change as the
  candidate to pair it with ("roving tabindex, arrow-key hex traversal").
  This change declines it, and the decline is load-bearing rather than
  incidental: it claims the arrow keys for camera pan — the same key set an
  arrow-key hex cursor would need. See Open Questions.
- Non-goal: zoom-driven level of detail. A working zoom plus
  `uWorldPerPixel` is precisely what a later LOD tier needs (the port's
  `uWorldPerPixel` decision names it), which makes it the most likely thing
  to leak in here. It does not: every mark renders identically at every
  zoom in this change.

## Decisions

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

### Decision: pan clamp — the camera's pan target is confined to the lattice's bounding box

Pan is clamped so the camera's pan target cannot leave the hex lattice's
own bounding box: the board's centre of view is always over the lattice.
This is decided, not qualitative — it replaces an earlier draft that left
the exact bound (a pixel margin, a percentage of lattice radius) as an
Open Question. That draft's qualitative wording ("at least part of the
lattice within the visible viewport") is satisfied by one visible pixel of
rim in a screen corner, which is exactly the dead end this clamp exists to
forbid: an unrecoverable near-empty view a player should never reach by
accident. Confining the pan target to the lattice's bounding box is
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

### Decision: keyboard step magnitudes — one hex width per pan press, one wheel-notch equivalent per zoom press

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

**Decided:** one key press pans the camera by one hex width at the
camera's current zoom (a legible, board-native unit — the same increment a
bare-hex arrow-key cursor would use, keeping the two candidate claims on
the arrow keys, see the Non-Goal above and its Open Question, comparable
in feel even though only one is built here) and zooms by one
wheel-notch equivalent (the zoom delta a single wheel-scroll notch
produces under this change's wheel-zoom handling) — a step size already
tuned once, for wheel input, rather than a second independently-invented
zoom increment.

**Alternative considered and rejected: a fixed pixel step for pan.** A
screen-pixel step's felt size changes with zoom (the same pixel count
covers less board at `6×` than at `0.25×`), while a hex-width step stays
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

### Decision: picking-after-pan/zoom is this change's property to specify and test — for marks, bare hexes, and outside the lattice alike

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
touches no mark at all: a bare-hex click (canvas click → `unproject` →
`pixelToHex`) and a click outside the lattice. `useBoardProjection`
publishes the camera in two forms — `project`/`unproject` for tile picking,
and the overlay's camera-matched CSS 3D transform for glyph hit targets.
Under the port's fixed camera those two expressions agree by construction:
they were tuned once, at one camera. This change is what makes them
agree-or-not across a genuinely two-dimensional domain (pan × zoom),
because it is the first thing in this codebase that moves the camera at
all. The bare-hex and outside-lattice scenarios below assert the two
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

- **Registration desync is the load-bearing risk.** If a gesture handler
  ever writes a camera value the overlay's registration transform hasn't
  yet applied (a stale frame, a race between two input sources), hit
  targets drift from what is drawn and picking silently breaks — for a
  mark's hit target and for bare-hex resolution alike. Mitigation: the
  picking-after-pan/zoom scenarios (mark, bare hex, outside lattice) are
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
  pan target confined to the lattice's bounding box), not an open value —
  see the pan-clamp Decision above. The change is frontend-only and
  trivially revertible, so the cost of shipping a wrong default anywhere in
  this area is a follow-up tuning pass, not a data migration.

## Migration Plan

Frontend-only, additive, no backend or schema changes, no feature flag.
Gesture handlers are new code with no prior behavior to preserve, so there
is nothing to migrate away from — this lands after `port-board-to-webgl-
renderer` has shipped **in full**. The anchor is that change's Migration
Plan **step 5** (the straight swap), not step 3: its own plan states steps
3, 4 and 5 are one atomic deployable unit, so "after step 3" names a point
that is never a landable boundary, and before step 5 production still
renders the SVG board, which has no camera to drive. `add-renderer-
availability-states` precedes both. Rollback is a plain revert; no data
state to reconcile.

## Open Questions

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
  is given" scenario (and, until the arrow-vs-hex-traversal question below
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
  hex width per pan key-press and one wheel-notch equivalent per zoom
  key-press — see the keyboard-step-magnitude Decision above. Confirm these
  defaults, or correct them with evidence (e.g. observed keyboard-only
  playtesting).
- **Arrow keys: camera pan or hex traversal.** The port deferred bare-hex
  keyboard selection and nominated this change as its home; this change
  instead binds arrows to camera pan. Confirm arrow-key pan is the right
  claim on those keys, or reassign one of the two (camera pan on WASD,
  arrows reserved for a future roving hex cursor) before the binding sets
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
