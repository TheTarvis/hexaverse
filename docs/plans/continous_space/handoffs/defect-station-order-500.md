# DEFECT: ordering a burn to your home station 500s roughly 2% of the time

**Found** 2026-09-02 by link 7b's SDET, chasing a test that flaked 1 run in 10.
**Caught in the act** with a server log, not inferred.
**Status:** OPEN. Deliberately NOT folded into link 7b — see *Scope* below.

## What happens

```
{"level":"error","error":"fleet: solving burn: space: endpoint at or inside
 the star-clearance radius", …}
POST "/v1/fleets/{id}/orders"  ->  500   (bodyless)
```

`space.ErrEndpointInsideClearance` (`backend/space/burn.go:179`, returned at `:283`)
escapes `fleet.Service.OrderTo` and falls through `respond`'s default arm.

## Why it is intermittent

The solved **insertion standoff** point is offset from the target body, and that offset is
added to the host's own orbit radius. A host whose orbit sits only a little outside the
star clearance is therefore inside it *for some arrival phases and outside it for others*
— so the same order against the same station succeeds or fails depending on where the
station is in its orbit at the solved arrival instant.

The captured case: a station provisioned at ring 4 of `sys_3_2`, star size 5.2, clearance
13.0. Failures are geometry-clustered rather than uniform — 0 failures across a 40-spawn
sample, then 1 in 10 runs against the unlucky one. `SeedFleet` already refuses to place a
fleet inside the clearance, so the *origin* endpoint is never the guilty one; it is always
the destination standoff.

## Two separable problems

1. **The geometry.** A legitimate order to a legitimate body fails. This is the real bug.
   Ordering a burn to your own home station is the most ordinary thing a player does.
2. **The response shape.** Whatever the geometry does, the failure surfaces as a bodyless
   `500`, indistinguishable from a server fault, and logged at error level so genuine
   faults and ordinary geometry are mixed in the logs.

## Scope: why this is NOT in link 7b

Link 7b repairs exactly this switch (four sentinels that fell through to a bodyless 500),
so folding in a fifth is tempting. I did not, because unlike the other four **this one has
no live requirement to repair against**. The live scenario *Ordering the star's own body id
is rejected by geometry* (`openspec/specs/fleet-movement/spec.md:218-226`) says only that
the order "is rejected … with no destination-identity check having run" and that no burn is
stored. It demands no named reason and no status, so mapping it is a NEW requirement, not
drift — and problem 1 is not a response-shape question at all.

Adding it to 7b would mean writing new requirement text inside a change already through
four adversary rounds, for a defect that wants its own analysis of the standoff geometry.

## What a corrective change needs to decide

- Should the standoff be clamped outward to the clearance radius rather than rejected, so
  a reachable body stays reachable at every orbital phase? That is a gameplay call, not
  only a numerical one — it changes where a fleet parks.
- If rejection is kept, the reason must be reason-bearing and distinguishable from the
  star case, and the spec must say so (today neither is required).
- Either way the star case must keep working *by geometry*, with no destination-identity
  special case — the live requirement forbids one explicitly, twice.

## Test shape

Do not chase this with a retry. The SDET deliberately did not add one, and did not dodge
it by changing what the fixture targets — either would have hidden a live defect. The
reproduction is a station-targeted order against an unlucky spawn; the diagnosis is
recorded in `arriveInOrbitAround` (`backend/stationkeep_e2e_helpers_test.go`) so a future
red is understood in seconds rather than re-derived.

**Residual risk until fixed: ~2% per station-targeted order.**

## ESCALATED 2026-09-02 — this now blocks the quality gate, not just a test

When first recorded this was latent: ~2% per station-targeted order, invisible unless you
were unlucky. It is no longer latent. The suite has grown to ~1984 tests, a large and
growing share of which arrange a fleet by ordering a burn to a station, so a full
`/check` run now hits it **more often than not** — it took out the 8a-1 gate run at
`stationkeep_hold_verb_e2e_test.go:216`, in a test's *arrangement*, with nothing wrong in
either the test or the change under gate.

That changes the scoping calculus. It was reasonable to defer a latent 2%; it is not
reasonable to leave a defect that makes the project's own gate unreliable, because a gate
that is red for a known-irrelevant reason trains everyone to ignore red gates. This chain
has already catalogued what that costs (`README.md`, Lesson two).

**It still cannot be fixed by an agent alone**, and that has not changed: the repair is a
gameplay decision about where a fleet parks. Either the insertion standoff clamps outward
to the clearance radius — keeping a reachable body reachable at every orbital phase, at the
cost of changing park positions near the star — or rejection is kept and the reason becomes
reason-bearing and distinguishable. The first unblocks the gate; the second does not.

**Recommended priority: next, ahead of further chain links.** It is cheap relative to what
it is costing, and every additional e2e test makes a full green run less likely.

## WIDENED 2026-09-03 — this is a family, not one sentinel

Link 8a-2's SDET hit a second member on the same path:

```
POST /v1/fleets/:id/orders        -> 500
POST /v1/fleets/:id/orders/preview -> 500
fleet: solving burn: space: curve length below the configured minimum
```

So at least **three** `space` solver sentinels escape `fleet.Service.OrderTo` into
`respond`'s default arm as a bodyless 500: `ErrEndpointInsideClearance` (this document),
`ErrCutAfterArrival` (fixed in link 7b), and now the minimum-curve-length guard, which
fires when the target is very close to the fleet.

Two consequences beyond the bad status code:

1. **A user-caused geometry condition is reported as a server fault.** Ordering a burn to
   something very near you, or to a body whose standoff dips inside the star clearance, are
   both ordinary player actions.
2. **It breaks a requirement 8a-1 just shipped.** *A preview is refused wherever the commit
   would be refused* cannot hold while both sides answer 500 — the preview endpoint exists
   precisely so a player can discover a refusal without committing, and a 500 tells them
   nothing about which refusal it is.

It also makes `TestPreview_Scenario_RefusedForAFleetInLaneTransit` intermittently red,
seed-dependent, in a file nobody in that pass had touched.

**This strengthens the escalation above.** The corrective change should sweep every `space`
sentinel reaching `respond`, not map them one at a time as each is discovered — three have
been found by accident, one per link.

---

## Recurrence 2026-09-09 — still open, and it cost another archive gate

Hit again during `add-figure-formatting`'s tier-4 archive gate (link 1 of the
system-HUD chain), in `e2e/tests/scan-journey.spec.ts:307` — the burn to the home
station leg. Same signature, captured the same way:

```
POST /v1/fleets/…/orders/preview  500
  error="fleet: solving burn: space: endpoint at or inside the star-clearance radius"
POST /v1/fleets/…/orders          500
  error="fleet: solving burn: space: endpoint at or inside the star-clearance radius"
```

Fleet `fleet_0b6a2717-…`. The **preview 500'd too**, which the original report does not
record — worth noting, because it means the player is not merely refused at commit;
they are refused a quote as well, so the surface has nothing to show and no reason to
give. `system-space-view`'s *A Failed or Stale Preview Is Never Presented as a Current
Quote* handles the display side correctly, but the underlying refusal is this defect.

**One correction to a diagnosis made in this run.** The SDET investigating it, without
having found this file, reasoned the failure looked **deterministic** — the failing case
was the shortest possible burn (home station, immediately after spawn, near-zero
displacement) while every other burn-to-station in the same run succeeded after an
intervening mine run. That inference was reasonable and wrong: this file's original
analysis is better, and explains why. The standoff offset is added to the host's own
orbit radius, so a station whose orbit sits just outside the clearance is inside it
**for some arrival phases and outside it for others** — the same order against the same
station succeeds or fails depending on where the station is in its orbit at the solved
arrival instant. Zero displacement is not the variable; arrival phase is. Expect it to
recur intermittently rather than reliably, which also means **a green rerun does not
mean it is fixed**.

**Still not folded into the change that found it**, for the same reason as 2026-09-02:
`add-figure-formatting` is UI-only, touches zero backend files, and its chain
(`docs/plans/system-hud/chain.md`) forbids backend work outright — "a link that finds
itself wanting a new field is mis-scoped".

**A second, smaller defect rides along and is worth fixing at the same time:** the error
is *unmapped*. `backend/fleet/handler.go`'s switch has no case for
`space.ErrEndpointInsideClearance`, so it falls through to a bare bodyless 500. Even
while the geometry question is open, a reachable, player-selectable target should never
produce an unmapped 500 — `docked-fleet-actions`' *Rejection Reasons Map to
Player-Facing Copy, Not Raw Server Text* is the standing rule that arm violates.

## 2026-09-09, second observation — a test is misattributing this defect to fuel tuning

The `add-figure-formatting` archive-gate **rerun** hit this defect twice more in tier 3
(1875 tests, 1 skipped, 2 failures, 972s). Both failures are this signature:

```
fuel_stranding_and_range_e2e_test.go:239
  order to home station: status = 500

fuel_spawn_starting_fuel_e2e_test.go:236
  sample account #3: default order to home station rejected (status = 500)
```

Three occurrences across two runs (run 1: `fuel_discard_refund_e2e_test.go:126`), each in
a different fuel test, each on the burn to the home station — consistent with the
arrival-phase intermittency this file already describes, and inconsistent with any
per-test cause.

**The finding worth acting on.** `fuel_spawn_starting_fuel_e2e_test.go` converts that 500
into a conclusion about *fuel economy*:

```
fuel_spawn_starting_fuel_e2e_test.go:249
  1/8 sampled accounts could not afford their own default spawn-to-home-station burn —
  per this requirement's own instruction, a failing sample is a signal to retune
  FuelParams.StartingFuelTons, never to relax this requirement
```

That is a **misattribution**, and a costly-shaped one. The sample did not fail on
affordability; it failed on an unmapped 500 from the clearance-radius guard. A reader
following the message's own instruction would retune `FuelParams.StartingFuelTons` — a
game-balance constant — to work around a geometry defect, and the retune would appear to
work, because raising starting fuel changes which arrival phases the solver reaches.

This is the same species as the "A TIMEOUT IS NOT AN ASSERTION FAILURE" banner already
recorded in this directory: a failure mode whose surface reading points at the wrong
subsystem. The fix is the same shape too — the test should distinguish *rejected because
unaffordable* (the condition it means to sample) from *rejected with an unmapped 500*
(this defect), and say which. Until it does, this defect is capable of silently
consuming a balance-tuning cycle.

That distinction becomes trivial once the handler-mapping half of this defect is fixed:
a mapped, distinguishable rejection reason is exactly what the test needs to tell the two
apart.

## Where to look — the signature is NOT in the Playwright report

Recorded 2026-09-09 because it just caused a misattribution (below): grepping
`frontend/playwright-report`, Playwright's stdout, or `frontend/test-results/**` for
`status = 500` / `409` finds **nothing** for this defect. Playwright's own failure output
only ever shows the *symptom* one layer up — e.g. `refuel-commit.spec.ts`'s
`burnToSelectionAndDock` reporting "the burn must actually be under way, not merely end
docked" with the row stuck on `On station`. **The signature itself lives in the TEST
BACKEND's own log**, `frontend/playwright/.auth/backend.log` (written by
`e2e/setup/backend-stack.ts`'s spawned `ENV=test` backend process, never surfaced into
the Playwright report). Grep that file for:

```
grep -n 'endpoint at or inside the star-clearance radius' frontend/playwright/.auth/backend.log
```

which shows both the structured `ERR fleet operation failed error="…"` line and the
paired `[GIN] … | 500 | … POST ".../orders"` (and usually `.../orders/preview`) access-log
line for the same fleet id and timestamp. A grep of the Playwright-side artifacts alone —
report, stdout, `test-results/**/error-context.md` — will find nothing and wrongly
conclude this defect is not in play.

## Recurrence 2026-09-09 (third) — `add-vitals-strip` archive gate, `refuel-commit.spec.ts`

Hit a third time, in `add-vitals-strip`'s tier-4 archive gate (link 2a), same suite family
as the two 2026-09-09 recurrences above but a different spec:
`e2e/tests/refuel-commit.spec.ts:99` → `helpers/space-view.ts:457`
(`burnToSelectionAndDock`, the burn to the home station leg). Same signature, captured the
same way, fleet `fleet_cd3dccca-2ee0-455f-bceb-beb3e96e91ab`, `06:13:01`:

```
frontend/playwright/.auth/backend.log:
ERR fleet operation failed error="fleet: solving burn: space: endpoint at or inside the star-clearance radius"
POST /v1/fleets/fleet_cd3dccca…/orders/preview  ->  500
POST /v1/fleets/fleet_cd3dccca…/orders          ->  500
```

`add-vitals-strip` is frontend-only (impl contract §0: "no wire change, no new served
field") and its chain forbids backend work the same way `add-figure-formatting`'s did, so
this is recorded and NOT fixed here, per the pattern established above. First-pass
attribution on this run's tier-4 report incorrectly concluded "no known-defect signature
present" from a `grep` over the Playwright log alone (see *Where to look*, above) — caught
and corrected before the gate closed.
