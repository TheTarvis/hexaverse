# Object art iteration playbook

Work through one object category at a time. Create quick concept images,
iterate with Travis, and settle the design before producing a mesh or runtime
effect. Start with lane gates; reuse this process for the remaining categories
in the [visual inventory](object-visual-inventory.md).

## 1. Establish the brief

Read the inventory, existing art and relevant lore first. For manufactured
objects, read the [shared art direction](../../docs/art-direction.md) and the
assigned style profile. Apply its design-session checkpoint each round; current
manufactured props share `manufactured-01`. Ask only the design
questions needed for the next image round. Give a recommendation with each
question and wait for the answers; carry settled answers into later rounds.

Record a short brief for the category:

- Purpose: what the player should recognize or understand.
- Destination: HUD thumbnail, live scene, or both. Decide explicitly.
- Nature: manufactured structure, ancient artifact, natural phenomenon, etc.
- Style profile and revision: shared family rules and any object-specific departures.
- Visual anchors: silhouette, materials, palette and reference images.
- Open choices: what this round will compare.
- Fixed choices: what subsequent images must preserve.

Use existing art as context. Gate origin, builders and physical form remain
design decisions. A concept must not quietly establish new lore or gameplay.

## 2. Explore silhouettes

Default to one comparison sheet with three clearly different directions,
labeled A, B and C. Travis can request a different count. Keep camera,
lighting, scale and background comparable so the design differences are clear.
Use a neutral background and show the whole object without cropping.

For physical objects, use a readable three-quarter view. For spatial effects,
show the phenomenon in a simple space context that makes its extent clear.
Separate physical structure from glow, particles and other proposed effects
in the prompt and notes.

Present the image immediately. Briefly explain the differences and recommend
a direction. Ask Travis which to keep, combine or discard. Image creation is
the deliverable for this round; mesh generation waits until step 5.

## 3. Refine the selected direction

Carry the selected image forward as a reference. State what stays fixed and
what changes before generating the next round. Default to one revised image;
use two or three alternatives when a specific choice needs comparison.

Use this feedback format:

```text
Keep: B's open silhouette and heavy structural supports.
Change: thinner outer rim; less surface clutter; warmer metal.
Remove: floating fragments and central energy sphere.
Compare next: circular opening versus hexagonal opening.
```

An answer such as “B, but less glow” authorizes the next image refinement.
Repeat until Travis accepts the concept. Preserve previous rounds so a
discarded direction can be recovered. If the fundamental shape is wrong,
return to silhouette exploration rather than adding more surface detail.

## 4. Review the concept at its intended sizes

Show the selected design large enough to inspect and as a 32px thumbnail on
the HUD background. The current shipping format is a transparent 128px PNG
displayed at 32px; see the [thumbnail notes](../../frontend/components/hud/thumbnails/README.md).

Check whether the object remains recognizable with restrained glow and whether
its silhouette differs from other categories. For effects, also review a
still frame: the HUD image must communicate without animation. Record any
simplifications needed for the thumbnail.

Ask whether the concept is accepted or needs another image round. Concept
acceptance settles visual direction; runtime appearance is reviewed after
implementation.

## 5. Choose the production route

After concept acceptance, agree on the route and deliverable before generating
or implementing the asset. These are starting recommendations:

| Category | Candidate production route |
| --- | --- |
| Lane gate | Meshy structure with a separate runtime energy effect, if the accepted design calls for one. |
| Ruin | Meshy structure or fragment kit. |
| Debris | Small fragment kit distributed procedurally. |
| Anomaly | Shader or procedural effect; geometry only if the accepted concept has a physical component. |
| Nebula | Cloud shader, particles or layered textures. |
| Gravity well | Field or distortion effect. |
| Radiation | Shader or particles communicating the affected region. |

For a mesh, prepare a clean reference image of the selected object without
labels or comparison panels. Add consistent alternate views only when needed
to resolve its geometry. Decide format, geometry budget, textures and which
effects stay outside the mesh. Existing bundled models use GLB; verify loader
requirements before generation.

For a runtime effect, describe its shape, motion, opacity, extent and static
thumbnail frame. A concept image establishes appearance; it does not prove
the effect will work in the renderer.

When using Meshy, present the current credit cost and proposed batch before
any paid calls, then wait for confirmation as required by the Meshy tools.
Include retries or variants only within an explicitly approved budget.

## 6. Review the produced asset

Inspect the mesh or effect in a preview before integrating it. Compare it with
the accepted concept, including silhouette, materials, holes/openings and
separation of geometry from effects. Review the actual world rendering and
derived HUD thumbnail before marking those destinations accepted.

Use Storybook's [shared WebGPU canvas foundation](../../frontend/components/graphics/README.md)
for produced-asset reviews: `WebGPUModelView` loads a GLB by URL, while
`WebGPUCanvas` accepts custom scenes/effects. Add a story for the asset using
these reusable modules. Gate, ship and station examples live under Graphics.

If generation misses the design, identify whether to revise the reference,
repair the output or regenerate. Present any additional Meshy cost before
proceeding. Update the inventory only for the stage actually accepted.

## Save each round

Keep artifacts beside this playbook using the existing naming convention:

```text
lane-gate-options-01.png
lane-gate-options-01.prompt.md
lane-gate-refinement-02.png
lane-gate-refinement-02.prompt.md
lane-gate-design.md
```

The prompt record contains the exact prompt, input references, tool/model,
available generation settings and output paths. Include the style profile ID,
revision and accepted visual reference for manufactured objects. The category design record
contains the brief, feedback by round, selected reference, accepted decisions,
open questions and next action. Record Meshy task IDs and costs when used.
Distinguish concept accepted, production approved, asset generated and
runtime/HUD accepted.

Open each saved comparison or refinement image in the project's JetBrains IDE
for review, following the [foundation process](spec.md). If that capability is
unavailable, provide the image directly and report the limitation.

## Delegation

Travis directs one category at a time. Subagents can inspect constraints or
execute an agreed production task when delegated. Give each the same accepted
brief and reference, a separate output path and a concrete deliverable. Keep
visual selection and category acceptance with Travis. Delegation does not
authorize extra paid generations.

## Start or resume a session

```text
Follow .scratch/hud-components/object-art-playbook.md for <category>.
Read its existing design record and references, if any.
Resume at the first unresolved stage. Ask the design questions needed for
the next image, then create that round after I answer.
Preserve accepted choices and save the prompt, image and feedback.
```

For another image round:

```text
Continue <category> from round <number>.
Keep: ...
Change: ...
Compare next: ...
```
