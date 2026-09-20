#!/usr/bin/env bash
#
# Validate one or more files the way the edit that produced them should have.
#
# This is the harness-agnostic half of the post-edit gate. It takes paths and
# exits non-zero with diagnostics on stderr — nothing about it knows what an
# agent is, so every caller uses the same one:
#
#   Claude Code   tools/hook-post-edit.sh, wired as a PostToolUse hook
#   Codex / other AGENTS.md tells the agent to run this after editing
#   you          bash tools/validate-file.sh backend/session/store.go
#   CI / git      call it on the changed-file list
#
# The point is to collapse the edit -> run a check -> read the error -> fix
# loop from four turns into two: the agent that wrote the file learns it is
# malformed while it still has the context that wrote it.
#
# Only FAST checks run by default — this executes after every single edit, so
# anything that loads a TypeScript program or a Go build graph is disqualified.
# --slow adds the ones worth waiting for when you ask on purpose.
#
# Unknown extensions are skipped silently. A check whose tool is not installed
# is skipped silently too: a missing linter is not a defect in the edited file.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || { cd "$SCRIPT_DIR/.." && pwd; })"

QUIET=0
SLOW=0
PROJECT_CHECKS=1
PATHS=()
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --slow)  SLOW=1 ;;
    --no-project-checks) PROJECT_CHECKS=0 ;;
    -h|--help)
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      echo
      echo "Usage: bash tools/validate-file.sh [--quiet] [--slow] <path>..."
      exit 0
      ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *)  PATHS+=("$arg") ;;
  esac
done
[[ ${#PATHS[@]} -eq 0 ]] && exit 0

have() { command -v "$1" >/dev/null 2>&1; }
note() { [[ $QUIET -eq 1 ]] || echo "  $*"; }

failures=()
fail() { failures+=("$1"); }

for f in "${PATHS[@]}"; do
  # A path the edit deleted, or one outside this repo, is not ours to judge.
  [[ -f "$f" ]] || continue
  abs="$(cd "$(dirname "$f")" 2>/dev/null && pwd)/$(basename "$f")" || continue
  [[ "$abs" == "$REPO_ROOT"/* ]] || continue
  rel="${abs#"$REPO_ROOT"/}"

  case "$f" in
    *.go)
      if have gofmt; then
        # Two different defects wear the same exit code, so separate them:
        # a parse error is the agent's bug, unformatted is a one-command fix.
        if ! err="$(gofmt -e "$f" 2>&1 >/dev/null)"; then
          fail "$rel: does not parse
$(echo "$err" | head -5)"
        elif [[ -n "$(gofmt -l "$f" 2>/dev/null)" ]]; then
          fail "$rel: not gofmt-formatted
$(gofmt -d "$f" 2>/dev/null | sed -n '3,12p')
    fix: gofmt -w $rel"
        else
          note "$rel: gofmt ok"
        fi
      fi
      if [[ $SLOW -eq 1 ]] && have go; then
        pkg="$(dirname "$f")"
        if ! out="$(cd "$REPO_ROOT" && go vet "./${pkg#"$REPO_ROOT"/}" 2>&1)"; then
          fail "$rel: go vet
$(echo "$out" | head -10)"
        fi
      fi
      ;;
    *.py)
      if have python3; then
        if ! out="$(python3 -m py_compile "$f" 2>&1)"; then
          fail "$rel: does not compile
$(echo "$out" | tail -5)"
        else
          note "$rel: py_compile ok"
        fi
      fi
      ;;
    *.json)
      if have python3; then
        if ! out="$(python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" 2>&1)"; then
          fail "$rel: invalid JSON
$(echo "$out" | tail -3)"
        else
          note "$rel: json ok"
        fi
      fi
      ;;
    *.sh|*.bash)
      if ! out="$(bash -n "$f" 2>&1)"; then
        fail "$rel: bash syntax
$(echo "$out" | head -5)"
      else
        note "$rel: bash -n ok"
      fi
      if [[ $SLOW -eq 1 ]] && have shellcheck; then
        out="$(shellcheck -f gcc "$f" 2>&1)" || fail "$rel: shellcheck
$(echo "$out" | head -10)"
      fi
      ;;
    *.tf)
      if have terraform; then
        if ! out="$(terraform fmt -check=true -no-color "$f" 2>&1)"; then
          fail "$rel: terraform fmt — not formatted
    fix: terraform fmt $rel"
        else
          note "$rel: terraform fmt ok"
        fi
      fi
      ;;
    *-consolidated.md|*-reduced.md)
      # The reducer gate, fired by the edit that wrote the reduction. A
      # consolidated findings file is exactly where evidence goes missing, and
      # the author is the only one who can still cheaply put it back.
      #
      # --verify-header additionally pins the sources by hash: "these quotes
      # match" is only evidence when it is a statement about the files that
      # were actually reduced, not about whatever those paths hold today.
      if have python3 && [[ -f "$REPO_ROOT/harness/check-quote-fidelity.py" ]]; then
        if ! out="$(cd "$REPO_ROOT" && python3 harness/check-quote-fidelity.py "$rel" --verify-header 2>&1)"; then
          fail "$rel: quote fidelity
$(echo "$out" | head -24)"
        else
          note "$rel: quote fidelity ok"
        fi
      fi
      ;;
    */handoffs/*.md)
      # An index that has gone stale is worse than no index: delegations are
      # told to read it instead of the source, so it silently hands them the
      # previous revision. Only files that already have one are checked —
      # indexing is a decision (harness/reduction-economics.py), not a default.
      if have python3 && [[ -f "${abs%.md}-index.md" && -f "$REPO_ROOT/harness/handoff-index.py" ]]; then
        if ! out="$(cd "$REPO_ROOT" && python3 harness/handoff-index.py --check "$rel" 2>&1)"; then
          fail "$rel: handoff index is stale
$(echo "$out" | head -6)
    fix: python3 harness/handoff-index.py $rel"
        else
          note "$rel: handoff index current"
        fi
      fi
      # Editing a pinned SOURCE is what makes a reduction stale, and this hook
      # fires on the file that was edited, never on the reduction downstream of
      # it. Re-verify every receipt naming this path, at the moment the drift is
      # caused rather than whenever someone next happens to touch the reduction.
      if have python3 && [[ -f "$REPO_ROOT/harness/check-quote-fidelity.py" ]]; then
        while IFS= read -r red; do
          [[ -n "$red" ]] || continue
          relred="${red#"$REPO_ROOT"/}"
          if ! out="$(cd "$REPO_ROOT" && python3 harness/check-quote-fidelity.py "$relred" --verify-header 2>&1)"; then
            fail "$relred: pins $rel, and this edit changed it
$(echo "$out" | tail -12)"
          fi
        done < <(grep -rl --include='*-consolidated.md' --include='*-reduced.md' \
                      -F "source=$rel " "$(dirname "$abs")" 2>/dev/null)
      fi
      ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
      # Deliberately not linted per-edit: eslint pays a Node + config load on
      # every keystroke-sized change, and tsc has to build the whole program to
      # say anything true about one file. Both belong in tools/check.sh.
      if [[ $SLOW -eq 1 ]] && [[ -d "$REPO_ROOT/frontend/node_modules" ]]; then
        if ! out="$(cd "$REPO_ROOT/frontend" && npx --no-install eslint --cache "$abs" 2>&1)"; then
          fail "$rel: eslint
$(echo "$out" | head -15)"
        fi
      fi
      ;;
  esac

  # This repo's own checks (tools/check-*.sh) were written as PostToolUse hooks
  # — they read the hook envelope on stdin and self-filter by path — but were
  # never wired to one, so they have been dormant. Synthesising the envelope
  # here runs them for every client and every caller, not only Claude Code,
  # and keeps their single definition in one place.
  if [[ $PROJECT_CHECKS -eq 1 ]]; then
    for chk in "$REPO_ROOT"/tools/check-*.sh; do
      [[ -f "$chk" ]] || continue
      grep -q 'tool_input' "$chk" 2>/dev/null || continue
      if ! out="$(printf '{"tool_input":{"file_path":"%s"}}' "$abs" | bash "$chk" 2>&1)"; then
        fail "$rel: $(basename "$chk" .sh)
$(echo "$out" | head -12)"
      fi
    done
  fi
done

if [[ ${#failures[@]} -gt 0 ]]; then
  {
    echo "validate-file: ${#failures[@]} file(s) need fixing before moving on."
    for msg in "${failures[@]}"; do
      echo
      echo "  $msg"
    done
  } >&2
  exit 1
fi
exit 0
