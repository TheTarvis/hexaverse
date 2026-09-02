# Link 6 `re-express-economy-positions` — analysis corrections and orchestrator rulings

Source of the questions: the design analyst's decomposition (2026-09-01). This file
records the orchestrator's adjudication of every open question it raised, so the
spec writer authors from answers rather than rediscovering them. Anything NOT ruled
here is a genuine open question and goes into design.md's `## Open Questions`.

## Baseline corrections the analyst found (carry these into proposal.md)

These correct `chain.md`'s link 6 paragraph and must be stated in the proposal so the
chain document can be updated to match:

- **B1. The co-location predicates are already off the lattice.** Link 4 re-pointed
  them: mine and sell both resolve "docked" through `fleet.Fleet.DockedTo()`
  (`backend/fleet/model.go:138`), a stored `AttachedTo` string. `grep 'board\.'`
  across non-test `mine/` and `market/` returns ZERO hits. Link 6 is therefore not a
  predicate migration in `mine`/`market`; it is (a) settling what a valid host is,
  (b) fixing what the re-point silently broke, (c) retiring the station's lattice
  placement from the *predicate* path.
- **B2. `board.Within` has no production caller** (`backend/board/board.go:92`,
  referenced only by `board/within_test.go`). Its successor `disclosure.WithinRange`
  (`backend/disclosure/predicate.go:25`) already shipped in link 2. chain.md's
  "`board.Within` becomes a sphere test" is already true. Same for
  `board.LineOfSight` (`board/visibility.go:41`). Both are link 9 deletion material.
- **B3. `npc-market-demand` carries no positional or lattice coupling at all** — see
  Q4's ruling. It gets NO delta. chain.md over-predicted, as it did for link 4
  (`action-dispatch`) and link 5 (six → sixteen capabilities).
- **B4. A belt member is a mineable body that `mine` structurally cannot mine.** Belt
  members (`<beltFeatureId>#<k>`, `AsteroidsPerBelt = 8`, `backend/system/belt.go:43-71`)
  exist only in the `BodyTable`, never in `interior.Features`. `mine.Commit` resolves
  via `findFeature(interior, …)` (`backend/mine/service.go:157-177`), so a fleet
  attached to `feat-belt-0#3` gets `ErrUnknownKind`, and naming the belt while
  attached to a member gets `ErrNotDocked`. **This is link 6's real substantive
  work** — a behaviour change, not a re-expression.

## Rulings

### Q1 — Does link 6 delete the station's lattice placement? → **NO. Option (b).**

Two authoritative sources contradict each other: `backend/stations/placement.go:12-16`
says the lattice form "dies at link 6"; link 5's `tasks.md:1114-1117` says it "dies
with the lattice at links 8-9" because the `Footprint` it derives is what the live
board renders, and `frontend/lib/types/system-board.ts:65` declares
`footprint: Cell[]` as NON-optional on every `BoardFeature`.

**Ruling: link 6 re-points every *predicate* off the lattice and leaves the
*rendering* half (`DeriveOrbit`, `Station.Orbit`, `FeatureOf`'s `Footprint`,
`ErrStationRingOutOfRange` and its guard requirement) alive until link 8 replaces the
renderer.** Deleting now blanks the station from the only playable view for two
links, which violates link 5's standing Decision 26 (*additive on the wire; nothing
the live board consumes is removed*) and the chain's own sequencing. The no-backcompat
ground rule governs stored data and migrations, not the scheduled removal order of a
live subsystem.

Consequences the writer must honour:
- `trading-station`'s *Deterministic, Non-Core, Off-Gate-Ring, Prograde, Orbiting
  Placement* and *A Station Orbit Outside the Live Board Radius Is Omitted, Never
  Panicked* are **NOT removed here.** They retire at link 8/9.
- `backend/stations/placement.go:12-16`'s doc comment is **wrong** and must be
  corrected by a task in this change (it is the stale-change-id species that made
  `add-station-exchange` write deltas into a capability folder that no longer
  existed).
- The `docs/defects/2026-08-26-station-on-gate-ring.md` defect is NOT retired here.

### Q2 — Is a belt one lode or eight? → **Eight. Each member is its own lode; the belt body itself becomes a container and is NOT mineable.**

`system-interior`'s shipped *A Belt's Members Are Discrete Mineable Bodies On a
Shared Radius* already calls members mineable, so option (iii) (members not mineable)
contradicts a shipped requirement and is rejected. Between one shared pool and eight
independent lodes, eight is chosen: it makes a belt genuinely contestable by several
fleets at once, which is exactly the "contested place" the whole continuous-space
pivot is trying to recover, and the cost is eight ledger keys instead of one — which
is nothing.

**Ruling, in three parts:**
1. **A belt member is an independent lode.** Its ledger key is its own body id
   (`feat-belt-0#3`), so depleting one member does not reduce another's remaining.
2. **A member's lode tonnage is the belt's derived tonnage divided by the belt's
   member count, rounded down**, so total belt yield is unchanged by the split. A
   member inherits the belt feature's resource *kinds* unchanged.
3. **The belt feature body itself is no longer mineable.** It is a container, and a
   mine command naming it is rejected with its own distinguishable reason directing
   the player to a member. Without this, the belt and its members together would draw
   roughly twice the belt's tonnage from one deposit. This IS a behaviour change and
   must be stated as such in the proposal — solo toy, no backcompat, no alias.

A requirement must pin that a member's derived tonnage is **at least the configured
minimum run size** — if the current `AsteroidsPerBelt`/richness tuning does not
satisfy that, the tuning constant moves, not the rule. Give it a scenario so a test
enforces it rather than a comment.

`system-interior` therefore takes a small MODIFIED delta against *A Belt's Members
Are Discrete Mineable Bodies On a Shared Radius* stating resource inheritance and the
tonnage split. Link 6's touch list gains `system-interior`.

### Q3 — What is a valid attachment host? → **Every body in the system's body table.**

`decisions.md` (*Places are bodies*, *Lane gates are bodies*) settles it: bodies are
places, vacuum is transit, and nothing distinguishes one body class from another for
attachment. `BurnResolver` already attaches to any body with a `Park.BodyId`
(`backend/fleet/resolver.go:236-248`) — so this is "no code change, and say so."

**Ruling: state it as a requirement rather than leaving it an unwritten assumption.**
It belongs to `fleet-movement`, which link 6 therefore touches with one small ADDED
requirement. Do NOT invent per-class carve-outs (a nebula or hazard being
undockable): no source document asks for one, and inventing exclusions here would be
the orchestrator answering a question nobody asked. Record as a deferred open
question that a future change may add them.

### Q4 — Does the venue key stay the system id? → **YES, and it is a recorded deferral.**

`add-station-exchange` is explicitly re-proposed after link 6 and is the natural place
to face multi-station systems. **Ruling: no change now.** `npc-market-demand` gets NO
delta (B3), and `market-price-board` gets only the two cross-reference-hygiene fixes.
Record the deferral in design.md's Open Questions so it is a decision, not an
omission.

### Q5 — Is there a dock verb? → **No dock verb in link 6.**

Attachment is written at exactly one place (`fleet/resolver.go:237-248`, on burn
resolve), and `decisions.md`'s lane-gate entry already relies on that shape ("to go
anywhere it must burn, which is loud"). A fleet parked in orbit around a body commits
a fresh burn to that body to attach. **Ruling: keep it, and state the consequence
explicitly in design.md** — being parked around a body and being attached to it are
distinguished by one stored string, which is why both `mine-extraction` and
`goods-sale` get an explicit *parked-but-unattached is rejected* scenario. Whether a
free dock/undock verb is worth having is a link 8 ergonomics question; record it as
an open question.

### Q6 — Who owns `board-view`'s lattice-worded mine scenario? → **Link 6 fixes it.**

`openspec/specs/board-view/spec.md:136-140`'s *Mine is not offered when merely
co-located, not docked* reads "**WHEN** the acting fleet occupies the same **cell** as
a resource feature but its effective state is not `docked`". "Same cell" is dead
language and this is precisely the co-location→dock-state conversion link 6 is named
for.

**Ruling: fix it here, not at link 8.** Leaving a knowingly-false scenario in a live
spec for two links is manufacturing exactly the drift the spec-first rule exists to
prevent, and `--strict` will not catch it. It is a one-scenario MODIFIED. Link 6's
touch list gains `board-view`. Scope it strictly to the wording of that scenario and
its sibling — do NOT touch the rest of `board-view`, which link 8 owns.

### Q7 — Is link 5 task 10.7 an inbound dependency? → **Yes, and it is being closed now.**

Link 5's task 10.7 (the spliced station gets a continuous `Space` and `Size`) is what
makes the station a body in the table at all; without it no link 6 station scenario
can pass. It is in flight in this same run. **Ruling: name it as a hard inbound
dependency in the proposal's Impact, and do not author link 6 until link 5 archives.**

## Other rulings

- **Change id: `re-express-economy-positions`** (chain.md is authoritative). Four code
  comments say `re-anchor-mine-market-stations`; a task in this change corrects them.
  A stale change-id in a code comment is how `add-station-exchange` ended up writing
  deltas into a capability folder that no longer existed.
- **One change, not several.** Accept the analyst's reasoning: the three plausible
  splits each leave one capability describing the dock predicate in dead vocabulary
  while a sibling describes it in live vocabulary. Under Q1's ruling it stays
  reviewable in one sitting.
- **design.md: yes.** Five capabilities, a behaviour change (belt members), and two
  genuine design surfaces (belt lode accounting, attachment-vs-radius).
- **Ship a `lattice_symbols_absent` guard** for `mine`, `market` and `stations`,
  modelled on `backend/fleet/lattice_symbols_absent_test.go`, since none of these
  re-pointings fail to compile if `board.*` is reintroduced as dead code. Each guarded
  symbol must be traceable to a REMOVED or MODIFIED requirement — under Q1's ruling
  `stations` keeps its `board` import for `Footprint`, so its guard covers only the
  *predicate* symbols, not the whole package.

## Final touch list for link 6

`mine-extraction` (heavy), `trading-station` (medium — identity/dock restated, lattice
placement RETAINED per Q1), `goods-sale` (light), `market-price-board` (hygiene only),
`system-interior` (belt members, per Q2), `fleet-movement` (attachment hosts, per Q3),
`board-view` (one scenario's wording, per Q6). **No `npc-market-demand` delta.**

## Carried debris from link 5's archive (added 2026-09-02, orchestrator)

Retiring `observation-fog-and-scan` (link 5 task 7.6) left two LIVE specs naming a
capability that no longer exists. `openspec validate --all --strict` passes anyway —
it does not check that a cross-referenced capability resolves, the same blind spot
that let `add-station-exchange` and `revise-scan-instant-and-emission` write deltas
into the renamed-away `hex-board-view` folder.

- `openspec/specs/system-interior/spec.md:1028` — "This underlies scan resolution in
  `observation-fog-and-scan`". **Link 6 fixes this**: it already takes a
  `system-interior` delta under the Q2 belt ruling, so the re-point costs nothing.
  The live successor is `focused-scan` (the verb) with `sighting-records` (its
  product); pick whichever the sentence actually means.
- `openspec/specs/board-tactical-math/spec.md:6` — lists
  `observation-fog-and-scan` among its consumers. **Leave to link 9**, which deletes
  `board-tactical-math` outright; editing a spec two links before its deletion buys
  nothing.

Neither was silently edited at archive time: a live spec is corrected through a
change, never by hand.

---

# RULING REVERSED — Q2 (2026-09-02, after the DBA and UX panel reviews)

**The earlier Q2 ruling (eight independent per-member lodes; the belt feature
becomes a non-mineable container) is WITHDRAWN. Replaced by: ONE BELT = ONE LODE.**

## What forced it

UX BLOCKER 2, corroborated by DBA MAJOR 1. Together they show the original ruling
produced a change that is strictly worse than doing nothing:

1. **Belt mining would become unreachable in the live game.** Today a fleet burns to
   the belt feature (its only pickable glyph — `board-selection.ts` picks solely from
   `interior.Features`, and members are never in it), docks, and mines. The original
   ruling closed exactly that path (container rejected) while its replacement —
   target a member — has no client affordance at all and gets none until link 8.
   Net effect of shipping: a working mechanic becomes impossible to perform.
2. **A guaranteed-fail affordance.** Because members inherit their kinds from the
   container's `resources` field, that field must stay populated — so `board-view`'s
   mine-offer gate ("docked to a feature carrying at least one visible resource")
   still fires on the container. The player gets a mine panel whose every commit is
   refused. The `trading-station` precedent the design leaned on works only by
   accident of stations having an empty `resources` field; it does not transfer.

## Why the reversal is right on principle, not just convenience

My original rationale was that per-member lodes make a belt "genuinely contestable by
several fleets at once — the contested place the pivot is trying to recover." That
gameplay is **unreachable until link 8 builds member picking**. So the original
ruling built a mechanic ahead of its only consumer — precisely the species this chain
has now been burned by five times (`fleet.GraphSource`, `EnsureLaneHorizon`,
`StationContinuousOrbit`, `disclosure.ScanMints`, and the focused scan's client
half). I applied that lesson to other people's work in link 5 and then reproduced it
in my own ruling. One belt = one lode ships nothing that has no caller.

## The replacement ruling

- **A belt is ONE lode.** Its ledger key is unchanged (`<sys>::<beltFeatureId>::<kind>`).
  No tonnage split, no `MinRunTons` floor requirement, no per-member `startTons`.
- **The belt feature stays mineable.** No container concept, no new rejection reason.
  No regression, no dead affordance.
- **The actual defect is still fixed** — and it is the whole point of the change: a
  fleet attached to a belt MEMBER (`feat-belt-0#3`) can mine. `mine.Commit` resolves a
  member id to its parent belt feature (the substring before the first `#`) for
  mineability, resource kinds, and ledger key alike. Today that fleet gets
  `ErrUnknownKind` because `findFeature` searches `interior.Features`, which members
  are absent from.
- **Two fleets on two different members of one belt contend on the same key**, exactly
  as two fleets on one feature do today. The existing contested-lode ordering
  requirements apply unchanged — no new concurrency shape.

## What this dissolves

The entire ledger-key redesign, and with it: DBA MAJOR 2 (raw-vs-resolved id ordering
for a container check that no longer exists), DBA MINOR 3 (inert old belt key — the
key never changes), DBA MINOR 4 (8x ledger growth — there is none), UX BLOCKER 1 and
BLOCKER 2, and UX MAJOR 4's belt half. `system-interior` keeps only a clarifying
MODIFIED stating members share the parent's lode and inherit its kinds.

## Deferred, with the rationale preserved so link 8 inherits it rather than rediscovering it

**Independent per-member lodes** are the better long-term design — a belt worth
fighting over at eight separate coordinates is the "contested place" the continuous-
space pivot wants. They are deferred to the change that makes a member pickable
(link 8 or later), because splitting a lode is only meaningful once a player can
choose which rock to mine. Record in design.md Open Questions, together with UX
MINOR 6: a member's id is an internal key and a player needs some distinguishing
signal (relative position, size, richness) before eight near-identical rocks are a
choice rather than a lottery.
