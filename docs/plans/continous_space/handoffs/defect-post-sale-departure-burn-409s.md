# Defect — the departure burn after a sale is rejected 409, twice

**Status:** open, needs confirmation. **Found:** 2026-09-09, by the SDET diagnosing
`add-figure-formatting`'s tier-4 archive gate. **Not fixed there** — that change is
UI-only, touches zero backend files, and its chain forbids backend work.

## Evidence

`frontend/playwright/.auth/backend.log`, fleet `fleet_dab3894e-…`, across
`e2e/tests/slice.spec.ts:80` (wake → mine → sell → fly to a gate → jump):

```
1:15:00  POST …/orders  200   burn to the mineable body      — accepted
1:16:00  POST …/orders  200   burn to the station            — accepted
1:16:21  POST …/sell    200   the sale settles               — so the fleet IS docked
1:16:40  POST …/orders  409   burn to the departure gate     — REJECTED
1:16:41  POST …/orders  409   same, again                    — REJECTED
```

The click landed and the request was well-formed — three earlier commits on the same
code path succeeded. The **server** refused it. The roster row reading `Docked` was
accurate; no order got through.

## The suspicion, stated as a suspicion

409 is shared by several state-precondition rejections in `backend/fleet/handler.go`,
most notably `action.ErrActiveActionExists` — the single-slot movement-channel claim.
The suggestive detail: `GET /v1/actions?actor=…&status=running` — one of the folds
that resolves due actions and releases a channel's claim — last fired for this fleet
at **1:15:41** and never again, including through the 1:16:00 burn, the 1:16:21 sale,
and the two rejections.

The fleet's *kinematic* state clearly resolved (a sale requires `attachedTo`), so if
the Action ledger's claim only clears via that specific poll, a legitimate follow-on
order can be refused by a claim that is administratively stale while the fleet is
observably idle. **This is a hypothesis, not a conclusion** — the log format does not
carry response bodies, so the exact 409 branch is unconfirmed. A developer should
verify against the `action`/`fleet` resolve path before treating the mechanism as
established.

## Why it is not `add-figure-formatting`'s

That change's diff is presentation-only: `SpaceCommandPanel.tsx`'s `commitBurn`,
`burnGuard.claim()`, mutate and `onError` block are byte-identical before and after
(verified). No backend file is touched.

## Reproduction confidence

Lower than its sibling defect. This looks timing-dependent — which reads happen to
fire before the click — so it may pass on a rerun. **A green rerun would not mean it
is fixed.** The underlying gap is real either way.

## Correction to the hypothesis above, made before anyone chases it

The stale-single-slot-claim theory is **weaker than it first looks**, and whoever picks
this up should not start there without checking. `defect-burn-cancels-running-mine.md`
records that `backend/fleet/service.go:629-637` — `OrderTo`'s **re-task branch** —
*already releases the current slot before claiming a new one*:

```go
// Re-task: release the current slot before claiming a new one (a running
// action while ordering is the norm mid-burn). …
if f.ActiveActionId != "" { … s.actions.Cancel(ctx, f.ActiveActionId, cancelState) … }
```

If that branch is reached, `action.ErrActiveActionExists` should not fire at all — which
means either the 409 is a **different precondition entirely** (lane transit, an
attachment state, or a mine holding the movement channel, each of which shares the 409
arm), or the re-task branch is not being reached on this path.

So the useful first question is not "why did the claim go stale" but **"which 409 branch
actually fired"** — and the log format not carrying response bodies is precisely what
blocks answering it. Capturing the response body, or adding a distinguishable reason
code to that arm, is the cheapest next step.

Note the irony worth recording: `defect-burn-cancels-running-mine.md` is open because
that release branch is **too eager** (a burn silently destroys a running mine). This
defect is about an order being refused as though the slot were still held. They may well
be two faces of the same under-specified claim lifecycle, and are worth reading together.
