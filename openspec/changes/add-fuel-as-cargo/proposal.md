## Why

`decisions.md` (2026-08-27) settled fuel as a cargo commodity — occupying
hold mass like ore, bought at stations with credits, burned down as
delta-v is spent — and named it the economy's first real credit sink
against M11's pure faucet. Link 6 (`re-express-economy-positions`) has
already re-expressed mine/sell's positional predicates for the continuous
map and states, as a load-bearing ADDED requirement, that every body in a
system's body table is a valid attachment host; this change is what
finally spends that requirement on something — the refuel verb's
"docked" precondition needs no new co-location predicate because link 6
already wrote one down. This is a **semantic** dependency, not a merge
hazard: link 6 touches *Mine Offer*, *Sell Offer*, and one ADDED
`fleet-movement` requirement, while this change touches *Fleet Cargo
Pool*, *Spawn Asset Healing*, *Append-Only Trade Ledger*, *Corporation
Resolution Seam*, *Credit Balance Readout*, and new ADDED requirements —
zero requirement-header overlap between the two changes; link 7 is simply
written against link 6's post-archive text. Fuel has been an unpaid-for
line item in `space-kinematics` since `add-space-kinematics` (every burn's
delta-v price has had nothing to spend it from); this change gives it a
currency, closing that loop and correcting one premise `decisions.md` was,
on inspection during this change's own analysis, resting on that was not
actually true — corrected below.

**One correction to `decisions.md`, dated 2026-09-02, that this change is
the reason for:** `decisions.md`'s survivability argument for "a fleet can
strand, and stranding is a setback rather than a death" rested on three
landed pillars, the third being "fuel is cargo, so another fleet can
rescue it with a transfer that already exists as a verb." **No
cargo-transfer verb exists anywhere in the tree** — no endpoint, no
service method, no requirement, in any capability. Cargo moves in exactly
two ways: mine's resolver credits it, and `goods-sale`'s settlement debits
it. So stranding today is **permanent immobility**, not "immobility
pending rescue," softened only by the fact that a jump costs no delta-v
(`fleet-movement`'s "Jump costs no delta-v"), so a fleet that happens to
strand attached to a lane gate can still cross the galaxy indefinitely —
it simply cannot manoeuvre in any system. A fleet dry at a planet cannot
reach a gate. This change does not fix the gap — a transfer verb is a
real design surface (partial transfers, proximity vs. attachment,
ownership and hold capacity on both sides) and bolting it on unreviewed
here is how link 5's blockers happened — but it states the gap plainly
and records the follow-up change, `add-cargo-transfer`, in `chain.md`'s
downstream list.

**A second correction, softening the first rather than reversing it:**
delta-v RISES with commanded acceleration
(`Δv = commandedAcceleration × flightSeconds`, and
`flightSeconds = 2·√(curveLength / commandedAcceleration)`, so
`Δv = 2·√(commandedAcceleration × curveLength)`) — so a fleet's *maximum*
reach on a given amount of fuel is achieved at its *minimum* commanded
acceleration (`disclosure.MinCommandedAccel = 1.0`), not its ceiling. This
change's own analysis initially got this backwards in two places (the
range estimate and the stranding warning both priced at the acceleration
ceiling — corrected below), and getting it right materially changes how
severe stranding actually is: **a fleet with any fuel at all can always
crawl at the acceleration floor**, shedding velocity or reaching a nearby
station far more cheaply than a ceiling-priced estimate implies. This
does not close the missing-rescue gap above, but it means the population
of fleets that are *genuinely* unreachable (rather than merely slow) is
much smaller than a ceiling-priced accounting would suggest — stated
plainly in design.md's Risks rather than smoothed over.

**On the station-keeping half — carved out, not shipped here:** an
earlier draft of this change also shipped the `hold`/`release` verbs and
their fuel-denominated upkeep alongside fuel's introduction, on the
principle "ship the verb with the currency, or ship neither" (otherwise
`stationkeep` remains the fifth unreachable derivation this chain has
paid for). Review found that pricing station-keeping upkeep in fuel the
straightforward way — folding `cargo["fuel"]` continuously against
elapsed hold time — makes `fleet.FreeHold` (`backend/fleet/roster.go:157`)
time-dependent, and `FreeHold` has **four** call sites, including
`mine`'s resolve clamp (`mine/resolver.go:76`). Landing an untested new
fold underneath all four of those, in the same change that also redefines
fuel's own introduction, was judged a worse risk than delaying the verb by
exactly one link. **The `hold`/`release` verbs and their upkeep currency
move to a follow-up change, `add-stationkeep-hold-verb`, sequenced
immediately after this one** — they still ship together, honouring the
original principle exactly; only the timing moves. See that change's
proposal for the corrected fold design.

## What Changes

- Fuel becomes a reserved cargo kind (`cargo["fuel"]`) occupying hold
  capacity exactly like a mined resource — no separate tank field, no new
  storage shape.
- **BREAKING** (behaviour change, not a re-expression, per no-backcompat):
  every committed burn (an ordinary order, and stop-in-place's
  velocity-nulling branch) now prices a fuel cost — commanded acceleration
  times flight duration (`space-kinematics`'s existing delta-v price),
  multiplied by the fleet's roster hull count at commit, converted to tons
  by a placeholder constant `FuelParams.DeltaVPerTon = 5.0` (pending
  validation in play) — and is **rejected at commit** if the fleet cannot
  afford it. **Fuel is debited at commit, never at resolve**, so a
  committed burn can never subsequently fail to resolve for lack of fuel —
  this is what makes "never strands mid-burn" a mechanical guarantee
  rather than an assertion. The affordability check and the debit both
  evaluate against a transactional re-read of the fleet's actor state, not
  a pre-transaction snapshot (see the `action-dispatch` delta below) — a
  precondition satisfied only by an earlier read is never sufficient to
  commit.
- **The guardrail, stated as an explicit SHALL NOT:** commanded
  acceleration stays independent of loaded mass (cargo or fuel). Coupling
  them yields the rocket equation and destroys the closed-form
  brachistochrone `space-kinematics` is built on. Scaling the fuel *price*
  by roster hull count is deliberately not this coupling — hull count is
  fixed for the duration of a single burn (unlike loaded mass, which
  changes as fuel burns), so flight time stays the closed-form
  brachistochrone of a fixed curve at a fixed acceleration. **Correction to
  an earlier draft's rationale:** a fleet's cargo capacity is the *sum of
  its roster's per-class hold capacities* (`fleet-movement`'s "Derived
  Cargo Capacity and Mining Rate"), not a simple function of hull count —
  with today's single hull class the two are proportional, so scaling
  price by hull count and capacity by class move together and the
  neutrality claim holds; a second hull class would need this revisited
  (recorded as an open question rather than silently assumed away).
- A committed burn that would leave the fleet unable to afford a burn, **at
  the acceleration floor** (`disclosure.MinCommandedAccel`, the cheapest
  possible burn, not the ceiling — a correction from an earlier draft that
  priced this at the ceiling and would have false-alarmed against fleets
  that could still reach a station by crawling), to any station or
  lane-gate body in its destination system **warns, but does not block**,
  at commit. The evaluation is honestly an **N-solves scan** — one
  `space.SolveBurn` per candidate station/gate body in the destination
  system's body table, plus the body-table read itself — not the single
  closed-form solve `decisions.md` claimed; that claim is corrected here
  and `tasks.md` is sized against the honest cost. Because a warning fired
  at commit and never surfaced again is easy to miss, a fleet's own read
  additionally carries a **persistent** stranded indication (also priced
  at the floor), distinguishable from "idle," so a player who missed the
  toast can still discover the fleet's condition later from its roster row.
- Cutting a running burn, or superseding it with a new order before
  arrival (an ordinary re-target, or stop-in-place committing over an
  active burn), refunds the discarded burn's unspent fuel — a closed-form
  partial refund computed as the ratio of unflown to total flight duration
  applied to **the cost debited and stored in tons on the burn record at
  its own original commit** (not re-derived from acceleration and hull
  count a second time, and not requiring a fresh conversion or a roster
  re-read at discard). This is decided as correct (re-targeting is
  explicitly normal play per `fleet-movement`, and a no-refund rule would
  double-charge it), but it is a feel risk worth watching in play —
  flagged in design.md.
- Starting fuel is **forced**: a fresh corporation's starting hull, seeded
  unattached at a `point` park, would otherwise deadlock permanently (sale
  and refuel both require attachment; attachment requires a burn; a burn
  requires fuel). The grant is a configured constant — never a spawn-time
  solve, which would couple the grant to the kinematics package and make
  it non-deterministic across a tuning change — validated by a
  generated-sample invariant test (in the spirit of `system-interior`'s
  size/tonnage guards): over a large sample of seeded accounts, the
  constant must afford the solved burn from that account's deterministic
  spawn park to its home station. It is granted by the same idempotent
  spawn-healing pass that grants the opening credit balance, atomically
  anchored on a distinguishable, create-if-absent per-fleet grant marker —
  mirroring the opening credit grant's own `"spawn:" + corpId` ledger-doc
  anchor, since `/v1/corporations/me` is explicitly exempt from the
  per-corporation write quota and concurrency there is cheap — **never on
  the fleet's current fuel level being zero**, which would re-grant
  forever to a hull that legitimately burned its tank dry (an infinite
  faucet). The healing pass's existing *Concurrent bootstrap reads for one
  account heal exactly once* scenario widens to cover this fourth healed
  asset alongside the station, ledger entry, and balance it already
  enumerates.
- New capability `fuel-purchase`: an instant (not an action) refuel verb
  modelled on `goods-sale`'s architecture wherever it transfers — ownership
  404 before any other precondition, station resolved from the acting
  fleet's own system, idempotent by operation key — and departing from it
  exactly where fuel's economics differ: **one single global price
  constant**, served to clients on the fleet's own existing read (never
  duplicated as a client-side constant, so the offer's preview and the
  settlement's charged cost can never diverge) — **unlimited station
  supply** (no station-side write; the settlement transaction touches only
  the buying corporation's balance and the fleet's cargo pool) — **cost
  arithmetic that rounds up, against the buyer** (the mirror image of
  `goods-sale`'s seller-adverse floor — a dust refuel that would floor to
  zero credits would otherwise mint free fuel), is rejected outright if it
  would round to zero, and is overflow-safe — and **all-or-nothing fill**
  — a request costing more than the requester's balance is rejected in
  full, never partially filled the way `goods-sale`'s demand-entry fold
  partially fills a sale. Fuel is **not sellable back**:
  `npc-market-demand`'s existing "Tradable Goods Are Exactly the Mine
  Resource Kinds" already forbids it (fuel is not a `system.ResourceKind`),
  which closes the "sell the fuel you're mid-burn on" hole with no new
  rule — `goods-sale` and `npc-market-demand` take **no delta**.
- Client surface ships here, not deferred to link 8 (`build-production-
  space-view`): a fuel/range readout on the roster row, a persistent
  stranded indication distinct from idle, the commit stranding warning
  rendered as a non-blocking notice, and a refuel control beside the
  existing sell control on the board's docked-fleet panel. Commit-time
  rejection with no way to buy fuel would brick every corporation the
  moment its starting tank empties, so this cannot wait.
- Housekeeping deltas: `corporation-credits`' ledger entry-kind enumeration
  gains `fuel purchase`; `request-authorization`'s per-corporation write
  quota and its client-supplied-corporation-id guard both name `refuel`
  explicitly alongside `sell`, closing the gap where an implementer wiring
  middleware follows the enumeration rather than the general "any future
  trade-ledger route" clause.
- **`action-dispatch` DOES take a delta**, correcting this change's own
  earlier claim otherwise: `action.Commit`'s transaction
  (`backend/action/dao.go:163`) reads the actor doc only to check the
  channel-slot field; `CommitSpec.ActorState` is a **static map computed
  before that transaction opens**. Burn-vs-burn commits are serialized by
  the slot claim, but burn-vs-refuel is not — refuel is instant and claims
  no slot — so both a burn's fuel debit and a refuel's fuel credit can each
  write an absolute post-mutation value computed from a stale
  pre-transaction read, and one silently overwrites the other. `action-
  dispatch`'s `CommitSpec` gains a transaction-scoped `ActorState` producer
  so the affordability check and the debit both evaluate against the same
  transactional read the slot check already performs.

**No delta**, and each is deliberate:

- `focused-scan` — fuel was explicitly rejected as its currency
  (`decisions.md`, 2026-08-29); nothing here revisits that.
- `goods-sale`, `npc-market-demand` — fuel is not a `ResourceKind` and is
  therefore already untradable under the live rule; no new special case.
- `mine-extraction` — fuel composes through the existing derived free-hold
  computation automatically; a fleet carrying fuel simply has less room to
  mine into. Confirmed at authoring, not merely assumed.
- `space-kinematics` — its delta-v pricing formula is untouched; this
  change spends its output in a new currency, never edits the physics.
  (The one part of the original station-keeping design that *would* have
  needed a `space-kinematics` delta — a persisted dry instant on the park
  — is carved out to `add-stationkeep-hold-verb`; see Why.)

## Also recorded, not fixed here

- **`Stop In Place`'s committed burn prices at `space`'s package-level
  `defaultAccel`, not `DerivedAccelCeiling`, unlike an ordinary burn
  order** (a pre-existing inconsistency, surfaced only now because a burn's
  price now has a currency attached to it): an ordinary burn's fuel cost
  scales with the fleet's own acceleration ceiling and hull count; a stop
  burn's does not vary with roster composition the same way. Flagged for a
  future change; not fixed silently here.
- **A dry fleet drifting above the stop-in-place speed floor can never
  stop, in the strict case where it is above that floor and cannot burn at
  all.** `decisions.md` states stranding is "a setback rather than a
  death," but a fleet that cuts drive into a fast drift and then runs
  completely dry before ever slowing below the speed floor cannot burn to
  null its own velocity and never coasts below the floor to convert for
  free. Softened, but not closed, by the acceleration-floor correction
  above: any fleet with *some* fuel can crawl-decelerate cheaply well
  before this case applies, so the genuinely-stuck population is smaller
  than an earlier draft of this change assumed — but a fleet that reaches
  exactly zero fuel while still above the floor is still stuck. **This
  remains a genuine conflict with `decisions.md`, flagged for Travis
  rather than resolved by this change** — see design.md's Risks section.

## Impact

- Affected specs: `fleet-movement` (fuel pricing, commit-time
  affordability and debit, the stranding warning and its persistent
  indicator, cut/re-target refund, an estimated-range read field computed
  at the floor, the served-fuel-price field, plus the cargo-pool
  enumeration widened), `action-dispatch` (a transaction-scoped
  `ActorState` producer on `CommitSpec`), `corporation-spawn` (starting
  fuel as a healed spawn asset, its own reachability-guard requirement,
  and the widened concurrent-healing scenario), `fleet-roster` (fuel/range
  readout, the persistent stranded indication, the stranding-warning
  surface), `board-view` (a refuel offer and commit beside the existing
  sell controls, sourcing its price preview from the served field; the
  credit-balance readout widened to a second settlement source),
  `corporation-credits` (ledger entry-kind enumeration; the reconciliation
  divergence halt widened to name refuel explicitly, since it is this
  capability's first debit-shaped mutation and a sign error on a debit is a
  credit mint), `request-authorization` (the write-quota and
  client-supplied-id guards widened to name `refuel`), `system-interior`
  (`fuel` reserved from the generated `ResourceKind` namespace), and a new
  capability `fuel-purchase`.
- Affected code (once implemented): `backend/fleet/` (burn-commit fuel
  pricing/debit/refund/warning, the persistent stranded-indicator
  computation, the estimated-range and served-price read fields),
  `backend/action/` (`CommitSpec`'s new transaction-scoped `ActorState`
  producer, threaded through `action.Commit`'s existing transaction),
  `backend/space/` (unchanged — only consumed, not edited), a new
  `backend/refuel/` (or equivalent) package for the fuel-purchase verb,
  `backend/corporations/` (ledger entry-kind constant, spawn-healing's
  starting-fuel step and its atomic grant marker), `backend/middlewares/`
  or router wiring (refuel ownership and write-quota wiring),
  `frontend/components/board/` (refuel offer/commit controls),
  `frontend/components/roster/` or equivalent (fuel/range readout,
  stranded-indicator, stranding-warning notice), and a new `fixtures/
  fleet/` or `fixtures/refuel/` case family for the tons-per-delta-v
  conversion and the refuel cost-rounding rule.
- **Carved out, not part of this change's impact:** the station-keeping
  `hold`/`release` verbs and their fuel-denominated upkeep move to
  `add-stationkeep-hold-verb`, sequenced immediately after this one (see
  Why).
- No migrations, no backwards compatibility, no deprecation windows (solo
  toy) — the burn-commit affordability rejection and the new fuel field
  land outright, with no dual-write or flag-guarded rollout.
