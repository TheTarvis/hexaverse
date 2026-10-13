#!/usr/bin/env bash
#
# Claude Code adapter for harness/validate-file.sh.
#
# Wired as a PostToolUse hook in .claude/settings.json. Reads the hook's JSON
# envelope on stdin, pulls out whichever field carries the edited path, and
# hands it to the harness-agnostic validator. Exit 2 puts the validator's
# stderr in front of Claude as a system message.
#
# This file is the ONLY Claude-specific piece of the gate, and it is deliberately
# thin. Claude hooks do not configure Codex or any other client — AGENTS.md says
# so — and the rule those clients follow is "run harness/validate-file.sh after
# editing", which is the same code path with no adapter at all.
#
# A hook must never be the reason a turn dies: any failure to parse the envelope
# exits 0 and stays out of the way.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || { cd "$SCRIPT_DIR/.." && pwd; })"

payload="$(cat)" || exit 0
[[ -n "$payload" ]] || exit 0

# jq is not a dependency of this repo; python3 already is. Read with a plain
# loop rather than mapfile: macOS still ships bash 3.2, which has no mapfile.
files=()
while IFS= read -r line; do
  [[ -n "$line" ]] && files+=("$line")
done < <(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or {}
seen = []
for key in ("file_path", "notebook_path", "path"):
    v = ti.get(key)
    if isinstance(v, str) and v not in seen:
        seen.append(v)
# MultiEdit-shaped payloads carry a list of edits over one or more paths.
for edit in ti.get("edits") or []:
    v = (edit or {}).get("file_path") if isinstance(edit, dict) else None
    if isinstance(v, str) and v not in seen:
        seen.append(v)
for v in seen:
    print(v)
' 2>/dev/null)

[[ ${#files[@]} -eq 0 ]] && exit 0

cd "$REPO_ROOT" || exit 0
if ! out="$(bash harness/validate-file.sh --quiet "${files[@]}" 2>&1)"; then
  echo "$out" >&2
  exit 2
fi
exit 0
