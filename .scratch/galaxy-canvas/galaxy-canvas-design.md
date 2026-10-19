# Galaxy canvas design

Status: background, Stellar art, default emerald route color and palette-setting direction accepted. Runtime visual review and alternate palette acceptance pending.

## Brief

- Purpose: make the galaxy canvas feel richer and more alive compared with the system view.
- Destination: live galaxy scene; concept mockups first. HUD layout is context, not this session's redesign target.
- Nature: astronomical scenery plus a decorative navigation plane.
- Fixed choice: Travis requested the same faint hexagonal grid already shown in the system view. This is a visual treatment, not territory, sectors or movement cells.
- Existing references: user-provided galaxy and system screenshots; system scene's hex grid and atmospheric treatment.
- Fixed choice: refinement 02's background, including dust composition, intensity, distant starfield and hex plane, is accepted as shown. Do not dim the grid further without new feedback.
- Fixed choice: A, Stellar, from comparison 03 supplies the star/lane direction.
- Fixed choice: ordinary lanes stay quiet silver-blue; a selected route follows its lanes with stronger emphasis, sparse directional chevrons and a distinct destination marker. Cyan route color was rejected after visual review because it blends with the blue scenery.
- Fixed choice: proposed routes use a dashed overlay; active routes use a continuous overlay with completed legs subdued. Visual review pending.
- Fixed choice: emerald is the default route color. Dark outlines, heavier strokes than ordinary lanes, dashes, direction markers and destination shapes are always on; route legibility must not depend on color alone.
- Fixed choice: offer a previewable Map palette setting. Initial alternatives are High-contrast Amber and High-contrast Ivory; they need Storybook comparison and color-vision simulation before acceptance.
- Open choice: exact route appearance and density at different zooms, motion and runtime technique.

## Comparison 01

[Comparison sheet](galaxy-canvas-options-01.png) · [Exact prompt and inputs](galaxy-canvas-options-01.prompt.md)

- A, Stellar Depth: restrained haze, distant stars and more distinct stellar cores.
- B, Galactic Dust: a broad dust band with dark rifts.
- C, Nebula Islands: separated cyan/violet cloud formations and dark voids.

User feedback before generation: requested visual options before choosing an atmosphere; clarified that the hex plane should match the existing system grid.

The image is an illustrative concept, not exact renderer output. Generated lane patterns, HUD text, fleet glyphs and star distributions are not accepted gameplay or interface changes. Any runtime lanes must remain limited to disclosed data. Cloud scenery does not establish new features or lore. Static concepts do not settle animation.

## Next action

In-app promotion authorized, 2026-10-19: both live views now select the reviewed
shared sky and Dark seams preset (16 / 0 / 0.5px); Galaxy uses Stellar art.
The shared lattice module is production code. Review controls and route fixture
remain in Storybook. See [in-app rollout](galaxy-in-app-rollout-10.md) for checks.

Latest round: shared surrounding sky for both scenes, with a prototype enclosing
hex lattice instead of the ground plane. Travis liked this direction and asked
for a more distant feel, followed by adjustable distance/brightness/thickness.
Use the three on-canvas sliders in Galaxy Overview or Storybook Controls in
either scene. Distance also changes angular cell density; brightness and pixel
thickness update the existing wide-line material. Ground/off comparisons remain
available. No final numerical settings accepted. See [sky round 08](galaxy-sky-review-08.md).

Review the first runtime pass in the existing
[Galaxy Map / Overview](http://127.0.0.1:20203/?path=/story/graphics-galaxy-map--overview).
Compare palettes, proposed/active/completed states, zoom and vision simulations.
See [runtime review 07](galaxy-runtime-review-07.md). Route data remains an
illustrative journey along existing fixture lanes; planning/execution is separate.

## Palette and non-color cues, 2026-10-19

Travis selected emerald, then confirmed always-on contrast/shape cues and a
previewable Map palette setting. Default Emerald is selected. High-contrast
Amber and High-contrast Ivory are candidate alternatives, not yet validated
or visually accepted. Review proposed/active/completed states at close and wide
zoom, including color-vision simulations, without changing the accepted scenery.
Runtime technique and exact widths, brightness and zoom density remain review
work. No route planner or multi-hop execution is established by these visuals.

## Route colors 06

[Comparison](galaxy-route-colors-06.png) · [Exact prompt and QA](galaxy-route-colors-06.prompt.md)

Amber carried forward alongside saturated emerald and violet (rendered closer
to orchid). Dashed and solid portions are stroke samples only. Travis selected
emerald as the default route color. Preserve previous background and Stellar acceptance; incidental
generated node tints, path bends and scenery differences do not change them.

## Route colors 05 and feedback

Feedback, 2026-10-19: Travis requested amber alongside green and another color;
coral is too light. Amber is carried forward as a candidate, not yet the final
route color. The next round compares amber, emerald and violet with stronger
color saturation and restrained bloom.

[Color sheet](galaxy-route-colors-05.png) · [Exact prompt and QA](galaxy-route-colors-05.prompt.md)

Compares amber, coral and warm ivory route overlays, with a dark contrast edge
requested to separate them from haze and bright dust. Proposed/active state
semantics stay fixed. No replacement color selected yet. Generated scale differs
between columns, some endpoints are cropped and completed legs remain too bright;
this round evaluates route color, not new topology, framing or progress styling.

## Route refinement 04 and feedback

Feedback: Travis found cyan routes difficult to distinguish from the blue sky
regardless of dashes or arrows. Route color is reopened; dashed/solid state
semantics remain. Background and Stellar art remain fixed.

[Review sheet](galaxy-route-refinement-04.png) · [Exact prompt and QA](galaxy-route-refinement-04.prompt.md)

Travis accepted the proposed route-emphasis and state distinctions for visual
review. Top row shows dashed proposed routes; bottom row shows continuous
active routes with completed legs and a current-system marker. Columns compare
wide and close scale. Image acceptance pending. The generated completed legs
remain fairly bright; an extra triangle in the proposed close view is incidental,
not approval to show an active fleet in a proposal. Illustrative hop count and
topology are not an exact planner fixture. Background and Stellar direction stay
fixed; no runtime planner or automatic multi-hop execution is implemented here.

## Star/lane comparison 03

[Comparison](galaxy-stars-lanes-options-03.png) · [Exact prompt](galaxy-stars-lanes-options-03.prompt.md)

A, Stellar: dimensional cores with fine filaments. B, Navigator: compact bezels
and calibrated paths. C, Luminous: soft coronas and light ribbons. Travis selected
A and requested support for showing long multi-system routes. The background remains accepted from refinement 02, not redefined
by incidental generation drift. Actual Galaxy Map and Solar System scenes are
available under Graphics in Storybook for subsequent runtime reviews.

Route display is a requested design requirement, not evidence of an implemented
multi-hop planner or automatic execution. Ordinary lane versus route emphasis,
preview/active state distinctions and behavior at galaxy scale remain open.

## Feedback on refinement 02

Travis accepted the background as shown and requested a facelift for stars and lanes. Keep the background fixed through subsequent rounds. This overrides the earlier suggestion to dim the foreground grid; stars and lanes are not accepted. Canonical background acceptance is recorded in [art direction](../../docs/art-direction.md).

## Refinement 02

[Full-size concept](galaxy-canvas-refinement-02.png) · [Exact prompt](galaxy-canvas-refinement-02.prompt.md)

Preserves B's dust-band direction and hex plane; uses sharper, larger stellar cores, clearer cyan lane lines and a secondary background starfield. Generated topology and HUD details remain illustrative. The hex grid still has noticeable foreground contrast, and cloud intensity/readability need user review. No animation or runtime implementation is settled.

## Feedback on comparison 01

Travis selected B but found the star dots and lanes hard to see or distinguish. This selects the atmospheric direction for refinement, not final visual acceptance. The next round separates interactive nodes and lanes from background stars, dust and grid through contrast, size and restrained glow.
