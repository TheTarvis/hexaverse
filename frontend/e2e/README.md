# Frontend E2E (Playwright)

Browser E2E for the frontend. Runs against an **isolated local test stack** by
default — never your dev servers or dev emulators — so a suite run can't corrupt
the data you use day to day.

## TL;DR — run it locally

```bash
cd frontend && npm run e2e         # that's it — no emulator to start first
```

`npm run e2e` (and `e2e:headed`) auto-manage the test emulator via
`scripts/dev/with-test-emulators.sh`: if one is already running it reuses it,
otherwise it starts a **throwaway** set for the run and tears it down after. Same
for the backend Go suites (`npm run test:backend:e2e` etc. from the repo root) — no
more "forgot to start the emulator."

You do **not** need your dev frontend (`:3010`) or dev backend (`:9010`) — the suite
boots its own on separate ports.

**Optional (faster iteration):** keep a persistent emulator running and every run
will reuse it instead of cold-starting one:

```bash
npm run firebase:emulators:test    # repo root — auth :10109, firestore :9100, pubsub :9106
```

The `--project hexaverse-emulator` flag that script passes is what pins the
token audience the suite relies on (see the shared-project note below).
`npm run e2e:ui` is the one command that does **not** auto-start an emulator
(interactive mode) — have one running for it.

## When it runs, and what a spec is

This suite is **tier 4** in `docs/testing-tiers.md`: it runs once per change at
archive time, never as a per-task check and never as a confirming rerun. A
change contributes **one journey spec** that walks its whole slice in order and
asserts at every step; per-scenario and edge-case coverage lives in vitest.
Fixtures are provisioned once per spec file (`test.beforeAll`), not per test.
Retries are zero locally (two in CI) so a hung test fails in one minute. Never
raise a timeout to get a run green — report the overrun instead.

## What a run does

`playwright.config.ts` + `e2e/setup/` wire up a self-contained stack:

0. **Emulator wrapper** (`scripts/dev/with-test-emulators.sh`, invoked by the
   `e2e` npm script): reuses a running test emulator or starts a throwaway one for
   the duration of the run.
1. **`globalSetup`** (`e2e/setup/global-setup.ts` → `backend-stack.ts`):
   - Verifies the test emulators are reachable (clear error if run raw via
     `npx playwright test` without an emulator up).
   - **Wipes** the emulator project's Firestore + Auth (REST clear endpoints) so the
     long-lived local emulator doesn't accumulate data across runs.
   - Builds and starts the `ENV=test` backend binary on **`:9012`** (rate limiting
     off, pointed at the test emulators). Kills any leftover from a prior run first,
     so you never reuse stale data or stale code.
2. **`webServer`**: Playwright boots its **own** Next.js frontend on **`:3110`**,
   into its **own build dir** (`.next-e2e`) so it can't clobber your dev server's
   `.next`.
3. **`setup` project** (`auth.setup.ts`): seeds the test user in the auth emulator,
   logs in through the real UI, and writes `playwright/.auth/` state the specs reuse.
4. **specs** run; **`globalTeardown`** stops the backend it started.

### The stack at a glance

| Piece | Local (default) | Your dev stack (untouched) |
|---|---|---|
| Frontend | `:3110` (`.next-e2e`) | `:3010` |
| Backend | `:9012` (`ENV=test`) | `:9010` |
| Emulators | firebase.test.json — auth `:10109`, firestore `:9100` | firebase.json — auth `:9109`, firestore `:8090` |
| Firebase project | `hexaverse-emulator` (wiped each run) | your dev project |

### Shared emulator project

The auth emulator mints every token with `aud=<the --project flag>`, so the
Playwright suite and the backend Go integration suite must share one project id
(`hexaverse-emulator`) — isolation comes from the per-run wipe plus serial
execution, not separate namespaces. Don't run both suites concurrently in separate
terminals against a persistent emulator.

### The wipe clears the Go e2e suite's galaxy — and the failure looks like a code bug

The consequence of sharing one project, stated as a symptom because that is how
you will meet it. `globalSetup` wipes the emulator project's Firestore
(`setup/backend-stack.ts:83`, `wipeProject`), and **nothing reseeds a galaxy
afterward**. The backend Go e2e suite (`cd backend && ENV=TEST go test .`) has an
undocumented precondition: the emulator must hold a **live galaxy pointer**.

So after any Playwright run — or any manual Firestore wipe — the backend Go e2e
suite fails **fast and wholesale**: all ~30 tests error with `no live galaxy`,
and `POST /v1/corporations` returns `500`. It reads exactly like a code
regression, and it is not one. Recovery is one command:

```bash
cd backend && ENV=TEST go run ./cmd/seed
```

`backend-stack.ts:81` already warns not to run the two suites concurrently; this
is the same hazard **sequentially**, which is easier to trip and gives no
warning at all.

### The Go e2e suite gets slower the dirtier the emulator gets

Also worth knowing before you conclude the suite has hung. The backend e2e
package's runtime scales with **accumulated** emulator state, not with the code
under test:

| Emulator state | Per test | Whole package (~30 tests) |
|---|---|---|
| Freshly seeded | ~0.5–3s | ~60s |
| Dirty (many prior runs) | ~70s | ~36 min |

The likely cause is spawn site selection: `corporations.Spawn` must find a home
at least `minSpawnDistance` graph-hops from **living** corps' explored sets, and
leftover corps from earlier runs push that search outward, materializing more
galaxy blocks on each attempt. Nothing in the suite prunes them. If the backend
e2e suite starts crawling, wipe and reseed rather than waiting it out.

## Targeting deployed environments

Set `E2E_ENV=dev` (or `prod`) plus `E2E_BASE_URL`, `E2E_API_URL`,
`E2E_USER_EMAIL`, `E2E_USER_PASSWORD` — real Firebase Auth with a dedicated test
account, no emulator, no locally-booted stack. If the deployment sits behind
Vercel Deployment Protection, also set `VERCEL_AUTOMATION_BYPASS_SECRET` (see
`vercelBypassQuery` in `e2e/config/env.ts` for why it's a query param, not a
header).

## Layout

```
e2e/
├── cli/users.ts         # `npm run users` — ensure/find/list/delete/token/login-url on either cluster
├── config/clusters.ts   # the dev + test emulator clusters (ports read from firebase*.json)
├── config/env.ts        # E2E_ENV resolution (local | dev | prod), ports, test user
├── helpers/             # emulator REST helpers (signUp / signIn / lookup / custom token)
├── setup/               # globalSetup/teardown, backend lifecycle, auth.setup
└── tests/               # *.spec.ts — start from smoke.spec.ts
```

The same helpers drive the **dev** stack too: `npm run users -- ensure` seeds
`dev@hexaverse.test` on the dev emulator, `-- token` gets a bearer token for
`:9010`, and `-- login-url` prints a one-shot `/dev/login#token=…` URL that
signs a browser in without a password (see `.claude/skills/dev-users/`).

Conventions for new specs:

- Assert on `data-testid` attributes, not text or CSS classes.
- Specs run with the shared `storageState` (already logged in). Don't re-login.
- Seed/clean data through the backend API (grab a token via
  `helpers/firebase-emulator.ts` → `emulatorSignIn`), not by poking Firestore.
