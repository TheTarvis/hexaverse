#!/usr/bin/env bash
# Record / verify the TDD red-suite handoff state.
#
# WHY THIS EXISTS. The SDET's post-development integrity check must prove no
# test was modified, weakened, skipped or deleted since the red handoff. That
# needs a baseline. Committing the red suite would give one — but a red suite
# does not compile by design, so landing it turns main red and fails the
# pipeline. This records content hashes instead: a real baseline, with main
# left green.
#
#   record <change-id> [paths...]   hash the suite, write the manifest
#   verify <change-id>              diff current state against it
#
# Exit 1 on any modification, deletion, or unrecorded addition.
set -euo pipefail
ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel)}"
DIR="$ROOT/docs/plans/continous_space/handoffs"
cmd="${1:?usage: record|verify <change-id> [paths...]}"
id="${2:?missing change-id}"
man="$DIR/red-manifest-$id.txt"

hash_all() {
  for p in "$@"; do
    [ -e "$p" ] || continue
    if [ -d "$p" ]; then find "$p" -name '*_test.go' -o -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts'
    else echo "$p"; fi
  done | sort -u | while read -r f; do
    printf '%s  %s\n' "$(shasum -a 256 "$ROOT/${f#"$ROOT/"}" | cut -d' ' -f1)" "${f#"$ROOT/"}"
  done
}

case "$cmd" in
  record)
    shift 2
    [ "$#" -gt 0 ] || { echo "record needs at least one path"; exit 2; }
    mkdir -p "$DIR"
    { echo "# red-suite handoff manifest for $id"
      echo "# recorded $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      echo "# verify with: bash .claude/scripts/openspec-red-manifest.sh verify $id"
      hash_all "$@"
    } > "$man"
    echo "recorded $(grep -vc '^#' "$man") file(s) -> $man"
    ;;
  verify)
    [ -f "$man" ] || { echo "no manifest for $id at $man"; exit 2; }
    rc=0
    while read -r want f; do
      [ -e "$ROOT/$f" ] || { echo "DELETED   $f"; rc=1; continue; }
      got=$(shasum -a 256 "$ROOT/$f" | cut -d' ' -f1)
      [ "$got" = "$want" ] || { echo "MODIFIED  $f"; rc=1; }
    done < <(grep -v '^#' "$man")
    n=$(grep -vc '^#' "$man")
    [ "$rc" -eq 0 ] && echo "$id: all $n test file(s) unchanged since handoff"
    exit "$rc"
    ;;
  *) echo "unknown command: $cmd"; exit 2 ;;
esac
