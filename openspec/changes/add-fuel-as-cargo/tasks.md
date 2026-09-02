## 1. Fuel as cargo — storage and the hull-count-scaled price

- [ ] 1.1 Add `fuel` as a reserved cargo kind participating in the existing
      capacity/free-hold computation, mutated only by the enumerated verbs
      — `fleet-movement`: "Fleet Cargo Pool" ("Fuel occupies cargo
      capacity exactly like a mined resource", "No mine resolve or sale
      settlement ever touches the fuel entry"; the three pre-existing
      scenarios are unaffected)
- [ ] 1.1a Widen "Cut Drive Converts the Burn to a Drift and Goes Dark"
      (MODIFIED) so cutting a burn no longer claims "no credit or cargo
      effect" — it now refunds the discarded burn's unspent fuel per task
      2.5 — `fleet-movement`: "Cut Drive Converts the Burn to a Drift and
      Goes Dark" (all seven scenarios: the six pre-existing plus "Cutting a
      burn credits its unspent fuel")
- [ ] 1.2 Add `FuelParams.DeltaVPerTon` (placeholder 5.0) and a burn
      fuel-cost function (`space`-computed delta-v price × roster hull
      count ÷ `DeltaVPerTon`) — `fleet-movement`: "A Burn's Fuel Cost
      Scales With Roster Hull Count, Never Loaded Mass"
- [ ] 1.3 Unit-test that acceleration/flight-duration/delta-v price never
      vary with loaded cargo or fuel mass, only with hull count — same
      requirement, "Doubling a fleet's cargo mass changes neither its
      acceleration nor its flight duration"
- [ ] 1.4 Unit-test that fuel price and cargo capacity scale identically
      with hull count for a single-class roster, leaving max range
      roster-independent — same requirement, "Fuel cost and cargo
      capacity scale together for a single-class roster, leaving range
      roster-independent"

## 2. Burn commit — affordability, debit, warning, refund

- [ ] 2.1 Gate `In-System Burn Order to a Body or a Point`'s commit and
      `Stop In Place`'s committed-burn branch on the new fuel-cost
      function; reject unaffordable commits with a named reason,
      distinct from the persistent stranded reason (task 4). **When the
      rejected commit was itself a re-target superseding an active burn,
      the prior burn's cancellation and discard refund (task 2.5) SHALL
      NOT take effect** — evaluate the new order's affordability, and
      reject if unaffordable, before the transaction that would cancel the
      prior order and store the replacement is allowed to commit, so a
      fleet is never left cancelled-and-refunded with no replacement order
      stored — `fleet-movement`: "A Burn Commit Is Rejected When Its Fuel
      Cost Exceeds Available Fuel, Debited At Commit Never At Resolve"
      (all seven scenarios, including "A rejected re-target leaves the
      prior burn running and fuel unchanged")
- [ ] 2.2 Debit `fuel` cargo in the same commit transaction that stores the
      burn, computed via `action-dispatch`'s new transaction-scoped
      `ActorState` producer (task 3.1) rather than a value precomputed
      before the transaction opens — same requirement, "An affordable
      burn debits fuel at the instant of commit", "A concurrent,
      unserialized refuel is never lost to a racing burn debit"
- [ ] 2.3 Confirm resolve performs no fuel check of any kind (regression
      guard against a resolve-time re-check creeping in) — same
      requirement, "A committed burn can never fail to resolve for lack of
      fuel"
- [ ] 2.4 Implement the post-debit reachability scan **at the acceleration
      floor** (`disclosure.MinCommandedAccel`, never the fleet's
      `DerivedAccelCeiling`): solve a candidate burn to every station and
      lane-gate body in the destination system's body table at the floor,
      priced per the fuel-cost function, and attach a non-blocking warning
      to the commit response when none is affordable — `fleet-movement`:
      "A Burn Commit Warns, But Does Not Block, When It Would Leave the
      Fleet Unable to Reach a Station or Gate" (all five scenarios,
      including "A candidate too close to solve counts as reachable at
      zero cost" and "A candidate reachable only below the acceleration
      ceiling still suppresses the warning"). **A `space.ErrArcTooShort`
      candidate counts as reachable at zero cost** (the fleet is already
      at, or arriving at, that candidate's own insertion standoff — the
      routine case of burning to the very station being evaluated); any
      other named `space` error on a candidate counts as unreachable — get
      this backwards and a fleet parked at, or burning to, its home
      station false-alarms as unable to reach it.
      **Sizing note:** this is N `space.SolveBurn` calls (N = candidate
      stations/gates only, not the system's full body table), each
      running `space.SolveRounds`'s fixed round count internally — N ×
      `SolveRounds` total, not the single closed-form solve `decisions.md`
      claimed and not merely N — budget accordingly. **Floor note:** solving at the floor,
      not the ceiling, is load-bearing — get this backwards and the
      warning false-alarms against fleets that could crawl to safety.
- [ ] 2.5 Implement the closed-form discard refund
      (`(flightDuration − τ) / flightDuration` applied to the debited
      cost stored in tons on the burn record — task 2.6 adds that stored
      field), hull count pinned at the discarded burn's own original
      commit, and wire it into **every** discard path this capability
      defines — cut-drive, any movement-channel commit that supersedes a
      running, not-yet-arrived burn (an ordinary re-target, and *both*
      branches of stop-in-place, **including its free, below-the-floor
      branch**), and `POST /v1/fleets/:fleetId/cancel` /
      `POST /v1/actions/:actionId/cancel` — the trigger is universal, not
      an enumerated subset, so a future discard path inherits the refund
      automatically — `fleet-movement`: "Discarding a Running Burn Refunds
      Its Unspent Fuel, Closed-Form" (all six scenarios, including
      "Stop-in-place's free, below-the-floor branch still refunds a
      preceding running burn")
- [ ] 2.6 Add the debited-cost-in-tons field to the stored burn record,
      written at commit alongside the burn itself (this is new persisted
      state this change adds — one field, not a re-derivation from hull
      count and acceleration at discard time) — same requirement, "The
      refund is symmetric with the original debit's stored cost, not a
      re-derivation from the roster at discard time"
- [ ] 2.7 Fixture cases for the fuel-cost and refund conversions (hull
      count × delta-v × `DeltaVPerTon`, near-zero and near-full refund
      boundaries) under a new `fixtures/fleet/` (or equivalent) family

## 3. `action-dispatch` — the transaction-scoped `ActorState` producer

- [ ] 3.1 Extend `CommitSpec` with an optional transaction-scoped
      `ActorState` producer, invoked inside `action.Commit`'s existing
      transaction after the actor doc is read for the slot check, used in
      place of the static `ActorState` map when supplied, and able to
      return a named error that aborts the commit entirely (no action, no
      slot claim, no actor-state mutation) rather than only a fields map
      — `action-dispatch`: "Actions Commit With an Atomically Claimed
      Slot" ("A transaction-scoped ActorState producer computes its merge
      from the transactional read, not a stale snapshot", "A slot-claiming
      commit and an unserialized instant mutation on the same actor never
      lose an update", "A transaction-scoped producer's error aborts the
      commit entirely")
- [ ] 3.2 Wire the burn-commit verb service (task 2.2) to supply a
      producer that reads the fleet's current `fuel` from the
      transactional actor snapshot, computes the debit from that read
      (never from a value captured before `Commit` was called), and
      returns the unaffordable-commit error in place of a fields map when
      the transactional read shows the cost is no longer payable
- [ ] 3.3 Regression test: a burn commit and a concurrent refuel against
      the same fleet, submitted back-to-back with no external
      serialization, both land — traces to "A transaction-scoped
      ActorState producer computes its merge from the transactional read,
      not a stale snapshot" and "A slot-claiming commit and an
      unserialized instant mutation on the same actor never lose an
      update" in task 3.1
- [ ] 3.4 Regression test: a burn commit whose transactional re-read shows
      the fleet can no longer afford it aborts with no action created, no
      slot claimed, and no partial debit — traces to "A transaction-scoped
      producer's error aborts the commit entirely" in task 3.1

## 4. Fleet read — estimated range and the persistent stranded indication

- [ ] 4.1 Add the estimated-maximum-range field to the fleet read
      endpoints for an owning corporation only, inverting the burn
      fuel-cost/brachistochrone formulas **at the acceleration floor**
      (`disclosure.MinCommandedAccel`) — `fleet-movement`: "Fleet Read
      Reports an Estimated Maximum Range From Current Fuel" (all three
      scenarios, including "The reported range is computed at the
      acceleration floor, not the ceiling")
- [ ] 4.2 Add the persistent stranded-indication field to the fleet read
      endpoints for an owning corporation only, re-running the
      floor-priced reachability scan (reusing task 2.4's evaluation,
      including its `space.ErrArcTooShort`-counts-as-reachable rule, not a
      separate implementation) fresh on every read — `fleet-movement`: "A
      Fleet's Read Reports a Persistent Stranded Indication, Computed at
      the Acceleration Floor" (all four scenarios, including "A docked
      fleet with a full tank never reads as stranded merely because its
      own dock is too close to solve"). **Sizing note, honestly stated as
      task 2.4's is:** a list read (`GET /v1/fleets?systemId=` or
      `?mine=true`) returning M owned fleets re-runs this evaluation once
      per fleet, so the list endpoint's total cost is M × (N ×
      `SolveRounds`) — M fleets times task 2.4's own per-fleet N ×
      `SolveRounds` cost, not a single evaluation amortized across the
      list.
- [ ] 4.3 Add the served fuel-price field to the fleet read endpoints, for
      an owning corporation reading its own fleet only — a foreign fleet
      is omitted from a list read and 404s on direct fetch, so there is no
      foreign-fleet response for this field to appear on — `fleet-
      movement`: "Fleet Read Serves the Configured Fuel Price, Never
      Duplicated Client-Side" (its one scenario)

## 5. Spawn — forced starting fuel

- [ ] 5.1 Extend `corporation-spawn`'s asset-healing pass with a
      starting-fuel step, atomically anchored on a named, create-if-absent
      marker document at `corporations/{corpId}/fuelGrants/{fleetId}`
      (never on `fuel == 0`) — `corporation-spawn`: "Spawn Asset Healing"
      (both new scenarios, plus the five pre-existing ones unaffected)
- [ ] 5.2 Add `FuelParams.StartingFuelTons` and the generated-sample
      reachability invariant test (spawn park → home station burn, solved
      **at the fleet's `DerivedAccelCeiling`, the one deliberate carve-out
      from this change's floor-pricing rule** — an order with no explicit
      acceleration defaults to the ceiling, so that is what a fresh
      corporation's real first order actually costs — affordable on the
      constant, over a large sample of seeded accounts) — `corporation-
      spawn`: "Starting Fuel Is a Configured Constant, Guarded By a
      Reachability Sample" (both scenarios). Treat a failing sample as a
      signal to retune the constant, per the requirement's own
      instruction — do not weaken the test, and do not "fix" this solve to
      the floor.
- [ ] 5.3 Widen the session-bootstrap concurrency test to cover the
      starting-fuel grant as a fourth healed asset alongside the station,
      ledger entry, and balance — `corporation-spawn`: "Session Bootstrap
      and Wake-Up Endpoints" ("Concurrent bootstrap reads for one account
      heal exactly once"; the six pre-existing scenarios are unaffected)

## 6. `fuel-purchase` — the refuel verb

- [ ] 6.1 Add `POST /v1/fleets/:fleetId/refuel` with ownership-404-first,
      then the docked-to-station check — `fuel-purchase`: "Refuel
      Requires Fleet Ownership, 404 Before Any Other Precondition" (all
      three scenarios); "Refuel Requires the Fleet Docked To the Selling
      Station" (all four scenarios)
- [ ] 6.2 Resolve the station from the acting fleet's own `systemId`
      only, with no system id or station identifier in the request body —
      `fuel-purchase`: "Refuel Resolves the Station From the Acting
      Fleet's Own System, Never a Client-Supplied Identifier" (both
      scenarios)
- [ ] 6.3 Add `FuelParams.PricePerTon`, a single global constant with no
      per-station or per-region variance, and confirm the settlement
      transaction never reads or writes any station-scoped quantity —
      `fuel-purchase`: "A Single Global Fuel Price, Unlimited Station
      Supply, No Station-Side Write" (all three scenarios)
- [ ] 6.4 Implement the cost-arithmetic rule: validate tonnage (task 6.6)
      **before** computing cost, then round the tonnage × price computation
      UP against the buyer. The reject-if-non-positive-price and overflow
      guards are **misconfiguration guards**, not live gameplay paths —
      rounding a positive tonnage's cost up against a strictly positive
      price can never itself produce zero, so do not "fix" a failing
      dust-refuel test by reverting to floor rounding — `fuel-purchase`:
      "Cost Arithmetic Rounds Against the Buyer, Is Overflow-Safe, and Is
      Never Zero" (all five scenarios: "Fractional cost rounds up against
      the buyer", "A misconfigured non-positive price rejects every
      refuel, rather than settling for free", "The reject-zero guard is
      unreachable under a correctly configured, positive price", "A
      misconfigured price causing an overflowing cost computation is
      rejected, not wrapped", "A settled refuel never appends a
      non-negative-signed ledger entry")
- [ ] 6.5 Implement all-or-nothing fill (reject in full when the full
      requested tonnage's rounded cost exceeds balance; never reduce to an
      affordable tonnage) — explicitly do NOT reuse `goods-sale`'s
      demand-entry fold, which partially fills — `fuel-purchase`: "Refuel
      Is All-Or-Nothing, Never Partially Filled" (both scenarios)
- [ ] 6.6 Validate positive, finite tonnage within free hold —
      `fuel-purchase`: "Positive Finite Tonnage Within the Fleet's Free
      Hold" (both scenarios)
- [ ] 6.7 Compose the one two-domain transaction (credit debit, fuel
      credit, ledger append), re-evaluating every precondition against a
      transactional re-read — `fuel-purchase`: "One Atomic Transaction —
      Credit Debit and Fuel Credit" (both scenarios)
- [ ] 6.8 Wire idempotency by operation key, scoped per corporation, with
      a replay-fingerprint conflict check — `fuel-purchase`: "Idempotent
      By Operation Key" (both scenarios)
- [ ] 6.9 Give every rejection this verb defines its own distinguishable
      reason, with the two existence-hiding rejections byte-identical —
      `fuel-purchase`: "Rejections Report a Distinguishable Reason" (both
      scenarios)
- [ ] 6.10 Confirm no `action-dispatch` action, channel slot, or ETA is
      ever created by refuel, and that it proceeds alongside a running
      scan on the sensor channel (a running mine is not a reachable
      co-resident case — mine requires attachment to the mined feature,
      refuel requires attachment to a station, and the two are mutually
      exclusive) — `fuel-purchase`: "Instant, Not an Action" (both
      scenarios)

## 7. Ledger and ownership-surface housekeeping

- [ ] 7.1 Add `fuel purchase` to the ledger entry-kind enumeration, fleet-
      scoped like a sale — `corporation-credits`: "Append-Only Trade
      Ledger" ("A fuel-purchase entry records its fleet, quantity, and
      negative amount")
- [ ] 7.2 Wire `POST /v1/fleets/:fleetId/refuel` through the per-
      corporation write quota alongside `sell`, and add the deny-path test
      — `request-authorization`: "Per-Corporation Write Quota on
      Player-Initiated Trade Routes" ("A corporation exceeding its quota
      via refuel requests is rejected the same way as via sale requests";
      the four pre-existing scenarios are unaffected)
- [ ] 7.3 Confirm the refuel endpoint ignores a client-supplied
      `corporationId` field, resolving exclusively via `common.ActorCorp`
      — `request-authorization`: "The Sell and Refuel Endpoints Ignore a
      Client-Supplied Corporation Id" ("A client-supplied corporation id
      in the refuel body has no effect"; the pre-existing sale scenario is
      unaffected)
- [ ] 7.4 Confirm a confirmed reconciliation divergence blocks a refuel
      exactly as it blocks a sale — `corporation-credits`: "Reconciliation
      Runs On a Stated Cadence, Chained at Write Time, and Halts Mutation
      On Divergence" ("A corporation with a confirmed divergence cannot
      refuel either"; the three pre-existing scenarios are unaffected)
- [ ] 7.5 Reject `fuel` as a configured `system.ResourceKind` at
      generation time — `system-interior`: "The Fuel Resource-Kind Name Is
      Reserved From Generation" (both scenarios)

## 8. Client surface

- [ ] 8.1 Add the fuel/estimated-range readout to the roster row,
      rendering the server-reported figures verbatim — `fleet-roster`:
      "The Roster Row Shows Held Fuel and an Estimated Range" (both
      scenarios)
- [ ] 8.2 Add the persistent stranded indication to the roster row,
      rendered fresh from every fleet read regardless of whether the
      player ever saw the commit-time warning — `fleet-roster`: "The
      Roster Row Shows a Persistent Stranded Indication" (all three
      scenarios)
- [ ] 8.3 Render the burn-commit stranding warning as a distinct,
      non-blocking notice alongside the order's own success feedback —
      `fleet-roster`: "A Burn Commit's Stranding Warning Is Surfaced to
      the Player" (all three scenarios)
- [ ] 8.4 Add the refuel offer (tonnage input defaulting to
      `min(freeHold, balance ÷ price)`, cost preview sourced from the
      fleet read's served price field, never a client-side constant)
      beside the existing sell control on the docked-fleet panel —
      `board-view`: "Refuel Offer on the Docked Fleet" (all five
      scenarios)
- [ ] 8.5 Add refuel commit (success/failure toasts, no slippage refresh,
      hold/range/balance refresh on success) — `board-view`: "Refuel
      Commit" (all three scenarios)
- [ ] 8.6 Widen the credit-balance readout to update and announce on a
      refuel commit response, not only a sale — `board-view`: "Credit
      Balance Readout" (the two new refuel scenarios; confirm the four
      pre-existing sale scenarios are unaffected)
- [ ] 8.7 Disable the refuel control from commit until settle/fail, and
      scope exactly one operation key per user-initiated attempt (reused
      across transport-level retries, fresh on a new or re-priced attempt)
      — this is the game's first credit sink, so a missed double-submit
      guard double-charges the player, not a venue — `board-view`: "Refuel
      Control Guards Against Double-Submit" (all three scenarios)

## 9. Validation

- [ ] 9.1 `openspec validate add-fuel-as-cargo --strict` passes
- [ ] 9.2 Backend integration test: a fresh spawn's starting fuel affords
      its seeded spawn-to-home-station burn (the single most important
      scenario in this change) — traces to `corporation-spawn`: "A seeded
      hull can reach its home station on its starting fuel"
- [ ] 9.3 Backend integration test: an unaffordable burn is rejected at
      commit with no fuel debited and no burn stored; an affordable one
      debits exactly its computed cost; and an unaffordable **re-target**
      against a fleet mid-burn leaves that prior burn running, uncancelled,
      and the fleet's `fuel` cargo unchanged (no discard refund credited)
      — traces to `fleet-movement`: "An unaffordable burn is rejected and
      nothing is stored or debited", "An affordable burn debits fuel at
      the instant of commit", "A rejected re-target leaves the prior burn
      running and fuel unchanged"
- [ ] 9.4 Backend integration test: cut-drive, re-target, stop-in-place's
      free below-the-floor branch, and both cancel endpoints each refund
      the discarded burn's unspent fuel, computed from the stored
      debited-cost field, before any new debit is applied — traces to
      `fleet-movement`: "Re-targeting mid-burn refunds the discarded
      burn's unspent fuel", "A stop-in-place order that supersedes an
      active burn refunds it before charging the stop", "Stop-in-place's
      free, below-the-floor branch still refunds a preceding running
      burn", "Cutting a burn credits its unspent fuel"
- [ ] 9.5 Backend integration test: a burn commit and a concurrent refuel
      against the same fleet both land, with no lost update — traces to
      `action-dispatch`: "A slot-claiming commit and an unserialized
      instant mutation on the same actor never lose an update"
- [ ] 9.6 Backend integration test: a refuel is filled in full or rejected
      in full, never partially, and a misconfigured non-positive
      `FuelParams.PricePerTon` rejects every refuel rather than minting
      free fuel — traces to `fuel-purchase`: "An unaffordable request is
      rejected in full, never reduced", "A misconfigured non-positive
      price rejects every refuel, rather than settling for free"
- [ ] 9.7 Backend integration test: the stranding warning and the
      persistent stranded indication both agree, both are computed at the
      acceleration floor, not the ceiling, and both treat a candidate
      `space.ErrArcTooShort` failure as reachable at zero cost — a fleet
      that can only reach a station by crawling, and a fleet docked at its
      own station, both show no warning and read as not stranded — traces
      to `fleet-movement`: "A burn that leaves the fleet able to reach at
      least one station or gate at the acceleration floor carries no
      warning", "A fleet that can still reach a station or gate at the
      floor does not read as stranded", "A candidate too close to solve
      counts as reachable at zero cost", "A docked fleet with a full tank
      never reads as stranded merely because its own dock is too close to
      solve"
- [ ] 9.8 Frontend test: the roster row and docked-fleet panel render the
      new fuel/range readout, stranded indication, stranding warning, and
      refuel control (including its double-submit guard) per their
      respective `data-testid` conventions
- [ ] 9.9 `go test ./... -p 1` and `cd frontend && npx vitest run` both
      green; `python3 .claude/skills/code-quality-checks/check.py` clean
