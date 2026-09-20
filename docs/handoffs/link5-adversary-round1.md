# Link 5 — adversary round 4 findings + orchestrator adjudications

Change: `replace-observation-with-sightings`
Verdict: **BLOCKED** (3 blockers, 7 majors, 4 minors)

Findings below are the adversary's own words, VERBATIM. Each is followed by an
**ORCHESTRATOR RULING** block. Where the ruling differs from the adversary's
proposed fix, the RULING is authoritative and the adversary's fix text is
superseded — implement the ruling.

---

## BLOCKER 1 — The commit-time horizon failure has no spec coverage, and Decision 28 removes the only path that used to heal it

**Location.** `specs/fleet-movement/spec.md:288-298`:

> "The system SHALL ensure the destination system's true lane horizon is materialized before that system's first body-table build for this arrival… Committing the jump SHALL itself be a sufficient trigger, so the horizon is ensured even when the arrival is settled by a background sweep rather than by a read of the fleet."

and `tasks.md` task 10.2:

> "A failure logs at Error with `systemId`/`fleetId` and does NOT fail the jump order — the order is legal regardless of whether background galaxy growth succeeded, **and the arrival-site call in 10.3 retries it**."

**The retry does not exist.** Task 10.3 places the second call in `fleet.Service.Get`'s post-jump-settle branch, which I verified is guarded at `backend/fleet/service.go:228` by `if f.Jump != nil && s.clock.Now() >= f.Jump.ArriveMs`. Decision 28 *itself* states this two paragraphs earlier — "After a sweep-settled arrival the fleet reads back with `Jump == nil` and the post-settle step never runs at all" — then contradicts itself by asserting the arrival call "covers a transient commit-time failure." It cannot: the two paths are not disjoint failure modes, they intersect.

**Exploit.** Commit-time `EnsureLaneHorizon` fails transiently (Firestore contention) → logged, order commits → the ~15-minute sweep settles the arrival → `Get` skips the branch forever. Meanwhile this same change *forbids* every path that used to heal it: `system-body-table`'s new *A Body-Table Build Materializes Nothing*, `galaxy-generation`'s "the system-interior read… none of which is a materialization trigger", and task 10.1's deletion from `addGates`. The fleet sits in a frontier system permanently short its true gate set, cannot see or burn to the missing gate, and therefore cannot jump through it — **exactly the "silent dead end that reads as a correctly-generated cul-de-sac"** that `chain.md`'s blocker 4 exists to kill ("so an arriving fleet is never stranded with a truncated gate set"). This is a fidelity failure against the source doc, not just an internal gap.

Secondary: an implementer reading only the spec's absolute "The system SHALL ensure…" would **fail the jump order** on materialization failure. An implementer reading task 10.2 swallows it. Two engineers, two systems.

**Adversary's proposed fix (SUPERSEDED — see ruling).** Add an unwanted-event clause saying the jump is still accepted and the horizon is ensured again on the next read of that fleet, and drop 10.3's guard so `Get` ensures on every read.

### ORCHESTRATOR RULING — BLOCKER 1: fail closed at commit; do not make fleet reads materialize

The finding is **upheld**: the hole is real and it is the exact failure `chain.md`'s
blocker 4 exists to kill. The adversary's *fix* is **rejected**, because dropping
10.3's guard makes `fleet.Service.Get` — the hottest read in the backend, called by
`mine` and `market` too — a galaxy-materialization trigger. That re-introduces on a
different read path precisely the property Decision 28 spent three facts removing
from the interior read path, and it forces `galaxy-generation`'s "plain reads create
no galaxy documents" to be loosened for a second endpoint.

**Ruling: the commit-time ensure fails closed.**

- `fleet.Service.Jump` calls `EnsureLaneHorizon(ctx, destId)` after `LaneCrossing`
  yields `destId` and **before** the action is committed. If it returns an error,
  the jump order is **REJECTED** with a distinguishable, retryable reason
  (a new sentinel, e.g. `ErrDestinationNotReady`, mapped to `503`), logged at Error
  with `systemId`/`fleetId`. No action is committed and the fleet does not enter
  transit.
- Because materialization is monotonic and `LaneHorizon(systemID)` is a pure
  function of the id, a successful commit-time ensure is permanent. There is
  therefore **no unhealed state**: either the horizon is materialized before transit
  begins, or the player got a visible, retryable refusal and nothing moved.
- The arrival-site call (task 10.3) is **RETAINED**, inside its existing
  `f.Jump != nil` guard, but must be re-described honestly: it is a **redundant
  idempotent confirmation** that pins the requirement's literal ordering and guards
  against a future commit path that forgets — **not** coverage of a disjoint failure
  mode. Its failure logs at Error and does NOT fail the read. Decision 28's
  "belt-and-suspenders, justified because the two sites cover **disjoint** failure
  modes" claim is false and must be corrected in design.md.

**Spec text to write** — in `specs/fleet-movement/spec.md`'s *Jump Arrival Parks Near
the Destination Gate, Unmasked*, replace the "sufficient trigger" sentence's
unwanted-event silence with:

```
Committing the jump SHALL itself ensure the destination's horizon, so the
horizon is materialized before the transit begins and therefore before the
arrival is settled — whether that arrival is settled by a read of the fleet or
by a background sweep. IF the destination's horizon cannot be materialized at
commit, THEN the jump order SHALL be rejected with a distinguishable, retryable
reason and no fleet SHALL enter lane transit toward that destination. Building a
body table SHALL NOT itself materialize the horizon.
```

Add the scenario:

```
#### Scenario: A jump toward a destination whose horizon cannot be materialized is rejected

- **GIVEN** a fleet attached to a lane gate whose destination lies past the
  materialized frontier
- **WHEN** it commits a jump and the destination's lane-horizon materialization
  fails
- **THEN** the order is rejected with a distinguishable, retryable reason, no
  action is committed, and the fleet remains attached to the gate rather than
  entering lane transit
```

Add the matching rejection-reason row wherever `fleet-movement` enumerates jump
rejection reasons (see MAJOR 10, which enumerates the set).

**tasks.md consequences:** rewrite 10.2 (fail closed, new sentinel, handler status
mapping); rewrite 10.3's justification paragraph (redundant confirmation, not a
disjoint failure mode); add an SDET task for the new scenario.

---

## BLOCKER 2 — `A Body-Table Build Materializes Nothing` contradicts a live, unmodified baseline requirement and is unimplementable as written

**Location.** `specs/system-body-table/spec.md:42-44` and its scenario:

> "A build SHALL succeed when performed from inside an action-resolve transaction, **performing no write of its own**."
> "**THEN** the build succeeds and issues no write of its own"

**Contradiction.** `openspec/specs/system-body-table/spec.md:11-13` — unmodified by this change — says the opposite:

> "Building a table for a system whose interior has not yet materialized **SHALL materialize it** through the same atomic create-if-absent path the interior read already uses"

with scenario *Building a table for an unmaterialized system materializes it* → "the system's interior is materialized and **persisted as a side effect**". This is live behavior (`system/bodies.go` → `GetOrCreateInterior` → `dao.CreateInterior`), and this change's own `fleet-movement` scenario *First arrival materializes the destination's interior* **depends on it** — `fleet.Service.Get` materializes the destination interior solely via `s.bodiesFor(...)`.

**Exploit.** A literal implementer strips interior create-if-absent from `BodyTable` to satisfy the new absolute, silently breaking the baseline requirement and the arrival-interior scenario. A second implementer reads "no write" as "no *galaxy* write" and ships something different. Worse, the requirement's guarantee is *false*: a resolve-time build for a never-read system still writes an interior, so "SHALL succeed when performed from inside an action-resolve transaction" is not achievable by construction — the same non-local invariant Decision 28 rightly refuses to leave undocumented, reintroduced one layer down. Decision 28's claim that "after the hoist a nested-transaction error is unreachable by construction" never considers `GetOrCreateInterior`.

**Smallest fix.** Scope the sentence and the scenario to galaxy documents, matching the requirement's own first sentence:

```
A build SHALL succeed when performed from inside an action-resolve
transaction, issuing no galaxy write of its own. The interior
create-if-absent required by this capability's *One Table Resolves Every
Body In a System, Absence Never An Error* is unaffected and is not a galaxy
write.
```

```
#### Scenario: A build from inside a resolve transaction issues no galaxy write
- **WHEN** a table is built from inside an action-resolve transaction for a
  system whose interior is already materialized
- **THEN** the build succeeds and creates or modifies no galaxy system,
  lane, or block-anchor document
```

### ORCHESTRATOR RULING — BLOCKER 2: ACCEPT the adversary's fix as written

Apply both the requirement-body replacement and the scenario replacement exactly as
given. Also correct design.md Decision 28's sentence "after the hoist a
nested-transaction error is unreachable by construction" — it is unreachable for
*galaxy* writes only; `GetOrCreateInterior` remains a write reachable from a
resolve-time build for a never-read system, and Decision 28 must say so rather than
claim a guarantee it does not have. Do not change that behaviour in this change:
record it as a named, accepted residual risk in Decision 28 (the interior
create-if-absent inside a resolve transaction predates this change and is out of
scope here).

---

## BLOCKER 3 — Task 4.12's re-opened structural half is assigned to a task that does not exist, and no scenario can detect the violation

**Location.** `tasks.md` task 4.12:

> "The STRUCTURAL half did not [ship]: the `'gate'` selection kind survives… Present at `board-selection.ts:15,77,99`, `SystemBoardView.tsx:226,246,345`, `FactsPanel.tsx:179`. **Closed in §9 alongside task 9.1.**"

§9 of this change contains exactly one task — 9.1 — and it is checked `[x]` with a DONE annotation covering only `LaneGate.laneId`. Nothing in §9 or §10 removes the `'gate'` selection kind. The work is unowned.

**Compounding it**, this same edit *deleted* the only enforcing clause from `specs/board-view/spec.md`:

> ~~"This requirement is satisfied by unifying the two into one command path, not by adding a working case alongside an unremoved gate-specific one"~~

That sentence named precisely the shipped state. What remains ("with no lane-gate-specific branch") has **zero scenarios testing it** — all four scenarios in *Burn Command Targets a Selected Lane-Gate Body Like Any Other Body* are behavioral, and 4.12's own annotation confirms empirically that they **all pass with the branch present**. The requirement is now unfalsifiable at exactly the point it is being violated.

**Smallest fix.** Restore the deleted sentence, add the missing scenario, and open a §10 task owning the removal.

```
#### Scenario: No gate-specific selection branch survives the unification
- **WHEN** the board's selection model and its burn-command path are
  inspected
- **THEN** no lane-gate-specific selection kind and no gate-aware command
  branch exists — a selected gate reaches the order mutation through the
  identical code path a selected planet does
```

### ORCHESTRATOR RULING — BLOCKER 3: ACCEPT, with the task staying at 4.12

Restore the deleted enforcing sentence to `specs/board-view/spec.md`'s *Burn Command
Targets a Selected Lane-Gate Body Like Any Other Body* verbatim, add the scenario as
written, and **keep ownership on task 4.12 itself** (do not create a §10 task and do
not point 4.12 at §9). Rewrite 4.12 so its instruction is readable again — the
`RE-OPENED 2026-09-01` block is currently spliced mid-sentence between "Unify gate
selection with body selection in" and "`SystemBoardView.tsx`:" (see MINOR 14); move
the annotation to the END of the task text, leaving the original instruction
contiguous. Delete the sentence "Closed in §9 alongside task 9.1."

---

## MAJOR 4 — `galaxy-generation`'s trigger enumeration omits jump commit, which `fleet-movement` now mandates

**Location.** `specs/galaxy-generation/spec.md:7-9`:

> "when a trigger (**jump arrival** at a system past the currently materialized frontier, the spawn walk, or initial seeding) touches an unmaterialized block…"

vs. `fleet-movement`: "**Committing the jump** SHALL itself be a sufficient trigger."

Jump commit is not jump arrival. By Decision 28's own reasoning — that an unenumerated trigger is "a scope violation, not a bonus" — the new primary call site is forbidden by the very requirement Decision 28 invokes to justify it. Two deltas in one change disagree.

**Fix.** `(a jump commit, a jump arrival at a system past the currently materialized frontier, the spawn walk, or initial seeding)`.

### ORCHESTRATOR RULING — MAJOR 4: ACCEPT as written

---

## MAJOR 5 — Task 10.11 dangles on a design section that does not exist and is anchored to no requirement

**Location.** `tasks.md:1149-1154`:

> "Opt-in by marker, NOT a blanket 'every exported function needs a caller' scan — **see design.md Decision 29's part D** for why the blanket form is not viable. Add the marker to **any derivation this change lands ahead of its consumer**, and add the check to the same inventory **task 9.9** catalogues."

`grep -n "part [A-D]" design.md` returns only two hits, both "part B". **There is no part D in Decision 29** — the rationale the implementer is told to consult is absent. `task 9.9` does not exist in this change (§9 has only 9.1); every other reference in the file says "link 4's task 9.9", i.e. an archived change. And "any derivation this change lands ahead of its consumer" is an unbounded quantifier with no enumeration — the implementer cannot decide which functions get markers.

10.11 is also the only task in §10 carrying **no** scenario citation: it introduces a permanent Go AST CI check that no requirement in any delta demands.

**Fix.** Either write Decision 29 part D (rationale + the enumerated marker set), or cut 10.11 from this change and record it as carried debris alongside the "general hand-maintained-registry-derivation fix (its own change)" the proposal already defers.

### ORCHESTRATOR RULING — MAJOR 5: CUT task 10.11 from this change

Delete task 10.11 entirely. It is a permanent CI mechanism that no requirement in
any delta of this change demands, its stated rationale does not exist, and its scope
is unbounded. Record it in proposal.md's deferred/carried-debris list, in the same
paragraph as the "general hand-maintained-registry-derivation fix (its own change)"
deferral, worded as: *a wiring-obligation checker (a `// WIRE-BY: <change-id>` marker
plus a Go AST check that fails when a marked function has no non-test caller) is the
structural answer to the blocker-3/4/5 species and is deferred to its own change,
because it is a CI mechanism no requirement here demands.* Remove the dangling
"design.md Decision 29's part D" and "task 9.9" references wherever they appear.

---

## MAJOR 6 — The disposition of an incomplete spliced body is unspecified; the spec permits serving a zero-size station

**Location.** tasks.md 10.9: a splice-population body missing `Space` or with non-positive `Size` "is **logged at Error** naming the producing source and the missing field". Logged — nothing more. Whether it is served or omitted is never stated, in the task or in any requirement.

**Exploit.** An implementer logs at Error and serves the body. A zero-`Size` station then reaches `space.InsertionStandoff` and yields a degenerate standoff — Decision 29 names this outcome itself ("a fleet would dock *at the station's centre*… which is worse"), and it violates the live baseline *A Table Contains No Body With a Non-Positive Size*, which no scenario connects to the splice population.

Separately, 10.9's citation is wrong: `system-interior`'s *Interior Feature Decode Validates Its Orbital Element Set…* → *The omission is recorded with the system and feature id* governs the **stored** population at Warn. Decision 29's whole point is that the splice population is a different population; citing the stored one as the anchor re-collapses the distinction the task exists to draw.

**Fix.** Add to the `system-interior` delta's MODIFIED *An Interior Predating This Capability Fails Closed, Never Silently* (or as its own ADDED requirement):

```
#### Scenario: A spliced body missing its orbit or a positive size is omitted and recorded loudly
- **WHEN** a body constructed in process and spliced into an interior (for
  example a system's trading station) carries no continuous orbital element
  set, or a size that is not strictly positive
- **THEN** that body is omitted from the interior read and from any table
  built from it, and the omission is recorded at error severity naming the
  splicing source and the missing field — distinguishably from a stored
  feature's decode omission, and never served with a non-positive size
```

### ORCHESTRATOR RULING — MAJOR 6: ACCEPT, as its own ADDED requirement

Do not bolt this onto *An Interior Predating This Capability Fails Closed, Never
Silently* — that requirement is about the stored population and MINOR-level
ambiguity already dogs it. Add an ADDED requirement to the `system-interior` delta,
e.g. *A Spliced Body Is Complete or Omitted, and Its Incompleteness Is Loud*, whose
body states the splice-population rule (omit + error severity + naming the splicing
source and the missing field, distinguishable from a stored feature's decode
omission at warn severity) and which carries the scenario above plus a companion
positive scenario (*A complete spliced body is served*). Fix task 10.9's citation to
point at the new requirement.

---

## MAJOR 7 — Proposal is stale on three counts the edits made false

`proposal.md`:

- **Line 8**: "first of **four** blockers" — design.md now carries a Decision 29 explicitly labelled "**blocker 5**", whose consequence ("M11's dock-then-sell loop is unreachable through the UI") is a material scope addition the proposal never mentions.
- **Line 63**: "`galaxy.EnsureLaneHorizon` **at jump arrival**, ordered strictly before the destination's first body table" — superseded by Decision 28's two-site placement with commit as primary.
- **Line 90**: the `trading-station` narrowing is justified by "the system-interior/board read **already** ships a station as an ordinary body". Decision 29 proves that false: the station is dropped by `applyContinuousCascade` from **every** interior read today. The proposal uses a known-false premise to justify removing a requirement.
- **Impact / Affected code** (lines 191-222) omits everything §10 touches: `backend/fleet`'s new galaxy dependency and constructor-signature change (task 10.3 — the same species as the `GraphSource` change the list *does* call out as "constructor fix"), `backend/system`'s `addGates` removal and `spliceStation` completion, and the deletion of `backend/stations/continuous_orbit.go` + its test (10.8). `backend/galaxy` is still credited with "`EnsureLaneHorizon` wiring", which now lands in `backend/fleet`.

### ORCHESTRATOR RULING — MAJOR 7: ACCEPT all four; update proposal.md accordingly

"four blockers" becomes five throughout, with blocker 5 (the spliced station's
missing continuous half) described in the *Why*. Line 63 is restated as commit-time
primary + arrival-site redundant confirmation, per BLOCKER 1's ruling. Line 90's
false premise is replaced with the true one (the station is dropped from every
interior read today; task 10.7 is what makes the narrowing true). Impact gains every
§10 seam.

---

## MAJOR 8 — Decision 23 is superseded but carries no marker; two live decisions name different call sites

`design.md:589` still reads as current: "the horizon call must run before the destination's first `BodyTable` build **in `fleet.Service.Get`'s post-jump-settle step**", with no forward pointer. Decision 28 supersedes it 78 lines later. An implementer who stops at 23 wires the arrival site only — reproducing precisely the sweep gap Decision 28 was written to close. **Fix:** one line at the head of Decision 23: `**Superseded by Decision 28** — the arrival site is retained but is no longer the primary trigger.`

### ORCHESTRATOR RULING — MAJOR 8: ACCEPT as written

---

## MAJOR 9 — `galaxy-generation`'s new prose obligation for the interior read has no scenario

The requirement body now reads "Plain reads SHALL NOT themselves create system, lane, or block-anchor documents — this includes `GET /v1/galaxy`, `GetLiveSystem`, **the system-interior read**, and every body-table build". A body-table scenario was added; the interior read got none. The pre-existing scenario *Reads create no galaxy documents* still says only "**WHEN** `GET /v1/galaxy` or `GetLiveSystem` is served".

**Exploit.** An implementer honours 10.1 (removes the call from `addGates`) and then re-adds `EnsureLaneHorizon` at the `system` handler's interior-read seam — Decision 28's explicit "Do not add it to the interior read path" — and passes every scenario in the change.

**Fix.** `- **WHEN** `GET /v1/galaxy`, `GetLiveSystem`, or `GET /v1/systems/:systemId` is served`.

### ORCHESTRATOR RULING — MAJOR 9: ACCEPT as written

---

## MAJOR 10 — The jump command's mappable rejection reasons are unenumerated, and the cited requirement is scoped to a different endpoint

`board-view` and `galaxy-view` *Jump Commit* now both require "an error toast whose copy is **mapped from the server's distinguishable rejection reason** (`board-view`: *Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text*)". That baseline requirement (`openspec/specs/board-view/spec.md:590`) is scoped explicitly and exclusively to the sell path: "Every server-distinguishable rejection reason **the sell endpoint** can return — including **this capability's own** `400`/`404`/`409` reasons… AND the per-corporation write-quota's `429`", with scenarios keyed on "a **market mutation** fails". Neither it nor the change enumerates the jump endpoint's reason set.

**Exploit.** With the paired *A failure with no distinguishable reason still toasts safely* scenario as cover, an implementer maps **zero** jump reasons and falls back generically for all of them — including "not attached" and "already in lane transit", the two the scenario names as examples. Both scenarios pass; the player gets "Something went wrong" for every jump failure. Note this interacts with the proposal's own carried debris (`galaxy.ErrLaneNotFound` returns `500`), which makes the generic branch the *common* one.

**Fix.** Name the set in the *Jump Commit* requirement: "at minimum: not attached to the named gate, already in lane transit, fleet not owned by the requester, and lane not incident to the fleet's current system."

### ORCHESTRATOR RULING — MAJOR 10: ACCEPT, and add the BLOCKER 1 reason to the set

Enumerate in BOTH `board-view`'s and `galaxy-view`'s *Jump Commit* requirements, and
add the new reason from BLOCKER 1: **at minimum: not attached to the named gate;
already in lane transit; fleet not owned by the requester; lane not incident to the
fleet's current system; and the destination's lane horizon could not be materialized
(retryable).** `frontend/lib/jump-copy.ts` already exists and maps four substrings
(`attach`, `transit`, `running`, `not found`) — the enumeration must match what that
file maps, and a task must be added (or 4.16's follow-on) to extend it to the full
set plus a `lib/jump-copy.test.ts`, which does not exist today (its precedent
`lib/market-copy.test.ts` does).

---

## MINOR 11 — Two scenarios in one requirement now disagree about a lane-gate body's lattice field

`specs/system-interior/spec.md:107-109` (untouched): "every body in the response, **including each lane-gate body**, carries a continuous position and a size, alongside its pre-existing lattice **footprint**." `:114-117` (just edited): "every lane-gate body still carries its lattice **`cell`**." The edit corrected one and left the other. **Fix:** at :109, "alongside its pre-existing lattice placement (a feature body's `footprint`, a lane-gate body's `cell`)".

### ORCHESTRATOR RULING — MINOR 11: ACCEPT as written

---

## MINOR 12 — Dangling pronoun introduced by the `galaxy-view` GIVEN edit

`specs/galaxy-view/spec.md:22` changed from "a lane crossing between two systems" to "a fleet attached to **that crossing's** gate body" — "that crossing" now has no antecedent in the scenario. **Fix:** "**GIVEN** a lane crossing between two systems and a fleet attached to that crossing's gate body".

### ORCHESTRATOR RULING — MINOR 12: ACCEPT as written

---

## MINOR 13 — `galaxy-view`'s *Jump Commit* names no permitted source and dropped "no second read"

Board-view's twin enumerates both permitted sources and forbids a second read; galaxy-view's states only what the source must *not* be. An implementer satisfies it by issuing an interior read per attached fleet. **Fix:** mirror board-view's phrasing — "the fleet's own read (`fleet-movement`: *Fleet Read Serves the Attached Gate's Lane Id*), with no second read."

### ORCHESTRATOR RULING — MINOR 13: ACCEPT as written

---

## MINOR 14 — Two edit-hygiene items

Task 4.12's `RE-OPENED` block is spliced mid-sentence ("Unify gate selection with body selection in **RE-OPENED 2026-09-01…**`SystemBoardView.tsx`"), leaving the task's own instruction unreadable. And `fleet-movement`'s "SHALL never do so from within a resolve transaction" is a HOW-constraint at design altitude, now redundant with `system-body-table`'s properly-observable *A Body-Table Build Materializes Nothing*.

### ORCHESTRATOR RULING — MINOR 14: ACCEPT both

Fix the splice per BLOCKER 3's ruling. Delete the "SHALL never do so from within a
resolve transaction" clause from `fleet-movement` — the observable rule lives in
`system-body-table` and the design rationale lives in design.md Decision 28.
