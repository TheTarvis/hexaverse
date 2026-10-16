# Hexaverse

Hexaverse is a multiplayer space game in a procedurally generated galaxy.
Players control fleets, explore under fog of war, mine resources and trade at
stations. The simulation advances asynchronously on a server-authoritative
world clock. Local 3D views use WebGPU.

## Sources of truth

Code and tests describe implemented behavior. `GLOSSARY.md` defines domain
terms. Start with `docs/README.md` for canonical domain owners and authority.
Before station, travel, sensing, combat, fleet, world, economy, discovery or
async-action changes, read the relevant `docs/domains/` page linked there.
Before HUD layout, mobile interaction or travel-card work, read `docs/hud.md`;
before model/material/effect work, read `docs/art-direction.md`.
`docs/game-architecture.md` locates code but includes historical milestones.
`docs/specs/` and `docs/plans/` preserve history, not an active backlog.
Scratch is ephemeral WIP, never gameplay authority; preserve accepted canonical
decisions and referenced evidence before pruning completed implementation work.
The old implementation is archived
at `archive/pre-volt-reset` and commit `bf9c637`.

## Game conventions

- Domain code uses `common.WorldClock()` and `WorldMillis`; inject time in tests.
- Go owns continuous-space physics. The sole Go/TypeScript rule mirror is
  `backend/market` and `frontend/lib/market`, pinned by shared fixtures.
  `fixtures/determinism-register.json` records the other packages' ownership.
- Corporations are player identities, linked to Firebase accounts. Ownership
  and fog filtering happen on the server; foreign fleets outside coverage
  read as absent. Handlers use `middlewares.ResolveCorporation`.
- Action verbs use `action.Commit` and registered resolvers. Movement and
  sensors have separate single-slot channels. Instant verbs such as spawn
  and sell keep their existing transactional behavior.
- Handlers call services, services own their DAOs; cross-domain calls go
  through services. Frontend components use hooks, services and `apiClient`.

## Stack and layout

- `frontend/`: Next.js, TypeScript, Tailwind, Catalyst, Firebase Auth and React
  Query. Read `frontend/CLAUDE.md` before frontend changes.
- `backend/`: Go, Gin, Firestore, Pub/Sub and SSE. Read `backend/CLAUDE.md`.
- `claude-agent/`: Python agent service; see `claude-agent/CLAUDE.md`.
- `infra/`: Terraform and GitLab CI; see `infra/CLAUDE.md`.
- `bootstrap/`: project configuration; see `bootstrap/README.md`.
- `scripts/dev/`: emulator wrappers and admin helpers. For emulator users,
  run `cd frontend && npm run users -- …`.
- `harness/skills/`: unmodified published Matt Pocock skills and local `spinup`,
  shared through `.claude/skills` and `.agents/skills`.
- `harness/utilities/`: standalone onboarding, scaffolding and check commands.

## Development

Run root commands from the repository root. `npm run install:all` installs
service dependencies. Start `npm run firebase:emulators`, `npm run dev:backend`
and `npm run dev:frontend` in separate terminals; `npm run dev:agent` starts
the agent service. Invoke `spinup` to restart these services in GoLand Run tabs.
Test runners own the test emulators' lifecycle.

Ports derive from `ports.env` through `harness/ports.py`; `npm run ports` shows
the current lane. `bash harness/check.sh` runs backend/frontend static and
unit checks. `docs/testing-tiers.md` lists test commands and emulator constraints.
After editing a file, run `bash harness/validate-file.sh <path>`.
For CRUD scaffolding, run `python3 harness/utilities/new-domain/new_domain.py
<singular> [plural]` and apply its printed wiring steps.

Dev GCP project: `hexaverse-game-dev`; prod: `hexaverse`, with domain
`hexaverse.io`. The prod project still includes pre-Volt resources. Read
`scripts/decommission-old-hexaverse.sh` before any legacy-resource cleanup.

## Agent skills

- Issue tracker: local Markdown under `.scratch/`; see
  `docs/agents/issue-tracker.md`.
- Triage labels: upstream defaults; see `docs/agents/triage-labels.md`.
- Domain docs: root `GLOSSARY.md` and, when warranted, `docs/adr/`; see
  `docs/agents/domain.md`.
- Object art: before designing or revising manufactured models, materials or
  effects, read `docs/art-direction.md` for shared style profiles and revision tracking.

Use the imported workflows as shipped. Keep project configuration outside the
imported skills. `harness/README.md` documents provenance, integrity checks and
explicit upstream updates. New work uses these workflows; the OpenSpec team,
its handoffs and archive gates have been retired.
