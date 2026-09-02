# Link 8a `build-production-space-view` — panel findings + orchestrator rulings

Panel: architect (**7 blockers, 7 high, 7 medium**), UX (**2 blockers, 6 major**).
DBA and reliability skipped — a renderer plus one additive wire change.

`--strict` passes and requirement coverage reconciles exactly (30 `board-view` + 3 from
link 7 − 2 dropped + 7 net-new = 38). Sequencing was done correctly: MODIFIED bodies
were authored against link 7's post-archive text and verified verbatim. **The spec text
is good; the technical foundation under it is not.**

**ALL FINDINGS ACCEPTED.** Every one carries paste-ready text in the reviewers' own
reports. Two blockers mean the change currently fails its own stated purpose.

---

## The two that defeat the change's purpose

### B2 (BLOCKER) — the `orbit` wire key is ALREADY TAKEN, by the lattice
`backend/system/fog.go:31` already serves `Orbit *Orbit json:"orbit,omitempty"` — and
that is `system.Orbit`, the **lattice** orbit `{ring, angle0, period, dir}`. The
continuous set is `Feature.Space *space.Orbit`; the DTO's `space` key already holds the
resolved `Vec3`. So the delta silently **retypes** an occupied key, and its drop list
omits three lattice fields live on the wire right now: `orbit` (lattice), `parentId`,
and `fixed`. An implementer ships a union of two schemas or keeps both — and
`Feature.Orbit`/`ParentId`/`Fixed`/`Footprint` are precisely what link 9 deletes.
**Link 9 stays blocked either way.**

### B6 (BLOCKER) — `lib/types/action.ts` still tethers `@/lib/board`, and no task cuts it
`frontend/lib/types/action.ts:7` imports `Cell, Target` for `params.origin`/`params.target`.
Both are **already dead against the live wire** (a burn's `action.Params` carries only
`state`; nothing in the frontend reads either). Task 9.1 deletes `system-board.ts` and
never mentions it; task 9.4 then asserts no tether exists. Three more: the two lattice
e2e suites (`board.spec.ts`, `board-camera.spec.ts`) and `app/spike/webgl-board/page.tsx`,
left broken by 9.1 deleting only `mock-board.ts`.

## The one that would have shipped a mirror violation

### B1 (BLOCKER) — the sole-authority audit fails on the burn, and the check cannot catch it
design.md Decision 1 claims animating a fleet from served kinematic state is "already
legal". True for a park and a drift; **false for a burn.** Drawing a burning ship at `t`
needs arc-length inversion over the quintic (`space.ArcTable`/`ArcParam` — *a curve
length*) under the brachistochrone profile (`space.Speed`) — all on
`space-kinematics`'s forbidden list. tasks.md 3.1 directs exactly this, and the PoC it
ports from already contains `arcTable`, `arcParam`, `burnProgress`, `burnSpeed`,
`resolveShip` (the settled-park fold) and `stationKeepRate`.

**And the guardrail is structurally blind to it.** `check-mirror-map.sh` compares with
`comm -12` on **raw, case-sensitive** names. Go's `ArcParam`/`Speed`/`StateAt` vs an
idiomatic TS `arcParam`/`speed`/`stateAt`: **zero collisions, check passes.** The
recorded "wrong directory" hole is the smaller of two.

**RULING: take option (b)** — draw the ship along the served curve by **Bézier
parameter** `u = (t − departMs)/(arriveMs − departMs)`, explicitly decorative, never
arc-length-correct, never used to decide or display a value; a burn past its served
`arriveMs` draws frozen at its served intercept until the refetch lands. Zero wire cost,
no `space-kinematics` amendment. Take the architect's paste-ready clause and scenario, the
tasks.md 3.1 rewording, and **add the case-insensitivity fix to `check-mirror-map.sh`**
as its own task.

## The rest of the architect's blockers
- **B3** — lane gates get **no** orbital elements though `gates.go:248` derives one
  (`gateOrbit`) and never serializes it. Gates snap while planets glide, and a
  gate-targeted burn's arrival ghost cannot be placed. Serialize on BOTH DTOs.
- **B4** — the preview's star rejection says "before any solve is attempted". That
  contradicts shipped code: `star_destination_test.go` exists **specifically** to assert
  `fleet.ErrCoreDestination` stays deleted and the star is excluded solely by
  `space.BuildCurve`'s clearance guard. As written the change reintroduces the
  destination-identity check that test forbids.
- **B5** — "no cumulative effect" forbids the settle-first step the preview must do:
  `OrderTo` runs `settleIfDue` (which writes), and `commandedFleetId` → `Get` settles too.
  A preview writes before the handler body runs. Re-word to permit the shared fold-first
  settlement and require the preview to solve from the settled state — the parity
  scenario otherwise breaks in exactly the case that matters.
- **B7** — the station-keep drain readout has **no wire source** (`StationKeepRate` is on
  no DTO), and B2's change hands the client `orbit.periodMs`/`radius`, making a four-line
  illegal mirror the shortest path. Add an owner-only served upkeep rate.

## UX blockers
- **U-B1** — **preview failure is entirely unspecified**, on the path every burn rides.
  Zero scenarios for a failed request or a failed periodic refresh. Undefined whether
  stale figures keep showing as current, and whether commit stays available against a
  preview the player can no longer trust.
- **U-B2** — an interior-read failure takes down `docked-fleet-actions` **entirely**,
  contradicting this change's own ruling that those commands are anchored to `attachedTo`
  and work while the canvas is unavailable. The coupling is NEW (old `board-view` fetched
  no fleet data). Neither error path offers a retry.

## Highs worth carrying
- **H1** — the fan-in names the wrong fleet read: `ListInSystem` (`?systemId=`) is
  **read-only and does not settle a due arrival**; `ListForCorp` (`?mine=true`) does. An
  arrived fleet would read as still-burning with `attachedTo: ""` on the canvas while the
  roster shows it docked — two panels on one screen disagreeing. Drive off the roster's
  corp-scoped read and filter client-side.
- **H2** — previewing a **mid-burn re-target** is forbidden, but committing one is not.
  Backwards, and it removes the preview from the highest-stakes decision in the game.
- **H3** — `galaxy-view`'s *Jump Commit* cites `board-view` **inside a requirement body**;
  delta-reachable, so fix it now rather than leaving a dangling reference post-delete.
- **H4** — four stale `## Purpose` sections, not delta-reachable; §11 names one sentence
  of one. `system-interior`'s says "tactical polar board" — the capability whose delta is
  the link-9 unblocker.
- **H5** — design.md **overrides a binding ruling without declaring it** (quote-lock:
  takes the display half, drops the reject). Its rationale that "there is no wrong price"
  fails — fuel is finite and the target moves, and `ErrInsufficientFuel` fires only on
  can't-pay, not on paid-more-than-agreed. **RULING: take the `maxFuelTons` cap**, and
  declare it either way.
- **H6** — the unavailability enumeration drops cut-drive and stop. A player whose GPU
  drops mid-burn cannot stop the ship.
- **H7 — SCOPE. RULING: SPLIT, as the architect proposes.** It is **61 tasks, not 47**.
  The backend half is **purely additive**, so the split creates no coexistence and no flag:
  **8a-1 `serve-orbital-elements-and-burn-preview`** (elements on both DTOs, the preview
  endpoint, the upkeep rate — ~12 Go tasks, fixture-verifiable) then
  **8a-2 `build-production-space-view`** (renderer, panel, field removal, retirement,
  deletions, journey). Neither is a deferral: 8a-2 cannot render or price without 8a-1, and
  8a-1 is dead code until 8a-2 calls it. The decisive benefit is that the SDET can write
  the failing wire/preview contract suite **before** either developer starts — which is
  what this change's atomic-swap risk profile demands.

## Also accepted
UX M1 (burn commit has no success/failure feedback, unlike the adjacent Jump Commit),
M2 (no pointer/touch path to an off-screen gate — the hardest pick in the system, and the
exit criterion's last step), M3 (no keyboard path to the point-in-space selection kind),
M4 (docking and mine completion are silent to assistive tech), M5 (departure hand-off
fires on *any* own fleet, not the acting one — yanks the player away mid-input), M6
(no double-submit guard on burn/mine, unlike sell/refuel).
Architect M1–M7 and L1–L5, notably **M3**: design.md claims an archive rehearsal that no
task records — make it a task; and **M5**: no Next.js architecture decision at all.
Architect **M4** is the sharpest process note — five of seven "decisions" are ruling
restatements, while the decisions this change actually needed (what `lib/space` may
compute, the `orbit` key collision, the preview's settle semantics, the upkeep source,
which fleet read drives the view) are all absent.
