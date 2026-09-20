# DRIFT: the shipped sell control has no real double-submit guard

**Found** 2026-09-02, during link 7 (`add-fuel-as-cargo`) e2e verification.
**Status:** open. Routed into link 8a-2 (`build-production-space-view`).
NOT fixed in link 7.

> **Routing ruling, 2026-09-02.** This does not need a standalone change.
> Link 8a already accepted **UX M6** — *"no double-submit guard on burn/mine,
> unlike sell/refuel"* — so 8a-2 must build exactly this guard for two other
> verbs on the same panel. Sell joins it there as an explicit, specced task,
> which is categorically different from a "while we're in there" edit: it is
> declared work with its own scenario, adjudicated before implementation.
> Note the irony in M6's own wording — it cites sell/refuel as the verbs that
> *have* the guard. Both were in fact broken. Only refuel is fixed (link 7).

## The finding

`openspec/specs/board-view/spec.md:616` carries a **live, shipped**
requirement, *Sell Control Guards Against Double-Submit*:

> The sell control SHALL be disabled **from the moment of commit** until the
> request settles or fails, so a double-click or repeated-Enter cannot submit
> two sales.

`commitSell` (`frontend/components/board/SystemBoardView.tsx:356`) does not
satisfy it. It mints `newOperationKey()` and calls `sell.mutate(...)`
unconditionally on every invocation, with no synchronous checked-and-set
guard. The only protection is `disabled={!committable}` on the control, where
`committable` depends on `sell.isPending` — an async React-Query state flip
that requires a **render cycle** to reach the DOM.

Two clicks a tick apart therefore both enter the handler, and **each mints its
own operation key**. Distinct keys mean the server's idempotency-by-key
cannot collapse them: they settle as two independent sales. The player is
charged twice on this economy's first credit sink.

## Why we are confident this is real and not theoretical

The refuel control shipped in link 7 with the *identical* code shape, and its
e2e reproduced the double-charge **4/4 runs, never once passing**:

```
expected exactly one /refuel request from a rapid double-click, got 2:
[{"tons":1,"operationKey":"...779"},{"tons":1,"operationKey":"...da9"}]
```

Sell has no equivalent e2e at that rigor, which is the only reason it is not
also red. Absence of a failing test is not evidence of correctness here — it
is the reason the drift survived.

## Note on the unit test

`hooks/use-refuel.test.tsx`'s double-click case **passes** against the broken
refuel code, because its harness holds the mutation promise open manually and
so never reproduces the real render-and-disable timing. Any sell unit test
written the same way will be equally blind. The corrective change needs a
Playwright-level scenario, not another unit test in that shape.

## Why it was not fixed in link 7

Spec-first is absolute in this project: production code changes only as
implementation of a validated, adversary-reviewed change. This is pre-existing
drift against a *shipped* requirement, not a defect introduced by link 7, so
folding it into link 7 would have been exactly the "while we're in there" edit
the rule forbids. Link 7's dev was explicitly instructed not to touch
`commitSell`.

## What the corrective change should do

The requirement is already written and already correct — this is a **code is
wrong** adjudication, not a spec correction. So the change carries no spec
delta for the requirement itself; it is an implementation-only fix plus the
missing scenario coverage.

1. Add a synchronous submit guard (a `useRef` flag checked-and-set at the top
   of the handler, cleared in `onSettled`) ahead of `sell.mutate(...)`, so the
   guard takes effect at the moment of commit rather than a render later.
2. Consider hoisting the guard into one shared helper — refuel and sell now
   both need it, and any future commit verb on this panel will too. Link 7's
   fix may already have left one in place to reuse.
3. Add the Playwright double-click scenario for sell, mirroring
   `frontend/e2e/tests/refuel-commit.spec.ts`. Do **not** insert an `await`
   between the two clicks; that defeats the scenario's purpose.

## Generalization worth carrying forward

This is the chain's signature failure in a new costume. `handoffs/README.md`
catalogues eight instances of built-and-never-called; this is its sibling —
**written-and-never-really-verified**. A requirement existed, a unit test
existed and was green, and the behaviour was still broken, because the test
was shaped so it could not observe the failure. When a requirement turns on
real timing, only a test that runs against real timing counts as coverage.
