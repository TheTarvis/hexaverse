# Panel brief — `fix-world-time-render-loop`

Written by the orchestrator, 2026-09-19. Input to the Phase-1 specialist panel
and, later, to the adversary. This file states the situation and the author's
own flagged weak points **verbatim**; it is not a findings record.

## What this change is

A **resume**, not a fresh authoring. `openspec/changes/fix-world-time-render-loop/`
was authored today in a single-agent `/opsx:propose` session — not by the team.
It is `openspec validate --strict` clean and `openspec-reconcile.py` clean.
It is **uncommitted** (untracked folder). It has had **no panel review and no
adversary round**, so there is no adversary verdict of any kind on its content.
No implementation exists; every task is unchecked.

Entry mode: **specced brownfield**. `openspec/specs/system-space-view/spec.md`
(2661 lines) already carries the requirement the MODIFIED delta targets
(*Body, Lane-Gate, and Point Selection Is Keyboard-Operable*, line 1267).
`openspec/specs/galaxy-view/spec.md` exists. No baseline retrofit is needed.

Authorization for this run: **Phase 1 only.** No implementation, no code or
test edits, no archive. Reviewers are read-only regardless.

## The source documents (fidelity is checked against these)

| Path | What it is |
| --- | --- |
| `docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md` | The defect record. **Read the `2026-09-19` section first** — it carries the reproduction (4/6 solo repeats stalled), the discriminating experiment (0/6 with the rAF tick's `setState` silenced), the two setter sites, what is explicitly NOT established, and the three fix options. Travis chose option 1: *"Take the clock out of React state for the view."* |
| `openspec/changes/fix-world-time-render-loop/design.md` | The change's own design record. |
| `docs/plans/system-hud/chain.md` | Why this matters: chain link 2a `add-vitals-strip` is built but its archive gate is red on this defect; the chain is stalled behind it. |

## The change's artifacts

- `openspec/changes/fix-world-time-render-loop/proposal.md`
- `openspec/changes/fix-world-time-render-loop/design.md`
- `openspec/changes/fix-world-time-render-loop/tasks.md` (38 lines, 5 groups)
- `openspec/changes/fix-world-time-render-loop/specs/system-space-view/spec.md`
  — one ADDED requirement (*Animation Never Re-Renders the View, and Never
  Starves a Navigation*) and one MODIFIED requirement (*Body, Lane-Gate, and
  Point Selection Is Keyboard-Operable*).

## The code the change is about

- `frontend/hooks/use-world-time.ts` — to be deleted
- `frontend/components/space/SystemSpaceView.tsx` — ~line 425, and every
  `worldTime` / `worldTimeRef` use (author names lines 182, 512, 515, 595)
- `frontend/components/space/SpaceStage.tsx` — the effect at ~200–204,
  `SpaceLayers` mark projection ~527+
- `frontend/components/space/webgl/SpaceWorld.tsx` — the existing rAF `draw()`
  reading `sceneRef`
- `frontend/components/space/space-scene.ts`
- `frontend/components/galaxy/GalaxyView.tsx:182`

## Live specs in scope

`openspec/specs/system-space-view/spec.md` is the change's target. Others the
change's claims reach into, and which reviewers should check rather than
assume: `galaxy-view`, `fleet-roster`, `focused-scan`, `docked-fleet-actions`,
`figure-formatting`, `world-clock`, `space-kinematics`, `mine-extraction`.

Note `world-clock` is the **Go backend** simulation-clock capability
(`WorldClock()`, `NewWorldTime`, `WorldMillis`). Whether the new **frontend**
`frontend/lib/world-clock/` projection belongs to that capability, to
`system-space-view`, or to neither, is an open architectural question nobody
has answered.

## The other in-flight change

`openspec/changes/add-vitals-strip/` is a separate, already-built,
not-yet-archived change. **Do not edit it.** It carries deltas on
`docked-fleet-actions`, `figure-formatting`, `system-console` (a capability
that exists ONLY inside its deltas — there is no `openspec/specs/system-console/`)
and `system-space-view`.

Its `system-space-view` MODIFIED headers are:
*System Space View Route and Data Fan-In*, *Toggle-to-Deselect Single Selection
Among a Body, a Lane Gate, or a Point*, *Space View Camera Is Keyboard-Operable*.

`fix-world-time-render-loop` ADDs *Animation Never Re-Renders the View, and
Never Starves a Navigation* and MODIFIES *Body, Lane-Gate, and Point Selection
Is Keyboard-Operable*. On the header level the two changes do not collide.
Reviewers should still check for **semantic** collision — in particular
`system-console`'s cadence-bearing scenarios (*The countdown advances between
reads*, *The stamp advances between reads*, *A burning fleet's pill counts down
to its served arrival…*) against this change's 1 Hz coarse tick — and say which
change must archive first.

## The author's own flagged weak points — pressure these specifically

Travis wrote the change and flagged these as the parts he least trusts. Quoted
verbatim:

> - The ADDED requirement's scenarios "Frames pass without the view rendering"
>   and "rendered on the order of once per elapsed second" — are they testable
>   as written, and at the right altitude (they name render behaviour of a UI
>   framework)?
> - design.md admits the mechanism for the 20 s stall is not fully explained
>   (React's ~5 s transition-expiry should have rescued it). Is the requirement
>   still sound if the mechanism is only partly understood?
> - The 1 Hz coarse tick delays time-gated state flips (`mineRunning`,
>   ScanControl `settling`, roster command visibility) by up to 1 s. Does that
>   violate any existing requirement in `system-space-view`,
>   `docked-fleet-actions`, `fleet-roster`, `focused-scan`, or `system-console`
>   (the latter only exists inside `add-vitals-strip`'s deltas)?
> - Off-screen reach chips recomputed at coarse cadence vs. *Off-Screen Bodies
>   and Lane Gates Are Reachable by Pointer and Touch*.
> - Picking against the frame loop's marks vs. *Space View Picking Resolves to
>   the Body, Lane Gate, or Point Under the Pointer*.
> - Reduced-motion and lost-context requirements: the design claims no delta is
>   needed. Check that claim against the spec text ("treat every 'X is
>   unaffected' as a hypothesis" is this project's standing lesson).
> - Whether `galaxy-view` really needs no delta.
> - Task sizing against the 40-task cap and whether the pre-identified split
>   seam in design.md is clean.

A weak point being listed here is **not** a finding. If a listed concern turns
out to be unfounded, say so with the evidence — a cleared hypothesis is a
useful result. If it is founded, it is a finding like any other.

## Standing lessons from this repo that bear on this change

From `docs/plans/continous_space/handoffs/README.md`, in full where they apply:

- **Lesson one — built and never called.** Five derivations on this chain were
  built, unit-tested for determinism, and never reached by production code
  (`fleet.GraphSource`, `EnsureLaneHorizon`, `StationContinuousOrbit`,
  `disclosure.ScanMints`, the focused scan's client half). A green suite proves
  the unit correct while nothing in production reaches it. This change creates
  a new module (`frontend/lib/world-clock/`) and a new pure function
  (`projectMarks`) — check that each has a requirement or task that forces a
  production call site, not just a unit test.
- **Lesson two — a green test is not evidence a requirement holds.** Three
  instances on 2026-09-02, including `hooks/use-refuel.test.tsx` asserting a
  double-submit guard against code that had no guard, because the harness
  stepped around the render race that was the whole defect. *"When a requirement
  turns on real timing or real wiring, only a test running against real timing
  or real wiring counts as coverage. And a test that has never been observed to
  fail has not been shown to test anything."* This change's central requirement
  turns on real timing and fake-timer unit tests are its primary proposed
  evidence (design.md Decision 5).
- **Lesson three — consolidation silently discards findings.** Nine architect
  findings were lost to a summary that named them without restating them.
  Return every finding in full, with its evidence quoted.
- **Lesson five — a prohibition should name its cause.** An inherited rule is
  never re-derived by the agent following it.
