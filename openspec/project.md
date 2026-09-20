# Project Context

## Purpose
Hexaverse is a multiplayer space-colonization game on a procedurally
generated hex-grid galaxy — fog of war, colonies, resource tiles, real-time
interaction between players. This repo is the 2026-07-01 rebuild on the Volt
platform skeleton. See `/Users/travis/Projects/hexaverse/CLAUDE.md` for the
full picture; this file exists for the OpenSpec tooling.

## Tech Stack
- Frontend: Next.js 15 (App Router), React 19, TypeScript, Tailwind v4,
  Catalyst UI, React Query, Firebase Auth, vitest, Playwright. Deployed on
  Vercel.
- Backend: Go 1.26 + Gin on Cloud Run. Firestore, Pub/Sub, SSE realtime.
- Agent: `claude-agent/` — Python 3.12+ / FastAPI Claude tool-calling agent
  on Cloud Run; streams SSE to the frontend, calls the Go backend with the
  user's own Firebase token (token passthrough).
- Database: Firestore (Firebase emulator for local dev).
- Infra: Terraform in `infra/`. CI/CD via GitLab.

## Project Conventions
- Backend: strictly layered handler -> service -> DAO per domain package
  (`backend/<domain>/`); sentinel errors; events published through
  `backend/common/pubsub.go`. See `backend/CLAUDE.md`.
- Frontend: strictly layered component -> hook -> service -> apiClient;
  query-key factory; Catalyst-only UI; color system. See
  `frontend/CLAUDE.md`.
- Domain design specs (pre-implementation, may drift from code) live in
  `docs/specs/0001-0011-*.md`. OpenSpec baselines in `openspec/specs/`
  document what the code actually does today — code is the source of truth
  when they disagree.
- New CRUD domains scaffolded via `/new-domain`, not hand-rolled.

## How to run
- Quality gate: `python3 .claude/skills/code-quality-checks/check.py` or
  `bash harness/check.sh`.
- Backend (`cd backend`): `make run` (localhost:20201), `make test`
  (`go test -short ./...`), `make generate` (regen DAO mocks).
- Frontend (`cd frontend`): `npm run dev` (localhost:20200), `npm run lint`,
  `npx vitest run`, `cd frontend && npm run e2e` (Playwright, isolated
  stack).
- Claude agent (`cd claude-agent`): `uv sync && uv run python -m src.main`
  (:20202), `uv run pytest`, `uv run ruff check src tests && uv run pyright
  src`.
- Full local loop: Firebase emulators (`npm run firebase:emulators`),
  backend (`npm run dev:backend`), frontend (`npm run dev:frontend`), or
  `npm run dev` for frontend+backend concurrently.
