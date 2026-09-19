---
name: code-quality-checks
description: Run the project code quality checks for changed files or specified directories. Use for quality gates, pre-commit validation, or requests to run project checks.
---

# Code Quality Checks

Runs automated code quality checks against changed files or specified directories.

## What This Skill Does

This skill provides automated validation of code quality standards by:
1. Detecting files changed since HEAD (staged, unstaged, and untracked)
2. Running validation scripts against the changed files
3. Reporting detailed results with pass/fail status
4. Supporting directory override to check all files in a specific location

## Current Checks

### File-Based Checks

#### 1. Data-testid Attributes
- **What**: Verifies that React components include `data-testid` attributes for testing
- **Scope**: Frontend TypeScript/TSX files
- **Script**: `.claude/scripts/check-datatestid.sh`
- **Purpose**: Ensures all interactive elements are testable (unit tests + Playwright e2e)
- **Policy**: blocks only when a component renders interactive elements but has *zero* data-testid attributes; partial coverage passes

#### 2. Backend Test Coverage
- **What**: Verifies that backend Go files have corresponding test files
- **Scope**: Backend Go files (handler.go, service.go, dao.go, subscriptions.go, etc.)
- **Script**: `.claude/scripts/check-backend-tests.sh`
- **Required Pattern**: `filename.go` → `filename_test.go` in same directory
- **Exclusions**: main.go, router.go, `*_test.go`, `*_mock.go`, config.go, params.go, test helpers
- **Smart Logic**: model.go files ARE checked if they contain standalone functions (skipped when they only hold structs/constants)

#### 3. Backend Param Helpers
- **What**: Flags string literals in `c.Param("...")` / `c.Query("...")` calls
- **Script**: `.claude/scripts/check-backend-params.sh`
- **Fix**: use constants or the helper functions in `backend/common/params.go`

#### 4. Frontend Test Coverage
- **What**: Verifies frontend TS/TSX files have corresponding `.test.*` files
- **Script**: `.claude/scripts/check-frontend-tests.sh`
- **Exclusions**: Catalyst components, types, index/layout/provider/context files, configs, Next.js special files

#### 5. Raw fetch() in Services
- **What**: Ensures `frontend/lib/services/` files use `apiClient` instead of raw `fetch()` (token refresh + 401 retry)
- **Script**: `.claude/scripts/check-raw-fetch.sh`

#### 6. Python Test Coverage
- **What**: Verifies `claude-agent/src/` Python files have corresponding tests in `claude-agent/tests/`
- **Script**: `.claude/scripts/check-python-tests.sh`

#### 7. Color Compliance
- **What**: Validates frontend files follow the color system documented in `frontend/CLAUDE.md`
- **Scope**: Frontend TypeScript/TSX files (excludes catalyst/, test/story files)
- **Script**: `.claude/scripts/check-color-compliance.py`
- **Errors** (blocking):
  - Using gray/slate/neutral scale instead of zinc
  - `dark:bg-zinc-900` for page backgrounds (should be zinc-700)
- **Warnings** (non-blocking):
  - `dark:bg-zinc-800` backgrounds (not in palette)
  - Hard-coded hex colors in inline styles (no dark mode support)
  - Missing dark mode variants for text/bg/border classes
  - `bg-black` usage
- `--semantic` adds AI review (claude CLI + haiku) for violations regex can't catch (gradients on non-icon elements, contrast issues)

### Suite-Based Checks

#### 8. Frontend Lint — `--lint`
`cd frontend && npm run lint` (ESLint + tsc)

#### 9. Frontend Tests — `--frontend-tests`
`cd frontend && npx vitest run`

#### 10. Frontend E2E — `--e2e` (tier 4, explicit only)
`cd frontend && npm run e2e` (Playwright; routes through `scripts/dev/with-test-emulators.sh`, which reuses a running test emulator or cold-starts a throwaway one, then boots the suite's own isolated frontend/backend). **Never part of `--run-all`/default**, even when a test emulator is listening — the journey runs once per change at archive time (`docs/testing-tiers.md`).

#### 11. Backend Tests — default vs `--backend-tests`
- Default / `--run-all`: `go vet ./...` + `go test -short -count=1 ./...` (tier 1; emulator tests skip under `-short`; seconds).
- `--backend-tests` (tier 3, explicit only): generates mocks (`go generate ./...`), then `npm run test:backend:all` (gotestsum, the full emulator suite with a `-timeout` budget; minutes, grows with every test). Once per change, at archive time.

#### 12. Agent Lint / Tests — `--agent-lint` / `--agent-tests`
`uv run ruff check` + `ruff format --check` + `pyright` / `uv run pytest tests/ -v` in `claude-agent/`

#### 13. npm audit — `--npm-audit`
`cd frontend && npm audit --omit=dev --audit-level=high` (CI mirror; fails on high/critical prod-dep vulnerabilities)

#### 14. govulncheck — `--govulncheck`
`cd backend && govulncheck ./...` (CI mirror; auto-installs govulncheck if missing)

## Usage

```
python3 .claude/skills/code-quality-checks/check.py               # everything (default = --run-all)
python3 .claude/skills/code-quality-checks/check.py --files-only  # only file-based checks on changed files
python3 .claude/skills/code-quality-checks/check.py --all ./frontend/components
python3 .claude/skills/code-quality-checks/check.py --base main   # changed since main
python3 .claude/skills/code-quality-checks/check.py --lint --frontend-tests
```

With no flags it runs ALL checks (file validation + every suite). Specific flags run only those suites (file checks still run unless the invocation is suite-only).

## Output Format

- **Progress indicators** for each file checked
- **Detailed failure messages** with examples and suggestions
- **Summary statistics** (total, passed, failed)
- **Exit code 1** if any checks fail (for CI integration)

## Adding New Checks

1. **Create the check script** in `.claude/scripts/check-<name>.sh` (stdin: `{"tool_input": {"file_path": ...}}`; exit 2 + JSON `reason` to block)
2. **Update check.py** with a `check_<name>(files)` function and wire it in `main()` + `print_summary()`
3. **Update this documentation** with the new check details

## Troubleshooting

- **No files to check**: ensure you have uncommitted changes, or use `--all <dir>`. Requires a git repo (fresh forks: `git init` first).
- **Script not found**: verify `.claude/scripts/check-*.sh` exist and are executable (`chmod +x .claude/scripts/*.sh`)
- **Suites fail with `{{PLACEHOLDER}}` errors**: the repo hasn't been bootstrapped — run `bash bootstrap/init.sh` (see `/onboard`)
