# Defect — `signUpAndWake` intermittently fails: the roster row never appears within 15s

**Status:** open, intermittent. **Found:** 2026-09-09, isolating
`add-vitals-strip`'s archive-gate reds.

## What happens

`frontend/e2e/tests/space-double-submit.spec.ts:126` (`signUpAndWake`, called from
`:249`) times out waiting for the new corporation's roster row, 15s budget.
It is a **setup** step: the test never reaches the behaviour it exists to assert.

## Why it is filed separately

It is the **third** distinct signature hiding inside what was recorded as one
finding ("red 2") in `add-vitals-strip-journey.md`. The other two are
`defect-post-dock-burn-cost-drift.md` and the 4xx mutation retry fixed by
`fix-mutation-retry-on-4xx`. Conflating them is why the original defect survived
four analyses with four different explanations.

## Evidence of intermittency, not regression

In an isolated repro of the two failing scenarios, `:185` **passed** and `:242`
failed here at wake-up — while at the archive gate **both** failed, and at the
gate's first run **both passed**, with only a two-line diff between those runs
that cannot touch sign-up. A failure that moves between runs on an unchanged path
is flake, and it should be treated as one until someone shows otherwise.

## Where to look

Spawn is idempotent-per-account and orchestrates corp doc + account pointer in
one transaction, then the hull and initial fog (root `CLAUDE.md`, `corporations/`).
A wake that resolves but whose roster read lands before the hull does would
present exactly like this. Candidates: the frontend's post-spawn invalidation
racing the seeded fleet, or a 15s budget that is simply tight on a cold emulator.

## What would make this stale

A run of the wake path under load with the spawn→roster sequence timed. If the
budget is the problem the fix is a poll, not a longer timeout — `docs/testing-tiers.md`
is explicit that raising a budget to pass is never the fix.

---

## Two further occurrences, 2026-09-09 — `add-vitals-strip` gate run 3d

Evidence copied in at filing time (`frontend/playwright/.auth/backend.log` and
the Playwright report are both overwritten by the next run).

**Occurrence 2 — the same assertion, count 0 instead of 1.**
`frontend/e2e/tests/scan-journey.spec.ts:307`, through the same helper:

```
Error: a fresh spawn has exactly one hull
expect(locator).toHaveCount(expected) failed
Locator: getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
Expected: 1   Received: 0   Timeout: 20000ms
  3 × locator resolved to 0 elements
  at helpers/space-view.ts:220 (wakeNewCorp)
```

**Occurrence 3 — a second manifestation of the same wake, one step earlier.**
`frontend/e2e/tests/new-user.spec.ts:59` never reaches the roster at all: the
post-spawn navigation onto the home system does not happen inside 20 s.

```
TimeoutError: page.waitForURL: Timeout 20000ms exceeded.
waiting for navigation until "load"
  at new-user.spec.ts:81
```

**Context that matters for reading these.** The run they come from took
**53.1 minutes** against the same suite's usual ~28 — another project's Claude
session was running CPU-load diagnostics on the machine throughout (see
`add-vitals-strip-rulings.md` RULING 50). Three of that run's five failures are
"the app did not get there in 20 s" on the wake or navigation path, which is
the signature this defect describes. Whether the wake path has a genuine race
or is merely tight enough that a loaded machine exposes it **is still the open
question this file was opened with** — and it now has three data points, all
from loaded runs, which is exactly the confound that keeps it unresolved.

The next useful step is unchanged and still cheap: time the
spawn→roster sequence on a **quiet** machine, under load, with the wake path
instrumented. If the budget is the problem the fix is a poll, not a longer
timeout.
