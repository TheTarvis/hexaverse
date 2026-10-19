> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# WebGL Board Port — Implementation Plan

> **Status: planned (2026-08-11).** Promote `frontend/app/spike/webgl-board/`
> to the real tactical board renderer, replacing the SVG `HexBoard`/`BoardScene`
> pair. Brief: `docs/handoffs/2026-08-11-webgl-board-renderer.md`. Future visual
> direction this must not foreclose: `docs/plans/board-visual-language.md`.
> Spec context: #0007 (hex board), with #0006 fog as a hard constraint.
> `?` = open; **DECIDED** = locked.

## Goal

Same board, better picture. The delta comes from the **lighting model** — lit
spheres with real terminators, emissive-above-1.0 sources caught by a bloom
threshold, a starfield with parallax — none of which SVG can express. This is a
rasteriser swap, not a redesign.

**Non-goals.** No backend changes. No new gameplay surface. No fog logic on the
client — bands arrive already filtered server-side and the renderer draws what
it is given. No new visual language (that's the follow-on plan). Palette parity
with `board-palette.ts` is enforced by test and stays enforced.

## Architecture — three layers, one projection

The single most important decision in this port, and the one the handoff leaves
open. The board becomes:

```
SystemBoardView                     ← unchanged (data, selection, verbs, FactsPanel)
├── <canvas>   WebGL world layer    ← lattice, bodies, star, fleets, starfield, post chain
├── <svg>      vector-UI layer      ← hit targets + testids + previews + selection
└── useBoardProjection()            ← the seam: world ⇄ screen, driven by the camera
```

**DECIDED — WebGL owns the world; SVG owns interaction and vector overlays.**
The canvas draws things that are *lit* (tiles, bodies, hulls, plumes, effects).
The transparent SVG above it draws things that are *drawn* (selection ring, move
preview, scan cone, ping) and carries every hit target and `data-testid`.

Why this split rather than pure canvas with an id-buffer pick pass:

- Keyboard and a11y affordances survive. Pointer events, focus, hover are free.
- The e2e suite keeps working with real DOM nodes (inventory below).
- The overlay is a few dozen nodes (glyphs), not ~800 (tiles) — the DOM-count
  ceiling that motivated this port is not re-created.
- The existing preview components (`SelectionPreview`, `ScanOverlay`,
  `ScanPing`/`ArcScan`) are already SVG in board coordinates. On this layer they
  **port for free** — a large chunk of the handoff's phase 4 evaporates.

### The projection seam

The overlay only registers with the canvas if both use the same camera. At tilt
0 they coincide (identical `fitViewBox`), but the tuned look is **14° tilt** with
pan/zoom, so a static viewBox desyncs immediately.

**DECIDED:** one hook, `useBoardProjection()`, exposes the camera as two pure
functions and the overlay renders in **screen pixels**:

- `project(worldPoint) → screenPoint` — every overlay vertex goes through this
  each frame. Exact under perspective, including tilt, because the whole scene
  is planar (z=0). Polygonal overlays (scan cone, burn path) project vertex-wise
  and stay correct.
- `unproject(screenPoint) → worldPoint` — a screen ray intersected with the z=0
  plane, then `pixelToHex`. This is tile picking: **one canvas click handler**
  instead of 800 hit polygons.

This hook is also what phase 5's pan/zoom and pinch feed, and what a future LOD
tier reads for scale. Build it early; everything else hangs off it.

`lib/hex` stays the single source of geometry truth (Go-pinned by
`/fixtures/board/cases.json`). The projection interpolates the picture; it never
decides a rule.

## What the port must leave room for

From `board-visual-language.md`. Each seam with an honest cost of deferring —
three are genuinely cheap to skip now, one is not.

| # | Seam | Defer cost |
|---|---|---|
| 1 | **Pure appearance function** — `featureAppearance(f)` / `fleetAppearance(f)` → `{archetype, color, radius, seed, params}` | **Low, conditionally.** Fine to defer *provided the port routes colour/shape through `board-palette.ts` rather than inlining hexes and shape choices into shaders.* Inlined values are what makes the later extraction expensive. |
| 2 | **Archetype registry** — `archetypeId → {shader, draw}`, bucketed instanced draws over a shared per-instance attribute block | **Medium.** Every feature type folded into the single uber-shader before the split has to be pulled back out. Acceptable at today's type count; grows with each type added. |
| 3 | **Fleet as composition** — instanced hulls at formation offsets, own/foreign fork | **Not deferrable.** See below. |
| 4 | **`BoardEffect[]` prop + effect registry** | **Low.** Purely additive. Declare the prop, ship zero effects. |

### Seam 3 is not optional, and here is why

`createFleet()` in the spike is a **singleton** — one ship, positioned by
`patrol.ts`. Production needs N fleets with add/remove lifecycle, because
`useBoardRealtime` (SSE) brings fleets into and out of the system mid-session.
**That rewrite is happening in this port regardless.** While the code is open,
making the inner draw roster-driven — N hull instances at formation offsets
instead of one chevron — is nearly free. Doing it as a second pass means
re-opening instancing, attribute layout, and the update loop a second time.

The fork it must carry from day one: `roster` is **owner-only** and absent on
foreign fleets by audience fog (#0006). So:

- **own fleet** → composition from `roster.ships[]`
- **foreign fleet** → a generic contact mark, no count, no classes

Build it without the fork and it either leaks composition or crashes on the
first foreign fleet. The port can render both tiers as the same chevron for now
— the requirement is that the *fork exists in the contract*, not that the two
tiers already look different.

### Same story: the depth policy

`depthTest: false` + hand-tuned `renderOrder` is already a known spike bug —
bodies don't occlude each other, which is invisible at ~48 scattered bodies and
wrong the moment two overlap. It also stops scaling once bodies have rings,
moons ride parents, and fleets pass in front of planets.

**DECIDED:** add `components/board/webgl/layers.ts` — named z constants, real
depth testing, one documented ordering (starfield → lattice → orbit rings →
bodies → surface FX → fleets → effects). Fixing it during the port is cheap;
untangling `renderOrder` later is not.

### One more cheap policy

**DECIDED: a `uWorldPerPixel` uniform on every shader**, fed by
`useBoardProjection`. Pan/zoom must exist anyway, so the value is already there.
Threading a scale uniform through a dozen hand-written shaders retroactively is
miserable, and without it there is no LOD later (far zoom: one chevron + count;
close zoom: individual hulls).

## Phases

Each phase ends green — `/check` passes and the app runs.

### Phase 0 — decisions before code

- Settle the frontend test-coverage validator question (below).
- Settle the rollout question: flag vs straight swap (below).
- Confirm the one e2e assertion change (below).

### Phase 1 — extract, unchanged

Move the nine scene modules from `app/spike/webgl-board/` to
`components/board/webgl/` with **no behavioural edits**, behind a
`WebGLBoard` component whose props are the union of `HexBoardProps` and
`BoardSceneProps` — minus `children` (see phase 4). Keep the spike route
working by importing from the new location, so the comparator survives as a
tuning tool.

Fold the `#define HEX …` prepend into the shader source string while moving
`scene-lattice.ts` (known wart, trivial now).

*Exit:* spike route renders identically from the new module path.

### Phase 2 — real data, real motion, N fleets

- Feed `SystemBoard` from `useSystemBoard`; drop `mock-board.ts`.
- Positions from `glyph-geometry` (`featureGlidePixel`, `fleetGlidePixel`,
  `fleetLogicalHex`, `fleetOnBoard`, `headingDeg`, `sensorBubbleHexes`) driven
  by `stateAt` and `useWorldTime`. **Reuse it — do not reimplement.** It is the
  Go↔TS determinism seam, and it already handles the two-pass moon-rides-parent
  resolution and the burn→coast handoff that makes arrival not jump.
- `band` comes off the wire (`BoardFeature.band`); delete the seeded RNG that
  fakes fog. Never re-derive fog client-side.
- **Fleets become a collection** with add/remove lifecycle, roster-driven inner
  draw, and the own/foreign fork. Drop `patrol.ts`.
- `layers.ts` + real depth testing.
- `uWorldPerPixel` wired from `useBoardProjection`.

*Exit:* the WebGL board draws the live system correctly with no interaction.

### Phase 3 — projection, hit layer, e2e green

- `useBoardProjection()` with `project`/`unproject`.
- Transparent SVG overlay carrying the testid inventory below; glyph hit shapes
  positioned via `project()` each frame.
- Tile clicks via canvas click → `unproject` → `pixelToHex`.

*Exit:* the existing e2e suite passes against the WebGL board.

### Phase 4 — previews and gates

Previews move onto the SVG overlay rather than being ported to shaders:
`SelectionPreview`, `ScanOverlay` (both `active` and `aim` variants),
`ScanPing`/`ArcScan`, driven by the same `move-preview.ts` / `scan-preview.ts`
plans `SystemBoardView` already computes. Gates likewise (`GateGlyph`).

The one structural change: `HexBoard` takes previews as `children` (SVG `<g>`
layers). WebGL can't. **Previews become props (data), rendered by the overlay** —
the container passes `plan`/`sweep` objects, not elements.

`?` Whether the scan pulse eventually becomes a real emissive effect on the
canvas is a taste call for later — the decorative loop in the spike is *not*
`planSweep` and must not be shipped as if it were.

### Phase 5 — camera

Pan, zoom, and touch pinch-zoom, always on (the spike gates them off to keep
the wipe in register). Overlay follows automatically via `useBoardProjection`.

### Phase 6 — rollout: straight swap

**DECIDED (2026-08-11): straight swap, no user-facing toggle.** `SystemBoardView`
renders the WebGL board; `HexBoard`/`BoardScene` and their tests are **deleted in
the same change**. Keeping a dormant renderer only helps if someone can flip to
it, which a straight swap denies — so it would rot unmaintained while its tests
still cost suite time. Git has it.

Two things the toggle was silently covering, which now need explicit answers:

**1. Phase 3 becomes the real gate.** With no flag to hide behind, "e2e green"
is the ship criterion rather than a checkpoint. The renderer-agnostic assertion
rule from the e2e section is what makes that gate meaningful — assertions on
observable behaviour pass or fail on the renderer's actual correctness, not on
its node structure.

**2. WebGL failure is now a total board failure.** Today SVG always renders. After
the swap, a user who cannot get a WebGL2 context has **no board at all** — and
`new THREE.WebGLRenderer()` *throws* from inside a `useEffect` with no `try`
around it, so the failure mode is an uncaught error, not a graceful message.

Verified: there is **no context-failure or context-loss handling anywhere in the
codebase** — not in the spike, and not in `components/galaxy/`, which already
ships three.js with the same exposure. That the galaxy view has survived without
it is mild evidence the risk is tolerable, but the board is the primary play
surface and the swap removes its guaranteed-render property.

**DECIDED — handle it as UI state, not as a fallback renderer.** Keeping SVG
alive as an automatic fallback would reintroduce exactly the dual-maintenance
burden the straight swap exists to escape. Instead:

- **Context creation fails** → an explicit unsupported state in the board's error
  slot (`SystemBoardView` already has loading and error branches), naming the
  cause rather than showing an empty stage.
- **Context lost at runtime** (`webglcontextlost` — GPU reset, backgrounded tab,
  driver hiccup) → catch the event, and restore on `webglcontextrestored`. This
  is needed regardless of rollout choice and is missing today.

Both are cheap, and both belong to the galaxy view too — worth fixing in the same
pass, since the handling is identical and it closes a live gap rather than a
hypothetical one.

`?` **The spike route's fate.** `/spike/webgl-board` is a wipe comparator whose
left half is the SVG board — deleting SVG kills it. The comparator's job ends
with the swap, but its **tuning panel** (bloom / instrument / tilt / speed) is
how the current defaults were found and stays useful against real data. Leaning:
keep the route as a tuning bench, drop the SVG half. Non-blocking.

## e2e and testid inventory

Smaller than the handoff implies. The verb buttons and readouts live in
`FactsPanel`, which is **not being replaced** — so the actual board-side
exposure is:

| Selector | Used by | Overlay must provide |
|---|---|---|
| `system-board-view` | container | unchanged (container) |
| `hex-board` | root | on the overlay `<svg>` |
| `hex-lattice` | presence assertion | on the overlay, wrapping nothing visible |
| `fleet-glyphs` + `fleet-glyph-<id>` | clicked, `new-user`/`slice` | per-fleet hit shape |
| `feature-glyph-<id>` + `data-mineable` | clicked, attribute read (`slice`) | per-feature hit shape, attribute preserved |
| `gate-glyph-<id>` | clicked (`slice`) | per-gate hit shape |
| `hex-tile-<q>,<r>` | `board.spec.ts` — any tile, clicked | **nothing** — see below |
| `selection` | `board.spec.ts` — the tile-click observable | `FactsPanel`, unchanged |

**DECIDED (2026-08-11) — tile assertions are renderer-agnostic.**
`board.spec.ts` used to assert `hex-tile-0,0` was visible. That pinned the test
to one coordinate — which is also the star's tile, so it was probably reaching
for "the star centre rendered" — when the property actually worth testing is
"the lattice produced tiles and they take a click." Amended to: pick **any**
tile, click it, assert the resulting **`Tile q, r` readout in `FactsPanel`**.

That observable survives the port. Under SVG the click lands on a tile node;
under WebGL it lands on the canvas and goes through `unproject`. Either way the
selection readout is the same, so the port needs **no per-tile DOM node at all**
— and the ~800 invisible hit polygons that would re-create the exact ceiling
this port exists to remove never have to be emitted.

The general rule this sets, worth holding through the rest of the port: **assert
on observable behaviour (selection, readouts, verb availability), not on the
renderer's internal node structure.** Every board assertion written that way
ports for free.

## The plumbing/decision rule

**DECIDED (2026-08-11).** `.claude/scripts/check-frontend-tests.sh` exempts
`components/board/webgl/**` — **applied**, alongside the existing
`components/catalyst/` exemption. These modules need a live GL context, so any
unit test degrades to `expect(typeof createLattice).toBe('function')`: a
tautology that makes the suite look healthier while catching nothing.

The exemption is only defensible because of the rule it is paired with:

> **`components/board/webgl/` holds GL plumbing only.** Anything that *decides*
> something is pure, lives outside that directory, and is tested there.

This is a directory boundary on purpose, not a per-file pattern. A per-file
pattern invites a debate about whether each new file qualifies; a directory makes
the rule self-enforcing — wanting a file exempt means *moving* it into `webgl/`,
and moving it there is the claim that it contains no decisions. Review that claim.

### Why this is a correctness rule, not a tidiness rule

Fog is the case that forces it. Today `spike-palette.ts` maps a band to
`{dim, chroma, breakUp, wireOnly}` and `scene-bodies.ts` packs that into `aFog`,
where **GLSL decides whether a body renders its surface at all**. That is #0006
enforcement expressed as a fragment shader. Exempt the directory without the
rule and nothing, anywhere, asserts that an astronomical-band body ships no
surface.

The rule's payoff: **test the instance buffer, not the pixels.** Each archetype
splits into a pure packing function — fogged DTO in, `Float32Array` slice out —
outside `webgl/`, with the shader as a dumb consumer. Then
`packBodyInstance({band: 'astronomical', …})` asserting `wireOnly === 1` and no
resource-derived params is an ordinary vitest case needing no GL context.

**This is seams 1 and 2 arriving during the port rather than after, and it is
the strongest reason to do them now:** they are what make the exemption safe.

What must live outside `webgl/`: the fog-band → treatment mapping, appearance
selection, instance-buffer packing, projection math (`useBoardProjection`),
formation offsets, glyph geometry (already outside). What lives inside: context
setup, buffer upload, shader source, the post chain, the render loop.

### Palette — what the port must do, and what it must not decide

**The colour validator is a non-issue — verified, not assumed.**
`check-color-compliance.py` scans `.ts` as well as `.tsx`, but it targets
inline-style and Tailwind-class patterns, not bare hex constants.
`board-palette.ts`, `spike-palette.ts`, `scene-bodies.ts` and
`scene-starfield.ts` all pass clean today. No second exception is needed.

The real risk is the opposite: **nothing mechanical prevents palette
fragmentation, and it has already happened.** Thirteen raw hexes live in the
scene modules outside any palette — `CLASS_TINT`'s seven spectral-class colours,
`uStarTint`, the plume tip, two nebula tints.

**DECIDED — three relocations the port is forced into.** These are not style
calls; each is compelled by something else already decided:

1. **Delete the duplicates.** `BAND_TINT`, `BODY_COLOR` and `bandForRing`
   duplicate `BAND_STYLE`, `FEATURE_STYLE` and `bandForRing`. Import and delete,
   because the alternative is the production renderer importing a spike module.
   `spike-palette.test.ts`'s parity assertions then become unnecessary — parity
   stops being a claim and becomes structural, which is strictly better than a
   test asserting two constants are equal.
   *Free fix:* `BODY_COLOR` covers only 8 of 12 `FeatureType`s (`nebula`,
   `gravity_well`, `debris`, `radiation` missing — those bodies currently render
   `undefined` in the spike). Importing `FEATURE_STYLE` closes it; typing the
   consumer `Record<FeatureType, …>` makes the next gap a compile error.
2. **One fog record, superset shape.** `FOG_TREATMENT` (`{opacity, ghost,
   accent, label}`, SVG-shaped) and `FOG` (`{dim, chroma, breakUp, wireOnly,
   accent, label}`, shader-shaped) are the same decision expressed twice. Merge
   to one record; each renderer reads the fields it can express. Forced by two
   things: phase 6 runs **both renderers live behind a flag**, which is the only
   window where drift can actually occur — and the *Renderer-Independent Fog
   Treatment* requirement's "identical under either renderer" scenario is
   unfalsifiable while two records exist.
3. **`CLASS_TINT` moves out** — it maps server data (`starClass`) to a colour,
   so it is a decision under the plumbing/decision rule above. Q1 and the palette
   fold point at the same relocation.

**NOT the port's call:** where the line sits for the remaining atmospherics
(nebula tints, star tint, plume white-hot tip) — strict (zero hex in `webgl/`,
enforceable by test) versus pragmatic (domain-keyed colours move, incidental
shader constants stay). That is a "what is the palette's job" question whose
main consumer is the appearance function (seam 1), which is deferred — deciding
it now means deciding it without the thing that reads it. **Delegated to
`board-visual-language.md`.**

Interim discipline for the port, in place of a rule: relocate the three above,
and **don't add new raw hex to `webgl/` beyond what already exists.** The port
is mostly moving code, so this costs nothing and keeps the later decision cheap.

One clarification worth carrying forward either way: the argument at the foot of
`spike-palette.ts` — that each surface should know how far over the bloom
threshold it sits, and a palette knob "would only hide that decision one level
away" — is about **intensity** (the `1.7`/`1.9` multipliers), not **hue**. So
the axes separate cleanly: colours can centralize while gains and thresholds stay
inline where the effect is authored. Neither option above disturbs that.

## OpenSpec hooks

Notes for generating change artifacts from this plan — the three kinds of
statement above land in three different places:

**Spec requirements** (observable behaviour, capability `hex-board-view`). The
plumbing/decision rule has exactly one specifiable consequence, and it is worth
stating because it is fog enforcement:

> ### Requirement: Renderer-Independent Fog Treatment
> The system SHALL derive each board feature's visual treatment solely from the
> fog band the server assigned it, through a pure mapping independent of the
> rendering backend, and SHALL NOT emit surface, resource-derived, or
> activity-derived data for any feature outside the `visible` band — regardless
> of which renderer draws the board.
>
> #### Scenario: An astronomical-band feature yields outline-only treatment
> #### Scenario: A remembered-band feature carries no live activity data
> #### Scenario: The same feature yields identical treatment under either renderer

Second requirement, from the straight-swap decision — the board loses its
guaranteed-render property, so the failure path becomes specified behaviour:

> ### Requirement: Board Renderer Unavailability Is an Explicit State
> The system SHALL show an explicit unsupported state when a rendering context
> for the board cannot be created, and SHALL recover the board when a lost
> rendering context is restored — never presenting an empty or partially drawn
> stage as a successful render.
>
> #### Scenario: Context creation fails
> #### Scenario: Context is lost and later restored

Also worth a requirement, from the `board.spec.ts` decision above: board
selection is observable through the selection readout, not through renderer node
structure. Check `hex-board-view`'s existing selection requirements first —
"Toggle-to-Deselect Single Selection" may already cover it, in which case this is
an amendment to its scenarios rather than a new requirement.

**design.md** (structure, not behaviour): the three-layer split, the
`useBoardProjection` seam, `layers.ts` and the depth policy, `uWorldPerPixel`,
the four seams table, and the plumbing/decision rule itself.

**tasks.md** (mechanical): the validator exemption (**already applied**), folding
`spike-palette.ts` into `board-palette.ts`, the `#define HEX` shader wart,
deleting `mock-board.ts`/`patrol.ts` from the render path, and — from the
straight swap — deleting `HexBoard`/`BoardScene` and their tests, plus adding
context-loss handling to `components/galaxy/` alongside the board's.

**Proposal risk section:** the straight swap's blast radius. There is no toggle
and no fallback renderer, so a WebGL regression takes the primary play surface
down. The mitigations of record are the renderer-agnostic e2e gate and the
explicit unavailability state above.

## Remaining open questions

- `?` Ship behind a user-facing toggle, or straight swap once e2e is green?
  (Phase 6 assumes an internal flag either way.)
- **DECIDED (2026-08-11) — the galaxy view unifies its LANGUAGE, not its
  PLUMBING, and none of it is this port's work.** Investigated: the galaxy view
  does not own its renderer — it is `react-force-graph-3d`, which owns the
  `WebGLRenderer`, scene, camera and loop. It has no post chain *by decision*
  (#0002 Decision #1: node glow is "authored WITHOUT shaders or a bloom pass",
  a canvas-baked radial gradient on additive sprites). Sharing the board's post
  chain therefore means either bolting a composer onto a third-party renderer or
  replacing FG3D with hand-rolled three.js — larger than this port and a reversal
  of a recorded decision. **Out of scope; see `board-visual-language.md` for the
  language half.**
  One consequence that IS this port's: the Q3 context-loss handling cannot be
  literally shared code — FG3D owns the renderer, so the galaxy reaches it
  through the library's accessor. Same requirement, two implementations.
- `?` Is this the next milestone, or does it wait behind other M10-follow-on
  work? The port is self-contained and touches no backend, so it slots
  wherever it's wanted.

## Tuned defaults to preserve

Travis's 2026-08-11 settings, which are the taste direction: bloom `0.25`,
instrument `0.15`, tilt `14°`, speed `0.5×`, character `normal`. He cut bloom to
a quarter and grain to a fifth of the spike's first landing. **The effects should
make the board legible, not announce themselves** — the delta over SVG survives
at those low settings, which is the whole finding. Screenshot:
`docs/screenshots/webgl_spike_settings_v1.png`.
