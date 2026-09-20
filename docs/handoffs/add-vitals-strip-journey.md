# `add-vitals-strip` — journey record (archive gate)

Link 2a of `docs/plans/system-hud/chain.md`. Journey spec:
`frontend/e2e/tests/vitals-strip-journey.spec.ts`, written against the built UI
(implementation commit `b6e83a1`), walking RULING 9's four-step journey: dock at
a station and read all five cells → switch the acting fleet by the chevron
(same-system, then cross-system) → commit a burn and watch the pill flip and
count down → the 1280×720 viewport check with every floating surface present,
closing QA's two BLOCKED rows.

## Outcome: **RED — not archived.** The gate finally ran end to end; the journey failed on its own cross-system navigation leg, which no previous run had ever reached.

Six tier-4 executions have been spent on this gate. Runs 1 and 2 (the budgeted
pair) were red with findings, all diagnosed and fixed or filed. Runs 3a, 3b and
3c produced **no verdict at all** — each was destroyed mid-flight by a
name-matched `pkill` from another project's Claude session (RULING 50). **Run
3d, with that cause identified and warned off, completed: 53.1 minutes, 18
passed, 5 failed, zero `Received SIGTERM` in `backend/emulator.log`.** Four of
its five reds are attributable; the fifth is this change's own journey, and it
is unattributed — so the gate does not close and nothing is archived.

The change itself remains validated, adversary-cleared (r3 at `aa21687`, still
current by diff), 39/42 tasks built, tier 1 and tier 3 green.

---

## Runs 1 and 2 (2026-09-09, previous orchestrator) — the two-run budget

Preserved from the earlier record because the findings still stand.

| Tier | Run 1 | Rerun | Verdict |
|---|---|---|---|
| 4 | 29.8m (1788s) | 28.5m (1710s) | 20 passed / 3 failed each; 2 of the rerun's 3 were new |
| 3 | 1130.471s (~18.84m), 1875 tests, 1 skipped, 0 failed | *(not rerun)* | green; no backend file is in this change's diff |

**Run 1's three findings and what became of them:**

1. **`FloatingNav` intercepted the chevron** (`frontend/components/floating-nav.tsx`,
   mounted app-wide by `layout-wrapper.tsx:108`, `fixed bottom-4 left-4 z-50`) —
   a real product defect against `system-console`'s *No other floating surface
   covers a strip cell*, missed by the impl contract's three-surface survey.
   **Fixed** (`bottom-[4.5rem]`, `z-50` deliberately untouched) and verified by
   the rerun's failure moving from `:222` to `:257`.
2. **`refuel-commit.spec.ts`** — `defect-station-order-500` residue
   (`space.ErrEndpointInsideClearance`, ~2 % of spawns). Did not recur in the
   rerun, and **passed again in run 3c**.
3. **`slice.spec.ts` mount-timing** — re-homing `hold-readout` into an
   always-present surface decoupled its visibility from "the fleet read
   landed". Fixed test-side with `expect.poll`; held in the rerun.
   *Taught: inheriting a testid preserves the selector, not the precondition.*

**The rerun's two new findings** became RULINGs 33–42 and resolved into: the
Next.js dev-overlay badge (RULING 33), and three separate signatures inside
what was recorded as one "silent second burn" — `ErrQuotedCapExceeded`
(`defect-post-dock-burn-cost-drift.md`), the 4xx mutation retry (**fixed**, and
`fix-mutation-retry-on-4xx` archived at `6fce684`), and a `signUpAndWake` flake
(`defect-wake-roster-row-flake.md`).

---

## The third run, prepared (RULINGs 43–46) and executed three times

**Preparation landed at `61bdba3`**, none of it product behaviour:

| Change | File | Owner | Why it is not a product change |
|---|---|---|---|
| `devIndicators: false` gated on `ENV=test` | `frontend/next.config.ts` | nextjs-dev | `devIndicators` has no effect outside `next dev`; `next build && next start` strips the overlay entirely. Verified against the installed **next 15.5.22** (`config-schema.js:257-273` accepts `false`; `define-env.js:122` threads it to `__NEXT_DEV_INDICATOR`; the compiled devtools render it as `display:none`). RULING 44. |
| `ENV=test`, `stdout`/`stderr: 'pipe'` on the webServer | `frontend/playwright.config.ts` | SDET | harness config; the pipe closes the capture gap the rerun's Finding A named |
| console/pageerror capture; `nextjs-portal` hidden | journey spec | SDET | instrumentation; no assertion touched. RULING 45 |
| `floating-nav` added to step 4's surface list | journey spec | SDET | an **added** assertion over the same scenario — the surface that failed run 1 was the one surface the overlap check excluded. RULING 46 |

Tier 0 clean; tier 1 green (1610/1612, the two reds being the filed
`defect-spacestage-keyboard-camera-timeout-flake.md`, which a separate full run
in the same session passed 1612/1612).

### Run 3a — killed at 10:00. Run 3b — killed at 3:00. Run 3c — killed at ~21:00.

| Attempt | Shape | Lived | Result as printed | What it actually was |
|---|---|---|---|---|
| 3a | background task, no explicit timeout | 10m00s | 10 passed / 13 failed | emulators `SIGTERM`ed at `19:57:58`; orphaned Playwright kept "testing" a dead stack for another 12 minutes |
| 3b | background task, 60-minute budget | 3m00s | 1 passed / 9 failed (aborted) | same, at `20:17:24` — which **refutes** the tool-timeout mechanism RULING 47 first proposed |
| 3c | **foreground**, 60-minute budget, emulators started **detached** beforehand (`ensure-test-emulators.sh`) | full 28.2m | **13 passed / 10 failed** | emulators `SIGTERM`ed at ~`20:55:14`, 21 minutes in; everything from test #15 on is post-mortem |

**The evidence, copied here because every log it lives in is overwritten by the
next run.**

The emulator process announces the signal itself (`backend/emulator.log`, and
the run 3b log at line 48):

```
i  emulators: Received SIGTERM for the first time. Starting a clean shutdown.
i  emulators: Shutting down emulators.
i  auth: Stopping Authentication Emulator
```

The backend stays up and answers `401` to everything afterwards
(`frontend/playwright/.auth/backend.log`, first occurrence `20:55:14` in run 3c):

```
WRN Failed to verify Firebase JWT token
    error="failed to establish a connection: Post
    \"http://localhost:10109/identitytoolkit.googleapis.com/v1/projects/hexaverse-emulator/accounts:lookup\":
    dial tcp [::1]:10109: connect: connection refused"
```

And the journey's own console capture (RULING 45's instrumentation, working)
names it from the browser side:

```
[journey-console] 1 browser console error/warning/pageerror entry captured this run
[journey-console] console-error at http://localhost:3110/login?signUp=true:
                  Failed to load resource: net::ERR_CONNECTION_REFUSED
```

The journey then fails at **sign-up**, 200 lines before anything it exists to
assert:

```
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('wake-up-flow')
  at wakeNewCorp (frontend/e2e/helpers/space-view.ts:203)
  at frontend/e2e/tests/vitals-strip-journey.spec.ts:202
```

### What was ruled out, by checking (RULING 49)

- **A tool timeout** — refuted by 3b's three-minute death under a 60-minute budget.
- **An emulator crash or memory pressure** — the shutdown is clean and firebase
  announces a received signal; a jetsam kill is `SIGKILL` and prints nothing.
- **The sibling Volt fork.** `/Users/travis/Projects/Chartz` was active
  throughout (its dev server starts two seconds after 3b's SIGTERM — the one
  correlation that looked damning). Its `firebase.test.json` uses auth `10139`
  / pubsub `9136`, its `with-test-emulators.sh` reaps only those two, and it
  runs **no firestore emulator**. It cannot touch `9100/10109/9106`.
- **This session's own agents** — none was running during kill #3, and the two
  that ran earlier executed only lint, `tsc`, `playwright test --list` and tier 1.
- **This change's own edits** — `process.env.ENV` is read by exactly one line in
  the entire frontend (`next.config.ts:18`), confirmed by a correctly-quoted
  grep after zsh silently ate an earlier `--include` glob.

### The source, identified — a name-matched `pkill` from another project (RULING 50)

**Not a suspicion any more.** A subagent of a Claude session in
`/Users/travis/Projects/Roma` runs, as its pre-run cleanup,

```bash
pkill -f "emulators:start" 2>/dev/null; pkill -f "emulators:exec" 2>/dev/null
```

at `23:57:55Z`, `00:18:43Z` and `00:54:40Z` — **one within a minute of each of
this gate's three emulator deaths**, matching run 3a's `emulators:exec` set, run
3b's set, and run 3c's *detached* `emulators:start` set in turn. `pkill -f`
matches the entire command line, so a cleanup meant for one project kills every
Firebase emulator on the machine, whatever its ports. Nothing in hexaverse sent
those signals: `backend/Makefile`'s `stop-emulators` was never invoked and no
`/spinup` ran. My earlier prime suspect — this repo's own `stop-emulators` —
was **wrong**, and it was wrong in the direction that flatters the investigator:
the culprit was the tool I could see rather than the one I could not.

Two consequences for the mechanisms recorded above:

- Run **3a** carried the 600 s Bash default timeout **as well as** taking a
  pkill. RULING 47 was not refuted, it was incomplete — two causes, one death.
- Run **3b**'s three-minute death is the `00:18:43Z` pkill plus Playwright's
  120 s `webServer` budget, not a separate mechanism.

**The lesson that outlives this link: kill by port, never by process name.**
`with-test-emulators.sh` says *"ports are unique per repo, so this never touches
another project's emulator"* — true of its own port-based reaping, and exactly
the assumption a sibling project's name-based kill breaks.

---

## What run 3c did prove, before the stack died

Twelve of the fourteen tests that completed under a live stack passed —
including `refuel-commit.spec.ts` (run 1's residue did not recur) and three of
`scan-journey`'s four cases.

One pre-kill red needs an owner and does **not** belong to this change:

| Spec | Failure | Assessment |
|---|---|---|
| `scan-journey.spec.ts:260` (~`20:44`, ~11 min before the kill) | `getByTestId('sighting-mark-<recordId>')` never visible, 20s | **Unattributed.** It passed in gate runs 1 and 2 against byte-identical production code (only `next.config.ts` — dev-only — and test files changed since), so it is intermittent rather than a regression. Not filed as a defect on one occurrence; recorded here so the next run knows to watch it. |

Everything from `slice.spec.ts` (#15) onward — the five `space-double-submit`
cases, `space-journey`, and this change's own journey — failed at sign-in
against the dead auth emulator in a uniform 22–25s. **None of those ten results
is evidence of anything**, and in particular none of them says anything about
`defect-post-dock-burn-cost-drift` or `defect-wake-roster-row-flake`, which is
what the double-submit reds would otherwise have been checked against.

---

## Run 3d — the authorised run, completed: 18 passed / 5 failed, 53.1m

Emulators started detached beforehand, suite run in the foreground with an
explicit 3 600 000 ms budget, both known causes of the earlier deaths removed.
**`grep -c "Received SIGTERM" backend/emulator.log` → 0.** The stack held for
the whole run: `slice.spec.ts`, `space-journey.spec.ts`,
`scan-lane-transit-fizzle.spec.ts` and four of the five `space-double-submit`
cases — every spec the void runs had turned into a 401 — **passed**.

**The environment fix worked, and so did every fix carried in from runs 1–2.**
The journey walked step 1 (all five cells read while docked), the *first*
chevron open — the leg `FloatingNav` blocked in run 1 and the Next.js dev badge
blocked in run 2 — the same-system switch, the cross-system `page.goto`, the
absent-form assertions in a foreign system, and the *second* chevron open,
before failing at the navigation that follows it. Neither interception recurred:
RULINGs 33/44 (the `ENV=test` dev-indicator gate) and run 1's `FloatingNav`
relocation are both confirmed by a run that walked straight past them.

### The five reds, each attributed

| # | Spec | Failure | Attribution |
|---|---|---|---|
| 1 | `new-user.spec.ts:81` | `waitForURL` after wake, 20s | **Filed** — appended to `defect-wake-roster-row-flake.md` as occurrence 3 (a second manifestation of the same wake, one step earlier than the roster) |
| 2 | `scan-journey.spec.ts:249` | seeded ghost `sighting-mark-8152ad…` never visible, 20s | **Filed** — `defect-seeded-sighting-ghost-not-drawn.md`. Second occurrence in two runs (run 3c's `:260` was the first, on a different test and record id), which is why it is now a filed intermittent rather than noise |
| 3 | `scan-journey.spec.ts:307` (via `helpers/space-view.ts:220`) | roster row count 0, expected 1, 20s | **Filed** — `defect-wake-roster-row-flake.md`, occurrence 2, the assertion that file was opened on |
| 4 | `space-double-submit.spec.ts:276` | `feat-body-*` count 1, expected > 1 | **Filed** — `defect-spawn-system-single-body.md`. Same family as `defect-station-order-500`: a tier-4 fixture asserting on a randomly generated spawn |
| 5 | **`vitals-strip-journey.spec.ts:332`** | `waitForURL('**/systems/sys_9_7')`, 20s — the chevron's cross-system navigation | **UNATTRIBUTED.** `defect-cross-system-chevron-nav-stall.md`. This is the blocker |

Evidence for 1–4 is copied verbatim into those files, at filing time, because
`frontend/playwright/.auth/backend.log` and the Playwright report are both
overwritten by the next run.

### Red 5, and why the gate stops here

What is established: the click reached the callback (the chevron's
`justSelectedId` transient label proves it); `router.push` issued its App Router
fetch and **the dev server served `GET /systems/sys_9_7 200 in 546ms`** —
captured only because RULING 45.2 piped `next dev`'s stdout into the run log;
and the URL never changed. What is **not** established is why the transition
never committed. The leading candidate is load — the run took **53.1 minutes
against the suite's usual ~28**, with another project's session running CPU-load
diagnostics throughout, and two sibling failures in the same run have the same
"did not get there in 20 s" shape — but that is a hypothesis, and this link has
spent five runs learning that a story consistent with the evidence is not a
diagnosis.

**The gate rule is unambiguous and is being followed: residue archives only
when every red is attributable to a filed pre-existing defect. Red 5 is this
change's own journey failing its own scenario, on a leg that has never once
been exercised. It is not residue, so nothing is archived.**

## QA's two BLOCKED rows — unchanged, still BLOCKED

Both under `system-console`'s *The Strip Is Laptop-First and Never Overflows the
View*, both `Playwright, deferred` in `add-vitals-strip-red-coverage.md`:

| Row | State after six tier-4 executions |
|---|---|
| **Every cell is inside the viewport at 1280×720** | **BLOCKED.** Step 4 has still never been reached: runs 1 and 2 stalled at the chevron, 3a–3c never got past sign-up, and 3d stalled one leg later, in step 2's cross-system navigation. Zero evidence either way. |
| **No other floating surface covers a strip cell** | **BLOCKED**, but materially closer. Run 1's `FloatingNav` collision and run 2's dev-overlay collision are now **both confirmed cleared** — 3d walked through both chevron opens without an interception. The geometric assertion that would actually close the row (now including `floating-nav` itself, RULING 46) sits in step 4 and has still never executed. |

## The suite budget line

| Tier | Command | Wall time | Verdict |
|---|---|---|---|
| 4 | `cd frontend && npm run e2e` | run 1 29.8m · run 2 28.5m · 3a 10.0m (killed) · 3b 3.0m (killed) · 3c 28.2m (stack died at ~21m) · **3d 53.1m (completed)** | 18 passed / 5 failed; no green run |
| 3 | `npm run test:backend:all` | 1130.471s (~18.84m), once | green — 1875 tests, 1 skipped, 0 failed |

Tier 3 was **not** rerun and did not need to be: RULING 39 withdrew the backend
exception, and no backend file is in this change's diff. Runs 1, 2 and 3c sit
within 5 % of each other (1788s / 1710s / 1692s) — no growth signal from the
suite itself. **Run 3d's 53.1m is 1.9× that band and is a machine-load figure,
not a suite-growth figure**: it shares its spec list with 3c exactly, and the
foreign CPU-load diagnostics running throughout are the only variable that
changed. It is recorded here as the control the next run needs — if a rerun on
a quiet machine comes back near 28m and the journey passes, the load hypothesis
for red 5 is confirmed; if it comes back near 28m and the journey still fails,
red 5 is a real defect. **No timeout was raised or approached anywhere, in any
tier, at any point, in any of the six runs.**

## What the next run needs

**A quiet machine — not merely one that leaves the emulators alone.** Run 3d
proved the emulator problem is solved (RULING 50, zero SIGTERMs) and replaced it
with a subtler one: at 1.9× wall time, three of the suite's specs cannot get
where they are going inside their 20 s budgets, and one of the three is this
change's own journey. No foreign CPU-load diagnostics, no parallel builds, for
the ~30 minutes the suite takes.

The prepared run is already committed and needs no edits:

```bash
bash scripts/dev/ensure-test-emulators.sh          # detached
cd frontend && npm run e2e                          # foreground, 3_600_000 ms budget
```

**Judge it by wall time first.** If the suite comes back near 28 minutes, its
verdict on red 5 is trustworthy either way — a pass closes QA's two rows and the
gate, a failure makes `defect-cross-system-chevron-nav-stall.md` a confirmed
product defect that must be specified and fixed before this change archives. If
it comes back near 50 minutes again, the machine was not quiet and the run
should not be read as a verdict at all.

## Taught

- **A gate run is only as reliable as the machine's quietest hour.** Three
  executions were destroyed by a signal from outside the run, and the third
  survived being *detached* — moving the emulators out of the process tree does
  not protect them from a `pkill` that matches on their config path. The tiers
  doc's "one emulator project, one suite at a time" is a rule about the whole
  machine, not about this session's own discipline.
- **The most dangerous failure shape is a stack death that prints test names.**
  All three killed runs reported a plausible-looking pile of reds — 13, then 9,
  then 10 — in specs a reader would happily attribute to product defects. The
  only thing separating "ten reds" from "one dead emulator" was reading
  `backend.log` and the emulator's own shutdown line. **Read the stack's health
  before attributing a single test.**
- **Capturing beat inferring, on its first outing and twice over.** The console
  capture added to read the dev badge's "2 Issues" instead caught (a) its own
  sibling's `addInitScript` bug — `document.head` is null at init-script time,
  RULING 48 — and (b) the browser-side face of the emulator death. Neither would
  have been visible to any amount of post-hoc reasoning about the reporter's
  output.
- **A mechanism that fits one observation is not a diagnosis.** RULING 47 named
  a 600-second tool timeout, which fit run 3a exactly and was refuted by run 3b
  three minutes in. It is corrected on the record rather than quietly replaced —
  the same discipline RULING 42 demanded after four analyses of one red.
- **The dev-overlay fix belongs to the environment, not the product.** RULING 33
  refused to move the strip's fleet cell for a badge no player sees; the fix is
  three lines of test-environment config and Travis's own `npm run dev` keeps
  its overlay. Run 3d walked through both chevron opens without an
  interception — the ruling is now confirmed by execution, not by inference.
- **Kill by port, never by process name.** Three runs died to another project's
  `pkill -f "emulators:exec"`, including a set started detached specifically to
  survive. A name-matched kill is a machine-wide weapon written as though it
  were project-scoped, and no amount of care inside hexaverse defends against
  one.
- **A shared machine is part of the test environment, and wall time is how you
  measure it.** Run 3d's 53.1m against an unchanged spec list is the only reason
  its three navigation timeouts can be read as a load signature rather than
  three regressions. **Record the suite's wall time on every gate run**; it is
  the control that makes the next run's reds interpretable.
- **The instrumentation earned its place three times over.** `stdout: 'pipe'`
  produced the single most valuable line in the whole gate —
  `GET /systems/sys_9_7 200 in 546ms` — which is what separates "the app never
  asked" from "the app asked and the transition never committed" in red 5.
  Without it, red 5 would have been indistinguishable from a dead click.
