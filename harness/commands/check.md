# description: Run code quality checks on changed files or full test/lint suites

Run automated code quality validation on files that have been modified, or run full test/lint suites.

**Usage:**
- `/check` - The per-commit gate (file checks + lint + unit tests). Never boots a stack: the full backend emulator suite and Playwright are `--backend-tests` / `--e2e` only, run once per change at archive time (`docs/testing-tiers.md`)
- `/check --files-only` - Check only changed files, skip test/lint suites
- `/check --all ./frontend/components` - Check all files in a directory
- `/check --base main` - Check files changed since main branch
- `/check --lint` - Run ONLY frontend linting (ESLint + TypeScript)
- `/check --frontend-tests` - Run ONLY frontend tests (Vitest)
- `/check --e2e` - Run ONLY the Playwright journey (tier 4; `npm run e2e` auto-starts a test emulator if none is running and boots its own isolated frontend/backend). Explicit only — never part of the default run
- `/check --backend-tests` - Run ONLY the full backend emulator suite (tier 3; gotestsum via the test-emulator wrapper, with a `-timeout` budget that is never raised). Explicit only — the default run uses `go test -short`
- `/check --agent-tests` - Run ONLY agent/Python tests (pytest via uv)
- `/check --agent-lint` - Run ONLY agent/Python linting (ruff + pyright via uv)
- `/check --npm-audit` - Run ONLY npm audit on frontend prod deps (mirrors CI)
- `/check --govulncheck` - Run ONLY govulncheck on the backend Go module (mirrors CI)
- `/check --run-all` - Explicitly run the per-commit gate (same as default `/check`; still excludes `--backend-tests` and `--e2e`)
- `/check --fast` - Skip the Python harness; run the minimal bash gate instead (`bash harness/check.sh` — go vet, go test -short, tsc, ESLint, vitest; ~15-30s)

## Steps

1. **Verify onboarding is complete.** Read `onboarding_checklist.md` (repo root, gitignored).
   - If the file does **not** exist: stop and tell the user to run `/onboard` first — the checks will fail without a bootstrapped repo.
   - If it exists, scan the **Bootstrap** section for unchecked items (`- [ ]`). If any are unchecked, stop and report which ones, then tell the user to either:
     - finish bootstrap (`cp bootstrap/config.example.env bootstrap/config.env`, fill it in, `bash bootstrap/init.sh`), or
     - re-run `/onboard` to refresh the checklist if they believe bootstrap is already done.
   - Unchecked items in **Prerequisites**, **Dependencies & Build**, or **Cloud Authentication** are warnings — surface them in one line but proceed.
   - Skip this step only if the user passes `--skip-onboarding-check`.
2. Verify prereqs: `command -v go`, `command -v node`, and `frontend/node_modules` exists (otherwise tell the user to `cd frontend && npm install`).
3. Run the check harness: `python3 harness/skills/code-quality-checks/check.py [arguments]`
   (for `--fast`, run `bash harness/check.sh` instead — it accepts `--backend --frontend --lint --test --keep-going`)
4. Monitor the output for pass/fail results.
5. Report:
   - If everything passed: a one-line confirmation.
   - If checks fail, summarize the issues and suggest fixes (the failing step name, the first ~10 lines of its output, and the command to re-run that single step).
   - If the failure looks like an unsubstituted `{{PLACEHOLDER}}` (e.g. `go.mod:1: usage: module module/path`), say so explicitly and point the user at `bash bootstrap/init.sh`.

The harness automatically:
- **DEFAULT BEHAVIOR**: runs the per-commit gate (file validation + lint + unit tests) when no flags are specified; stack-booting suites only on their explicit flags
- Detects changed files via git (staged, unstaged, untracked)
- Filters files by type (e.g., only frontend .tsx files for data-testid checks)
- Reports detailed results with actionable error messages
- Exits with code 1 if any checks fail (suitable for CI integration)

Current validators (details in `harness/skills/code-quality-checks/skill.md`):
- **data-testid**: React components with interactive elements need test IDs
- **backend-tests**: backend Go files need corresponding test files (handler.go → handler_test.go)
- **backend-params**: use `backend/common/params.go` helpers instead of `c.Param("...")` string literals
- **frontend-tests**: frontend TS/TSX files need corresponding test files
- **raw-fetch**: service files must use `apiClient` instead of raw `fetch()`
- **python-tests**: claude-agent src files need corresponding pytest files
- **color-compliance**: zinc palette + dark-mode variants per frontend/CLAUDE.md (add `--semantic` for AI review of gradient/contrast issues)
- **frontend-lint / frontend-tests / frontend-e2e / backend-tests-suite / agent-lint / agent-tests / npm-audit / govulncheck**: full suites, per the flags above
