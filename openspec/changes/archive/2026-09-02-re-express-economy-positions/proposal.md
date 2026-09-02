## Why

`chain.md` predicted link 6 would migrate mine/sell's co-location predicates off
the lattice. **That prediction is already wrong and this proposal corrects the
chain document**: link 4 (`migrate-fleet-to-continuous-burns`) already
re-pointed both verbs — mine and sell both resolve "docked" through
`fleet.Fleet.DockedTo()` (`backend/fleet/model.go:138`), a stored `AttachedTo`
string, and a source grep of non-test `mine/` and `market/` for `board.`
returns zero hits. `board.Within` (`backend/board/board.go:92`) likewise has
no production caller — only `board/within_test.go` — and its successor
`disclosure.WithinRange` (`backend/disclosure/predicate.go:25`) already
shipped in link 2; the same is true of `board.LineOfSight`
(`board/visibility.go:41`). chain.md's "`board.Within` becomes a sphere test"
is therefore already true, and both symbols are link 9 deletion material,
not link 6's. What link 4's re-point left broken is a real, structural
gap: a belt member (`<beltFeatureId>#<k>`, `system-interior`'s own "discrete
mineable bodies") exists only in the `system.BodyTable`, never in
`interior.Features`, while `mine.Commit` resolves targets by walking
`interior.Features` alone — so a fleet docked to a belt member cannot mine it,
and naming the belt while docked to one of its members fails as "not docked."
This change closes that gap — a belt member becomes independently
attachable and mineable through its parent belt's existing lode, never a
new one of its own — states two structural assumptions the codebase
already relies on but has never written down (every body is a valid
attachment host; being parked near a body differs from being attached to it),
and fixes stale cross-references two capabilities carry from since-deleted
material.

## What Changes

- **BREAKING** (behaviour change, not a re-expression, per no-backcompat):
  a fleet docked to a belt member can now mine — `mine.Commit` resolves a
  member id (`feat-belt-0#3`) to its parent belt feature for mineability,
  resource kinds, and ledger key alike, closing the gap in the Why above.
  **One belt is, and remains, one lode**: mining through a member and
  mining the belt feature directly fold the identical ledger key
  (`<sys>::<beltFeatureId>::<kind>`, unchanged), so the belt's total
  yield is unaffected by how many of its members are ever named. The belt
  feature itself **stays independently mineable** — nothing a player can
  do today stops working, and no new rejection reason is introduced for
  it. (An earlier draft of this proposal instead split the belt into
  eight independent per-member lodes and demoted the belt feature to a
  non-mineable container; that draft is withdrawn — see design.md
  Decision 1 for why it would have made belt mining unreachable in the
  live game and is the wrong shape until a later change gives a player a
  way to pick a specific member on the board.)
- Add a new `mine-extraction` requirement validating a mine commit's
  client-supplied `featureId` **before** it is parsed for the belt-member
  separator or used to resolve any target — rejecting a malformed,
  oversized, or unresolvable member id with a distinguishable reason,
  and only ever after ownership and the docked-state check have already
  passed, so an invalid id can never be used to probe a foreign fleet's
  target. The resolved ledger key's feature component is always the
  **resolved parent** feature's own id, and its system component is
  always the acting fleet's own stored `systemId` — never the
  client-supplied string, following `goods-sale`'s existing "Sale
  Resolves the Station From the Acting Fleet's Own System, Never a
  Client-Supplied Identifier" doctrine.
- State, as a new `fleet-movement` requirement, that every body in a
  system's body table is a valid attachment host — a planet, moon, belt
  member, belt feature, station, or lane gate alike. The attach-on-resolve
  write itself needs no code change: this is `BurnResolver`'s existing,
  class-blind behavior, written down rather than left an unwritten
  assumption. No per-class carve-outs are invented; the requirement is
  explicit that this does not relax the system's star already being
  unreachable as a burn target for kinematic reasons, and that attachment
  follows a burn's *target*, never a point-targeted burn's endpoint merely
  landing near some other body. This requirement also closes a real read-path
  gap the write side has always had latent: `fleet`'s `toDTO`
  (`backend/fleet/handler.go:362`) today returns every non-`ErrFleetInTransit`
  error from `PositionOf`, so a stored `attachedTo` a retuned derived-id
  constant (or a degraded gate read) leaves unresolved 500s the read via
  `space.ErrUnknownBody` — a genuine code change, degrading that read the
  same way an in-transit fleet's read already degrades: no position
  reported, the fleet still returned, the unresolved host id logged. Because
  attachment is `proximity-disclosure`'s masking predicate's sole input, this
  requirement also states the masking consequence: a focused scan resolves
  only against the exact host id it names, so sweeping a belt feature does
  not reveal a fleet masked at one of its members, and sweeping one member
  does not reveal a fleet masked at another — `proximity-disclosure` itself
  is unchanged.
- Add an explicit "parked-but-unattached is rejected" scenario to both
  `mine-extraction` and `goods-sale`, because a fleet parked near or at a
  body and a fleet attached to it differ by one stored string
  (`Fleet.AttachedTo`), and there is no dock verb to make the distinction
  moot.
- Re-word `board-view`'s two remaining lattice-worded scenarios ("occupies
  the same **cell**") on the mine offer and its sell-offer sibling to
  dock-state language. Scoped to those two scenarios — the rest of
  `board-view` is link 8's.
- Add a small `system-interior` clarification that a belt member shares its
  parent belt feature's single lode and inherits its resource kinds
  unchanged — a model-level fact, stated once, that `mine-extraction`'s
  resolution mechanism (above) implements.
- Fix `system-interior`'s dangling cross-reference to the deleted
  `observation-fog-and-scan` capability, re-pointing it to its live
  successors (`focused-scan` / `sighting-records`).
- Fix `market-price-board`'s two dangling cross-references left by link 5:
  "the three-band feature-composition freeze `system-interior` applies"
  (that model was removed) and `system-interior`'s "Charted Lane Gate
  Filtering" (that requirement was removed) — re-pointed to the live
  disclosure model and to `trading-station`'s equivalent tier gate,
  respectively. No behavior change.
- Restate `trading-station`'s station-docking predicate as running through
  the same body-attachment check every other dock target uses, with no
  lattice co-location test — its **placement/orbit requirements are
  explicitly retained** (see Impact). This also corrects the retained
  placement requirement's own docking-and-intercept clause, which still
  normatively routed a docked fleet's position and burn-intercept through
  `board.OrbState`: that clause now re-points to the same
  `space.StatePosition`/`space.SolveBurn` path every other orbiting body
  uses, while the requirement's ring/slot/period/direction **derivation**
  is untouched, retained solely to feed the board renderer's `Footprint`
  until link 8/9 replaces it (see Impact).
- Hygiene: correct two code comments (`backend/stations/placement.go`,
  `backend/system/station_continuous.go`) that both name the stale change id
  `re-anchor-mine-market-stations` and both wrongly claim the station's
  lattice orbit "dies at link 6" — it survives until link 8/9 (see Impact).
- Add a `lattice_symbols_absent`-style regression guard (modelled on
  `backend/fleet/lattice_symbols_absent_test.go`) to `mine`, `market`, and
  `stations`, pinning that none of these re-pointings silently regress by
  reintroducing a `board.*` predicate symbol as dead code (nothing here
  fails to compile if one is reintroduced). `stations` keeps its `board`
  import for `Footprint` per the placement retention below, so its guard
  covers only predicate symbols, never the whole package.

## Impact

- Affected specs: `mine-extraction` (heavy — belt member resolution plus
  client-input validation), `goods-sale` (light — one scenario),
  `trading-station` (medium — dock predicate restated, plus a corrected
  docking-and-intercept clause on the retained placement requirement; its
  ring/slot/period/direction **derivation** is untouched),
  `market-price-board` (cross-reference hygiene only, no behavior change),
  `system-interior` (belt member
  resource-and-lode inheritance clarification, plus the dangling
  cross-reference), `fleet-movement` (one new requirement — the
  attach-on-resolve write is a restatement, but the unresolvable-attachment
  read-path degrade is a real code change), `board-view` (two scenarios'
  wording).
- Affected code: `backend/mine/` (belt member resolution and `featureId`
  validation, plus its new `lattice_symbols_absent_test.go`),
  `backend/market/` (its new `lattice_symbols_absent_test.go`),
  `backend/fleet/` (the `toDTO` unresolvable-attachment-host degrade fix in
  `handler.go`, plus attachment-host and masking tests), `backend/disclosure/`
  (the belt-member-vs-parent masking test), `backend/stations/` (dock
  predicate, its new `lattice_symbols_absent_test.go`, and the
  `placement.go` comment fix), `backend/system/station_continuous.go`
  (comment fix). `frontend` is touched only conditionally, and only for
  test fixtures/copy: tasks 4.1/4.2 update any literal "same cell" wording
  in `frontend/components/board/*` mine/sell-offer tests to match dock-state
  language if such literal wording exists — the underlying board renderer
  already resolves dock state correctly, so no rendering behavior changes.
- **Explicitly NOT touched**: `npc-market-demand` (no positional coupling —
  gets no delta), `trading-station`'s *Deterministic, Non-Core,
  Off-Gate-Ring, Prograde, Orbiting Placement* — this requirement's ring/
  slot/period/direction **derivation** is retained until link 8/9, when the
  renderer it feeds is replaced (removing the derivation now would blank
  the station from the only playable view); only its docking-and-intercept
  clause is re-pointed off `board.OrbState` by this change (see What
  Changes) — and *A Station Orbit Outside the Live Board Radius Is Omitted,
  Never Panicked* (retired at link 8/9 alongside it), `board-tactical-math`'s
  own dangling `observation-fog-and-scan` reference (link 9 deletes that
  spec outright; editing it two links early buys nothing).
- **Hard inbound dependency**: link 5's task 10.7 (the spliced station gets a
  continuous `Space` and `Size`) is what makes the station a body in the
  table at all — this change cannot be authored against a system where it
  has not landed. Link 5 is archived as of this writing.
- No migrations, no backwards compatibility, no deprecation windows (solo
  toy) — the belt behaviour change lands outright.
