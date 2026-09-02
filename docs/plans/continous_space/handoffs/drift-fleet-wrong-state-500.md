# DRIFT: three fleet rejections return a bodyless 500, against live requirements

**Found** 2026-09-02 by link 7b's spec writer while pinning HTTP statuses for the
hold/release verbs. **Verified independently** before recording.
**Status:** open. Routed into `add-stationkeep-hold-verb` (link 7b).

## The finding

`backend/fleet/handler.go`'s `respond` switch (lines 272-312) has no branch for
three sentinels that production code genuinely returns:

| Sentinel | Returned at | Live requirement it violates |
| --- | --- | --- |
| `ErrNotBurning` | `service.go:707` | `fleet-movement` — *Cutting a parked, drifting, or in-transit fleet is rejected by name* (`openspec/specs/fleet-movement/spec.md:315`) |
| `ErrAccelBelowFloor` | `service.go:504`, `:510` | *A commanded acceleration below the disclosure floor is rejected* (`:528`) |
| `ErrAccelAboveCeiling` | `service.go:507` | *A commanded acceleration above the ceiling is rejected* (`:521`) |

All three fall through to the switch's terminal `case err != nil`, which logs and
calls `c.AbortWithStatus(http.StatusInternalServerError)` — a **bodyless 500**.

Each of the three requirements says the order is "rejected with its own named
reason". A bodyless 500 carries no reason at all, and is byte-identical to the
response produced by any unhandled internal error. For cut-drive the spec is
even more specific — the reason must be "distinct from the already-arrived
rejection" — and today the two are indistinguishable.

The player-visible effect: cutting a fleet that is already parked, or commanding
an out-of-range acceleration, looks exactly like a server crash. The client has
no way to render a useful message, and the server logs it at error level, so
ordinary player mistakes are indistinguishable from real faults in the logs too.

## Why this is drift and not a gap

The requirements are live in `openspec/specs/fleet-movement/spec.md` and were
archived as satisfied. Nothing about them is wrong; the handler simply never
implemented them. This is a **code-is-wrong** adjudication.

## Routing ruling

Into link 7b, `add-stationkeep-hold-verb`, as declared tasks.

7b is already editing this exact switch — it adds `ErrNotOrbiting`,
`ErrNotStationKeeping` and `ErrHoldWithoutFuel` as `409 Conflict` with a
reason-bearing body. `ErrNotBurning` is the direct structural sibling of
`ErrNotOrbiting` (both are wrong-effective-state rejections on a fleet verb);
the two accel sentinels are request-validation rejections closer to
`ErrEmptyOrder`'s `400`.

Adding them there is a declared, specced task rather than a drive-by edit. It is
also the cheapest possible moment: the alternative is a separate change whose
entire content is three `case` lines in a switch the current change is already
rewriting.

**No spec delta is required.** All three scenarios already exist, already say the
right thing, and are already live. The work is a task plus tests, exactly as with
the sell double-submit drift.

## Status mapping to use

Follow the majority convention the switch already establishes, which 7b's writer
documented: `409 Conflict` + `{"error": ...}` for state-precondition and
resource-insufficiency rejections (`ErrFleetInTransit`, `ErrJumpNotAttached`,
`ErrInsufficientFuel`, `action.ErrActiveActionExists`, and the two scan
rejections — six cases), `400 Bad Request` for request-shape errors
(`ErrEmptyOrder`, `ErrAmbiguousOrder`).

- `ErrNotBurning` → **409**, and its message MUST differ from the already-arrived
  rejection's, since the spec demands they be distinct.
- `ErrAccelAboveCeiling`, `ErrAccelBelowFloor` → **400**, pairwise distinct
  messages. These are bad request parameters, not fleet state.

## Test shape — do not repeat today's mistake

An assertion that these return "not 500" is nearly worthless on its own, and a
test that only checks the status code would have passed against a handler that
mapped all three to one generic 409. Assert the three reasons are **pairwise
distinct** in body text, and for cut-drive assert distinctness from the
already-arrived rejection specifically, which is what the requirement actually
demands.

Note the sibling trap found the same day: an ownership test passed green against
a route that did not exist, because an unwired Gin route and a real rejection
both return the same generic 404. Status codes alone do not discriminate. See
`README.md`, *Lesson two*.
