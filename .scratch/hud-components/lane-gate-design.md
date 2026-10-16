# Lane gate design

## Brief

- Purpose: recognize a manufactured gateway to a subspace lane, distinct from ships, stations and hazards.
- Destination: both live scene and static HUD thumbnail. Eventual thumbnail review uses transparent 128px PNGs displayed at 32px.
- Nature: manufactured structure. Travis intends players to spend resources to build gates. This is design intent, not a claim that construction gameplay is implemented.
- Style profile: [manufactured-01, revision 1](../../docs/art-direction.md), shared with the current spacecraft and station. The shared profile owns palette/material and family architecture decisions; this record owns gate geometry and motion.
- Visual anchors: D's folding-lens direction; round 01's color palette and rendered industrial art style are accepted and recorded in the shared profile.
- Open choices: final panel proportions/detail, opening travel, wormhole appearance and thumbnail simplifications.
- Fixed choices: manufactured and player-buildable; designed for both destinations; original D's broad metallic panel identity. Current direction is two independent synchronized rigid halves with minimal plumbing and no connecting chassis/hub.
- Builders' identity, resource types/costs, gate mechanics and construction rules remain unspecified.

## Feedback before round 01

Travis: “both”; “manufactured structure, i'm going to have players use resources to build them.”
Travis: “no clue what i want it to look like yet the world is our oyster i'd like 4 very differnt concepts instead of 1 with slight variations”

## Round 01 — silhouette exploration

- Comparison: [lane-gate-options-01.png](lane-gate-options-01.png).
- Exact prompt and generation record: [lane-gate-options-01.prompt.md](lane-gate-options-01.prompt.md).
- A: industrial ring — continuous circular infrastructure.
- B: transit rails — longitudinal accelerator with an open corridor.
- C: field array — disconnected coordinated emitter towers.
- D: folding lens — broad segmented reflector around a narrow slit.
- Camera, background, lighting and materials are held comparable to emphasize structural differences.
- Energy is proposed separately from physical structure.
- Selected reference: D, folding lens, in the round 01 sheet.

## Feedback after round 01

- Travis: “LOVE the color/artstyle”; preserve these in future rounds.
- Travis: “A|b are so generic lets go D.” Carry D forward; A and B are discarded directions, preserved in the sheet.
- Travis asked about a skeleton allowing the edges to spread apart while opening the wormhole. Treat this as a proposed motion to explore, not an accepted mechanism or an implementation request.
- Technical recommendation: separate rigid panel meshes attached to a fixed chassis, animated by translation/rotation around deliberate pivots. A bone rig is possible, but rigid panels can move directly without skin deformation. Keep the wormhole effect separate and drive its opening with the same animation progress.
- Asset preparation is the main uncertainty: the image does not establish hidden supports, hinges, clearances or separate mesh parts. Those need a motion study before production.

## Round 02 — opening states

- Request: “okay now lets mock up what the different states of the lane gate”.
- Sheet: [lane-gate-refinement-02.png](lane-gate-refinement-02.png).
- Exact prompt, reference and settings: [round record](lane-gate-refinement-02.prompt.md).
- Keep: D's folding-lens identity and manufactured-01 revision 1 palette/art style.
- Explore: closed, opening and fully open poses of one machine; edges separate mechanically as a cool-blue wormhole field widens between them.
- Proposed mechanism: rigid leaves on sliding side carriages with a slight backward hinge motion; rear supports remain clear of the passage. This is object-specific exploration, not a shared style revision.
- Visual review: the sheet communicates the widening aperture and preserves the material treatment. Hidden supports and exact part/pivot continuity need a geometry study; the rendered poses do not establish a working rig.
- Feedback: Travis accepted the overall study with one change: a larger opening. He is comfortable tuning the opening when building the model.
- Preserve the overall design, palette and field treatment. Build separate movable panels and supports with sufficient travel/clearance for a wider aperture; opening distance can then be tuned in the model. Exact width remains open.

## Production proposal and budget

- Reference: [clean wider-opening reference 03](lane-gate-production-reference-03.png), with the wormhole omitted so it is not generated as geometry. [Exact prompt and review notes](lane-gate-production-reference-03.prompt.md).
- Intended-size review: [large and actual 32px layout](lane-gate-size-review-03.png), prepared and opened in GoLand; awaiting Travis. The split silhouette survives at 32px. Final production thumbnail will be rendered from the model.
- Recommended first batch: ONE image-to-3D task, model_type smart-topology, ai_model meshy-t2, target_polycount 15000, should_texture true, enable_pbr true, texture_resolution 2k, target_formats [glb]. Cost: 15 Meshy credits, no retries or extra paid processing included.
- Reason: T2 directly targets the face count and documents natively separated parts. Generated part boundaries still need inspection and may need repair to match the intended rigid leaves, chassis and pivots.
- Current production goal: approximately 15,000 triangles for the whole gate, 2K base-color textures plus PBR maps, separable semantic material roles, TWO independent rigid half assemblies, adjustable opening distance. Each half retains faceted plate regions; no shared hub or connecting supports. Imported texture detail may need masks/material reassignment for family-wide recoloring. These are acceptance targets, not guaranteed generator output.
- Animation and wormhole: synchronized translation of two independent rigid halves and a separate runtime field; Meshy's character auto-rig is not part of this proposal. No visible mechanical linkage is required by the current visual brief.
- Credit balance checked: 2,723. Read-only balance check; no Meshy credits spent.
- Travis authorized up to 50 Meshy credits for the gate. This supersedes the proposed 150-credit gate planning envelope. Spent: 30; authorized remaining: 20. Latest account balance checked: 2,693.
- Mesh attempt 01: task 01a1419c-2664-72c8-98f5-579d12e1b89a, meshy-t2 smart-topology, 15,000 target triangles, 2K PBR, GLB. Generated from rectangular-chassis reference 04 before Travis's correction; SUCCEEDED, consumed_credits=15. Could not cancel because already completed. Downloaded as lane-gate-discarded-04.glb and textures; not inspected/integrated. [Exact prompt and task parameters](lane-gate-production-reference-04.prompt.md).
- Planning envelope, not spending authorization: gate 150, ruin kit 150, debris kit 100, optional ship/style revision 100, optional station/style revision 100 = 600 credits; 2,123 remain reserved. These allow iterative attempts and are not provider quotes or guarantees of completion. Approve exact batches as needed.
- Inventory routing recommendation: gate, ruin kit and debris kit are the three missing physical asset families. Anomaly, nebula, gravity well and radiation should start as runtime effects; geometry remains a concept-dependent choice. Existing procedural celestial art stays usable. Mesh count within fragment kits and future variants remains open.
- Sources checked: [Meshy pricing](https://docs.meshy.ai/en/api/pricing) and [image-to-3D specification](https://docs.meshy.ai/en/api/image-to-3d). Current connector supports T2; newer T2.5 appears in official docs but is not exposed in its model enum.

## Round 05 — corrected V-shaped shared chassis

- Travis chose mechanical connection to one shared chassis, then clarified with two wireframes: supports should converge toward one shared central hub and splay as sides spread. He explicitly asked not to copy the sketch arms literally.
- Preserved sketches: [compact layout](lane-gate-layout-compact-user.png), [expanded layout](lane-gate-layout-expanded-user.png).
- Discard round 04's rectangular top/bottom frame. Two independent powered halves were proposed but not selected.
- New study: [closed/open V-shaped chassis](lane-gate-refinement-05.png); [exact prompt and references](lane-gate-refinement-05.prompt.md).
- Keep: D's four faceted panel leaves, wider aperture, manufactured-01 revision 1 palette/art style. Move one service hub to the center/rear; use angled articulated support yokes to connect both sides.
- Object-specific design correction; no shared style profile change.
- Awaiting visual feedback. Hub depth, passage clearance and pivot construction need geometry review; two rendered poses are not a validated rig.

## Round 06 — return to simple panels, two independent halves

- Travis: “maybe we just have it two edgies only? and they :hand wave: just know hwo to stay in sync with each other.” He prefers original D's “big metallic panels with a bit of plumbing” and asked for a less-is-more approach with two halves.
- This supersedes the mechanically connected chassis decision, round 04's perimeter beams and round 05's central hub/support arms. Synchronization is accepted as a visual assumption; its fictional mechanism and gameplay remain unspecified.
- Authoritative reference: [user's original-D crop](lane-gate-original-d-user-reference.png).
- New study: [simple two-half closed/open sheet](lane-gate-refinement-06.png); [exact prompt and review](lane-gate-refinement-06.prompt.md).
- Keep: original D panel silhouette, palette and rendered art style. Remove: connecting frame, hub, arms, external service housings and excess exposed machinery. Two rigid half assemblies move apart as complete units; upper/lower faceted regions need not articulate separately.
- Review: simpler surfaces and minimal plumbing restored. Open pose is still narrow; the earlier larger-opening requirement remains. Closed-state energy is more visible than requested and remains a review point.
- Acceptance: Travis accepted the simplified study and requested modeling: “yeah thats better lets goahead nad model that”. This is an object-specific change; family-wide architectural rules remain provisional.

## Production 07 — generated two-half model and shared Storybook foundation

- Clean reference: [reference 07](lane-gate-production-reference-07.png). [Exact prompts, Meshy parameters and production review](lane-gate-production-07.md).
- Meshy task: 01a141b1-d0a3-726c-b0c3-72026ea0f5c1, SUCCEEDED, 15 credits. Total gate spending 30/50.
- Raw model preserved; prepared GLB has named LeftHalf/RightHalf meshes and an Open animation, 14,540 triangles, 2K PBR textures. Wider aperture implemented as adjustable rigid translation, 70% of height at the clip endpoint.
- User requested a reusable Storybook WebGPU canvas foundation, like the card shell, instead of custom HTML for every model. Built WebGPUCanvas for custom scenes and WebGPUModelView for GLB review, with gate, ship and station stories. [Foundation usage](../../frontend/components/graphics/README.md).
- Review at http://127.0.0.1:20203/?path=/story/graphics-model-view--lane-gate; foundation docs at http://127.0.0.1:20203/?path=/docs/graphics-webgpu-canvas--docs.
- Browser checks confirmed progress/view/wireframe/playback changes, reduced-motion pause, and no GLB reload during controls. Preview materials remain the generated atlas; independent style-role recoloring and the separate wormhole effect remain production work.

## Production 10 — modular construction

- Travis approved building and assembling all parts after comparing the raw
  Meshy plate with the explicitly constructed closed plate in round 09.
- Construction and review record (archived with experiments 08–10): eight plates,
  individual rails/spines/connectors/fasteners/utility details, matching smooth
  front and back, two animated rigid halves, semantic material roles.
- Whole assembly, representative kit and exploded half were reviewed in
  Storybook, then removed from the active catalog after original 07 was preferred.
- Round 09 spent 5 credits on the isolated Meshy plate, rejected for open edges.
  Round 10 is constructed locally with no new credits. Gate total 35/50.

## Feedback after modular construction 10

- Travis finds the modular gate much cleaner but missing the realism/depth of
  the original Raw GLB story. Since gates will not be seen up close, small
  generated artifacts are acceptable at intended gameplay distance.
- Prefer generated round 07 as the visual basis. Round 10 remains a modular
  construction reference, not a visual replacement. Favor material richness,
  bevel highlights and layered detail over close-up topology perfection.
- This feedback applies to the gate; no shared style revision or final runtime
  acceptance is implied. Future comparisons should use intended scene scale.

## Stage and next action

- Concept: simplified two-half gate, broad metallic panels, restrained plumbing.
- Preferred visual basis: generated round 07, as shown in Raw GLB. The served
  lane-gate.glb already contains that original prepared animated model.
- Experiments 08–10 are archived in
  [lane-gate-experiments-08-10.tar.gz](archive/lane-gate-experiments-08-10.tar.gz).
  Their served test meshes and Storybook stories have been removed; the archive
  retains source scripts, models, screenshots and review records. Extract into
  `.scratch/hud-components/` to restore their original relative paths.
- Production budget: 35 of 50 Meshy credits spent, 15 remain.
- Next review should prioritize intended gameplay scale and the original model's
  realism/depth. Runtime/HUD acceptance, world integration and portal effect remain open.

## Portal field 11–12

- Travis requested the blue forcefield/wormhole from the opening reference.
  Implemented as a separate runtime effect; the generated GLB is unchanged.
- First lens-shaped version floated within the aperture and was too transparent
  and dim. Feedback: field must meet the gate edges and be visually brighter.
- Revised field reaches the inner emitter spines along both sides, with rounded
  caps, brighter blue fill/rim and animated crossing filaments. Width follows
  the same opening progress as the hardware; closed gates hide the field.
- Gate review stories include the effect; Raw GLB remains hardware-only. Uses
  the shared canvas lifecycle and a generic optional model-view effect factory.
- Browser checks cover front/back/closed/raw, animation and reduced-motion pause.
  Shared canvas/resource tests pass (6); lint and TypeScript checks pass.
- This is a Storybook visual checkpoint, not world integration. No Meshy credits
  spent. Shared style remains manufactured-01 revision 1.
