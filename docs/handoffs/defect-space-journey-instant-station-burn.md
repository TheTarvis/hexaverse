# Defect - space-journey's station burn can be a zero-length flight, so "under way" is never observed

**Status:** OPEN, first occurrence 2026-10-05 (`add-console-dock` archive-gate tier-4 run 1).
**Not this change's:** `add-console-dock` touches no quote, order, fleet-read or command-panel code, and `space-journey.spec.ts` is pre-existing and untouched by it. Passed at the previous gate (`add-burn-cost-overlay-tier4-run1.log` line 308, 33.3 s).
**Owner of the call:** Travis (the tier-4 random-spawn fixture policy). Same family as `defect-spawn-system-single-body.md` and `defect-scan-journey-spawn-in-gate-range.md`.

## Signature (match a later run against this verbatim)

- `frontend/e2e/tests/space-journey.spec.ts:85` fails at **:203**: `await expect(row).toContainText(/under way/i, { timeout: 20_000 })` after the click on `burn-button` at :202 (step 5, the burn to `feat-station`). Playwright text: `Expected pattern: /under way/i`.
- The order answers **200**; there is NO `fleet: burn solve refusal served` line and no 409/4xx on `POST .../orders` for that click.
- The roster row never leaves "Docked": it reads `Docked 69.8 t fuel` then `Docked 67.1 t fuel` (Docked -> Docked, fuel spent 2.7 t, i.e. a burn was paid for and finished).
- The final screenshot's command column reads "Committed at delta-v - arriving now - previewed 19 m/s arriving now", target `feat-station`.
- A market board read follows the order (the sell section exists).

## Evidence from this run

Log `docs/handoffs/add-console-dock-tier4-run1.log`: `space-journey.spec.ts:85` is test 37, failed in 47.7 s (failure block from line 546; assertion at line 566-571; artifacts line 574-578). Backend log (fleet `fleet_7f9603b9-...`): first burn to the lode 02:04:52 (200), mine 02:04:57 (200), third burn commit `Action committed ... eta=119773550843 type=burn` then `POST .../orders status=200` at 02:05:09-10 (426 ms), market board read 02:05:18. No refusal line. The ETA arithmetic bounds the burn's wall duration at about 2.4 s (eta 550843 vs the first burn's 478971 plus 12 s of wall at scale 5), under the spec's poll interval, so the first post-order `GET /v1/fleets` already saw it docked.

## Why this is a fixture draw, not a product defect

The mining lode (`feat-body-3`, chosen by `pickFarLode`, which excludes only the station's feature id) was essentially co-located with the home station, so the burn from the lode to `feat-station` is a near-zero-length flight whose quote itself says "arriving now". The home system is an account-seeded random draw. The spec's own leg-3 comment records the identical hazard for the first burn ("can legitimately sit close enough to spawn that the burn settles before this leg's own 'must observe Under way' guard ever samples it"); the step-5 guard at :203 has no equivalent protection.

## Candidate fixes (Travis's call)

1. Make `pickFarLode` also exclude lodes near the station (a distance floor), so the station burn always has an observable flight.
2. Read the previewed arrival (`preview-arrival`) before the click and, when it is below one read interval, accept the docked-with-fuel-spent end state and mark the leg UNTESTED rather than failing; keep the guard for every flight long enough to observe.
3. Pin the tier-4 spawn (fixture policy) so the home system is deterministic. This is the broader fix for the whole spawn-draw family.

Do not weaken the guard for long flights.

## What would make this stale

A fixture policy that pins or filters the tier-4 spawn, or a rewrite of step 5.
