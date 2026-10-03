# Security re-audit — covers add-vitals-strip AND fix-world-time-render-loop, commit range 3dc56da..HEAD (production code and config only)

Persisted verbatim by the orchestrator, 2026-10-03, from the `openspec-security`
agent's returned report (the role is read-only). HEAD at audit time: `592df53`.
Requested under `add-vitals-strip-rulings.md` FULL-AUTO RULING 53. The prior
audits (`add-vitals-strip-security-audit.md`,
`fix-world-time-render-loop-security-audit.md`) stand and were not redone.

**Verdict: CLEAR.** No BLOCKER, MAJOR or MINOR in `git diff 3dc56da..HEAD` over
production code and config. Both prior audits stand.

## Scope

Seven commits are in range. Only four touch production code or config;
`3a7b9b3`, `2e6ea87` and `592df53` touch none under `backend/`, `frontend/`,
`claude-agent/` or `infra/`.

- **`1424a77`**: `backend/common/tuning.go`, `backend/config/config.go`,
  `backend/go.mod` and `go.sum`, `frontend/components/space/SystemSpaceView.tsx`,
  `frontend/lib/client-clock/index.ts`, `frontend/package-lock.json`.
- **`ad74811`**: gofmt only, across `backend/account/{dao,handler}.go`,
  `backend/common/{firestore,secret_manager,worldtime}.go`,
  `backend/config/config.go`, `backend/middlewares/firebase_jwt.go`,
  `firebase_jwt_query_param.go`, `backend/sse/handler.go`.
- **`2baf73b`**: `backend/router.go`, `backend/.env*.example`, `backend/Makefile`,
  `backend/docker-compose.yml`, `claude-agent/src/config.py`,
  `claude-agent/src/middleware/auth.py`, `claude-agent/.env.example`,
  `frontend/lib/firebase.ts`, `frontend/package.json`, `firebase.json`,
  `firebase.test.json`, `ports.env`, `.gitlab-ci.yml`, `bootstrap/*`,
  `scripts/dev/*`, root `package.json`.
- **`f179757`**: comment-path edits only in `backend/fleet/{handler,service}.go`,
  `frontend/lib/format/figures.ts`, `frontend/next.config.ts`.

## Answers to the audit questions

1. **CORS / allowed origins: narrowed, not widened.**
   - `backend/router.go:54-55` goes from three localhost origins (`:3010`,
     `:3011`, `:3110`) to two (`:20200`, `:20230`), still inside
     `if config.IsLocal()`.
   - Outside local, `AllowOrigins` is still the empty list. `AllowCredentials`,
     headers and methods are untouched.
   - `claude-agent/src/config.py:17` changes only the default's port
     (`localhost:3010` to `localhost:20200`). It is still one localhost origin,
     overridden by `CORS_ALLOWED_ORIGINS`.

2. **Token verification and emulator-vs-production gating: unchanged.**
   - The hunks in `backend/middlewares/firebase_jwt.go`,
     `firebase_jwt_query_param.go` and `backend/sse/handler.go` are import
     reordering only (4, 2 and 2 lines). No verification logic moved.
   - `claude-agent/src/middleware/auth.py` is a docstring port change.
   - `frontend/lib/firebase.ts:35` still gates the emulator connection on
     `NODE_ENV === 'development'`; only the default ports changed.
   - `config.IsLocal()` (`backend/config/config.go:158-170`) is untouched.
   - `firebase.json` and `firebase.test.json` change port numbers only; the
     `0.0.0.0` emulator binds were already there.

3. **`LANE_MS_PER_DISTANCE`: not reachable by a request, and defaults to inert.**
   - The flag defaults to `0` at `backend/config/config.go:152`. The `init` at
     `backend/common/tuning.go:151-157` applies it only when `v > 0`, so unset,
     zero, negative or NaN all leave `DefaultTuning()`'s 2500.
   - It is read once at process start from env or flag. No handler or request
     field reaches it.
   - The only place that sets it is `frontend/e2e/setup/backend-stack.ts:181`,
     under `ENV: 'test'`. It appears nowhere in `infra/terraform/cloudrun.tf`,
     `.gitlab-ci.yml` or the `.env*.example` files.
   - The knob has no `ENV` guard, the same as the existing `WORLD_TIME_SCALE`.
     Anyone who can set Cloud Run env can already do far worse, so it is not
     raised as a finding. It prices travel time only; market pricing does not
     read it.

4. **Controls the prior audits relied on: intact.**
   - `rosterFieldsFor` at `backend/fleet/handler.go:697-700` still returns `nil`
     when `!own`. The only fleet hunks in range are comment-path edits.
   - `wallMsUntil` (`frontend/lib/client-clock/index.ts`) and its two call sites
     in `SystemSpaceView.tsx` (the scan-sweep watcher and the arrival resync
     timer) only convert a refetch delay from world to wall milliseconds.
     - It is clamped to `>= 0` and falls back to scale 1 on a non-finite or
       non-positive scale.
     - It adds no data, DOM sink, `data-*` stamp or visibility decision, and
       timer cleanup is unchanged.
     - A hostile served scale could at worst shorten the client's own refetch
       delay to the existing cushion.

5. **Dependencies: no downgrade, no newly introduced vulnerable version.**
   - **Go:** every changed line in `backend/go.mod` moves upward (e.g. firestore
     1.18.0 to 1.21.0, grpc 1.82.1 to 1.83.1, `cloud.google.com/go/auth` 0.16.4
     to 0.18.2).
   - **npm:** `frontend/package.json` changed only the `dev` and `start`
     scripts. The lockfile has zero downgrades (compared programmatically), one
     addition (`@humanfs/types`, a lint-chain transitive) and 16 removals.
     `next` goes 15.5.22 to 15.5.25.
   - **`govulncheck ./...`** reports one reachable advisory, GO-2026-6505 in
     `go.opentelemetry.io/otel/sdk@v1.44.0` (fixed in 1.45.0). That version is
     the same at `3dc56da`, and no OTLP exporter is imported, so it predates
     this diff.
   - **`npm audit --omit=dev`** reports 5 (4 high via `@grpc/grpc-js@1.9.16`
     under `firebase@12.15.0`, 1 low `dompurify@3.4.13`). All three versions are
     identical at `3dc56da`. `dompurify` is not imported anywhere in frontend
     source.

## Findings

- BLOCKER: none
- MAJOR: none
- MINOR: none

## Outside this diff, for the user

- The three pre-existing advisories above remain open: `otel/sdk` to 1.45.0,
  `npm audit fix` for `dompurify`, and the `@grpc/grpc-js` chain under
  `firebase`.
- `frontend/package.json`'s `start` script now sources `../.ports.env`, which is
  gitignored and generated. Vercel does not run `npm start`, so this is an
  availability footnote for any other host, not a security issue.

No stack was booted and nothing was edited or committed.

CLEAR
