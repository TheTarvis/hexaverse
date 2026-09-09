# DEFECT: `useRefuel`'s `{ tons }` branch mints a NEW operation key on every transport retry

**Found** 2026-09-09 by the reliability panel reviewing `fix-mutation-retry-on-4xx`
(FOLLOW-UP A). Verified in code by the orchestrator the same day.
**Status:** OPEN. Deliberately NOT fixed in `fix-mutation-retry-on-4xx` — see
*Scope* below and FULL-AUTO RULING 47 in
`fix-mutation-retry-on-4xx-rulings.md`.
**Reachable from the production UI today:** NO. See *Why it is not currently
exploitable*.

## What is wrong

`frontend/hooks/use-market.ts:105-113`:

```ts
export function useRefuel(fleetId: string): UseMutationResult<RefuelResult, Error, RefuelVariables> {
  const qc = useQueryClient()
  return useMutation<RefuelResult, Error, RefuelVariables>({
    mutationFn: (vars) => {
      if ('request' in vars) {
        return marketService.refuel(vars.fleetId, vars.request)
      }
      return marketService.refuel(fleetId, { tons: vars.tons, operationKey: newOperationKey() })
    },
```

React Query re-invokes `mutationFn` for **every retry attempt**, not once per
`.mutate()` call. So on the `{ tons }` branch an automatic transport-level
resend calls `newOperationKey()` again and goes out with a **different**
operation key. Server-side idempotency keys on that value
(`corporations/{id}/ledger/{opKey}`), so the dedupe never fires and the resend
settles as a **second refuel**.

## The comment directly above it asserts the opposite

`use-market.ts:99-103`, eight lines up:

> Either way exactly ONE operation key is minted per `.mutate()` call, never
> per underlying transport-retry attempt (the double-submit guard this
> capability's own SDET brief calls out for precise, mechanism-level
> coverage — see `hooks/use-refuel.test.tsx`).

That is true of the `{ fleetId, request }` branch and false of the `{ tons }`
branch immediately below it. A comment asserting the opposite of the code is a
trap for the next reader, independent of whether the branch is live.

## The live requirement it would falsify

`openspec/specs/docked-fleet-actions/spec.md:466-470`:

> #### Scenario: A transport-level retry of the same attempt yields exactly one refuel
> - **WHEN** the refuel command's request is retried at the transport layer
>   after a lost response, without the player initiating a new attempt
> - **THEN** the retry reuses the same operation key as the original attempt,
>   and the settlement remains a single refuel

Under the `{ tons }` branch that scenario is false at the wire.

## Why the existing test does not catch it

`frontend/hooks/use-refuel.test.tsx:123-127` proves only that two **separate**
`.mutate()` calls produce different keys — which is correct and required
(`docked-fleet-actions:475`, a genuinely new attempt must mint a new key). It
never re-invokes a single `mutationFn`, which is the only way to observe this.

This is the chain's *lesson two* again — a green test that cannot observe the
failure it nominally guards.

## Why it is not currently exploitable

The `{ tons }` branch has no production caller. The only one is
`frontend/components/space/FleetActionsPanel.tsx:279`, which mints the key in
the handler and passes `{ fleetId, request }` — the safe branch. The unsafe
branch is dead code reachable only from tests.

**"Unreachable today" is not "harmless."** Five derivations in this chain
shipped built-and-never-called (see this directory's README, *The one lesson
these keep re-teaching*); this is the mirror image — a wrong path kept alive
waiting for a caller.

## Scope: why this is NOT in `fix-mutation-retry-on-4xx`

That change is a fast-tracked, single-predicate change whose stated Impact is
three files, none of them `use-market.ts`. Fixing this here would exceed the
change's stated Impact, which the team workflow classes as a finding against
the developer rather than a bonus.

**But the linkage matters and is why this file exists.**
`fix-mutation-retry-on-4xx` is precisely what promotes the no-status transport
resend from an accident of the predicate to a specified `SHALL`. It makes
normative the exact retry that would exploit this hole. The change does not
create the hole and does not widen it — but after it lands, the mechanism is
documented policy rather than an implementation detail, so the hole is a
little easier to fall into.

## What a fix needs

Either is small:

1. **Delete the dead `{ tons }` branch** and narrow `RefuelVariables` to
   `{ fleetId: string; request: RefuelRequest }` — the shape the only
   production caller already uses. Preferred: it removes the divergence rather
   than repairing it, and the repo's standing preference is delete over
   maintain (`solo-toy-no-backcompat`).
2. **Hoist the key out of `mutationFn`** so it is minted once per `.mutate()`
   call on both branches.

Either way, add the test that would have caught it: invoke the returned
`mutationFn` **twice with the same variables object** and assert the two calls
carry one and the same operation key.
