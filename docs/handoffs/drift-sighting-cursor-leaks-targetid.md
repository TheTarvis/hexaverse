# DRIFT: the sightings cursor publishes the target fleet id that `json:"-"` withholds

**Found** 2026-09-02 by link 8b's spec writer, while closing the "no sighting record
`id` on the wire" gap. **Verified independently.** **Status:** fixed by
`add-scan-and-sightings-surface` (link 8b). This is a **disclosure** defect.

## The finding

Three facts, each confirmed in the shipped code:

1. `backend/sightings/model.go:50` — `TargetId string \`json:"-" firestore:"targetId"\``.
   The sighted target's fleet id is deliberately withheld from the wire.
2. `backend/sightings/mint.go:12` — records are written to
   `corporations/{cid}/sightings/{actionId}_{targetId}`. **The target id is half the
   document id.**
3. `backend/sightings/dao.go:118,128` — the list's continuation token is built from that
   document id, and `encodeCursor` is:

```go
func encodeCursor(asOf common.WorldMillis, docID string) string {
	return strconv.FormatInt(int64(asOf), 10) + "|" + docID
}
```

So `nextCursor` is `"{asOf}|{actionId}_{targetId}"` — **plaintext**. No encoding, no
digest, no signing. Any client that pages the pile is handed the sighted fleet's id, in
the clear, in the field the model goes out of its way to hide.

## The comment is part of the defect

Directly above `encodeCursor`:

> `encodeCursor`/`decodeCursor` give the pile's continuation **an opaque wire shape** …
> callers must treat it as opaque and round-trip it verbatim.

"Opaque" is asserted, not implemented. It is true of the *contract* (callers are told not
to parse it) and false of the *value* (anyone can read it at a glance). A reviewer
scanning for disclosure problems reads that comment and moves on, which is presumably how
this survived. Treat a comment claiming a security property as a claim to verify, never as
evidence.

## Why it has not bitten yet

Nothing pages the pile. The sightings list has no client consumer today — the focused
scan's player-facing half was deferred in link 5 and became one of the eight
built-and-never-called derivations catalogued in `README.md`. The leak is latent, and
**link 8b is the change that makes it reachable**, because it builds the log that pages.

That is the useful shape of this one: a dormant defect that a *later, unrelated-looking*
change activates. The deferral did not merely leave dead code; it parked a disclosure bug
behind an unbuilt caller.

## The fix (in 8b)

The document id becomes an opaque deterministic digest of `(actionId, targetId)` and is
served as the record's `id`. Fixing the identifier **at its source** removes the class
rather than patching the cursor: serving a second digest alongside the existing doc id
would have left the cursor leaking. The digest is integer-only, so it needs no fixture
family and no cross-target determinism enrolment.

A property worth keeping: because the digest covers the action id, two sweeps against the
same target yield unrelated ids. The id addresses a record and grants no linkage — which
is what keeps it from becoming the per-target pseudonym that would implement the design
doc's rejected *Track* rung through the back door.

## Test shape

Assert the served `id` and `nextCursor` contain **no substring** of any target fleet id,
for a pile with at least two records from different sweeps. An assertion that the cursor
merely round-trips would have passed against the broken code the whole time.
