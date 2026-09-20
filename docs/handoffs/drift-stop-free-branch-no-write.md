# DRIFT: stop's free branch persists nothing when there is no active action

**Found** 2026-09-02 by link 7b's adversary (round 3), while checking whether the
"hold, stop, pay nothing" repair had a transaction to ride. **Verified independently.**
**Status:** open. Routed into `add-stationkeep-hold-verb` (link 7b), same task as the
hold-settlement fix, because it is the same write on the same branch.

## The finding

`backend/fleet/service.go:829-849`, stop-in-place's free below-the-speed-floor branch:

```go
newState := space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: pos}}
cancelState := map[string]interface{}{
    "state": EncodeKinematicState(newState), "attachedTo": "", "updatedAt": int64(now),
}
if fuelActive && refund != 0 { cancelState["cargo"] = ... }
if f.ActiveActionId != "" {
    if _, err := s.actions.Cancel(ctx, f.ActiveActionId, cancelState); err != nil && ... { return nil, err }
}
f.State = newState        // in-memory only
f.ActiveActionId = ""
f.UpdatedAt = now
return f, nil
```

The branch's **only** persistence is `s.actions.Cancel(ctx, f.ActiveActionId, cancelState)`,
and it is guarded by `f.ActiveActionId != ""`. `Handler.Stop` performs no DAO write of its
own — it responds with the returned struct. So when the fleet has no active movement
action, the assignments to `f` are in-memory only: the `point` park, the cleared
`attachedTo`, and the new `updatedAt` are returned to the caller and then dropped.

The player sees a successful stop in the response, and the next read shows the fleet
exactly where it was.

## Why it survived

The obvious test has an active action. A fleet that is *burning* and then stopped takes
the same branch only if its velocity is at or below the floor — but the natural fixture
for "stop" is a moving fleet with a running burn, which always has `ActiveActionId` set
and therefore always persists. The unwritten case is a fleet that is already parked or
holding, which is exactly the case link 7b introduces a reason to care about (a fleet
station-keeping at a motionless lane gate has velocity exactly zero, so it *always* takes
this branch, and it has no active action because `hold` claims no slot).

This is the chain's *Lesson two* again: a green test that cannot observe the failure,
because its fixture never reaches the branch condition.

## Live requirement it violates

`fleet-movement` — *Stopping at or below the speed floor is instant and free*
(`openspec/specs/fleet-movement/spec.md:369-374`). The requirement is correct as written;
the handler simply never persists on that path. **Code-is-wrong, so no spec delta.**

## Routing

Into link 7b, folded into the task that makes `stop`'s free branch settle an open
station-keeping hold. That task already has to make this branch write unconditionally
rather than only inside `actions.Cancel`, so the two fixes are one change to one write.

Do NOT let the settlement be routed into `cancelState`. An implementer who does will ship
a green test for a *mining* fleet (which has an active action) while forgiving the accrual
for the gate camper — the precise defect the universal hold-ending rule exists to close.

## Test shape

The stop test must use a fleet with **no active action**, and must assert by re-reading
the stored fleet document, not by inspecting the returned struct. Every assertion in this
family is satisfiable by the in-memory return value, which is what hid the defect.
