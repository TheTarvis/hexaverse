# `add-figure-formatting` — journey record (archive gate, link 1 of the system-HUD chain)

**Outcome: RED.** Tier 4 (Playwright) ran once, then tier 3 (backend/emulator) ran
once, sequentially, per `docs/testing-tiers.md`. Neither suite is fully green. All
four failures are traced to causes **outside** `add-figure-formatting`'s own diff
(three are pre-existing backend/harness issues unrelated to figure formatting; the
fourth is the identical backend error family recurring in a different test). No
`figure-formatting` scenario or assertion is implicated in any failure — see the
BLOCKED-row closures below, all four of which are CLOSED, PASSING.

Per the "if it goes red" rule this is **one batched report**, not a fix-and-rerun
loop. Nothing here was fixed by this run. Test code was touched only in task 1
(`frontend/lib/format/guards.test.ts`, before the lock — see that section) and in
the review pass over the four e2e files task 2a assigned, which needed no changes.

## IMPORTANT — the tree was not actually exclusively held for this gate

Read this before routing anything below. Sequence, all times UTC:

- **05:08:14** — task 1 complete, tree locked, tier 4 started.
- **05:08:18–05:20:37** — tier 4 ran to completion (12m19s). Clean: `ps`/`lsof`
  confirmed no other Playwright/backend/emulator process touched this repo's
  working tree during this window.
- **05:22:37–05:38:55** — tier 3 ran to completion (16m18s). Also clean by the same
  check at its start; `frontend/playwright/.auth/backend.log`'s own mtime (05:20,
  i.e. before tier 3 even started) and an empty `frontend/test-results` since then
  confirm no second e2e run shared the emulator with it.
- **~05:36 onward, continuing past 05:41 (i.e. after tier 3 had already finished)**
  — while I was compiling this report, `git status` started showing files I did
  not touch changing under me: `docs/plans/continous_space/handoffs/defect-station-order-500.md`
  gained a "Recurrence 2026-09-09" section, a new
  `docs/plans/continous_space/handoffs/defect-post-sale-departure-burn-409s.md`
  appeared, and — most significantly — **`frontend/e2e/helpers/space-view.ts`
  itself, one of the four files this journey owns, was rewritten** (`captureInteriors`
  changed shape from a plain `Map` to an async, poll-based `InteriorCapture`), with
  seven spec files' call sites (`jump-commit`, `refuel-commit`, `scan-journey`,
  `scan-lane-transit-fizzle`, `slice`, `space-double-submit`, `space-journey`)
  updated to `await` it.

  `ps aux` shows a dozen concurrent `claude` CLI processes on this machine across
  many terminal sessions, several active since before this run started. This is a
  parallel session — not an injected instruction, not a process I control — actively
  diagnosing and fixing the exact `captureInteriors` race this run's Finding 3 (below)
  independently surfaced, apparently by reading this run's own `test-results`/
  `backend.log` artifacts off disk after the fact.

  **This did not contaminate the results below** (both suites had already finished
  before the edits materialized, and no second test run touched the shared
  emulator or backend log during either window), so I did not re-run anything and
  the findings below stand as captured. But the premise I was given —
  "nothing else is editing the tree; you are the only writer from here" — did not
  hold, and by the time this report is read, `frontend/e2e/helpers/space-view.ts`
  and six of its callers are **mid-edit by someone else, not reviewed by this
  SDET, and not validated here.** I have not touched, reverted, or built on top of
  that in-flight edit. Before routing Finding 3 to anyone, or before the "runs once
  more" rerun this batch earns, confirm with whichever session is making that edit
  that it is finished and reviewed, so the two efforts don't collide.

## Suite budget

| Tier | Command (docs/testing-tiers.md) | Wall time | Result |
| --- | --- | --- | --- |
| 4 | `cd frontend && npm run e2e` | 12m19s (05:08:18–05:20:37 UTC) | 19 passed / 3 failed / 22 total |
| 3 | `npm run test:backend:all` | 16m18s (05:22:37–05:38:55 UTC) | 1874 passed / 1 skipped / 1 failed / 1875 total |

Neither run hit its timeout budget (tier 4 has no fixed suite budget beyond
per-test timeouts; tier 3's 90m budget was nowhere close to exhausted at 16m18s —
the printed `DONE ... in 973.535s` confirms a clean exit, not a timeout kill).

## The four BLOCKED rows — all CLOSED

1. **`e2e/helpers/space-view.ts`'s rewritten `digits()`/`holdKindTons()` behaving
   correctly against a live stack — CLOSED.** Exercised extensively and correctly:
   `space-journey.spec.ts`'s full run (below) calls `digits()` four times
   (`balance-value` twice, `hold-fuel` twice) and passed end to end; `slice.spec.ts`
   calls `holdKindTons()` seven times across two mining legs, both of which
   completed successfully before that spec's unrelated failure at its departure-burn
   step (Finding 2). Neither function's code changed in this run, and neither is
   implicated in any failure.
2. **`space-journey.spec.ts`'s local `digits()` copy deleted, shared helper used —
   CLOSED.** Confirmed statically (no local `function digits`/`const digits`
   declaration in the file; `grep` across `frontend/e2e/` finds exactly one
   definition, in the helper) and at runtime: `space-journey.spec.ts`'s full journey
   (`spawn -> see the system -> burn -> dock -> mine -> sell -> refuel -> gate ->
   jump`) **passed in 1.6m**, exercising the imported `digits` throughout.
3. **`scan-lane-transit-fizzle.spec.ts`'s `data-raw <= 0` assertion replacing the
   literal `'now'` — CLOSED.** Confirmed statically (the assertion at line ~235-245
   polls `Number(await page.getByTestId('fleet-row-eta-...').getAttribute('data-raw'))`
   with `.toBeLessThanOrEqual(0)`, no string-copy assertion anywhere in the file) and
   at runtime: the spec **passed in 3.3m**, including that exact poll settling to
   zero and the forced-settlement read that follows it.
4. **Task 12.1's per-figure `data-raw`/`data-unit` assertions in the burn-preview
   walk — CLOSED.** Confirmed statically in `space-journey.spec.ts` (four figures —
   `preview-arrival`, `preview-deltav`, `preview-fuel`, `preview-fuel-ceiling` — each
   asserted for both `data-unit` and a numeric `data-raw`) and at runtime: that
   spec's full pass above exercised every one of those eight assertions
   successfully.

## Task 2a — ownership review of the four e2e files (before the run)

Reviewed `e2e/helpers/space-view.ts`, `e2e/tests/slice.spec.ts`,
`e2e/tests/space-journey.spec.ts`, `e2e/tests/scan-lane-transit-fizzle.spec.ts` as
their owner. Findings: none needed a fix.

- `digits()`/`holdKindTons()` read `data-raw` correctly: the "own element" case
  (`hold-fuel`, `balance-value` — `<Figure data-testid="...">` puts `data-raw` on the
  same span) and the "one nested figure" case (`hold-{kind}` wraps exactly one
  `hold-{kind}-tons` Figure; `hold-capacity` deliberately wraps two and `digits()`
  throws rather than guessing, matching its own doc comment) were both verified
  against the actual component markup (`FleetActionsPanel.tsx:376-419`).
- `space-journey.spec.ts` carries no stale local `digits()` — confirmed by grep,
  only the imported helper is used.
- `scan-lane-transit-fizzle.spec.ts`'s `data-raw <= 0` wait cannot hang to the full
  900s the literal `'now'` copy assertion could: `roster-status.ts`'s
  `remainingMs: Math.max(0, fleet.jump.arriveMs - worldTime)` is floored at zero and
  stays rendered (not cleared) until the fleet's `jump` field is cleared server-side,
  so the poll deterministically reaches and holds at `0` — verified by reading
  `roster-status.ts` directly, then confirmed at runtime (spec passed).
- The burn-preview walk in `space-journey.spec.ts` asserts one `data-raw`/`data-unit`
  pair per figure (four figures, eight assertions) — see BLOCKED row 4 above.

No production code was touched in this review; no defects requiring a fix were found
in these four files themselves.

## Findings (batched, one round)

**FINDING 1 — product, backend, not owned by this change.**
`e2e/tests/scan-journey.spec.ts:307`, "the burn to the home station leg still docks
normally": `burnToSelectionAndDock` waited 30s for `/under way/i` on the fleet row
and it never arrived (`On station` the whole window). This is `scan-journey.spec.ts`
— not one of the four files task 2a assigned — and it is unmodified by
`add-figure-formatting`. Both `POST /v1/fleets/:id/orders/preview` and
`POST /v1/fleets/:id/orders` returned 500 with `space: endpoint at or inside the
star-clearance radius`, per `frontend/playwright/.auth/backend.log`. A pre-existing
defect doc (`docs/plans/continous_space/handoffs/defect-station-order-500.md`,
originally filed 2026-09-02) already covers this error family and has since gained
a "Recurrence 2026-09-09" entry (written by the concurrent session described above,
not by me) diagnosing it as orbit-phase-dependent clearance geometry — intermittent
by nature, so a green rerun would not mean it's fixed. Route to backend/developer.

**FINDING 2 — product, backend, in an OWNED file.**
`e2e/tests/slice.spec.ts:80`, step 8 ("fly to a gate → jump"): the departure burn to
the lane gate never showed `/under way/i` within 30s (stayed `Docked`). Traced this
myself, directly against `frontend/playwright/.auth/backend.log` for fleet
`fleet_dab3894e-...`: the sale settled at `01:16:21` (200), then
`POST /v1/fleets/.../orders` for the gate burn was rejected **409 twice**, at
`01:16:40` and `01:16:41`. The request was well-formed (three earlier orders on the
same code path succeeded in this same run) and `burnToSelectionAndDock`'s own
arrangement is correct (verified — this is not a "burn too short to observe under
way" race like the ones adjudicated elsewhere in this suite; the server actively
refused the order). This is a genuine server-side rejection of a legitimate order,
not a test defect. A write-up now exists at
`docs/plans/continous_space/handoffs/defect-post-sale-departure-burn-409s.md`
(authored by the concurrent session, not by me — I have not verified its root-cause
hypothesis). Route to backend/developer.

**FINDING 3 — test-harness race, in the shared helper (owned), already being
fixed by someone else.**
`e2e/tests/space-double-submit.spec.ts:252`: `no interior read for sys_-8_-7 was
captured off the wire`. `captureInteriors`'s `page.on('response', async (res) => {
await res.json() ... })` populates its `Map` from a detached, un-awaited promise;
a caller's later synchronous `.get(id)` can race past it even when the response was
genuinely served. This is a real defect in `frontend/e2e/helpers/space-view.ts`
(one of the four owned files) — not one task 2a's static review caught, since it
only manifests under real network timing. As documented above, a fix is **already
in progress in the working tree**, authored by a concurrent session, not by me:
`captureInteriors` now returns an async, polling `InteriorCapture.get()` that
distinguishes "never served" from "served, still parsing," with seven call sites
updated to `await` it. I have not reviewed or validated that fix. Recommend: confirm
with the other session it is finished, then let this SDET review it properly before
the rerun (it touches all four owned-file callers), rather than treating it as done.

**FINDING 4 — same defect family as Finding 1, hit by tier 3.**
`TestDiscardRefund_Scenario_RetargetingMidBurnRefundsTheDiscardedBurnsUnspentFuel`
(package `.`, `fuel_discard_refund_e2e_test.go:126`): `POST /v1/fleets/:id/orders`
returned 500 with the identical error, `space: endpoint at or inside the
star-clearance radius`. This is very likely the same open defect as Finding 1, hit
a third time (`defect-station-order-500.md`'s own escalation note already reads
"three have been found by accident, one per link — sweep every `space` sentinel
reaching `respond`"). Route to backend/developer as the same defect, not a new one.

No finding indicates a misread spec or a test that encodes the wrong THEN; nothing
here calls for a test change from this SDET.

## Manifest note

The red manifest for this change is now **generation 3**: generation 1 was the
original red handoff; generation 2 recorded the adjudicated test-dispute repairs
(the pointer-selection/pick-far-target hardening in `space-journey.spec.ts` and
`scan-lane-transit-fizzle.spec.ts`, per those files' own inline history) plus a
lint-directive fix; generation 3 is task 1's line-anchoring of
`KNOWN_TOFIXED_EXCEPTIONS` in `frontend/lib/format/guards.test.ts` (recorded this
session — see the task-1 report). Each hop's cause is recorded at its own commit /
in the coverage handoff; none was "the code is red."

---

# The sanctioned rerun (run 2) — the gate closes

One batched revision round, then one rerun of each tier, per
`docs/testing-tiers.md` and the team workflow's journey rule. No timeout was
raised; no leg was fixed and rerun on its own.

## The batched round contained exactly one fix

`captureInteriors` in `frontend/e2e/helpers/space-view.ts` (plus its six spec
callers). The helper reported "never captured" for an interior read the server
**had** served — `GET /v1/systems/sys_-8_-7` returned 200 in 71.6 ms — because its
detached `page.on('response', async … await res.json() …)` had not resolved when a
synchronous `interiors.get(homeId)` ran 2.8 s into the test. It could not
distinguish *never served* from *served, not yet parsed*.

The other three findings were **not** fixed here, deliberately: they are
pre-existing backend defects, and this change touches **zero backend files**
(verified: `git diff --stat a832029 HEAD -- backend/` is empty, and the working
tree has no backend changes). Fixing them here would violate both the chain's
no-backend-work rule and the spec-first invariant.

## Results

| Tier | Run 1 | Rerun | Budget |
| --- | --- | --- | --- |
| 4 — Playwright | 19 passed, **3 failed** | **22 passed, 0 failed** | 12.2m → **11.0m** |
| 3 — backend emulator | 1875 tests, 1 skipped, **1 failed** | 1875 tests, 1 skipped, **2 failed** | 973s → **972s** |

All three tier-4 failures cleared, and each cleared in a way consistent with its
diagnosis rather than by luck:

- `scan-journey.spec.ts:307` — passed in 22.6s. Confirms `defect-station-order-500`'s
  own analysis (arrival-phase intermittent) over the in-run diagnosis, which had
  reasoned it looked deterministic from spawn-adjacency. The older analysis was right.
- `slice.spec.ts:80` — passed in 1.8m. The post-sale 409 was timing-dependent, as
  `defect-post-sale-departure-burn-409s.md`'s correction predicted. **A green rerun
  does not mean it is fixed.**
- `space-double-submit.spec.ts:242` — passed in **52.6s**, having failed at 2.8s. That
  delta is the `captureInteriors` fix working: it now waits for the body instead of
  racing past it.

## Suite budget line

- **Tier 4: 11.0m** (run 1: 12.2m).
- **Tier 3: 972s / 16.2m** (run 1: 973s).

**Tier 3 is ~5× faster than the 5118s (85m) recorded in
`add-scan-and-sightings-surface-journey.md`** (link 8b), which flagged the budget line
as "worth watching at link 9" — the implicit worry being that per-test provisioning
growth would eventually force a third raise of the 90m budget. It has not: link 9's
own journey record (`link9-journey.md`) already brought tier 3 down to 1007.5s, and
this run holds at 972s, comfortably inside budget with no raise anywhere in this
chain. Recording the improvement because the prior record is the one that flagged the
regression risk.

## The four BLOCKED rows from QA's matrix — all CLOSED

1. **Rewritten `digits()` / `holdKindTons()` against a live stack** — CLOSED.
   `space-journey.spec.ts` and `slice.spec.ts` exercise both; `holdKindTons()` is
   called seven times across the mining legs.
2. **`space-journey.spec.ts`'s deleted local `digits()` copy** — CLOSED. The spec
   passes in full using the shared helper (1.3m in the rerun).
3. **`scan-lane-transit-fizzle.spec.ts`'s `data-raw <= 0` replacing the literal
   `'now'`** — CLOSED, passing in 2.2m. It no longer risks burning its full 900s
   budget on a copy change, which is what the literal-string assertion could do.
4. **Task 12.1's per-figure `data-raw`/`data-unit` assertions in the burn-preview
   walk** — CLOSED. `space-journey.spec.ts:83` — this change's own journey — passed
   in **both** runs, exercising all eight assertions.

## Known-defect residue — the gate's remaining red, named

Both tier-3 rerun failures are the **same already-filed, open defect**,
`defect-station-order-500.md` (found 2026-09-02, unrelated to this change):

```
fuel_stranding_and_range_e2e_test.go:239   order to home station: status = 500
fuel_spawn_starting_fuel_e2e_test.go:236   default order to home station rejected (status = 500)
```

Three occurrences across two runs, each in a different fuel test, always on the burn
to the home station — matching that defect's arrival-phase intermittency and no
per-test cause. Neither is attributable to `add-figure-formatting`.

A **new finding** was recorded against that defect this run: `fuel_spawn_starting_
fuel_e2e_test.go:249` converts the 500 into a conclusion about *fuel economy*
("could not afford … retune `FuelParams.StartingFuelTons`"). That is a
misattribution capable of consuming a balance-tuning cycle on a geometry bug. See
the defect file.

The second backend defect, `defect-post-sale-departure-burn-409s.md`, did not recur —
which, being timing-dependent, is not evidence it is fixed.

## Manifest generation

The red manifest is **generation 3**, two documented hops from the original red
baseline, each with a recorded cause: (1) the three adjudicated dispute repairs
(fixture `scale`, four out-of-scope test files, the strengthened split-fill sell
assertion), (2) the orphaned-eslint-directive fix, (3) the guard-exception
line-anchoring. `verify` reports all 20 files unchanged against generation 3. Recorded
plainly because this chain previously lost a true red baseline by re-recording
without saying so.

## Verdict

**GATE PASSED.** Tier 4 green 22/22. Tier 3's residue is entirely one pre-existing,
filed, open backend defect against a change that touches no backend file. Proceeding
to reconcile and archive.
