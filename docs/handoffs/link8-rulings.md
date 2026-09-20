# Link 8 `build-production-space-view` — analysis findings + orchestrator rulings

Binding. Author from these. Anything not ruled here is a genuine open question for
Travis and goes to design.md's `## Open Questions` unanswered.

## The architectural question, ANSWERED FROM CODE (not from the docs' tension)

`README.md:263` says `sim.ts` is shaped to grow a Go mirror; `chain.md`'s link 8 says Go
is sole authority with no TS mirror. **They are not actually in conflict — the shipped
spec already drew the line**, and the analyst found it:

`space-kinematics`'s *Every Rule-Bearing Value of This Capability Is Computed Only in the
Authoritative Implementation* already permits a render module to draw from values the
server produced — "control points, a sampled polyline, stored orbital elements, an
already-quantized arrival millisecond" — with a scenario *Drawing a solved curve is
permitted*. So drawing the Bézier, drawing bodies from served elements, and animating
between polls are **already legal and need no spec change**. A committed burn's ETA and
Δv are already derivable on the wire (`ArriveMs` is served; Δv is `Accel × (ArriveMs −
DepartMs)/1000`).

Only the **pre-commit preview** is blocked, because `backend/space` has no HTTP surface
at all and the only way to run `SolveBurn` is to commit.

**RULING: Option B + D.**
- **B — add `POST /v1/fleets/:fleetId/orders/preview`**, returning the solved burn
  (curve, arriveMs, Δv, fuel cost, affordability, link 7's stranding flags) without
  committing. One handler plus extracting the solve half of `fleet.OrderTo`. No new math,
  no fixture family, no `space-kinematics` delta, sole authority intact.
  **Take the analyst's quote-lock recommendation**: `goods-sale`/`board-view`'s *Sell
  Commit* already solved this exact problem — send `expectedUnitPrice`, server rejects on
  slippage, offer refreshes in-flow. A burn preview is the identical shape. That answers
  `README.md:300`'s open question with a pattern the codebase already proved.
- **D — any render math goes under `frontend/lib/space/`**, precisely so
  `check-mirror-map.sh`'s anti-mirror pass can see it. **Enforcement hole to record:** that
  check scans `frontend/lib/space` ONLY, so a rule-bearing function placed in
  `frontend/components/space/` passes every gate. Anything outside `lib/space` is a stated,
  reviewed exception.
- **C (a real TS mirror) is REJECTED for link 8**, with its measured cost recorded so a
  future reversal is a decision and not a discovery: 2,340 lines / 79 functions of Go, a
  164 KB pinned `turn-table.json` that must index identically in JS, `fixtures/space/`
  re-recorded with a JS leg at bit fidelity, the anti-mirror map flipped to `pairs`, two
  spec deltas — and every FMA-guard shape in `burn.go`/`curve.go` reproduced
  operation-for-operation, the ones whose necessity is documented as *verified by
  disassembly, not by the language spec*. `design.md`'s "reversal cost is bounded while
  `space` has no consumers" **has expired**: `fleet`, `system`, `disclosure`, `mine`,
  `market` and `stations` all read through it now. Trigger that reopens C: previews
  measurably reading as laggy in play.

## Structure — RULING: TWO changes, with a forcing function

**8a `build-production-space-view`** — the renderer, the `board-view` retirement, the
interior wire change, the preview endpoint, the hold/release controls, and the
`lib/types` de-latticing. Deployable alone: the game is playable in 3D and the lattice is
unreferenced.

**8b `add-scan-and-sightings-surface`** — the focused scan's entire player-facing half AND
the sightings display, together.

**The forcing function, which MUST be written into 8a's proposal: link 9 is blocked on
BOTH 8a and 8b.** Without it the split re-creates exactly what chain.md warns against —
the scan client half has already been deferred once (link 5) and already became a dead
derivation. A split that is not load-bearing on something downstream is a deferral
wearing a schedule's clothes. What must NOT happen: 8b's two halves separated from each
other, or the scan surface deferred out of link 8 again.

## `board-view` — RULING: RETIRE and replace, split three ways

Its `## Purpose` says the board *is* the lattice; its identity is the thing being deleted.
A MODIFIED delta must restate the complete body plus every scenario anyway, so
re-expressing ~20 requirements in place costs the same text and leaves a capability whose
name lies.

- **`system-space-view`** (new) — route/fan-in, selection, camera (all four), picking,
  renderer-availability trio, accessibility, refetch, jump commit, gate-body burn.
- **`docked-fleet-actions`** (new) — mine/sell/refuel offers and commits, hold readout,
  credit balance, rejection-copy mapping, double-submit guard, running-mine gating. The
  analyst is right that this is the cheapest half: every one is already anchored to
  `attachedTo`, requires no board selection, and is already specified to work while the
  canvas is unavailable.
- **Truly REMOVED, no successor** — *The Board Renders on the Polar Lattice*, *Board
  Coordinates Are Ring-and-Slot Throughout*.

Archiver mechanics: a capability cannot be retired via REMOVED deltas. Re-ADD under the
new names, hand-delete `openspec/specs/board-view/` AFTER the archive succeeds.
`polar-lattice-math` and `observation-fog-and-scan` are both precedents and both confirmed
absent today. **Rehearse on a copy.**

**Fix two live defects during the move rather than carrying them:** `board-view` cites a
requirement header that does not exist (*Board Picking Resolves to the Entity Under the
Pointer*, twice), and *Renderer Unavailability Is an Explicit State* enumerates "today:
scan" — a control the client has never had. That requirement is **currently unsatisfiable
as written**, and 8b is what makes it true.

## `system-interior` — RULING: this is what unblocks link 9, and it belongs in 8a

*Interior Read Endpoint* currently MANDATES the lattice on the wire ("SHALL continue to be
served unchanged… never removing a field a caller already reads"). Link 9 cannot delete
`backend/board` while it stands. MODIFIED must drop the additivity clause and its
scenario, drop `footprint`/`band`/`live`/`asOf`/gate `cell`, and ADD the served orbital
element set (`Feature.Space` already exists in memory and in Firestore as `spaceOrbit`;
it is simply not serialized).

## Two MORE orphans found — both land in link 8

The chain's signature failure now has **seven and eight**:
- **Link 7's `hold`/`release` verbs ship with no client affordance** (its design.md
  explicitly non-goals any UI beyond fuel readout, warning, and refuel). **8a ships the
  controls** — mandatory scope, same grounds chain.md uses for the scan.
- **`frontend/hooks/use-actions.ts:19`'s `useRunningScan` already exists with ZERO
  consumers**, selecting `type === 'scan' && status === 'running'`. Built for a surface
  that was never written. 8b is its caller.

## Rulings on the open questions

- **OQ-10 (coexist vs atomic swap) → ATOMIC SWAP, both halves in 8a.** The ground rules
  win ("No migration plans… no feature flags guarding the old code"). Exit criterion,
  written into the proposal: *a human can spawn, see the system, burn to a body, dock,
  mine, sell, refuel, fly to a gate and jump, entirely through the new view*, proven by a
  Playwright journey against the real stack — because link 5's own recorded lesson is that
  a green suite and an end-to-end test through the real router are **not** evidence a
  human can perform the action.
- **OQ-4 (belt members drawn/pickable) → (a) one body, members decorative and unpickable.**
  Serving members would reopen per-member lodes and a wire-size question; deriving them
  client-side is a mirror violation of `system` generation math, and the arm64 ULP history
  says no. **Record explicitly that link 6's per-member-lode deferral rolls forward
  again**, rather than letting it go quiet.
- **OQ-6 (scan targeting) → (b) a dedicated target list on the scan control**, showing each
  in-range body with its computed sweep duration — this makes "sweeping every body is
  self-defeating" legible, and dodges the shared-selection collision between burn (accepts
  a point, uncapped) and scan (bodies/own-fleets only, range-capped). **The range and
  occlusion computation is SERVER-side** — a second endpoint or a field on the interior
  read — never a client mirror of a `disclosure` predicate. Own-fleet-as-target: permitted
  by the verb, so list it, but it needs no special affordance.
- **OQ-8 (the Track rung) → (a) accept: every sighting is a Glimpse.** `sighting-records`
  freezes position + velocity, not orbital elements, so the "predicts the target forever"
  rung the README and `/spike/intel` describe is **unimplementable as shipped**. Do not
  widen the record in link 8. Record it as a design-doc-vs-shipped-spec contradiction for
  Travis, and note `/spike/intel`'s ghost-on-a-predicted-orbit — "the money shot" — cannot
  be graduated as-is.
- **OQ-3 (a body whose served position degrades to zero) → omit from the scene, and log.**
  On the lattice this was invisible; in R³ a zero position draws the body on top of the
  star, which is worse than absence.
- **OQ-11 (delete the spike routes) → YES, delete `frontend/app/spike/space-3d/` in 8a.**
  Keeping it leaves a second divergent implementation of production kinematics with 30
  passing tests — the artefact most likely to mislead the next agent. The
  `space-kinematics` exemption clause and its `## Purpose` sentence then go stale; the
  clause is delta-reachable, the Purpose is not — plan the post-archive hand-edit, as link
  4 had to.
- **OQ-12 (point-in-space burn target) → OFFER IT.** `space-kinematics`'s `ParkPoint` and
  half of *Targeting Names a Body or an Explicit Point* are otherwise unreachable from the
  UI — another orphan. "Places are bodies" constrains *affordances* (dock, mine, mask), not
  *positions*; `decisions.md` says so itself ("Objects may still sit in vacuum").

**Left genuinely open for Travis** (record, do not invent): OQ-1 sticky picking/hover,
OQ-2 the camera's default framing and pan bound in R³, OQ-5 contact refresh cadence,
OQ-7 sighting visual aging rules, OQ-9 where the sighting log mounts.

## Wire gaps to close in 8b
- **No sighting record `id` on the wire** — two records from one sweep against one host
  are indistinguishable to a player. `targetId` is `json:"-"` by design, so there is no
  correlation key between a sighting and a live contact either; the intel spike's
  hide-ghost-when-live-contact-exists behaviour **is not implementable** against the
  shipped wire.
- **No system name, only `systemId`** — reuse `fleet-roster`'s existing
  *An unknown system name falls back to its id* precedent.
- **The fleet DTO omits the sweep window** (`Fleet.Scan` exists in the model, not on
  `fleetDTO`), so the countdown needs either a DTO field or the action inbox.
