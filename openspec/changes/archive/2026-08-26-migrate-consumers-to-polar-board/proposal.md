## Why

`rewrite-board-on-polar-lattice` (landed `b903350`, not yet archived) rewrote
`backend/board/` onto the ring-and-slot polar lattice and deleted every hex
symbol six production packages still import — `system`, `fleet`,
`observation`, `corporations`, `mine`, `market` (plus `stations`, which the
migration handoff's inventory missed). `go build ./...` is red today and
stays red until these consumers move. This change is step 6 of the approved
polar migration: restore the build on the new board surface, in dependency
order `system` → `fleet` → `observation` → `corporations` → `mine`/`market`,
porting current spec'd semantics — nothing else. The frontend renderer and
e2e are step 7 and stay red through this change; that is accepted, not a
defect of this change.

## What Changes

- **Coordinate wording swaps to `(ring, slot)` cells** across the consumer
  specs below — no dual-read, no back-compat (worlds reset at migration step
  8; the wire and stored shapes move from `{q,r}` to `{ring,slot}` freely).
- **The star's occlusion shadow widens into a genuine cone** (was a
  one-cell-wide sliver under hex): `system` now hands `observation` a
  per-feature-type occlusion radius (star ≫ planet) instead of a bare
  occludes-or-not bit, and `observation`'s ambient/scan coverage inherits the
  wider shadow. Spec'd as MODIFIED behavior in `observation-fog-and-scan`
  with a dedicated scenario, not an incidental wording change.
- **`AmbientRadius` keeps the value `3`, but its unit becomes lattice hops**
  (`board.Distance`'s graph metric) instead of a fixed hex-ring count; the
  same radius value now covers a different cell count depending on which
  ring band a fleet sits in, because the schedule's slot width is not
  uniform. Spec'd in `observation-fog-and-scan`.
- **The per-slot orbital cadence is no longer uniform across ring bands.**
  `PeriodFor(ring)` stays linear in ring (`period = base × ring`); under hex
  that meant a uniform "one slot per `base/6` world-ms" everywhere because
  every ring had `6 × ring` cells. Under the pinned Isotropic schedule that
  cancellation no longer holds (ring 3 has 24 slots, not 18; ring 5 has 48,
  not 30; ring 9 has 96, not 54), so two rings with close periods can advance
  one slot at materially different rates. This is a recorded, accepted
  decision (the period law is not retuned here), spec'd in `system-interior`
  where `PeriodFor` is already described.
- **The core-destination guard's justification inverts, its behavior does
  not**: a burn's solved destination is still rejected if it resolves to the
  core, but the guard is now the *only* thing keeping a fleet off the star
  (a polar arc path cannot cross the core unless an endpoint is the core),
  not a belt-and-braces check on top of a deleted routing function. Spec'd
  in `fleet-movement`'s `In-System Burn Order`.
- **Coordinate-noun wording** (hex → cell) across `system-interior`,
  `fleet-movement`, `corporation-spawn`, and `trading-station` requirements
  named below, carrying forward every other stated invariant (rim placement,
  gate-ring exclusion, prograde direction, dockability, audience fog,
  ownership, ETA formulas) unchanged — **except three requirements where the
  migration adds substantive behavior, not just wording**: `trading-station`'s
  placement requirement now constrains the initial slot index to the
  derivation ring's configured slot count under the pinned schedule (closing
  the same fixed-per-ring-count bug this change fixes in the interior
  generator), `fleet-movement`'s `In-System Burn Order` re-founds its
  core-destination guarantee on "reject the core as an endpoint" as the
  guard's *sole* remaining justification, since a polar arc path — unlike a
  hex path — cannot cross the core without an endpoint being the core, and
  the belt-and-braces routing check it used to lean on is deleted, and
  `system-interior`'s `Lazy, Deterministic Interior Generation` now draws
  every generated angular position from the placement ring's configured
  slot count rather than a fixed per-ring count, so every generated
  interior legitimately differs from its pre-migration self (tasks.md
  2.4).

## Impact

- **Affected specs (this change):** `system-interior`, `fleet-movement`,
  `observation-fog-and-scan`, `corporation-spawn`, `trading-station`,
  `action-dispatch`. See the per-capability requirement list in each delta
  file's header comment. `action-dispatch` gains one rule — a commit-time
  allowlist rejecting non-primitive `Params` values — because this is the
  untyped channel a domain struct (a coordinate) could otherwise reach
  storage through undetected; the spine still knows nothing about
  coordinates, so migration handoff §4's "the action spine is untouched"
  (which is about hex knowledge specifically) still holds.
- **Four requirements are ADDED (not just modified) by this change:**
  `fleet-movement`'s `Board Coordinates Outside the Live Schedule Are
  Rejected, Never Panicked` (the cross-boundary guard, satisfied at the
  fleet decode boundary so `mine`/`market` inherit it),
  `system-interior`'s `Interior Feature Decode Validates Ring Against the
  Live Schedule` (named nowhere else in this proposal — see the
  generator bullet above for the related generation-side change),
  `trading-station`'s `A Station Orbit Outside the Live Board Radius Is
  Omitted, Never Panicked` (the interior splice runs upstream of the
  interior guard and needs its own), and `action-dispatch`'s commit-time
  allowlist named above.
- **Not deltaed, verified no coordinate wording present (judgment call, not
  an oversight):** `fleet-movement`'s `Single Movement-State Fleet Record`
  (its text names movement-state shapes and action channels, never a
  coordinate) and `trading-station`'s `Station Id Is the Home System's Id...`
  and `Home Station Visible On First Board Read...` (both reference
  "rim-ring hull" only as descriptive prose about *where* a hull sits, never
  a coordinate literal).
- **`board-tactical-math` — deliberately NOT deltaed by this change.**
  Design.md Decision 6 adds `board.Within(center, radius, sched)
  map[Cell]bool`, justified by a measured hot path (an unbounded BFS costing
  ~54ms inside the burn-resolve Firestore transaction). Judgment: this is a
  performance optimization of the existing `Lattice Hop Distance`
  requirement's semantics (`Within(c,r,s) == {x : Distance(c,x,s) ≤ r}`,
  pinned by a table-driven test, not a fixture family), not a new
  observable behavior — no consumer-visible contract changes because
  `Within` returns exactly what repeated `Distance` calls already would.
  Adding a `board-tactical-math` delta here would also collide with the
  active, unimplemented `rewrite-board-on-polar-lattice` change, which
  already carries deltas on five `board-tactical-math` requirements. If a
  future reviewer disagrees and wants `Within` spec'd as its own
  requirement, that delta belongs with whichever change lands second
  against `board-tactical-math`, not here.
- **Requirement collisions with other ACTIVE, unimplemented changes — ported
  as currently spec'd, not absorbed or resolved:**
  - `fleet-movement` / `Single Movement-State Fleet Record` — also targeted
    by `revise-scan-instant-and-emission` (not modified here; see above).
  - `fleet-movement` / `Sensor Scan Order` — also MODIFIED by
    `revise-scan-instant-and-emission`. This change only swaps the emission
    coordinate's noun (hex → cell); the instant/emission-timing semantics
    revision is untouched.
  - `observation-fog-and-scan` / `Running Scan Echo Disc` — REMOVED by
    `revise-scan-instant-and-emission`. This change ports its current
    (still-active) semantics with coordinate wording updated only.
  - `observation-fog-and-scan` / `Scan Resolution Mints the Reveal` —
    REMOVED by `revise-scan-instant-and-emission` AND MODIFIED by
    `add-endless-galaxy`. Same treatment: current semantics ported,
    coordinate wording updated only.
  Whichever of these changes archives second must reconcile against
  whatever this change lands; that reconciliation is out of this change's
  scope.
- **Pre-existing defects surfaced by this migration, filed but NOT fixed**
  (spec-first forbids opportunistic repair; each is a stale comment/constant
  relationship that predates this change and is unaffected by it —
  `board.GateRing(radius) = radius - 3` is unchanged by the rewrite):
  - `corporations/params.go:21-25` — `RimRing` documented as "one hex inside
    the lane-gate ring" but is actually three rings outside it
    (`RimRing = 15`, `GateRing(16) = 13`). Comment noun corrected (hex →
    cell) in this change; the numeric relationship is not.
  - `stations/placement.go` — receives `common.Tuning().BoardRadius` as its
    `gateRing` argument, so its "never on the gate ring" invariant is
    already violated for rings 13–15. Touched only for the schedule swap
    (`sched.Slots(ring)` / `board.Canon`) and the `gateRing` →
    `boardRadius` misnomer fix; the value relationship and the resulting
    gate-ring violation are unchanged and are now filed as an open defect
    (`docs/defects/2026-08-26-station-on-gate-ring.md`).
  - `fleet/params.go:20-26` — stale `(ring == BoardRadius)` comment. Noun
    corrected only.
  - `system/generator.go:73` — a moon's footprint sentinel `[]Hex{{0,0}}`
    ("position derived from parent") becomes `[]board.Cell{{0,0}}`, ported
    verbatim per design.md's Risks section; the honest fix (a "no board
    position" signal) is a follow-on, not this change.
- **Mission-brief corrections, verified against this repo rather than
  assumed** (recorded so no phantom work gets scheduled): there are no
  float beam-spread knobs (`board.BeamCells`/`BeamParams` have zero
  production consumers; `observation/params.go` holds only `AmbientRadius`
  and scan `Duration`); `cmd/seed start-area` embeds no board coordinates
  (verification task only, no regeneration); `corporations/siteselection.go`
  has no board coordinates (rim placement lives at `corporations/service.go`
  only).
- **Affected code:** `backend/system` (+ `backend/stations`), `backend/fleet`,
  `backend/observation`, `backend/corporations`, `backend/mine`,
  `backend/market`, `backend/board/params.go` (new codec),
  `backend/action` (new `Commit` validator), `backend/common` (the
  `OrbitPeriod` doc comment and unit comments, and the coincidence-ring test
  in `tuning_test.go` — the retired 6×ring uniformity claim), `docs/defects/`
  (one new filing), `fixtures/board/mirror-map.json`
  (six `goOnly` additions), `fixtures/determinism-register.json`
  (line-number re-anchor only, zero entries added or removed),
  `backend/CLAUDE.md` and the root `CLAUDE.md` (hex-wording references).
  **Not affected:** `frontend/` (stays red), `fixtures/board/cases.json`,
  `fixtures/polar/cases.json`, `fixtures/board/coordinate-table.json` (all
  pinned contract, no re-record).

## Follow-On Work Recommended, Not This Change

A reliability review of this change, plus the final done-gate verification
run, surfaced findings that are real but out of scope here; they are
recorded rather than silently dropped.

- **Per-action panic isolation in the action resolve sweep.** The
  reliability review asked for a `recover()` per action inside
  `action.resolveIDs` (`backend/action/service.go:170-193`), so one
  panicking resolver cannot abort an entire `ResolveAllDue` sweep. Rejected
  for THIS change on three grounds: it is a pre-existing gap that any
  resolver panic from any cause triggers today, unrelated to coordinates;
  this change's one `action-dispatch` addition is a commit-time
  param-shape allowlist, unrelated to sweep-time panic recovery, so it does
  not touch `resolveIDs` or its resolve-loop error handling; and adding
  `recover()` inside a Firestore transaction closure raises its own
  unanswered questions (whether a recovered panic still commits, and what
  it means for the exactly-once delta ledger). With this change's new
  boundary validation (`Board Coordinates Outside the Live Schedule Are
  Rejected, Never Panicked`), no coordinate can reach the panic, so this
  migration does not increase the risk. Recommended to Travis as its own
  change against `action-dispatch`.

- **Cross-package test isolation against the shared emulator.** `fleet`,
  `mine`, `observation` and `market` integration tests use literal,
  unnamespaced fixture ids (`"fleet-1"`, `"sys-1"`) together with
  `common.CleanupFirestoreTestData`, which wipes whole collections rather
  than scoping to the calling test's documents. A bare
  `cd backend && go test ./...` runs package binaries concurrently against
  one emulator, so one package's cleanup can delete another's in-flight
  fixture. Confirmed by bisection: the failures vanish entirely under
  `-p 1`. Pre-existing, not coordinate-related. `npm run test:backend:all`
  already passes `-p 1`, so the project's own gate is unaffected — the
  hazard is only for anyone running `go test ./...` by hand. Fix by
  namespacing fixture ids per package, or document the `-p 1` requirement
  in `backend/CLAUDE.md`.

- **`corporations.TestGetForAccount_ConcurrentHealsProvisionExactlyOnce`
  is flaky (~1 run in 5).** Fails as `NotFound: no entity to update` on the
  corp document during a concurrent heal — a create/update race in spawn
  healing against the emulator. Confirmed unrelated to this migration: the
  change's entire `corporations` diff is coordinate work (`rimHex` →
  `rimCell`, `board.RingHexes` → a schedule slot-count query) and
  `spawn_healing_test.go` is untouched. Recorded because it makes the
  backend gate non-deterministic and will eventually cost someone a
  bisect.

- **`market.TestGetBoard_ReflectsADrainedRequestOnTheVeryNextRead` was
  under-seeded — fixed here, noted for provenance.** The test seeded only
  `metals` but sold `firstRequestKind(...)`, which the station's epoch
  derives from `RequestKinds` (`metals`, `volatiles`, `water`,
  `organics`), so it failed on any epoch minting a non-metals premium
  request. A pre-existing wall-clock-dependent defect that surfaced during
  this change's gate run; fixed by seeding every `RequestKind`, which
  leaves the assertion's teeth intact. Not coordinate-related.
