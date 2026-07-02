# description: Run lint + tests across backend and frontend

Run the project's quality gate — `go vet`, `go test -short`, `tsc`, ESLint, and Vitest.

## Steps

1. **Verify onboarding is complete.** Read `onboarding_checklist.md` (repo root, gitignored).
   - If the file does **not** exist: stop and tell the user to run `/onboard` first — the checks will fail without a bootstrapped repo.
   - If it exists, scan the **Bootstrap** section for unchecked items (`- [ ]`). If any are unchecked, stop and report which ones, then tell the user to either:
     - finish bootstrap (`cp bootstrap/config.example.env bootstrap/config.env`, fill it in, `bash bootstrap/init.sh`), or
     - re-run `/onboard` to refresh the checklist if they believe bootstrap is already done.
   - Unchecked items in **Prerequisites**, **Dependencies & Build**, or **Cloud Authentication** are warnings — surface them in one line but proceed.
   - Skip this step only if the user passes `--skip-onboarding-check` (pass it through to no-op; it just suppresses the gate).
2. Verify prereqs are present:
   - `command -v go`
   - `command -v node`
   - `frontend/node_modules` exists (otherwise tell the user to `cd frontend && npm install`)
3. Execute: `bash .claude/scripts/check.sh`
4. Report:
   - If everything passed: a one-line confirmation.
   - If anything failed: the failing step name and the first ~10 lines of its output, plus the command to re-run that single step (e.g. `cd frontend && npx vitest run`).
   - If the failure looks like an unsubstituted `{{PLACEHOLDER}}` (e.g. `go.mod:1: usage: module module/path`), say so explicitly and point the user at `bash bootstrap/init.sh`.

## Flags

The script accepts narrowing flags:

- `--backend` / `--frontend` — only one side
- `--lint` / `--test` — skip the other category
- `--keep-going` — don't stop on first failure (useful for a full report)

Examples:
- `bash .claude/scripts/check.sh --frontend --lint`
- `bash .claude/scripts/check.sh --keep-going`

## When to use

Before commits, before PRs, after large refactors, or whenever you've changed something that crosses package boundaries and want a fast confidence check. The full run takes ~15–30s on a warm machine.
