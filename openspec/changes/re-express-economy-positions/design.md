## Context

This is link 6 of the continuous-space chain
(`docs/plans/continous_space/chain.md`). Links 3–5 already moved position
(`space.Bodies`), motion (curved burns), and disclosure (sightings) off the
polar lattice; `mine` and `market`'s co-location predicates were incidentally
re-pointed to `fleet.Fleet.DockedTo()` as part of link 4's wholesale fleet
rewrite, not as a deliberate migration. This change is not a predicate
migration — it is (a) settling what a valid attachment host is, (b) fixing
the one thing that re-point silently broke (belt members), and (c) two
capabilities' hygiene left over from link 5's archive.

Five capabilities carry substantive change (`mine-extraction`,
`system-interior`, `fleet-movement`, `goods-sale`, `trading-station`); two
carry cross-reference hygiene only (`market-price-board`, and one prose fix
in `system-interior`); `board-view` carries one scenario's wording.
`npc-market-demand` carries no positional coupling at all and gets no delta.

## Goals / Non-Goals

- Goal: make a belt member independently attachable and mineable, matching
  the "discrete mineable bodies" language `system-interior` already ships —
  by resolving a member id to its parent belt feature, never by splitting
  the belt's lode.
- Goal: write down, as a requirement, that every body in a system's body
  table is a valid attachment host — currently true in code but nowhere
  stated — including what that means for masking/disclosure.
- Goal: make the parked-vs-attached distinction explicit in the two
  capabilities that silently depend on it.
- Goal: validate a mine commit's client-supplied `featureId` before it is
  parsed or used to resolve a target, so a malformed or unresolvable
  member id cannot be used to probe a foreign fleet's docked target.
- Goal: leave no dangling cross-reference to a capability or requirement
  link 5 deleted, in any spec this change already touches for another
  reason.
- Non-goal: touching `trading-station`'s lattice placement **derivation**
  (ring, slot, period, direction, the `Footprint` it feeds) — Q1 below
  settles that it retires at link 8/9, not here. This change does touch
  that same requirement's docking-and-intercept clause, corrected because
  it still normatively routed a docked fleet's position and burn-intercept
  through `board.OrbState` (see Decision 7) — correcting a predicate is
  not removing the requirement.
- Non-goal: a dock/undock verb, multi-station venue keys, or per-body-class
  attachment carve-outs — all explicitly deferred (Open Questions).
- Non-goal: any change to `npc-market-demand` or `board-tactical-math`.
- Non-goal: **board-level member targeting.** This change's member-mining
  fix is reachable by a mine commit naming a member id directly — an
  API-level capability. A client affordance letting a player select a
  specific belt member on the board (`board-selection.ts` currently picks
  solely from `interior.Features`, which members are never part of) is
  link 8 scope; see Decision 3.
- Non-goal: **independent per-member lodes.** A belt is, and remains, one
  lode; splitting it into per-member lodes is deferred (see Open
  Questions) to the change that makes a member individually pickable.

## Decisions

### Decision 1 — One belt is one lode; the belt feature stays mineable (reverses an earlier draft of this change)

An earlier draft of this change split a belt into eight independent
per-member lodes and demoted the belt feature itself to a non-mineable
container, rejected by its own reason. That draft is **withdrawn** and
replaced by the shape below, found during this change's own review pass
before archive.

**The replacement:** a belt is one lode, exactly as it is today. Its ledger
key is unchanged (`<sys>::<beltFeatureId>::<kind>`). There is no tonnage
split, no per-member `startTons`, no `MinRunTons` floor requirement to
pin, and no container concept — the belt feature remains directly
mineable, with no new rejection reason. The actual defect this change
fixes, and the whole point of it, is unchanged: a fleet attached to a belt
member (`feat-belt-0#3`) can mine, because `mine.Commit` now resolves a
member id to its parent belt feature for mineability, resource kinds, and
ledger key alike. Today that fleet gets `ErrUnknownKind`, because
`findFeature` searches `interior.Features`, which members are never part
of. Two fleets on two different members of one belt contend on the same
ledger key exactly as two fleets on one feature do today — no new
concurrency shape.

**Why the earlier draft is wrong, not just less convenient:** its
rationale was that per-member lodes make a belt "genuinely contestable by
several fleets at once" — a gameplay shape this project's continuous-space
pivot wants. That gameplay is unreachable until a later change lets a
player pick a specific member on the board (`board-selection.ts` picks
solely from `interior.Features`, which members are never part of — see
Decision 3), so shipping per-member lodes now builds a mechanic ahead of
its only consumer. Worse, it is strictly worse than doing nothing:
demoting the container to non-mineable closes the *only currently
reachable* way to mine a belt (burn to the belt feature, the sole pickable
glyph, dock, mine) while its replacement — targeting a member — has no
client affordance at all yet. And because a member's resource kinds are
inherited from the container's own `resources` field, that field must stay
populated for a member to carry anything to mine — which means the
container would still render a mine-offer panel whose every commit is
refused. Shipping this would make a working mechanic worse for a
capability nothing else in the game can yet use. One belt = one lode ships
nothing that has no caller.

- Alternative considered (this change's original shape): eight independent
  per-member lodes, container demoted. Rejected for the reasons above; the
  underlying idea — a belt worth fighting over at several distinct
  coordinates — is preserved as a deferred Open Question for the change
  that actually makes a member pickable.
- Alternative considered: members remain non-mineable, only the belt
  feature is minable. Rejected — contradicts `system-interior`'s
  already-shipped "discrete mineable bodies" language, and gives up on
  the belt-member fix entirely.

### Decision 2 — Belt member resolution is mine-extraction's mechanism; the model fact is system-interior's

Precedent: `trading-station` owns the *behavior* "a station cannot be mined"
(its own requirement, its own scenario), while `mine.Commit`'s code
implements the check inline (`ErrStationNotMineable`) with no duplicate
requirement in `mine-extraction`. The belt case follows an analogous split,
scaled down to what Decision 1 actually leaves to specify:

- `system-interior`'s existing "A Belt's Members Are Discrete Mineable
  Bodies On a Shared Radius" (MODIFIED here) states the one model-level
  fact this change adds: a member inherits its parent belt's resource
  kinds unchanged, and shares — never duplicates — its parent's single
  lode. This is a fact about what a belt *is*, true regardless of which
  verb reads it.
- `mine-extraction` gains two ADDED requirements: "Belt Member Targets
  Resolve Through Their Parent Belt Feature" states the resolution
  *mechanism* mine itself must implement — a member id is recognized by
  the `#` separator, resolved against its parent belt's `interior.Features`
  entry (never searched for directly — it will never be there), and its
  resolved ledger key is the **parent's** id, not the member's, so a run
  committed through a member and a run committed by naming the belt
  feature directly fold the identical key. "A Client-Supplied
  Feature Id Is Validated Before Resolution" states the input-safety
  mechanism a resolvable-but-untrusted client string requires (see
  Decision 2a below) — a concern the old per-member-lode draft did not
  need to isolate this precisely, because under it a malformed id simply
  failed the same lookup a legitimate one would.

This mirrors the split already established between `trading-station` and
`mine-extraction` for the station case, rather than inventing a new
ownership convention.

### Decision 2a — The ledger key is composed from the resolved parent, never the client string

`action.Commit` validates `Params` but never a derived `LedgerKey`, and the
ledger's delta document id is built from that key verbatim
(`action/dao.go:94-95`). Under Decision 1 the worst version of this risk is
already structurally closed — there is no per-member ledger key to fabricate
— but the parse itself must still be bounded, because `attachedTo` (the one
thing standing between "docked" and "not docked") is today written solely
from a body-table id, and Q5's deferred dock verb would remove that
coupling if it ever ships. So a mine commit's `featureId` is validated in
two phases: a lexical phase, before it is parsed for the `#` separator at
all — no `/`; not `.` or `..`; not matching `^__.*__$` (Firestore's
reserved document-id pattern); not exceeding `MineParams.MaxFeatureIdBytes`
(default 256 bytes, UTF-8-measured) — and a resolution phase, after the
`#` is parsed but before the prefix is used to resolve anything: at most
one `#`; a numeric suffix within `[0, AsteroidsPerBelt)`; a prefix that
resolves, in the fleet's own system, to an existing belt-type feature. The
resulting ledger key's feature component is always the **resolved
parent's** own id (a server-side value read from the interior), and its
system component is always the acting fleet's own stored `systemId` — never
the client-supplied string, following `goods-sale`'s existing "Sale
Resolves the Station From the Acting Fleet's Own System, Never a
Client-Supplied Identifier" doctrine, applied here to mine.

These validation rejections run **after**, never before, the ownership
check and the not-docked rejection ("Mine Commit Preconditions") — an
invalid or unresolvable id rejected any earlier would let a caller probe
the shape or existence of a foreign fleet's docked target before ownership
is established, turning the endpoint into an existence oracle. Because the
docked-state check runs first and `attachedTo` is today written only from
a resolved body-table id, these rejections are reachable in practice only
for a fleet whose stored `attachedTo` already equals the submitted
`featureId` — this change's test coverage for them is service-level, with
that attachment set directly by the test fixture, not produced end-to-end
by a prior burn.

### Decision 3 — Member mining ships API-first; board reachability is deferred, not this change's work

Under Decision 1, fixing the resolver is a pure win with no regression: the
belt feature stays exactly as mineable and pickable as it is today, so a
player who does nothing differently loses no capability. What ships now —
a fleet attached to a member id can mine it — is reachable only by a mine
commit naming a member `featureId` directly (an API client, a test, or a
future dev tool); the board has no affordance to select a specific member,
because `board-selection.ts` picks solely from `interior.Features`, and
members are never part of it (they are synthesized only into the system's
body table). This change's acceptance evidence for member mining is
therefore API-level, not an end-to-end test through the board.

- Alternative considered: serve belt members in the interior read as their
  own `interior.Features` entries, so `board-selection.ts` could pick them
  today. Rejected — `BoardFeature.footprint` is a non-optional `Cell[]`
  (`frontend/lib/types/system-board.ts:65`), so minting a member as a
  feature means minting lattice cells for it, in the same change that is
  elsewhere fighting to keep new material off the lattice. Wrong direction.
- Alternative considered: hold the whole belt-member fix until a later
  change lands member-picking, so the fix and its only consumer ship
  together. Rejected — the backend gap (`ErrUnknownKind` on a docked
  member) is a real defect in a shipped capability today, not new scope
  invented for this change: a fleet can already dock to a member
  (attachment is class-blind, per `fleet-movement`'s new requirement) and
  then discovers mining fails. Fixing the resolver now, ahead of the
  picking UI, closes a real bug without waiting on unrelated frontend
  work — and, per Decision 1, does so with no regression to hold hostage
  to that wait.

### Decision 4 — `system-interior`'s Notes-section cross-reference is hand-edited at archive time, not via delta

`system-interior/spec.md:1028`'s "This underlies scan resolution in
`observation-fog-and-scan`" sits under `## Notes for future maintainers`,
prose outside any `### Requirement:` block. The OpenSpec delta format
(`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`) only targets
requirement-level content and has no mechanism to touch prose outside it —
the same limitation `add-realtime-sse-spec`'s design.md recorded when it
found and *declined* to touch a comparable stale reference in a sibling
capability's Notes section, because that change had no other reason to
touch that spec. This change is different: it already revises
`system-interior` for the Q2 belt work, so the precedent this repo actually
used when the situation was identical — `pin-cross-stack-determinism-seam`
tasks.md 3.1, hand-editing `board-tactical-math`'s own Notes section "at
archive time... NOT done by this change — `openspec/specs/` changes only on
archive" — applies directly. A task in this change's tasks.md does the same:
the hand-edit happens after archive succeeds, never before.

`board-tactical-math/spec.md:6`'s equivalent reference is left untouched —
link 9 deletes that spec outright, and editing it two links before deletion
buys nothing (per the rulings; do not re-open this).

### Decision 5 — `market-price-board` gets two MODIFIED requirements, no rename

Two of `market-price-board`'s requirements cross-reference material link 5
deleted:

1. **"Live Quotes, Never Frozen At An Observation's asOf"** — its body says
   "never a stored observation's frozen `asOf` snapshot... the three-band
   feature-composition freeze `system-interior` applies to scanned detail."
   Both `observation` and the three-band interim read are gone (verified:
   `grep -n "three-band" openspec/specs/system-interior/spec.md` returns
   nothing). The body is corrected to describe the live model — a sighting's
   frozen `asOf` snapshot, the closest live analog `system-interior` still
   has — **without renaming the requirement**, since the header text refers
   to the *concept* being contrasted (a frozen snapshot), which survives
   under the new model's terminology; the fix is in the body prose, not a
   `## RENAMED Requirements` operation, keeping this a pure hygiene fix with
   no risk of an archiver rename/modify ordering ambiguity.
2. **"Configured Minimum Visibility Tier"** — cross-references
   `system-interior`'s "Charted Lane Gate Filtering," which link 5 deleted
   outright (`grep` confirms it no longer exists anywhere in
   `openspec/specs/`). Re-pointed to `trading-station`'s "Home Station
   Visible On the Direct Station Read, No Scan Required," which gates on
   the exact same `market.Params.MinVisibilityTier` default `rumored` and
   is still live — a more accurate cross-reference than the one it replaces
   (same package, same constant), not merely a patched-over dangling link.

No behavior change in either case — both are cross-reference corrections.

**Note for a future reader:** requirement 1's header, "Live Quotes, Never
Frozen At An Observation's asOf," still names the retired `observation`
capability. That is deliberate, not a leftover to "fix" by renaming the
header in a later drive-by edit: the header names the *concept* being
contrasted (a frozen point-in-time snapshot), and `sighting-records`' own
`asOf` is exactly that concept's live successor, so the header still reads
correctly against the new model. Renaming it belongs to whichever future
change actually revisits this requirement's substance, not to a hygiene
pass that only touches its body prose.

### Decision 6 — Discrepancy found and corrected: two stale-change-id comments, not four

The rulings document states "four code comments say `re-anchor-mine-market-
stations`." A repo-wide grep (`grep -rn "re-anchor-mine-market-stations" .`)
finds exactly **two**: `backend/stations/placement.go:15` and
`backend/system/station_continuous.go:8`. Both also independently claim the
station's lattice orbit "dies at link 6," which Q1 already corrects to
link 8/9. Recorded here per this team's protocol for a disputed finding: the
count is corrected, not silently accepted; both actual occurrences are
still fixed (see tasks.md), and no third or fourth site was found by a
broader `re-anchor` grep across `.go` files (the only other hits are
unrelated uses of the English phrase "re-anchor" in an unrelated test and
an unrelated credits comment).

### Decision 7 — `trading-station`'s retained placement requirement's docking clause is corrected, not the whole requirement

Found during this change's own review pass, after Decision 1's review found
the belt reversal: `trading-station`'s *Deterministic, Non-Core,
Off-Gate-Ring, Prograde, Orbiting Placement* — retained per Q1 because its
ring/slot/period/direction derivation still feeds the board renderer's
`Footprint` — carries a second clause this change's earlier draft missed:
"[the station orbits,] riding the same `board.OrbState` resolution any
other orbiting feature uses, so a docked fleet's position and any
burn-intercept solve against it use the existing orbiting-feature code
path." That is normative, present tense, and directly contradicts this
change's own *Station Is a Dockable, Non-Mineable Board Feature* MODIFIED
requirement, which resolves a docked fleet's position through
`space.StatePosition` and computes no `board.OrbState`. Left as written,
archiving both leaves two live requirements making opposite claims about
the same two subjects (position resolution, burn-intercept) at the same
station.

**The fix:** a third MODIFIED block against *Deterministic, Non-Core,
Off-Gate-Ring, Prograde, Orbiting Placement*, replacing only its final
sentence (the `board.OrbState` clause) with one that re-points docking and
intercept to `space.StatePosition`/`space.SolveBurn`, while leaving every
other sentence — the ring, slot, period, and direction derivation Q1
retains — untouched, and reproducing all four of the requirement's
existing scenario headings verbatim (none of their bodies concern
`OrbState`, so none change).

This does **not** reopen Q1. Q1 ruled on the *placement derivation* —
ring, slot, period, direction, and the `Footprint` it produces for the
board renderer — and that derivation is unchanged here. This decision
corrects the requirement's *predicate* half — which resolves a docked
fleet's position and which code path a burn-intercept solve runs
through — the same half Q1 already says this change re-points everywhere
else it appears (`mine`, `market`, `stations`'s dock check). Leaving this
one clause on the lattice while every sibling clause moved off it was an
oversight, not a considered exception, and correcting it is squarely link
6's stated job (a): "settling what a valid host is" and "fixing the one
thing that re-point silently broke," extended here to the one requirement
this change had already touched for other reasons but not fully.

- Alternative considered: leave the clause as-is and note the
  contradiction as an open question for link 8. Rejected — this change
  already rewrites the sibling requirement making the opposite claim
  about the identical two subjects; deferring the correction manufactures
  exactly the drift the spec-first rule exists to prevent, the same
  reasoning Q6 already applied to `board-view`'s "same cell" scenario.
- Alternative considered: remove the whole placement requirement now,
  since its predicate half is what actually needed fixing. Rejected — Q1
  already settled this: the requirement's derivation half is still
  load-bearing for the live board renderer until link 8/9.

## Risks / Trade-offs

- **A belt member becoming attachable-and-mineable is a live behavior
  change with no migration**, but not a regression: the belt feature is
  mineable exactly as it is today, and the new capability (mining via a
  member id) is additive. No existing player state exists to migrate
  (solo toy, no backcompat).
- **The member-mining fix ships with no board affordance to exercise it**
  (Decision 3). Its acceptance evidence is API-level. This is an accepted
  trade-off, not an oversight: the alternative (minting member features
  with lattice footprints, or holding the fix until link 8) is worse on
  its own terms (see Decision 3's alternatives).
- **The client-input validation (Decision 2a) adds a second place a
  malformed `featureId` can be rejected**, ahead of the existing
  not-docked/unknown-kind checks. This is deliberate defense for the one
  string this endpoint trusts a client to shape, not incidental
  complexity.

## Migration Plan

None. Solo toy, no backwards compatibility, no deprecation window (per the
project's ground rules). The belt-member resolution fix and the new
`fleet-movement` requirement both land outright on archive.

## Open Questions

**Does "SHALL record the unresolved host id" mean the server log or the response
body?** `specs/fleet-movement/spec.md`'s degrade requirement says a fleet whose stored
`attachedTo` no longer resolves reports NO position and "SHALL record the unresolved
host id"; task 3.8 resolves that as *logged*. But `fleetDTO.Position` is a value type
(`space.Vec3`, `backend/fleet/handler.go:305`), so "no position" on the wire is
`{0,0,0}` — the system origin, i.e. the star — and the jump case discriminates only via
the nilable `Jump *JumpTransit`. A stale-attachment fleet has `jump` absent and
`attachedTo` set, so a client reading the DTO sees a fleet apparently docked at the
star. That sits in mild tension with the same paragraph's "SHALL NOT silently
substitute a position derived from anything other than the named host."

Recorded rather than resolved, on the adversary's own round-3 recommendation: the state
is unreachable today (it needs a retuned `AsteroidsPerBelt` or a degraded gate read),
the consequence is cosmetic, and everything the fix exists for — no 500, the fleet
still returned, `attachedTo` unchanged, no panic — is testable and owned by tasks
3.8/3.9. The smallest resolution is one clause choosing the log or a nullable wire
field; link 8 owns the DTO shape and is the natural place to settle it.

- **Independent per-member lodes**, deferred to the change that makes a
  member individually pickable on the board (link 8 or later). Splitting a
  belt's lode into eight is only meaningful once a player can choose which
  member to target; the contested-place rationale for wanting this
  eventually (a belt worth fighting over at several distinct coordinates)
  is preserved here so that future change inherits it rather than
  rediscovering it (see Decision 1).
- **Belt member identification.** `<beltFeatureId>#<k>` is an internal key;
  eight near-identical rocks need some distinguishing signal (relative
  position, size, richness) before choosing one is a meaningful choice
  rather than a lottery. Relevant once board-level member targeting (the
  Non-Goal above) is built.
- **No `mine-copy.ts`.** `goods-sale` and the jump verb both ship a
  copy-mapping seam translating server error strings to player-facing
  text; mine surfaces raw Go error strings today. This is pre-existing
  debt this change does not add to (it introduces no new error string mine
  didn't already need one for), but it is recorded here as link 8 scope.
- **`mine-extraction`'s rejection-reason enumeration is already stale** —
  "Mine Commit Rejections Report a Distinguishable Reason" omits
  `ErrStationNotMineable` today, independent of anything this change
  touches. Not this change's to fix.
- **`AsteroidsPerBelt` is re-derived live**, so a future retune changes the
  set of valid member ids/indices. Under Decision 1 there are no
  per-member ledgers to orphan when that happens — this is now purely an
  id-validity note for Decision 2a's range check, not a data-migration
  concern.
- **Venue key stays the system id (Q4).** `add-station-exchange`'s
  re-proposal after this change is the natural place to face multi-station
  systems; no change here. Recorded as a deliberate deferral, not an
  omission.
- **Whether a free dock/undock verb is worth having (Q5).** Attachment is
  written at exactly one place (a burn's resolve); there is no way to
  attach without committing a fresh burn, and no way to detach without
  committing a new one elsewhere. Whether that friction is worth smoothing
  with a dedicated verb is a link 8 ergonomics question.
- **Per-body-class attachment carve-outs (Q3).** No source document asks
  for one (a nebula or hazard being undockable, for instance); this change
  deliberately invents none. A future change may add class-based
  exclusions if a concrete gameplay reason emerges.
- **What a player-owned station observes.** Out of scope for this change
  (`trading-station`'s `ownerCorpId` stays NPC-only per that capability's
  existing "never player-mintable in this version" requirement); raised
  here only because link 6's attachment-host and dock-predicate work
  touches the same station model that question will eventually revisit.
