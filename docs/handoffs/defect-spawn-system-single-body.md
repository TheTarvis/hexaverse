# Defect — a spawn's home system can carry only one ordinary body, and a tier-4 fixture assumes several

**Status:** open, first occurrence. **Found:** 2026-09-09, `add-vitals-strip`
archive-gate run 3d.
**Not this change's:** `add-vitals-strip` touches no generator and no spawn
code; the spec is pre-existing and untouched.

## What happens

`frontend/e2e/tests/space-double-submit.spec.ts:266` asserts that the freshly
spawned home system has more than one `feat-body-*`, because the test needs a
*second* body to burn to after the first leg:

```
Error: a generated system carries several ordinary bodies
expect(received).toBeGreaterThan(expected)
Expected: > 1   Received: 1
  at space-double-submit.spec.ts:276
```

The spawn it drew had exactly one. The test's own comment says the count is
"reliably one" or more — that reliability is what failed.

## Why this is the same family as `defect-station-order-500`

Both are **fixture assumptions about a randomly generated home system** that
hold for most spawns and not all: that one asserts a burn to the home station
never lands inside the star-clearance radius (~2 % of spawns say otherwise),
this one asserts a system has at least two ordinary bodies. Site selection is
account-seeded and periphery-weighted (`backend/corporations/siteselection.go`),
so the draw differs per test account, per run.

`docs/testing-tiers.md`'s fixture rule is about *sharing* fixtures, not about
*asserting on a random draw*; there is no rule yet covering the latter, and
this is the second defect caused by its absence.

## Where the fix belongs

Not in the generator: a system with one ordinary body is legitimate galaxy
content, not a bug. The candidates are all test-side and none is chosen here —
seed or select a spawn that meets the test's precondition, burn to a
non-`feat-body-` target the system is guaranteed to have (a belt, a moon, the
station, a lane gate), or skip with a named reason when the draw does not
qualify. **A longer timeout is not among them**, and neither is loosening the
assertion to `>= 1` — the test genuinely needs two distinct targets.

## What would make this stale

A tier-4 fixture policy for randomly generated spawns — the one artifact that
would close this and `defect-station-order-500`'s class together.

## Occurrence 3 — 2026-10-03, `add-vitals-strip` / `fix-world-time-render-loop` archive gate

(Occurrence 2 was gate run 4, 2026-09-19 — recorded in
`defect-cross-system-chevron-nav-stall.md`.) Full tier-4 run, 23 passed / 1
failed, ~297 s, stack healthy: `space-double-submit.spec.ts:267` *Two
activations in one tick submit one burn order* failed at `:277` with the same
`a generated system carries several ordinary bodies … Expected: > 1 Received: 1`.
The only red of the run. Ruled residue, not a gate stop
(`add-vitals-strip-rulings.md` FULL-AUTO RULING 54). Three occurrences in four
completed gate runs: the tier-4 fixture policy for random spawns is now the
suite's most frequent red and is still unchosen.

## Occurrence — 2026-10-04, `lift-burn-preview-to-view` archive gate, tier 4 run 1

`space-double-submit.spec.ts:267` (`:277`), "a generated system carries several
ordinary bodies": Expected > 1, Received 1. Same assertion, same message. 23
passed / 2 failed in 366 s; no SIGTERM. Treated as residue under
`lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 23.

## Occurrence — 2026-10-05, `add-burn-cost-overlay` archive gate, tier 4 (single run)

`space-double-submit.spec.ts:267`, same message and assertion (`Expected: > 1
Received: 1` at `:277`), failed in 2.8 s; 31 other tests passed including the
change's own journey. Ruled residue: `add-burn-cost-overlay-rulings.md`
FULL-AUTO RULING 21 (spec and backend diff empty for the change).
