# Galaxy route colors 05 — prompt record

Date: 2026-10-18

- Tool: built-in `image_gen.imagegen`; model not exposed.
- Settings: `transparent_background: false`; other settings not exposed.
- Input: [route refinement 04](galaxy-route-refinement-04.png).
- Output: [route colors 05](galaxy-route-colors-05.png).
- Feedback: cyan blends with the blue scenery regardless of dashes or arrows.
- Compared: A amber, B coral, C ivory; proposed and active states with a dark contrast edge requested.
- Status: awaiting color selection. Background and Stellar direction remain fixed.
- QA: warmer overlays distinguish from the blue lanes. Generation retains different wide/close framing between columns instead of the requested identical scale, clips some left-side route endpoints, and leaves completed legs too bright. Exact widths, casing and colors require runtime review; illustrative topology is not a planner fixture.

## Exact prompt

Use case: ui-mockup
Create a six-panel art review sheet for Hexaverse galaxy-map ROUTE COLOR CONTRAST. Reference image is previous four-panel galaxy route study. Preserve its accepted dark navy/teal and amber galactic dust background, faint hex grid, dimensional Stellar spheres and ordinary fine silver-blue lane network. Change only route overlay treatment. Do not dim, desaturate or recolor the scenery to fake higher contrast. This is natural scenery plus navigation overlay, no manufactured-object style profile.
Layout: THREE ROWS, TWO COLUMNS. Each wide panel shows exactly the same representative oblique galaxy-map crop of approximately 25 map-system stars and ONE six-leg route winding left to right through a branching ordinary lane network. Route crosses dark void, blue haze and a bright amber dust pocket in every panel so the color can be judged on all backgrounds. All six panels identical camera, star positions, network topology and background. Labels small outside top left of each panel.
Row A: 'A · AMBER — PROPOSED' and 'A · AMBER — ACTIVE'. Route color vivid golden yellow amber, around #FFD166.
Row B: 'B · CORAL — PROPOSED' and 'B · CORAL — ACTIVE'. Route color warm salmon coral, around #FF8066, no enemy symbols or alarm connotations.
Row C: 'C · IVORY — PROPOSED' and 'C · IVORY — ACTIVE'. Route color warm bright ivory around #FFF2CC, no cyan cast.
Main requirement: route must separate decisively from blue sky/haze and ordinary blue-white lanes through both hue AND a narrow opaque nearly black under-stroke/contrast keyline. Make this dark casing visibly interrupt underlying haze immediately around the line, preventing washout at bright dust crossings. Colored inner stroke stays crisp, consistent screen-space thickness. Thin but clearly heavier than ordinary lanes, no giant glowing ribbons or diffuse bloom. DO NOT use cyan or blue for any selected-route line, arrow, endpoint or destination marker.
LEFT PROPOSED panels: chosen route follows lane segments with a colored dashed overlay, clearly separated moderately long dashes. Sparse small forward chevrons in same row color, only two or three. Small open origin ring and double-ring destination marker in same warm route color. No fleet or current-system marker in proposals.
RIGHT ACTIVE panels: same route, first two legs completed, rendered subdued muted gray with dark casing; remaining four legs continuous solid warm color. One small same-color triangle at third system marks current position AT the star, not mid-lane. Distinct double-ring destination at right. Sparse direction chevrons. Completed portion clearly dimmer than the active portion. Maintain the underlying star sphere surfaces, do not recolor stars to match route. All other stars and lanes remain identical across rows.
No side HUD, no browser chrome, no legends, no ETA or fuel arithmetic, no territories, no invented gameplay, no more than one route per panel, no long labels near stars. Polished plausible real-time renderer concept with screen-space line treatment, readable at ordinary gameplay scale. This sheet evaluates color, not new background or stellar art directions.
