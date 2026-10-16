# Lane gate production 07 — two independent halves

- Concept accepted: round 06. Travis: “yeah thats better lets goahead nad model that”.
- Style profile: manufactured-01 revision 1.
- Image tool: built-in image_gen.imagegen; tool-selected model.
- Image settings: transparent_background=true; reference lane-gate-refinement-06.png.
- Saved clean reference: lane-gate-production-reference-07.png.
- Meshy task: 01a141b1-d0a3-726c-b0c3-72026ea0f5c1, image-to-3d.
- Meshy result: SUCCEEDED; consumed_credits=15.
- Authorized gate budget: 50; total spent 30 (15 discarded attempt + 15 this task); remaining 20. Account balance checked: 2,693.
- Deliverable: textured GLB, two movable independent rigid halves, wormhole excluded.
- Raw output: lane-gate-generated-07.glb and lane-gate-generated-07_textures/.
- Prepared output: lane-gate-model-07.glb; copy at frontend/public/models/space/lane-gate.glb for Storybook review. Reproduce with python3 .scratch/hud-components/prepare-lane-gate-model-07.py.
- Geometry: 14,540 triangles (7,234 left; 7,306 right). Raw generator packed both disconnected halves into one mesh; no triangle crossed the central gap. Locally split and compacted vertices into named LeftHalf and RightHalf meshes, preserving every triangle, UV, normal and the embedded textures.
- Animation: Open clip, 1.5 seconds, two node translation tracks. Thin closed seam (1.2% of height), open gap 70% of height. No bones or paid auto-rig. Default pose is open.
- Material: one generated 2K atlas shared by both halves, plus metallic/roughness and normal maps. Semantic material-role masks/reassignment remain unfinished; this is not yet centrally recolorable by independent surface roles.
- Preview: Storybook Graphics / Model View, Lane Gate, Closed, Opening, Back, Side and In HUD Card. Uses the reusable WebGPUCanvas/WebGPUModelView foundation rather than per-asset HTML. Interactive controls verified for progress, camera view, wireframe, playback and reduced motion with a single GLB load.
- Browser evidence: storybook-model-controls-07.png and storybook-graphics-07.review.json. Normal headless Chromium renders via WebGL2 fallback. Forced unsafe WebGPU produced blank screenshots even for a standalone plain-WebGPU clear, so those forced runs are not native-WebGPU visual validation. Shared renderer lifecycle behavior is exercised in unit tests.
- Review status: generated and mechanically prepared for visual review. Wormhole effect, shared-style material masks, actual world integration and runtime/HUD acceptance remain outstanding.
- Preview foundation follow-up: production SpacecraftPreview now mounts WebGPUCanvas and supplies scene content through createSpacecraftPreviewScene; the old independent renderer/visibility/animation loop was removed. Ship/station stories render the actual production component. Raw GLB review remains separate for the gate. All preview/thumbnail paths share scene-resources.ts lighting and disposal; renderer failures use RendererStateNotice with preview surface. Surface/alpha/stencil are configurable; main SpaceWorld was not changed by this migration.
- Validation after migration: 195 relevant tests pass, lint/type checks pass, Storybook static build passes. Browser evidence in shared-preview-07.review.json covers pixel parity for production ship/station stories, 384px budget, star animation, reduced-motion pause, keyboard rotation and shared renderer failure UI. Fleet, station, star and gas-giant thumbnail captures are byte-identical to shipping PNGs after the shared light-rig extraction. Storybook/Vite public-copy ownership and offline dependency prebundling were fixed during verification.

## Exact clean-reference image prompt

Use case: precise-object-edit.
Asset type: clean single-object geometry reference for 3D modeling of Hexaverse lane gate D, production reference 07.
Reference image is the accepted lane-gate-refinement-06.png closed/open study. Use the simplified panel design in that sheet exactly: TWO independent matching rigid half assemblies, broad clean faceted light gray metallic plate surfaces, narrow graphite spine/seams, sparse small amber utility accents, minimal recessed edge plumbing. Shared style manufactured-01 revision 1. Four broad plate regions on each half may remain surface divisions within one rigid half.
Produce ONLY ONE gate, fully open pose, as one centered whole object with both halves visible and equal height. No comparison, no text or labels. Preserve the same panel contours, proportions, thin panel depth, materials and architectural simplicity as the reference. Both halves have matching near-front three-quarter orientation as a single gate. Widen the empty vertical space between them to about 2/3 of their height by translating the entire halves horizontally outward; do not change either half's shape. Two completely separate structures, no shared hub, frame, arms, rails, braces between the halves, rear power housing, pods or extra machinery. They simply stay synchronized without a visible connection.
Remove ALL wormhole/portal energy from the space between the halves: the central aperture is completely empty transparent background with no membrane, colored haze, filaments, particles, lighting bloom or solid geometry across it. Preserve narrow physical pale-blue emitter strips on the inner metal edges but with very restrained emission that stays on the hardware. No big glowing elements.
One near-front three-quarter studio render, slightly enough depth to read the thin metallic plates and recessed plumbing. Whole gate with generous clear margins, no cropping. Neutral soft studio lighting. Genuine transparent background, no floor, no ground shadow. Crisp detailed industrial hard-surface render faithful to the reference, big metallic panels with a little plumbing. No watermark.

## Exact Meshy creation parameters

{
  "file_path": "/Users/travis/Projects/hexaverse/.scratch/hud-components/lane-gate-production-reference-07.png",
  "ai_model": "meshy-t2",
  "model_type": "smart-topology",
  "target_polycount": 15000,
  "should_texture": true,
  "enable_pbr": true,
  "texture_resolution": "2k",
  "target_formats": [
    "glb"
  ],
  "texture_prompt": "Hexaverse manufactured-01: broad light gray metallic panel surfaces, thin graphite edge framework and recessed seams, sparse small amber utility details, narrow pale blue emitter strips. Minimal edge plumbing. Preserve the clean metallic panel art of the reference. Two independent disconnected rigid halves with completely EMPTY space between. No portal membrane, no hub, no connecting arms or support frame.",
  "response_format": "json"
}

