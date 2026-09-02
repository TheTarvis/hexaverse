## 1. `space-kinematics` — the persisted hold fields and the dry-instant fold

- [ ] 1.1 Add the two new `stationkeep`-only `Park` fields (hold-start
      time, dry instant) and widen `EncodePark`/`DecodePark` to carry them
      — `space-kinematics`: "Idle Ships Park in Exactly One of Three
      Modes" ("A newly created station-keep park stores its start time and
      dry instant"); "Coordinates Cross the Persistence Boundary Through a
      Named Codec" ("Every park kind and a drift round-trip exactly
      through the codec", "A station-keep park with a missing or invalid
      dry instant fails to decode")
- [ ] 1.2 Implement the past-dry-instant fold in `StateAt`
      (`space.ReleaseStationkeep` at the stored dry instant) — `space-
      kinematics`: "A Station-Keeping Park Past Its Dry Instant Is Its
      Released Orbit, With No Extra Persisted State" (all three scenarios)
- [ ] 1.3 Fixture cases for the two new `Park` fields' codec round-trip and
      the fold's output matching `ReleaseStationkeep` called directly

## 2. `hold`/`release` — the fleet verbs

- [ ] 2.1 Add `POST /v1/fleets/:fleetId/hold` (orbit → stationkeep,
      computing and storing the dry instant, debiting no fuel) and
      `POST /v1/fleets/:fleetId/release` (stationkeep → orbit, settling
      accrued upkeep first) as instant, ownership-gated handlers —
      `fleet-movement`: "Station-Keeping Hold and Release Are Fleet Verbs"
      (all five scenarios)
- [ ] 2.2 Wire both routes through the same ownership check as every other
      fleet command — `fleet-movement`: "Fleet Command Endpoints Are
      Restricted to the Owning Corporation" ("A foreign corp cannot start
      another corp's fleet station-keeping", "A foreign corp cannot
      release another corp's fleet's station-keep hold"); `request-
      authorization`: "Corporation Resolution Seam Is Consumed By
      Ownership Checks" ("Mutating fleet and action endpoints now enforce
      ownership")
- [ ] 2.3 Implement `release`'s closed-form settlement debit inside one
      transaction that re-reads the fleet's current park and fuel state
      (mirroring `goods-sale`'s and `fuel-purchase`'s transactional
      re-read discipline; see design.md's third Decision) — `fleet-
      movement`: "Station-Keeping Upkeep Is Settled at Discrete Events,
      Never Folded Into the Stored Cargo Pool" ("Releasing before
      exhaustion debits exactly the accrued upkeep")
- [ ] 2.4 Confirm the stored `fuel` value is untouched by a read during an
      open, unreleased hold — regression guard — same requirement, "A read
      during an open hold reports the stored, unsettled fuel value"
- [ ] 2.5 Confirm the automatic force-demotion fold settles fuel to exactly
      zero, never negative, on the write that first observes it past the
      dry instant — same requirement, "Fuel exhaustion during a hold
      force-demotes to orbit, never negative", "A hold that never reaches
      its dry instant is never demoted"
- [ ] 2.6 Confirm a release-then-re-hold cycle settles the first hold
      exactly once and computes a fresh, independent dry instant for the
      second — same requirement, "Releasing settles the accrual before any
      subsequent hold recomputes a fresh dry instant"
- [ ] 2.7 Confirm `attachedTo` and docked/undocked status are unchanged by
      `hold`, `release`, and force-demotion — `fleet-movement`: "Station-
      Keeping Hold and Release Are Fleet Verbs" ("A fleet's attachment
      survives hold, release, and force-demotion")

## 3. Cargo-pool housekeeping

- [ ] 3.1 Extend the cargo-pool enumeration to name station-keeping
      settlement as a fuel-mutating verb — `fleet-movement`: "Fleet Cargo
      Pool" ("An open station-keeping hold does not by itself change the
      stored fuel entry"; the pre-existing scenarios are unaffected)

## 4. Validation

- [ ] 4.1 `openspec validate add-stationkeep-hold-verb --strict` passes
- [ ] 4.2 Backend integration test: hold → wait past the dry instant (or
      simulate world time past it) → read folds to `orbit` with `fuel`
      exactly zero — traces to `fleet-movement`: "Fuel exhaustion during a
      hold force-demotes to orbit, never negative"
- [ ] 4.3 Backend integration test: hold → release before exhaustion →
      `fuel` debited by exactly the closed-form accrual, park re-
      circularized — traces to `fleet-movement`: "Releasing before
      exhaustion debits exactly the accrued upkeep"
- [ ] 4.4 Backend integration test: `mine`'s resolve clamp and commit-time
      `FreeHold` check both read a stable value for a station-keeping
      fleet across a simulated time advance, with no world-time parameter
      threaded through either call — regression guard against the
      original, rejected time-dependent design
- [ ] 4.5 `go test ./... -p 1` and
      `python3 .claude/skills/code-quality-checks/check.py` clean
