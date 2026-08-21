## Context

The tactical board (`/systems/[systemId]`, spec #0007) is today an SVG tree:
`HexBoard` → `HexLattice` (up to ~800 tile polygons) + `BoardScene`
(features/fleets/gates as SVG glyphs) + preview overlays
(`SelectionPreview`, `ScanOverlay`, `ScanPing`/`ArcScan`). A spike at
`frontend/app/spike/webgl-board/` has proven out a three.js renderer with a
real lighting model — lit spheres, terminators, bloom, a parallax starfield
— and tuned its defaults against real data. This change promotes that spike
to the production renderer, replacing the SVG board outright (no toggle; see
`proposal.md`'s risk note).

Source: `docs/plans/webgl-board-port.md` (459 lines). Two of its stated
justifications are stale by the time of writing and are corrected below
(see *Repairs to the source doc's reasoning*) rather than propagated.

## Goals / Non-Goals

- Goal: replace the SVG rasteriser with the WebGL one behind the same
  observable board behaviour (selection, fog treatment, own/foreign fleet
  distinction) — see `proposal.md` for the one deliberate exception
  (`astronomical` outline-only).
- Goal: build the projection seam (`useBoardProjection`) now, as structure,
  so a later camera-controls change and a later LOD tier both hang off it
  without re-opening the overlay.
- Goal: land the `components/board/webgl/` plumbing/decision boundary during
  the port (cheap now, expensive to retrofit) so the frontend test-coverage
  exemption for that directory stays defensible.
- Non-goal: camera pan/zoom/pinch. Carved out to `add-board-camera-controls`
  — every bound (zoom clamp, pan clamp, reset policy) is unspecified in the
  source doc, and the port does not need the gestures, only the projection
  math.
- Non-goal: any new visual language (per-class silhouettes, corp hue,
  archetype registry, effect registry). Delegated wholesale to
  `docs/plans/board-visual-language.md`; this port must not foreclose it.
- Non-goal: backend changes or new gameplay surface.

## Decisions

### Decision: three layers — canvas world, SVG overlay, one projection seam

```
SystemBoardView                     ← unchanged (data, selection, verbs, FactsPanel)
├── <canvas>   WebGL world layer    ← lattice, bodies, star, fleets, starfield, post chain
├── <svg>      vector-UI layer      ← hit targets + testids + previews + selection
└── useBoardProjection()            ← the seam: world ⇄ screen, driven by the camera
```

WebGL owns everything *lit* (tiles, bodies, hulls, plumes, effects). A
transparent SVG layer above it owns everything *drawn as UI* (selection
ring, move preview, scan cone, ping) and carries every hit target and
`data-testid`. (The component-level boundary that makes this testable —
`BoardStage`/`BoardCanvas`/`BoardOverlay` — is its own decision below.)

**Alternative considered and rejected: pure canvas with an id-buffer pick
pass.** Rejected because:
- Keyboard/a11y affordances (focus, hover) have to be hand-built against an
  id buffer, versus real DOM nodes on the overlay (see `### Requirement:
  Board Glyph Selection Is Keyboard-Operable`, added by this change — the
  hand-built id-buffer path would have made that requirement materially
  more expensive to satisfy).
- The e2e suite keeps working against real DOM nodes with no rewrite of its
  interaction model.
- The overlay is a few dozen nodes (glyphs), not ~800 (tiles) — it does not
  recreate the DOM-count ceiling that motivated leaving SVG-only tiles in
  the first place.
- `SelectionPreview`, `ScanOverlay`, `ScanPing`/`ArcScan` are already SVG in
  board coordinates and port for free onto this layer — see the next
  decision for exactly what "free" means and does not mean.

### Decision: the overlay renders in board coordinates under a camera-matched CSS 3D transform

The overlay is an `<svg>` with today's `fitViewBox` viewBox — so
`SelectionPreview`, `ScanOverlay`, `ScanPing`/`ArcScan` and the glyph hit
shapes are authored in the same board coordinates they use today — carried
into register with the canvas by a CSS `transform: perspective(d)
rotateX(-tilt) …` published by `useBoardProjection` from the same camera
parameters the canvas consumes.

**Alternative considered and rejected: projecting every overlay vertex into
screen pixels in JS.** The tuned camera is a perspective camera at 14° tilt,
so the z=0 plane maps by a *homography*, not an affine map. Point projection
is exact, but the surviving previews are not point sets: `SelectionPreview`
and `ScanOverlay` draw `<circle r=…>` (an ellipse under tilt) and `ArcScan`
draws an SVG `A` arc command, which has no vertex-wise projection at all.
Screen-pixel projection therefore means re-authoring all four preview
components against a projected path builder — real work the "previews port
for free" claim in the layering decision above was silently spending. The
CSS 3D transform buys the same registration for free, and the browser
hit-tests through it. Its cost is that stroke widths and dash patterns
foreshorten with depth, which reads as correct for marks lying on the board
plane. There is no `<text>` anywhere in `components/board/*.tsx`, so no
label skew.

**Alternative considered and rejected: ship at tilt 0.** Makes the map a pure
scale+translate and the overlay today's `fitViewBox` SVG unchanged. Rejected
because it gives up the tuned 14° tilt, which is the visual finding
motivating the port. Retained as the fallback of record if camera/transform
sync proves unworkable in practice.

`project(worldPoint) → screenPoint` / `unproject(screenPoint) → worldPoint`
remain the API for anything needing an explicit point — canvas tile picking
(`unproject` a click, then `pixelToHex`), and any future overlay element not
lying on the board plane. The CSS transform is the bulk mechanism for
everything that is; `project`/`unproject` are not the per-vertex path for
the preview shapes.

**Direction of ownership: the hook is the source of truth, the canvas is a
consumer.** `useBoardProjection` owns the camera parameters (container size,
fit distance, tilt, and — later — zoom and pan target) in React-side state
and hands them *down* to the canvas each frame; it never reads them back out
of `THREE.PerspectiveCamera`. Three load-bearing consequences:

- The hook imports no three.js and lives outside `webgl/`, so projection math
  is unit-tested under the plumbing/decision rule like any other decision.
- It evaluates in jsdom with no GL context, which is what lets `BoardOverlay`
  mount without a renderer (the same seam the canvas/overlay split decision
  below relies on).
- `add-board-camera-controls` adds gesture handlers that write to this state
  and changes nothing else. The overlay re-renders because the camera is
  React state; the canvas re-places its camera from the same values. The
  hook's signature does not change.

`worldPerPixel = (2 · dist · tan(fov/2)) / containerHeightPx` is computed in
this module — not in the render loop, where the spike computes it inline
with no test coverage. `uWorldPerPixel` is fed from the hook's value on every
shader, so it is already correct the day zoom starts changing it.

**Coordinate convention, pinned once:** `project`/`unproject` accept
`lib/hex` board pixels (y-down, the Go-pinned convention `glyph-geometry`
already emits). The y-flip to the GL world's y-up happens inside this
module, exactly once. No caller negates a y.

**On camera parity:** this change ships the seam at a **fixed camera, tilted
14°** — no user-driven pan/zoom, same as today's fixed `fitViewBox` — but
that is not a claim of `fitViewBox` parity: the tilt itself is new, and it
is the visual finding motivating the port (see `proposal.md`). Nobody should
read the 14° tilt as free. `add-board-camera-controls` is what feeds
pan/zoom into the hook; its signature must not need to change when that
lands.

### Decision: `layers.ts` — named z constants, real depth testing, one documented draw order

Replaces `depthTest: false` + hand-tuned `renderOrder` (a known spike bug:
bodies don't occlude each other, invisible at sparse body counts, wrong the
moment two overlap or a fleet passes in front of a planet). Draw order,
back to front:

1. starfield
2. lattice
3. orbit rings
4. bodies
5. surface FX
6. fleets
7. effects

### Decision: `uWorldPerPixel` uniform on every shader

Fed by `useBoardProjection`. Pan/zoom must exist eventually regardless
(`add-board-camera-controls`), so the value is already available; threading
a scale uniform through a dozen hand-written shaders retroactively later
would be miserable, and without it there is no LOD tier later (far zoom: one
chevron + count; close zoom: individual hulls).

### Decision: the four visual-language seams — which land now, which defer

| # | Seam | This port | Deferral cost if skipped |
|---|---|---|---|
| 1 | Pure appearance function (`featureAppearance`/`fleetAppearance` → `{archetype, color, radius, seed, params}`) | Deferred, but the port routes colour/shape through `board-palette.ts` rather than inlining hexes — the thing that would make later extraction expensive | Low, conditional on that routing discipline being honored |
| 2 | Archetype registry (`archetypeId → {shader, draw}`, bucketed instanced draws, shared per-instance attribute block) | Deferred | Medium — every feature folded into the uber-shader now has to be pulled back out later |
| 3 | Fleet as composition (instanced hulls at formation offsets, own/foreign fork) | **Lands now** — see below | Not deferrable |
| 4 | `BoardEffect[]` prop + effect registry | Deferred entirely — no prop declared, zero effects shipped | Low, purely additive |

**Seam 3 is not optional.** The spike's `createFleet()` is a singleton — one
ship, positioned by `patrol.ts`. Production needs N fleets with add/remove
lifecycle because `useBoardRealtime` (SSE) brings fleets into and out of the
system mid-session; that rewrite happens in this port regardless of any
visual-language decision. Making the inner draw roster-driven — N hull
instances at formation offsets instead of one chevron — while that code is
already open is nearly free; doing it as a second pass means re-opening
instancing, attribute layout, and the update loop a second time. The
own/foreign fork (`roster` absent on foreign fleets by audience fog, #0006)
must be built into the fleet collection from day one — `### Requirement:
Foreign Fleets Render as Contact Marks Only` is the spec consequence.

Structurally: one instanced draw for all hulls across all fleets, with a
`fleetId → instance range` map plus allocated capacity and a live count, so
an SSE arrival/departure rewrites ranges and the count rather than creating
or disposing a mesh per fleet. Geometry and material are created once and
disposed on unmount. The own/foreign fork is an **instance attribute**
(`aAudience`), not a second mesh — one draw, one shader branch — which is
also what seam 2's archetype registry will later bucket on without
re-cutting the attribute block.

**"No movement-mode accent" is a visual/taste rule, not a confidentiality
control — do not read it as one.** `fleet-movement`'s audience-fog
requirement deliberately *permits* shipping movement mode for a sensed
foreign fleet, and `backend/fleet/handler.go:293` does ship it. The actual
confidentiality control `### Requirement: Foreign Fleets Render as Contact
Marks Only` exists to assert is that **composition is absent from the read
entirely** — no roster, no ship count, no hull-instance count variance —
which is what that requirement's appended scenario (`Two foreign fleets of
different composition render identically`) checks. The visual choice not to
draw an accent is styling; the data absence is the security property.

### Decision: fleet-collection reconciliation is a pure diff plus a disposing GL reconciler

- **Pure diff** (outside `webgl/`, vitest-testable, no GL context): given the
  previous frame's fleet-id set and the current one, return
  `{added, removed, kept}`. Ordinary set arithmetic; needs nothing from
  three.
- **GL reconciler** (inside `webgl/`): for every id in `removed`, call that
  fleet's `dispose()` and remove its `group` from the scene before dropping
  the reference; for every id in `added`, create and add. Runs on every
  roster update, not only unmount or system change — those are already
  handled by the whole-scene `dispose()` path and are not the gap.

Forced by two independent readings of the same gap. `scene-fleet.ts`
already defines `FleetVisual.dispose()`, but today it is called exactly
once, at whole-scene teardown, because there has only ever been one
singleton fleet — this port invents the add/remove path for the first time,
on a board designed for long sessions, so a missed dispose is an unbounded
per-fleet GPU leak. And audience fog is *dynamic*: a foreign fleet drops out
of the roster the moment it leaves the requester's live sensor coverage, so
a missed removal leaves a stale foreign contact drawn at its last sensed
position indefinitely — the board asserting a contact the requester no
longer senses, exactly the claim fog exists to withhold. `### Requirement:
Foreign Fleets Render as Contact Marks Only`'s appended scenario (`A fleet
absent from the latest read is removed from the board`) is the spec
consequence.

Note for the test-exemption boundary: disposing `THREE.BufferGeometry` /
`THREE.Material` does NOT require a live WebGL context — only
`renderer.render()` and context creation do. So the reconciler's dispose
calls ARE testable under jsdom via a stub fleet factory asserting `dispose`
call counts. This does not weaken the `webgl/**` exemption; it is the "test
the instance buffer, not the pixels" principle applied to lifecycle.

### Decision: the plumbing/decision rule

`components/board/webgl/` holds GL plumbing only — context setup, buffer
upload, shader source, the post chain, the render loop. **Anything that
*decides* something is pure, lives outside that directory, and is tested
there.** This is a directory boundary on purpose, not a per-file pattern: a
per-file pattern invites a debate about whether each new file qualifies; a
directory makes the rule self-enforcing (wanting a file exempt means
*moving* it into `webgl/`, and moving it there is the claim that it contains
no decisions — reviewable).

**Alternative considered and rejected: a per-file annotation** (an
eslint-disable-style comment marking an individual file as decision-free).
Rejected because "contains no decisions" is otherwise a judgment call per
file with no way to check it mechanically — a per-file marker is only ever
as honest as the author placing it, and a reviewer has to re-derive the same
judgment call to catch a mistake. A directory boundary turns the same
judgment call into a single, reviewable, structural claim (moving a file in
or out of `webgl/`) instead of a per-file annotation nobody re-checks.

**The operational form of the rule — the import boundary.** "Contains no
decisions" is otherwise a judgment call per file. The checkable version:

> A module under `components/board/webgl/` MUST NOT import a domain DTO type
> (`BoardFeature`, `BoardFleet`, `FogBand`, `FeatureType`, `SystemBoard`) or a
> palette record (`FEATURE_STYLE`, `BAND_STYLE`, the merged fog record,
> `CLASS_TINT`). It accepts primitives, packed typed arrays, and already-
> resolved values (an `[r,g,b]` triple, not a `FeatureType`).

A file that needs a DTO to do its job is, by construction, deciding
something, and belongs outside. This makes the directory boundary
self-enforcing instead of aspirational, and it is what the test exemption is
actually buying.

Consequence the port must carry (these signatures are rule-violating today,
and phase 1's "move unchanged" preserves the violation until step 2 fixes it
— task 3.9 below is the checkpoint):

| Today (spike) | After the port |
|---|---|
| `createBodies(bodies: SpikeBody[])` — `BODY_COLOR[b.type]`/`FOG[b.band]` inline | `createBodies(packed: PackedBodies)` — pre-resolved colours, radii, fog quads |
| `createStar(radius, starClass: string)` — `CLASS_TINT[starClass]` inline | `createStar(radius, tint: [number,number,number])` |
| `createFleet()` — singleton, no inputs | `createFleets(packed: PackedFleets)` |

What still lives inside: context setup, buffer upload, shader source, the
post chain, the render loop, `layers.ts`.

This is a correctness rule, not a tidiness rule, and fog is the case that
forces it: today `spike-palette.ts` maps a band to
`{dim, chroma, breakUp, wireOnly}` and `scene-bodies.ts` packs that into
`aFog`, where GLSL decides whether a body renders a surface at all. That is
`### Requirement: Fog Band Determines a Feature's Board Treatment` expressed
as a fragment shader. Exempt the directory without this rule, and nothing
anywhere asserts that an astronomical-band body ships no surface.

The payoff: **test the instance buffer, not the pixels.** The pack function
returns a **named record**, not a raw buffer slice:

```ts
export interface PackedBody {
  color: [number, number, number]
  radius: number
  seed: number
  banded: 0 | 1
  fog: { dim: number; chroma: number; breakUp: number; wireOnly: 0 | 1 }
}
export function packBodyInstance(f: BoardFeature): PackedBody
```

The buffer layout stays inside `webgl/` as a thin, decision-free writer
(`writeBodyInstance(buffers, i, packed)` — index arithmetic only, no
lookups, no branches on domain values). So
`expect(packBodyInstance(astronomical).fog.wireOnly).toBe(1)` is an ordinary
vitest case that reads as the fog rule it is, needs no GL context, and a
change to the attribute stride cannot break it — the exact coupling the
split exists to remove. (An earlier draft of this decision illustrated the
test as `out[3] === 1` against a raw `Float32Array` slice; that was wrong —
there is no `wireOnly` field on a `Float32Array`, only index 3 of a stride,
and asserting against it would have re-coupled the pure test to the GL
attribute layout.) This is what makes
`.claude/scripts/check-frontend-tests.sh`'s exemption for
`components/board/webgl/**` (already applied) defensible rather than a hole.

What must live outside `webgl/`: the fog-band → treatment mapping,
appearance selection, instance-buffer packing (`packBodyInstance`/
`packFleetInstance` — not `packFeatureAppearance`, which would read as
seam 1's deferred appearance function arriving early), projection math
(`useBoardProjection`), formation offsets, glyph geometry (already outside,
in `glyph-geometry.ts`). What lives inside: context setup, buffer upload,
shader source, the post chain, the render loop, `layers.ts`.

### Decision: previews and gates move onto the overlay as props, not children

`HexBoard` today takes previews as `children` (SVG `<g>` layers). WebGL
can't take React children into its draw loop. Previews become **props**
(`plan`/`sweep` data objects) consumed by the overlay, which renders
`SelectionPreview`, `ScanOverlay` (`active`/`aim` variants), `ScanPing`/
`ArcScan`, and `GateGlyph`'s replacement, driven by the same
`move-preview.ts`/`scan-preview.ts` plans `SystemBoardView` already
computes. The observable preview behaviour is unchanged and already fully
specced by `### Requirement: Move Preview From the Acting Fleet's Live
Position`, `### Requirement: Scan Aim Preview Only While Considering the
Verb`, and `### Requirement: Running Scan Renders From Its Pinned Emission
Hex` — this port must preserve those, not respec them.

### Decision: the fog-record merge — corrected justification

`FOG_TREATMENT` (`{opacity, ghost, accent, label}`, SVG-shaped) and `FOG`
(`{dim, chroma, breakUp, wireOnly, accent, label}`, shader-shaped) are the
same decision expressed twice. Merge to one superset record; each renderer
reads the fields it can express. **Keep `wireOnly`** — A1 decided the
astronomical treatment is outline-only (see `proposal.md`). Drop the
SVG-only `opacity`/`ghost` fields only if nothing surviving reads them;
`ScanOverlay`, `SelectionPreview`, `ScanPing`, `ArcScan` all survive on the
overlay, so check each before deleting.

**The merge is pinned, not a free import of the spike's values.** Merging
the two records is a structural move (one table instead of two); it is not
license to carry the spike's `remembered` *values* over. `spike-palette.ts`'s
`remembered` entry (`{dim: 0.5, chroma: 0.16, breakUp: 0.35}`) expresses a
different visual language from the SVG's `{opacity: 0.62, ghost: true}` —
the `chroma`/`breakUp` channels are a per-channel colour offset plus an
*animated* scanline drop-out (`scene-bodies.ts:189`), which `FeatureGlyph.tsx`
never read and no artifact of this change proposes shipping. Carrying them
over silently would be a second and third unrecorded visual change, and
precisely the "new visual language" the doc's non-goals name. **Ruling: the
merged record's `remembered` and `visible` entries carry `chroma: 0,
breakUp: 0` — opacity-only, matching today's SVG treatment exactly — for
this port.** `wireOnly` stays `true` for `astronomical` only (A1). The
signal-quality fields (non-zero `chroma`/`breakUp`, animated dropout) are
deferred, named, to `docs/plans/board-visual-language.md`; the shader
continues to accept them (the superset shape is unchanged) but this port's
packed values never set them non-zero. See `## Open Questions` for the
one-line reversal if Travis wants the spike's tuned signal-quality look
shipped instead of deferred.

*Why this repairs the source doc's stated reasoning rather than reusing it:*
the doc justifies the merge by "phase 6 runs both renderers live behind a
flag, which is the only window where drift can occur" and "the identical-
under-either-renderer scenario is unfalsifiable while two records exist."
Both collapse: phase 6 is decided as a straight swap with **no flag**, so
the flag-window premise never existed by the time of writing, and the
unfalsifiability argument is backwards — after the swap there is exactly one
renderer, so that scenario is vacuous *whether or not* the records merge,
not rescued by merging them. (This unfalsifiable scenario is also why R1
above drops the "identical under either renderer" scenario entirely — see
`proposal.md`.) The merge is still the right call: it deletes a duplicated
table and turns "the two renderers agree" from an assertable claim into a
structural property (there being only one record to read), which is
strictly better than a parity test. That is the actual justification;
record it here so it doesn't quietly regenerate the stale one.

### Decision: three compelled palette relocations

Not style calls — each is forced by something else already decided:

1. **Delete the duplicates.** `BAND_TINT`, `BODY_COLOR`, `bandForRing` in
   `spike-palette.ts` duplicate `BAND_STYLE`, `FEATURE_STYLE`,
   `bandForRing` in `board-palette.ts`. Import and delete — the alternative
   is the production renderer importing a spike module. Typing the consumer
   `Record<FeatureType, …>` turns the next missing feature type into a
   compile error instead of an `undefined` render (today `BODY_COLOR`
   silently drops `nebula`, `gravity_well`, `debris`, `radiation`).
2. **One fog record**, per the merge decision above.
3. **`CLASS_TINT` moves out of the shader.** It maps `starClass` (server
   data) to a colour — a decision, per the plumbing/decision rule — so it
   belongs in `board-palette.ts`, not in `webgl/`.

**Not this port's call:** where the line sits for the remaining
atmospherics (nebula tints, star tint, plume white-hot tip) — strict (zero
hex literals under `webgl/`, enforceable by test) vs. pragmatic (only
domain-keyed colours move; incidental shader constants stay). Delegated to
`board-visual-language.md`, whose main consumer (the appearance function,
seam 1) is itself deferred. Interim discipline: relocate the three above,
and don't add new raw hex to `webgl/` beyond the 12 that already exist
there (`CLASS_TINT`'s 7 spectral colours + its `#ffd27d` fallback +
`uStarTint` + the plume tip + 2 nebula tints — corrected count; the source
doc says 13 and its own prose enumerates only 11, missing the `CLASS_TINT`
fallback).

### Decision: the tuned defaults the port ships at, and the one that must not carry over

Travis's 2026-08-11 settings are the taste direction and the port's
acceptance target: **bloom `0.25`, instrument `0.15`, tilt `14°`**, cut to
roughly a quarter and a fifth of where the spike first landed. The finding
they encode: *the effects should make the board legible, not announce
themselves.* These become production constants; they are not user-adjustable
and are not spec thresholds.

**`speed 0.5×` does not carry over.** It is a spike-only clock multiplier
(`page.tsx` — `clock.current.worldTime += dt * 1000 * speedRef.current`);
production world time comes from `useWorldTime` anchored to the server's
`worldTime` at scale 1. Scaling it would desynchronise glyph positions from
`stateAt` and from every server-computed ETA — the exact determinism seam
task 3.2 exists to preserve.

### Decision: the renderer-agnostic e2e assertion rule

Every board e2e assertion is written against observable behaviour —
selection state, `FactsPanel` readouts, verb availability — never against
the renderer's internal node structure. This is what makes "e2e green" a
meaningful ship gate for a straight swap with no toggle: an assertion
written this way passes or fails on the renderer's actual correctness,
whichever renderer is under it. `board.spec.ts`'s tile-click assertion is
the canonical example — see *Migration Plan* below for the amendment this
change carries.

**Addendum: the assertion rule needs one render-health check that is NOT
picking-derived.** Every assertion above resolves through `project`/
`unproject` or `FactsPanel`, both correct by construction whether or not
the canvas draws anything. Given this gate is one of only two named
mitigations for a no-fallback straight swap, it must include at least one
assertion blind to picking math and sensitive only to actual output:

- **Minimum viable**: sample known-lit screen coordinates after the scene
  settles (the star's projected position, a known feature's) and assert
  they are not uniformly black/transparent.
- **Cheaper alternative**: assert `renderer.info.render.calls > 0` and
  `renderer.info.render.triangles > 0` after a settled frame, exposed via a
  test-only hook in non-production builds. Catches "nothing was ever drawn"
  without pixel sampling, though not "drew the wrong thing black."

Either is a floor, not a substitute for visual QA — it exists to make "e2e
green" mean what the straight swap's risk mitigation claims it means.

### Decision: the canvas/overlay component split — one seam, two problems

`vitest.setup.ts` has no canvas/WebGL mock, so `new THREE.WebGLRenderer()`
throws in jsdom, and `SystemBoardView.test.tsx` asserts eleven times into
the board's node structure plus four `fireEvent.click`s on glyphs.
Separately, `add-renderer-availability-states` decision A3 requires the
unsupported state to replace the canvas region only. **These are the same
structural problem:**

```
SystemBoardView
└── BoardStage                      ← composes, owns nothing GL
    ├── BoardCanvas                 ← THE ONLY module importing three.js
    │                                 (wraps components/board/webgl/*; carries
    │                                 A3's context guard; renders the
    │                                 unsupported/interrupted state in its
    │                                 region)
    ├── BoardOverlay                ← pure SVG: hit shapes, testids, previews.
    │                                 No three.js import, no GL context needed.
    └── useBoardProjection()        ← pure; no three.js import
```

- `SystemBoardView.test.tsx` mocks **`BoardCanvas` only**. `BoardOverlay` and
  `useBoardProjection` mount for real in jsdom, so all eleven assertions and
  the four `fireEvent.click`s survive unchanged.
- Mocking the whole canvas+overlay surface wholesale is NOT an option: an
  earlier draft of this decision scoped `WebGLBoard`'s props as the union of
  `HexBoardProps` and `BoardSceneProps`, which would make it own the overlay
  too — mocking that wholesale deletes the assertions the fix exists to
  preserve. `BoardCanvas` must NOT absorb `BoardSceneProps`' preview/overlay
  surface; that lives on `BoardOverlay`.
- A3's unsupported state replaces `BoardCanvas`'s region. `BoardOverlay`
  renders only when `BoardCanvas` reports a live context — hit shapes
  floating over a "WebGL unavailable" panel would be selectable marks with
  nothing drawn under them. `FactsPanel` and the fleet roster sit outside
  `BoardStage`. **Consequence for verb availability, recorded here so it is
  judgeable rather than merely implied:** with no `BoardOverlay`, the
  board's entity hit targets are absent in the unsupported/interrupted
  state, so verbs requiring a board selection (depart, move-to-target) are
  unavailable; roster selection, the docked-anchored verbs, and all
  facts-panel readouts remain — consistent with
  `add-renderer-availability-states`'s own minimum-fix scenarios. This is
  part of what Travis is confirming or correcting when he resolves that
  change's A3 `[READING]`.
- `BoardCanvas` is the single point where this change and
  `add-renderer-availability-states` meet — which is why that change lands
  first: its guard defines this component's contract.

## Risks / Trade-offs

- **No fallback renderer.** See `proposal.md`'s risk note — accepted, with
  the renderer-agnostic e2e gate and `add-renderer-availability-states`'s
  explicit unsupported/interrupted states as the mitigations of record.
- **`components/board/webgl/`'s test exemption is only safe as long as the
  plumbing/decision rule holds.** A future change that adds a decision
  inside `webgl/` (a new fog rule inlined into a shader, say) would be
  invisible to the test suite. Mitigation is the directory-boundary
  framing itself (moving a file into `webgl/` is a reviewable claim) — no
  automated enforcement beyond that ships in this change.
- **Palette fragmentation is not fully closed.** The three compelled
  relocations happen; the remaining atmospherics (nebula tints, star tint,
  plume tip) stay wherever they are today, pending
  `board-visual-language.md`'s strict-vs-pragmatic decision.
- **Soft GPU degradation is unaddressed.** `add-renderer-availability-states`
  covers creation failure and context loss; it does not cover a context
  created and never lost that renders at very low frame rates (integrated
  GPU, software rasterizer). On this port's interaction model — picking
  depends on clicking where things are actually drawn — a low-fps board
  degrades gameplay without tripping the unsupported or interrupted state.
  No mitigation ships here. Accepted for now; the tuning-bench sliders are a
  cheap candidate for a future user-facing "reduced effects" mode. (Relevant
  precedent: the galaxy view deliberately avoided a bloom/post-processing
  pass for cost reasons — #0002 Decision #1 — and this port goes the other
  direction on the more interaction-critical surface.)

## Migration Plan

Phased so the app stays green (`/check` passes) at every step; deletion is
the last phase, not the first.

**Which boundaries are deployable.** Steps 1 and 2 are independently
deployable: production still renders the SVG board and `/check` (including
e2e) is green at each. **Steps 3, 4 and 5 are one atomic deployable unit.**
There is no flag, so between any two commits the board is either wholly SVG
or wholly WebGL — the swap, the `board.spec.ts` amendment, the
`SystemBoardView.test.tsx` fix, and the SVG deletions land together. Amending
`board.spec.ts` to click a canvas while production still renders SVG leaves
e2e red for the duration; that is the one ordering error this plan must not
make.

**The spike route's data through the transition.** `mock-board.ts` and
`patrol.ts` are deleted from the *production* render path in step 2, but
`app/spike/webgl-board/page.tsx` still imports `buildSpikeBoard` and renders
`SvgBoard`. `patrol.ts` survives **inside the spike route** as `SvgBoard`'s
fixture until step 5 retires the SVG half (task 6.3); otherwise `tsc` fails
at the end of step 2. `mock-board.ts` survives **permanently** — step 2 also
changes `WebGLBoard`'s inputs to packed data (the DTO-import ban means it
cannot take a `SystemBoard`), so `page.tsx` must repack `mock-board.ts`'s
fixture through the same pure pack functions production uses (task 3.12);
the WebGL-only tuning bench that remains after step 5 still needs that
fixture, so it is not deleted alongside `SvgBoard.tsx`/`patrol.ts` at
task 6.3.

1. **Extract, unchanged.** Move the seven scene/render modules that belong
   in production — `WebGLBoard.tsx`, `glsl-common.ts`, `instrument-pass.ts`,
   `scene-bodies.ts`, `scene-fleet.ts`, `scene-lattice.ts`,
   `scene-starfield.ts` — from `app/spike/webgl-board/` (12 non-test source
   files total) to `components/board/webgl/` behind a `WebGLBoard`
   component, no behavioural edits. `spike-palette.ts` does not move — it
   dissolves into `board-palette.ts` in step 2 (task 3.7). `mock-board.ts`,
   `patrol.ts`, `page.tsx`, and `SvgBoard.tsx` stay in the spike route
   throughout (see the preamble above). Fold the `#define HEX …` shader
   prepend into the source string while moving `scene-lattice.ts`. Spike
   route keeps working by importing from the new location.
2. **Real data, real motion, N fleets.** Feed `SystemBoard` from
   `useSystemBoard`; drop `mock-board.ts` from the production render path
   (it survives permanently as the spike route's fixture, repacked through
   the pure pack functions — see the preamble above and task 3.12).
   Positions from `glyph-geometry`
   (`featureGlidePixel`, `fleetGlidePixel`, `fleetLogicalHex`, `fleetOnBoard`,
   `headingDeg`, `sensorBubbleHexes`) driven by `stateAt`/`useWorldTime` —
   reused, not reimplemented (it is the Go↔TS determinism seam handling the
   two-pass moon-rides-parent resolution and the burn→coast handoff). `band`
   comes off the wire (`BoardFeature.band`); delete the seeded-RNG fog fake.
   Fleets become a collection with add/remove lifecycle, roster-driven inner
   draw, and the own/foreign fork; drop `patrol.ts`. `layers.ts` + real depth
   testing. `uWorldPerPixel` wired from `useBoardProjection`. Production
   render defaults (bloom `0.25`, instrument `0.15`, tilt `14°`) become
   module constants; `useWorldTime` stays at scale 1 (the spike's `speed
   0.5×` does not carry over — see the tuned-defaults decision above).
3. **Projection, hit layer.** `useBoardProjection()`. Transparent SVG
   overlay carrying the testid inventory (below), registered against the
   canvas via the camera-matched CSS transform. Tile clicks via canvas
   click → `unproject` → `pixelToHex`. This step alone does not turn e2e
   green — production still renders the SVG board until step 5 — it builds
   the picking surface steps 4–5 swap onto. Steps 3–5 are one atomic
   deployable unit (see the preamble above): the e2e suite only passes
   against the WebGL board once all three have landed together.
4. **Previews and gates.** `SelectionPreview`/`ScanOverlay`/`ScanPing`/
   `ArcScan` move onto the overlay as prop-driven, not children. Gate marks
   likewise.
5. **Straight swap + deletion.** `SystemBoardView` renders `BoardStage`
   (composing `BoardCanvas` + `BoardOverlay`) exclusively. Delete
   `HexBoard.tsx`, `BoardScene.tsx`, `HexLattice.tsx`, `FeatureGlyph.tsx`,
   `FleetGlyph.tsx`, `GateGlyph.tsx`, and `app/spike/webgl-board/
   SvgBoard.tsx`, with their tests. Keep the spike route as a WebGL-only
   tuning bench.

Camera pan/zoom/pinch (design doc phase 5) is not part of this migration —
carved out to `add-board-camera-controls`.

### Layer inventory — every `BoardScene`/`HexLattice` drawn layer, by destination

The deletion in step 5 was justified by an *import* audit ("none import
these outside the deleted tests"); that audit missed four layers
`BoardScene`/`HexLattice` draw today with no consumer anywhere else in the
change. Each needs an explicit canvas-or-overlay destination so "same
board, better picture" is actually true and not silently three visual
regressions:

| Layer | Today | Destination | Task |
|---|---|---|---|
| Committed burn path (`data-testid="burn-paths"`, the amber polyline of each own fleet's committed leg-0 path) | `BoardScene.tsx` SVG `<polyline>` | Overlay — a prop-driven layer alongside `SelectionPreview`/`ScanOverlay`, authored in board coordinates the same way it is computed today | 5.1a |
| Live ambient sensor bubble (`data-testid="scan-bubble"`, hex polygons around own units) | `BoardScene.tsx` SVG polygons | Overlay — a prop-driven layer alongside the move/scan previews | 5.1b |
| Orbit rings + the selected-ring highlight | `BoardScene.tsx` SVG polygons (`ORBIT_RING` / `ORBIT_RING_HILITE`) | Canvas — already in `layers.ts`'s draw order (item 3); the *highlight* needs the selected ring's index threaded in as a resolved prop (a decision computed outside `webgl/`, consumed inside it as a plain index) | 3.5a |
| Selected-hex outline (`stroke="#ffffff"` on the selected tile) | `HexLattice.tsx` per-tile `<polygon>` | Overlay — one dynamic highlight shape positioned at the selected hex (not a per-tile node), driven by the same selection state the picking requirement resolves | 4.3a |
| Tile hover feedback (`hover:fill-white/10`, `cursor-pointer`) | `HexLattice.tsx` per-tile CSS | Overlay — a dynamic hover-highlight shape tracking the pointer's `unproject`ed hex, plus a `cursor: pointer` style on the canvas while the pointer is over the lattice | 4.6a |

Each row lands as its own task (see `tasks.md`), and `### Requirement:
Board Picking Resolves to the Entity Under the Pointer` gains a scenario
asserting the selected-hex outline specifically, so "clicking a bare hex"
has a visible board consequence, not only a facts-panel readout.

### Testid inventory the overlay must provide

| Selector | Used by | Overlay provides |
|---|---|---|
| `system-board-view` | container | unchanged (container, untouched by this port) |
| `hex-board` | root | on the overlay `<svg>` |
| `hex-lattice` | presence + `toBeVisible()` assertion | on the overlay, with real bounds (a rect matching the lattice extent) — an empty `<g>` is not visible to Playwright, so this cannot be an empty wrapper |
| `fleet-glyphs` (group) + `fleet-glyph-<id>` | clicked (`new-user.spec.ts:59`, `slice.spec.ts`) | per-fleet hit shape, `data-own` preserved |
| `feature-glyphs` (group) + `feature-glyph-<id>` + `data-mineable` + `data-band` | clicked, attributes read (`slice.spec.ts`) | per-feature hit shape, both attributes preserved |
| `gate-glyph-<id>` | clicked (`slice.spec.ts`) | per-gate hit shape |
| `selection` | the tile-click observable | `FactsPanel`, unchanged |

`hex-tile-<q>,<r>` is **not** reintroduced — the port needs no per-tile DOM
node; see the `board.spec.ts` amendment below.

**Overlay pointer policy.** The overlay `<svg>` root is `pointer-events:
none`; only the per-entity hit shapes set `pointer-events: auto`. The
`hex-lattice` bounds rect exists solely to give the node a non-empty
bounding box for Playwright's `toBeVisible()` and MUST stay non-interactive
— an interactive full-extent rect sits above the canvas and would intercept
every tile click, breaking the picking requirement's lattice-click
scenario. Tile and background clicks reach the canvas underneath and go
through `unproject`.

### `board.spec.ts` amendment

The existing amendment (any-tile locator) is only half-done: it still reads
`page.locator('[data-testid^="hex-tile-"]').first()`, which requires at
least one `hex-tile-*` node to exist. With zero per-tile nodes under the
WebGL board this fails **at the locator**, not at the assertion. Replace it
with a click on the canvas at a computed point (any point known to fall
inside the lattice) and assert the resulting `Tile q, r` readout in
`FactsPanel` — the same observable, reached through `unproject` instead of
a DOM hit.

### Rollback

Frontend-only (no backend, no schema, no data migration). If a WebGL
regression ships, rollback is a Vercel deploy revert / `git revert` and
redeploy — no data state to reconcile, no point of no return. This is only a
meaningful answer once the phase-3 e2e gate is trustworthy enough that
"green" means the renderer actually works (see the render-health addendum
above) — a revert after the fact is not a substitute for the gate catching a
broken renderer before it ships.

## Open Questions

- Whether the scan pulse eventually becomes a real emissive effect on the
  canvas, rather than the SVG overlay's decorative loop, is a taste call for
  later — explicitly deferred. The spike's decorative loop is **not**
  `planSweep` and must not ship as if it were; `### Requirement: Running
  Scan Renders From Its Pinned Emission Hex` already constrains what
  matters (pinned emission hex, stops at ETA) regardless of which layer
  draws it.
- The palette's strict-vs-pragmatic line (zero raw hex under `webgl/`,
  enforced by test, vs. only domain-keyed colours centralized) is
  explicitly delegated to `board-visual-language.md` — its main consumer
  (the appearance function) doesn't exist yet, so deciding the rule now
  means deciding it blind.
- What bounds replace the removed DOM-node ceiling — a max simultaneous
  instanced-fleet/feature count, a draw-call budget, or a frame-time
  target? The source doc's tuned defaults are taste settings, not
  performance budgets. Left unanswered, this port trades one unbounded
  growth failure mode (too many DOM nodes) for another (too many instanced
  draws under a busy system), with no earlier detection than the ceiling
  this port exists to remove.
- `astronomical` moves from a 42%-opacity filled glyph to an unfilled
  outline. Doc-sanctioned and specced, but it is the one place this port is
  not parity; confirm before implementation.
- **The `remembered` band's signal-quality fog (per-channel chroma offset,
  animated scanline break-up) is deferred, not shipped.** The merged fog
  record is pinned so `remembered` keeps today's opacity-only SVG treatment
  (see `### Decision: the fog-record merge — corrected justification`); the
  spike's tuned per-channel degradation is a second, unrecorded visual
  change this port declines to carry silently. This is a one-line reversal:
  set the merged record's `remembered` entry to the spike's `{chroma: 0.16,
  breakUp: 0.35}` instead of `{chroma: 0, breakUp: 0}` if Travis wants the
  tuned signal-quality look shipped now rather than deferred to
  `board-visual-language.md`. Confirm alongside the astronomical entry
  above — both are visual-treatment calls from the same tuning pass.
- **The fog-record reversal has a one-clause tail.** If Travis takes the
  spike's tuned `remembered` fog, its break-up is **animated**
  (`scene-bodies.ts:189`), so the reduced-motion requirement's enumeration
  must either be read to cover it ("body-surface animation" plausibly does)
  or gain a clause — noted here beside the reversal above so the one-line
  reversal stays honest.
- **`band` absent is now load-bearing in two directions.** `### Requirement:
  Fog Band Determines a Feature's Board Treatment`'s fallback fires on
  "band is absent," while the same requirement's scope exemption fires on
  entity kind (a station carries no band by design). Nothing pins how an
  implementer tells them apart. Not exploitable here — no station exists on
  the board yet — but it is the seam the trading-station change's author
  must close, and the exemption sentence is the hook.
