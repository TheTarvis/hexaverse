# Link 7 `add-fuel-as-cargo` — orchestrator rulings on the analyst's open questions

Binding. Author from these; do not re-open them. Anything not ruled here is a genuine
open question and goes to design.md's `## Open Questions` unanswered.

## The three structural findings — all upheld, all change the change's shape

### §0.1 `stationkeep` is unreachable. RULING: link 7 SHIPS the hold/release verbs.

`space.StationKeepRate`, `StationKeepUpkeep` and `ReleaseStationkeep` have **zero
production callers**. There is no `POST /v1/fleets/:id/hold` route; the registered
verbs are `orders`, `cut-drive`, `stop`, `jump`, `scan`. `StateAt` settles burns into
`ParkOrbit`/`ParkPoint` and never `ParkStationkeep`, and `fleet-movement` explicitly
forbids seeding one. So `decisions.md`'s force-demotion guardrail currently governs a
state **no player can reach**.

Specifying upkeep for an unreachable state would be the **fifth** instance of the
species this chain has now paid for four times (`fleet.GraphSource`,
`EnsureLaneHorizon`, `StationContinuousOrbit`, the focused scan's client half) — and I
reversed my own link 6 belt ruling for exactly this reason days-of-work ago. Ship the
verb with the currency, or ship neither. **Ship both.**

### §0.2 The rescue pillar does not exist. RULING: not fixed here, but `decisions.md` is WRONG and the proposal must say so.

`decisions.md` (2026-08-29) rests survivability on three landed things, the third
being "**Fuel is cargo**, so another fleet can rescue it with a transfer that already
exists as a verb." **There is no cargo-transfer verb** — no endpoint, no service
method, no requirement, anywhere. Cargo moves only via mine's resolver and sale
settlement. So stranding today is *permanent immobility*, not "immobility pending
rescue," and a decision recorded as settled rests on a premise that is false.

- Do NOT add a transfer verb in link 7 — it is a real design surface (partial
  transfers, proximity vs attachment, ownership, hold capacity on both sides) and
  bolting it on unreviewed is how link 5's blockers happened.
- The proposal MUST state the gap plainly and name the consequence.
- **Record the mitigation the analyst found, because it materially changes severity:**
  a jump costs no Δv (`fleet-movement`: *Jump costs no delta-v*), so a dry fleet
  attached to a lane gate can still cross the galaxy indefinitely — it just cannot
  manoeuvre in-system. Give it a scenario. It does not close the gap: a fleet dry at
  a planet cannot reach a gate.
- Follow-up change `add-cargo-transfer`, recorded in the proposal and in chain.md's
  downstream list.

### §0.3 A fresh corporation deadlocks without starting fuel. RULING: starting fuel is FORCED.

Spawn seeds a `point` park, unattached; sale/refuel require attachment; attachment
requires a burn; a burn requires fuel. Zero starting fuel = game over at t=0.

**Amount:** a configured constant, NOT a spawn-time solve (a solve at spawn couples
the grant to the kinematics package and makes the grant non-deterministic across a
tuning change). Guard it with a **generated-sample invariant test**: over a large
sample of seeded accounts, the constant SHALL afford the solved burn from the
deterministic spawn park to the home station. If the constant fails the sample, the
constant moves — that is a tuning fix, not a spec change. This is the same discipline
`system-interior`'s size/tonnage guards already use.

The scenario *A seeded hull can reach its home station on its starting fuel* is the
single most important one in the change. Treat it as such.

## Rulings on OQ-1 … OQ-10

**OQ-1 — fuel price model → (a) a SINGLE GLOBAL CONSTANT.** Not per-region, not a
supply fold. Fuel is this economy's first sink; making it geography immediately
couples it to region data and multiplies the surface for no gameplay that is reachable
yet. Widening a constant into a table later is purely additive. Record (b) per-region
and (c) joining `npc-market-demand`'s ordered-entry fold as recorded open questions for
M12's exchange, with the analyst's warning preserved: `FoldSale`'s partial-fill
semantics are WRONG for a purchase, which is all-or-nothing.

**OQ-2 — is fuel sellable back? → NO.** `npc-market-demand`'s *Tradable Goods Are
Exactly the Mine Resource Kinds* already forbids it and fuel is not a
`system.ResourceKind`. Keeping it unsellable closes the D-2 hole (selling the fuel you
are mid-burn on) with **no new rule at all**, rather than inventing a "cannot sell fuel
while a burn is committed" special case. Consequence accepted and to be stated: over-
buying is dead weight, which is a real decision the player makes.
**Therefore `goods-sale` and `npc-market-demand` take NO delta.**

**OQ-3 — Δv-per-ton → 5.0 Δv/ton, a named placeholder constant.** The analyst is right
that 2.5 makes a full 200-ton hold exactly the PoC's 500 Δv — i.e. maximum range means
carrying no ore, which kills the range-vs-payload trade the whole decision exists to
create. At 5.0, half a hold (100 t) buys the PoC tank and leaves half for cargo. This
is a feel knob: mark it with the same placeholder discipline `space/params_const.go`
uses and record "validate in play" as an open question. Fuel is measured in **tons**
and converted at price time — "occupies cargo mass like ore" is the decision's own
language.

**OQ-4 — refund on cut-drive / re-target → (b) CLOSED-FORM PARTIAL REFUND.** Δv spent
by time τ is exactly `Accel × τ`, so the refund is `Accel × (flight − τ)` — computable
from fields already stored on the burn, no new state, and it fits the closed-form
contract exactly. Without it, re-targeting — which `fleet-movement` explicitly calls
normal play — double-charges, and cut-drive stops being "free." Applies to both.

**OQ-5 — station fuel quantity → UNLIMITED.** Two-domain transaction (credits + hold),
no station-side write. A station that can run dry needs restock rules and belongs with
the siege gameplay that is deferred with combat. Record as an open question.

**OQ-6 — starting fuel amount →** see §0.3.

**OQ-7 — does Δv price scale with hull count? → YES.** The analyst's distinction is
correct and must be stated explicitly in the spec so no reviewer reflexively rejects
it: **hull count is constant across a burn**, so flight time stays closed-form and the
brachistochrone survives. The guardrail forbids coupling to *loaded mass* — which
changes as fuel burns and would make flight time a differential equation — not to
roster size. Without this, a ten-hull fleet gets ten times the capacity and the same
Δv bill, so bigger fleets get strictly better range for free, inverting the supply-line
pressure this change exists to create. Note the pleasing consequence: capacity and burn
both scale with the roster, so **range is roster-independent**, which is the neutral
outcome.

**OQ-8 — a dry fleet drifting above the stop-in-place speed floor can never stop.
RULING: accept it, and FLAG IT FOR TRAVIS as a genuine conflict.** This is the one
place I decline to smooth things over. `decisions.md` says stranding is "a setback
rather than a death" and that a stranded fleet "sits indefinitely... immobile, not
dying" — but a fleet that cuts drive into a fast drift and then runs dry is
unreachable, uncommandable in practice, and effectively dead. The alternatives (free
deceleration, a floor-rate assist) invent exactly the soft wall `decisions.md`
explicitly forecloses. So: accept the current behaviour, keep the existing free
conversion below the speed floor, write the consequence into design.md's Risks
**by name**, and record the open question. Do not quietly pick a side.

**OQ-9 — hold/release verbs →** YES, see §0.1.

**OQ-10 — client surface → link 7 ships fuel readout + the commit warning + a refuel
control.** Not deferrable to link 8, on the analyst's own deployability argument:
commit-time rejection with no way to buy fuel bricks every corporation the moment its
starting tank empties. The warning specifically must render — `decisions.md`'s whole
point is that "the complaint about stranding is that it happens *invisibly*", so a
server-only warning ships nothing of what was decided. Minimal is fine: a fuel/range
figure on the roster row, the warning surfaced on commit, and a refuel control beside
the existing sell control. Full refuel UX polish may defer.

## Structure

**One change, id `add-fuel-as-cargo`.** Accept the analyst's reasoning: splitting
consumption from purchase fails the deployability test. If it proves too large at
authoring, the ONE clean carve-out is the station-keep half (`add-stationkeep-hold-verb`,
sequenced after) — never the consumption/purchase seam.

**Hard-blocked on `re-express-economy-positions` archiving** — seven requirement
headers overlap, and link 6's ADDED *Every Body In the System's Body Table Is a Valid
Attachment Host* is the precondition the refuel verb is written against. Author link 7's
MODIFIED bodies against link 6's POST-ARCHIVE text.

**No delta:** `action-dispatch` (no new param shape — `float64` is already on the
allowlist — no new channel, and refuel is instant like `goods-sale`), `focused-scan`
(fuel explicitly rejected as its currency), `goods-sale`, `npc-market-demand` (OQ-2),
`mine-extraction` (fuel composes through `FreeHold` automatically — confirm at
authoring). Record `action-dispatch`'s non-delta explicitly: link 4 predicted one there
and was wrong, and that correction is worth carrying forward.

**Also record:** `Stop` solves with a package-level `defaultAccel` rather than
`DerivedAccelCeiling`, unlike `OrderTo` — so a stop burn's Δv price is
roster-independent while an ordinary burn's is not. Pre-existing inconsistency,
surfaced by this change because it now has a price attached. Flag in the proposal; do
not fix silently.

**And record the cost correction:** `decisions.md` calls the reachability check "a
single closed-form body-target solve." It is N solves for N candidate destinations
plus a body-table read, since `SolveBurn` is per-target. Size tasks.md honestly.
