## 1. `space-kinematics` — the persisted hold fields and the dry-instant fold

- [x] 1.1 Add the two new `stationkeep`-only `Park` fields (hold-start
      time, dry instant) and widen `EncodePark`/`DecodePark` to carry them
      — `space-kinematics`: "Idle Ships Park in Exactly One of Three
      Modes" ("A newly created station-keep park stores its start time and
      dry instant"); "Coordinates Cross the Persistence Boundary Through a
      Named Codec" ("Every park kind and a drift round-trip exactly
      through the codec")
- [x] 1.2 Widen the codec's decode guard to reject a `stationkeep` park
      whose **hold-start time** is absent or non-positive, as well as one
      whose dry instant is absent or not strictly after that hold-start —
      an absent hold-start decodes to `0`, and every accrual then computes
      from world-epoch zero, so guarding the dry instant alone leaves the
      larger corruption open — `space-kinematics`: "A station-keep park
      with a missing or invalid dry instant fails to decode" (all three
      branches: absent/non-positive hold-start, absent dry instant, dry
      instant not strictly later)
- [x] 1.3 Implement the past-dry-instant fold in `StateAt`
      (`space.ReleaseStationkeep` at the stored dry instant) — `space-
      kinematics`: "A Station-Keeping Park Past Its Dry Instant Is Its
      Released Orbit, With No Extra Persisted State" (all three scenarios)
- [x] 1.4 Implement the dry instant as the **ceiling-quantized inverse of
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
- [x] 1.5 Fixture cases in `fixtures/space/` for the two new `Park`
      fields' codec round-trip, the fold's output matching
      `ReleaseStationkeep` called directly, and the dry-instant
      computation itself (pin at least one case where `DeltaVPerTon ≠ 1`
      and one where `StationKeepReserveTons ≠ 0`, so a divide/multiply
      inversion or a dropped reserve subtraction would fail the fixture,
      not just a unit test)

## 2. The station-keeping reserve

- [x] 2.1 Add `FuelParams.StationKeepReserveTons` to
      `backend/fleet/fuel_params.go` alongside `DeltaVPerTon`,
      `StartingFuelTons`, and `PricePerTon`, sourced through
      `DefaultFuelParams()` — a named tuning knob, never a literal at a
      call site. **Ship it as a placeholder and say so in its doc comment:
      its value is an open question for Travis** (design.md Open
      Questions); the structural rule, not the number, is what this change
      specifies — `fleet-movement`: "Station-Keeping Upkeep Never Drains a
      Fleet Below Its Reserve"
- [x] 2.2 Subtract the reserve from the spendable budget everywhere the
      dry instant is computed (task 1.4 and every restamp/recompute), and
      settle the automatic force-demotion to exactly the reserve — never
      zero, never negative — same requirement ("An exhausted hold leaves
      exactly the reserve, never zero", "The reserve is never spent by
      upkeep across repeated hold cycles")
- [x] 2.3 Confirm the reserve does **not** leak onto the burn path: a burn
      costing the fleet's entire held `fuel`, reserve included, still
      commits and lands the fleet at exactly zero — same requirement ("A
      burn may still spend the reserve down to zero"). This is the
      discriminating guard that the reserve was scoped to passive drain
      only, per `decisions.md`'s standing rejection of a reserve against
      burns

## 3. `hold`/`release` — the fleet verbs

- [x] 3.1 Add `POST /v1/fleets/:fleetId/hold` (orbit → stationkeep,
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
- [x] 3.2 Reject both verbs when the fleet is in lane transit, **before**
      any evaluation of its stored kinematic state — the one state in
      which `fleet-movement` forbids evaluating stored kinematic state at
      all — reusing `ErrFleetInTransit`, which the `respond` switch already
      maps to `409` with the lane-transit reason —
      `fleet-movement`: "Station-Keeping Hold and Release Are Fleet Verbs"
      ("Holding or releasing a fleet in lane transit is rejected by name")
- [x] 3.3 Wire both routes through the same ownership check as every other
      fleet command — `fleet-movement`: "Fleet Command Endpoints Are
      Restricted to the Owning Corporation" ("A foreign corp cannot start
      another corp's fleet station-keeping", "A foreign corp cannot
      release another corp's fleet's station-keep hold"); `request-
      authorization`: "Corporation Resolution Seam Is Consumed By
      Ownership Checks" ("Mutating fleet and action endpoints now enforce
      ownership")
- [x] 3.4 Wire the three new rejections as `409 Conflict` with pairwise
      distinct reason strings in the body's `error` field, following the
      five rejections the `respond` switch already maps that way (lane
      transit, jump-without-attachment, a claimed action slot, an
      out-of-range or occluded sweep, an unaffordable burn). **Do not copy
      cut-drive's wiring as a model** — `ErrNotBurning` is unwired and
      returns a bodyless `500` today; task 5.1 repairs it — same
      requirement, final paragraph
- [x] 3.5 Implement `release`'s settlement debit by **delegating** to
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
- [x] 3.6 Reject a `release` submitted at or after the hold's stored dry
      instant with the not-station-keeping reason — at that instant the
      "at or after" fold has already made the effective park an `orbit`
      park, so there is no hold to release and no clamped-debit path —
      same requirement ("A release at exactly the dry instant is rejected,
      the fold having already released the hold")
- [x] 3.7 Run `hold` and `release` each inside **one transaction against a
      transactional re-read** of the fleet's park, hold fields, and
      `cargo.fuel`, re-evaluating every precondition against that re-read.
      Neither verb claims a channel slot, so nothing else serializes them
      against a concurrent refuel or burn debit — `fleet-movement`: "Hold
      and Release Settle In One Transaction Against a Transactional
      Re-Read" (both scenarios)
- [x] 3.8 Test the round-trip conversion as a **bounded interval**: the
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
- [x] 3.9 Confirm the stored `fuel` value is untouched by a mere read
      during an open, unreleased hold strictly before its dry instant —
      regression guard — same requirement, "A read during an open hold
      reports the stored, unsettled fuel value"
- [x] 3.10 Confirm the automatic force-demotion fold settles fuel to
      exactly the reserve, never below and never negative, on the write
      that first observes it past the dry instant — same requirement,
      "Fuel exhaustion during a hold force-demotes to orbit, never
      negative", "A hold that never reaches its dry instant is never
      demoted"
- [x] 3.11 Confirm a release-then-re-hold cycle settles the first hold
      exactly once and computes a fresh, independent dry instant for the
      second — same requirement, "Releasing settles the accrual before any
      subsequent hold recomputes a fresh dry instant"
- [x] 3.12 Resolve a due-but-unresolved movement-channel **burn** —
      specifically a burn, not any past-ETA action on that channel —
      **before** evaluating either verb's own preconditions, through the
      same `settleIfDue` seam `OrderTo`/`CutDrive`/`Jump` already use. The
      scope matches that seam's own `Mode == space.ModeBurn` guard
      (`fleet/service.go:428-432`), which no-ops for a co-resident mine
      action on the same slot; the requirement was narrowed to match, since
      a due mine action leaves no stale kinematic state for either verb to
      misread. A body-targeted burn past its arrival folds to a `ParkOrbit`
      (`space/state.go:51-68`), so an unresolved arrival passes `hold`'s
      orbit-mode precondition while its slot is still claimed, and
      `BurnResolver`'s already-settled early return then applies **none** of
      the arrival's effects — `attachedTo` never set, the arrived-at gate's
      lane never charted. Assert those effects are applied, not merely that
      the hold survives — `fleet-movement`: "Station-Keeping Hold and
      Release Are Fleet Verbs" ("Holding or releasing over a
      completed-but-unresolved movement order settles it first")
- [x] 3.13 Confirm `hold` is accepted for a fleet holding `fuel` strictly
      above the reserve by an arbitrarily small margin, storing a dry
      instant strictly after its hold-start — the accepting side of the
      ceiling-quantized inverse's boundary, paired with task 7.8's
      rejecting side — same requirement ("Holding with fuel just above the
      reserve is accepted")
- [x] 3.14 Confirm `attachedTo` and docked/undocked status are unchanged
      by `hold`, `release`, and force-demotion — `fleet-movement`:
      "Station-Keeping Hold and Release Are Fleet Verbs" ("A fleet's
      attachment survives hold, release, and force-demotion")
- [x] 3.15 Settle a **past-dry-instant `stationkeep` hold** as the third
      step of both verbs' ordered precondition sequence (lane transit → a
      due burn → an elapsed hold → the verb's own state and fuel
      preconditions), through the conditional, preceding, independent write
      of task 4.9 — **not** inside `hold`'s own transaction, which rejects.
      Without this step `hold` is free station-keeping forever: an elapsed
      hold IS an `orbit` park by task 1.3's fold, so the not-orbiting
      precondition accepts it; the stored `fuel` still over-reports by the
      whole accrual; and `hold` then computes a fresh dry instant from that
      figure and stamps it over the elapsed hold's, forgiving the accrual
      and skipping the force-demotion entirely. This is the ordering the
      whole upkeep economy rests on — `fleet-movement`: "Station-Keeping
      Hold and Release Are Fleet Verbs" ("Holding over a silently expired
      hold settles it first and is then rejected") and "Station-Keeping
      Upkeep Never Drains a Fleet Below Its Reserve" ("The reserve is never
      spent by upkeep across repeated hold cycles")

## 4. Settlement at every other event that touches an open hold

- [x] 4.1 Implement the settle-restamp-recompute step for a mid-hold
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
- [x] 4.2 Implement that step **inside `fuel-purchase`'s own one
      transaction**, not as a follow-up or compensating write, and confirm
      a replayed operation key performs none of it a second time — no
      second upkeep debit, no second restamp, no recomputation —
      `fuel-purchase`: "One Atomic Transaction — Credit Debit and Fuel
      Credit" ("A refuel into an open hold settles, credits, and restamps
      in the one transaction", "A replayed refuel performs no second
      upkeep debit, restamp, or recomputation")
- [x] 4.3 Implement the **universal hold-ending settlement** as one shared
      step, invoked by every verb that ends or abandons an open
      `stationkeep` park, rather than as a per-verb special case: in the
      same transaction that ends the hold, first debit
      `space.StationKeepUpkeep(rate, holdStart, eventTime) /
      DeltaVPerTon`, then apply the verb's own effects, and **never
      restamp or recompute a dry instant** — `fleet-movement`:
      "Station-Keeping Upkeep Is Settled at Discrete Events..."
- [x] 4.4 Route the **burn commit** through that shared step: settle
      first, then evaluate and debit the burn's own fuel cost against the
      resulting balance, then store the committed burn in place of the
      `stationkeep` park. A burn against a fleet whose hold is already past
      its dry instant settles via task 1.3's automatic fold instead, before
      the affordability check runs (task 4.7) — same requirement ("A burn
      committed from an open station-keeping hold settles its accrued
      upkeep and replaces the park, without restamping", "A burn that
      would leave exactly zero fuel after settlement still commits, never
      bricking the fleet")
- [x] 4.5 Route **`stop`** through that shared step — including its free,
      below-the-speed-floor branch (`backend/fleet/service.go:829-849`),
      which a fleet holding at a lane gate **always** takes: a
      `stationkeep` park's velocity is its host body's
      (`space.Park.Velocity`), and `system.gateOrbit` gives every gate
      `PeriodMs = 0`, so that velocity is exactly zero. Without this,
      "hold, stop, pay nothing" makes camping a gate free. The free branch
      still charges no delta-v of its own.
      **That branch has no transaction to ride today, and building one is
      part of this task.** Its only persistence is
      `s.actions.Cancel(ctx, f.ActiveActionId, cancelState)`, guarded by
      `f.ActiveActionId != ""`, and `Handler.Stop` performs no DAO write —
      so for a station-keeping fleet, which has **no active action**
      (`hold` claims no slot) and whose arrival burn already resolved, the
      branch currently writes **nothing**. Make it persist its `point`
      park, its cleared `attachedTo`, its `updatedAt`, and the hold
      settlement **unconditionally**, not only when an action is cancelled.
      Do **not** route the settlement into `cancelState`: an implementer
      who does ships a green test for a *mining* fleet (which does have an
      active action) while forgiving the accrual for the gate camper —
      exactly the defect the universal hold-ending rule exists to close.
      **This also repairs a pre-existing drift** requiring no spec delta:
      on that same branch, with no active action, `stop` today persists
      nothing at all, including the `point` park, against the already-live
      and already-correct `fleet-movement` requirement "Stopping at or
      below the speed floor is instant and free"
      (`openspec/specs/fleet-movement/spec.md:369-374`). It is the same
      write on the same branch, so it is one fix. Full write-up:
      `docs/plans/continous_space/handoffs/drift-stop-free-branch-no-write.md`
      — same requirement ("Stopping a fleet holding at a motionless gate
      settles its accrued upkeep")
- [x] 4.6 Route **`jump`** through that shared step, in the same
      transaction that commits the jump (`service.go:938-1010` leaves the
      kinematic state untouched at commit, and `JumpResolver` then
      overwrites it with a fresh destination park, so an unsettled hold is
      simply discarded). The jump itself still costs no delta-v. Carry the
      **past-dry-instant** case in that same transaction too — for `jump`
      and for `stop` (task 4.5), the fold settling `cargo.fuel` to the
      reserve rides the verb's own hold-ending transaction, **not** a
      preceding independent write, and no `upkeepTons` debit is stacked on
      top of it. Do **not** add either verb to task 4.7's eight consumers
      or to task 4.10's three abortable transactions: neither reads `fuel`
      to decide or as a `FreeHold` consumer, so an aborted jump
      (`ErrJumpNotAttached`, `ErrFleetInTransit`) ends no hold and leaves
      the fleet holding, past its dry instant, for the next fuel-reading
      consumer to settle by the ordinary rule — self-healing, not lossy —
      same requirement ("Jumping from an open hold settles its accrued
      upkeep", "A jump against a past-dry-instant hold settles it in the
      jump's own transaction", "A rejected jump leaves a past-dry-instant
      hold open and unsettled for the next reader")
- [x] 4.7 Implement the settle-past-dry-instant-first step in every
      fuel-reading decision path the requirement names: the burn-commit
      affordability check, `FreeHold`'s **five** production call sites
      (`mine/service.go:350`, `mine/resolver.go:76`, `fleet/handler.go:391`,
      `refuel/service.go:94`, and `fleet/cargo_tx.go:186`), the fleet
      read's estimated-maximum-range computation, and the fleet read's
      persistent stranded indication — eight consumers — plus `hold`'s own
      insufficient-fuel precondition, which the same requirement reaches
      through its "any other computation of a fleet's currently held fuel"
      clause (task 3.15) — `fleet-movement`: "Every Decision Reading Fuel
      Settles a Past-Dry-Instant Hold First" (the first six scenarios; the
      seventh — the in-transaction guard — is task 4.10)
- [x] 4.8 Where a reading decision is a transaction that may abort **with
      an answer**, commit the settlement in a **separate write that
      precedes and is independent of** that transaction, never inside it.
      There are **three** such transactions: the burn commit; the
      transaction-scoped free-hold figure `refuel` re-evaluates inside its
      own settlement transaction (`fleet/cargo_tx.go:186`); and `hold`'s
      own commit transaction, whose insufficient-fuel precondition reads
      the stored `fuel` and rejects (task 3.15). `action-dispatch`'s "A
      transaction-scoped producer's error aborts the commit entirely" means
      a settlement written inside a rejecting commit is discarded by
      construction, and the rejected-commit rule of "A Burn Commit Is
      Rejected When Its Fuel Cost Exceeds Available Fuel..." constrains the
      commit's own effects. Settling first satisfies both without a delta
      to either.
      **`mine`'s resolve clamp is NOT one of them**, and SHALL settle
      **inside** `ResolveOne`'s own transaction. Its `FreeHold` read
      (`mine/resolver.go:76`) runs inside a `ResolveFunc` that
      `action/dao.go`'s `ResolveOne` invokes within `RunTransaction`, with
      no per-type pre-transaction hook and three fleet-unaware entry
      points — a preceding write would require a new pre-resolve seam in
      `action-dispatch` that no requirement authorizes. That transaction
      also never rejects with an answer (a resolver error aborts and leaves
      the action `running` to be retried, and `ResolveResult.ActorState`
      merges onto the same fleet doc in the same transaction), and the
      choice changes no outcome: a settlement only widens free hold, and
      `tons` was already admitted at commit against a figure nothing can
      since have narrowed — same requirement ("A burn commit against a
      past-dry-instant holding fleet evaluates against settled,
      reserve-level fuel", "FreeHold used by mine's resolve clamp reflects
      a settled hold", and the preceding-write persistence clause on the
      remaining three consumer scenarios)
- [x] 4.9 Make that settle-first write **conditional and transactional**:
      one transaction that re-reads the fleet's park and `cargo.fuel` and
      applies the settlement only if the re-read still shows an unfolded
      `stationkeep` park at or after its dry instant, writing **nothing**
      otherwise, and never setting `cargo.fuel` from a value read outside
      it. Unconditional, it is a fourth unserialized `cargo.fuel` writer
      issued by seven of the eight consumers the requirement enumerates
      (`mine`'s resolve clamp settling in-transaction per task 4.8, plus
      `hold`'s own precondition, per task 3.15), and an absolute set from a
      stale pre-read
      destroys a refuel that landed in between — the tonnage and the
      credits spent on it — same requirement ("A settlement write racing a
      refuel never discards the purchased fuel")

- [x] 4.10 Add, inside each of the **three** abortable transactions task
      4.8 names — the burn commit's `ActorStateFunc`
      (`fleet/service.go:894-908`), the transaction-scoped free-hold
      re-evaluation inside refuel's own settlement transaction
      (`fleet/cargo_tx.go:169-188`), and `hold`'s own commit producer — a
      guard on **that transaction's own re-read**: if the re-read fleet's
      stored park is a `stationkeep` park at or after its stored dry
      instant, return an error and apply **none** of the transaction's
      effects. `hold` maps that error to its insufficient-fuel `409`
      (the settled figure being exactly the reserve, so no hold is
      affordable); the burn commit and the refuel return a **retryable**
      error, served as **`503 Service Unavailable`** with a reason-bearing
      body in both `fleet/handler.go`'s and `refuel/handler.go`'s switches.
      That status is **pinned here, not left to the implementer**: the
      failure is transient by construction — the dry instant passed between
      two transactions of one request, and the retry's own fresh settle-first
      write resolves it — so it is not the standing state conflict `409`
      denotes, and it follows `ErrDestinationNotReady`'s existing retryable
      precedent in the very same `respond` switch. Never a further bodyless
      `500`, which is the defect section 5 exists to repair. The retry issues
      a fresh preceding settlement write, which now observes the past dry
      instant and settles it before the decision is re-evaluated. The transaction SHALL never proceed on that re-read
      figure. Tasks 4.8 and 4.9 do not reach inside the deciding
      transaction — 4.8 mandates only that the settlement write *precede*
      it, 4.9 only that the write be conditional — so without this guard the
      window between the two transactions is open, and a `hold` re-issued
      once per dry instant is restamped from the stale figure forever —
      `fleet-movement`: "Every Decision Reading Fuel Settles a
      Past-Dry-Instant Hold First" ("A hold whose dry instant passes between
      the settle-first write and the commit is rejected, never restamped")

- [x] 4.11 Persist the resolver's `reasonCode` on the resolved action: add
      `{Path: "reasonCode", Value: res.ReasonCode}` to `ResolveOne`'s
      existing `tx.Update` (`backend/action/dao.go:334-339`), which is the
      resolve transaction's only write to the action document and today sets
      `status`, `outcome`, and `resolvedAt` and nothing else — and mirror it
      onto the returned in-memory `Action` beside `a.Outcome = res.Outcome`,
      which drops it on the return path too. `Action.ReasonCode` is
      `omitempty`, so until this lands the key is absent from
      `GET /v1/actions` **always**. Routed into this change rather than left
      to `add-scan-and-sightings-surface` (link 8b, which also carries the
      fix) because **this change's own `mine-extraction` delta requires it**:
      four of "Resolve Clamps Yield to Reality"'s five scenarios assert the
      resolved action's reason code — including this change's own added "A
      station-keeping settlement landing mid-run widens free hold and changes
      no take" — and no other task here makes any of them satisfiable. A
      requirement this change takes with no task to build it is the
      specified-but-never-built defect. **Verify by reading the action back
      from the store**, never by inspecting the returned `ResolveResult`:
      `backend/fleet/scan_resolver_test.go:280` already asserts on the
      returned struct and passes forever while the field reaches no document.
      This unblocks task 7.12's
      `TestMineClamp_Scenario_AStationKeepingSettlementLandingMidRunWidensFreeHoldAndChangesNoTake`,
      whose station-keeping assertions all already pass. **No spec delta**:
      link 8b owns the `action-dispatch` requirement scenario ("A resolver's
      reason code is persisted on the action and served") and its own tasks
      1.12/3.10 already say to verify and mark done if this landed first, so
      whichever change lands first satisfies both — `mine-extraction`:
      "Resolve Clamps Yield to Reality" ("A clean run takes the full target",
      "A dry lode clamps to what remains", "A full hold clamps to free
      capacity", "A station-keeping settlement landing mid-run widens free
      hold and changes no take"). Full write-up:
      `docs/plans/continous_space/handoffs/drift-reasoncode-never-persisted.md`

## 5. Drift repair — four fleet rejections currently returning a bodyless 500

*No spec delta: all four requirements are already live and already
correct; the handler simply never implemented them. Routed here because
this change already rewrites that exact `respond` switch. The fourth
sentinel (task 5.4) was surfaced during implementation of the first three,
in the same switch and against the same class of live requirement. Full
write-up:
`docs/plans/continous_space/handoffs/drift-fleet-wrong-state-500.md`.*

- [x] 5.1 Map `fleet.ErrNotBurning` (`service.go:707`) to `409 Conflict`
      with a reason-bearing body, its message **distinct from the
      already-arrived rejection's** — `fleet-movement` (live): "Cutting a
      parked, drifting, or in-transit fleet is rejected by name"
      (`openspec/specs/fleet-movement/spec.md:315`)
- [x] 5.2 Map `fleet.ErrAccelBelowFloor` (`service.go:504`, `:510`) and
      `fleet.ErrAccelAboveCeiling` (`:507`) to `400 Bad Request` with
      reason-bearing bodies, pairwise distinct from one another —
      `fleet-movement` (live): "A commanded acceleration below the
      disclosure floor is rejected"
      (`openspec/specs/fleet-movement/spec.md:528`) and "A commanded
      acceleration above the ceiling is rejected" (`:521`)
- [x] 5.3 Assert in tests that the three reasons are **pairwise distinct**,
      not merely non-`500`. A status-only assertion passes against a
      handler that maps all three to one generic rejection, which is
      exactly the defect the three live scenarios' "by name" wording
      forbids
- [x] 5.4 Map `space.ErrCutAfterArrival` to `409 Conflict` with a
      reason-bearing body, its message **pairwise distinct** from every other
      wrong-state rejection this switch serves — in particular from
      `ErrNotBurning`'s, which task 5.1 wires and whose own live scenario
      names it "distinct from the already-arrived rejection". **That mapping
      is correct and already implemented** (`backend/fleet/handler.go:326`),
      and it is necessary but **not sufficient**: the case is *unreachable*
      over HTTP, so the second half of this task is where the remaining work
      is.
      **Make the sentinel reachable.** `Handler.CutDrive` resolves its fleet
      id through `commandedFleetId` (`handler.go:150`), whose ownership check
      calls `h.svc.Get`, and `Service.Get` opportunistically resolves a due,
      unresolved burn (`service.go:261-264`) **before `Service.CutDrive` is
      ever entered**. `CutDrive`'s own `f.State.Mode != space.ModeBurn` guard
      (`service.go:786`) therefore fires first and returns `ErrNotBurning`,
      so neither of the two sites that surface this sentinel — directly at
      `service.go:803`, after `settleIfDue` resolves the due arrival, and by
      propagation from `space.CutDrive` at `:806` — is reachable over HTTP,
      and the already-arrived rejection comes back carrying `ErrNotBurning`'s
      message. The live scenario, which demands "its own named reason"
      explicitly distinct from that one, stays unmet. **Distinguish the
      already-arrived case before or inside `Service.CutDrive`**, so
      `space.ErrCutAfterArrival` actually reaches `respond` instead of being
      pre-empted by the pre-read's settlement. (This task's original premise —
      that the sentinel merely needed a `respond` case — predates the
      ownership pre-read introduced in commit `6a334ce`.)
      **The constraint that makes this non-trivial — do not "fix" it by
      weakening the pre-read.** `Service.Get`'s opportunistic settlement is
      REQUIRED behaviour, not incidental: it is the no-scheduler arrival
      contract, and it is where task 4.7 sites the durable past-dry-instant
      settlement for two of this change's own enumerated fuel-reading
      consumers (the estimated maximum range and the stranded indication). It
      SHALL NOT be removed, narrowed, made conditional on the caller, or
      bypassed for `commandedFleetId`'s ownership pre-read. The distinction
      SHALL be drawn instead from the state that settlement leaves behind — a
      burn settled by this request's own pre-read is observably different from
      a fleet that was never burning (a just-resolved burn action and the
      arrival park and effects it wrote, versus neither) — never by preventing
      the settlement from happening.
      **What makes a test of this vacuous:** calling `Service.CutDrive`
      directly, or otherwise bypassing `commandedFleetId` — precisely the
      mutation that turns the assertion green while the HTTP surface stays
      broken. Drive it through the route. Assert the reasons are **pairwise
      distinct**, not merely non-`500`, for the same reason task 5.3 gives,
      and assert the arrival's own effects landed (`attachedTo` set, the
      arrived-at gate's lane charted), since the live scenario requires the
      resolution as well as the rejection — `fleet-movement` (live): "Cutting
      an already-arrived burn resolves the arrival instead"
      (`openspec/specs/fleet-movement/spec.md:307-312`), whose "rejected with
      its own named reason" neither a bodyless 5xx nor a correctly-shaped
      response carrying the wrong reason can satisfy

## 6. Cargo-pool and mine housekeeping

- [x] 6.1 Extend the cargo-pool enumeration to name every station-keeping
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
- [x] 6.2 Take the `mine-extraction` MODIFIED delta retiring **only** the
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

- [x] 7.1 `openspec validate add-stationkeep-hold-verb --strict` passes,
      and `python3 .claude/scripts/openspec-reconcile.py
      add-stationkeep-hold-verb` reports OK (the archiver refuses a
      MODIFIED block that drops a live scenario; `--strict` does not catch
      that)
- [x] 7.2 Backend integration test: hold → advance world time past the dry
      instant → read folds to `orbit` with `fuel` **exactly the reserve**,
      never zero — traces to `fleet-movement`: "Fuel exhaustion during a
      hold force-demotes to orbit, never negative"
- [x] 7.3 Backend integration test: hold → release strictly before
      exhaustion → `fuel` debited by exactly
      `space.StationKeepUpkeep(rate, holdStart, releaseTime) /
      DeltaVPerTon`, with the elapsed duration passed as two `WorldMillis`
      stamps (never pre-divided) and the result never divided by `1000`
      again, the fleet left holding strictly more than the reserve with no
      clamp applied, and the park re-circularized — traces to
      `fleet-movement`: "Releasing before exhaustion debits exactly the
      accrued upkeep, converted to tons"
- [x] 7.4 Backend integration test: a `release` submitted at exactly the
      stored dry instant is rejected `409` with the not-station-keeping
      reason, and the fleet's `fuel` is exactly the reserve, settled by the
      fold — traces to "A release at exactly the dry instant is rejected,
      the fold having already released the hold"
- [x] 7.5 Backend integration test: `mine`'s resolve clamp and commit-time
      `FreeHold` check both read the **settled, correct** value for a
      station-keeping fleet observed past its dry instant, not merely a
      *stable* one — a test that only asserts stability passes against the
      stale-over-report bug this change exists to close, so assert the
      value equals what a fresh fold to `orbit` with `fuel` at the reserve
      would produce — traces to `fleet-movement`: "FreeHold used by mine's
      resolve clamp reflects a settled hold"
- [x] 7.6 Backend integration test: dock at a station while
      simultaneously holding beside it, refuel, then advance past the
      pre-refuel hold's original (now stale) dry instant — the refueled
      tonnage survives, because the refuel settled-restamped-recomputed
      the hold inside its own settlement transaction — traces to
      `fleet-movement`: "A refuel during an open hold settles the accrual,
      restamps the hold, and recomputes the dry instant" and
      `fuel-purchase`: "A refuel into an open hold settles, credits, and
      restamps in the one transaction"
- [x] 7.7 Backend integration test: a `release` and a refuel submitted
      concurrently against the same fleet both take effect — no purchased
      tonnage is lost to a last-write-wins race — and two concurrent
      identical `hold` requests store exactly one park with one hold-start
      and one dry instant. Run against real concurrency, not a harness that
      steps around the race — traces to `fleet-movement`: "Hold and Release
      Settle In One Transaction Against a Transactional Re-Read" (both
      scenarios)
- [x] 7.8 Backend integration test: `hold` against a fleet holding exactly
      the reserve (and against one holding less) is rejected, no
      `stationkeep` park is stored, and the fleet remains readable and
      re-orderable — traces to `fleet-movement`: "Holding a fleet with
      insufficient fuel is rejected, not silently bricked"
- [x] 7.9 Backend integration test: hold at a lane gate, then `stop` — the
      free below-the-floor branch is taken (velocity is exactly zero) and
      the accrued upkeep is still debited; and separately, hold at a lane
      gate then `jump` — the accrued upkeep is debited in the jump's own
      commit transaction. Both assert a strictly positive debit, so a
      forgiving implementation fails.
      **The stop fixture MUST use a fleet with no active movement action**
      (which a station-keeping fleet always is, `hold` claiming no slot)
      and MUST assert by **re-reading the stored fleet document**, never by
      inspecting the returned struct. A fixture with an active action —
      e.g. a mining fleet — passes against an implementation that carries
      the settlement on `actions.Cancel`'s `cancelState` and writes nothing
      at all for the gate camper, which is the exact defect (task 4.5).
      Assert in the same test that the `point` park and the cleared
      `attachedTo` are persisted too, which fails against today's code
      independently of any hold — traces to "Stopping a fleet holding at a
      motionless gate settles its accrued upkeep", "Jumping from an open
      hold settles its accrued upkeep", and (live, undelta'd) "Stopping at
      or below the speed floor is instant and free"
- [x] 7.10 Backend integration test: commit a burn from an open hold whose
      settlement plus the burn's own cost leaves exactly zero `fuel` — the
      commit succeeds, the burn replaces the park, and no `stationkeep`
      park with `dryInstant == holdStart` is ever persisted — traces to "A
      burn committed from an open station-keeping hold settles its accrued
      upkeep and replaces the park, without restamping", "A burn that would
      leave exactly zero fuel after settlement still commits, never
      bricking the fleet"
- [x] 7.11 Backend integration test: a burn commit **rejected** for
      unaffordability against a fleet whose hold is past its dry instant
      still leaves the settlement durable (fuel at exactly the reserve,
      park folded to `orbit`), while the rejected commit itself persists
      nothing of its own — traces to "A burn commit against a
      past-dry-instant holding fleet evaluates against settled,
      reserve-level fuel"
- [x] 7.12 Backend integration test: commit a mine run, then hold the
      mining fleet into `stationkeep` (attachment survives, per task 3.14)
      and let its upkeep settle before the run resolves — `freeHoldAtResolve`
      is strictly greater than `freeHoldAtCommit`, and the take is still
      the full requested `tons` with reason code `clean` — traces to
      `mine-extraction`: "A station-keeping settlement landing mid-run
      widens free hold and changes no take"
- [x] 7.13 Backend integration test: a settle-first write and a refuel
      submitted concurrently against the same past-dry-instant holding
      fleet leave the refuel's credited tonnage intact — the settlement
      write, re-reading inside its own transaction, writes nothing. Then,
      separately, assert for each of the three preceding-write consumers
      (refuel's free-hold precondition, the estimated range, the stranded
      indication) that the settled figure is **durably persisted before the
      decision**, by re-reading the stored fleet document after the
      consumer runs — an in-memory fold satisfies every "computed from the
      settled value" assertion while leaving the stored figure stale. For
      `mine`'s resolve clamp assert instead that the settled figure is
      persisted by the **resolve's own transaction** (re-read the fleet doc
      after the resolve, and assert nothing was written before it) — traces
      to `fleet-movement`: "Every Decision Reading Fuel Settles a
      Past-Dry-Instant Hold First" (the first six scenarios; the seventh is
      task 7.18)
- [x] 7.14 Backend integration test: `hold` (and `release`) submitted
      against a fleet whose body-targeted burn has passed its arrival but
      is unresolved — the arrival resolves first, `attachedTo` is set to
      the target body, the gate-lane charting (where the target is a gate)
      lands, and only then is the hold evaluated. Assert the arrival's
      effects, not merely the hold's presence — traces to "Holding or
      releasing over a completed-but-unresolved movement order settles it
      first"
- [x] 7.15 Backend integration test (**BLOCKER 1 regression, must fail
      against a build without task 3.15**): hold a fleet, advance world
      time past its stored dry instant **without any read or write
      observing the park in between**, then submit a second `hold`. Assert:
      `409` with the insufficient-fuel reason; the stored `fuel` is exactly
      the reserve; the stored park is the released `orbit` the settlement
      wrote, carrying no hold-start time and no dry instant; and no second
      `stationkeep` park was ever persisted.
      **What makes this vacuous:** any setup step that settles the first
      hold before the second `hold` is submitted — a `GET /v1/fleets/:id`,
      a `FreeHold` consumer, or an explicit force-demotion helper — since a
      pre-settled fleet already shows reserve-level `fuel` and an unfixed
      build rejects it for the right reason by accident. Drive the clock
      forward and go straight to the second `hold`; assert additionally
      that the fleet document was unmodified between the two calls except
      by the settle-first write itself — traces to `fleet-movement`:
      "Holding over a silently expired hold settles it first and is then
      rejected" and "The reserve is never spent by upkeep across repeated
      hold cycles"
- [x] 7.16 Backend integration test (**BLOCKER 2 regression, must fail
      against today's `stop`**): `stop` a fleet whose live speed is at or
      below the floor and which has **no active movement action**, in two
      fixtures — (a) an ordinary `point`/`orbit`-parked fleet, asserting
      the `point` park, cleared `attachedTo`, and `updatedAt` are persisted
      (this fails today against the already-live "Stopping at or below the
      speed floor is instant and free"), and (b) a fleet station-keeping at
      a motionless gate, asserting additionally a strictly positive upkeep
      debit. **What makes each vacuous:** giving the fixture an active
      action (any mining or burning fleet), which restores the
      `actions.Cancel` write and makes both fixtures pass against the
      unfixed code; and asserting on the handler's response body rather
      than a re-read of the stored document, which passes against an
      in-memory-only mutation. Neither shortcut is permitted — traces to
      `fleet-movement`: "Stopping a fleet holding at a motionless gate
      settles its accrued upkeep" and (live, undelta'd) "Stopping at or
      below the speed floor is instant and free"
- [x] 7.17 `go test ./... -p 1` and
      `python3 .claude/skills/code-quality-checks/check.py` clean
- [x] 7.18 Backend integration test (**must FAIL against a build carrying
      tasks 4.8 and 4.9 but not 4.10**): hold a fleet; advance world time to
      strictly **before** its stored dry instant; invoke the settle-first
      path by submitting a second `hold`, letting its preceding,
      independent settlement write run and correctly write **nothing**; then
      advance the clock **past** the dry instant *between* that write and
      the commit's own re-read. Under a scaled `common.NewWorldTime(epoch,
      scale)` clock this is an ordinary clock advance at a seam, not a race:
      it needs no concurrency harness, only an injection point between the
      two transactions (a test clock the settle write and the commit read
      separately, or a hook after the settle write). Assert `409` with the
      insufficient-fuel reason; that the stored park still carries its
      **original** hold-start time and dry instant, un-restamped; that the
      stored `fuel` is unchanged by the commit; and that a subsequent call
      then settles it to exactly the reserve. Repeat the same seam for the
      burn commit (assert `fuel` unchanged and no action created) and for
      refuel (assert no credit landed and the credits were not spent).
      **What makes this vacuous:** advancing the clock **before** the
      settle-first write instead of between it and the commit — the write
      then settles, the commit sees reserve-level fuel, and an unguarded
      build rejects for the right reason by accident (that is exactly task
      7.15's fixture, not this one); asserting on the response body rather
      than a re-read of the stored fleet document; and using a single shared
      clock reading captured once per request, which collapses the settle
      write's instant and the commit's re-read instant into one and closes
      the very window this test exists to open — traces to
      `fleet-movement`: "A hold whose dry instant passes between the
      settle-first write and the commit is rejected, never restamped"
- [x] 7.19 Backend integration test: hold a fleet at a lane gate, advance
      world time **past** its stored dry instant with no read or write
      observing the park in between, then (a) `jump` successfully — assert
      the stored `fuel` is exactly the reserve, the park is the released
      `orbit`, the accrual is charged **once** (no `upkeepTons` debit on
      top of the fold), and that no write touched the fleet document before
      the jump's own commit transaction; and (b) from the same setup, issue
      a jump that is **rejected** (not attached to that lane's gate body,
      or already in transit) — assert the stored park is still the
      unsettled `stationkeep` park with its original stamps, the stored
      `fuel` is still the pre-fold figure, and a subsequent fuel-reading
      consumer then settles it to exactly the reserve.
      **What makes this vacuous:** any setup step that observes the park
      between the clock advance and the jump (a `GET /v1/fleets/:id`, a
      `FreeHold` consumer), which pre-settles the fleet and makes both
      halves pass regardless; and asserting on the response body rather
      than a re-read of the stored fleet document — traces to
      `fleet-movement`: "A jump against a past-dry-instant hold settles it
      in the jump's own transaction", "A rejected jump leaves a
      past-dry-instant hold open and unsettled for the next reader"
