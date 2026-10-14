# Vibrant system scene review

The scene now has stronger palette separation, tighter star glow, recognizable rocky belts, subdued grid lines and passive object labels. These are implementation and validation observations; final art-direction acceptance remains the user's review of the rendered views.

A subsequent user-requested [gas-cloud shader follow-up](../gas-cloud-review/README.md)
adds varied cloud morphologies and motion. The comparisons below retain the
initial scene-pass captures; the follow-up has its own current images and videos.

A later [spacecraft and label-placement pass](../spacecraft-review/README.md)
addresses shadow-facing hull readability and labels over neighboring surfaces,
with matching before/after captures at normal and closer zoom.

The [station visibility pass](../station-review/README.md) adds clearer ring and
hub panels plus fitted running lights, with sunlit and shadow-facing comparisons.

## Matched views

Each pair uses identical disclosed wire data, 1440×1000 viewport, reduced motion, zero world clock/scale, and the same camera gestures. Baseline code is `8a8e6f43`. After code is integration `2b33d9b` plus the validation pass's ship diffuse response lift and passive-label density correction. Camera JSON and actual backend are recorded in the adjacent metrics files; all six camera/backend pairs were checked for equality.

| View | Native WebGPU before | Native WebGPU after |
| --- | --- | --- |
| Normal, higher tactical angle | [before](before/webgpu-01-normal-high.png) | [after](after/webgpu-01-normal-high.png) |
| Normal, low angle | [before](before/webgpu-02-normal-low.png) | [after](after/webgpu-02-normal-low.png) |
| Selected world, low angle | [before](before/webgpu-03-selected-low.png) | [after](after/webgpu-03-selected-low.png) |
| Closer inspection, low angle | [before](before/webgpu-04-close-low.png) | [after](after/webgpu-04-close-low.png) |
| Closer inspection, high angle | [before](before/webgpu-05-close-high.png) | [after](after/webgpu-05-close-high.png) |
| Crowded scene | [before](before/webgpu-06-crowded.png) | [after](after/webgpu-06-crowded.png) |

Forced WebGL2 has the same six matching views in `before/` and `after/`, with the `webgl2-` prefix. For example: [normal before](before/webgl2-01-normal-high.png), [normal after](after/webgl2-01-normal-high.png), [crowded before](before/webgl2-06-crowded.png), [crowded after](after/webgl2-06-crowded.png).

The representative fixture contains a G-class star, two green/ocean rocky appearances, one rust desert appearance, cyan and purple giants, ice, a station, a fleet and a belt with served orbital elements. The crowded variant adds 72 varied planets. IDs were chosen to cover deterministic appearance families without changing classification or introducing gameplay facts. Labels use these disclosed identifiers because the fixture does not serve names.

## Observed result and remaining limits

Inspected actual native and fallback output at normal, low, high, closer and crowded views. Both renderers show the same art direction and placements. Worlds have distinct blue/green, rust, icy, cyan and purple palettes. Detail remains visible on sunlit surfaces, while night-facing surfaces have deeper shadows. The star has visible surface texture and a smaller corona, and surrounding space stays dark with subtle color. Grid lines recede behind objects. The belt is a ring of shaded rocks with depth instead of faint points.

Station highlights and cyan running accents reveal the ring and spokes. The imported ship has improved reflected-light response without all-over hull emission; however, its retained model remains small and dark at normal distance, especially on the shadow-facing side. Running lights, the acting marker and label carry much of its visibility. A later silhouette/model assessment may still be warranted, as allowed by the spec; scale and geometry were preserved in this pass.

Normal-scene annotations are compact and readable. Selected annotations expose disclosed type/status and move with camera gestures. The initial crowded review exposed excessive text density even though label rectangles did not collide. The validation pass added a viewport-scaled passive-label budget that prioritizes key objects, while selected and hovered objects bypass that budget. The final crowded view leaves most surfaces free of passive text, retains the acting fleet and key objects, and suppresses lower-priority labels. Labels can still sit near unrelated surfaces in a strongly overlapping low-angle view; changing the camera separates these projections. At the chosen low angle, the central rocky world overlaps the star; high and rotated closer captures expose its surface. The high-angle closer view clips the station and foreground giant at the bottom, while the closer low-angle view shows the station clearly. These are player-controlled framing outcomes; the pass does not force a viewpoint.

## Validation

Final expanded journey passed on native WebGPU and forced WebGL2, with no skips: auth setup plus two browser journeys, 3 passed in 49.1 seconds. It exercised keyboard selection, mouse picking and trusted touch selection through passive labels; orbit, pan and zoom; selected annotation priority and movement; crowded collision suppression; representative-to-crowded reload; and leaving/reopening the system route. No page exceptions or shader compilation/validation errors were observed.

The retained 84 tests across stage interaction, spacecraft art/integration and scene art/renderer lifecycle passed after the reflected-light adjustment. A new Stage interaction regression then failed with 39 passive labels in a spatially separated 48-world scene, and passed after the density correction; all 42 Stage interaction tests passed, including disclosure of a suppressed hovered object and preservation of selected-object priority. Scoped ESLint, frontend TypeScript and required file validators passed. Root integration checks are recorded separately by the integration workflow.

Browser warnings present both before and after are recorded in metrics: `renderAsync()` deprecation, the empty spacecraft picking-root position attribute, and expected WebGL2 fallback notices. The fixture's `/v1/systems/sys_-1_-1/station` venue read returns404 because the route fixture includes no database trading venue; station geometry loads successfully from the local GLB. No diagnostic was relabeled as successful visual acceptance.

## Responsiveness evidence

Measurements are 119 browser requestAnimationFrame intervals in each settled scene on this Mac, using actual Metal graphics. They measure presentation scheduling rather than GPU time and do not establish an absolute frame-rate guarantee. They also cannot isolate small costs from browser/dev-server variability.

| Backend | Scene | Before median / p95 | After median / p95 | Over50ms intervals before / after |
| --- | --- | --- | --- | --- |
| Native WebGPU | Representative | 16.7 / 17.1ms | 16.7 / 17.3ms | 0 / 0 |
| Native WebGPU | Crowded | 16.7 / 16.8ms | 16.7 / 17.4ms | 0 / 0 |
| Forced WebGL2 | Representative | 16.7 / 17.3ms | 16.7 / 17.5ms | 0 / 0 |
| Forced WebGL2 | Crowded | 16.7 / 17.1ms | 16.7 / 17.5ms | 0 / 0 |

Camera gestures remained responsive in both scenes/backends. This sample did not reveal a material scheduling regression. The crowded screenshot remains a stress fixture, not a typical generated system distribution.

## Final integration checks

`bash harness/check.sh --frontend --keep-going` passed TypeScript, ESLint and
all 2,212 tests across 163 files on integration `bca0dd7`. Explicit per-file
project checks passed for every changed frontend file. The existing Stage-level
annotation tests live in `space-annotations.test.tsx` to satisfy the matching-file
check without changing their public seam or assertions. [Independent code
reviews](code-review.md) found zero actionable findings on either axis.

An intermediate test run exposed an [existing scan confirmation timing
race](preexisting-scan-race.md). It was diagnosed and left outside this scene-art
scope; the final integrated suite passed with production scan code unchanged.
All implementation tickets are resolved and temporary worktrees were removed.

## Reproduction

From the repository root, run:

```bash
SCENE_ART_CAPTURE_DIR=/private/tmp/vibrant-scene-captures bash scripts/dev/with-test-emulators.sh 'cd frontend && npx playwright test --project=chromium e2e/tests/refresh-system-scene-art-journey.spec.ts'
```

Isolated worktrees sharing an external `node_modules` symlink must additionally set `E2E_DEV_COMMAND='npx next dev --port 20230'` because Turbopack rejects symlinks outside its filesystem root. The journey scopes `--enable-unsafe-webgpu` to its browser, with `--use-angle=metal` only on Darwin. Without the Metal flag, this Mac's headless Chromium produced blank native captures and stale HTML trails despite renderer readiness; those unusable captures were replaced. The test skips the native journey only when a native adapter is unavailable, and still requires the actual `webgpu` backend when an adapter exists. The local review run exercised both actual backends successfully.
