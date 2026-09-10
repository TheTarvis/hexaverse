# Gate blocker — the chevron's cross-system navigation did not commit within 20s

**Status:** OPEN, **one occurrence, mechanism not established**. This is the
finding that is blocking `add-vitals-strip`'s archive.
**Found:** 2026-09-09, `add-vitals-strip` archive-gate run 3d — the first run in
five attempts to reach this leg at all.
**Filed as an investigation note, not as a confirmed product defect.** Read the
*What is established* / *What is not* split below before acting on it.

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

## What is NOT established

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

## The cheapest next step, in order

1. **Re-run the journey alone on a quiet machine** (RULING 57's working
   per-spec invocation, in `fix-mutation-retry-on-4xx-rulings.md` — `npm run
   e2e -- <spec>` silently runs the whole suite). If it passes, the load
   hypothesis stands and the gate closes; the suite's wall time is the control.
2. If it fails again, attach a browser console and watch `router.push`: the
   question is whether the URL commit is slow or never arrives.

## What would make this stale

One green run of `vitals-strip-journey.spec.ts` on a machine that is not under
foreign load, with the suite's wall time back near 28 minutes.
