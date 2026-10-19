# Art direction

Status: shared direction established; first style being developed through object concept reviews.

## Scope and decisions

Travis intends multiple races and technologies with distinct visual identities.
The Zerg, Terran and Protoss contrast in StarCraft is a reference for the degree
of difference: anatomy, architecture, materials, movement and technology should
communicate different origins. Their specific designs are not our art brief.

Current manufactured props belong to one race/technology style. Its race name,
history and technology tree remain open. The existing spacecraft and station
are revisable starting assets; their presence does not lock the style.
Natural bodies retain their own astronomical art direction.

Use style profiles as the shared source for families of objects. A profile
describes visual technology; its relationship to future races can be decided
when those races are designed. An object's category and purpose still determine
its individual silhouette. Ownership and HUD status remain separate signals.

## Style profiles

| Profile | Revision | Scope | State |
| --- | --- | --- | --- |
| `manufactured-01` | 1 | Current spacecraft, station and manufactured lane gate | Palette and rendered art style accepted from gate round 01; architectural language developing |

The ID is a working art reference, not a new gameplay field or race name.

### manufactured-01, revision 1

Visual reference: [lane-gate-options-01.png](../.scratch/hud-components/lane-gate-options-01.png).
Travis accepted the sheet's color/art style and selected D for gate refinement.
The exact generation prompt is in the [round record](../.scratch/hud-components/lane-gate-options-01.prompt.md).

| Dimension | Current direction | Acceptance |
| --- | --- | --- |
| Rendering | Detailed industrial hard-surface 3D appearance; readable large forms and restrained lighting | Sheet's art style accepted; runtime match still requires review |
| Primary surfaces | Light gray metallic panels | Visual palette accepted; numerical material values open |
| Secondary surfaces | Dark graphite structure, frames and recesses | Visual palette accepted; numerical material values open |
| Utility accents | Small warm amber/yellow details | Visual palette accepted; exact hues and placement rules open |
| Energy | Cool pale blue, subordinate to readable structure | Visual palette accepted; exact hues, intensity and effect behavior open |
| Architecture | Explore angular modular plates, articulated assemblies and visible structural support using D as the starting reference | Proposed family traits; D is selected for the gate, not a required shape for every object |
| Motion | Explore deliberate mechanical articulation; gate edges may spread to open the wormhole | Proposed; mechanism, timing and final motion open |
| Surface detail | Carry the sheet's panel scale and industrial detailing into refinement; simplify for distant views and thumbnails | Detailed application and wear rules open |

Exact colors and material values should be calibrated from accepted production
previews. The concept image establishes visual relationships, not physical
material measurements. Preserve this reference until a replacement is accepted.

## System orbits and labels

Accepted for the live game, 2026-10-19: use the quiet treatment reviewed in
[Orbit Appearance / Selected Body](http://localhost:20203/?path=/story/graphics-orbit-appearance--selected-body).
Ordinary orbits use opacity 0.035 and width 0.5px; the selected body's path
uses cyan, opacity 0.7 and width 1.5px. Hide ordinary name labels and reveal
the selected object's label at full opacity. Hidden labels retain body picking.
The game and Storybook share the accepted values in `space-appearance.ts`;
Storybook keeps independent controls for further comparison.

## Galaxy canvas background

In-app adoption approved, 2026-10-19: Travis requested that the game canvases
match the reviewed appearance. Galaxy and System now select the shared
surrounding sky and **Dark seams** at distance 16, brightness 0, thickness 0.5px.
Galaxy also uses the reviewed Stellar spheres and fine silver-blue lanes.
The lattice is promoted from its prototype module to shared production code.
Storybook keeps the adjustment/comparison controls; the live views use the
shared accepted preset. This supersedes the review-only/ground-default status
in earlier round records. Route fixture data remains exclusive to Storybook.

Updated direction, 2026-10-19: Travis requested the same surrounding background
for Galaxy and System after the galaxy's dust plane and distant stars read as
flat. Both now use the shared system-style sky sphere and spherical distant-star
shell. This supersedes the galaxy-only dust plane in runtime review; earlier
concept images remain historical references. Travis then proposed an enclosing
hex lattice, liked the first view and requested it feel farther away. The
surrounding lattice is available as a Storybook prototype alongside ground/off
variants. Both scenes expose distance, brightness and line-thickness controls;
Galaxy also offers them directly on canvas. Exact settings and final lattice
appearance remain under review. These remain decorative, not world cells.

Preferred treatment, 2026-10-19: Travis liked black borders at 0.5px because
they make space itself read as hexagonal cells. Preserve this as explicit
**Dark seams** in the shared Storybook sky. His shown values (distance 16,
brightness 0, thickness 0.5px) are the review preset. In this treatment zero
brightness means black ink, not an invisible grid; Luminous lines remains a
separate comparison option. This does not establish navigable world cells.

Accepted concept, 2026-10-18: [Galactic Dust refinement 02](../.scratch/galaxy-canvas/galaxy-canvas-refinement-02.png).
Preserve its sweeping dark teal/amber dust band, dark voids, distant starfield
and faint system-style hex plane during star/lane art refinement. The plane is
decorative and does not define territory or movement cells. Travis accepted
the background as shown; further dimming of the hex grid is not a settled change.
Star/lane direction selected, 2026-10-18: A, Stellar, from
[comparison 03](../.scratch/galaxy-canvas/galaxy-stars-lanes-options-03.png): dimensional radiant
stellar cores and fine luminous lane filaments. Long multi-system route display
must fit this direction. Route styling agreed for visual review: quiet silver-blue
ordinary lanes; stronger route overlays with sparse directional chevrons and
a distinct destination marker. Proposed routes are dashed; active routes are
continuous with completed legs subdued. Exact appearance and zoom density await
concept review. Cyan route color was rejected after review because it blends
with the blue scenery, regardless of dashes or arrows. Coral was rejected as too
light. On 2026-10-19 Travis selected emerald from
[comparison 06](../.scratch/galaxy-canvas/galaxy-route-colors-06.png) as the default route color.
Routes always have a dark outline and heavier stroke than ordinary lanes, with
dashes, direction markers and a distinct destination shape; color is never the
only distinguishing cue. Proposed/active state styling remains as above.
The accepted Map palette setting offers previewable alternatives. High-contrast
Amber and High-contrast Ivory are initial candidates, not validated accessible
palettes. Compare them in Storybook, including color-vision simulations, before
accepting alternatives. Simulations supplement visual/readability review.
These are visual states, not an implemented route-execution model.
An opt-in runtime pass is available in the existing
[Galaxy Map / Overview](http://127.0.0.1:20203/?path=/story/graphics-galaxy-map--overview):
procedural dust, shared hex plane, spectral Stellar spheres and outlined routes
with palette/state/zoom/vision controls. This is a first runtime interpretation,
not final visual acceptance or a change to the live game's default appearance.
See [runtime review 07](../.scratch/galaxy-canvas/galaxy-runtime-review-07.md) for implementation,
checks and the headless native-WebGPU screenshot limitation. Animation remains open.
See the [design record](../.scratch/galaxy-canvas/galaxy-canvas-design.md) for feedback and rounds.

## Reuse and updates

During concept work, reference the profile ID, revision and accepted image in
each object's design record and generation prompt. Record object-specific
departures there. Proposed traits become shared rules only when Travis accepts
them for the family.

During production, give materials semantic roles such as primary surface,
structural recess, utility accent and energy. Resolve shared colors, material
parameters and effect defaults through the style profile rather than copying
independent values into every object. Keep texture masks or material slots
separable so shared changes can reach imported models as well as procedural art.
This is a production requirement; runtime style profiles are not implemented.

Architecture changes can require remodeling; a shared palette cannot change a
silhouette. Record reusable geometric motifs, proportions, joints and motion
rules alongside material roles so reauthoring uses the same brief.

For a shared style revision, update this profile, increment its revision, and
list every affected asset below with its migration state. Review the family
together in comparable lighting; regenerate and review derived HUD thumbnails
after production changes. Keep old references and prompt records intact.

| Asset | Current relationship to manufactured-01 | Next review |
| --- | --- | --- |
| Spacecraft (`utility-ship.glb`) | Existing asset; compatibility with the new shared direction unreviewed | Compare palette, materials and architecture with gate D; revise as needed |
| Station (`orbital-station.glb`) | Existing asset; compatibility with the new shared direction unreviewed | Same family review; silhouette remains revisable |
| Lane gate | Round 07 model, separate portal and integrated world appearance accepted with current textures | Render/review HUD thumbnail; revisit shared material roles and textures during family alignment |

## Design-session checkpoint

Review produced meshes and effects in Storybook using the shared
[WebGPU canvas foundation](../frontend/components/graphics/README.md).
Use `WebGPUModelView` for GLBs and `WebGPUCanvas` for custom scenes/effects.
Add models as stories alongside the existing gate, ship and station so camera,
lighting and lifecycle behavior stay reusable across design sessions.

For each manufactured-object session:

1. Read its design record and assigned style profile before generating images.
2. State the shared traits to preserve and the object-specific choices to explore.
3. Record whether feedback changes this object or the shared style. If its scope
   is unclear and would change other assets, ask Travis before promoting it.
4. Apply accepted shared changes to this profile and record affected assets.
5. Review style consistency alongside silhouette, function and intended sizes.

For a future race or technology, establish a separate profile and reference
sheet covering silhouette, architecture, materials, palette, energy and motion.
Keep distinct visual identities explicit rather than deriving every family by
recoloring the first one. New profiles and their gameplay relationships remain
future design work.
