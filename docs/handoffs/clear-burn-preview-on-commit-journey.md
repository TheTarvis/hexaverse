# clear-burn-preview-on-commit — archive-gate journey record

Written from the logs on disk. The first SDET delegate abandoned the tier 4 run without a record; this SDET diagnosed it from the log and artifacts and ran tier 3.

## Outcome

- **Tier 4: RED, 26 passed / 1 failed (6.8 min).** The one red is this change's own journey, and it fails at step 0 on a FIXTURE PRECONDITION assertion. No product behaviour was exercised. The journey proved nothing about the change.
- **Tier 3: COULD NOT BE EVALUATED.** The run overlapped another tier 3 run on the same emulator project. The six reds are an environment event, not a result.
- The gate is not green and not evaluable. The orchestrator decides the next step. No rerun was made.

## Environment

- Tier 4 started about 13:43 EDT 2026-10-04 with load 3.39 and finished 13:50:41 with load 15.71 (other projects' dev stacks and a storybook are running here). The log has no `Received SIGTERM`. The emulators were started by the run (`with-test-emulators.sh`, "starting a throwaway set") and shut down normally at exit. The failure is deterministic arithmetic, not a timeout, so load is not implicated.
- Tier 3: load was 10.0 at 13:51. The run waited on a poll loop (`t3.loadpoll`) and started at about 13:54:00 with load 3.85, under the < 4 rule.
- Tier 3 command, from docs/testing-tiers.md: `npm run test:backend:all`. Its wrapper reuses a complete emulator set if one is running, otherwise it starts one. Ports 20241/20242/20244 were free at start. Other checkouts' emulators (chartz, volt-preview) use other ports and were not touched.
- **Tier 3 overlap.**
  - My run: `npm run test:backend:all` started about 13:54:00 as the emulators:exec owner (its go test ran 1040.3 s per gotestsum `DONE`) and exited 1 at 14:11:31.
  - A second run started at 13:55:21: `npm run test:backend:all`, pid 24831, go test pid 24865, test binary 24884 started 13:55:27. It "reused the complete test set already running", i.e. mine. It was started by another session and was still running at 14:12–14:13 (etime ~17 min).
  - The overlap window is 13:55:21 to 14:11:31, which is essentially my whole run after its first minute.
  - Both runs redirect to the same scratchpad `t3.log` and `t3.start`. The second run truncated the file at 13:55. `t3.start` (13:55:21) and `t3.log` mtime were last written by it or interleaved, and the log contains NUL padding. `t3.starttime` (13:53:59) is mine. The log is therefore a mixed record. Its `DONE 1875 tests, 1 skipped, 6 failures in 1040.342s` matches my start time, not the 13:55:21 start. Its tail (`Shutting down emulators`) is the owner's, which is mine. The orchestrator's attribution (t3.start = mine) looks reversed. The evidence above disagrees with it.
  - **Side effect I did not intend:** when my emulators:exec exited at 14:11:31 it shut the emulators down under the still-running second run. Ports 20241/20242/20244 are now empty. I killed nothing.
- `git diff 987ba60 -- backend` is empty (confirmed).
- Foreign and uncommitted files: the same 6 entries before and after tier 3, with identical mtimes (verified by diff). They are three docs/handoffs records and docs/plans/system-hud/chain.md (13:38:16), openspec/changes/clear-burn-preview-on-commit/tasks.md (13:41:43) and the committed-selection-journey.spec.ts (13:41:18). This record and the scratchpad are mine.

## Tier 4 — command `cd frontend && npm run e2e` (docs/testing-tiers.md tier 4)

Result: 26 passed, 1 failed, 6.8 min.

### The red

`e2e/tests/committed-selection-journey.spec.ts:343` (assertion at line 408), verbatim:

```
Error: FIXTURE PRECONDITION: the longest flight in home sys_-3_0 is 4359 wall ms at scale 5, shorter than the 50000 ms the mid-burn legs need (two preview intervals + the re-select and cut legs). Not a committed-selection finding; the spawn drew a system too compact for this walk.
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 50000
Received:    4358.6
```

Evidence:
- Step 0 quoted six candidates, all with `flightWorldMs` of 19005–21793 world ms: belt-0 19005, belt-1 21793, body-0 19096, body-1 19575, body-2 19563, body-3 20301.
- The longest (belt-1) is 21793 / 5 = 4358.6 wall ms. Every candidate is within about 15% of the others, so this is not a bad draw of one body. It is the scale of a home system's flights.
- The test needs 50 s wall, which is about 250,000 world ms, roughly 11.5 times the longest flight available.
- Failure was at 4.9 s into the test. The error context shows the page sitting on the system view with feat-body-3 selected, so nothing was committed.
- No SIGTERM and no backend death. The failure is deterministic and load cannot cause it.

**Diagnosis: fixture precondition, which in effect is a test-side design error.** The 50 s minimum (`MIN_FLIGHT_WALL_MS`, with `PREVIEW_INTERVAL_MS` 10 s) is unreachable in a spawn home system at `WORLD_TIME_SCALE=5`. The spec header assumes a "warped" stack that shortens flights, but home flights are about 20 s of world time. A different spawn would need a flight of at least 250 s of world time, and none of the six candidates comes close. A rerun with the same fixture will fail the same way. It is not a product defect and not a spec gap. The spec needs a revision, for example a lower scale for this spec, a longer-flight setup arranged through the API, or restructuring the mid-burn legs so they fit inside ~4 s of flight. The orchestrator and the revision round decide which.

### Journey leg by leg

| Leg | Status |
|---|---|
| Wake corp, capture interiors, quote each candidate (step 0, six quotes, status 200) | passed |
| Fixture precondition: longest flight >= 50 s wall | **FAILED** |
| Step 1 onward: select the committed target, quote figures and units, no committed statement before commit | UNTESTED |
| Commit, committed statement, hold across the first own-fleets read, zero-preview window | UNTESTED |
| Keyboard focus (scenario 21) | UNTESTED |
| Release, re-commit, arrive | UNTESTED |
| Logged-not-asserted: `commit-drift-notice` after a real commit | UNTESTED (not logged) |
| Console capture for this test | not printed (failure precedes it) |

Consequences:
- No real-wire evidence exists for keyboard focus (scenario 21), the hold across the first own-fleets read (burn-instants equality on the real wire), the zero-preview window, or `commit-drift-notice`.
- The QA BLOCKED rows are still OPEN: scenario #21 and the wire-instants requirement clause. The qa-index (lines 77–85, verdict line 38) says both are "closed by the journey assertions", and none of those assertions ran.

### Watched assertions

- `commit-stranding-notice-journey.spec.ts:141` passed (test 3, "a burn to the home station omits the stranding field ... cutting the drive"). Its assertions around lines 195–225 (no warning toast, no notice, Burn still enabled after cut) are in that test.
- `space-double-submit.spec.ts` passed: burn order, mine run, sale, refuel and jump scenarios (tests 20–24).
- The other 24 tests also passed. The only console entries are expected 404/500s from other specs (sys_-12_-3 and sys_-12_-4) and the `/login?signUp=true` 404s.

## Tier 3 — command `npm run test:backend:all` (tier 3)

Result as printed: `DONE 1875 tests, 1 skipped, 6 failures in 1040.3s` (wall 13:54:00 to 14:11:31, about 17.5 min). **This is not a valid result because of the overlap.**

The 6 failures are all in the root package `.` (16m15s):

| Test | Evidence |
|---|---|
| TestRefuel_Scenario_AReusedKeyNamingDifferentParametersIsRejectedAsAConflict | POST /v1/corporations 500, backend `error: no live galaxy`, 13:55:27 |
| TestRefuel_Scenario_TwoDifferentRejectionsCarryDifferentReasons | same, 13:55:27 |
| TestRefuel_Scenario_ASettledRefuelsResponseCarriesNoAction | same |
| TestRefuel_Scenario_AFleetWithARunningScanCanStillRefuel | same |
| TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel | same |
| TestSpawn_Scenario_CorpWithHullFogStationBalanceButNoStartingFuelGrantGetsItOnRetry | same (per FAIL line) |

- All six fail between 13:55:25 and 13:55:27, within seconds of the second run's go test and test binary starting (13:55:22 and 13:55:27). The error is the seeded live galaxy being missing. That matches the root package's TestMain wipe and re-seed hitting the shared `hexaverse-emulator` project. It is **overlap-attributable and an environment event, not a result**. The package-level pass of 18 other packages is also overlap-tainted.
- None matches the filed residue `defect-station-order-500-index.md` (zero hits for the sentinel `endpoint at or inside the star-clearance radius`, and these are POST /v1/corporations 500s). The residue is therefore not seen in this run.
- A green under overlap would not have been valid evidence either, since a wipe could mask or fabricate failures. This run is not green.
- Not rerun, per the orchestrator's instruction.

## Batched findings for the revision round

1. **Test-side (blocking):** `committed-selection-journey.spec.ts` `MIN_FLIGHT_WALL_MS` = 50 s is unreachable. Home flights are about 20 s of world time, which is 3.8–4.4 s wall at scale 5. Redesign the fixture or the leg timings. The step 0 comment about the warp shortening flights does not make the walk feasible.
2. **Test-side (weak):** the precondition assertion runs only after six quote selections, and the quote counts as no evidence. The check could run earlier or the spec could arrange a long flight through the API, a precondition a human cannot arrange through the UI.
3. **Test-side (weak):** the `[journey-step0]` loop swallows missed answers with `.catch(() => console.log(...))` and `.catch(() => undefined)`. A candidate that misses its quote silently drops out. The precondition failure then reads as "too compact" when it could mean "quotes dropped".
4. **Process:** the tier 4 and tier 3 gate protocol let two sessions share `t3.log` and `t3.start` and run the same tier concurrently on one emulator project. The orchestrator should serialise delegates and use distinct log names.
5. **Process:** the qa-index claims the BLOCKED rows are closed. They are open until a green journey.
6. **Product:** no product defect has been found. The journey did not reach any product behaviour.

## Suite budget line

Tier 4: 6.8 min (under load 15.7 at the end). Tier 3: about 17.5 min wall (1040 s per gotestsum) under overlap, invalid, against the 90 m budget. The `-timeout` was not hit.

## Batched revision round (2026-10-04)

Test-side only, per RULING 17. One file changed: `frontend/e2e/tests/committed-selection-journey.spec.ts`. Nothing was run (no Playwright, no tier 3 or 4, no stack); `tsc --noEmit` and `eslint` on the spec are clean. No helper and no other spec was touched. The `[journey-console]` capture and the hard update-depth `afterEach` are kept. `commit-drift-notice` and `commit-stranding-notice` are still logged, not asserted, after each real commit and after the cut.

### Findings and what changed

1. **50 s precondition unreachable (blocking).** `MIN_FLIGHT_WALL_MS` is deleted. The spec no longer needs a long flight. It quotes first, then decides which legs the flight can hold. The one remaining precondition is `MIN_HOLD_FLIGHT_WALL_MS = 2000`: the longest quoted flight must hold the statement, one own-fleets read and a snapshot after it. It is checked right after step 0, before anything is committed. Targets now include every non-star feature (bodies, moons, belts, station) and every served lane gate (`laneGates[].id`), up to 24. The longest quoted flight is the committed target and the shortest other is "another target". Gate flights run to the rim and may well be longer than the home bodies' 19-22 s of world time. That is untested, and the code takes whichever is longest.
2. **Precondition checked late.** It now runs straight after the quote loop, before the first select-for-commit. It is expressed as a leg budget and not as a failure of "too compact".
3. **Missed quotes swallowed.** The `.catch(() => undefined)` calls are gone. Each target ends as quoted, `NOT SELECTABLE`, `MISSED QUOTE` (selected, no answer within 8 s) or `answered HTTP n with no flight`, each logged and collected. Zero quotes fails with "quotes never answered, NOT 'system too compact'" and lists the misses.
4. and 5. Process findings, not the spec's business. Nothing changed.
6. No product defect was found in round 1, so none is addressed.

### The new walk, in order

Commit 1 (Enter on a focused Burn) runs, back to back and inside the flight: keyboard-focus (focus is not the statement, Tab lands in the command column and not on `<body>`; made invalid, and logged UNTESTED, if Burn is already enabled when read); committed-render-hold (an in-page 25 ms sampler from the first statement to the end of the first own-fleets read after the acceptance, plus at most 250 ms, with at least one snapshot after the read, an assertion and not a hope; the read must report the burn; the commit response's and the read's burn instants are printed side by side, and the failure message says this is the first real-backend observation of the equality); one-order-no-preview (one order POST, zero preview POSTs for the committed body from the acceptance to the last snapshot that still showed the statement); second-activation (an in-page click made only if the statement is present in the same task, so it can never be a real commit). Then it decides from the flight left: another-target-and-back if at least 2500 ms remain; cut on commit 1 only if at least 2500 ms remain after that; otherwise commit 1 is let arrive (arrive-and-dock) and the cut is taken on a second commit to another quoted target, where it is the first thing done after the acceptance. If the cut was taken on commit 1, commit 2 goes to the kept selection and is the one that arrives.

The two-interval window (task 7.3) runs only when the order's flight is at least 2 x 10 s + 3 s of wall time. Otherwise it logs `UNTESTED at tier 4 - flight <n> ms; covered at tier 1 by view tests 3.1 and 3.4`. No sleep stands in for a condition (`waitWallMs` is a polled wall-clock wait, used only for the one-interval and 600 ms "request that must not come" windows). No timeout was raised. The longest wait is the 60 s arrival wait, which waits on a read.

**UNTESTED vs FAILED.** Each leg runs through `runLeg`. When a leg throws and the roster row no longer reads "under way", the order had ended: the leg is logged UNTESTED with the reason and the walk continues. When it throws while the row still reads "under way", the product showed the wrong thing: FAILED, rethrown. This is UI evidence at the moment of failure, not a clock estimate. A clock cannot tell the two apart, because a poll's failure arrives seconds after the leg began.

**Summary and closing assertion.** A `[journey-summary]` block (try/finally, so it prints even on a red) lists every leg as PASSED / UNTESTED (reason) / FAILED / NOT REACHED. After it, the spec fails unless `keyboard-focus` and `committed-render-hold` are both PASSED (QA's two BLOCKED rows).

### Timing reasoning, from the first run's log

- Step 0 quoted six candidates, all HTTP 200, with 19005-21793 world ms of flight, or 3.8-4.4 s wall at scale 5. The test failed at about 4.9 s in, after the wake flow and six select-and-quote round trips. So a select plus a quote answer costs well under one second here. My budgets (2500 ms for another-target-and-back, 2500 ms for the cut) assume about 2.5x that, on a loaded machine. These are estimates, not measurements. The first run logged no commit or read timings. The predecessor (`commit-stranding-notice-journey`) committed and cut inside a flight of this size and passed, so a commit-plus-cut round trip fits.
- For a home flight near 4.4 s, the keyboard, hold, one-order and second-activation legs likely use 1-2 s (commit round trip, statement, first own-fleets read, a few snapshots). That leaves roughly 2.5-3 s. So the likeliest outcome on the home bodies is: another-target-and-back marginal, cut on commit 1 not possible after it, commit 1 let arrive, then the cut on commit 2. A longer gate flight could run everything on commit 1.
- Commit 2's cut happens within a fresh flight of about 4 s, with the cut button the first thing waited for after the acceptance.
- Fuel: the spec makes at most two real commits plus a cut. Whether home fuel covers that is not known from the log (the first run committed nothing).

### What the rerun can and cannot prove

- **Can prove:** the keyboard-focus leg, and the committed render holding through the first own-fleets read, with the burn instants printed side by side (the two QA-BLOCKED rows); exactly one order POST; no committed-body preview POST while the statement shows; a second activation sends no order; the cut leg's statement removal and its transition preview request; the arrival leg's statement removal with no figures and no preview POST over one interval; and which targets the stack offers, with the longest real flight.
- **Cannot prove (at 4.4 s):** the two-interval zero-preview window (stands on tier 1 tests 3.1 at 20 s and 3.4 at 61 s of fake time, per RULING 17). Most likely also another-target-and-back (if the flight left is under 2.5 s it is logged UNTESTED, covered at tier 1). Not walked by design: the stranding-notice leg and the optional reload leg.
- **Legs I could not make robust by reading alone:** (a) the 2500 ms budgets for another-target-and-back and the cut are estimates, so a leg that starts and then runs out of flight becomes UNTESTED, not red, which costs coverage but not correctness; (b) the arrival wait relies on the baseline poll or the ETA timer noticing the arrival, up to 60 s; (c) if a gate is the longest target, the row's reading on arrival at a gate is unverified: arrive-and-dock waits for "no longer under way" and logs whether "docked" appeared; (d) the commit-1 hold window is cut at the first read plus 250 ms. If the first read lands only after the natural end of the order, that leg is UNTESTED and, via the closing assertion, the run fails: the flight was too short for the read.

## Gate status at the stop (orchestrator, 2026-10-04 16:11 EDT)

**The rerun has NOT run.** RULING 18
(`clear-burn-preview-on-commit-rulings-index.md`): the single rerun could not
be started because the voided backend run pid 24831 (go test 24865; started
13:55:21) was still alive at 16:11 with no bounded end, and this session may
not kill it. Two waits (14:20–15:15, 15:16–16:11) for "orphan gone and
one-minute load under 4" gave up; load polls ranged 3.03–17.2.

- Tier 4, first run: 26 passed, 1 failed (this change's journey, test-side
  fixture precondition), 6.8 min. Revised spec written, **unrun, uncommitted**:
  `frontend/e2e/tests/committed-selection-journey.spec.ts`.
- Tier 3, first run: VOID (two overlapping runs on one emulator project).
- QA's two BLOCKED rows (scenario 21 keyboard focus; real-wire burn-instants
  equality) remain OPEN.
- Suite budget line: tier 4 6.8 min (red); tier 3 no valid run (~17.5 min wall
  for the voided one).
- Not archived. Tasks 7.3–7.7 unchecked.

## Gate rerun — tier 4 (2026-10-04 16:55–17:03)

Attributed from evidence on disk by the SDET; nothing was run, no test, spec or
production file was edited, no defect file was appended to. The gate decision is
the orchestrator's.

**Environment.** `HEAD 7d67377` plus the uncommitted
`frontend/e2e/tests/committed-selection-journey.spec.ts`. Started 16:55:35 EDT,
ended 17:03:12; load 2.77 at start, 9.16 at end (the backend log shows a 2.2 s
`GET /v1/fleets` and a 3.0 s `GET /v1/systems/sys_-4_2` at 17:00:10, a
load-shaped tail, not a cause of any red below). Fresh throwaway emulators (no
test port listening beforehand), zero `Received SIGTERM`. Logs: scratchpad
`gate3-t4.log`/`.meta`; backend log `frontend/playwright/.auth/backend.log`
(`[e2e] test backend starting (… logs → playwright/.auth/backend.log)`); frontend
`[WebServer]` lines are interleaved in the same Playwright log. Response bodies
are NOT in the backend log and no trace was recorded (artifacts are
error-context.md, screenshot, video only).

**Counts.** 24 passed, 3 failed, 7.5 min (tier 4 budget line: 7.5 min).

### This change's journey — PASSED (27.8 s)

Legs: keyboard-focus PASSED; committed-render-hold PASSED; one-order-no-preview
PASSED; second-activation PASSED; zero-preview-2-intervals UNTESTED (flight
5423 ms wall at scale 5, covered at tier 1 by view tests 3.1/3.4, RULING 17);
another-target-and-back PASSED; cut-the-drive PASSED; arrive-and-dock PASSED.

Logged observations:
- **Burn instants equal on the real wire**: commit response
  `[119609206725,119609233838]` vs first own-fleets read
  `[119609206725,119609233838]`. Identical.
- Committed target `gate-sys_-8_-2`, 15 of 15 targets quoted (HTTP 200 each).
- After the first commit: `commit-drift-notice` count 1, `commit-stranding-notice`
  count 0. After the cut: same (1 / 0). After the re-commit: same (1 / 0).
- After the cut: figures=1, no-quote=0, uncapped-label=0, stale=0 (a figure quote
  followed, no no-quote state).
- At arrival: row "Velyeth here Docked 49.9 t fuel 15.6k range", docked=true;
  burn enabled=true, uncapped-label=1, no-quote=0.
- Console: 2 captured entries, both a 404 resource load on `/login?signUp=true`
  (pre-existing wake-page noise); update-depth lines 0.

Weak spots, stated plainly:
1. Keyboard focus: after acceptance `document.activeElement` was `BODY`, not
   inside the command column (Burn went disabled and focus was dropped, not
   moved). The leg passes on Tab landing on `fleet-cmd-cut-drive-…` inside the
   column. Focus retention is therefore "recoverable in one Tab", not "kept".
2. The first own-fleets read after acceptance started +1 ms after acceptance and
   ended +77 ms; the 6 pre-read snapshots (+37..+155 ms) all held the statement
   with Burn disabled, but only 3 snapshots post-date the read, so the
   hold-through-read window is thin (it did hold).
3. `commit-drift-notice` is logged, never asserted, and was present (count 1)
   after a commit that is not stranding; whether that is the intended notice for
   this commit was not asserted.
4. zero-preview-2-intervals is UNTESTED at this tier (flight too short).

### Red 1 — `scan-journey.spec.ts:332`, line 401 — UNFILED pre-existing, fixture assumption

Evidence. Fleet `fleet_7a8cf365-…` produced zero `POST` requests in the backend
log (no preview, no order): the failure is before any Burn. Its only traffic was
`GET /v1/fleets/…/scan-targets` 200 (16:58:56) which served
`[{"durationMs":4742,"hostId":"gate-sys_7_-10","kind":"body"}]`; the page
(error-context.md) shows Burn disabled, nothing selected, the scan control open.
The test asserts a freshly spawned fleet's point park has nothing in scan range.
That is a property of the random, account-seeded spawn site; this spawn landed in
range of a gate. Served by the backend before any code the diff touches
(`git diff 987ba60 -- backend` is empty; the change's diff, read in full, is
`selectionCommitted` plumbing in `SpaceCommandPanel.tsx`/`SystemSpaceView.tsx`,
inert with no committed order). Not a match to a recorded signature:
`defect-spawn-system-single-body.md` (system with one body, asserts
`space-double-submit.spec.ts:276`) is the same *family* (fixture assumption about a
random spawn), different signature; I do not attribute to it. This leg's own
comment records an earlier flake of this same leg (add-scan-and-sightings-surface).
Passed in run 1.

### Red 2 — `slice.spec.ts:83`, line 199 — UNFILED pre-existing

Evidence. Backend log 17:00:10: `Credit mutation rejected … reason="market: price
changed since your quote"`, `Sale rejected`, then `409 POST
/v1/fleets/fleet_5c390472-…/sell` (one 409, 32 ms; no retry). The page
(error-context.md) shows the sell panel's own slippage handling working:
status "The price changed while you were deciding. The offer has been updated.",
"you expected ₡ 65, the new offer is ₡ 75", spinbutton 5, offer ₡ 75, fleet
DOCKED. The balance stayed 1000 because the single sell click was refused and the
test never re-clicks the refreshed offer. This is the market's quote-moves-under-
you path; no burn is on it (the burn to the station had committed and docked
normally, the panel shows "Committed at delta-v — arriving now"). No filed defect
carries this signature: `defect-post-sale-departure-burn-409s.md` is a burn
`POST …/orders` 409, not a `…/sell` 409 with this sentinel; I do not attribute to
it. Passed in run 1.

### Red 3 — `space-journey.spec.ts:85`, line 244 — UNFILED pre-existing (order refused 409; case (b)); body not captured

Which case. (b). The Burn control was enabled and the click sent the request:
backend log, fleet `fleet_f5cfb124-…`, 17:02:26 `refuel` 200, `orders/preview`
200 (58 ms), then 17:02:27 `POST …/orders` **409** (18 ms), a single 409, no
second. Line 244 is step 7 (the burn to the lane gate after sale and refuel), not
the first burn. What this view had committed earlier for this fleet: a burn to a
far lode (17:02:01, 200) and a burn to the station (17:02:21, 200), each docked
with an own-fleets read answered since (sell 200 and refuel 200 followed, the
row read "Docked" and sold). The gate selection's key differs from the station's
committed key in any case. So `selectionCommitted` was false for this click and
case (a) is excluded; no other order POST for this fleet went out and none was
suppressed.
Status/body/sentinel. 409; the response body is NOT recorded (backend log format,
no trace) and the log carries no sentinel line for it. Page: the row stayed
"Thalaara Minor here Docked 31.7 t fuel 6.27k range" for the full 20 s; later
previews continued (17:02:37, 17:02:47), i.e. the panel kept quoting.
Attribution. The request, status and position in the sequence (post-dock,
post-refuel departure burn to a gate; preview 200 then order 409) fit
`defect-post-dock-burn-cost-drift.md` (409, `ErrQuotedCapExceeded`,
"solved fuel cost exceeds the requested maxFuelTons cap") and the resolved
`defect-post-sale-departure-burn-409s.md`, but their recorded signature includes
the cap-exceeded body, which this run did not capture, so I do NOT attribute it as
MATCHES; it is the leading candidate, unverified. Independence from this change:
`commitBurn`'s request, `maxFuelTons` ceiling and `onError` are unchanged by the
diff (the diff adds only `committedKey` to the accepted-commit callback and the
`selectionCommitted` gate on Burn/preview); the refusal is a server answer on a
request the diff did not alter; `git diff 987ba60 -- backend` is empty. Passed in
run 1 on the same production code (timing-dependent). Cheapest next step, for a
later round, not mine: capture the 409 body (Playwright trace on this leg).

### Which of QA's two BLOCKED rows the run closes

Both, on the real wire (`clear-burn-preview-on-commit-qa-index.md`): scenario 21
keyboard focus (journey leg keyboard-focus PASSED, with weak spot 1 above) and
the real-wire burn-instants equality (commit response equals first read, logged
above and asserted by the passing legs). The journey's zero-preview-2-intervals
leg remains UNTESTED at this tier.

Net: the three reds show no evidence of being this change's (red 3: order sent,
server refused, `selectionCommitted` not in play), but red 3's sentinel is
unverified and is the one claim that rests on inference.

## Gate rerun — tier 3 (2026-10-04 17:05–17:22) and the gate's outcome (orchestrator)

- Command: tier 3 per `docs/testing-tiers.md`, started by the orchestrator at
  17:05:04 once the one-minute load was under 4 (3.39) and no test port was
  listening; fresh throwaway emulators; single runner, no overlap (process
  table empty of other test runs at start).
- Result: **`DONE 1875 tests, 1 skipped in 1053.689s`, exit 0 — GREEN.** The
  one skip is `TestTurnTable_RecordOrRegenerate` (fixture regeneration, by
  design). Zero `Received SIGTERM`. Zero hits for the
  `endpoint at or inside the star-clearance radius` sentinel — the filed
  `defect-station-order-500` did not fire in this run. Wall 17:05:04–17:22:50
  (17.8 min). Load at end 3.23.
- Tree before/after: HEAD `7d67377`; the journey spec untracked and unchanged
  (mtime 1791137964 before and after tier 4); during tier 3 the SDET's
  attribution section was appended to this file (docs only).
- Archive rehearsal on a scratch copy of `openspec/` (17:23): clean —
  `+ 1 added, ~ 3 modified`; `system-space-view` 46 → 47 requirements, 292 →
  313 scenarios; `## Purpose` preserved (no restore needed); `validate --specs
  --strict` 34/34. `openspec-reconcile.py` OK, `validate --strict` valid.

**Suite budget line:** tier 4 7.5 min (24 passed, 3 failed — none this
change's); tier 3 17.6 min (green).

**Gate outcome: NOT PASSED — stopped, not archived (RULING 19).** This change's
own journey is green and tier 3 is green, but tier 4 has three reds that match
no filed defect's recorded signature: two newly filed today
(`defect-scan-journey-spawn-in-gate-range.md`,
`defect-slice-sell-price-changed-409.md`) and one unverified candidate
occurrence of `defect-post-dock-burn-cost-drift.md`. The gate has had its one
rerun.

## Gate passed by user ruling (2026-10-05)

**USER RULING 20** (`clear-burn-preview-on-commit-rulings-index.md`) — Travis,
verbatim: "reconcile the task list against the code, archive, and then continue
the chain with add-burn-cost-overlay." The rerun's three tier-4 reds are
residue by that ruling; no further gate tier was run for this change.

**Corroborating evidence (not the basis).** The out-of-chain corrective change
`fix-burn-order-geometry-refusals` (archived `d52eab1`) ran the full gate on a
later tree containing this change's built code and its committed journey spec:
tier 4 **28 passed, 0 failed** (410 s), tier 3 **1979 tests, 0 failures**
(1026 s) — `fix-burn-order-geometry-refusals-journey.md`. This change's
journey did not go red there (that record does not print its leg summary, so
it says nothing about any single leg), and the three specs red in this gate's
rerun — `scan-journey.spec.ts:332`, `slice.spec.ts:83`,
`space-journey.spec.ts:85` — all passed. This change's production, test and
journey files are byte-identical between `c3fcfcf` and `d52eab1`.

**QA closure.** `clear-burn-preview-on-commit-qa.md`, "Journey closure
(2026-10-05)": both BLOCKED rows CLOSED-PASS, verdict SHIP. Passed more weakly
than the scenario states, as QA records: the Tab target is asserted as inside
the command column, not as the next focusable element by identity (focus drops
to the document body at acceptance and is recovered in one Tab); the hold has
3 post-read snapshots; the post-cut request is "at least one"; the drift
notice is logged, never asserted. Not observed at tier 4: a real reload
mid-burn; the two-interval zero-preview window (both tier 1 only).

**Task list.** Reconciled against tests and code at `d52eab1` by the SDET:
`clear-burn-preview-on-commit-task-reconciliation.md` — 25 of 25 test tasks
EVIDENCED (six under recorded contract settlements), 127/127 vitest, red
manifest unchanged since handoff. Task 7.4 is checked on USER RULING 20.
