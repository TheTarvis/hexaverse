## Why

The system space view keeps world time in React state and sets it on every
animation frame (`hooks/use-world-time.ts`), so the whole view — scene rebuild
included — re-renders ~60×/s at default priority, and `SpaceStage.tsx:200`
sets state again inside each of those commits. An App Router navigation is a
React *transition*; that per-frame render interrupts it every ~16 ms and, in
the dev and e2e stacks, the target route never commits. This is the confirmed
cause of `add-vitals-strip`'s archive-gate red — the chevron's cross-system
navigation stalled in 4 of 6 solo repeats and in 0 of 6 with the tick silenced
(`docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md`)
— and it stalls the `system-hud` chain behind link 2a. The code predates 2a
(`1b6c7c0`); 2a's journey is merely the first to navigate in-app out of a
mounted system view.

## What Changes

- World time leaves React state. A **world clock object** (anchor + served
  scale, `now()` projected on demand) replaces the `useWorldTime` hook's
  per-frame `setState`. Nothing in React re-renders because a frame passed.
- The picture is driven from a **dedicated transform-writing loop**,
  extracted alongside the existing WebGL draw loop
  (`webgl/SpaceWorld.tsx`'s `requestAnimationFrame`) rather than folded into
  it — decided (design.md Decision 3; Travis's ruling on OQ3, option B).
  Option A, running the position writes inside `draw()` itself, is rejected:
  it needs the shared `vitest.setup.ts` WebGL fake extended before it can run
  under any `SpaceStage` or `SystemSpaceView` test — `draw()` already
  executes under jsdom in one place today, `webgl/SpaceWorld.draw.test.tsx`,
  but only via its own per-file `getContext` spy and a `three` double, never
  the shared fake — and extending the shared fake changes the branch most
  existing `SpaceStage` tests currently assert. Each frame the transform loop
  evaluates the scene at `clock.now()` and positions the DOM hit targets
  imperatively — as a single writer per element, replacing today's
  `left`/`top` React writes and the `-9999px` off-screen sentinel with one
  `style.transform`. The transform loop is gated on `available` the same way
  `draw()` is, but not on the renderer constructing, so a GL-refusing driver
  still gets positioned hit targets and off-screen chips. Continuous
  rendering (*Own-Fleet Position, Burn Curve, and Arrival Ghost Render
  Continuously*) is unchanged as observed behaviour.
- The view's reduced-motion behaviour, previously unmet
  (`SystemSpaceView.tsx:438` hardcodes `reducedMotion: false`; nothing reads
  `prefers-reduced-motion`), is fixed in this change — folded in per
  Travis's ruling on OQ1, reversing the panel's recorded lean. `Space View
  Respects Reduced-Motion Preference` (`system-space-view/spec.md:1323-1337`)
  is already fully specified with its scenario; nothing about the
  requirement changes, so this is tasks-only, no spec delta. A live
  `prefers-reduced-motion` read, tracked via the media query's `change`
  listener (the requirement's "WHILE" is a live condition, not a mount-only
  check), replaces the literal where it threads into the scene inputs.
- Figures that count in time — the strip's pill and clock, the command panel's
  arrivals, the scan window, the roster's ETAs and gates — read a **coarse
  tick** (once per wall second), which is the finest resolution any of them
  formats to.
- `SpaceStage`'s `setDrawWorldTime` effect stops being keyed on a per-frame
  value: the state, the effect and its `if (!available) return` guard all
  stay, React-written, now keyed on the coarse tick (design.md Decision 6) —
  so the nested per-commit update disappears without the draw stamp losing
  its availability gate.
- `hooks/use-world-time.ts` is **deleted**, not kept beside its replacement.
  `GalaxyView` — its only other caller, whose sole consumer is the roster —
  moves to the coarse tick in the same change; it has the same
  `router.push`-under-a-per-frame-render shape and gets its own ADDED
  requirement (below).
- No backend change, no wire change, no new figure, no copy change.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `system-space-view`: ADDED *Animation Never Re-Renders the View, and Never
  Starves a Navigation* — the invariant this defect violated, stated so it can
  be tested, including the coarse/fine positioning split's own bound and a
  visibility qualifier. MODIFIED *Body, Lane-Gate, and Point Selection Is
  Keyboard-Operable* — its focus-retention clause names "the view's per-frame
  world-time update re-renders", a mechanism this change removes; the clause is
  restated against animation frames, scenarios verbatim.
- `galaxy-view`: ADDED *Animation Never Re-Renders the Galaxy View, and Never
  Starves a Navigation*. No existing requirement of it names a clock or a
  cadence, and no figure it presents changes — but `GalaxyView` is rewired by
  this change, its `router.push` sites share the starved-transition mechanism by
  construction, and without a requirement of its own nothing obliges the rewire
  to have happened or to have used the new clock. Five derivations on this chain
  were built and never reached by production code; a requirement is what makes
  the call site load-bearing.

## Impact

- **Deleted:** `frontend/hooks/use-world-time.ts` (+ test).
- **New:** `frontend/lib/client-clock/` (pure clock + coarse-tick hook),
  tests — not `frontend/lib/world-clock/`: that name belongs to the
  Go-sole-authority `world-clock` capability, and this module is a projection
  of a served reading, never a second authority (design.md Decision 1);
  `frontend/components/space/space-transform-loop.ts` (the extracted
  transform loop, design.md Decision 3 — decided, option B), tests — mounted
  from `SpaceStage`, not from the dynamically imported `webgl/SpaceWorld`
  module, which is what keeps it observable directly under jsdom;
  `frontend/hooks/use-reduced-motion.ts` (task 3.8's live
  `prefers-reduced-motion` read), tests.
- **Rewired:** `components/space/SystemSpaceView.tsx` (clock object, coarse
  tick to panels, scene inputs handed to the stage by ref, `ScanSweepWatcher`'s
  `worldTimeRef` prop updated as its own boundary change, and the
  `reducedMotion: false` literal replaced with a live `prefers-reduced-motion`
  read — OQ1, folded in),
  `components/space/SpaceStage.tsx` (mounts the new transform loop module,
  per-frame mark positioning as a single writer per element, draw stamp
  stays React-written on the coarse tick, nested effect removed, the
  point-pick basis published by the loop),
  `components/space/webgl/SpaceWorld.tsx` (loses the per-frame `scene`
  prop; the draw loop stays GL-only, drawing from the `SceneModel` the
  transform loop publishes by ref — decided by design.md Decision 3/OQ3,
  option B),
  `components/galaxy/GalaxyView.tsx` (clock object; the served scale is also
  threaded through here, closing
  `defect-galaxy-view-clock-ignores-served-scale.md` in the same call —
  OQ4, decided; see design.md Open Questions),
  `frontend/lib/services/fleet-service.ts` (its fleet-list call drops the
  envelope's `scale` today — `response.data.fleets ?? []` — which is the only
  reason the galaxy view cannot see a served scale; task 3.4).
- **Spec:** new `specs/galaxy-view/spec.md` delta — ADDED *Animation Never
  Re-Renders the Galaxy View, and Never Starves a Navigation*, covering the
  same starvation shape `GalaxyView`'s own rewire (task 3.4) shares by
  construction with `SystemSpaceView`'s.
- **Tests:** `SpaceStage.test.tsx` and `SpaceStage.renderer.test.tsx` assert
  `data-draw-world-time`; `data-world-time` has no assertion today, so the
  coarse value needs a new one (task 3.3). `GalaxyView.test.tsx` mocks the new
  clock module and gains a render-count test (task 3.4a).
- **Also corrects a pre-existing defect** the split would otherwise entrench:
  point picks after a window resize currently unproject through a stale basis
  (`SpaceStage.tsx:172-176`, `[host]`-keyed and never updated on resize) —
  fixed as a side effect of Decision 7's single published basis (task 4.8).
- **Also fixes, tasks-only, no spec delta:** the reduced-motion drift
  (`drift-reduced-motion-never-detected.md`) — folded into this change per
  Travis's ruling on OQ1. `Space View Respects Reduced-Motion Preference` is
  already fully specified and already carries its scenario
  (`system-space-view/spec.md:1323-1337`); the code simply never satisfies
  it. Tasks 2.5 and 3.8 add a live `matchMedia('(prefers-reduced-motion:
  reduce)')` read with a `change` listener, threaded where the
  `reducedMotion: false` literal is today.
- **Gate:** unblocks `add-vitals-strip`'s archive — in that order, per
  design.md's Migration Plan. This change's own tier-4 closing evidence is a
  dedicated run of the journey spec at `--repeat-each 20` (tasks.md 5.3);
  `add-vitals-strip`'s archive gate is a separate, later invocation of the
  full suite (tasks.md 5.4) — the two are not the same process execution.
- **Unmeasured, stated:** whether production builds ever stalled (dev renders
  are several times slower), and whether the view's other two pushes (the
  departure hand-off, the roster row) stalled at the same rate — they share the
  mechanism by construction.
