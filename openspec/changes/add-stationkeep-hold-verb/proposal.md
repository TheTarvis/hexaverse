## Why

`decisions.md` (2026-08-29) records a station-keeping force-demotion
guardrail ("upkeep SHALL NOT drain a fleet to zero; it force-demotes to
`orbit`") that, before this change, governs a park **no player can reach**:
`space.StationKeepRate`, `space.StationKeepUpkeep`, and
`space.ReleaseStationkeep` have zero production callers, there is no
`POST /v1/fleets/:id/hold` route, and `space.StateAt` never settles a burn
or a fleet's idle state into `ParkStationkeep`. Link 7 (`add-fuel-as-cargo`)
originally planned to ship the `hold`/`release` verbs alongside fuel's
introduction, on the standing principle "ship the verb with the currency,
or ship neither" — otherwise this would be the fifth instance in this
chain of a derivation built, unit-tested, and never wired to a caller
(after `fleet.GraphSource`, `galaxy.EnsureLaneHorizon`,
`system.StationContinuousOrbit`, and the focused scan's client half).

Link 7's own panel review found a reason to delay by exactly one link
rather than land the verb inline: pricing station-keeping upkeep in fuel
the naive way — folding `cargo["fuel"]` continuously against elapsed hold
time — makes `fleet.FreeHold` (`backend/fleet/roster.go:157`) time-
dependent. `FreeHold` takes no time argument and has **four** call sites:
`mine/service.go:208` (a commit-time precondition), `mine/resolver.go:76`
(`freeHoldAtResolve`, the resolve-time clamp on how much a running mine
action can credit), `fleet/handler.go:335` (a plain read), and
`fuel-purchase`'s own free-hold precondition for a refuel request. Landing
an untested new fold underneath all four of those, in the very change that
also redefines cargo's other primary input (fuel-as-a-purchasable-and-
burnable resource), was judged a worse risk than delaying the verb by one
link — shipping the currency on a fold that destabilizes `mine`'s resolve
clamp would be worse than shipping both together, one link later.

**This change is that one link.** It carries BOTH the `hold`/`release`
verbs AND their fuel-denominated upkeep (with force-demotion) — landing
together exactly as the original principle intended, just sequenced
immediately after `add-fuel-as-cargo` instead of inside it, once fuel
itself is a stable, already-shipped cargo kind this change can build on
without also having to get fuel's own introduction right in the same
breath.

The correct design, worked out during this carve-out's own review: compute
the station-keeping hold's **dry instant** — the world time at which
continued upkeep would exhaust the fuel held at hold-start — exactly once,
at the moment `hold` is committed, and store it on the resulting
`space.Park` alongside the hold's start time. `space.StateAt` then folds a
`stationkeep` park observed at or after its stored dry instant into its
released orbit, exactly mirroring the existing, already-shipped rule "a
burn past its arrival IS its settled park." Reads stay pure and closed-
form; `cargo.fuel`'s **stored** value is never itself a function of
elapsed time — it changes only at discrete settlement events (`hold`
commit computes and stores the dry instant but debits nothing yet;
`release`, called before the dry instant, settles the accrued upkeep in
one closed-form debit; the automatic fold past the dry instant settles the
remainder to exactly zero on the write that first observes it). This is
what keeps `FreeHold` and its four consumers reading a pure, time-
independent value with no world-time parameter threaded through any of
their signatures.

## What Changes

- New instant, ownership-gated fleet verbs: `POST /v1/fleets/:fleetId/hold`
  (`orbit` → `stationkeep` at the fleet's current offset) and
  `POST /v1/fleets/:fleetId/release` (`stationkeep` → `orbit`,
  re-circularized). Neither creates an `action-dispatch` action, claims a
  channel slot, or computes an ETA — both are instant, like `cut-drive`.
- `space.Park` gains two persisted fields for a `stationkeep` park: the
  hold's start world time, and the dry instant computed once at `hold`
  commit from the fuel held at that instant and the body's
  `StationKeepRate`. `EncodePark`/`DecodePark` widen by these two keys.
  **This is a `space-kinematics` delta** — the one piece of this whole
  feature (fuel as cargo, station-keeping) that touches the kinematics
  package's own persisted shape, deliberately isolated to this change so
  `add-fuel-as-cargo` itself never had to take one.
- A new `space-kinematics` fold, mirroring "A Burn Past Its Arrival Is Its
  Settled Park, With No Extra Persisted State": a `stationkeep` park
  observed at or after its stored dry instant IS its released orbit,
  computed deterministically from the stored park alone, with no new
  persisted state beyond the two fields above.
- `cargo.fuel`'s **stored** value is never decremented merely by elapsed
  hold time. It changes only at discrete settlement events: `hold` commit
  (computes and stores the dry instant, debits nothing), `release` before
  the dry instant (debits exactly the upkeep accrued between hold-start and
  release, closed-form, then re-circularizes), and the automatic
  past-dry-instant fold (settles the remainder to exactly zero, persisted
  on the write that first observes it, never negative) — this is what
  keeps `fleet.FreeHold` and its four consumers pure.
  No hull-count multiplier applies to upkeep (station-keeping is a
  per-fleet positional hold, not a burn — `decisions.md`'s hull-count
  ruling was scoped specifically to burns, and this change does not extend
  it).
- **A station-keeping fleet's attachment survives every transition this
  change defines**: `hold`, `release`, and the automatic force-demotion
  each leave the fleet's `attachedTo` and docked/undocked status exactly as
  they were before the transition — only the park's kind (and, for
  `release`/force-demotion, its orbit parameters) change.
- `fleet-movement`'s ownership-check requirement widens to cover `hold` and
  `release`: an unchecked `hold` would let a foreign corporation park
  another corporation's fleet into a continuous fuel drain it never chose,
  and an unchecked `release` would let a foreign corporation force another
  corporation's fleet off a deliberately held position.
- `fleet-movement`'s cargo-pool requirement widens to name station-keeping
  settlement as one of the enumerated ways a fleet's `fuel` entry changes
  (alongside the burn debit/refund, the refuel credit, and the spawn
  grant `add-fuel-as-cargo` already established).

## Impact

- Affected specs: `fleet-movement` (the `hold`/`release` verbs, their
  upkeep settlement, the ownership-check and cargo-pool widenings),
  `space-kinematics` (the new persisted park fields, the past-dry-instant
  fold), `request-authorization` (the mutating-endpoint ownership-seam
  enumeration widened to `hold`/`release`).
- Affected code (once implemented): `backend/space/` (`Park`'s two new
  fields, `EncodePark`/`DecodePark`, the new fold in `StateAt`),
  `backend/fleet/` (the `hold`/`release` handlers, upkeep settlement,
  force-demotion), `backend/middlewares/` or router wiring (ownership
  checks on the two new routes), a widened `fixtures/space/` (or
  `fixtures/polar/`) case family for the two new `Park` fields' codec
  round-trip.
- No migrations, no backwards compatibility (solo toy) — lands outright.
- Depends on `add-fuel-as-cargo` (chain link 7) having archived first:
  `fuel` as a cargo kind, `FuelParams.DeltaVPerTon`, and the fuel-cost
  conversion this change reuses (without the hull-count multiplier) are
  all that change's own additions.
