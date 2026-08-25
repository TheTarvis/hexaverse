## Why

`frontend/components/galaxy/` already ships three.js on the home route — the
first screen every player sees — with zero rendering-context failure or loss
handling anywhere in the codebase (verified: no `webglcontextlost` /
`webglcontextrestored` occurrence in any `.ts`/`.tsx` under `frontend/`). That
is a live production gap today, not a hypothetical one. It is also a
prerequisite mitigation for `port-board-to-webgl-renderer`: that port's own
risk section names an explicit unavailability state as one of only two
mitigations of record for removing the board's guaranteed-render fallback (the
straight swap deletes the SVG board), and a mitigation that ships in the same
commit as the risk it mitigates is not a mitigation. This change closes both
gaps first, independently of the port.

A specialist panel review (architect, reliability, UX) additionally found
that the first draft's failure containment had no enforcement mechanism, its
retry affordance had no leak-safety/success/concurrency semantics, its
"degraded, still playable" claim did not hold for the game's Move/Depart/
Travel verbs, and it specified no accessibility or observability behaviour
for a state that can replace content mid-session. This revision closes those
gaps.

## What Changes

- Add `### Requirement: Renderer Unavailability Is an Explicit State` to
  **both** `hex-board-view` and `galaxy-view`: when a rendering context
  cannot be created, the affected canvas region (board or graph) shows an
  explicit unsupported state naming the failure as a browser- or
  graphics-hardware-capability problem (never raw diagnostic text, a stack
  trace, or a GPU vendor/model string) and offers a retry affordance, while
  the surrounding view — `FactsPanel`/fleet roster on the board, the intel
  panel/system inspector on the galaxy view — stays mounted and usable. Any
  error thrown while constructing, listening to, or retrying the rendering
  context is caught by a boundary scoped to the canvas region, not the whole
  route.
- Add `### Requirement: Lost Rendering Context Recovers Without Navigation`
  to **both** capabilities: a runtime context loss shows an interrupted
  state with no uncaught error; a restored context resumes rendering current
  state (never a stale pre-loss frame) without a page navigation; a context
  that never restores keeps the interrupted state and offers a retry
  affordance with defined success, repeat-failure, resource-cleanup, and
  concurrency semantics; a second loss while already interrupted is a no-op
  state change; failures are recorded distinguishably by cause.
- Add `### Requirement: Renderer Unavailability States Are Accessible` to
  **both** capabilities: the state change is announced to assistive
  technology, any retry affordance is keyboard-operable, and focus is not
  silently dropped when the canvas region changes under the player.
- Correct the surrounding-UI claim: the facts panel/inspector's selection
  prompt no longer instructs the player to pick a board/system target when
  no canvas exists to pick one on. Scan, mine, cancel-burn, and cancel-mine
  (board) and fleet-roster selection (galaxy — including the system, its
  inspector, and travel that a roster row already reaches) are specified as
  genuinely usable without the canvas; Move, Depart, and interstellar Travel
  are specified as unreachable as *new* target selections without it (an
  already-active selection, or a roster-selected fleet on the galaxy view,
  still reaches them) — the first draft's "the rest of the view stays
  usable" language overstated this.
- Both new/revised requirements are pure `## ADDED Requirements` in each
  capability — they do not modify `hex-board-view`'s `### Requirement:
  System Board Route and Data Fan-In` or `galaxy-view`'s `### Requirement:
  Loading and Error States`, whose triggers are a data-read failure, not a
  client-capability / GPU event.
- Same requirement names in both capabilities on purpose — the board
  constructs and owns its `THREE.WebGLRenderer` directly, the galaxy view
  reaches `react-force-graph-3d`'s renderer through the library's ref
  accessor; two implementations of the same observable rule, sharing one
  guard module (probe, boundary wrapper, unsupported/interrupted UI, retry
  control, loss/restore state machine) outside `components/board/webgl/`.
- Ships `BoardCanvas` — named to match `port-board-to-webgl-renderer`'s own
  seam, so both changes describe the same artifact — as a standalone,
  stub-canvas-tested component in `frontend/components/board/`, ready for
  the port to mount in place of `HexBoard`. It has no live
  `webglcontextlost`/`webglcontextrestored` wiring to exercise in this
  change (there is no production canvas yet); that becomes live when the
  port lands. The galaxy half is fully live on ship day.

## Impact

- Affected specs: `hex-board-view`, `galaxy-view`
- Affected code: `frontend/components/render-guard/` (new shared guard
  module: probe, boundary wrapper, unsupported/interrupted states, retry
  control, loss/restore state machine), `frontend/components/board/`
  (`BoardCanvas`, standalone/stub-canvas-tested — adopted live by the later
  port), `frontend/components/galaxy/` (`GalaxyGraph`/`GalaxyView` wired live
  to the shared guard via the FG3D ref accessor), `frontend/components/
  error-boundary.tsx` (first production consumer)
- `port-board-to-webgl-renderer` depends on this change — its risk section
  cites the unavailability state defined here as a mitigation of record, and
  its own `BoardCanvas`/`BoardStage`/`BoardOverlay` design assumes this
  change's `BoardCanvas` already exists and already carries the guard.
