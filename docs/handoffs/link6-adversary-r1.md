# Link 6 — adversary round 1: findings + orchestrator rulings

Verdict: **BLOCKED** — 3 blockers, 9 majors, 5 minors.

**Confirmed clean, do not re-litigate:** the change's premise (grep proves `mine`/`market`
carry no `board.` symbol references; `board.Within`/`LineOfSight` have zero non-test
callers; `npc-market-demand` has no positional language — chain.md's link-6 paragraph is
wrong and the proposal is right to say so). All mechanical checks pass: every MODIFIED
delta reproduces every live scenario heading verbatim (byte-diffed, 8 blocks, zero
dropped), all seven target capabilities exist, every task citation resolves,
`--strict` passes. Reversal residue is almost clean — one word leaked (MAJOR 6).

**ALL findings below are ACCEPTED. Apply every one.** The adversary supplied paste-ready
text for nearly all of them; use it.

---

## BLOCKER 1 — All seven `featureId` validation scenarios are satisfied by today's code with zero implementation

`specs/mine-extraction/spec.md:36-79`. The requirement mandates validation "SHALL run only
after, never before, the ownership check … and the not-docked rejection." The not-docked
check is `host != req.FeatureId` (`backend/mine/service.go:150-153`), and `attachedTo` is
written only from `settled.Park.BodyId` — a burn target `space.SolveBurn` already resolved
against the body table (`fleet/resolver.go:236-238`, `space/state.go:55-62`). **So no fleet
can ever be attached to `a/b`, `..`, `__x__`, `f#1#2`, or `feat-belt-0#99`.** Every one of
those seven WHENs is already answered by the existing `ErrNotDocked` → 400. An implementer
ships this change with NO validation code and passes all seven. R1 — the panel's single
most important surviving finding — is reduced to a no-op.

**Fix.** Add to the requirement body:

```
Each of these rejections SHALL report a reason distinct from the not-docked,
unknown-kind, and station-not-mineable reasons and SHALL surface as `400 Bad
Request` carrying that reason. Because the docked-state check runs first and a
fleet's `attachedTo` is today written only from a resolved body-table id, these
rejections are reachable only for a fleet whose stored `attachedTo` is exactly
the submitted `featureId`; their acceptance evidence is service-level, with the
stored attachment supplied by the test fixture, not an end-to-end commit.
```

and give EVERY one of the seven scenarios the missing GIVEN plus an observable THEN, on
this pattern:

```
#### Scenario: A featureId containing a path separator is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is exactly the
  submitted `featureId`, which contains a `/` character
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — no action is
  created, and the string is never parsed for a `#` separator
```

## BLOCKER 2 — `trading-station` will archive self-contradicting

The change rewrites one THEN to "resolved through `space.StatePosition` … computing no
`board.OrbState`". But the RETAINED requirement *Deterministic, Non-Core, Off-Gate-Ring,
Prograde, Orbiting Placement* (`openspec/specs/trading-station/spec.md:86-91`) still says
normatively: "riding the same `board.OrbState` resolution any other orbiting feature uses,
**so a docked fleet's position and any burn-intercept solve against it use the existing
orbiting-feature code path**". After archive both are live, in direct conflict on the same
two subjects. R5 was fixed only in the requirement being rewritten; the load-bearing one 40
lines above was missed.

Q1 does NOT protect this: Q1 retains the *placement derivation* (ring, slot, period,
direction, `Footprint`); this clause is the *predicate* half — position resolution and
intercept — which Q1 says link 6 re-points. Correcting a clause is not removing the
requirement.

**Fix.** Add a THIRD MODIFIED block to the `trading-station` delta, reproducing all four
scenario headings verbatim (`A healed re-derivation lands on the same orbit`, `The position
is never the core`, `The orbit never lies on the lane-gate ring`, `The station orbits
prograde with its system's disk`), replacing only the final sentence:

```
The station SHALL orbit — it is not a fixed, non-moving feature. A docked
fleet's position and any burn-intercept solve against the station SHALL resolve
through the same continuous path every other orbiting body uses
(`space.StatePosition` and `space.SolveBurn` against the system's body table,
per `fleet-movement`'s "Effective Position Resolution"), with no new intercept
case and no `board.OrbState` resolution. The lattice ring/slot derivation this
requirement defines is retained solely to supply the board renderer's
`Footprint` until the renderer is replaced; no predicate consumes it.
```

Change the Impact bullet to say the placement requirement's *derivation* is retained with
its position-resolution clause re-pointed.

## BLOCKER 3 — The validation requirement licenses the exact existence oracle R7 closed

`specs/mine-extraction/spec.md:4-16` says validation runs "**independently of, and enforced
regardless of, the docked-to-the-named-feature precondition**" AND, ten lines later, "SHALL
run only after, never before, the ownership check … and the not-docked rejection." Two
SHALL-bearing clauses a reader must choose between. A literal implementer picks the first
(it is earlier, it says "regardless", and it is the only reading under which the seven
rejections are reachable at all) and ships `POST /v1/fleets/<foreign-id>/mine
{featureId:"feat-belt-0#3"}` answering "no such member" vs "not yours" — leaking foreign
fleets' targets.

**Fix.** Delete the ambiguous clause, keep its intent:

```
…before it is parsed for the belt-member separator `#` or used to resolve any
target. These checks do not depend on the docked-state precondition for their
correctness — they SHALL remain in force unchanged if a future change ever
writes `attachedTo` from anything other than a resolved body-table id — but
they SHALL run only after, never before, the ownership check …
```

---

## MAJOR 1 — Does validation apply to every `featureId` or only ones containing `#`?
The ADDED requirement says "validate a mine commit's client-supplied `featureId`" (all),
conditions 1–4 are member-agnostic, but the MODIFIED preconditions say "**when `featureId`
denotes a belt member**, that string has passed…", and the title says "**Member** Feature
Id". An implementer gates the whole validator behind `strings.Contains(id,"#")`; `../../evil`
and a 4 KB string then reach `findFeature` unvalidated.
**Fix:** retitle to *A Client-Supplied Feature Id Is Validated Before Resolution*; in the
preconditions replace "when `featureId` denotes a belt member, that string has passed" with
"the submitted `featureId` has passed".

## MAJOR 2 — "exceeds a configured maximum length": no name, no value, no unit
Firestore's own limit is 1500 **bytes**, which is not 1500 characters for non-ASCII.
**Fix:** name and unit it — e.g. "exceeds `MineParams.MaxFeatureIdBytes` (default 256 bytes,
measured as UTF-8 bytes, below Firestore's 1500-byte document-id limit)" — and add a
boundary scenario pair (at the limit accepted, one byte past rejected).

## MAJOR 3 — "matches a reserved dunder pattern (`__…__`)" is not decidable
Three readings; only `^__.*__$` is Firestore's actual rule. Under "contains `__`" the
legitimate id `feat__belt__0` is rejected.
**Fix:** "matches the regular expression `^__.*__$` (Firestore's reserved document-id pattern)".

## MAJOR 4 — New rejections sit outside the enumeration that makes rejections distinguishable
`openspec/specs/mine-extraction/spec.md:146-153` scopes distinguishability to a CLOSED list
this change does not modify. `backend/mine/handler.go:81-82` returns a **bodiless 500** for
any sentinel not explicitly cased.
**Fix:** add a MODIFIED for *Mine Commit Rejections Report a Distinguishable Reason* (both
scenario headings verbatim: `Each commit rejection reason is distinguishable from the
others`, `A busy-slot rejection names the occupying action kind`), extending the parenthetical
to "…already-depleted lode, busy movement slot, and each client-supplied-feature-id
validation failure", and stating every listed rejection maps to a 4xx carrying that reason,
never a bodiless 5xx.

## MAJOR 5 — The member resource-kind scenario has no observable subject
"every one of its members **reports** that same kind" — nothing reports a member's resource
kinds; a member is a `space.Body` with no resources, and mine deliberately reads the
parent's. Unfalsifiable, and task 1.1 names a site that does not exist.
**Fix:** replace with the consumer-observable form:

```
#### Scenario: A member's mineable resource kinds match its parent belt exactly
- **WHEN** a mine commit resolves against a belt member id naming a kind its
  parent belt feature carries, and a second commit names a kind the parent
  does not carry
- **THEN** the first resolves the parent's richness for that kind and the
  second is rejected as an unknown kind — a member exposes its parent's
  resource kinds exactly, and no others
```
and re-point task 1.1 (it likely collapses into task 2.3).

## MAJOR 6 — "exactly as it is today" is unfalsifiable, and "container" is reversal residue
`specs/system-interior/spec.md:40-41` and its scenario at 103-105. "As it is today" pins a
requirement to an undated implementation snapshot; "a container" is the ONE leak of the
withdrawn eight-lode model into text that will land in `openspec/specs/`.
**Fix:**

```
The belt feature body itself SHALL remain a directly mineable target: a mine
commit naming a belt feature's own id SHALL be accepted on the preconditions
"Mine Commit Preconditions" defines for any resource-bearing feature, with no
belt-specific rejection.

#### Scenario: The belt feature remains mineable alongside its members
- **WHEN** a fleet docked to a belt feature commits a mine run naming that
  belt feature's own id and a kind it carries
- **THEN** the commit is accepted on the same preconditions any other
  resource-bearing feature's commit is, with no belt-specific rejection
```

## MAJOR 7 — Derived, tuning-dependent ids declared attachment hosts, with no failure path
Belt members and lane gates are derived per read, not persisted; `attachedTo` IS persisted.
Retune `AsteroidsPerBelt` 8→4, or hit the gate-read degrade path, and a stored `attachedTo`
names a body the table no longer resolves — with no requirement saying what happens.
`trading-station` covers exactly this for the station; nothing covers members or gates.
**Fix:** one scenario on the new requirement:

```
#### Scenario: A fleet attached to a body the table no longer resolves degrades, never panics
- **GIVEN** a fleet whose stored `attachedTo` names a derived body absent from
  the current body table (a belt member index beyond a retuned
  `AsteroidsPerBelt`, or a lane gate omitted by a degraded gate read)
- **WHEN** the fleet is read
- **THEN** it reports the same missing-host outcome an omitted station produces
  — never a position at the origin, never a panic, never a failed read
```

## MAJOR 8 — Task 6.3's guard is self-contradictory and fails on the current tree
"imported only by `placement.go` and used within `service.go` only inside `FeatureOf`" —
`service.go` cannot use `board.ProductionSchedule`/`Canon`/`Cell` (lines 224/234/240) without
importing the package, so clause one is false today.
**Fix:** "assert `hexaverse/board` is imported only by `placement.go` and `service.go`, and
that within `service.go` every `board.` reference lies inside `FeatureOf`; any `board.`
reference in any other file of the package fails the guard."

## MAJOR 9 — The change's load-bearing precondition has no verification task
The delta scenario `A fleet may attach to a belt member or the belt feature alike` is cited
by no task. Nothing verifies a burn order naming `feat-belt-0#3` is accepted by `OrderTo`'s
body-existence check and resolves to `attachedTo = "feat-belt-0#3"`. If that is only ever
satisfied by a stubbed `FleetSource` in mine's tests, the change ships a resolver for a state
the game cannot enter.
**Fix:** add a task under section 3 — an integration test that burns a fleet to a derived
belt-member body id and asserts the resulting `attachedTo`.

---

## MINORS — all accepted
1. `openspec/specs/mine-extraction/spec.md:203-206` keys the ledger by "**the target
   feature's** system id" — under member resolution the target is the member and the key is
   the parent's. One-word MODIFIED: "the **resolved** target feature's system id".
2. chain.md's second link-6 bullet ("`board.Within` becomes a sphere test") is silently
   dropped — put B2 in the proposal's Why alongside B1, as the rulings instructed.
3. Impact's affected-code list omits test files added to `backend/market/`, `backend/fleet/`,
   `backend/disclosure/`, and says "frontend not touched" while tasks 4.1/4.2 conditionally
   edit `frontend/components/board/*`.
4. `specs/system-interior/spec.md:41-44` states mine's ledger-key identity as a SHALL inside
   the generation capability — three facts where design.md Decision 2 says one. Trim
   system-interior to kinds-inheritance plus "a belt is one lode"; the ledger-key rule lives
   only in `mine-extraction`.
5. `specs/mine-extraction/spec.md:5` says validated "before it is parsed … or used to resolve
   any target," yet conditions 5–7 require parsing and resolving. Split into a lexical phase
   (before parsing) and a resolution phase (after parsing, before use as a target).
