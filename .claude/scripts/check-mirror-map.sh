#!/usr/bin/env bash
#
# Mirror-map coverage check, over every cross-language mirror pair:
#
#   - backend/board  <-> frontend/lib/hex    (openspec: cross-stack-determinism,
#     requirement "Shared Board Math Is Pinned By a Cross-Language Golden
#     Fixture", scenario "An uncovered mirrored function is caught by the
#     coverage inventory check") — fixtures/board/mirror-map.json
#   - backend/polar  <-> frontend/lib/polar  (openspec: polar-lattice-math,
#     requirement "A New Cross-Language Fixture Family Pins the Lattice",
#     same scenario) — fixtures/polar/mirror-map.json
#
# Each mirror map names every function defined in BOTH sides of its pair
# (exported or not). For each pair this check:
#   1. extracts the actual top-level production function names from both
#      packages and fails if any is absent from the map (pairs/goOnly/tsOnly),
#      or if the map names a function that no longer exists (stale map);
#   2. fails if any pair's coverage is neither an existing, non-empty fixture
#      family in the pair's cases.json nor an entry in the map's own
#      coverage inventory.
#
# Extraction is textual: Go `func` declarations (receiver methods included),
# TS `function` declarations. Both mirrors currently declare every function
# that way; if a mirrored arrow-function const is added, extend the extractor.
#
# Exit codes: 0 = pass, 2 = fail.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

FAIL=0

check_mirror() {
    local LABEL="$1" MAP="$2" CASES="$3" GO_DIR="$4" TS_DIR="$5"

    if [[ ! -f "$MAP" ]]; then
        echo "FAIL: $LABEL mirror map not found at ${MAP#"$REPO_ROOT"/}"
        FAIL=1
        return
    fi

    # --- 1. Extract actual function names -----------------------------------

    local GO_ACTUAL TS_ACTUAL GO_MAPPED TS_MAPPED
    GO_ACTUAL=$(for f in "$GO_DIR"/*.go; do
        [[ "$f" == *_test.go ]] && continue
        grep -hE '^func ' "$f" || true
    done | sed -E 's/^func (\([^)]*\) )?//; s/[([].*$//; s/[[:space:]]*$//' | grep -v '^$' | sort -u)

    TS_ACTUAL=$(for f in "$TS_DIR"/*.ts; do
        [[ "$f" == *.test.ts ]] && continue
        grep -hE '^(export )?function [A-Za-z]' "$f" || true
    done | sed -E 's/^(export )?function //; s/[(<].*$//; s/[[:space:]]*$//' | grep -v '^$' | sort -u)

    GO_MAPPED=$(jq -r '[.pairs[].go] + .goOnly | .[]' "$MAP" | sort -u)
    TS_MAPPED=$(jq -r '[.pairs[].ts] + .tsOnly | .[]' "$MAP" | sort -u)

    local MISSING_GO MISSING_TS STALE_GO STALE_TS
    MISSING_GO=$(comm -23 <(echo "$GO_ACTUAL") <(echo "$GO_MAPPED"))
    if [[ -n "$MISSING_GO" ]]; then
        echo "FAIL: $LABEL: ${GO_DIR#"$REPO_ROOT"/} function(s) absent from the mirror map (add to 'pairs' or 'goOnly'):"
        echo "$MISSING_GO" | sed 's/^/        /'
        FAIL=1
    fi

    MISSING_TS=$(comm -23 <(echo "$TS_ACTUAL") <(echo "$TS_MAPPED"))
    if [[ -n "$MISSING_TS" ]]; then
        echo "FAIL: $LABEL: ${TS_DIR#"$REPO_ROOT"/} function(s) absent from the mirror map (add to 'pairs' or 'tsOnly'):"
        echo "$MISSING_TS" | sed 's/^/        /'
        FAIL=1
    fi

    STALE_GO=$(comm -13 <(echo "$GO_ACTUAL") <(echo "$GO_MAPPED"))
    if [[ -n "$STALE_GO" ]]; then
        echo "FAIL: $LABEL: mirror map names Go function(s) that no longer exist in ${GO_DIR#"$REPO_ROOT"/}:"
        echo "$STALE_GO" | sed 's/^/        /'
        FAIL=1
    fi

    STALE_TS=$(comm -13 <(echo "$TS_ACTUAL") <(echo "$TS_MAPPED"))
    if [[ -n "$STALE_TS" ]]; then
        echo "FAIL: $LABEL: mirror map names TS function(s) that no longer exist in ${TS_DIR#"$REPO_ROOT"/}:"
        echo "$STALE_TS" | sed 's/^/        /'
        FAIL=1
    fi

    # --- 2. Every pair is fixture-covered or inventoried --------------------

    local FAMILIES INVENTORY
    FAMILIES=$(jq -r 'to_entries[] | select((.value | type == "array") and (.value | length > 0)) | .key' "$CASES" 2>/dev/null | sort -u)
    INVENTORY=$(jq -r '.inventory[].pair' "$MAP" | sort -u)

    local go ts coverage fam
    while IFS=$'\t' read -r go ts coverage; do
        case "$coverage" in
            family:*)
                fam="${coverage#family:}"
                if ! echo "$FAMILIES" | grep -qx "$fam"; then
                    echo "FAIL: $LABEL: pair $go/$ts claims coverage by family '$fam', which is not a non-empty family in ${CASES#"$REPO_ROOT"/}"
                    FAIL=1
                fi
                ;;
            inventory)
                if ! echo "$INVENTORY" | grep -qx "$go/$ts"; then
                    echo "FAIL: $LABEL: pair $go/$ts claims 'inventory' coverage but has no entry in the map's coverage inventory"
                    FAIL=1
                fi
                ;;
            *)
                echo "FAIL: $LABEL: pair $go/$ts has coverage '$coverage' — must be 'family:<name>' or 'inventory'"
                FAIL=1
                ;;
        esac
    done < <(jq -r '.pairs[] | [.go, .ts, .coverage] | @tsv' "$MAP")

    local NPAIRS NGAPS
    NPAIRS=$(jq '.pairs | length' "$MAP")
    NGAPS=$(jq '.inventory | length' "$MAP")
    echo "$LABEL: $NPAIRS mirrored pair(s) checked ($NGAPS coverage gap(s) tracked with expected changes)."
}

check_mirror "board/hex" \
    "$REPO_ROOT/fixtures/board/mirror-map.json" \
    "$REPO_ROOT/fixtures/board/cases.json" \
    "$REPO_ROOT/backend/board" \
    "$REPO_ROOT/frontend/lib/hex"

check_mirror "polar" \
    "$REPO_ROOT/fixtures/polar/mirror-map.json" \
    "$REPO_ROOT/fixtures/polar/cases.json" \
    "$REPO_ROOT/backend/polar" \
    "$REPO_ROOT/frontend/lib/polar"

if [[ "$FAIL" -ne 0 ]]; then
    exit 2
fi

echo "PASS: all mirror maps complete — every mirrored pair fixture-covered or inventoried."
exit 0
