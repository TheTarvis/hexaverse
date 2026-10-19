> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Board Visual Language — Scoping

> **Status: concept (2026-08-11).** Out of scope for the WebGL renderer port
> (`docs/handoffs/2026-08-11-webgl-board-renderer.md`), which is parity work:
> same picture, new rasteriser. This doc exists so the port doesn't paint over
> the seams this needs later, and so the idea stops living in Travis's head.
> Sequencing is **port first, this after** (see *Sequencing*). `?` = open;
> **DECIDED** = locked.

## The principle — legible variation, not detail

**DECIDED.** A six-hull mining group should look different from a lone scout at
a glance, and **neither should be a rendered spaceship.**

The board is not where ship art lives. A hex is 34 world units; a hull draws at
roughly 20 screen pixels. Nothing inside that silhouette reads — greebles,
panel lines, hull shading are all invisible at board zoom and merely expensive.
What *does* read at 20px is:

- **silhouette** — the outline shape
- **count and formation** — how many marks, arranged how
- **hue** — accent colour
- **motion** — plume, trail, drift

So the axis to develop is variation *between* fleets, expressed in those four
channels. "More detail on the fleet" is the wrong framing and would produce a
worse board: mush at normal zoom, cost at every zoom.

### Where detail does live

**DECIDED.** Detailed ship styling belongs on **cards** — the fleet/ship detail
surface, `FactsPanel`, and whatever the roster UI becomes. This is also the
fiction: in space you never see a ship unless you're docked alongside it. The
card is the "docked alongside" view.

The consequence is a hard split:

- **Class identity** — silhouette, proportions, palette, name — is **shared
  data**, one module (`lib/ships/classes.ts` or similar).
- **How it's drawn** is **per-surface**: the board draws the silhouette at
  20px; the card draws the same class with real shading at 400px.

If class identity ends up defined inside the WebGL scene modules, the card
layer will duplicate it and the two will drift. It must not start there.

## What the board should say about a fleet

Roughly in priority order — this is the vocabulary the four channels have to
carry:

| It should read | Channel | Notes |
|---|---|---|
| Is it mine? | hue | `corporationId` is already on the wire; a deterministic hash → hue is free |
| Is it moving / burning / docked? | motion + accent | today's `FLEET_ACCENT` by `Mode` — works, keep |
| How big is it? | count / formation | number of marks, not size of one mark |
| What is it for? | silhouette | a hauler outline vs a scout outline |
| Is it doing something? | effect | mining beam, construction, combat — see *Effects* |

**Size is count, not scale.** Scaling one glyph with roster size fights the hex
grid and reads as "zoomed in", not "bigger fleet". A formation of N marks reads
instantly and degrades gracefully (cap the drawn marks at some N with a count
badge beyond it — `?` where the cap sits).

### The fog constraint — this is not optional

**DECIDED.** `FleetRoster` is **owner-only**. It is absent entirely on a foreign
fleet by audience fog (#0006 / `lib/types/fleet.ts`). So the visual language has
two tiers and always did:

- **Own fleet** — full composition: per-class silhouettes, real count, formation.
- **Foreign fleet** — a **generic contact mark**. No count, no classes, nothing
  the server withheld.

Any appearance function must fork on this at its top, not deep inside a shader.
Build it without the fork and it either leaks composition or crashes on the
first foreign fleet.

`?` **Should a foreign fleet's size be visible at all** — a fogged "signature
strength" the sensor union earns? That is real intel and a genuinely interesting
gameplay decision, but it is a **spec question for #0006/#0010, not a renderer
question.** The renderer's whole accommodation is: accept an optional
`signature`, render nothing when absent.

## Features get the same treatment

Planets, belts, anomalies, ruins, nebulae — the same problem one layer down.
Today `FEATURE_STYLE` is `{color, shape}` per type, and the spike's body shader
switches on a single `aBanded` flag between "gas giant bands" and "mottling".
That scales for variation *within* a family (colour, radius, roughness, seed)
and stops dead the moment a ruin needs to not be a sphere.

The direction is the same: **archetype + seeded parameters**, where an archetype
is a drawable family and the parameters make each instance itself.

**DECIDED — appearance is deterministic.** It is a pure function of
`(id, type, server facts)`. Never `Math.random()`, never frame state. Seed from
a hash of the entity id. That buys, for free and with **no backend work**: a
planet that looks like itself across sessions, and looks the *same* to every
player, because ids are stable and shared.

**DECIDED — the input is the fogged DTO.** The appearance function takes
`BoardFeature` / `Fleet` as the server filtered them. It is then structurally
incapable of drawing something the server withheld.

**Graphics as code.** Procedural and parametric, zero texture assets — the same
stance as the audio engine. An archetype registry keeps this from being a
straitjacket: one archetype could later be a textured quad without unpicking
anything.

## Palette ownership — what is the palette's job?

Arrived here from the port plan (2026-08-11), which correctly refused to decide
it: the palette's main consumer is the appearance function above, so settling
the boundary before that exists means settling it blind.

The port itself is forced into three relocations — deleting the duplicated
band/body tables, merging the two fog records into one superset record, and
moving `CLASS_TINT` out of the shader (it maps `starClass`, server data, to a
colour, which makes it a decision). Those are compelled and land with the port.
What it deliberately leaves open is the **rule**.

`?` **Strict or pragmatic?**

- **Strict** — every colour lives in `board-palette.ts`; `components/board/webgl/`
  contains zero hex literals. Costs roughly six more exported names (nebula
  tints, star tint, plume white-hot tip). Its real advantage: it is the only
  version that can be **enforced** — "no `#rrggbb` under `webgl/`" is a ten-line
  vitest case, and it lives outside `webgl/` so it satisfies the
  plumbing/decision rule itself.
- **Pragmatic** — domain-keyed and designer-tunable colours move out; incidental
  shader constants stay where the effect is authored. Cannot be tested, because
  "is this constant a decision?" is a judgement per constant — which is precisely
  how the palette fragmented in the first place.

**Leaning strict + the enforcement test**, once the appearance function exists to
justify the shape. The obvious objection dissolves on inspection: the argument at
the foot of `spike-palette.ts` — each surface should know how far over the bloom
threshold it sits, and a palette knob "would only hide that decision one level
away" — is about **intensity**, not **hue**. The axes separate: colours
centralize and become tunable; gains and thresholds stay inline where the effect
is authored.

The deeper reason this belongs here rather than in the port: a visual language
in which fleets vary by hue (corp identity), features vary by archetype, and both
degrade by fog band is a language whose **vocabulary is the palette**. Deciding
what the palette owns is deciding what the language can say.

## The galaxy view speaks the same language

**DECIDED (2026-08-11): unify the language, not the plumbing.** Investigated
during the port planning; the split is forced by what the galaxy view actually
is.

**Why not the plumbing.** `components/galaxy/` does not own its renderer — it is
`react-force-graph-3d`, which owns the `WebGLRenderer`, scene, camera and render
loop. It has no post chain *by decision*: `glow-texture.ts` cites #0002 Decision
#1, node glow "authored WITHOUT shaders or a bloom pass" — a canvas-baked radial
gradient drawn on additive sprites, tinted per node. Sharing the board's bloom
and instrument passes means bolting a composer onto a third-party renderer, or
replacing FG3D with hand-rolled three.js. That is a larger project than the board
port and reverses a recorded decision. Not on the table here.

**Why the language, urgently.** The two views already share vocabulary *by
accident*. Three of four region colours are literally board hues — `#ffd27d` is
the board's star gold, `#7dd3fc` its `SIGNAL` cyan, `#8b98a9` its `CHARTED`
grey — with nothing asserting it. And there are now **two modules each
documenting itself as "THE" raw-hex exception**: `region-palette.ts` claiming it
under #0002, `board-palette.ts` claiming it "mirroring
components/galaxy/region-palette.ts". Agreement by coincidence, in duplicate.

**The fix:** a base hue module both palettes derive from. Each view keeps its own
semantic table (`REGION_PALETTE`, `FEATURE_STYLE`); neither owns the hues. This
also dissolves the competing-exceptions problem — one place holds raw colour,
two places assign it meaning.

### The galaxy has the same three gaps

Not analogues — the same gaps, one scale up:

- **Fog** — currently `const dim = 1`, with the code comment recording that the
  star map is common knowledge and "any explored-vs-charted emphasis is an M7
  board-view decision." A decision **parked, not settled**, and this is where it
  gets picked back up.
- **Ownership** — no corp hue at all. Same freebie as the board:
  `corporationId` is already on the wire.
- **Fleet presence** — a hardcoded `#67e8f9` pip (not even in
  `region-palette.ts`), and it is **binary**: present or absent, no count, no
  composition. This is precisely "a six-hull mining group should look different
  from a lone scout," at graph scale, and it inherits the same owner-only roster
  constraint.

### The scale question this raises

`?` **Which identity colours a star, at which scale?** On the board a star is
tinted by **spectral class** (`CLASS_TINT` — O/B blue-white through M deep
orange). On the galaxy map the same star is tinted by **region** (`star_rich`,
`normal`, `dead`, `barrier`). Two different answers to "what colour is this
object."

Neither is wrong — region is the right identity at graph scale, class at board
scale. But a visual language has to *say* that, and has to make the handoff
legible: drilling into a gold `star_rich` node and arriving at a deep-orange M
star is a discontinuity the player has to be taught, or the colour stops meaning
anything. Options: let each scale own its identity and make the transition
explicit; or carry one identity through both and express the other some other
way (size, ring, halo). Undecided.

## Effects — verbs should be visible

Mining, combat, construction, docking are all one shape: **an effect attached to
an entity, bounded by a running action's window**. #0005 already provides
exactly that (running actions with a frozen `eta`), so the renderer wants a
`BoardEffect[]` prop — `{entityId, kind, from, to, startedAt, eta}` — derived
from the action inbox, plus a registry of effect kinds mirroring the archetype
registry.

This has a customer **today**: M10's mine shipped with no visual at all. A fleet
mining a belt currently looks identical to a fleet sitting still.

## What the port must leave room for

The port is parity work and should stay parity work. But four seams determine
whether the above is "add a file" or "rewrite the scene" later. Listed with the
honest cost of deferring each:

1. **A pure appearance function** — `featureAppearance(f)` / `fleetAppearance(f)`
   returning plain data (`{archetype, color, radius, seed, params}`), consumed by
   both renderers. `board-palette.ts` is already this idea, one field deep.
   *Cost of deferring:* low, **if** the port routes colour/shape through that one
   module rather than inlining values into shaders. Inlining is the thing to
   avoid.
2. **An archetype registry** — `archetypeId → {shader, draw}`, features bucketed,
   one instanced draw per bucket, over a **shared per-instance attribute block**
   (`offset, radius, color, seed, fog4, params4`) so **fog is applied in exactly
   one place** instead of re-implemented per shader.
   *Cost of deferring:* medium — every feature type added to the uber-shader
   before the split has to come back out of it.
3. **Fleet as composition** — an instanced batch of hulls at formation offsets
   plus shared effects, with the own/foreign fork in the contract.
   *Cost of deferring:* **the port cannot defer the N-fleet lifecycle** — the
   spike renders exactly one fleet and SSE brings fleets in and out. Since that
   rewrite is happening regardless, making the inner draw roster-driven is nearly
   free at the same time and expensive as a second pass.
4. **The `BoardEffect[]` prop** — declare the prop and the registry, ship zero
   effects.
   *Cost of deferring:* low. Purely additive later.

Plus two cheap policies the port wants anyway:

- **`layers.ts`** — named z constants and real depth testing, replacing
  `depthTest: false` + hand-tuned `renderOrder`. This is already a known spike
  bug; it becomes unmanageable once bodies have rings, moons ride parents, and
  fleets pass in front of planets.
- **A `uWorldPerPixel` uniform on every shader.** Pan/zoom must exist anyway.
  Threading a scale uniform through a dozen hand-written shaders after the fact
  is miserable, and without it there is no LOD later — far zoom: one chevron and
  a count; close zoom: individual hulls with running lights.

## Sequencing

**DECIDED (2026-08-11):** upgrade the board to the WebGL renderer first, as a
straight promotion of the spike. This document's work follows it as its own
slice. The only items worth pulling forward are the ones the port would
otherwise have to undo — #3's fleet lifecycle and the depth policy, both of
which the port is forced to touch regardless.

Deferred wholesale, in rough order of appetite:

1. Appearance function + archetype registry extracted (the enabling refactor).
2. The mining beam — first real customer of the effect channel.
3. Per-class silhouettes on the board + the shared class table.
4. Corp hue for ownership, distinct from movement mode — **both views**.
5. Galaxy alignment: base hue module, fog on the graph, presence beyond a binary
   pip. Cheapest right after the palette work, since it is the same tables.
6. LOD tiers (formation detail by zoom).
7. The card renderer — detailed ship art, the "docked alongside" view.

## Open questions

- `?` **Ship classes as data now, or count-and-formation until there's a build
  tree?** Only `ClassSeed` exists (`fleet/roster.go`); everything else is a
  deferred non-goal in #0010. Designing silhouettes for classes that don't exist
  may be premature — but count-and-formation alone is a real improvement over
  one triangle and needs no class table at all. Leaning: **formation first,
  class table when the build tree lands.**
- `?` Where does the drawn-mark cap sit before a fleet becomes "N marks + badge"?
- `?` Palette ownership — strict vs pragmatic, and the enforcement test. See
  *Palette ownership* above; leaning strict, decide once the appearance function
  exists.
- `?` Foreign-fleet signature strength — spec question, see above.
- `?` Which identity colours a star at which scale — spectral class (board) or
  region (galaxy)? See *The galaxy view speaks the same language* above. The
  unify-language-not-plumbing question itself is **DECIDED**; this is what's left
  of it.
- `?` Does the galaxy's parked fog decision ("explored-vs-charted emphasis is an
  M7 board-view decision") get settled as part of this work? Leaning yes — it is
  the same fog vocabulary, and leaving the graph flat while the board degrades by
  band means the language only holds at one scale.
