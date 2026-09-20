# DEFECT: a jump never lands in the UI — only the per-fleet read settles it, and nothing calls it

**Found** 2026-09-03 by link 8b's lane-transit fizzle journey, which waited 15 minutes on
three attempts for a roster row that read "In transit now" and never flipped.
**Verified independently** against the code. **Status:** OPEN. Player-facing. Pre-existing
(links 4–5), outside `add-scan-and-sightings-surface`'s Impact — recorded, not fixed there.

## What happens

`backend/fleet/service.go`:

- `Get` (`GET /v1/fleets/:id`, ~line 318-345) settles a due burn AND a due jump
  (`if f.Jump != nil && s.clock.Now() >= f.Jump.ArriveMs { resolveDue }`).
- `ListForCorp` (`GET /v1/fleets?mine=true`, ~line 404-430) settles through `settleIfDue`,
  which folds **burns only** (its own comment: "settleIfDue's ModeBurn-only"). The jump
  branch is deliberately not on it ("Get's signature carries no body table").
- `ListInSystem` settles nothing (8a's H1).

`grep fleetService.get frontend/` returns nothing: the galaxy roster, the space view's
own-fleets read and every hook read `listMine()`. **No production client path ever calls
the one read that settles a jump.** A jumped fleet therefore shows "In transit" — with its
ETA reading "now" — until `POST /v1/push/action-sweep` (Cloud Scheduler, ~15 min, OIDC)
runs `ResolveAllDue`. On the local and test stacks that sweep never runs, so the fleet
never arrives at all.

## Why every gate is green

Link 5's traversability journey (`jump-commit.spec.ts:174`) asserts the row flips to
"In transit" and stops. The root e2e jump tests call `GET /v1/fleets/:id` directly. Chain
lesson one again: the arrival is built, unit-tested, and reached by nothing a player can do.

## What a corrective change must decide

1. Whether the roster read (`ListForCorp`) should settle a due jump too — it needs the
   destination's body table, which is why the jump branch was kept off `settleIfDue`; or
2. whether the client should issue the per-fleet read for a fleet whose transit ETA has
   passed (the space view already self-schedules refetches on ETAs — a jump ETA could
   trigger `GET /v1/fleets/:id` the same way); or
3. whether arrival should ride the SSE `ActionCompleted` event — which only fires when
   something resolves the action, so it does not solve it alone.

Option 2 is the smallest and keeps the fold-first rule intact. Any of them is a
`fleet-roster` / `fleet-movement` delta, Travis's call.

## Test shape

Assert arrival from the **UI**, with no direct API call in the assertion path: commit a
jump, wait past its ETA, and require the roster (or the destination space view) to show
the fleet parked near the destination gate. `jump-commit.spec.ts` should gain that leg.
Link 8b's fizzle journey arranges around this defect by calling `GET /v1/fleets/:id`
itself after the ETA passes; that arrangement is a workaround and is labelled as one.
