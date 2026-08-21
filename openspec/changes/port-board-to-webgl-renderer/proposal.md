## Why

The tactical board (spec #0007) is drawn with flat SVG shapes, capped short
of the lighting model — lit spheres with real terminators, bloom-caught
emissive sources, a parallax starfield — that the `frontend/app/spike/
webgl-board/` spike has already proven out and tuned. `docs/plans/
webgl-board-port.md` promotes that spike to the production renderer: same
board, better picture, no backend change, no new gameplay surface. Doing it
now, while the fleet-collection rewrite (N fleets, own/foreign fork) is
forced open by SSE bringing fleets into and out of the system anyway, avoids
re-opening the same instancing and update-loop code a second time later.

`hex-board-view` has never carried a requirement for how fog bands translate
into a feature's drawn treatment, for how a click resolves to the entity
under the pointer, or for how a foreign fleet differs from an owned one —
the SVG board has implemented all three since M6/M9, undocumented. This
change writes them down as the port's baseline, alongside genuinely new
scenario coverage for the port's own architecture (canvas+overlay picking).

## What Changes

- Add `### Requirement: Fog Band Determines a Feature's Board Treatment` —
  the band → treatment mapping the SVG board has always implemented,
  captured for the first time. **One deliberate visual change rides along,
  and only one**: the `astronomical` band moves from a filled glyph at 42%
  opacity (today's SVG) to an unfilled outline only (`wireOnly`, the spike's
  treatment, doc-sanctioned at `webgl-board-port.md:393` and
  `spike-palette.ts`). This is the one place this port is not a pure
  rasteriser swap — record it as intentional, not incidental
  (confirm-or-correct with Travis before implementation — see design.md
  `## Open Questions`). The `remembered` and `visible` bands are explicitly
  **pinned to today's opacity-only SVG-shaped treatment** — the merged fog
  record's `remembered`/`visible` entries carry `chroma: 0, breakUp: 0`, not
  the spike's tuned signal-quality values. The spike's `remembered` fog
  (`{dim: 0.5, chroma: 0.16, breakUp: 0.35}` — per-channel colour offset
  plus an *animated* scanline break-up, `scene-bodies.ts:189`) is a
  different, second visual language from the SVG's `{opacity: 0.62, ghost:
  true}`, unrecorded anywhere in the source doc and squarely inside its
  stated non-goal "No new visual language." It is deferred, named, to
  `docs/plans/board-visual-language.md` rather than riding along silently —
  see design.md `## Open Questions`, beside the astronomical confirm-or-
  correct entry, for the one-line reversal if Travis wants the spike's tuned
  look shipped instead. The `remembered` band keeps its resource detail
  exposed (frozen at the observation's `asOf`, and available via
  `data-mineable` and the facts panel's `asOf` readout) — the doc's own
  draft of this requirement said the opposite, which would have broken
  `data-mineable` and the `Mine Offer on the Docked Fleet` requirement. The
  requirement also carries the security-panel's hardening:
  the band → treatment mapping is assertable outside any rendering context,
  an unrecognised band falls back to the most restrictive (`astronomical`)
  treatment rather than throwing, and the board holds no resource/activity
  detail the server's fog projection omitted.
- Add `### Requirement: Board Picking Resolves to the Entity Under the
  Pointer` — the load-bearing correctness property of the three-layer
  canvas+SVG-overlay architecture: hit targets must coincide with what is
  drawn, including the docked-fleet occlusion edge case that makes the mine
  gesture work today (`FleetGlyph.tsx:69`). A feature's hit-target size is
  independent of its fog-band treatment, so an outline-only astronomical
  feature — exactly what a new player must find and scan first — is no
  harder to select than a filled one.
- Add `### Requirement: Foreign Fleets Render as Contact Marks Only` — keeps
  the existing SVG board's own/foreign visual fork (accent ring + heading +
  thruster vs. a bare grey contact mark) as a requirement, so the port does
  not silently regress to identical chevrons for both tiers (a regression
  the source design doc itself proposed as an acceptable shortcut). A
  foreign fleet's mark is derived from its position alone — size, hull
  count, and formation are constant across all foreign fleets regardless of
  the owner's actual roster — and a fleet that drops out of a read (left
  sensor coverage, or departed) is removed from the board on that same read,
  not left as a stale contact.
- Add `### Requirement: Board Glyph Selection Is Keyboard-Operable` — every
  fleet, feature, and lane-gate hit target becomes reachable by keyboard
  (consistent tab order, Enter/Space activates, visible focus indicator).
  Scoped to the glyph layer only: bare-hex keyboard selection is an explicit
  **non-goal** of this change, because the new canvas+overlay architecture
  has no per-tile DOM node to attach it to and per-tile keyboard navigation
  would need a different mechanism (roving tabindex, arrow-key hex
  traversal) — materially bigger, undecided, and not a regression (it has
  never worked). Candidate to pair with `add-board-camera-controls`.
- Add `### Requirement: Board Respects Reduced-Motion Preference` — while
  the user's system indicates a reduced-motion preference, the decorative
  animation that actually runs every frame in this port's scope — starfield
  twinkle, nebula drift, film grain, body-surface churn — holds static (time
  input frozen), while feature and fleet positions keep advancing with world
  time. (Starfield *parallax* and bloom *pulsing*, named in an earlier
  draft, do not exist in this change's scope: parallax is a camera effect
  and this change ships a fixed camera, and bloom is a constant, not
  animated — so this requirement now names the motion that actually needs
  suppressing, not exemplars this change never ships.) New territory this
  port introduces: continuous shader-driven decorative motion did not exist
  under the SVG board's static viewport.
- Modify `### Requirement: Toggle-to-Deselect Single Selection` to capture
  click-empty-to-deselect (live today, never specced) as a third scenario;
  the port changes how "empty" is computed (unproject → hex, vs. hitting an
  SVG root), making this the right moment to pin it.
- Modify `### Requirement: System Board Route and Data Fan-In` so the
  loading state persists until the board's rendering context has produced
  its first frame, not just until the interior/fleet reads resolve — this
  pipeline is heavier than SVG, and a black canvas between "data arrived"
  and "first frame" is a real unspecified state on the primary play
  surface otherwise.
- **BREAKING**: delete the SVG board render path — `HexBoard.tsx`,
  `BoardScene.tsx`, `HexLattice.tsx`, `FeatureGlyph.tsx`, `FleetGlyph.tsx`,
  `GateGlyph.tsx`, and their tests — and `app/spike/webgl-board/SvgBoard.tsx`.
  `SystemBoardView` renders the WebGL board exclusively; there is no runtime
  toggle and no fallback renderer. Anything importing these components
  breaks; none do outside the deleted tests and the spike's SVG half.
- The spike route (`/spike/webgl-board`) survives as a WebGL-only tuning
  bench (bloom/instrument/tilt/speed sliders), its SVG comparator half
  removed along with `SvgBoard.tsx`.
- Camera pan/zoom/pinch (design doc phase 5) is explicitly **out of scope**
  here — carved out to a follow-on change, `add-board-camera-controls`. This
  change ships at a fixed camera — no user-driven pan or zoom, so no
  regression against today's fixed `fitViewBox` — but at a tuned 14° tilt,
  which is new; that is not a claim of `fitViewBox` parity, and nobody
  should read the tilt as free. The projection seam (`project`/`unproject`)
  is still built now, as design structure, because the overlay needs it to
  register hit targets against the canvas even without gestures.

## Impact

- Affected specs: `hex-board-view`
- Affected code: `frontend/components/board/webgl/` (new — GL plumbing
  extracted from `app/spike/webgl-board/`), `frontend/components/board/`
  (SVG glyph/lattice deletions, new overlay hit-shape components,
  `board-palette.ts` absorbs everything `spike-palette.ts` exports that
  survives the port — the three compelled relocations plus `VOID`/`SIGNAL`/
  `HULL`, still imported by the spike route and the surviving scene
  modules), `frontend/components/board/SystemBoardView.tsx` (renders
  the WebGL board), `frontend/app/spike/webgl-board/` (WebGL-only tuning
  bench), `frontend/e2e/tests/board.spec.ts` and `slice.spec.ts`
  (renderer-agnostic assertions), `frontend/components/board/
  SystemBoardView.test.tsx` (must survive without a live GL context).
- **Depends on `add-renderer-availability-states`.** That change ships the
  explicit unsupported/interrupted board states this change's risk note
  below relies on as a mitigation, and must land first.

**Risk — the straight swap's blast radius.** After this change there is no
toggle and no fallback renderer: a WebGL regression takes down the primary
play surface, not a degraded corner of it. The mitigations of record are (1)
the renderer-agnostic e2e gate (`board.spec.ts`/`slice.spec.ts` assert on
selection/readout observables, not on renderer node structure, so "e2e green"
is a meaningful ship criterion rather than a checkpoint), and (2) the
explicit unsupported/interrupted states from `add-renderer-availability-
states`, which this change assumes already exist. Keeping the SVG board
alive as an automatic fallback was considered and rejected — it reintroduces
the dual-maintenance burden the straight swap exists to escape, and a
dormant renderer only helps if someone can flip to it.
