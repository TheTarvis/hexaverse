# Hexaverse

A multiplayer space game with exploration, fog of war, fleet movement, mining
and trading in a procedurally generated galaxy.

## Local development

Install dependencies with `npm install` and `npm run install:all`. See
[`bootstrap/README.md`](bootstrap/README.md) for configuration. Start these
commands in separate terminals from the repository root:

```bash
npm run firebase:emulators
npm run dev:backend
npm run dev:frontend
```

`npm run dev:agent` starts the agent service. `npm run ports` shows the current
port lane. The shared `spinup` skill restarts dev services in GoLand Run tabs.

## Project guidance

- [`CLAUDE.md`](CLAUDE.md): project conventions and development.
- [`GLOSSARY.md`](GLOSSARY.md): game domain vocabulary.
- [`docs/game-architecture.md`](docs/game-architecture.md): cross-domain reference.
- [`backend/CLAUDE.md`](backend/CLAUDE.md) and
  [`frontend/CLAUDE.md`](frontend/CLAUDE.md): service conventions.
- [`infra/CLAUDE.md`](infra/CLAUDE.md): infrastructure and deployment.
- [`docs/testing-tiers.md`](docs/testing-tiers.md): test commands and dependencies.
- [`harness/README.md`](harness/README.md): Matt Pocock skills and local tools.

## Adding a domain

```bash
python3 harness/utilities/new-domain/new_domain.py widget
```

Apply the printed backend and frontend wiring steps before building.
