#!/usr/bin/env bash
#
# Mirror-map coverage check (openspec capability: cross-stack-determinism,
# requirement "Shared Board Math Is Pinned By a Cross-Language Golden Fixture",
# scenario "An uncovered mirrored function is caught by the coverage inventory
# check").
#
# fixtures/board/mirror-map.json names every function defined in BOTH
# backend/board and frontend/lib/hex (exported or not). This check:
#   1. extracts the actual top-level production function names from both
#      packages and fails if any is absent from the map (pairs/goOnly/tsOnly),
#      or if the map names a function that no longer exists (stale map);
#   2. fails if any pair's coverage is neither an existing, non-empty fixture
#      family in fixtures/board/cases.json nor an entry in the map's own
#      coverage inventory.
#
# Extraction is textual: Go `func` declarations (receiver methods included),
# TS `function` declarations. lib/hex currently declares every function that
# way; if a mirrored arrow-function const is added, extend this extractor.
#
# Exit codes: 0 = pass, 2 = fail.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAP="$REPO_ROOT/fixtures/board/mirror-map.json"
CASES="$REPO_ROOT/fixtures/board/cases.json"

if [[ ! -f "$MAP" ]]; then
    echo "FAIL: mirror map not found at fixtures/board/mirror-map.json"
    exit 2
fi

# --- 1. Extract actual function names ---------------------------------------

GO_ACTUAL=$(for f in "$REPO_ROOT"/backend/board/*.go; do
    [[ "$f" == *_test.go ]] && continue
    grep -hE '^func ' "$f" || true
done | sed -E 's/^func (\([^)]*\) )?//; s/[([].*$//; s/[[:space:]]*$//' | grep -v '^$' | sort -u)

TS_ACTUAL=$(for f in "$REPO_ROOT"/frontend/lib/hex/*.ts; do
    [[ "$f" == *.test.ts ]] && continue
    grep -hE '^(export )?function [A-Za-z]' "$f" || true
done | sed -E 's/^(export )?function //; s/[(<].*$//; s/[[:space:]]*$//' | grep -v '^$' | sort -u)

GO_MAPPED=$(jq -r '[.pairs[].go] + .goOnly | .[]' "$MAP" | sort -u)
TS_MAPPED=$(jq -r '[.pairs[].ts] + .tsOnly | .[]' "$MAP" | sort -u)

FAIL=0

MISSING_GO=$(comm -23 <(echo "$GO_ACTUAL") <(echo "$GO_MAPPED"))
if [[ -n "$MISSING_GO" ]]; then
    echo "FAIL: backend/board function(s) absent from the mirror map (add to 'pairs' or 'goOnly'):"
    echo "$MISSING_GO" | sed 's/^/        /'
    FAIL=1
fi

MISSING_TS=$(comm -23 <(echo "$TS_ACTUAL") <(echo "$TS_MAPPED"))
if [[ -n "$MISSING_TS" ]]; then
    echo "FAIL: frontend/lib/hex function(s) absent from the mirror map (add to 'pairs' or 'tsOnly'):"
    echo "$MISSING_TS" | sed 's/^/        /'
    FAIL=1
fi

STALE_GO=$(comm -13 <(echo "$GO_ACTUAL") <(echo "$GO_MAPPED"))
if [[ -n "$STALE_GO" ]]; then
    echo "FAIL: mirror map names Go function(s) that no longer exist in backend/board:"
    echo "$STALE_GO" | sed 's/^/        /'
    FAIL=1
fi

STALE_TS=$(comm -13 <(echo "$TS_ACTUAL") <(echo "$TS_MAPPED"))
if [[ -n "$STALE_TS" ]]; then
    echo "FAIL: mirror map names TS function(s) that no longer exist in frontend/lib/hex:"
    echo "$STALE_TS" | sed 's/^/        /'
    FAIL=1
fi

# --- 2. Every pair is fixture-covered or inventoried ------------------------

FAMILIES=$(jq -r 'to_entries[] | select((.value | type == "array") and (.value | length > 0)) | .key' "$CASES" 2>/dev/null | sort -u)
INVENTORY=$(jq -r '.inventory[].pair' "$MAP" | sort -u)

while IFS=$'\t' read -r go ts coverage; do
    case "$coverage" in
        family:*)
            fam="${coverage#family:}"
            if ! echo "$FAMILIES" | grep -qx "$fam"; then
                echo "FAIL: pair $go/$ts claims coverage by family '$fam', which is not a non-empty family in fixtures/board/cases.json"
                FAIL=1
            fi
            ;;
        inventory)
            if ! echo "$INVENTORY" | grep -qx "$go/$ts"; then
                echo "FAIL: pair $go/$ts claims 'inventory' coverage but has no entry in the map's coverage inventory"
                FAIL=1
            fi
            ;;
        *)
            echo "FAIL: pair $go/$ts has coverage '$coverage' — must be 'family:<name>' or 'inventory'"
            FAIL=1
            ;;
    esac
done < <(jq -r '.pairs[] | [.go, .ts, .coverage] | @tsv' "$MAP")

if [[ "$FAIL" -ne 0 ]]; then
    exit 2
fi

NPAIRS=$(jq '.pairs | length' "$MAP")
NGAPS=$(jq '.inventory | length' "$MAP")
echo "PASS: mirror map complete — $NPAIRS mirrored pair(s), all fixture-covered or inventoried ($NGAPS coverage gap(s) tracked with expected changes)."
exit 0
