# `add-vitals-strip` — journey record (archive gate)

Link 2a of `docs/plans/system-hud/chain.md`. Journey spec:
`frontend/e2e/tests/vitals-strip-journey.spec.ts`, written against the built UI
(implementation commit `b6e83a1`), walking RULING 9's four-step journey: dock at
a station and read all five cells → switch the acting fleet by the chevron
(same-system, then cross-system) → commit a burn and watch the pill flip and
count down → the 1280×720 viewport check with every floating surface present,
closing QA's two BLOCKED rows.

## Outcome: **BLOCKED — not archived.** The gate cannot be closed on this machine while something outside the run keeps stopping the test emulators.

Five tier-4 executions have now been spent on this gate. Runs 1 and 2 (the
budgeted pair) were **red with findings**. Runs 3a, 3b and 3c — the single
additional run Travis authorised, plus its two re-executions — produced **no
verdict at all**: each was destroyed mid-flight by an external `SIGTERM` to the
Firebase test emulators. The change is validated, adversary-cleared (r3,
current), 39/42 tasks built and tier-1 green; the only thing missing is a
journey that is allowed to finish.

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

## QA's two BLOCKED rows — unchanged, still BLOCKED

Both under `system-console`'s *The Strip Is Laptop-First and Never Overflows the
View*, both `Playwright, deferred` in `add-vitals-strip-red-coverage.md`:

| Row | State after five tier-4 executions |
|---|---|
| **Every cell is inside the viewport at 1280×720** | **BLOCKED.** Step 4 has never been reached: runs 1 and 2 stalled at the chevron, runs 3a–3c never got past sign-up. Zero evidence either way. |
| **No other floating surface covers a strip cell** | **BLOCKED.** Run 1 caught `FloatingNav` (fixed, verified indirectly); the rerun caught the dev-overlay badge (fixed for the test env, RULING 44); the assertion that would close the row — now including `floating-nav` itself, RULING 46 — has never executed. |

## The suite budget line

| Tier | Command | Wall time | Verdict |
|---|---|---|---|
| 4 | `cd frontend && npm run e2e` | run 1 29.8m · run 2 28.5m · 3a 10.0m (killed) · 3b 3.0m (killed) · 3c 28.2m (stack died at ~21m) | no green run |
| 3 | `npm run test:backend:all` | 1130.471s (~18.84m), once | green — 1875 tests, 1 skipped, 0 failed |

Tier 3 was **not** rerun and did not need to be: RULING 39 withdrew the backend
exception, and no backend file is in this change's diff. Tier 4's three
completed runs sit within 5 % of each other (1788s / 1710s / 1692s) — no growth
signal. No timeout was raised or approached anywhere, in any tier, at any point.

## What the next run needs — and it is one sentence long

**Nothing may stop the hexaverse test emulators while tier 4 runs**: no
`cd backend && make stop-emulators`, no `pkill -f firebase.test.json`, no
`/spinup`, no second e2e or `--backend-tests` run, from any terminal or any
Claude session, for the ~30 minutes the suite takes. With that held, the
prepared run is already committed and needs no further edits: start the
emulators detached (`bash scripts/dev/ensure-test-emulators.sh`), run
`cd frontend && npm run e2e` in the foreground, and the journey either closes
QA's two rows or produces its first real finding since run 2.

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
  its overlay.
