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
| Lane gate | D selected; concept uses revision 1 palette/art style | Refine geometry and opening motion, then review live-scene and HUD production |

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
