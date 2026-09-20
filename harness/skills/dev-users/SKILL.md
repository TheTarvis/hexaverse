---
name: dev-users
description: Create, find, list, delete and USE Firebase emulator users on the local dev or test cluster — get a backend bearer token, or sign the browser in through the dev-only /dev/login route without typing a password. Use when driving the running dev stack (curl, Chrome automation, seeding) needs an authenticated account, or when a read comes back 401 / "Couldn't load the galaxy".
---

# dev-users — emulator accounts on either local cluster

One CLI, shared with the Playwright auth setup, parameterised by cluster:

```bash
cd frontend
npm run users -- <ensure|find|list|delete|token|login-url> [--cluster dev|test] [--email E] [--password P] [--uid U] [--json]
```

| Cluster | Config | Auth / Firestore | Frontend / Backend | Default user |
|---|---|---|---|---|
| `dev` (default) | `firebase.json` | 20211 / 20212 | :20200 / :20201 | `dev@hexaverse.test` |
| `test` | `firebase.test.json` | 20241 / 20242 | :20230 / :20232 | `e2e@hexaverse.test` (Playwright's; wiped every e2e run) |

Ports are read from the two firebase JSON files at run time (`frontend/e2e/config/clusters.ts`), never copied. Both clusters run under project `hexaverse-emulator`. Emulator accounts are in-memory: an emulator restart (`/spinup`) forgets them — just `ensure` again.

## Commands

- `ensure` — create the emulator user if absent, idempotent; prints `created|exists <uid> <email>`.
- `bootstrap` — `ensure` **plus** the backend account document (`POST /v1/accounts`, the call the account provider makes on first sign-in). **Run this one first**: an emulator user with no account document has no actor on the backend — game reads come back corpless and spawn answers 403.
- `find --email E` / `find --uid U` — one user, exit 1 when absent.
- `list` — every user on the cluster (Google-provider dev identities show as `[google.com]`).
- `delete --uid U` (or `--email E`).
- `token` — an ID token for email+password. Use as `Authorization: Bearer <token>` against the cluster's backend.
- `login-url` — a one-shot `http://localhost:20200/dev/login#token=…` URL (by `--uid` or `--email`). Opening it signs the **browser** in as that user via an unsigned custom token the emulator accepts and real Firebase rejects. The route 404s outside development builds.

`--json` gives machine-readable output for scripting.

## Recipes

**Call the dev backend as a throwaway user**
```bash
cd frontend && npm run users -- bootstrap >/dev/null
TOKEN=$(npm run -s users -- token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:20201/v1/corporations/me
```
A fresh account has no corporation until `POST /v1/corporations {"name": …}` spawns one (or the wake-up flow in the UI does); spawn drops a full-fuel hull at a home system, which makes the throwaway user the right account for exercising burns.

**Sign the browser in (Chrome automation)**
```bash
cd frontend && npm run -s users -- login-url                 # default dev user
cd frontend && npm run -s users -- login-url --uid <uid>     # any existing user, e.g. Travis's Google-provider dev identity from `list`
```
Navigate to the printed URL; the page signs in and leaves by a full page load (so the previous user's cached account never leaks into the new session). No password is typed anywhere — this is the sanctioned way to get an authenticated Chrome session on the dev stack. To drive an account that already has a corporation, fleets and fog, `list` and pick the existing identity by uid rather than creating a new one.

**Seed the test cluster the way Playwright does**
```bash
cd frontend && npm run users -- ensure --cluster test
```
Same helper `auth.setup.ts` calls (`e2e/helpers/firebase-emulator.ts`), so the account is byte-identical to the suite's.

## Where the code lives

- `frontend/e2e/config/clusters.ts` — the cluster registry (ports from firebase JSON, stack origins, default users). `e2e/config/env.ts` derives Playwright's local defaults from its `test` entry.
- `frontend/e2e/helpers/firebase-emulator.ts` — ensure / signIn / find / list / delete / mint custom token. Admin calls use the emulator's literal `Bearer owner` shortcut.
- `frontend/e2e/cli/users.ts` — argument parsing and printing only.
- `frontend/app/dev/login/page.tsx` — the browser sign-in route (dev builds only).

## Failure signals

- `auth emulator is not reachable` — start the cluster: `npm run firebase:emulators` (dev) or `npm run firebase:emulators:test` at the repo root, or `/spinup` for everything.
- `401 Missing Authorization header` from the backend — you called it without `token`'s output.
- `/dev/login` shows `Sign-in failed: auth/invalid-custom-token` — the frontend is not connected to the emulator (it only is under `NODE_ENV=development`), or the token's uid was deleted.
