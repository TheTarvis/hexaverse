# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

> **Setup state (2026-07-02):** bootstrap has run — placeholders substituted,
> GCP/Firebase provisioned (dev = `hexaverse-game-dev`; prod = `hexaverse`,
> the reused pre-Volt project), local build/tests green. The **User profile**
> section below still needs the `/onboard` discovery conversation. Remove
> this blockquote once that's done.

## Purpose

Hexaverse is a **multiplayer space-colonization game on a procedurally
generated hex-grid galaxy** — fog of war, colonies, resource tiles, real-time
interaction between players. This repo is the 2026-07-01 rebuild of that game
on the Volt platform skeleton (hexaverse is the first fork / guinea pig for
Volt). Which gameplay features survive the rebuild, and in what order, is
still to be decided with Travis — that's part of the pending `/onboard`
discovery conversation.

The previous implementation (Next.js + Three.js client, Go websocket server)
is archived: GitHub branch `archive/pre-volt-reset` and the "Checkpoint"
commit at the root of `main` (`git show bf9c637`). Gameplay design lives there
at `client/docs/Gameplay.mdc`. The old realtime layer was raw websockets; the
Volt platform provides SSE + Pub/Sub instead.

## Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind v4 + Catalyst UI + React
  Query, Firebase Auth, vitest. Deployed on Vercel.
- **Backend**: Go (1.24+) + Gin on Cloud Run. Firestore, Pub/Sub, SSE realtime.
- **Agent**: `claude-agent/` — Python/FastAPI Claude tool-calling agent on
  Cloud Run; streams SSE to the frontend and calls the Go backend with the
  user's own Firebase token (token passthrough).
- **Database**: Firestore (Firebase emulator for local dev).
- **Infra**: Terraform in `infra/`. One GCP project per environment
  (`GCP_PROJECT_DEV`, `GCP_PROJECT_PROD`). CI/CD via GitLab.

## Repo layout — where the real guidance lives

Each service has its own CLAUDE.md with the patterns, gotchas, and testing
conventions for that codebase. **Read the relevant one before working there.**

- `package.json` (root) — npm scripts orchestrating everything (`dev:*`,
  `test:*`, `firebase:*`, `install:all`). Run `npm install` at the root once
  to get `concurrently` + `firebase-tools`. `.run/` holds JetBrains run
  configurations for these scripts; `scripts/dev/with-test-emulators.sh`
  auto-starts/reuses the test emulators around e2e/integration runs.
- `backend/` — Go service. See `backend/CLAUDE.md` (domain package shape,
  handler→service→DAO layering, events, sentinel errors, emulator testing).
- `frontend/` — Next.js app. See `frontend/CLAUDE.md` (component→hook→service→
  apiClient layering, query-key factory, Catalyst-only UI, color system).
  `frontend/e2e/` — Playwright suite against an isolated test stack
  (`cd frontend && npm run e2e`); see `frontend/e2e/README.md`.
- `claude-agent/` — agent service. See `claude-agent/CLAUDE.md` (agent loop,
  adding tools, persistence hooks).
- `infra/` — Terraform + CI runner images. See `infra/CLAUDE.md` (secrets
  flow, Pub/Sub wiring, setup-gcp.sh vs Terraform split).
- `bootstrap/` — fork-time setup. `config.env` + `init.sh` substitute
  placeholder values across the repo and write `frontend/.env.local`.
- `scripts/` — ops scripts. `decommission-old-hexaverse.sh` tears down the
  pre-Volt implementation's resources inside the `hexaverse` prod project
  (dry-run by default; explicit 2026-07-02 inventory — never touches the
  Volt stack). `cleanup-firestore.sh` / `cleanup-pubsub.sh` were brought
  from Flywheel and are **not yet adapted** to hexaverse.
- `firebase.json`, `firebase.test.json` — emulator and deploy config
  (test emulators: Firestore 9100, Auth 10109, Pub/Sub 9106).

## Commands

Quality gate — `/check` runs the full harness (changed-file validators:
data-testid, test-file coverage, param helpers, raw-fetch, color compliance;
plus lint, vitest, Go tests, agent lint/tests, npm audit, govulncheck, and
best-effort e2e):

```bash
python3 .claude/skills/code-quality-checks/check.py   # flags: --files-only --lint --backend-tests --e2e ... (see /check)
bash .claude/scripts/check.sh              # fast bash gate only: --backend --frontend --lint --test --keep-going
```

Commit with `/commit` — one conventional commit for the whole working tree,
type-prefixed bullets per change, `Impact:` trailer (see
`.claude/skills/commit/SKILL.md`).

Backend (`cd backend`):

```bash
make run                                   # run locally (localhost:9010)
make test                                  # unit tests (go test -short ./...)
go test ./widgets/ -run TestName -short    # single test
make generate                              # regen mocks after editing a DAO interface
make emulators-bg / stop-emulators         # Firebase emulators in background
```

Frontend (`cd frontend`):

```bash
npm run dev                                # localhost:3010
npm run lint                               # ESLint + tsc
npx vitest run                             # tests, one-shot
npx vitest run path/to/file.test.tsx       # single file
```

Claude agent (`cd claude-agent`):

```bash
uv sync && uv run python -m src.main       # server at :8100
uv run pytest                              # tests
uv run ruff check src tests && uv run pyright src
```

Infra (`cd infra/terraform`):

```bash
terraform plan -var-file=environments/dev.tfvars    # always plan first
terraform apply -var-file=environments/dev.tfvars
```

Scaffold a new CRUD domain end-to-end (backend six-file package + frontend
type/service/hook/page + wiring snippets): `/new-domain <singular> [plural]`.
Apply **all** printed wiring edits before building — the scaffold references
pubsub constants that don't exist until you do.

## Architecture — the cross-service picture

- **Auth is Firebase ID tokens everywhere.** Frontend gets a token via
  Firebase Auth; `apiClient` attaches and refreshes it. Backend middleware
  verifies it and exposes the account via `common.Actor(c)`. The claude-agent
  verifies the same token and passes it through to the backend, so the agent
  inherits the user's permissions — no service-account path.
- **Events flow through Pub/Sub.** Backend services publish typed envelopes
  (constants in `backend/common/pubsub.go`); Terraform-defined push
  subscriptions deliver them back to backend `/v1/push/*` routes, verified by
  OIDC middleware. SSE (`backend/sse/`) broadcasts to logical channels for
  realtime UI.
- **Both codebases are strictly layered** — handler→service→DAO in Go,
  component→hook→service→apiClient in TS. Never skip a layer; cross-domain
  calls go through services, not DAOs.
- **Environments**: dev = `hexaverse-game-dev`; prod = `hexaverse` — the
  reused pre-Volt project, which still hosts the old implementation's
  resources until `scripts/decommission-old-hexaverse.sh` is run. Both live
  under wilson.travis.t@gmail.com (gcloud config `hexaverse`, not the
  default). Prod domain `hexaverse.io`; dev uses the Vercel default URL.
  `setup-gcp.sh` creates the per-env project shell once; Terraform manages
  everything inside it. GitLab pipeline: verify-dev → deploy-dev → manual
  promote → deploy-prod.

## Bootstrap & onboarding

After forking:

1. `cp bootstrap/config.example.env bootstrap/config.env` and fill in values.
2. `bash bootstrap/init.sh` — substitutes placeholders, writes
   `frontend/.env.local`.
3. Run `/onboard` — probes prereqs, auth, build, tests; writes a personal
   `onboarding_checklist.md` (gitignored). Re-runnable.

Local dev loop (three terminals, from the repo root):

```bash
# 1. Firebase dev emulators (firebase.json — auth :9109, firestore :8090)
npm run firebase:emulators

# 2. Backend (:9010)
npm run dev:backend

# 3. Frontend (:3010)
npm run dev:frontend
```

`npm run dev` runs frontend + backend concurrently in one terminal. E2E
(`cd frontend && npm run e2e`) needs none of these — it boots its own
isolated stack (test emulators, `ENV=test` backend on :9012, frontend on
:3110).

## User profile

*(pending — fill via the `/onboard` discovery conversation: role, background,
time/budget constraints, what's deliberately out of scope for the rebuild)*
Solo project of Travis Wilson.

## Domain quick-reference

*(filled as the rebuild lands milestones — see `docs/plans/build-order.md`.
The richest design source is the archived gameplay doc —
`git show bf9c637:client/docs/Gameplay.mdc`.)*

**Backend domains built (M1–M9):**

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
- **`board/`** — pure shared tactical math (no Firestore/clock): axial/cube hex,
  hex-line paths, `OrbState`, `ShipPos`, `SolveIntercept`. Go↔TS contract is
  `/fixtures/board/cases.json` (golden test); M7's `lib/hex` asserts the same.
- **`fleet/`** (#0004, *implemented*) — the map-mover. One movement state
  (`coast|burn|docked`), `corporationId` from day one (dev-seeded through M8;
  **ownership real since M9** — spawn is the only fleet-minter now).
  `POST /v1/fleets/:id/orders|cancel`, `GET /v1/fleets/:id` (arrival resolved
  opportunistically on read — no scheduler). `SeedFleet` survives as spawn's
  placement primitive (the `/dev-seed` route retired at M9). Since
  M5 the burn order **commits through `action.Commit`** (`type:"burn"`); fleet
  still owns motion state (`BurnResolver` settles it at resolve). `activeActionId`
  carries the single-action slot.
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
  ship-and-hide). Scan is an action `type` on the #0005 dispatch: resolution
  mints `asOf: eta` observations (owner's inventory = the market's future input),
  tiers-up graph knowledge, populates per-feature board detail — a late-resolved
  scan yields the same snapshot. Board reads split into three bands (astronomical
  free / live inside the sensor union / remembered elsewhere, geometry live +
  activity frozen at `asOf`). Fleet reads carry **audience fog** (own fleets never
  fogged; a foreign fleet outside your live sensor union reads 404). Ambient-on-
  move reveals at movement resolution. Params in `observation/params.go`.
  M9 adds `RevealArrival` (the direct-write home/arrival reveal spawn uses).
- **`corporations/`** (#0009, *implemented*) — spawn & identity. The
  **Corporation** is the auth-account-linked player entity (the mind's lineage);
  fleets carry `corporationId`, the fog store keys on it. `Spawn(accountId, name)`
  orchestrates through the live galaxy/fleet/fog singletons: corp doc + account
  pointer commit in **one transaction** (`corporations/{corpId}` +
  `corpByAccount/{accountId}`, the uniqueness anchor), then the hull
  (`fleet.SeedFleet` at a rim-ring hex) + initial fog (`observation.RevealArrival`:
  home `explored`, onward lanes `rumored`) follow — **idempotent per account**
  heals a partial spawn. `POST /v1/corporations` (idempotent), `GET
  /v1/corporations/me`. Site selection (`siteselection.go`): mineable-skeleton ∧
  ≥`minSpawnDistance` graph-hops from living corps' explored sets ∧
  periphery-weighted, account-seeded pick (knobs in `params.go`, placeholder
  constants). **The ownership seam:** `middlewares.ResolveCorporation` resolves
  account→living-corp into `common.ActorCorp` (`CorpIdKey`), the one function
  every fogged read already keyed on. Death invariant (`diedAt` only at zero
  fleets) recorded + enforced; no slice path reaches it. Spawn is **instant**, not
  a #0005 action. Frontend: corpless → wake-up flow (name → spawn → galaxy).

**Next:** M10 mine (`backend/mine/` verb on the #0005 dispatch; fleet gains
`ships[]` + `cargo`) + the slice e2e — drill in → move → scan → mine → depart →
arrive → reveal → return → it persisted. Closes the loop.

- Core loop from the original design: players spawn colonies on a hex-grid
  galaxy (spaced 8–25 tiles apart), explore under fog of war (scan radius
  around units/bases), and compete over procedurally generated terrain
  (star-rich sectors, dead zones, galactic barriers as choke points).

## Project conventions

- Domain-specific patterns live in the per-directory CLAUDE.md files — keep
  them updated there, not here.
- New CRUD domains via `/new-domain`, not hand-rolled files.
- Run `/check` before commits; `terraform fmt` before committing infra.
- New project docs go in `docs/`.
