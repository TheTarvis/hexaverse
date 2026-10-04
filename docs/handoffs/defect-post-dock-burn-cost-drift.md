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
