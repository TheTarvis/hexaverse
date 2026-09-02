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
- [ ] 1.3 Implement the dry-instant formula exactly as `fleet-movement`'s
      "Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded
      Into the Stored Cargo Pool" states it — `dryInstant = holdStart +
      ceil_to_integer_ms(1000 × (fuelAtHoldStart × FuelParams.DeltaVPerTon)
      / upkeepRate)` — tons × Δv/ton = Δv, ÷ Δv/s = seconds, × 1000 =
      milliseconds, quantized UP. **Do not divide by `DeltaVPerTon` where
      the formula multiplies** — that inversion understates endurance by
      `DeltaVPerTon²` (25× at today's placeholder value of 5.0)
- [ ] 1.4 Fixture cases for the two new `Park` fields' codec round-trip,
      the fold's output matching `ReleaseStationkeep` called directly, and
      the dry-instant formula itself (pin at least one case where
      `DeltaVPerTon ≠ 1` so a divide/multiply inversion regression would
      fail the fixture, not just a unit test)

## 2. `hold`/`release` — the fleet verbs

- [ ] 2.1 Add `POST /v1/fleets/:fleetId/hold` (orbit → stationkeep,
      computing and storing the dry instant, debiting no fuel; rejected by
      name whenever the computed dry instant would not be strictly after
      the hold's start time — which, given the formula's ceiling, is
      exactly when the fleet's current `fuel` is zero) and
      `POST /v1/fleets/:fleetId/release` (stationkeep → orbit, settling
      accrued upkeep first) as instant, ownership-gated handlers —
      `fleet-movement`: "Station-Keeping Hold and Release Are Fleet Verbs"
      (all six scenarios, including "Holding a fleet with insufficient
      fuel is rejected, not silently bricked")
- [ ] 2.2 Wire both routes through the same ownership check as every other
      fleet command — `fleet-movement`: "Fleet Command Endpoints Are
      Restricted to the Owning Corporation" ("A foreign corp cannot start
      another corp's fleet station-keeping", "A foreign corp cannot
      release another corp's fleet's station-keep hold"); `request-
      authorization`: "Corporation Resolution Seam Is Consumed By
      Ownership Checks" ("Mutating fleet and action endpoints now enforce
      ownership")
- [ ] 2.3 Implement `release`'s closed-form settlement debit
      (`(rate × ((releaseTime − holdStartTime) / 1000)) /
      FuelParams.DeltaVPerTon` — **two conversions are load-bearing, not
      one**: the elapsed `WorldMillis` difference must be divided by
      `1000` to reach seconds before it is multiplied by the per-second
      `rate`, and the resulting Δv figure must then be divided by
      `FuelParams.DeltaVPerTon` to reach tons; omitting the first
      overcharges by `1000×`, omitting the second overcharges by
      `DeltaVPerTon` (5.0× at today's placeholder value) — the two errors
      compound if both are made) inside one transaction that re-reads the
      fleet's current park and fuel state (mirroring `goods-sale`'s and
      `fuel-purchase`'s transactional re-read discipline; see design.md's
      relevant Decision) — `fleet-movement`: "Station-Keeping Upkeep Is
      Settled at Discrete Events, Never Folded Into the Stored Cargo Pool"
      ("Releasing before exhaustion debits exactly the accrued upkeep,
      converted to tons")
- [ ] 2.4 Test the round-trip invariant directly: a `release` called at
      exactly the hold's stored dry instant debits exactly the `fuel`
      tonnage held at the hold's start, leaving the fleet at exactly zero
      — a single test that catches either conversion in task 2.3 being
      wrong or missing, since any factor-of-`1000` or factor-of-
      `DeltaVPerTon` error breaks this exact equality — `fleet-movement`:
      "Station-Keeping Upkeep Is Settled at Discrete Events..." ("A
      release at exactly the dry instant debits exactly the fuel held at
      hold start, leaving zero")
- [ ] 2.5 Confirm the stored `fuel` value is untouched by a mere read
      during an open, unreleased hold strictly before its dry instant —
      regression guard — same requirement, "A read during an open hold
      reports the stored, unsettled fuel value"
- [ ] 2.6 Confirm the automatic force-demotion fold settles fuel to exactly
      zero, never negative, on the write that first observes it past the
      dry instant — same requirement, "Fuel exhaustion during a hold
      force-demotes to orbit, never negative", "A hold that never reaches
      its dry instant is never demoted"
- [ ] 2.7 Confirm a release-then-re-hold cycle settles the first hold
      exactly once and computes a fresh, independent dry instant for the
      second — same requirement, "Releasing settles the accrual before any
      subsequent hold recomputes a fresh dry instant"
- [ ] 2.8 Confirm `attachedTo` and docked/undocked status are unchanged by
      `hold`, `release`, and force-demotion — `fleet-movement`:
      "Station-Keeping Hold and Release Are Fleet Verbs" ("A fleet's
      attachment survives hold, release, and force-demotion")
- [ ] 2.9 Implement the settle-restamp-recompute step for a mid-hold `fuel`
      mutation, by any other fuel-mutating verb, that leaves the hold open
      afterward (in particular, a refuel settled while docked at a station
      the fleet is simultaneously holding beside — reachable, since `hold`
      does not alter `attachedTo` and `fuel-purchase` requires only
      docked-to-station): in the same transaction as the mutation, settle
      the upkeep accrued since the hold's stored start time, apply the
      mutation's own delta, then restamp the hold's start time to the
      mutation's instant and recompute the dry instant from the resulting
      fuel level — same requirement, "A refuel during an open hold settles
      the accrual, restamps the hold, and recomputes the dry instant"
- [ ] 2.10 Implement the settle-and-drop step for a burn committed against
      a fleet whose park is `stationkeep`, open and before its stored dry
      instant: in the same transaction that commits the burn, settle the
      accrued upkeep since the hold's stored start time exactly as task
      2.3's `release` debit would, evaluate and debit the burn's own fuel
      cost against the resulting balance, and store the committed burn in
      place of the `stationkeep` park — **do not restamp or recompute a
      dry instant on this path**: unlike task 2.9's mid-hold mutation,
      this path replaces the park entirely, so there is no hold left to
      restamp, and restamping here is exactly what would reintroduce an
      undecodable `dryInstant == holdStart` park through a route task 2.1's
      precondition does not guard. A burn against a fleet whose hold is
      already past its dry instant settles via task 1.2's automatic fold
      instead, before the burn's affordability check runs (task 2.11) —
      `fleet-movement`: "Station-Keeping Upkeep Is Settled at Discrete
      Events..." ("A burn committed from an open station-keeping hold
      settles its accrued upkeep and replaces the park, without
      restamping", "A burn that would leave exactly zero fuel after
      settlement still commits, never bricking the fleet")
- [ ] 2.11 Implement the settle-past-dry-instant-first step in every
      fuel-reading decision path this change's own requirement names: the
      burn-commit affordability check, `FreeHold`'s commit-time and
      resolve-time (`freeHoldAtResolve`) call sites, `fuel-purchase`'s
      free-hold precondition, the fleet read's estimated-maximum-range
      computation, and the fleet read's persistent stranded indication —
      the last two were dropped from an earlier draft of this task despite
      being named by the requirement's own universal wording, and their
      omission is its own cry-wolf-in-reverse bug (a stale `fuel` value
      reads as a healthy range and a not-stranded fleet) — `fleet-
      movement`: "Every Decision Reading Fuel Settles a Past-Dry-Instant
      Hold First" (all five scenarios)

## 3. Cargo-pool housekeeping

- [ ] 3.1 Extend the cargo-pool enumeration to name every station-keeping
      settlement event — `release`, automatic exhaustion, a mid-hold
      mutation that leaves the hold open (restamping), and a burn commit
      that replaces an open hold (never restamping) — restoring the two
      in-capability cross-references (to "A Burn Commit Is Rejected When
      Its Fuel Cost Exceeds Available Fuel, Debited At Commit Never At
      Resolve" and "Discarding a Running Burn Refunds Its Unspent Fuel,
      Closed-Form") `add-fuel-as-cargo` installed, rather than pointing at
      a change id — `fleet-movement`: "Fleet Cargo Pool" ("An open
      station-keeping hold does not by itself change the stored fuel
      entry"; the pre-existing scenarios are unaffected)
- [ ] 3.2 Take the `mine-extraction` MODIFIED delta retiring the
      `freeHoldAtResolve == freeHoldAtCommit` equality claim "Resolve
      Clamps Yield to Reality" previously stated: a station-keeping
      settlement landing mid-run (task 2.6's automatic fold, or a
      mid-run `release`) mutates `fleet.cargo.fuel` while the fleet
      remains docked to the mined feature, since `hold` has no park-mode
      constraint tied to `attachedTo` — `mine-extraction`: "Resolve Clamps
      Yield to Reality" (all five scenarios, including "A station-keeping
      settlement landing mid-run widens free hold before resolve")

## 4. Validation

- [ ] 4.1 `openspec validate add-stationkeep-hold-verb --strict` passes
- [ ] 4.2 Backend integration test: hold → wait past the dry instant (or
      simulate world time past it) → read folds to `orbit` with `fuel`
      exactly zero — traces to `fleet-movement`: "Fuel exhaustion during a
      hold force-demotes to orbit, never negative"
- [ ] 4.3 Backend integration test: hold → release before exhaustion →
      `fuel` debited by exactly the closed-form accrual, with the elapsed
      `WorldMillis` duration **first converted to seconds**, then
      **converted to tons by `FuelParams.DeltaVPerTon`**, park
      re-circularized — traces to `fleet-movement`: "Releasing before
      exhaustion debits exactly the accrued upkeep, converted to tons",
      "A release at exactly the dry instant debits exactly the fuel held
      at hold start, leaving zero"
- [ ] 4.4 Backend integration test: `mine`'s resolve clamp and commit-time
      `FreeHold` check both read the **settled, correct** value for a
      station-keeping fleet observed past its dry instant, not merely a
      *stable* one — a test that only asserts stability passes against the
      stale-over-report bug this change exists to close, so assert the
      value equals what a fresh fold to `orbit` with `fuel` at zero would
      produce — traces to `fleet-movement`: "FreeHold used by mine's
      resolve clamp reflects a settled hold"
- [ ] 4.5 Backend integration test: dock at a station while
      simultaneously holding beside it, refuel, then drift past the
      pre-refuel hold's original (now stale) dry instant — the refueled
      tonnage survives, because the refuel settled-restamped-recomputed
      the hold at the moment it landed — traces to `fleet-movement`: "A
      refuel during an open hold settles the accrual, restamps the hold,
      and recomputes the dry instant"
- [ ] 4.6 Backend integration test: `hold` against a fleet holding exactly
      zero `fuel` is rejected, no `stationkeep` park is stored, and the
      fleet remains readable and re-orderable — traces to
      `fleet-movement`: "Holding a fleet with insufficient fuel is
      rejected, not silently bricked"
- [ ] 4.7 Backend integration test: hold → dock-and-hold beside a
      station → commit a burn costing exactly the fleet's fuel remaining
      after the hold's accrued upkeep is settled → the commit succeeds,
      the burn is stored in place of the `stationkeep` park, and no
      `stationkeep` park with `dryInstant == holdStart` is ever persisted
      — traces to `fleet-movement`: "A burn committed from an open
      station-keeping hold settles its accrued upkeep and replaces the
      park, without restamping", "A burn that would leave exactly zero
      fuel after settlement still commits, never bricking the fleet"
- [ ] 4.8 Backend integration test: commit a mine run, then hold the
      mining fleet into `stationkeep` (attachment survives, per task 2.8)
      and let its upkeep settle before the run resolves — the resolved
      run's `freeHoldAtResolve`-derived take reflects the widened free
      hold, not the value at commit — traces to `mine-extraction`:
      "Resolve Clamps Yield to Reality" ("A station-keeping settlement
      landing mid-run widens free hold before resolve")
- [ ] 4.9 `go test ./... -p 1` and
      `python3 .claude/skills/code-quality-checks/check.py` clean
