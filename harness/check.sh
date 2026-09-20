#!/usr/bin/env bash
#
# Quality gate: run lint, type, and unit tests across backend + frontend.
# Exits non-zero on the first failure unless --keep-going is passed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolved from git, never from a hardcoded depth: this file is reachable both
# as harness/<name> and through the tools/ and .claude/scripts compat symlinks.
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || { cd "$SCRIPT_DIR/.." && pwd; })"

KEEP_GOING=0
TARGETS=()
for arg in "$@"; do
  case "$arg" in
    --keep-going) KEEP_GOING=1 ;;
    --backend|--frontend|--lint|--test) TARGETS+=("$arg") ;;
    -h|--help)
      cat <<EOF
Usage: bash harness/check.sh [flags]

Flags:
  --backend       Only run backend checks
  --frontend      Only run frontend checks
  --lint          Only run lint/type checks (no tests)
  --test          Only run tests (no lint)
  --keep-going    Don't stop on the first failure
  -h, --help      Show this help

With no flags, runs everything.
EOF
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

# Default: everything.
[[ ${#TARGETS[@]} -eq 0 ]] && TARGETS=(--backend --frontend --lint --test)

want_backend=0; want_frontend=0; want_lint=0; want_test=0
for t in "${TARGETS[@]}"; do
  case "$t" in
    --backend)  want_backend=1 ;;
    --frontend) want_frontend=1 ;;
    --lint)     want_lint=1 ;;
    --test)     want_test=1 ;;
  esac
done
# If neither side specified, do both.
if [[ $want_backend -eq 0 && $want_frontend -eq 0 ]]; then
  want_backend=1; want_frontend=1
fi
# If neither lint nor test specified, do both.
if [[ $want_lint -eq 0 && $want_test -eq 0 ]]; then
  want_lint=1; want_test=1
fi

failed=()

run_step() {
  local label="$1"; shift
  echo
  echo "──── $label ────"
  if "$@"; then
    echo "  ✓ $label"
  else
    echo "  ✗ $label" >&2
    failed+=("$label")
    [[ $KEEP_GOING -eq 0 ]] && return 1
  fi
}

if [[ $want_backend -eq 1 ]]; then
  cd "$REPO_ROOT/backend"
  if [[ $want_lint -eq 1 ]]; then
    run_step "backend: go vet"   go vet ./... || [[ $KEEP_GOING -eq 1 ]] || exit 1
  fi
  if [[ $want_test -eq 1 ]]; then
    run_step "backend: go test"  go test -short ./... || [[ $KEEP_GOING -eq 1 ]] || exit 1
  fi
  cd "$REPO_ROOT"
fi

if [[ $want_frontend -eq 1 ]]; then
  cd "$REPO_ROOT/frontend"
  if [[ ! -d node_modules ]]; then
    echo "frontend/node_modules missing — run 'npm install' first" >&2
    exit 1
  fi
  if [[ $want_lint -eq 1 ]]; then
    run_step "frontend: tsc"     npx --no-install tsc --noEmit || [[ $KEEP_GOING -eq 1 ]] || exit 1
    run_step "frontend: eslint"  npx --no-install next lint --quiet || [[ $KEEP_GOING -eq 1 ]] || exit 1
  fi
  if [[ $want_test -eq 1 ]]; then
    run_step "frontend: vitest"  npx --no-install vitest run --reporter=basic || [[ $KEEP_GOING -eq 1 ]] || exit 1
  fi
  cd "$REPO_ROOT"
fi

# Rulings indexes, for active changes only. A WARNING, never a failure: a stale
# index is the orchestrator's to fix at its next verdict commit, and it must not
# block a developer's commit. The hard gate is `openspec-rulings-index.py
# --check <id>` at the verdict commit itself.
if [[ $want_lint -eq 1 && -d "$REPO_ROOT/docs/handoffs" ]]; then
  stale=()
  for change in "$REPO_ROOT"/openspec/changes/*/; do
    id="$(basename "$change")"
    [[ "$id" == "archive" ]] && continue
    [[ -f "$REPO_ROOT/docs/handoffs/$id-rulings.md" ]] || continue
    python3 "$SCRIPT_DIR/openspec-rulings-index.py" --check "$id" >/dev/null 2>&1 || stale+=("$id")
  done
  if [[ ${#stale[@]} -gt 0 ]]; then
    echo
    echo "──── handoffs: rulings index ────"
    echo "  ! stale (not a failure): ${stale[*]}" >&2
    echo "    run: python3 tools/openspec-rulings-index.py ${stale[*]}" >&2
  fi
fi

echo
if [[ ${#failed[@]} -eq 0 ]]; then
  echo "All checks passed."
  exit 0
fi
echo "Failed: ${failed[*]}" >&2
exit 1
