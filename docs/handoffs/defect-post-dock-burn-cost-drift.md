# Defect — a burn's solved cost drifts ~23% above its quote after docking

**Status:** open, **captured** (a real response body, not an inference).
**Found:** 2026-09-09, tracing `add-vitals-strip`'s archive-gate reds.
**Adjudicated:** `add-vitals-strip-rulings.md` FULL-AUTO RULING 41.

## Evidence, verbatim

```
HTTP 409
{"error":"fleet: solved fuel cost exceeds the requested maxFuelTons cap",
 "fuelCostTons":6.1296,
 "maxFuelTons":4.99488}
```

`ErrQuotedCapExceeded` — `backend/fleet/handler.go:480-494`, raised at
`backend/fleet/service.go:807`. The fleet was **docked**, holding **69.37 t** of
fuel, so this is not a fuel shortage: it is a *quote* that no longer matches the
solve.

`maxFuelTons` 4.99488 is the preview's cost plus the 10 % `BURN_FUEL_ALLOWANCE`.
The commit-time solve came back **6.1296** — **+22.7 %** over the cap, well
outside the margin.

## Why the margin is not the answer

`SpaceCommandPanel` re-quotes when a commit is refused for cap-exceeded, and that
is the **specced** quote-lock behaviour: `system-space-view`, *A Burn Commit Is
Quote-Locked to the Preview the Player Agreed To*. Widening
`BURN_FUEL_ALLOWANCE` until the drift fits would weaken a live requirement to
make a test pass. **Do not do that.**

## The actual question, unanswered

Why does a solve taken moments after a preview differ by 22.7 %, when the fleet
has not moved — it is docked? Candidates, none confirmed:

- The preview was taken **before** arrival settled and the commit **after**, so
  the two solve from different origin states. This is the leading suspicion,
  because the sequence that produces it is burn → dock → immediately order again.
- Orbital motion of the target between preview and commit — plausible in
  continuous space, but 22.7 % is large for a few seconds.
- The docked origin is the *host body's* position at one instant and the fleet's
  parked position at another.

## Player-facing consequence

The player sees a burn refused that they were just quoted for, and only the
re-quote saves them. It is correct-but-confusing today; it becomes a real
usability problem on any surface that shows the cost prominently — which is
precisely what link 2a-ii (`add-burn-cost-overlay`) is about to build on the
vitals strip's fuel gauge.

## What would make this stale

A confirmed explanation for the drift, or a requirement stating what a preview
guarantees about the solve that follows it. Until then the cause is checkable in
one step: log the preview's and the commit's solve inputs for the same order and
diff them.

## Candidate occurrence, unverified — 2026-10-04 (`clear-burn-preview-on-commit` gate rerun)

`frontend/e2e/tests/space-journey.spec.ts:85` failed at `:244`: at its step 7
(the burn to the lane gate after dock → sell → refuel) the click sent
`POST …/orders` and the server answered a single **409** (17:02:27); the roster
row stayed "Docked". Request, status and sequence fit this defect, **but the
409 body was not captured** (the e2e backend log holds no response bodies and
no Playwright trace was recorded), so the recorded signature — the
`ErrQuotedCapExceeded` body — is not verified and this is NOT counted as a
match. Evidence: `clear-burn-preview-on-commit-journey.md`, "Gate rerun — tier
4". To settle it: record a trace on that leg, or log 409 bodies in the e2e
backend.

## Candidate occurrence, unverified - 2026-10-05 (`add-console-dock` gate run 1)

`frontend/e2e/tests/committed-selection-journey.spec.ts:395` failed at `:828`
("commit 2 (arrives): the commit was not accepted: HTTP 409"). Sequence
(fleet `fleet_cb439941-...`, backend log 01:59:22-01:59:28): commit 1 `POST
.../orders` 200 at 01:59:23; `POST .../cut-drive` 200 at 01:59:27 (480 ms); a
fresh `POST .../orders/preview` 200 at 01:59:27; the Burn click, `POST
.../orders` **409** at 01:59:28 (27.8 ms), then `POST .../orders/preview` 200
at once (the specced re-quote). The fleet was parked mid-flight after the cut,
not docked, and the 409 printed no `fleet: burn solve refusal served` line.
Request, status, short quote-to-commit gap (about 1 s) and immediate re-quote
fit this defect, **but the 409 body was not captured** (the spec asserted the
status before reading the body; the e2e backend log holds no bodies), so this
is NOT counted as a match and the residue rule does not apply on this
evidence. Evidence: `add-console-dock-journey.md`, "Red 2". The spec now logs
a refused commit's body as `[journey-http]` (revision round) so the next
occurrence can be attributed.

## Candidate occurrence, unverified - 2026-10-05 (`keep-console-tab-content-mounted` gate run 1)

`frontend/e2e/tests/burn-geometry-refusals-journey.spec.ts:59` failed at its
step 4 (`:88`, the departure burn out of the station's orbit), inside the
shared helper `burnToSelectionAndDock` at `frontend/e2e/helpers/space-view.ts:457`
("the burn must actually be under way, not merely end docked"; the roster row
read `Docked 68.8 t fuel 29.6k range` for the whole 30 s). Sequence (fleet
`fleet_d5319948-...`, `frontend/playwright/.auth/backend.log` 05:16:24-05:16:52):
the arrival burn `POST .../orders` 200 at 05:16:24; a fresh `POST
.../orders/preview` 200 at 05:16:31; the Burn click, `POST .../orders` **409**
at 05:16:32 (10.7 ms) with NO `fleet: burn solve refusal served` line; `POST
.../orders/preview` 200 at once (the specced re-quote). The fleet was docked,
about 8 s after the arrival burn committed. Request, status, the quote-to-commit
gap of about 1 s and the immediate re-quote fit this defect - the third such
sequence in three gates, and the first at this spec - **but the 409 body was
not captured** (the helper asserts on the roster row and logs nothing of the
response), so this is NOT counted as a match. Evidence:
`keep-console-tab-content-mounted-tier4-run1.log` (test 6, failure block from
line 608). That change's production diff is two files
(`components/space/ConsoleDock.tsx`, `components/space/SystemSpaceView.tsx`: an
Escape listener, the log's mount site, one cache invalidation) and touches no
quote, order, fleet-read or command-panel code. In its revision round the
helper gains a log of a refused order's response body, so the next occurrence
at any spec that uses it can be attributed.
