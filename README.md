# {{PROJECT_NAME}}

Authenticated full-stack starter on GCP.

- **Frontend**: Next.js 15 + TypeScript + Tailwind v4 + Catalyst UI, deployed on Vercel.
- **Backend**: Go 1.24+ on Cloud Run, Gin + Firestore + Pub/Sub.
- **Auth**: Firebase (email/password + Google SSO).
- **Realtime**: SSE channels backed by Pub/Sub.
- **Infra**: Terraform-managed GCP.
- **CI/CD**: GitLab pipeline (dev → prod with manual promotion).

## Quick start

```bash
git clone <your-repo> myproject && cd myproject
/onboard                           # in Claude Code
```

`/onboard` walks the rest of the way: drives the CLAUDE.md discovery conversation, asks for the values it needs, runs `gcloud projects create` + `firebase projects:addfirebase` + `firebase apps:sdkconfig` to provision dev and prod GCP/Firebase projects end-to-end, writes the SDK config back into `bootstrap/config.env`, runs `bootstrap/init.sh`, and finishes with a probe that updates `onboarding_checklist.md`.

You'll need to run `! gcloud auth login` and `! firebase login` interactively when prompted (browser flows). See [`bootstrap/README.md`](bootstrap/README.md) for the manual path if you'd rather drive the CLI yourself.

After bootstrap:

```bash
cd backend && go mod tidy && cd -
cd frontend && npm install && cd -
```

## Local dev loop

Three terminals:

```bash
# Terminal 1 — Firebase emulators (Firestore, Auth, Pub/Sub)
firebase emulators:start --only firestore,auth,pubsub --config firebase.test.json

# Terminal 2 — backend
cd backend && make run                # localhost:9000

# Terminal 3 — frontend
cd frontend && npm run dev                 # localhost:3000
```

## Where to look

| Question | File |
|---|---|
| Project orientation, tech stack, conventions | [`CLAUDE.md`](CLAUDE.md) |
| Backend patterns (handler/service/DAO, events, testing) | [`backend/CLAUDE.md`](backend/CLAUDE.md) |
| Frontend patterns (React Query, Catalyst, apiClient, styling) | [`frontend/CLAUDE.md`](frontend/CLAUDE.md) |
| Infra patterns (Terraform, CI/CD, Pub/Sub, secrets) | [`infra/CLAUDE.md`](infra/CLAUDE.md) |
| Bootstrap script + per-project values | [`bootstrap/README.md`](bootstrap/README.md) |
| Onboarding probe | [`.claude/skills/onboard/SKILL.md`](.claude/skills/onboard/SKILL.md) |

## Adding a domain

```
/new-domain widget
```

Renders the templates at `.claude/skills/new-domain/templates/` into a new domain — backend handler/service/DAO + frontend types/service/hook/page — and prints the wiring snippets to add to `router.go`, `common/pubsub.go`, `query-keys.ts`, and `services/index.ts`. Edit the templates if you want a different default shape.

## License

Pick one — this skeleton ships without a `LICENSE` file so you can choose.
