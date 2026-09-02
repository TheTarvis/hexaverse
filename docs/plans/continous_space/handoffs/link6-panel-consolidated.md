# Link 6 — consolidated panel findings + orchestrator rulings

Panel: architect, DBA, security, UX (reliability skipped — no new external deps).
Verdicts: architect BLOCKED(3 HIGH), DBA NEEDS DATA SPECS(2 MAJOR), security NEEDS
CONTROLS(2 MAJOR), UX NEEDS SCENARIOS(2 BLOCKER, 3 MAJOR).

**READ THE REVERSAL FIRST.** It dissolves roughly half the findings outright.
Full text: `link6-rulings.md`, section "RULING REVERSED — Q2".

---

## R0. THE REVERSAL (binding, and it re-shapes the whole change)

**One belt = one lode.** My earlier Q2 ruling — eight independent per-member lodes,
belt feature demoted to a non-mineable container — is WITHDRAWN.

Replacement:
- A belt is ONE lode. Ledger key unchanged: `<sys>::<beltFeatureId>::<kind>`.
- **No tonnage split. No per-member `startTons`. No `MinRunTons` floor requirement.
  No container concept. No belt-container rejection reason.**
- **The belt feature stays mineable.** Nothing a player can do today stops working.
- The real defect is still fixed, and remains the point of the change: a fleet
  attached to a belt MEMBER (`feat-belt-0#3`) can mine. `mine.Commit` resolves a
  member id to its parent belt feature — for mineability, resource kinds, and ledger
  key alike. Today it gets `ErrUnknownKind` because `findFeature` searches
  `interior.Features`, which members are absent from.
- Two fleets on two members of one belt contend on the same key, exactly as two
  fleets on one feature do today. No new concurrency shape.

Why: UX BLOCKER 2 (corroborated by architect H1 and DBA MAJOR 1) showed the original
ruling made belt mining **unreachable in the live game** — it closed the only
reachable path (mine the container) while its replacement has no client affordance
until link 8 — and UX BLOCKER 1 showed the container would still render a mine panel
whose every commit is refused, because members inherit kinds from the container's
`resources` field, which must therefore stay populated. My rationale for eight lodes
("a belt genuinely contestable by several fleets") is unreachable until link 8, so
the original ruling built a mechanic ahead of its only consumer — the exact species
this chain has been burned by five times, which I spent link 5 policing in other
people's work and then reproduced in my own ruling.

**Architect H1 vs UX BLOCKER 2 — the one place the panel disagreed.** Architect said
ship member-mining API-first and defer board reachability to link 8. UX said the
change regresses a working mechanic. Both diagnosed the same unreachability; they
differ on remedy. **Tie-break: both, minus the regression.** The architect is right
that the backend gap is a real defect in a shipped capability and should be fixed now
API-first (its Decision 7 text is good and should be written, adapted). UX is right
that this must not be paired with REMOVING container mining. Keeping the container
mineable is what makes both true at once — and it is only the tonnage split that ever
forced the container's demotion.

### DISSOLVED by R0 — do not action, do not re-litigate
- architect **H2** (tonnage formula duplicated across `system-interior` and
  `mine-extraction`, and in the wrong capability) — there is no tonnage rule now.
- architect **H3**, DBA **MINOR 3**, security **MINOR-4** (fate of existing
  belt-level deltas) — the ledger key never changes.
- architect **M3** (Decision 3's rationale factually wrong) — Decision 3 is deleted.
- architect **L2** (`#` as a new character class in a Firestore doc id) — the key is
  built from the resolved PARENT id, so `#` never reaches a document path.
- architect **L6** (flooring unnecessary) — no division at all.
- DBA **MAJOR 1** (container shows a mine offer that always fails) and DBA **MAJOR 2**
  (raw-vs-resolved id ordering for the container check).
- DBA **MINOR 4** (8x ledger growth).
- UX **BLOCKER 1**, **BLOCKER 2**, and the belt half of **MAJOR 4**.
- security **MINOR-2** (delta-ceiling subject gap — a member has no lode of its own).

---

## R1. ACCEPT — security MAJOR-1 + architect M4 + DBA MAJOR 2 (merged): validate the target identifier

The single most important surviving finding. `featureId` becomes a **parsed** client
string. `action.Commit` validates `Params` but never `LedgerKey`, and
`action/dao.go:94-95` uses the key verbatim as a Firestore document id.

Under R0 the worst of this is structurally closed — **the ledger key is composed from
the RESOLVED PARENT feature's id, a server-side value read out of the interior, never
from the client string.** Write that down explicitly; it is the `goods-sale` doctrine
(*Sale Resolves the Station From the Acting Fleet's Own System, Never a
Client-Supplied Identifier*) applied to mine.

Still required, because the parse itself must be bounded and because security's point
about Q5 stands — the only thing making this safe today is that `attachedTo` is
written solely from a body-table id, and a deferred open question (a dock verb) is
scheduled to remove that coupling:

Add an ADDED requirement to `mine-extraction` requiring that a mine commit's
client-supplied `featureId` is validated BEFORE it is parsed or used to resolve a
target, rejecting with a distinguishable reason and creating no action when it:
contains `/`, equals `.` or `..`, or matches `__…__`; exceeds a configured maximum
length; contains more than one `#`; carries a `#` whose suffix is not a base-10
integer in `[0, AsteroidsPerBelt)`; or carries a `#` whose prefix resolves to a
feature that is not of the belt type, or to no feature. State that these checks hold
INDEPENDENTLY of the docked-to-the-named-feature precondition, so they survive Q5.
State that the ledger key's system component is the acting fleet's own stored
`systemId`. Take security's five scenarios and architect M4's scenario, deduped.

## R2. ACCEPT — security MAJOR-2: the attachment-host requirement must state its masking consequence

Attachment is the masking predicate's SOLE input (`disclosure/mask.go:52-61`,
`proximity-disclosure`'s *A Docked Ship Is Masked and Registers Only As Its Host*).
Declaring "every body is a valid attachment host" therefore declares "every body is a
hiding place", and the reviewer is right that this survives R0 in full: a fleet can
still attach to a member and mine, so finding a miner in a belt still goes from one
sweep to up to nine, serially, each unmasking the searcher.

Append security's paste-ready paragraph and its scenario to `fleet-movement`'s ADDED
requirement. Where security offers a choice — whether a sweep of the container covers
its members — **rule: it does NOT.** A focused scan names one host id and reveals what
is masked at that exact id; widening it to siblings would be a new disclosure rule
invented here, and `proximity-disclosure` is not in this change's touch list. Say so
explicitly rather than leaving it to be picked by accident.

## R3. ACCEPT — architect M1 + security MINOR-3 (merged): the attachment requirement is wrong twice

Two defects in the same ADDED `fleet-movement` requirement:
1. "No body class SHALL be excluded" contradicts a shipped requirement — the star IS
   in the body table and burns to it are rejected (`space.ErrEndpointInsideClearance`;
   `fleet-movement`'s *In-System Burn Order to a Body or a Point* has "Ordering the
   star's own body id is rejected by geometry"). Re-word as architect M1 gives it:
   no class-based exclusion, with the star unreachable for KINEMATIC reasons, and an
   explicit "this SHALL NOT be read as relaxing that check."
2. It mis-states the trigger. `BurnResolver` attaches from `settled.Park.BodyId`,
   which comes from the burn's **target**, not from the endpoint's coincidence with a
   body. As written it undercuts the very parked-but-unattached scenarios this change
   adds. Take architect M1's replacement body and its scenario *A point-targeted park
   coincident with a body does not attach*.

## R4. ACCEPT — UX MAJOR 3: the sell sibling still says "cell"

`openspec/specs/board-view/spec.md`'s *Sell Offer on the Docked Fleet* carries
**Scenario: Sell is not offered when merely co-located, not docked** — "occupies the
same **cell** as a station". Q6's ruling covered "that one scenario and its sibling";
the delta fixed only the mine one. Add a second MODIFIED requirement to the
`board-view` delta, heading verbatim, re-wording only the WHEN clause. Do not touch
anything else in `board-view`.

## R5. ACCEPT — architect M2: `trading-station` preserves dead lattice language

The delta retains "via the same `board.OrbState` resolution any other orbiting feature
uses" inside a requirement it is already rewriting. `board.OrbState` has no consumer
outside `backend/board/`. Same species as R4. Take architect M2's replacement THEN.

## R6. ACCEPT — architect L4: scope the `stations` lattice guard by file, not by symbol

Task 6.3's guard lists `ModeDocked`, `Within`, `LineOfSight` — symbols `stations`
never imported, so the guard asserts nothing. Re-scope: `hexaverse/board` may appear
in `placement.go` and `service.go`'s `FeatureOf` only. That IS traceable to Q1's
retention ruling and would actually fail if a predicate were reintroduced. Tasks
6.1/6.2 (whole-package absence for `mine`/`market`) are correctly scoped — keep.

## R7. ACCEPT — security MINOR-1, adapted: pin the rejection ordering

The container reason is gone, but the principle stands for the new member-resolution
rejections: none may precede the ownership `404` or the not-docked rejection, or it
becomes an existence oracle for foreign fleet ids. Add a scenario pinning that an
unresolvable-member rejection is unreachable until ownership and attachment are both
established.

## R8. ACCEPT — architect H1's Decision 7, adapted to R0

Write the reachability deferral as a real decision in design.md, with the alternatives
architect H1 names and rejects (serving members in the interior read — rejected
because `BoardFeature.footprint` is a non-optional `Cell[]`, so it means minting
lattice cells in the change that retires lattice predicates; and holding the belt work
until link 8 — rejected because the backend gap is a real defect in a shipped
capability). Adapt the framing to R0: **nothing regresses**, the container stays
mineable, and what lands API-first is the member-resolution fix. Add the matching
Non-Goal. State plainly that this change's acceptance evidence for member mining is
API-level, not an e2e through the board.

---

## Record as Open Questions in design.md (do not solve here)
- **Per-member lodes**, deferred to the change that makes a member pickable, WITH the
  contested-place rationale preserved so link 8 inherits it (see the reversal).
- **Belt member identification** (UX MINOR 6 + architect): `<beltId>#<k>` is an
  internal key; eight near-identical rocks need a distinguishing signal before the
  choice is real.
- **No `mine-copy.ts`** (UX MAJOR 5): `goods-sale` and jump both ship a copy-mapping
  seam; mine surfaces raw Go error strings to the player today. Pre-existing debt this
  change does not add to under R0, but record it as link 8 scope.
- **`mine-extraction`'s rejection enumeration is two behaviours stale** (UX MAJOR 4 +
  architect L5) — it already omits `ErrStationNotMineable`. Not this change's to fix.
- **`AsteroidsPerBelt` is re-derived live** (architect L1): a retune changes the set of
  valid member ids. Under R0 there are no per-member ledgers to orphan, so this is now
  only an id-validity note.
- Retain the existing Q4/Q5/Q3/player-owned-station open questions already recorded.

## Notes, not requirements
- architect L3: Decision 5 deliberately declines a `RENAMED` op on a requirement whose
  header names a retired capability. Add one sentence so the next reader does not
  "fix" it mid-flight.
- architect L7: task 5.3's re-point fixes the capability name but leaves surrounding
  lattice prose; fine, link 9 deletes `board` — note it.
