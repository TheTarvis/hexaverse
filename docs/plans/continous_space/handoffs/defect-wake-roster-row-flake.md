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
