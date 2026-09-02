## 1. `space-kinematics` — the persisted hold fields and the dry-instant fold

- [ ] 1.1 Add the two new `stationkeep`-only `Park` fields (hold-start
      time, dry instant) and widen `EncodePark`/`DecodePark` to carry them
      — `space-kinematics`: "Idle Ships Park in Exactly One of Three
      Modes" ("A newly created station-keep park stores its start time and
      dry instant"); "Coordinates Cross the Persistence Boundary Through a
      Named Codec" ("Every park kind and a drift round-trip exactly
      through the codec")
- [ ] 1.2 Widen the codec's decode guard to reject a `stationkeep` park
      whose **hold-start time** is absent or non-positive, as well as one
      whose dry instant is absent or not strictly after that hold-start —
      an absent hold-start decodes to `0`, and every accrual then computes
      from world-epoch zero, so guarding the dry instant alone leaves the
      larger corruption open — `space-kinematics`: "A station-keep park
      with a missing or invalid dry instant fails to decode" (all three
      branches: absent/non-positive hold-start, absent dry instant, dry
      instant not strictly later)
- [ ] 1.3 Implement the past-dry-instant fold in `StateAt`
      (`space.ReleaseStationkeep` at the stored dry instant) — `space-
      kinematics`: "A Station-Keeping Park Past Its Dry Instant Is Its
      Released Orbit, With No Extra Persisted State" (all three scenarios)
- [ ] 1.4 Implement the dry instant as the **ceiling-quantized inverse of
      `space.StationKeepUpkeep`**, exactly as `fleet-movement`'s
      "Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded
      Into the Stored Cargo Pool" states it: the earliest world time `T`,
      quantized UP to an integer millisecond, at which
      `space.StationKeepUpkeep(rate, holdStart, T)` reaches or exceeds
      `(fuelAtHoldStart − FuelParams.StationKeepReserveTons) ×
      FuelParams.DeltaVPerTon`. **Do not re-derive a `1000 ×` factor** —
      `space.StationKeepUpkeep` (`backend/space/park.go:164-167`) already
      converts `WorldMillis` to seconds internally, and restating that
      conversion here duplicates a value `space-kinematics` owns. **Do not
      divide by `DeltaVPerTon` where the budget multiplies** — that
      inversion understates endurance by `DeltaVPerTon²` (25× at today's
      placeholder value of 5.0)
- [ ] 1.5 Fixture cases in `fixtures/space/` for the two new `Park`
      fields' codec round-trip, the fold's output matching
      `ReleaseStationkeep` called directly, and the dry-instant
      computation itself (pin at least one case where `DeltaVPerTon ≠ 1`
      and one where `StationKeepReserveTons ≠ 0`, so a divide/multiply
      inversion or a dropped reserve subtraction would fail the fixture,
      not just a unit test)

## 2. The station-keeping reserve

- [ ] 2.1 Add `FuelParams.StationKeepReserveTons` to
      `backend/fleet/fuel_params.go` alongside `DeltaVPerTon`,
      `StartingFuelTons`, and `PricePerTon`, sourced through
      `DefaultFuelParams()` — a named tuning knob, never a literal at a
      call site. **Ship it as a placeholder and say so in its doc comment:
      its value is an open question for Travis** (design.md Open
      Questions); the structural rule, not the number, is what this change
      specifies — `fleet-movement`: "Station-Keeping Upkeep Never Drains a
      Fleet Below Its Reserve"
- [ ] 2.2 Subtract the reserve from the spendable budget everywhere the
      dry instant is computed (task 1.4 and every restamp/recompute), and
      settle the automatic force-demotion to exactly the reserve — never
      zero, never negative — same requirement ("An exhausted hold leaves
      exactly the reserve, never zero", "The reserve is never spent by
      upkeep across repeated hold cycles")
- [ ] 2.3 Confirm the reserve does **not** leak onto the burn path: a burn
      costing the fleet's entire held `fuel`, reserve included, still
      commits and lands the fleet at exactly zero — same requirement ("A
      burn may still spend the reserve down to zero"). This is the
      discriminating guard that the reserve was scoped to passive drain
      only, per `decisions.md`'s standing rejection of a reserve against
      burns

## 3. `hold`/`release` — the fleet verbs

- [ ] 3.1 Add `POST /v1/fleets/:fleetId/hold` (orbit → stationkeep,
      computing and storing the dry instant, debiting no fuel; rejected by
      name whenever the fleet's currently held `fuel` is at or below
      `StationKeepReserveTons`, since the computed dry instant would then
      not be strictly after the hold's start time) and
      `POST /v1/fleets/:fleetId/release` (stationkeep → orbit, settling
      accrued upkeep first) as instant, ownership-gated handlers —
      `fleet-movement`: "Station-Keeping Hold and Release Are Fleet Verbs"
      ("Holding converts an orbiting fleet to station-keep at its current
      offset", "Releasing converts a station-keeping fleet back to orbit",
      "Holding a fleet that is not orbiting is rejected by name", "Holding
      a fleet with insufficient fuel is rejected, not silently bricked",
      "Releasing a fleet that is not station-keeping is rejected by name")
- [ ] 3.2 Reject both verbs when the fleet is in lane transit, **before**
      any evaluation of its stored kinematic state — the one state in
      which `fleet-movement` forbids evaluating stored kinematic state at
      all — reusing `ErrFleetInTransit`, which the `respond` switch already
      maps to `409` with the lane-transit reason —
      `fleet-movement`: "Station-Keeping Hold and Release Are Fleet Verbs"
      ("Holding or releasing a fleet in lane transit is rejected by name")
- [ ] 3.3 Wire both routes through the same ownership check as every other
      fleet command — `fleet-movement`: "Fleet Command Endpoints Are
      Restricted to the Owning Corporation" ("A foreign corp cannot start
      another corp's fleet station-keeping", "A foreign corp cannot
      release another corp's fleet's station-keep hold"); `request-
      authorization`: "Corporation Resolution Seam Is Consumed By
      Ownership Checks" ("Mutating fleet and action endpoints now enforce
      ownership")
- [ ] 3.4 Wire the three new rejections as `409 Conflict` with pairwise
      distinct reason strings in the body's `error` field, following the
      five rejections the `respond` switch already maps that way (lane
      transit, jump-without-attachment, a claimed action slot, an
      out-of-range or occluded sweep, an unaffordable burn). **Do not copy
      cut-drive's wiring as a model** — `ErrNotBurning` is unwired and
      returns a bodyless `500` today; task 5.1 repairs it — same
      requirement, final paragraph
- [ ] 3.5 Implement `release`'s settlement debit by **delegating** to
      `space.StationKeepUpkeep(rate, holdStartTime, releaseTime)` and
      dividing its result by `FuelParams.DeltaVPerTon` to reach tons.
      **Do not pre-divide the elapsed `WorldMillis` difference by `1000`
      and do not divide the result by `1000` again** — that function
      already performs the milliseconds-to-seconds conversion, and doing it
      twice under-charges by `1000×`. **Implement no clamp**: a `release`
      strictly before the dry instant is provably strictly less than the
      spendable budget, so a clamp would be a rule with no caller —
      `fleet-movement`: "Station-Keeping Upkeep Is Settled at Discrete
      Events..." ("Releasing before exhaustion debits exactly the accrued
      upkeep, converted to tons")
- [ ] 3.6 Reject a `release` submitted at or after the hold's stored dry
      instant with the not-station-keeping reason — at that instant the
      "at or after" fold has already made the effective park an `orbit`
      park, so there is no hold to release and no clamped-debit path —
      same requirement ("A release at exactly the dry instant is rejected,
      the fold having already released the hold")
- [ ] 3.7 Run `hold` and `release` each inside **one transaction against a
      transactional re-read** of the fleet's park, hold fields, and
      `cargo.fuel`, re-evaluating every precondition against that re-read.
      Neither verb claims a channel slot, so nothing else serializes them
      against a concurrent refuel or burn debit — `fleet-movement`: "Hold
      and Release Settle In One Transaction Against a Transactional
      Re-Read" (both scenarios)
- [ ] 3.8 Test the round-trip conversion as a **bounded interval**: the
      closed-form accrual evaluated at the stored dry instant,
      `space.StationKeepUpkeep(rate, holdStart, dryInstant) /
      FuelParams.DeltaVPerTon`, is at least the spendable budget
      `fuelAtHoldStart − StationKeepReserveTons` and strictly less than
      that budget plus one millisecond's worth of upkeep
      (`rate × 0.001 / DeltaVPerTon` tons) — the interval is exactly one
      millisecond wide because the dry instant is ceiling-quantized, so an
      equality assertion is unsatisfiable in general while this bound is
      both correct and tight. Assert separately that the fuel the fold
      persists is **exactly** `StationKeepReserveTons`. Any factor-of-1000
      or factor-of-`DeltaVPerTon` error breaks the bound by orders of
      magnitude — `fleet-movement`: "Station-Keeping Upkeep Is Settled at
      Discrete Events..." ("Fuel exhaustion during a hold force-demotes to
      orbit, never negative")
- [ ] 3.9 Confirm the stored `fuel` value is untouched by a mere read
      during an open, unreleased hold strictly before its dry instant —
      regression guard — same requirement, "A read during an open hold
      reports the stored, unsettled fuel value"
- [ ] 3.10 Confirm the automatic force-demotion fold settles fuel to
      exactly the reserve, never below and never negative, on the write
      that first observes it past the dry instant — same requirement,
      "Fuel exhaustion during a hold force-demotes to orbit, never
      negative", "A hold that never reaches its dry instant is never
      demoted"
- [ ] 3.11 Confirm a release-then-re-hold cycle settles the first hold
      exactly once and computes a fresh, independent dry instant for the
      second — same requirement, "Releasing settles the accrual before any
      subsequent hold recomputes a fresh dry instant"
- [ ] 3.12 Resolve any past-ETA movement-channel action **before**
      evaluating either verb's own preconditions, through the same
      `settleIfDue` seam `OrderTo`/`CutDrive`/`Jump` already use. A
      body-targeted burn past its arrival folds to a `ParkOrbit`
      (`space/state.go:51-68`), so an unresolved arrival passes `hold`'s
      orbit-mode precondition while its slot is still claimed, and
      `BurnResolver`'s already-settled early return then applies **none** of
      the arrival's effects — `attachedTo` never set, the arrived-at gate's
      lane never charted. Assert those effects are applied, not merely that
      the hold survives — `fleet-movement`: "Station-Keeping Hold and
      Release Are Fleet Verbs" ("Holding or releasing over a
      completed-but-unresolved movement order settles it first")
- [ ] 3.13 Confirm `hold` is accepted for a fleet holding `fuel` strictly
      above the reserve by an arbitrarily small margin, storing a dry
      instant strictly after its hold-start — the accepting side of the
      ceiling-quantized inverse's boundary, paired with task 7.8's
      rejecting side — same requirement ("Holding with fuel just above the
      reserve is accepted")
- [ ] 3.14 Confirm `attachedTo` and docked/undocked status are unchanged
      by `hold`, `release`, and force-demotion — `fleet-movement`:
      "Station-Keeping Hold and Release Are Fleet Verbs" ("A fleet's
      attachment survives hold, release, and force-demotion")

*(task 3.12's settle-first step also supplies the host body `hold` records
its offset against; without it the recorded host is one the fleet is not
attached to.)*

## 4. Settlement at every other event that touches an open hold

- [ ] 4.1 Implement the settle-restamp-recompute step for a mid-hold
      `fuel` mutation, by any other fuel-mutating verb, that leaves the
      hold open afterward (in particular, a refuel settled while docked at
      a station the fleet is simultaneously holding beside — reachable,
      since `hold` does not alter `attachedTo` and `fuel-purchase` requires
      only docked-to-station): in the same transaction as the mutation,
      settle the upkeep accrued since the hold's stored start time, apply
      the mutation's own delta, then restamp the hold's start time to the
      mutation's instant and recompute the dry instant from the resulting
      fuel level — `fleet-movement`: "Station-Keeping Upkeep Is Settled at
      Discrete Events..." ("A refuel during an open hold settles the
      accrual, restamps the hold, and recomputes the dry instant")
- [ ] 4.2 Implement that step **inside `fuel-purchase`'s own one
      transaction**, not as a follow-up or compensating write, and confirm
      a replayed operation key performs none of it a second time — no
      second upkeep debit, no second restamp, no recomputation —
      `fuel-purchase`: "One Atomic Transaction — Credit Debit and Fuel
      Credit" ("A refuel into an open hold settles, credits, and restamps
      in the one transaction", "A replayed refuel performs no second
      upkeep debit, restamp, or recomputation")
- [ ] 4.3 Implement the **universal hold-ending settlement** as one shared
      step, invoked by every verb that ends or abandons an open
      `stationkeep` park, rather than as a per-verb special case: in the
      same transaction that ends the hold, first debit
      `space.StationKeepUpkeep(rate, holdStart, eventTime) /
      DeltaVPerTon`, then apply the verb's own effects, and **never
      restamp or recompute a dry instant** — `fleet-movement`:
      "Station-Keeping Upkeep Is Settled at Discrete Events..."
- [ ] 4.4 Route the **burn commit** through that shared step: settle
      first, then evaluate and debit the burn's own fuel cost against the
      resulting balance, then store the committed burn in place of the
      `stationkeep` park. A burn against a fleet whose hold is already past
      its dry instant settles via task 1.3's automatic fold instead, before
      the affordability check runs (task 4.7) — same requirement ("A burn
      committed from an open station-keeping hold settles its accrued
      upkeep and replaces the park, without restamping", "A burn that
      would leave exactly zero fuel after settlement still commits, never
      bricking the fleet")
- [ ] 4.5 Route **`stop`** through that shared step — including its free,
      below-the-speed-floor branch (`backend/fleet/service.go:829-849`),
      which a fleet holding at a lane gate **always** takes: a
      `stationkeep` park's velocity is its host body's
      (`space.Park.Velocity`), and `system.gateOrbit` gives every gate
      `PeriodMs = 0`, so that velocity is exactly zero. Without this,
      "hold, stop, pay nothing" makes camping a gate free. The free branch
      still charges no delta-v of its own — same requirement ("Stopping a
      fleet holding at a motionless gate settles its accrued upkeep")
- [ ] 4.6 Route **`jump`** through that shared step, in the same
      transaction that commits the jump (`service.go:938-1010` leaves the
      kinematic state untouched at commit, and `JumpResolver` then
      overwrites it with a fresh destination park, so an unsettled hold is
      simply discarded). The jump itself still costs no delta-v — same
      requirement ("Jumping from an open hold settles its accrued upkeep")
- [ ] 4.7 Implement the settle-past-dry-instant-first step in every
      fuel-reading decision path the requirement names: the burn-commit
      affordability check, `FreeHold`'s **five** production call sites
      (`mine/service.go:350`, `mine/resolver.go:76`, `fleet/handler.go:391`,
      `refuel/service.go:94`, and `fleet/cargo_tx.go:186`), the fleet
      read's estimated-maximum-range computation, and the fleet read's
      persistent stranded indication — `fleet-movement`: "Every Decision
      Reading Fuel Settles a Past-Dry-Instant Hold First" (all five
      scenarios)
- [ ] 4.8 Where a reading decision is a transaction that may abort, commit
      the settlement in a **separate write that precedes and is independent
      of** that transaction, never inside it. There are **three** such
      abortable transactions, not one: the burn commit; `mine`'s resolve
      clamp, whose `FreeHold` read runs inside `ResolveOne`'s transaction
      (`mine/resolver.go:76`); and the transaction-scoped free-hold figure
      `refuel` re-evaluates inside its own settlement transaction
      (`fleet/cargo_tx.go:186`). `action-dispatch`'s "A transaction-scoped
      producer's error aborts the commit entirely" means a settlement
      written inside a rejecting commit is discarded by construction, and
      the rejected-commit rule of "A Burn Commit Is Rejected When Its Fuel
      Cost Exceeds Available Fuel..." constrains the commit's own effects.
      Settling first satisfies both without a delta to either — same
      requirement ("A burn commit against a past-dry-instant holding fleet
      evaluates against settled, reserve-level fuel", and the persistence
      clause on all four consumer scenarios)
- [ ] 4.9 Make that settle-first write **conditional and transactional**:
      one transaction that re-reads the fleet's park and `cargo.fuel` and
      applies the settlement only if the re-read still shows an unfolded
      `stationkeep` park at or after its dry instant, writing **nothing**
      otherwise, and never setting `cargo.fuel` from a value read outside
      it. Unconditional, it is a fourth unserialized `cargo.fuel` writer
      issued by seven consumers, and an absolute set from a stale pre-read
      destroys a refuel that landed in between — the tonnage and the
      credits spent on it — same requirement ("A settlement write racing a
      refuel never discards the purchased fuel")

## 5. Drift repair — three fleet rejections currently returning a bodyless 500

*No spec delta: all three requirements are already live and already
correct; the handler simply never implemented them. Routed here because
this change already rewrites that exact `respond` switch. Full write-up:
`docs/plans/continous_space/handoffs/drift-fleet-wrong-state-500.md`.*

- [ ] 5.1 Map `fleet.ErrNotBurning` (`service.go:707`) to `409 Conflict`
      with a reason-bearing body, its message **distinct from the
      already-arrived rejection's** — `fleet-movement` (live): "Cutting a
      parked, drifting, or in-transit fleet is rejected by name"
      (`openspec/specs/fleet-movement/spec.md:315`)
- [ ] 5.2 Map `fleet.ErrAccelBelowFloor` (`service.go:504`, `:510`) and
      `fleet.ErrAccelAboveCeiling` (`:507`) to `400 Bad Request` with
      reason-bearing bodies, pairwise distinct from one another —
      `fleet-movement` (live): "A commanded acceleration below the
      disclosure floor is rejected"
      (`openspec/specs/fleet-movement/spec.md:528`) and "A commanded
      acceleration above the ceiling is rejected" (`:521`)
- [ ] 5.3 Assert in tests that the three reasons are **pairwise distinct**,
      not merely non-`500`. A status-only assertion passes against a
      handler that maps all three to one generic rejection, which is
      exactly the defect the three live scenarios' "by name" wording
      forbids

## 6. Cargo-pool and mine housekeeping

- [ ] 6.1 Extend the cargo-pool enumeration to name every station-keeping
      settlement event — `release`, the automatic force-demotion (settling
      to the reserve), a mid-hold mutation that leaves the hold open
      (restamping), and any verb that ends or abandons an open hold (never
      restamping) — restoring the two in-capability cross-references (to
      "A Burn Commit Is Rejected When Its Fuel Cost Exceeds Available
      Fuel, Debited At Commit Never At Resolve" and "Discarding a Running
      Burn Refunds Its Unspent Fuel, Closed-Form") `add-fuel-as-cargo`
      installed, rather than pointing at a change id. **Every**
      same-capability reference in this delta cites the requirement by bare
      title for the same reason: a change id dangles inside the live spec
      once this change archives — `fleet-movement`:
      "Fleet Cargo Pool" ("An open station-keeping hold does not by itself
      change the stored fuel entry"; the pre-existing scenarios are
      unaffected)
- [ ] 6.2 Take the `mine-extraction` MODIFIED delta retiring **only** the
      `freeHoldAtResolve == freeHoldAtCommit` equality claim in "Resolve
      Clamps Yield to Reality": a station-keeping settlement landing
      mid-run (the automatic fold, or a mid-run `release`) mutates
      `fleet.cargo.fuel` while the fleet remains docked to the mined
      feature, since `hold` has no park-mode constraint tied to
      `attachedTo`. The `holdFull` branch **stays structurally
      unreachable** in production and the delta says so — a settlement only
      ever debits `fuel`, so it can only widen free hold, and no production
      writer can grow a fleet's non-fuel cargo mid-run. Do **not** write a
      test that induces `holdFull` by writing cargo straight into the fleet
      document — `mine-extraction`: "Resolve Clamps Yield to Reality" (all
      five scenarios, including "A station-keeping settlement landing
      mid-run widens free hold and changes no take")

## 7. Validation

- [ ] 7.1 `openspec validate add-stationkeep-hold-verb --strict` passes,
      and `python3 .claude/scripts/openspec-reconcile.py
      add-stationkeep-hold-verb` reports OK (the archiver refuses a
      MODIFIED block that drops a live scenario; `--strict` does not catch
      that)
- [ ] 7.2 Backend integration test: hold → advance world time past the dry
      instant → read folds to `orbit` with `fuel` **exactly the reserve**,
      never zero — traces to `fleet-movement`: "Fuel exhaustion during a
      hold force-demotes to orbit, never negative"
- [ ] 7.3 Backend integration test: hold → release strictly before
      exhaustion → `fuel` debited by exactly
      `space.StationKeepUpkeep(rate, holdStart, releaseTime) /
      DeltaVPerTon`, with the elapsed duration passed as two `WorldMillis`
      stamps (never pre-divided) and the result never divided by `1000`
      again, the fleet left holding strictly more than the reserve with no
      clamp applied, and the park re-circularized — traces to
      `fleet-movement`: "Releasing before exhaustion debits exactly the
      accrued upkeep, converted to tons"
- [ ] 7.4 Backend integration test: a `release` submitted at exactly the
      stored dry instant is rejected `409` with the not-station-keeping
      reason, and the fleet's `fuel` is exactly the reserve, settled by the
      fold — traces to "A release at exactly the dry instant is rejected,
      the fold having already released the hold"
- [ ] 7.5 Backend integration test: `mine`'s resolve clamp and commit-time
      `FreeHold` check both read the **settled, correct** value for a
      station-keeping fleet observed past its dry instant, not merely a
      *stable* one — a test that only asserts stability passes against the
      stale-over-report bug this change exists to close, so assert the
      value equals what a fresh fold to `orbit` with `fuel` at the reserve
      would produce — traces to `fleet-movement`: "FreeHold used by mine's
      resolve clamp reflects a settled hold"
- [ ] 7.6 Backend integration test: dock at a station while
      simultaneously holding beside it, refuel, then advance past the
      pre-refuel hold's original (now stale) dry instant — the refueled
      tonnage survives, because the refuel settled-restamped-recomputed
      the hold inside its own settlement transaction — traces to
      `fleet-movement`: "A refuel during an open hold settles the accrual,
      restamps the hold, and recomputes the dry instant" and
      `fuel-purchase`: "A refuel into an open hold settles, credits, and
      restamps in the one transaction"
- [ ] 7.7 Backend integration test: a `release` and a refuel submitted
      concurrently against the same fleet both take effect — no purchased
      tonnage is lost to a last-write-wins race — and two concurrent
      identical `hold` requests store exactly one park with one hold-start
      and one dry instant. Run against real concurrency, not a harness that
      steps around the race — traces to `fleet-movement`: "Hold and Release
      Settle In One Transaction Against a Transactional Re-Read" (both
      scenarios)
- [ ] 7.8 Backend integration test: `hold` against a fleet holding exactly
      the reserve (and against one holding less) is rejected, no
      `stationkeep` park is stored, and the fleet remains readable and
      re-orderable — traces to `fleet-movement`: "Holding a fleet with
      insufficient fuel is rejected, not silently bricked"
- [ ] 7.9 Backend integration test: hold at a lane gate, then `stop` — the
      free below-the-floor branch is taken (velocity is exactly zero) and
      the accrued upkeep is still debited; and separately, hold at a lane
      gate then `jump` — the accrued upkeep is debited in the jump's own
      commit transaction. Both assert a strictly positive debit, so a
      forgiving implementation fails — traces to "Stopping a fleet holding
      at a motionless gate settles its accrued upkeep" and "Jumping from an
      open hold settles its accrued upkeep"
- [ ] 7.10 Backend integration test: commit a burn from an open hold whose
      settlement plus the burn's own cost leaves exactly zero `fuel` — the
      commit succeeds, the burn replaces the park, and no `stationkeep`
      park with `dryInstant == holdStart` is ever persisted — traces to "A
      burn committed from an open station-keeping hold settles its accrued
      upkeep and replaces the park, without restamping", "A burn that would
      leave exactly zero fuel after settlement still commits, never
      bricking the fleet"
- [ ] 7.11 Backend integration test: a burn commit **rejected** for
      unaffordability against a fleet whose hold is past its dry instant
      still leaves the settlement durable (fuel at exactly the reserve,
      park folded to `orbit`), while the rejected commit itself persists
      nothing of its own — traces to "A burn commit against a
      past-dry-instant holding fleet evaluates against settled,
      reserve-level fuel"
- [ ] 7.12 Backend integration test: commit a mine run, then hold the
      mining fleet into `stationkeep` (attachment survives, per task 3.14)
      and let its upkeep settle before the run resolves — `freeHoldAtResolve`
      is strictly greater than `freeHoldAtCommit`, and the take is still
      the full requested `tons` with reason code `clean` — traces to
      `mine-extraction`: "A station-keeping settlement landing mid-run
      widens free hold and changes no take"
- [ ] 7.13 Backend integration test: a settle-first write and a refuel
      submitted concurrently against the same past-dry-instant holding
      fleet leave the refuel's credited tonnage intact — the settlement
      write, re-reading inside its own transaction, writes nothing. Then,
      separately, assert for each of the four consumers (mine's resolve
      clamp, refuel's free-hold precondition, the estimated range, the
      stranded indication) that the settled figure is **durably persisted
      before the decision**, by re-reading the stored fleet document after
      the consumer runs — an in-memory fold satisfies every "computed from
      the settled value" assertion while leaving the stored figure stale —
      traces to `fleet-movement`: "Every Decision Reading Fuel Settles a
      Past-Dry-Instant Hold First" (all six scenarios)
- [ ] 7.14 Backend integration test: `hold` (and `release`) submitted
      against a fleet whose body-targeted burn has passed its arrival but
      is unresolved — the arrival resolves first, `attachedTo` is set to
      the target body, the gate-lane charting (where the target is a gate)
      lands, and only then is the hold evaluated. Assert the arrival's
      effects, not merely the hold's presence — traces to "Holding or
      releasing over a completed-but-unresolved movement order settles it
      first"
- [ ] 7.15 `go test ./... -p 1` and
      `python3 .claude/skills/code-quality-checks/check.py` clean
