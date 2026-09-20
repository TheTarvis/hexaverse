# Link 7 (both halves) — adversary round 1: findings + orchestrator rulings

Verdicts: `add-fuel-as-cargo` **BLOCKED** (4 blockers, 4 majors, 4 minors);
`add-stationkeep-hold-verb` **BLOCKED** (5 blockers, 3 majors, 1 minor).

**ALL FINDINGS ACCEPTED.** Every one carries the adversary's own paste-ready text; use it
verbatim. Below records each finding's identity and anything I am adding on top.

**Verified clean — do not re-litigate:** all 11 MODIFIED blocks byte-reproduce every live
scenario heading; every MODIFIED target capability exists; no ADDED name collides; both
pass `--strict`; the RENAMED block in `request-authorization` is correctly paired.
**R0's algebra is DISCHARGED** — all three floor-priced requirements invert correctly
(`L = Δv²/(4a)` at `MinCommandedAccel = 1.0`), and the hull-count neutrality claim checks
out (capacity ∝ N, budget = F·DeltaVPerTon/N, roster-independent). R6's anti-faucet anchor
is sound. **The carve-out itself is clean**: zero `hold`/`release`/`stationkeep` residue in
link 7, and the `space-kinematics` delta does carry the two `Park` fields the fold needs.

---

## The two findings that matter most: both are ARITHMETIC, both caught by dimensional analysis

### B1 (BLOCKER) — `release` debits Δv into a tons-denominated field. **5× overcharge.**
The requirement body correctly mandates converting by `FuelParams.DeltaVPerTon` "without
the hull-count multiplier" — and then the normative bullet AND the acceptance scenario both
drop it, saying `release` debits `rate × elapsed`. `space.StationKeepRate`
(`backend/space/park.go:141`) returns a centripetal **acceleration** (Δv per second), so
`StationKeepUpkeep` returns **Δv, not tons**. At today's `DeltaVPerTon = 5.0` that is a
5× overcharge, and because the scenario IS the acceptance test, an implementer writing to
it ships the bug and passes its task. Take the corrected bullet and scenario verbatim
(divide by `FuelParams.DeltaVPerTon`).

### B2 (BLOCKER) — the dry-instant formula divides where it must multiply. **25× endurance error.**
`add-stationkeep-hold-verb/design.md:44` writes
`holdStart + (fuelAtHoldStart / DeltaVPerTon) / upkeepRate`. Dimensional check:
`[tons] / [Δv·ton⁻¹] / [Δv·s⁻¹]` = `tons²·Δv⁻²·s` — **not a time**. `DeltaVPerTon` is Δv
*per ton*, so the Δv available from F tons is `F × DeltaVPerTon` (OQ-3's own worked example
confirms: 100 t × 5.0 = 500 Δv). Correct form:
`dryInstant = holdStart + ceil_to_ms(1000 × (fuelAtHoldStart × DeltaVPerTon) / upkeepRate)`.
At 5.0 the written formula understates endurance by **25×**.

**Take the adversary's replacement including the explicit unit chain, and DELETE the
weasel parenthetical** ("in whatever consistent units the existing functions already use")
— that clause is not decidable and is what let the error through. It also folds in a
second gap: the dry instant is a `WorldMillis` derived from a float and **nothing said
which way it rounds**. Quantize UP, mirroring `space-kinematics`'s *Burn Timing Quantizes
to Integer World-Milliseconds by Ceiling*, so a hold is never folded dry early.

---

## `add-fuel-as-cargo`

- **A1 (BLOCKER)** — the stranding warning and the stranded indicator **cry wolf at the
  home station**. Neither says what happens when `space.SolveBurn` *errors* rather than
  returning an unaffordable cost — and it errors with `ErrArcTooShort` for exactly the most
  routine configuration in the game: a fleet parked at a station's insertion standoff,
  solving to that same station. So burning *to the refuelling point* fires the stranding
  warning, and a docked fleet with a full tank reads stranded forever. Take both sentences
  and both scenarios: an `ErrArcTooShort` candidate counts as **reachable at zero cost**;
  any other named failure counts as unreachable.
- **A2 (BLOCKER)** — the refund contradicts an **unmodified live scenario**. Live
  *Cut Drive Converts the Burn to a Drift and Goes Dark* says cut drive records "no credit
  or cargo effect", and this change requires it to credit a refund. After archive the same
  capability holds two requirements that flatly contradict each other on the same verb, and
  `--strict`, the archiver and the task list all pass. Take the MODIFIED delta on the live
  requirement (all seven scenarios reproduced, one THEN replaced).
- **A3 (BLOCKER)** — *A docked fleet with a running mine can still refuel* is
  **structurally impossible** (refuel needs docked-to-station; a mine run needs
  docked-to-the-mined-feature for its whole duration), so the scenario is uninducible while
  a task mandates confirming it. Worse, if an implementer *makes* it reachable, it becomes
  precisely the "future verb that can mutate cargo while docked to a mined feature" that
  live `mine-extraction`'s *Resolve Clamps Yield to Reality* names as the thing that would
  invalidate `freeHoldAtResolve == freeHoldAtCommit` — making the proposal's
  "`mine-extraction` — no delta, confirmed at authoring" false. Narrow to `goods-sale`'s
  model (running **scan**, not running mine) and drop the task clause.
- **A4 (BLOCKER)** — `board-view`'s *Refuel Commit* has **no double-submit guard and no
  operation-key rule**, while `fuel-purchase` requires a caller-supplied key and rejects a
  reused key with different parameters. Live `board-view` has a whole requirement for the
  sell side. A double-click double-charges — and this is the game's first credit **sink**,
  so the loss is the player's. Take the ADDED requirement with all three scenarios.
- **A5 (MAJOR)** — R4's mechanism **can compute but cannot reject**. The `action-dispatch`
  producer returns a merge map, so it closes the lost-update half of R4 but leaves the
  affordability half unenforceable inside the transaction. Extend the producer's contract to
  permit failing with a named error that aborts the commit, and add the scenario. Latent in
  link 7; live the moment the carve-out lands `release`'s unserialized debit.
- **A6 (MAJOR)** — rounding UP makes the reject-zero requirement **unfalsifiable**
  (`ceil(t·p) ≥ 1` always for positive t, p), so two scenarios are uninducible and two tasks
  mandate untestable tests — and the requirement's own justification cites the *floor* case
  it just forbade. The realistic failure is an implementer who cannot make the task pass and
  "fixes" the rounding to floor, reopening exactly the free-fuel hole R5 closed. Rescope both
  guards to misconfiguration, take the two replacement scenarios, and fix the overflow
  ordering ("cost computed only after tonnage is validated within free hold").
- **A7 (MAJOR)** — stop-in-place's **free** below-the-speed-floor branch can discard a
  fully-debited burn with no refund specified (a burn a few ms in is below the floor), and
  the trigger list also omits both cancel endpoints. Make the trigger **universal** rather
  than enumerated; take the boundary scenario.
- **A8 (MAJOR)** — the starting-fuel guard prices at the **ceiling** while design.md states
  a universal "never at the ceiling". The ceiling is *correct* here (an omitted `accel`
  defaults to the ceiling, so it is what a first order actually costs; at 8 vs 1.0 that is
  `√8 ≈ 2.83×`, and a floor-priced guard would certify a constant under which the default
  spawn burn is unaffordable — the very deadlock §0.3 exists to prevent). Take the carve-out
  sentence so nobody "fixes" it to the floor.
- **A9/A10/A11/A12 (MINORS)** — accept all: the served-fuel-price requirement contradicts
  itself and its foreign-fleet scenario is uninducible (foreign fleets 404, there is no
  response to carry the field); a mis-titled scenario; **name the grant marker's field and
  document** (R1's DBA finding said to name it and only the carve-out did); size the
  indicator's list-read fan-out as task 2.4 does.

## `add-stationkeep-hold-verb`

- **B3 (BLOCKER)** — a **mid-hold refuel is reachable** and is silently destroyed.
  design.md asserts "this change defines no such path", but: a body-targeted burn settles to
  an `orbit` park with `attachedTo` set → `hold` is accepted on an `orbit` park and by its
  own requirement does not alter `attachedTo` → `fuel-purchase` needs only "docked to a
  station". Dock at the station, hold, refuel — the obvious use of the verb. The dry instant
  is never recomputed and the fold settles fuel to **exactly zero**, so a player who holds
  with 1 t, buys 200 t, and drifts past the stale instant **loses all 200 t and the
  credits**. Take the settlement-on-any-fuel-mutation requirement and its scenario.
- **B4 (BLOCKER)** — `hold` at zero fuel writes a park **its own codec requirement
  rejects** (`dryInstant == holdStart`, not strictly after), and live `fleet-movement` then
  rejects the fleet by name — bricking it permanently. A stranded fleet, exactly the
  population link 7 made discoverable, is one `hold` away from unreadable. Add the
  precondition and scenario.
- **B5 (BLOCKER)** — between the dry instant and the first persisting write, **stored fuel
  over-reports** and every consumer reads it: the affordability gate (defeating "a committed
  burn can never later fail to resolve for lack of fuel"), `FreeHold`, `mine`'s commit gate
  and resolve clamp, `fuel-purchase`'s free-hold check. Task 4.4's guard checks `FreeHold`
  is *stable*, not *correct*, so it passes against the bug. Take the settle-before-read
  ordering requirement and its scenario.
- **B6 (MAJOR)** — omitting the hull-count multiplier from upkeep **recreates the exact
  roster inversion R9/OQ-7 exists to prevent**: `StationKeepRate` is body-derived, so a
  ten-hull fleet pays the same upkeep while carrying ten times the fuel — endurance scales
  linearly with roster size, free. **RULING: keep the rule as written** (extending it is a
  design call I decline to make unilaterally) **but take the Risks entry**, so the
  consequence is recorded rather than presented as a neutral omission.
- **B7 (MAJOR)** — **archive ordering is load-bearing and only one side declares it.** Both
  changes MODIFY `fleet-movement`'s *Fleet Cargo Pool*. The carve-out is written against
  link 7's post-archive text, so link 7 MUST archive first; the reverse order silently drops
  a scenario and `--strict` catches neither. Add the Impact bullet to `add-fuel-as-cargo`.
- **B8 (MAJOR)** — the carve-out's body **drops two live in-capability cross-references**
  link 7 installed and replaces them with a pointer to a **change id**, which after archive
  is a folder under `changes/archive/`, not a capability — and is self-referential. Restore
  link 7's pointers verbatim.
- **B9 (MINOR)** — a line-wrap breaks task 2.7's citation (`"Station-\n  Keeping..."`).
