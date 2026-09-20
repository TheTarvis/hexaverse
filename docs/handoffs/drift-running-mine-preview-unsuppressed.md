# Drift — the running-mine preview suppression is specified, tested, and never wired

**Status:** confirmed, adjudicated **code wrong**, deferred by one chain link.
**Found:** 2026-09-09, by the `add-vitals-strip` design analyst reading
`SpaceCommandPanel.tsx` against the live `system-space-view` spec.
**Owner:** the `add-burn-cost-overlay` change (link 2a-ii of the system-HUD
chain), which owns the burn-preview lift.

## The requirement

`openspec/specs/system-space-view/spec.md`, *Burn Preview Reflects the
Server-Solved Order, Without Committing*, states that a preview **SHALL NOT** be
requested while the acting fleet's movement channel is claimed by a running
mine, with the scenario *No preview is requested while a mine holds the movement
channel*.

## The code

`frontend/components/space/SpaceCommandPanel.tsx:109–115` — the **only**
production call site of the preview hook — passes:

```ts
commitWouldBeAccepted: !!fleet && !fleet.jump,
```

`mineRunning` is in scope on that component (it arrives as a prop and is already
used to disable the commit button) and is **not** part of the flag. So in the
running application a preview is requested every `PREVIEW_REFRESH_MS` for the
whole duration of a mine run that holds the movement channel.

## Why the suite is green

`frontend/hooks/use-burn-preview.test.tsx:123` covers the scenario by passing
`commitWouldBeAccepted: false` **into** the hook — it proves the hook honours the
flag, never that any caller sets it. `SpaceCommandPanel.test.tsx` mocks
`@/hooks/use-burn-preview` wholesale, so the panel's own suite cannot observe
the argument it passes.

This is the handoffs README's **lesson two** exactly: "a requirement exists, a
test for it exists and passes, and the behaviour is still broken, because the
test is shaped so it cannot observe the failure." Third instance of the
mocked-collaborator variant on this chain.

## Adjudication

Code is wrong; the spec is right. Per
`.claude/skills/openspec-team-workflow/SKILL.md` § "Spec-first invariant", that
routes to a corrective implementation task, **not** to a spec change — the fix
makes an existing live scenario true rather than altering what is required. No
delta is needed.

## Why it is not fixed in `add-vitals-strip`

`add-vitals-strip` was split at the burn-preview lift
(`add-vitals-strip-rulings.md` FULL-AUTO RULING 9), so it no longer touches this
call site. Fixing it there would be an unspecced edit to a file the change
otherwise leaves alone — a diff exceeding the change's stated Impact, which the
workflow skill treats as a finding against the developer.

## The fix, when `add-burn-cost-overlay` lifts the call site

The lift moves this expression into the mounting view. Carrying it up unchanged
carries the defect up. It must become the equivalent of:

```ts
commitWouldBeAccepted: !!acting && !acting.jump && !mineRunning
```

with a **view-level** test — one that observes the argument the real call site
passes, not one that passes the flag into the hook by hand. A test that mocks
the hook cannot close this finding.
