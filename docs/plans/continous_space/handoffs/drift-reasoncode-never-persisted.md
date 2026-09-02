# DRIFT: a resolver's `reasonCode` is computed, documented as stored, and never written

**Found** 2026-09-02 by link 8b's adversary (round 2), while checking whether the
fizzle-copy requirement had an input. **Verified independently.**
**Status:** fixed by `add-scan-and-sightings-surface` (link 8b).

## The finding

`backend/action/dao.go:334-339` is `ResolveOne`'s only write to the action document:

```go
if err := tx.Update(ref, []firestore.Update{
    {Path: "status",     Value: string(StatusDone)},
    {Path: "outcome",    Value: res.Outcome},
    {Path: "resolvedAt", Value: int64(dao.clock.Now())},
}); err != nil {
```

`reasonCode` is absent. `ResolveOne` is the only applier — the other two action-doc
writes are `commitTx` and `cancelTx` — and a repo-wide grep for a `"reasonCode"`
document write returns **nothing**. `Action.ReasonCode` is `omitempty`, so
`GET /v1/actions` serves the key absent, always.

`backend/fleet/resolver.go:154-157` computes it and sets it on the returned
`ResolveResult`, where it is then discarded.

## Two things that hid it

**1. A doc comment asserting the behaviour.** `backend/action/model.go:203-206`:

> `ReasonCode` is the structured classifier **mirrored onto `Action.ReasonCode` at the
> same status flip** (see `Action.ReasonCode`'s doc comment …).

That is false. It describes an intention that was never implemented, and it reads exactly
like a statement of fact. This is the second instance of the same pattern in one day —
`sightings`' `encodeCursor` carries a comment calling its output "an opaque wire shape"
while returning plaintext. **A comment asserting a property is a claim to verify, never
evidence.** Both survived review because a reader looking for the property found the
comment and stopped.

**2. A green test asserting the wrong object.** `backend/fleet/scan_resolver_test.go:280`
and `:371` assert `res.ReasonCode != ""` — on the resolver's **return value**, not on the
stored action. The classifier is produced correctly, so the assertion passes forever while
the field never reaches a document. Lesson two: the test could not observe the failure,
because it never looked at the thing that fails.

## Live requirement it violates

`openspec/specs/focused-scan/spec.md:237-241` and `:264-266` — a fizzled sweep's
**"resolved action carries a reason code identifying whether the failure was range or
occlusion"**. Shipped code does not. Code-is-wrong, so link 8b carries a task plus an
`action-dispatch` delta making the persistence a requirement rather than a comment.

## What it would have cost

Link 8b specifies five distinct fizzle copies keyed on the served reason code. Without
this fix an implementer builds that copy map exactly as written, mocks a `reasonCode` in
the client tests, and ships a client where **every** fizzle renders the unrecognized-code
fallback — "the sweep returned nothing" — for every one of the five distinguishable
causes. The change's own orphan audit would have passed it, too: the field has a named
consumer. It just has no producer. **An orphan audit that checks for consumers does not
catch a field with no producer** — worth adding to the audit's own definition.

## Test shape

Assert by reading the resolved action **back from the store** and checking its
`reasonCode`. An assertion on the returned `ResolveResult` is what already exists and is
what let this survive.
