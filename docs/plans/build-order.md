# Build order — implementing the first vertical slice

> **Purpose.** The implementation roadmap for the ten accepted specs
> (#0001–#0010) — how the slice gets built, in what order, with what gate at
> each rung. Written 2026-07-09, the day the spec backlog closed. Specs are
> the *what/why*; this doc is the *when/how-much-at-a-time*. It is a plan
> doc, not a spec — revise freely as building teaches us things.
>
> **The unit of work is a milestone, not a spec**: a thin, demoable rung that
> Travis can look at and judge against the specs it draws from. Build one,
> verify it, commit it, then the next. Parallelism lives *inside* a milestone
> (and in the two marked overlaps), never across arbitrary rungs — the bugs
> in this design live in the seams between specs (fleet ↔ ledger, fog ↔ read
> surfaces, worldTime everywhere), and serializing the rungs means each seam
> is integrated once, deliberately, with a human checkpoint.

## The shape of the build

**Spec order is build order.** #0001→#0010 topologically sorts the
dependency graph (the BACKLOG's claim, verified against every spec's
References section). Three adjustments make it click:

1. **`worldTime` is pulled forward to M1.** It's #0005's module, but every
   stored timestamp from the first galaxy doc onward must be in worldTime
   units (#0005 Decision #7). Build the small `backend/common` clock first;
   never let a bare `time.Now()` into domain code.
2. **#0003's detail trigger is stubbed until M8.** The real "Explored"
   trigger is a #0008 arrival resolution. Until then, a dev-only explicit
   trigger materializes interiors so #0003/#0004 are buildable and testable.
   M8 replaces the stub with the real dispatch.
3. **Specs #0003, #0007, #0008 complete across two milestones each** (the
   interlock is in the specs themselves: #0007 renders #0008's gates; #0008's
   client surface *is* #0007/#0002). A spec flips to `implemented` only when
   **all** its acceptance boxes check — the milestone table below says where
   each finishes.

**Fog is a planned retrofit, not an accident.** M1–M5 read surfaces ship
unfogged (the #0002 `discovered` stub, raw interior reads) with the filter
insertion point kept clean at the service boundary. M6 is the one deliberate
retrofit pass across every read. Don't half-fog anything earlier.

## The process loop — every milestone, the same five steps

1. **Kickoff** — re-read the spec(s), confirm the build-time decisions
   flagged below, sketch the file-level plan. Anything that contradicts a
   spec goes back to Travis before code, not after.
2. **Build** — fan out inside the milestone where pieces are independent
   (generator + tests + API concurrently is fine). Follow the house layering
   (`backend/CLAUDE.md`, `frontend/CLAUDE.md`); scaffold domains with
   `/new-domain` and adapt.
3. **Gate: `/check`** — the full harness, plus the milestone's own emulator
   tests green.
4. **Verify against the spec** — walk the acceptance-criteria checklist;
   run the demo (each milestone names one). Travis eyeballs the rung.
5. **Commit & bookkeep** — `/commit`; tick acceptance boxes in the spec(s);
   flip status to `implemented` when a spec fully lands; refresh
   `BACKLOG.md` and the CLAUDE.md domain quick-reference as domains appear.

## The ladder

| M | Spec(s) | Rung — what becomes true | Demo / gate | Size |
|---|---------|--------------------------|-------------|------|
| **M1** | #0001 (+ worldTime) | **A galaxy exists** — generated, persisted, readable | Seed a galaxy; `GET /v1/galaxy` returns a deterministic connected graph; tests prove determinism/connectivity/regions | L |
| **M2** | #0002 | **You're looking at it** — the 3D view is the app | Orbit the real generated galaxy in the browser, logged in and out | L |
| **M3** | #0003 (part) | **Systems have insides** — interiors generate + persist | Fetch an interior; star-rich vs dead visibly differ; determinism tests | M |
| **M4** | #0004 (+ fleet domain) | **A ship moves** — coast/burn/docked over real time | Order a dev-seeded fleet to a hex; position is right before/at/after ETA | L |
| **M5** | #0005 | **The spine** — actions commit, resolve lazily, sweep | Commit a burn as an action, log off, come back — resolved; exactly-once + ETA-order tests | L |
| **M6** | #0006 | **Fog** — every read is per-Corporation | Two accounts see different galaxies; scan mints an observation | L |
| **M7** | #0007 (core) | **The board on screen** — drill in, move, scan | Watch the system turn; select→preview→commit a move and a scan | L |
| **M8** | #0008 + #0007/#0003 finish | **Travel** — depart, crawl the lane, arrive, reveal | Leave home via a gate; destination lights up on arrival; survives reload + offline | L |
| **M9** | #0009 | **Spawn** — a mind wakes in a hull | Fresh account → name corp → wake at the frontier with correct fog | M |
| **M10** | #0010 + slice e2e | **Mine — and the loop closes** | The full slice bar: drill in → move → scan → mine → leave → return → it persisted | M |

**Allowed overlaps** (disjoint code, pinned contracts): **M2 ∥ M3** (frontend
view vs backend interiors — the `GET /v1/galaxy` contract is pinned in
#0002); **M7's `lib/hex/` math ∥ M6** (pure TS + fixtures, no fog
dependency). Everything else serializes.

---

## M1 — A galaxy exists (#0001, detailed)

The foundation rung; everything reads this. Backend only.

**Scope**

- **`backend/common/worldtime.go`** — the #0005 clock contract, built now:
  `worldTime() = worldEpoch + (wallNow − worldEpoch) × scale`, injectable
  interface (tests inject; domain code never calls `time.Now()`), per-env
  `scale` from config (prod 1, dev/test fast). Every stored stamp from here
  on is worldTime units.
- **`backend/galaxy/` domain** — scaffold with `/new-domain galaxy`, then
  adapt: this is generate-once + read, not user CRUD (drop update/delete
  handlers; generation is a service operation, not a POST from users).
  Six-file shape otherwise per `backend/CLAUDE.md`.
- **Generator** (pure function of `(seed, params)`):
  1. 3D simplex-noise field over a flattened-disk volume (lib:
     `github.com/ojrac/opensimplex-go` or equivalent) → region
     classification `star_rich | normal | dead | barrier`.
  2. Poisson-disc placement with **region-varied minimum gap** (Decision
     #7) — tight star-rich, sparse dead. ~200–500 systems.
  3. Lanes via **relative-neighbourhood graph** (Decision #8) — lune test;
     connected by construction.
  4. **Major-body skeleton per system** (Decision #9): star class + major
     bodies (type, ring) + orbital geometry, from a per-system seed
     (galaxy seed + system id) — the same derivation #0003's detail phase
     will extend, so put the seed-derivation helper somewhere `system/`
     can share.
  5. Deterministic naming.
  - All knobs in a **`GenerationParams`** object (disk dims, per-region
    gaps, target count, skeleton distributions), spike values as defaults.
- **Persistence** — `galaxies/{id}` metadata + `systems/{id}` and
  `lanes/{id}` **subcollections** (build-time leaning, below). Register the
  collections in `CleanupFirestoreTestData()`.
- **Read API** — `GET /v1/galaxy` returning exactly the #0002 pinned
  contract (id/seed/bounds, systems with coords/name/region/skeleton +
  `discovered` stub, lanes with aId/bId). Serves the single live galaxy for
  the environment.
- **Seed command** — `backend/cmd/seed/main.go` (+ `make seed`): generates
  and persists the live galaxy for an env; re-runnable (regenerate → new
  id or append — never corrupt in place).
- **Start area** — same command with the fixed known start-area seed emits
  a **static JSON asset** → `frontend/public/galaxy/start-area.json`
  (#0001 Decision #3: separate mini-galaxy; #0002 consumes it). Frozen,
  committed, never regenerated at request time.
- **Tests** (emulator + pure): same seed → same galaxy (deep-equal);
  connectivity (BFS spans all nodes); region distribution (star-rich denser
  than dead by construction stats); skeleton determinism; persistence
  round-trip; seed-command idempotence.

**Build-time decisions to confirm at kickoff**

- **Firestore layout** (spec leaves it open): *leaning subcollections* —
  matches #0003's `galaxies/{gid}/systems/{sid}/interior` nesting, and
  per-system docs suit later mutation. Cost: the whole-graph read is ~1.5k
  doc reads; fine at this scale, cacheable in the service later if it isn't.
- **Galaxy shape**: spec leans flattened disk — confirmed unless Travis
  says otherwise.
- **Noise lib choice** — whatever is maintained + deterministic across
  platforms (determinism matters more than beauty).

**Explicitly not here**: fog (stub `discovered: true` everywhere for now),
interiors' detail phase (M3), any frontend (M2), frontier-expansion trigger.

**Gate**: all #0001 acceptance boxes except the fog-dependent nuance;
`make seed` against dev emulators + `curl /v1/galaxy | jq` shows a
connected, regionally-clustered galaxy; start-area JSON committed.

---

## M2 — You're looking at it (#0002)

- `components/galaxy/GalaxyView` → `hooks/use-galaxy` → `lib/services/galaxy`
  → `apiClient`, query-key factory entry. Deps: `react-force-graph-3d`,
  `three`, `@types/three` — dynamic import, client-only, SSR-guarded glow
  texture singleton.
- Nodes pinned to real `(x,y,z)` (`fx/fy/fz`, `cooldownTicks={0}`); additive
  sprite glow (core + halo); region palette as one raw-value module (the
  documented color-system exception).
- **Camera rig owns its OrbitControls** (Z-up basis at construction — do
  not port the spike's `_quat` poke): RTS pan-orbit, height-scaled
  ground-plane pan, unclamped pitch, damping, trackpad gesture map,
  click-vs-drag threshold, double-click focus glide, ⌖ recenter.
- Left intel panel + right inspector (Catalyst); inspector draws the
  skeleton (never fogged); `discovered` stub dims undiscovered.
- Logged-out path: home route becomes public (`PUBLIC_ROUTES` /
  `layout-wrapper.tsx`), fed `start-area.json`; sign-in prompt at the gated
  boundary. **Replaces `app/page.tsx`.**
- Retire `frontend/app/spike/galaxy-3d/` and revert the spike route
  allowance. (Leave `spike/hex-board/` — it's M7's feel reference; ask
  Travis about the untracked `spike/audio/` before touching it.)
- Camera decide-while-building items (auto-follow, pan bounds, zoom
  handoff, keybindings) get decided by feel with Travis during this rung.

**Gate**: #0002's acceptance list, live in the browser, both auth states.

## M3 — Systems have insides (#0003 part 1)

- `backend/system/` domain (scaffold + adapt). Reads `galaxy` service for
  the region dial (service-to-service).
- Detail-phase generator: bands (core/inner/mid/outer), features
  (bodies + hazards, one `Feature` family), resources by band + character,
  orbital elements on every non-star feature, belts as ring arcs, moons
  riding giants. Axial storage / cube algorithms. All knobs in
  `GenerationParams` (radius ~16 baseline).
- Persistence: `…/systems/{sid}/interior` doc + `features/{fid}`
  subcollection; **create-if-absent** under a transaction (the race guard),
  behind a **dev-only trigger** (explicit endpoint or on-first-read flag,
  clearly marked `// TODO(#0008): arrival is the real trigger`).
- Read surface: `GET /v1/systems/{id}` — interior + features + `worldTime`.
  Unfogged for now (M6 inserts the filter at this boundary).
- Start-area systems: pre-generated fully (fog-off showcase), into the
  static asset pipeline from M1.
- Skeleton phase already landed in M1 — this rung asserts detail *extends*
  it consistently (same seed derivation, skeleton bodies present in the
  interior).
- Tests: determinism, band distribution, character dial (star_rich ≫ dead),
  elements presence, race-guarded create-once.
- *Optional debug harness*: point the `spike/hex-board/` page at the real
  read API to eyeball `GenerationParams` tuning — throwaway, no conventions.

**Gate**: #0003 boxes except the arrival-trigger one (lands M8).

## M4 — A ship moves (#0004 + the fleet domain)

- `backend/fleet/` domain — top-level; fleet doc carries `systemId`,
  movement state (`coast | burn | docked` — one field, three shapes), and
  **`corporationId` from day one** (dev-seeded value until M9 — pulling the
  field forward avoids the M9 ownership retrofit).
- Shared math in Go: `shipPos(state, worldTime)`, hex-line paths,
  `solveIntercept` (earliest-meet against coasting elements). **Record
  fixtures** (inputs → expected outputs) into a `fixtures/` dir now — M7's
  TS `lib/hex/` asserts against the same files (determinism by contract,
  #0007).
- `POST /v1/fleets/{id}/orders` `{target: {hex}|{featureId}}` → server
  solves, persists order, flips to `burn`; `POST …/cancel` → coast from
  computed position. Re-task replaces. Reads return state + `worldTime`.
- Arrival is computed (`now ≥ arriveTime` → dock/coast on next touch) — no
  scheduler, per Decision #12; M5 wraps this in the action lifecycle.
- Dev seeding: a test/make helper that drops a fleet into a system (spawn
  is M9).
- Movement params object (`burnSpeed`, horizon).
- Tests: intercept determinism (meet = body pos at arriveTime), path
  contiguity, arrival transitions (coast vs dock), re-task/cancel mid-burn,
  motion-off reduction (featureId target ≡ static hex).

**Gate**: #0004's boxes minus the "volatile snapshot audience" nuance
(M6 owns the audience); demo via API at an injected clock.

## M5 — The spine (#0005)

- `backend/action/` domain: commit (validate → freeze `{type, actor, scope,
  params, eta}` → claim `fleet.activeActionId`, one transaction), cancel,
  inbox (`GET /v1/actions`, `acknowledge`), `ResolveDue(scope)` — ETA-ordered
  fold, per-type dispatch back into verb services.
- Refactor M4: the burn order commits **through** the action service
  (`type: 'burn'`, thin wrapper — fleet still owns motion state, never a
  second copy). Single-slot guard live from here on.
- Ledger primitives: `features/{fid}/deltas/{actionId}` (doc id = actionId,
  created in the same transaction as the `done` flip — exactly-once);
  `remaining(T)` fold helper (no materialized field). Mine (M10) is the
  first real writer; the shape + tests land now.
- Every read returns `worldTime`; completion publishes `ActionCompleted`
  (constant in `common/pubsub.go`) → push subscription → SSE channel.
- **The sweep**: `/v1/push/action-sweep` (OIDC-verified) resolving all due
  actions + logging overdue; Cloud Scheduler ~15 min in
  `infra/terraform/scheduler.tf` (Flywheel pattern). Composite index
  `(scope, status, eta)` in `firestore-indexes.tf`. `terraform fmt`.
- Tests: ETA-order (scan-at-T1 + mine-at-T2 resolved together at T3 ≡
  resolved on time — with stand-in mutating types until M6/M10), concurrent
  resolvers → one delta, cancel releases slot, **everything passes with the
  sweep disabled**.

**Gate**: #0005's boxes (client refetch rules verified at M7 where the
consuming UI exists); demo: commit → close everything → sweep resolves.

## M6 — Fog (#0006) — *the big retrofit rung*

- `backend/observation/` domain: the observation atom (graph-tier
  `players/{pid}/observations/{systemId}` with monotonic
  `rumored|surveyed|explored`; board-tier per-feature subdocs), and the
  **fog-filter service** other domains call.
- The retrofit pass (the one planned two-touch): galaxy read → star layer
  free + per-requester subspace tier (**`discovered` dies** — #0002 view
  updated); system read → three bands (astronomical free, Visible computed
  from live sensor union, Remembered from stored observations); fleet
  reads → own-fleets always, others per audience rule (#0004's delegated
  half). Server-side only — no ship-and-hide.
- Scan verb: an action `type` on the #0005 dispatch; resolution mints
  `asOf: eta` observations + tiers-up graph knowledge. Slice collapses
  quick-sweep/deep-scan into one scan action.
- Ambient-on-move writes at movement resolution (path-swept; endpoint-only
  is the accepted fallback if fiddly).
- Sensor/scan params object. Frozen start area stays all-explored static.
- Tests: **two-player isolation** (one scans, the other's read unchanged),
  monotonicity, Remembered-keeps-orbiting (geometry live, activity frozen
  at asOf), late-resolved scan mints the same snapshot, arrival-reveal
  shape (full wiring at M8).

**Gate**: #0006's boxes except travel-arrival specifics (M8); demo with two
dev accounts side by side.

## M7 — The board on screen (#0007 core)

- `app/systems/[systemId]/page.tsx` + `components/board/` (HexBoard,
  FeatureGlyph, FleetGlyph, FogTreatment, SelectionPreview, FactsPanel).
- `lib/hex/` — axial/cube math, `orbState`, `shipPosAt`, interpolation,
  intercept preview — pure, vitest-covered, **asserted against M4's
  fixtures**.
- `useWorldTime()` (server offset + rAF, transforms-only animation),
  `useSystemBoard`, `useFleetOrders`, `useScan` — mutations invalidate via
  the factory and **self-schedule the ETA refetch**; SSE-reconnect refetch
  + gentle open-board poll (the three #0005 client rules land here).
- Quantize the simulation, interpolate the picture; three fog bands styled
  from the spike's treatments; scan bubble rides the glyph; drill-in
  navigation from the #0002 view (its Decision #4 deferral ends here).
- Verbs usable this rung: **move** (hex + led intercept) and **scan**.
  Gates/depart render at M8; mine picker at M10.
- Retire `spike/hex-board/` once the production view stands.

**Gate**: #0007's boxes minus gates/depart/mine + the e2e (M8/M10); demo:
drill in, watch it turn, move, scan, close the tab, return after ETA.

## M8 — Travel (#0008; finishes #0007, #0003)

- Fleet state gains `lane-transit` (with `boardLeg`) + `lane-hold`; orders
  endpoint accepts `{systemId}`; Dijkstra over the requester's **charted**
  lanes + one Rumored terminal hop; sentinel error for no-route.
- **Gate geometry**: deterministic bearing-projection of each lane onto the
  rim → one fixed tile; server + clients agree (fixture-tested both sides).
- Leg 0 = burn-to-gate inside the one trip action; mid-transit cancel
  (lane-hold at frozen fraction) + redirect (virtual start node), each a
  single transaction under the slot guard.
- Arrival dispatch (the kinematic-with-mutating-epilogue): coast at the
  entry gate → `explored` + onward lanes (#0006) → **first-arrival detail
  roll replaces M3's dev trigger** → completion envelope → SSE.
- Client: #0002 view gains select→route-preview (polyline, per-leg + total
  ETA)→commit + lane-crawl animation; #0007 view gains gate glyphs +
  depart (finishing both specs' remaining boxes).
- Tests: routing asymmetry between two players' charted sets, computed
  mid-leg positions at injected clocks, cancel/redirect, exactly-once
  detail roll, reload-mid-trip re-derivation.

**Gate**: #0008 fully; #0007 and #0003 flip to `implemented`.

## M9 — Spawn (#0009)

- `backend/corporation/` domain; spawn = one transaction (corp + one
  `seed`-class fleet coasting rim-adjacent + home observation `explored`
  with onward lanes). Idempotent per account. `POST /v1/corporations`,
  `GET /v1/corporations/me`.
- Site selection: unclaimed (graph distance from living corps' explored
  sets) + bootstrap-guaranteed (mineable-archetype flag on the skeleton —
  make sure M1's skeleton carries that flag; if it doesn't, add it here) +
  periphery-weighted. Knobs in a params object, placeholder constants.
- Ownership becomes real: `common.Actor` → corporation resolution on every
  fleet/action/observation route; cross-corp access rejected (the
  `corporationId` field has existed since M4 — this rung enforces it).
  Death invariant (`diedAt` only at zero fleets) as a guarded service rule.
- Frontend: corpless state → wake-up flow (name → spawn → land on the
  galaxy view centered home); corp joins the session context beside the
  account. Dev-seeding from M4 retires.

**Gate**: #0009's boxes; demo: brand-new account to "awake at the frontier
with one ship and the right sky."

## M10 — Mine, and the loop closes (#0010 + the slice e2e)

- `backend/mine/` verb service on the #0005 dispatch; fleet gains
  `ships[]` roster + `cargo` pool (derived rate/hold/speed; slice roster
  `[{class:'seed'}]`); `MineParams` (class stats, richness→tonnage curve).
- Commit preconditions (docked, kind exists, tons ≤ free hold, slot free);
  resolve clamps against `remaining(eta)` + free hold, honest `outcome`,
  delta + credit in one transaction. `POST /v1/fleets/{id}/mine`.
- UI inside #0007's surfaces: facts-panel Mine offer, kind picker, tonnage
  input clamped to known lode/free hold, ETA preview, hold readout.
- Tests: precondition matrix, exactly-once under concurrent resolvers, the
  ETA-order fold with a real mutating verb (closing #0005's named
  criterion), both clamps, roster aggregation.
- **The slice e2e** (`frontend/e2e/`, fast worldTime scale): sign in →
  spawn → drill in → move → scan → mine → depart → arrive → reveal →
  close → return after ETAs → everything persisted.
- Closeout: all ten specs `implemented`; BACKLOG refreshed; CLAUDE.md
  domain quick-reference filled; a short retro — what the specs got wrong
  goes back into them (they now document what exists).

---

## Cross-cutting rules (hold for every milestone)

- **worldTime discipline** — injectable clock only; all stored stamps in
  worldTime units; every read returns `worldTime`; never change `scale` on
  a world holding data (dev worlds are disposable).
- **Tuning is data** — every knob in a params object (`GenerationParams`,
  movement, sensor/scan, `MineParams`); freeze-at-commit for anything an
  action stores.
- **`corporationId` on fleets from M4**, enforced at M9 — no ownership
  retrofit.
- **Go/TS shared math by fixtures** — recorded cases in a shared
  `fixtures/` dir; both test suites assert against them; never port-and-pray.
- **Fog inserts at the service boundary** — M1–M5 reads stay thin so M6's
  filter is one seam, not a hunt.
- New Firestore collections → `CleanupFirestoreTestData()`; new events →
  constants in `common/pubsub.go`; new infra (index, scheduler) →
  Terraform, `terraform fmt`, plan before apply.
- Spike retirement: `galaxy-3d` at M2, `hex-board` at M7, revert the
  `PUBLIC_ROUTES` spike allowance; `spike/audio/` is untracked and not
  mine to touch — ask.
- `/check` before every commit; one `/commit` per coherent change with the
  `Impact:` trailer.

## Risks & seams to watch

- **M6 is the widest blast radius** (touches every read + the #0002 view).
  Mitigation: the boundary discipline above, and M6's two-player tests
  written *first*.
- **The Go↔TS determinism seam** (positions, intercepts, gate projection)
  is where silent desync would live. Fixtures are the contract; add a case
  whenever either side surprises.
- **The M4→M5 refactor** (bare order → action-wrapped) is deliberate
  two-step scaffolding, not waste — but keep M4's order shape close to
  #0005's `params` so the wrap is thin.
- **Long headless stretch (M3–M6)** — four backend rungs with no new
  pixels. The M3 debug-harness option and M2∥M3 overlap soften it; if
  morale needs a screen, pull the harness forward, never the fog.
- **Firestore read amplification** on the whole-graph fetch — accepted at
  hundreds of systems; revisit with caching if dev feels it.
