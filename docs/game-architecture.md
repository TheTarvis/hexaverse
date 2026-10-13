# Game architecture reference


This reference was carried forward from the pre-migration project guidance.
Check code and tests for current behavior; milestone statuses and next steps
below describe the historical build sequence.

**Backend domains built (M1–M11):**

- **`common/worldtime.go`** — the injectable simulation clock (#0005 contract,
  pulled forward). `WorldClock()` / `NewWorldTime(epoch, scale)`; all stored
  stamps are `WorldMillis`. Domain code never calls `time.Now()`; tests inject.
- **`galaxy/`** (#0001, *implemented*) — generate-once + read. Deterministic
  generator (`Generate(seed, params)`): simplex-noise regions, Poisson-disc
  placement, relative-neighbourhood lanes, per-system major-body skeleton.
  Persists `galaxies/{id}` + `systems/`/`lanes/` subcollections behind a live
  pointer. `GET /v1/galaxy`. Seed via `make seed` / `cmd/seed`;
  `cmd/seed start-area` writes `frontend/public/galaxy/start-area.json`.
- **`system/`** (#0003 part 1) — lazy per-system interiors. `Generate` extends
  the galaxy skeleton (same `galaxy.SystemSeed`) with belts/moons/hazards,
  dialed by region character. Create-if-absent under
  `galaxies/{gid}/systems/{sid}/interior` + `features/`. `GET /v1/systems/:id`
  materializes on first read (dev trigger; TODO #0008 arrival). Unfogged (M6).
- **`space/`** (the lattice's successor) — pure continuous-space kinematics,
  Go-sole-authority with no TypeScript mirror by design. `Vec3`, `Orbit`
  (radius/period/phase/inclination/node), `Park`, `Burn`, `ShipState`, the
  brachistochrone `FlightSeconds`, `StateAt`, and `SubTurns`/`PhaseIndexOf` —
  a pinned trig table, never runtime `atan2`. It REPLACED a ring-and-slot
  lattice — two Go packages holding the lattice core and its schedule, hop
  metric, movement solves, lane gates and line-of-sight, their two TypeScript
  mirrors, their two fixture directories and their own capability — all
  **deleted 2026-09-04** (openspec `delete-the-lattice`). Do not go looking
  for them; nothing has a ring or a slot any more. A
  body's position is its orbital element set, a fleet's is a solved `Vec3`,
  and a lane gate is a body like any other. Go↔TS mirroring survives at
  exactly one pair — `backend/market` ↔ `frontend/lib/market`
  (`fixtures/market/mirror-map.json`); every other rule-bearing Go package is
  registered anti-mirror. The renderer draws continuous space
  (`frontend/components/space/`, WebGPU in `webgl/`).
- **`fleet/`** (#0004, *implemented*) — the map-mover. Motion is a continuous
  `space.ShipState` (parked / burning / in lane transit), `corporationId` from day one (dev-seeded through M8;
  **ownership real since M9** — spawn is the only fleet-minter now).
  `POST /v1/fleets/:id/orders|cancel`, `GET /v1/fleets/:id` (arrival resolved
  opportunistically on read — no scheduler). `SeedFleet` survives as spawn's
  placement primitive (the `/dev-seed` route retired at M9). Since
  M5 the burn order **commits through `action.Commit`** (`type:"burn"`); fleet
  still owns motion state (`BurnResolver` settles it at resolve). Two action
  **channels** since the 2026-07-14 beam revision (#0006 Decision #19):
  `activeActionId` (movement) + `activeScanId` (sensor) — a burning fleet can
  scan; each channel stays single-slot. Routing runs over the corp's
  **charted lanes** (per-lane docs), not tier-derived incidence.
- **`action/`** (#0005) — the async spine every verb rides. Generic `Action`
  (`running→done|cancelled`), commit-time ETA, single-slot claim, inbox
  (`GET /v1/actions?actor&status`, `POST /v1/actions/:id/acknowledge|cancel`).
  `ResolveDue(scope)`/`ResolveActive(actor)`/`ResolveAllDue` are ETA-ordered
  folds any read runs; per-type `ResolveFunc` registered by verbs (fleet imports
  action, never the reverse). Exactly-once ledger at `deltas/{scope}/entries/
  {actionId}` (doc id = actionId, created in the resolve txn); `remaining(T)` =
  fold of `effectAt ≤ T`, no materialized field. Kinematic resolvers settle actor
  state, mutating ones append a delta. Completion → `ActionCompleted` →
  `action-events` → `/v1/push/sse-action` → SSE(channel=scope). The **sweep**
  (`POST /v1/push/action-sweep`, OIDC) is a liveness floor — Cloud Scheduler
  ~15 min in `scheduler.tf`; correctness never depends on it. Composite indexes
  `(scope|actor|status, status, eta)` in `firestore-indexes.tf` (Travis must
  `terraform apply`). Mine (M10) is the first real mutating writer.
- **`observation/`** (#0006, *built M6, spec still `accepted`*) — per-Corporation
  fog. The observation atom (graph-tier `systemId→tier`
  `starVisible|rumored|surveyed|explored`, monotonic; board-tier per-feature
  memory) + the **fog-filter service** every read projects through
  (`galaxy`/`system`/`fleet` handlers take `.WithFog(...)`; server-side only, no
  ship-and-hide). Scan (revised 2026-07-14, #0006 Decisions #15–#24) is a
  **radial echo riding the fleet** on the #0005 dispatch, on the sensor
  channel: echoes return by distance, and the running scan's growing **echo
  radius — centred on the unit's live position** — joins the corp's live
  coverage per read (Decision #23 — `observation.Coverage`; no partial mints).
  Resolution still mints once at eta: `asOf: eta` observations for the
  unoccluded features from the fleet's eta position (the star occludes —
  occlusion is `proximity-disclosure`'s rule, in R³), charts
  **all the system's lanes** + rumors far endpoints (lanes-by-scanning; travel
  charts only lanes ridden, spawn charts none), grants **no graph tier**
  (`surveyed` is market-reserved; ladder in play: starVisible→rumored→explored),
  and **fizzles** if the fleet left the origin system. Board reads split into
  three bands (astronomical free / live inside the **LOS-filtered** sensor
  union / remembered elsewhere, geometry live + activity frozen at `asOf`).
  Fleet reads carry **audience fog** (own fleets never fogged; a foreign fleet
  outside your live union — or behind a planet — reads 404). Ambient-on-move
  reveals at movement resolution, LOS-filtered. Params in
  `observation/params.go` / `common.Tuning()` (beam width knobs).
  `RevealArrival` (spawn) writes home `explored` only — the first home scan
  finds the roads.
- **`corporations/`** (#0009, *implemented*) — spawn & identity. The
  **Corporation** is the auth-account-linked player entity (the mind's lineage);
  fleets carry `corporationId`, the fog store keys on it. `Spawn(accountId, name)`
  orchestrates through the live galaxy/fleet/fog singletons: corp doc + account
  pointer commit in **one transaction** (`corporations/{corpId}` +
  `corpByAccount/{accountId}`, the uniqueness anchor), then the hull
  (`fleet.SeedFleet` at a continuous home position) + initial fog (`observation.RevealArrival`:
  home `explored` **only** — no lanes, revised 2026-07-14 per #0006 Decision
  #17; scanning home is the first taught verb) follow — **idempotent per
  account** heals a partial spawn. `POST /v1/corporations` (idempotent), `GET
  /v1/corporations/me`. Site selection (`siteselection.go`): mineable-skeleton ∧
  ≥`minSpawnDistance` graph-hops from living corps' explored sets ∧
  periphery-weighted, account-seeded pick (knobs in `params.go`, placeholder
  constants). **The ownership seam:** `middlewares.ResolveCorporation` resolves
  account→living-corp into `common.ActorCorp` (`CorpIdKey`), the one function
  every fogged read already keyed on. Death invariant (`diedAt` only at zero
  fleets) recorded + enforced; no slice path reaches it. Spawn is **instant**, not
  a #0005 action. Frontend: corpless → wake-up flow (name → spawn → galaxy).
  **Since M11** spawn healing also provisions the home station + the opening
  credit grant, and **`GET /me` runs the same healing pass** — the migration
  mechanism, so a pre-M11 corp heals on its next session bootstrap with no
  backfill script. An `assetsCompleteAt` marker short-circuits a healed corp.
- **`mine/`** (#0010, *implemented M10*) — the action spine's first mutating
  verb. `POST /v1/fleets/:id/mine {featureId,kind,tons}` commits on the
  **movement** channel (a run gates move + mine, never scan); the resolver
  appends a delta at eta and credits `fleet.Cargo`. Per-lode remaining is the
  #0005 fold, never a stored field, bounded by construction (`MinRunTons` × a
  named ceiling — Decision #18). Since M11 a mine command naming a **station**
  is rejected with its own reason (dockable, never mineable).
- **`stations/`** (#0011, *implemented M11*) — the NPC trading post, one per
  spawn home and nowhere else. Its own store
  (`galaxies/{gid}/systems/{sid}/station/meta`, create-if-absent) — NOT the
  interior's feature subcollection, whose one-shot atomic claim has no
  add-a-feature path, and whose `system.Feature` deliberately has no owner
  field. `OwnerCorpId` empty = NPC (present from day one so player ownership is
  a value change, never a retrofit). The orbit is **derived, never rolled**:
  a pure function of (systemId, galaxy seed, skeleton) —
  `system.StationContinuousOrbit`, a full orbital element set, never persisted
  on the station doc — and **prograde with its system's disk** via the one
  exported `system.DominantOrbitDirection` the interior generator itself uses.
  Spliced
  into `GetOrCreateInterior` **ungated** (that seam has no requester — arrival
  settlement runs under the OIDC sweep), gated only at the requester-scoped
  reads; **excluded from `fog_source.Features`**, which is what keeps
  `observation` untouched (no scan mints a station observation, and it occludes
  nothing). Degrades to no-station rather than failing an interior read.
- **`market/`** (#0011, *implemented M11*) — credits, demand, and the sell
  verb. **Credits** live on the corp doc as a materialized `int64`
  (`corporations/credits.go`) — the one deliberate exception to #0005's
  fold-of-deltas pattern, because a credit ledger accrues forever; the
  reconciliation invariant is what keeps that safe (checkpointed **windowed**
  fold, compound `(worldTime, docId)` cursor since the doc id is a client key
  with no chronology, plus an O(1) write-time chain check and a divergence
  halt that only an `adjustment` entry clears). Mutation is idempotent by a
  client operation key scoped **per corporation** (`corporations/{id}/ledger/
  {opKey}`), format-constrained, with `spawn:` reserved. Demand is a **uniform
  ordered entry list** under an opaque venue key — the NPC floor is the entry
  of last resort, not a fallback branch — so M12's player asks join the same
  fold. `GET /v1/market/board` (point-read fan-out, no new index),
  `POST /v1/fleets/:id/sell` — **instant, no action, no ETA**, settling in ONE
  transaction that composes three domains' **two-phase** primitives (Firestore
  forbids a read after a write, so every prepare runs before every apply).
  Per-portion floored rounding pinned cross-stack by
  `fixtures/market/cases.json`. Knobs in `market/params.go`.
  **Cloud Scheduler `credit-reconcile` (hourly) in `scheduler.tf` — Travis must
  `terraform apply`;** and note the route inherits the long-standing
  `pushAudience = "flywheel-backend"` bug (`middlewares/oidc.go:13`) that 401s
  every `/v1/push` OIDC in prod until that constant is fixed.

**Next:** the M11 slice e2e (mine → sell at home → spot a premium three lanes
over → haul it → the profit lands), then M12's player exchange — player asks
join `market`'s existing demand-entry fold under the same venue key, and the
listing fee becomes this economy's first credit sink (M11 is a pure faucet).

- Core loop from the original design: players spawn colonies on a hex-grid
  galaxy (spaced 8–25 tiles apart), explore under fog of war (scan radius
  around units/bases), and compete over procedurally generated terrain
  (star-rich sectors, dead zones, galactic barriers as choke points).
