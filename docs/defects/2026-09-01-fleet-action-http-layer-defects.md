# Fleet/action HTTP-layer defects — deferred fast-track batch

**Found:** 2026-09-01, during link 5 (`replace-observation-with-sightings`)
section 6.
**Status:** open, deliberately deferred. To be fixed as **one fast-track
OpenSpec change after link 5 archives** — not folded into link 5, which
carries no scenario for either and whose adversary loop is closed.
**Verified against:** commit `6a334ce` (link 5 §6).

Two unrelated-looking defects are filed together because the ruling was to fix
them in one batch, and because the second's clean fix (a read-only fleet
accessor) may also serve an obligation already carried elsewhere — check that
before designing either.

---

## Defect 1 — five fleet sentinels fall through to HTTP 500

`fleet/handler.go`'s `respond` switch (line 241) maps six of the package's
eleven sentinels to 4xx and lets the rest hit its `case err != nil` default:

```go
case err != nil:
    log.Error().Ctx(c).Err(err).Msg("fleet operation failed")
    c.AbortWithStatus(http.StatusInternalServerError)
```

`AbortWithStatus` — so the client gets **500 with an empty body**.

| Sentinel | Mapped? | Should be |
| --- | --- | --- |
| `ErrNotFound` | ✅ 404 | — |
| `ErrEmptyOrder`, `ErrAmbiguousOrder` | ✅ 400 | — |
| `ErrFleetInTransit` | ✅ 409 | — |
| `ErrJumpNotAttached` | ✅ 409 | — |
| `ErrScanHostUnresolved` | ✅ 404 | — |
| **`ErrAccelBelowFloor`** | ❌ **500** | 400 — client input |
| **`ErrAccelAboveCeiling`** | ❌ **500** | 400 — client input |
| **`ErrNotBurning`** | ❌ **500** | 409 — state conflict |
| `ErrSeedInsideClearance` | ❌ 500 | n/a — not on an HTTP path (spawn only) |
| `ErrNoBodySource` | ❌ 500 | 500 is correct — programmer error |

### The sharp edge: the two accel sentinels are client-supplied input

This started as a one-line note about `ErrNotBurning`. The audit found the
worse case. `OrderRequest.Accel` is a JSON-bound, **client-controlled**
optional field (`fleet/model.go:153`):

```go
Accel *float64 `json:"accel,omitempty"`
```

and `OrderTo` validates it across three branches (`fleet/service.go:463-470`):

```go
if math.IsNaN(accel) || math.IsInf(accel, 0) || accel <= 0 { return nil, ErrAccelBelowFloor }
if accel > ceiling                                          { return nil, ErrAccelAboveCeiling }
if accel < disclosure.MinCommandedAccel                     { return nil, ErrAccelBelowFloor }
```

So `POST /v1/fleets/:fleetId/orders` with `{"bodyId":"…","accel":-1}`,
`{"accel":0}`, `{"accel":1e9}`, or a NaN answers **500, empty body**. A
malformed client request is reported as a server fault: the caller cannot tell
a rejected value from a broken backend, retries are encouraged where they will
never succeed, and every one of these logs at `Error` — so ordinary client
noise pollutes the error budget and buries real faults.

`ErrNotBurning` (cut-drive on a non-burning fleet) is the same shape, one
notch less severe: a legitimate state conflict, not malformed input.

### Fix sketch
Add cases for `ErrAccelBelowFloor` / `ErrAccelAboveCeiling` (400, with the
error text, as `ErrEmptyOrder` already does) and `ErrNotBurning` (409, matching
`ErrFleetInTransit`'s precedent). Leave `ErrNoBodySource` at 500. Decide
explicitly whether `ErrSeedInsideClearance` should be unreachable here or
mapped defensively.

**Consider deriving rather than declaring.** This is the same species as the
hand-maintained-list defects catalogued in link 4's task 9.9 — a switch that
must be updated by memory whenever a sibling sentinel is added, where the
omission is silent and every unit test still passes. A test asserting that
every exported `Err*` in the package either appears in `respond` or is on a
named 500-is-correct allowlist would have caught all five.

---

## Defect 2 — an authorization check that writes, triggerable by an
## unauthorized caller

Ownership on the four action endpoints resolves through the seam wired at
`router.go:171`:

```go
actionHandler := action.NewHandler(actionSvc).WithActorOwner(fleetActorOwner{fleetSvc})
```

`fleetActorOwner.OwnerOf` resolves an actor id by calling `fleet.Service.Get`
— which is not a plain read. `Get` is the fleet domain's **opportunistic
arrival-settlement door**: it settles a due burn or jump inside a transaction,
and for a settled jump it then materializes the destination system's interior
(create-if-absent, a genuine write of freshly generated content).

So on `GET /v1/actions?actor=…`, `GET /v1/actions/:id`, and the acknowledge and
cancel endpoints, `action.Handler.ownsActor` (line 75) calls `OwnerOf` **before**
it knows whether the requester owns the actor. The sequence is: *write, then
deny.*

An unauthorized caller who knows or guesses a fleet id can therefore trigger
arrival settlement and destination-interior materialization on a fleet they do
not own, and receive a 404 that correctly tells them nothing. The state
transition is one the fleet's own owner would have caused on their next read,
it is idempotent, and no observable behaviour changes — which is why this is
**not urgent**. But "an authz check with a side effect an attacker can
trigger" is worth naming in those terms: it is unmetered work reachable
pre-authorization, and the property that makes it benign today (settlement is
idempotent and owner-neutral) is not one anything enforces.

### Fix sketch
A read-only fleet accessor that resolves `corporationId` without running the
settle path, used by `fleetActorOwner` only. **Before designing it, check
whether the `Get`-fold retrofit already carried elsewhere in this chain needs
the same accessor** — the ruling that filed this defect expected the two to
share one, and building two would be the wrong outcome.

Note this is new production surface, which is why it was not done inside link
5: the change carries no scenario for it, and spec-first forbids an unspecced
production addition.

---

## Why neither was fixed in link 5

Both were found while implementing §6's authorization work. Neither is covered
by any scenario in `replace-observation-with-sightings`, whose spec is closed
and adversary-clean. Folding an unspecced production fix into a change
mid-implementation is precisely the "while we're in there" edit the
spec-first rule exists to prevent, and it would reopen the adversary loop on a
16-delta change for two unrelated defects. Recorded here instead, to be
proposed as its own change once link 5 archives.
