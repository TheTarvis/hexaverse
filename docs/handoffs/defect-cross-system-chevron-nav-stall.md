# CLOSED — gate blocker: the chevron's cross-system navigation did not commit within 20s

**Status:** CLOSED 2026-10-03 by `fix-world-time-render-loop` (implementation
`3dc56da`). Closing evidence — that change's task 5.3, its own dedicated run of
the journey spec at `--repeat-each 20`: **20 of 20 repeats passed the
cross-system `waitForURL`** (20 s budget, never raised), **zero `Maximum update
depth` lines** across all 20 console captures (now a hard assertion in the
journey's `afterEach`, not only a grep), 305 s wall, on the warped test stack
(world scale 5, lane 500 ms/unit), stack healthy. The full tier-4 run that
followed passed the same leg again. Before the fix the base rate was 4 of 6
stalled. Record: `fix-world-time-render-loop-journey.md`. **`--repeat-each 20`
was this defect's CLOSING run's repeat count, not a new standing tier-4
default.** To reopen, see that change's design.md "Rollback, post-archive".
The sections below are the 2026-09-19 diagnosis and the 2026-09-09 filing, kept
as the record.
**Found:** 2026-09-09, `add-vitals-strip` archive-gate run 3d.

## 2026-09-19 — reproduced on a fast machine, and what starves the transition

**Gate run 4** (full tier 4, no emulator death, zero `Received SIGTERM`):
**13.8 minutes**, 20 passed / 3 failed. The journey failed at the *same*
`waitForURL` (`vitals-strip-journey.spec.ts:332`). At half the usual wall time,
load cannot be the cause. The other two reds: `refuel-commit.spec.ts:58` (burn
never reads "under way" — the `defect-station-order-500` family) and
`space-double-submit.spec.ts:266` (`defect-spawn-system-single-body`).

**Base rate, journey alone** (`with-test-emulators.sh 'cd frontend && npx
playwright test <spec> --repeat-each 6'`): **4 of 6 stalled at the cross-system
`waitForURL`**, 1 of 6 failed earlier at "burn must be under way", 1 passed. A
single solo run before that passed — so *one green solo run proves nothing*, and
the old "what would make this stale" clause was wrong.

**What the console capture had been saying all along.** The `[journey-console]`
capture logged 31 × React `Maximum update depth exceeded` on the system view —
home system and foreign system alike. A temporary `console.error` stack hook
named the two setters:

- `hooks/use-world-time.ts` — the rAF `tick` calls `setWorldTime` **every
  animation frame**. The hook is called by `SystemSpaceView`, so the *entire*
  view (scene rebuild included) re-renders at default priority ~60×/s.
- `components/space/SpaceStage.tsx:200-204` — an effect keyed on `worldTime`
  calls `setDrawWorldTime(worldTime)`, a second state update inside every one
  of those commits. This is the nested passive update React is warning about.

Both predate this change (`1b6c7c0`, 2026-09-03). The strip did not introduce
the defect; its journey is the first tier-4 walk to do an **in-app
cross-system `router.push`** out of a mounted system view.

**The discriminating experiment.** Same spec, same six repeats, with one
temporary change: the rAF tick stops calling `setWorldTime` from the instant
before the menu-entry click. **6 of 6 passed** (vs 4 of 6 stalling without it).
So the mechanism is: an App Router navigation is a React *transition*; the
per-frame default-priority re-render of the whole view interrupts that
transition's render every ~16 ms, and in dev mode the target route's render
never gets an uninterrupted window before the 20 s budget. The `200 in 546ms`
line from run 3d fits — the payload arrives; the render that would commit it is
what starves. (Both diagnostic edits were reverted; nothing of them is in the
tree.)

**Not established:** whether production builds stall too (dev-mode renders are
several times slower, so prod may merely be janky), and whether the other
`router.push` sites in this view (the departure hand-off to `/`, the roster
row's cross-nav — same `selectFleet`) stall at the same rate. They share the
mechanism by construction; none has been measured.

**What a fix must decide** (none applied — this needs a ruling, and likely its
own `fix-*` change since no backend or spec'd behaviour of the strip is wrong):

1. **Take the clock out of React state for the view.** Keep world time in a ref
   / external store; the canvas reads it in its own rAF draw, and only the
   clock readout and countdown figures subscribe (at ~1 Hz). Removes the
   60 Hz whole-view render entirely. The real fix, and the larger one —
   `scene` is a `useMemo` keyed on `worldTime` today.
2. **Pause the tick while a navigation is pending** — `useTransition` around
   the view's `router.push` calls, `animate: !isPending`. Small, and exactly
   what the experiment proved sufficient; leaves the per-frame render in place
   for every other transition-priority update.
3. Drop the `SpaceStage.tsx:200` nested update (derive `drawWorldTime` during
   render, or stamp it in the draw path). Worth doing under either option; not
   sufficient alone — untested.

**What would make this stale:** the journey green on `--repeat-each 6` (not one
run), with no `Maximum update depth exceeded` line in its `[journey-console]`
capture.

---

## Where

`frontend/e2e/tests/vitals-strip-journey.spec.ts:332`, step 2's final leg: with
the browser on a **foreign** system and the corp's only fleet at **home**, open
the strip's chevron, click the menu entry for the elsewhere fleet, and expect
the app to navigate to that fleet's system.

```
TimeoutError: page.waitForURL: Timeout 20000ms exceeded.
waiting for navigation to "**/systems/sys_9_7" until "load"
  at vitals-strip-journey.spec.ts:332
```

## What IS established

1. **The click reached the callback.** The failure snapshot shows the menu
   closed and the chevron labelled `Switch acting fleet — commanding
   fleet_0d819226-…`. That label is `justSelectedId ?? acting?.id`
   (`VitalsStripFleetCell.tsx:123`) — a **specced transient** that names the
   just-selected fleet before the view resolves it. It is set on selection in
   *either* branch, so it proves the click landed and refutes nothing else.
2. **The app asked the server for the target route.** The dev server, captured
   through the `stdout: 'pipe'` added for this run (RULING 45.2), logged
   `GET /systems/sys_9_7 200 in 546ms` as the last request of the run — i.e.
   `router.push('/systems/${fleet.systemId}')`
   (`SystemSpaceView.tsx:618-630`) issued its App Router fetch and the payload
   was served promptly.
3. **The URL never changed.** The snapshot is still the foreign system's view,
   with the five strip cells correctly in their absent form (`—`) and the
   roster listing the one owned fleet as `Docked`.
4. **The decision path is shared, not new.** The chevron delegates to
   `selectFleet`, the *same* callback the roster row has always used
   (RULING 16); its cross-system branch is covered green at unit level
   (`VitalsStripFleetCell.test.tsx:136`).

## What is NOT established *(2026-09-09 filing — superseded above)*

**Why the transition never committed.** Three candidates, none confirmed, and
this file deliberately stops short of choosing:

- **Load starvation.** The run took **53.1 minutes** against the suite's usual
  ~28 — another project's session was running CPU-load diagnostics throughout
  (RULING 50). An App Router dev-mode transition must render the whole system
  view (WebGL scene plus several React Query reads) before committing the URL;
  on a machine at ~1.9× it can plausibly overrun 20 s. **Two sibling failures
  in the same run have the same "did not get there in 20 s" shape** —
  `new-user.spec.ts:81` (post-spawn navigation) and `scan-journey.spec.ts:307`
  (roster count 0), both appended to `defect-wake-roster-row-flake.md`.
- **A competing push.** `SystemSpaceView.tsx:~605-613` pushes `/` when the
  acting fleet stops being present in the current system. If it fired into the
  same transition, one navigation could cancel the other — though the page
  stayed on the foreign system rather than landing on `/`, which this does not
  explain.
- **A suspended boundary on the target route** that never resolved for reasons
  unrelated to CPU time.

## The one thing that must not happen next

**Do not raise the 20 s budget.** `docs/testing-tiers.md` is explicit that a
timeout is a budget, not a knob, and this link has spent five gate runs
learning that a story consistent with the evidence is not a diagnosis
(RULING 42). A green obtained by widening this wait would prove nothing about
the scenario it guards — *A menu entry names its fleet's system before it
navigates*.

## The cheapest next step, in order *(done 2026-09-19 — see top)*

1. **Re-run the journey alone on a quiet machine** (RULING 57's working
   per-spec invocation, in `fix-mutation-retry-on-4xx-rulings.md` — `npm run
   e2e -- <spec>` silently runs the whole suite). If it passes, the load
   hypothesis stands and the gate closes; the suite's wall time is the control.
2. If it fails again, attach a browser console and watch `router.push`: the
   question is whether the URL commit is slow or never arrives.
