# keep-console-tab-content-mounted - journey record

SDET, 2026-10-05, HEAD `f955854`. Evidence: `docs/handoffs/keep-console-tab-content-mounted-tier4-run1.log` (cited as `log:N`), `frontend/playwright/.auth/backend.log`. Diagnosis from files only; the orchestrator ran the stack.

## Run 1 (tier 4) - outcome: RED, 44 passed / 1 failed, the failure is not this change's

- START `log:1`: Mon Oct 5 05:15:42 EDT 2026, load { 3.75 10.77 11.26 }. END `log:660`: 05:24:21, exit=1, wall=519 s, load { 14.69 15.77 14.18 }. No `Received SIGTERM` in the log.
- This change's journey: 6 of 6 tests passed (`log:418`-`501`); `[journey-ran] ... ALL 13 legs accounted for; must-PASS legs PASSED; settle leg ... reached and PASSED` (`log:497`).

### Legs

| Leg | Class | Outcome | Deciding log line |
|---|---|---|---|
| expand-load-more | must-PASS | PASSED | `log:` summary `[journey-summary] expand-load-more (MUST PASS): PASSED` (leg line at the first test, wire: 2 answered unfiltered reads after load more, none from the expansion) |
| escape-same-node | must-PASS | PASSED | tagged node survived collapse and re-expansion: true; region computed display while collapsed = none (`log:399`) |
| scroll-offset | OBSERVED | OBSERVED | scrollTop=240 before the collapse and 240 after the re-expansion (scrollHeight 3360, clientHeight 127); logged, never asserted (RULING 8) |
| highlight-survives | - | PASSED | `[journey-leg] highlight-survives: PASSED` (home-record row on page two) |
| menu-open-escape | must-PASS | PASSED | `log:420` |
| press-on-dock-not-a-pick | must-PASS | PASSED | `log:432`; selection after the pick `feat-belt-0`, acting fleet row `data-active=true`; Load more had nothing to press (all pages loaded, `log:429`) |
| escape-from-camera-control | must-PASS | PASSED | `log:434` |
| failed-while-collapsed | must-PASS | PASSED | forced-failure count 1 before and 1 after the expansion (`log:440`+) |
| settle-reread-collapsed | must-PASS-when-reached | PASSED (reached: commit accepted) | `log:463`; SETTLE EXIT = eta (scan POST #23, commit->report 1402 ms); 7 answered unfiltered reads before and after the expansion, zero caused by it |
| warm-return | - | UNTESTED | no interior request on the return (inside the 60 s stale time); latch is tier 1: 1.13, 1.14, 1.15 |
| select-popup-escape | OBSERVED | OBSERVED | after Escape with the select focused and (attempted) popup open, the dock was collapsed (RULING 6, not asserted) |
| toast-escape | OBSERVED | OBSERVED | 0 toasts on the view; nothing to focus, so nothing observed |
| other-system | - | UNTESTED by design | no player path reaches another system for a one-hull corp without a jump; tier-1 cover is the keyed remount in 2b-i |

### Budgets

- Seed: `log:385` 103 ms for 52 records against the `beforeAll` 60 s budget (does not threaten it).
- Per-test (of 60000 ms): test 1 5016 ms, test 2 4225 ms, test 3 3653 ms, test 4 10710 ms, test 5 1988 ms, test 6 2 ms.
- Settle exit: eta.

### 4xx/5xx and console lines from this change's journey

- `[journey-http] 404 GET /v1/accounts/firestore` and `404 GET /v1/corporations/me` (test 1): the fresh corp's wake-up bootstrap, with the two `/login?signUp=true` 404 console errors. Expected, the same lines every journey prints.
- `[journey-http] forced 500 #1` / `500 GET /v1/sightings` and the one `/systems/sys_6_0` 500 console error (test 3): the deliberately forced failure of leg failed-while-collapsed. Expected.
- Update-depth lines: 0 in every test.

### QA rows closed

- Row 25 (pointer press on the dock leaves the selection): CLOSED by `press-on-dock-not-a-pick` PASSED, `log:432` (selection stayed `feat-belt-0`, acting fleet unchanged). Caveat: Load more was not on the view, so that one part of the dock was not pressed; tablist, tab, panel area, Refresh and a row were.
- Row 4 (highlight not presented while collapsed) and row 5 (nothing reachable while collapsed): stylesheet half closed by `region computed display while collapsed = none`, `log:399`, plus `escape-same-node` PASSED.
- Row 15 (Escape from outside the dock keeps focus): confirmed against the real stage by `escape-from-camera-control` PASSED, `log:434`.

### Other 39 tests

Of the other 39 tests, 38 passed and 1 failed (below); 44 passed in total with this change's 6.

### The one red, attributed

`frontend/e2e/tests/burn-geometry-refusals-journey.spec.ts:59`, failing at `:88` inside `burnToSelectionAndDock` (`space-view.ts:457`): the roster row read `Docked 68.8 t fuel 29.6k range` for the whole 30 s guard.

Attribution: UNVERIFIED, NOT this change, probably the open `defect-post-dock-burn-cost-drift`. I agree with the orchestrator's reading from the backend log, fleet `fleet_d5319948-...`:

- 05:16:24 arrival `POST .../orders` 200.
- 05:16:31 `GET /v1/fleets?mine=true` (took 2.2 s), `GET scan-targets`, `POST .../orders/preview` 200.
- 05:16:32 `GET /v1/systems/sys_3_-5` (2.9 s), `GET scan-targets`, then `POST .../orders` **409** (10.7 ms), with NO `burn solve refusal served` line, then `POST .../orders/preview` 200 at once.
- Nothing else is in between. The 409 body was not captured, so the cause (the quote going stale against the just-docked fleet's position) cannot be proven.
- The earlier 409 preview and 409 order at 05:16:23-24 belong to step 3 of the spec (the served refusal, intended).

Bearing of this change's production diff (`git diff 9648346 41ae157 -- frontend/components frontend/hooks frontend/lib`: `ConsoleDock.tsx`, `SystemSpaceView.tsx` and tests only; an Escape listener, the log's mount site, one cache invalidation): none on the quote/order path. The extra `GET /v1/sightings` at view open appears at 05:16:23 (backend log lines 224-229), before the arrival burn; NO sightings read sits between the 05:16:31 preview and the 05:16:32 order. A sightings read cannot touch the preview or the order bodies in any case; it is a separate query key. (The post-settle log re-read of this change fires only after a sweep settles, not on a burn.) Residual: the added mount-time reads and the unrelated 2-3 s `fleets`/`systems` reads under load 14-15 could widen the quote-to-commit window; that is load, not a defect of this change.

## Batched revision round (test side, one edit)

`frontend/e2e/helpers/space-view.ts`, `burnToSelectionAndDock`: a `page.on('response')` listener around the Burn click logs `[journey-http] <status> POST <url> burnToSelectionAndDock body=<text>` for any `POST .../orders` answered 4xx/5xx, detached after the `under way` guard settles (`.finally`). Log only: no assertion, timeout or order changed; the listener never awaits the response, so a swallowed click (no request) still fails on the existing guard exactly as before. Type-check and ESLint clean.

Other run-1 findings for the round: none in this change's journey spec.

## Gate rerun - tier 4

(empty, to be filled after the orchestrator's rerun)

## Tier 3

(empty, to be filled)

## Suite budget line

(placeholder: tier 3 wall time ___ ; tier 4 wall time run 1 519 s, rerun ___ )
