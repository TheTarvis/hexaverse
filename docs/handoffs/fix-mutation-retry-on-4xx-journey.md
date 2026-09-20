# Archive-gate record — `fix-mutation-retry-on-4xx`

**Run date** 2026-09-09. **Result: GREEN, first run, no revision round needed.**

Tier 4 only. Tier 3 was **not** required and was not run: FULL-AUTO RULING 39
withdrew the backend exception, and this change modifies exactly one production
file, `frontend/lib/query-client.ts`. No backend file changed, so the full
emulator suite had nothing to prove (`docs/testing-tiers.md`).

## The run

Tree locked at commit `5b3c5f6`; nothing edited during the run.

```bash
cd frontend && bash ../scripts/dev/with-test-emulators.sh \
  'cd frontend && npx playwright test e2e/tests/space-double-submit.spec.ts'
```

```
Running 6 tests using 1 worker

  ✓  1 [setup] › auth.setup.ts:15:6 › authenticate                                   (8.3s)
  ✓  2 › space-double-submit.spec.ts:266 › …one burn order                           (1.2m)
  ✓  3 › space-double-submit.spec.ts:313 › …one mine run                             (1.1m)
  ✓  4 › space-double-submit.spec.ts:339 › …one sale and mint one key                (2.3m)
  ✓  5 › space-double-submit.spec.ts:416 › …one refuel and mint one key             (37.1s)
  ✓  6 › space-double-submit.spec.ts:439 › …exactly one jump order                  (58.4s)

  6 passed (8.5m)
✔  Script exited successfully (code 0)
```

**Suite budget line: tier 4 = 8.5 min wall (6.2 min in the spec file itself,
plus emulator start, backend build and stack boot). Tier 3 = not run.**
Throwaway emulator set; no persistent stack was reused.

This closes `tasks.md` 2.3, including its requirement that the two `toBe(2)`
guard-release checks still expect two — they do, unmodified.

## What the wire actually showed

The whole point of task 1.3/1.3b was to make the retry class visible at the
wire. It is. Mutation POSTs observed across the run, from the backend log:

| Route | POSTs | Statuses |
| --- | --- | --- |
| `/orders` | 7 | all `200` |
| `/mine` | 2 | all `2xx` |
| `/sell` | 2 | all `2xx` |
| `/refuel` | 1 | `2xx` |
| `/jump` | 1 | `2xx` |

Every count matches its scenario exactly — one per guarded double-activation,
two where a second deliberate command follows. **No doubled mutation appears
anywhere in the run**, which is the behaviour this change exists to produce.

## RULING 51's predicted red did NOT fire

The standing risk recorded before the run: the new status assertion at
`space-double-submit.spec.ts:214` is the one command in the file with no
`/under way/` wait after it, so a `409` there was previously invisible and
would now be red — and that spot is verbatim the "burn → dock → immediately
order again" sequence `defect-post-dock-burn-cost-drift.md` names.

**It did not happen this run.** Both `/orders` POSTs in that test returned
`200`, and the quote-cap signature is absent:

```
grep -c "maxFuelTons cap"        backend.log  ->  0
grep -c "star-clearance radius"  backend.log  ->  0
```

This is **not** evidence the drift defect is fixed — it is intermittent by
nature, and RULING 41 left it deliberately untouched. RULING 51 therefore
stands unchanged for the next run of this spec: a red at `:214` carrying
`"solved fuel cost exceeds the requested maxFuelTons cap"` is that defect,
to be recorded and reported, never repaired by widening
`BURN_FUEL_ALLOWANCE` or relaxing the assertion.

## Residue found, attributed, not fixed

**Four `500`s, all on `/orders/preview`** — `space.ErrArcTooShort`
(`backend/space/burn.go:174`, "curve length below the configured minimum")
falling through to a bodyless 500. Appended with verbatim evidence to
`defect-station-order-500.md` as a **second instance of that defect's
*problem 2*** — a different sentinel on a different route, same fall-through.

Not this change's, on two independent grounds: it is a backend response-shape
issue (RULING 39 makes this change frontend-only), and a `5xx` was excluded
from automatic mutation resend both before and after the change. The recorder
is anchored `/orders$`, so preview traffic never entered any count assertion.

Worth stating plainly, because it is the strongest empirical result of the run:
**had adversary round 1's BLOCKER 1 survived** — the invented "a 5xx is still
resent exactly once" clause — **these four 500s would have been eight**, on the
same route family, in this same suite. The adversary predicted exactly that
harm from the artifact text alone; the gate measured it.

Twelve `404`s also appear; these are ordinary fog/audience reads
(`observation`'s foreign-fleet 404 is specified behaviour), not failures.

## Cross-check against the other filed defects

- `defect-post-dock-burn-cost-drift` — did not fire (see above).
- `defect-station-order-500` — the clearance sentinel did not fire; a sibling
  sentinel did, now recorded there.
- `defect-wake-roster-row-flake` — did not fire; all six `signUpAndWake` legs
  reached their roster row.
- `defect-spacestage-keyboard-camera-timeout-flake` — tier 1 only, not
  reachable from tier 4.

## Evidence preservation

`frontend/playwright/.auth/backend.log` is overwritten by every e2e run, and
this chain has already destroyed one defect's original evidence that way. This
run's log was copied to the session scratchpad before anything else ran, and
every figure quoted above was taken from that copy, with the load-bearing lines
pasted verbatim into this record and into `defect-station-order-500.md` rather
than cited by path.
