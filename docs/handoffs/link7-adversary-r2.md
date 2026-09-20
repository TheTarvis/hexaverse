# Link 7 (both halves) — adversary round 2: findings + orchestrator rulings

Round-1 status: **21/21 landed**, three partially (A9, B2, B4). Mechanical checks CLEAN —
all 11 MODIFIED blocks byte-reproduce every live heading including the four new ones; all
114 task citations resolve; both pass `--strict`; the B7 archive ordering is now declared
in BOTH proposals and the carve-out is demonstrably authored against link 7's post-archive
text. **B5 × B3 composition verified sound** — B3 fires strictly before the dry instant,
B5 at or after; the boundary is cleanly partitioned, no double-settlement, no circularity.

Verdicts: both **BLOCKED**. `add-fuel-as-cargo` — 1 new blocker, 2 minors.
`add-stationkeep-hold-verb` — 4 new blockers, 3 majors.

**ALL ACCEPTED.** This is round 3 of 3 — the cap. After this pass anything open is
recorded and shipped.

---

## The two that matter most — the SAME failure as round 1, one layer deeper

### N1 (BLOCKER) — `release` is now a **1000× overcharge**. The repair fixed the factor and left the dimension.

Round 1 caught that `release` debited Δv into a tons field (5×). The repair divided by
`DeltaVPerTon` — correctly — but `rate × (releaseTime − holdStartTime)` still multiplies a
**per-second** rate by a **WorldMillis** elapsed. `space.StationKeepRate`
(`backend/space/park.go:141-156`) computes `omega² · radius` with
`periodSeconds := PeriodMs/1000`; stamps are `WorldMillis` project-wide.

The tell is an asymmetry the B2 repair itself introduced: the dry-instant formula now
carries an explicit `1000 ×` with a stated unit chain, and the release formula carries
none. The round-trip invariant proves it — a release at exactly the dry instant must debit
exactly the fuel held at hold start; substituting the two formulas yields
`debit = 1000 × fuel`. **The two formulas are mutually inconsistent by exactly 1000×.**

**Fix:** name the existing helper that already does the conversion —
`space.StationKeepUpkeep(rate, holdStartTime, releaseTime)` (`park.go:158-166`, which
computes `elapsedSeconds := (toMs-fromMs)/1000`) — or write
`rate × ((releaseTime − holdStartTime) / 1000)`. Fix the requirement bullet, its scenario,
the mid-hold bullet, design.md, proposal.md and task 2.3 together. **And add the round-trip
invariant as a scenario**: a release at exactly the dry instant debits exactly the fuel
held at hold start, leaving zero. That single scenario would have caught both B1 and N1.

### N2 (BLOCKER) — the corrected dry-instant formula exists in **no requirement**, so the 25× inversion is still permitted post-archive.

`hold` says it computes the dry instant "per *Station-Keeping Upkeep Is Settled at Discrete
Events…*" — and that requirement never defines it. `space-kinematics`'s scenario says only
"computed from the fuel held and the upkeep rate", with no `DeltaVPerTon`, no direction, no
quantization. **The corrected formula lives only in `design.md:46-50` and `tasks.md:1.3` —
both of which land in `changes/archive/` on archive.** Post-archive the normative spec set
permits `holdStart + fuel/rate` or `holdStart + fuel/(DeltaVPerTon·rate)` — the exact
inversion B2 was raised against — and every scenario still passes.

B2's repair fixed the prose everyone reads and left the artifact that survives. **Move the
formula, its unit chain, and its ceiling into the requirement `hold` already points at.**

---

## `add-stationkeep-hold-verb` — the rest

- **N3 (BLOCKER)** — nothing rejects a burn ordered from a `stationkeep` park, and a burn
  replaces the park, destroying the stored hold-start and dry instant. Either the accrual
  is **silently forgiven** (the cargo-pool enumeration lists only `release` and automatic
  exhaustion as settlement events — so hold indefinitely, burn away, pay nothing, and the
  upkeep economy is optional), or B3 applies and its unconditional restamp-recompute tail
  fires on a hold that no longer exists — and because link 7 explicitly accepts a burn
  costing exactly the available fuel, the recompute yields `dryInstant == holdStart`,
  **the undecodable park B4 exists to prevent, through a path B4's `hold`-only guard does
  not cover. The fleet bricks.** Fix: state what a burn commit does to an open hold (settle,
  then drop — no restamp), add it to the cargo-pool enumeration as a third settlement event,
  and scope B3's restamp tail to mutations that leave the hold open.
- **N4 (BLOCKER)** — this change **is** the "future verb that can mutate cargo while a fleet
  is docked to a mined feature" that live `mine-extraction`'s *Resolve Clamps Yield to
  Reality* pre-registered as the thing that would invalidate
  `freeHoldAtResolve == freeHoldAtCommit`. `hold` requires only an `orbit` park and does not
  alter `attachedTo`; mine's docked precondition has no park-mode constraint. So a fleet can
  hold mid-mine-run, and free hold at resolve then differs from commit **by elapsed time
  alone**. The proposal declares no `mine-extraction` impact and omits `backend/mine/` from
  affected code while task 2.9 requires editing it. **Fix: take the `mine-extraction`
  MODIFIED delta retiring the equality claim** — the live text pre-registered exactly this
  trigger, so this is the spec working as designed — plus the Impact bullets.
- **N6 (MAJOR)** — B4's "equivalently" is arithmetically false under B2's new ceiling: with
  `ceil_to_integer_ms`, the dry offset is zero **iff `fuel ≤ 0`**, so any strictly positive
  fuel ceilings to ≥1 ms. Pick one clause as normative and delete "equivalently".
- **N7 (MAJOR)** — the cargo-pool enumeration ("at the instant it ends, either by `release`
  or by automatic exhaustion… No verb outside this list SHALL mutate a fleet's `fuel`
  entry") **forbids the mid-hold settlement its own sibling mandates**. Name it as a third
  event.
- **N8 (MAJOR)** — task 2.9 implements an enumerated subset of a universal requirement,
  dropping the two most player-visible reads: *Estimated Maximum Range* and the *Persistent
  Stranded Indication*. A fleet whose hold went dry but was not yet observed reports a
  healthy range and reads **not stranded** — A1's cry-wolf failure in reverse. Add both.

## `add-fuel-as-cargo`

- **N5 (BLOCKER)** — a rejected re-target is undecidable: "the refund is credited **before**
  the new order's cost is evaluated" versus the rejection requirement's "the fleet's `fuel`
  cargo is **unchanged**". And because live *A new order replaces an active one* cancels the
  prior action first, an implementer can ship "re-targeting to an unaffordable target
  cancels your running burn and leaves you drifting in deep space, order rejected" while
  satisfying every scenario. **Fix:** one sentence — a rejected commit leaves the fleet's
  prior movement state and `fuel` exactly as they were; the discard refund and the prior
  order's cancellation take effect only in the same transaction that stores the replacement
  burn — plus a scenario.
- **N9 (MINOR)** — `board-view`'s refuel double-submit requirement says "or **re-priced**",
  a state its own sibling forbids (the fuel price is a global constant that never moves
  between preview and commit). Copied from the sell control where slippage is real. Drop
  the two words.
- **N10 (MINOR, A9 residual)** — three scenarios assert a field is absent from a foreign
  fleet's response, but foreign fleets are omitted from list reads and 404 on direct fetch,
  so **there is no response object to assert on**. Delete all three, or restate as "no
  fleet-shaped response exists to carry it".

## Record and ship, do not fix
- **OQ-A**: `ceil(tons × price) ≥ 1` holds for reals but not IEEE-754 — a denormal tonnage
  against a misconfigured sub-unit price can underflow the product to `0.0`, and the rule
  rejects only on `price ≤ 0`, not on a computed zero cost. Hand-crafted `5e-324` only;
  failure mode is a forbidden zero-amount ledger entry, not free fuel at scale.
- **OQ-B**: whether `fuel-purchase`'s free-hold check runs before or after B3's mid-hold
  settlement is undefined. Safe in both directions (it can only conservatively reject, never
  over-fill).
