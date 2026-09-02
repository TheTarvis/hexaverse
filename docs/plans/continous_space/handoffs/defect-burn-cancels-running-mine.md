# DEFECT: ordering a burn silently destroys a running mine

**Found** 2026-09-02 by link 8a-1's SDET, while trying to build a fixture for a scenario
that assumed the opposite. **Verified independently.** **Status:** OPEN, out of scope for
link 8a-1 — see *Scope*.

## What happens

`backend/fleet/service.go:629-637`, `OrderTo`'s re-task branch:

```go
// Re-task: release the current slot before claiming a new one (a running
// action while ordering is the norm mid-burn). …
if f.ActiveActionId != "" {
    cancelState := map[string]interface{}{"updatedAt": int64(now)}
    if fuelActive && refund != 0 { cancelState["cargo"] = … }
    if _, err := s.actions.Cancel(ctx, f.ActiveActionId, cancelState); err != nil && …
}
```

It cancels the active action **whatever its type**. The comment states the assumption in
its own words — "a running action while ordering is the norm mid-burn" — i.e. it was
written for re-targeting a burn.

But `mine` commits on the **movement** channel too (a run gates move + mine). So a fleet
mid-mine that is ordered to burn has its mine run cancelled: HTTP **200**, no warning, no
confirmation, and no compensation — `refund` is `priorBurnRefund`, which is burn-specific
and zero here. The pending yield simply never lands.

Measured by the SDET on this tree: a burn commit against a fleet whose movement channel is
held by a running mine is **accepted**.

## Why it may or may not be a bug

Defensible as designed: the movement channel is single-slot, you chose to fly away, so you
abandon the dig. What is *not* defensible is that it is **silent and unspecified**. A
player loses a committed run with no rejection, no warning, and no acknowledgement, and
nothing in `mine-extraction` or `fleet-movement` says this is what happens.

Contrast the care taken elsewhere on this exact path: the burn's own re-task refunds
unspent fuel, and `fleet-movement` explicitly forbids cancelling a running burn "only to
have the replacement re-target rejected, leaving the fleet drifting with no active order".
The same attention was never paid to a non-burn occupant of the slot.

## Scope: why NOT fixed in link 8a-1

8a-1 is explicitly additive — "leave the uncapped path byte-for-byte unchanged". Changing
whether a burn commit rejects, warns, or proceeds is a behavioural change to the commit
path, and a gameplay decision rather than a spec tidy-up.

It surfaced there only because 8a-1's *A preview is refused wherever the commit would be
refused* lists a running-mine sub-case — asserting a commit rejection **that does not
exist**. That scenario is factually wrong about the commit path and is being corrected;
this defect is recorded separately rather than smuggled into an additive change.

## What a corrective change must decide

1. Does a burn commit **reject** while a mine runs (making the player cancel explicitly),
   or **proceed with an acknowledgement** that the run is forfeit? Rejecting is safer;
   proceeding is fewer clicks. This is Travis's call, not an implementer's.
2. If it proceeds, is anything owed back? Today a mine costs nothing up front, so there is
   nothing to refund — but that is a property of the current mine economy, not a rule.
3. Whichever is chosen, `mine-extraction` and `fleet-movement` must both say so; today
   neither does, which is why an SDET could write a scenario asserting the opposite and
   nothing contradicted it.

## Test shape

The reproduction is cheap and was already built: commit a mine, then order an **affordable**
burn on the same fleet. Two traps the SDET hit first — a fleet carrying the suite's
million-ton fuel load is rejected by `mine`'s free-hold clamp before it can mine at all,
and a fleet poor enough to mine then fails the burn for *insufficient fuel* rather than the
held channel. Price the burn to something the fleet can actually pay.
