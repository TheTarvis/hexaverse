# CLAUDE.md

> ## IMPORTANT — first-run setup
>
> **This CLAUDE.md is in template state.** Before doing any other substantive
> work in this repo, drive a short discovery conversation with the user to
> define the project. Then fill in the empty sections below and **delete this
> entire blockquote** (the lines starting with `>`).
>
> Ask open questions, capture the user's phrasing, don't over-polish. Cover:
>
> 1. **Purpose** — what is this project, who's it for, what does success look
>    like? What's the smallest version that would feel useful?
> 2. **User profile** — who's building it (role, relevant background), what
>    constraints matter (time, budget, deploy targets), what's deliberately
>    out of scope.
> 3. **Domain quick-reference** — any mental models, jargon, or recurring
>    facts that future agents should always have loaded.
> 4. **Project conventions** — anything project-specific about how to
>    organize files, what to default to, what to avoid.
>
> Skip the conversation only if the user explicitly says to ("just leave it
> for now"). Otherwise, treat this as a blocker — don't write features
> against an undefined project.

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Stack

- **Frontend**: Next.js on Vercel, Firebase Auth, vitest for tests.
- **Backend**: Go (1.24+) on Cloud Run.
- **Database**: Firestore (Firebase emulator for local dev).
- **Infra**: Terraform in `infra/`.
- **Environments**: one GCP project per environment (`GCP_PROJECT_DEV`,
  `GCP_PROJECT_PROD`).

## Repo layout

- `frontend/` — Next.js app.
- `backend/` — Go service. `make run` for local.
- `bootstrap/` — fork-time setup. `config.env` + `init.sh` substitute
  `{{PROJECT_NAME}}` etc. across the repo and write `frontend/.env.local`.
- `infra/terraform/` — GCP resources.
- `firebase.json`, `firebase.test.json` — emulator and deploy config.
- `docs/` — project docs.

## Bootstrap & onboarding

After forking:

1. `cp bootstrap/config.example.env bootstrap/config.env` and fill in values.
2. `bash bootstrap/init.sh` — substitutes placeholders, writes
   `frontend/.env.local`.
3. Run `/onboard` — probes prereqs, auth, build, tests; writes a personal
   `onboarding_checklist.md` (gitignored). Re-runnable.

Local dev loop (three terminals):

```bash
# 1. Firebase emulators
firebase emulators:start --only firestore,auth,pubsub --config firebase.test.json

# 2. Backend
cd backend && make run

# 3. Frontend
cd frontend && npm run dev
```

## Purpose

<!-- Fill in during first-run setup. What this project is, who it's for,
     what the smallest useful version looks like. -->

## User profile

<!-- Fill in during first-run setup. Who's building it, relevant background,
     constraints, anti-goals. -->

## Domain quick-reference

<!-- Fill in during first-run setup. Mental models, jargon, recurring facts
     that should always be loaded. Delete this section if not applicable. -->

## Project conventions

<!-- Fill in during first-run setup. Project-specific defaults: where to put
     what, what to favor, what to avoid. -->