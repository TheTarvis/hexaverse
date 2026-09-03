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
