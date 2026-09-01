#!/usr/bin/env bash
#
# Mirror-map coverage check, over every cross-language mirror pair:
#
#   - backend/board  <-> frontend/lib/board    (openspec: cross-stack-determinism,
#     requirement "Shared Board Math Is Pinned By a Cross-Language Golden
#     Fixture", scenario "An uncovered mirrored function is caught by the
#     coverage inventory check") — fixtures/board/mirror-map.json
#   - backend/polar  <-> frontend/lib/polar  (openspec: polar-lattice-math,
#     requirement "A New Cross-Language Fixture Family Pins the Lattice",
#     same scenario) — fixtures/polar/mirror-map.json
#
# Two further invocations run in ANTI-MIRROR mode, over:
#   - backend/space <-> frontend/lib/space (openspec: add-space-kinematics
#     Decision 1 — Go is sole authority for continuous-space kinematics, no
#     TypeScript mirror exists, now or ever)
#   - backend/system <-> frontend/lib/system (openspec:
#     pin-system-generation-determinism, design.md Decision 5 — `system` is
#     likewise designated Go-sole-authority for interior generation)
#   - backend/fleet <-> frontend/lib/fleet (openspec:
#     migrate-fleet-to-continuous-burns, tasks.md 9.8 — `fleet` is likewise
#     designated Go-sole-authority; wires fixtures/fleet/cases.json's
#     commandedAccelRejection family, added by tasks.md 4.11, into this check)
#   - backend/galaxy <-> frontend/lib/galaxy (openspec:
#     replace-observation-with-sightings, tasks.md 4.13 — the lane-id
#     derivation is server-only; the client consumes the served wire value)
#   - backend/disclosure <-> frontend/lib/disclosure (openspec:
#     replace-observation-with-sightings, tasks.md 7.3 — `disclosure` is
#     likewise designated Go-sole-authority, per add-proximity-disclosure's
#     Decision 1: its knife-edge float predicates decide who sees whom, so a
#     JavaScript second implementation would disagree with the server about
#     visibility at the boundary)
# Rather than asserting a `pairs` list (which would assert the mirror the
# designation forbids), each FAILS if any function/method name is declared
# on BOTH sides, unless that name appears in the pair's own mirror-map.json
# `sharedNames` allowlist (empty by default). See anti_mirror, below —
# generalized from the original space-only `anti_mirror_space` (openspec
# pin-system-generation-determinism, tasks.md 5.6) so `system` (and any
# future Go-sole-authority package) reuses the same body rather than a
# second hand-copied function.
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

# anti_mirror checks a Go-sole-authority package against its (non-existent
# or deliberately mirror-free) TypeScript directory in ANTI-MIRROR mode (see
# the header comment) — generalized from the original space-only
# `anti_mirror_space` (openspec pin-system-generation-determinism, tasks.md
# 5.6) so a second Go-sole-authority package (`system`) reuses this body
# rather than a hand-copied duplicate. Takes LABEL, MAP, GO_DIR, TS_DIR;
# behavior is otherwise unchanged from the original space-only function.
# Unlike check_mirror's Go
# `^func `/TS `^(export )?function` textual extractor, this recognizes every
# declaration shape the PoC actually used for its rule-bearing functions —
# a `function` declaration, a top-level arrow-function or function-expression
# `const`/`let` binding, a class method, and a re-exported alias
# (`export { x as y }`) — and FAILS CLOSED (naming file:line) on a top-level
# declaration it cannot classify into one of those forms or a known
# non-function form (class/interface/type/enum/import), per
# cross-stack-determinism's amended anti-mirror-extraction sentence: a
# silent "pass because unrecognized" is exactly the regression this check
# exists to catch.
#
# A named `export default function f(){...}` is extracted; the ANONYMOUS
# `export default function(){...}` / `export default class {...}` forms and
# any destructuring binding (`export const [a,b] = ...`) FAIL CLOSED rather
# than falling into the default-alias / plain-value no-op buckets, which is
# where they landed before openspec add-space-kinematics tasks.md 8.1.
#
# Extraction is textual and scoped to TOP-LEVEL (column-0) declarations for
# function/const/let/export-brace/class forms, and to depth-1 lines inside a
# top-level class body for methods — the same "no indentation for top-level
# declarations" assumption check_mirror's own Go/TS extractors already rely
# on. frontend/app/spike/space-3d is explicitly never scanned: it is the
# exempt, non-shipping feel bench (space-kinematics: "Every Rule-Bearing
# Value of This Capability Is Computed Only in the Authoritative
# Implementation").
anti_mirror() {
    local LABEL="$1" MAP="$2" GO_DIR="$3" TS_DIR="$4"

    if [[ ! -d "$TS_DIR" ]]; then
        echo "$LABEL (anti-mirror): ${TS_DIR#"$REPO_ROOT"/} does not exist — no TypeScript mirror to check against; passes trivially."
        return
    fi

    if [[ ! -f "$MAP" ]]; then
        echo "FAIL: $LABEL anti-mirror: map not found at ${MAP#"$REPO_ROOT"/}"
        FAIL=1
        return
    fi

    local SHARED
    SHARED=$(jq -r '.sharedNames // [] | .[]' "$MAP" | sort -u)

    local GO_NAMES
    GO_NAMES=$(for f in "$GO_DIR"/*.go; do
        [[ "$f" == *_test.go ]] && continue
        grep -hE '^func ' "$f" || true
    done | sed -E 's/^func (\([^)]*\) )?//; s/[([].*$//; s/[[:space:]]*$//' | grep -v '^$' | sort -u)

    local TS_NAMES=""
    local UNRECOGNIZED=""
    local f
    for f in "$TS_DIR"/*.ts; do
        [[ -e "$f" ]] || continue
        [[ "$f" == *.test.ts ]] && continue
        local rel="${f#"$REPO_ROOT"/}"
        local lineno=0
        local classDepth=-1 braceDepth=0
        while IFS= read -r line; do
            lineno=$((lineno + 1))
            local trimmed
            trimmed="$(echo "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
            [[ -z "$trimmed" ]] && continue
            [[ "$trimmed" =~ ^(//|/\*|\*) ]] && continue

            # Depth-1 method scan inside a top-level class body.
            if [[ $classDepth -ge 0 ]]; then
                if [[ $braceDepth -eq $((classDepth + 1)) ]]; then
                    if [[ "$trimmed" =~ ^(public|private|protected|static|async|readonly|abstract|get|set)*[[:space:]]*([A-Za-z_$][A-Za-z0-9_$]*)[[:space:]]*[\(\<] ]]; then
                        TS_NAMES+=$'\n'"${BASH_REMATCH[2]}"
                    elif [[ ! "$trimmed" =~ ^(constructor|\}) ]] && [[ "$trimmed" == *"("* ]]; then
                        UNRECOGNIZED+=$'\n'"$rel:$lineno: $trimmed"
                    fi
                fi
                local opens closes
                opens=$(grep -o '{' <<<"$trimmed" | wc -l || true)
                closes=$(grep -o '}' <<<"$trimmed" | wc -l || true)
                braceDepth=$((braceDepth + opens - closes))
                if [[ $braceDepth -le $classDepth ]]; then
                    classDepth=-1
                fi
                continue
            fi

            # Only top-level (column-0) lines are inspected below.
            [[ "$line" =~ ^[A-Za-z@] ]] || { [[ "$line" =~ ^export ]] || continue; }

            if [[ "$trimmed" =~ ^(export[[:space:]]+)?(async[[:space:]]+)?function[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*) ]]; then
                TS_NAMES+=$'\n'"${BASH_REMATCH[3]}"
            elif [[ "$trimmed" =~ ^(export[[:space:]]+)?(const|let)[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*)[^=]*=[[:space:]]*(async[[:space:]]+)?(\(|function\b|[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=\>) ]]; then
                TS_NAMES+=$'\n'"${BASH_REMATCH[3]}"
            elif [[ "$trimmed" =~ ^(export[[:space:]]+)?(const|let|var)[[:space:]]*[\[\{] ]]; then
                # A destructuring binding (`export const [a, b] = ...`,
                # `export const { a } = ...`). The extractor cannot tell
                # whether any bound name holds a function, so it fails
                # closed rather than counting the line as a plain value
                # export (openspec add-space-kinematics tasks.md 8.1).
                UNRECOGNIZED+=$'\n'"$rel:$lineno: $trimmed"
            elif [[ "$trimmed" =~ ^(export[[:space:]]+)?(const|let|var)[[:space:]] ]]; then
                : # a plain (non-function) top-level value export — not a name collision risk
            elif [[ "$trimmed" =~ ^export[[:space:]]*\{ ]]; then
                local inner part
                inner=$(echo "$trimmed" | sed -E 's/^export[[:space:]]*\{//; s/\}.*$//')
                IFS=',' read -ra parts <<<"$inner"
                for part in "${parts[@]}"; do
                    part="$(echo "$part" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
                    [[ -z "$part" ]] && continue
                    if [[ "$part" =~ ^([A-Za-z_$][A-Za-z0-9_$]*)[[:space:]]+as[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*)$ ]]; then
                        TS_NAMES+=$'\n'"${BASH_REMATCH[2]}"
                    elif [[ "$part" =~ ^[A-Za-z_$][A-Za-z0-9_$]*$ ]]; then
                        TS_NAMES+=$'\n'"$part"
                    else
                        UNRECOGNIZED+=$'\n'"$rel:$lineno: $trimmed"
                    fi
                done
            elif [[ "$trimmed" =~ ^(export[[:space:]]+)?(default[[:space:]]+)?(abstract[[:space:]]+)?class[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*) ]]; then
                TS_NAMES+=$'\n'"${BASH_REMATCH[4]}"
                classDepth=0
                local opens closes
                opens=$(grep -o '{' <<<"$trimmed" | wc -l || true)
                closes=$(grep -o '}' <<<"$trimmed" | wc -l || true)
                braceDepth=$((opens - closes))
                if [[ $braceDepth -le 0 ]]; then
                    classDepth=-1
                fi
            elif [[ "$trimmed" =~ ^(export[[:space:]]+)?(interface|type|enum)[[:space:]] ]]; then
                : # type-level declarations carry no runtime function
            elif [[ "$trimmed" =~ ^export[[:space:]]+default[[:space:]]+(async[[:space:]]+)?function[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*) ]]; then
                # `export default function name(){...}` — a real declaration
                # the plain-`function` rule above cannot see past `default`.
                TS_NAMES+=$'\n'"${BASH_REMATCH[2]}"
            elif [[ "$trimmed" =~ ^export[[:space:]]+default[[:space:]]+(async[[:space:]]+)?function[[:space:]]*\( ]]; then
                # An ANONYMOUS default function export. It cannot collide by
                # name, but the requirement is fail-closed on any form the
                # extractor has no rule for — and this one previously fell
                # into the default-alias no-op bucket meant for
                # `export default name;` (tasks.md 8.1).
                UNRECOGNIZED+=$'\n'"$rel:$lineno: $trimmed"
            elif [[ "$trimmed" =~ ^export[[:space:]]+default[[:space:]]+(abstract[[:space:]]+)?class([[:space:]]*[\{]|[[:space:]]+extends[[:space:]]) ]]; then
                # An ANONYMOUS default class export — same reasoning; the
                # NAMED form is already handled by the class rule above.
                UNRECOGNIZED+=$'\n'"$rel:$lineno: $trimmed"
            elif [[ "$trimmed" =~ ^(import|export[[:space:]]+\*|export[[:space:]]+default[[:space:]]+[A-Za-z_$]) ]]; then
                :
            elif [[ "$trimmed" == "}" || "$trimmed" == "};" ]]; then
                :
            else
                UNRECOGNIZED+=$'\n'"$rel:$lineno: $trimmed"
            fi
        done <"$f"
    done

    if [[ -n "$UNRECOGNIZED" ]]; then
        echo "FAIL: $LABEL anti-mirror: unrecognized top-level TypeScript declaration form(s) (extend the extractor before trusting this check):"
        echo "$UNRECOGNIZED" | grep -v '^$' | sed 's/^/        /'
        FAIL=1
        return
    fi

    TS_NAMES=$(echo "$TS_NAMES" | grep -v '^$' | sort -u)
    GO_NAMES=$(echo "$GO_NAMES" | grep -v '^$' | sort -u)

    local COLLIDING
    COLLIDING=$(comm -12 <(echo "$GO_NAMES") <(echo "$TS_NAMES"))
    local UNALLOWED
    UNALLOWED=$(comm -23 <(echo "$COLLIDING" | grep -v '^$') <(echo "$SHARED"))
    if [[ -n "$UNALLOWED" ]]; then
        echo "FAIL: $LABEL anti-mirror: function name(s) declared in BOTH ${GO_DIR#"$REPO_ROOT"/} and ${TS_DIR#"$REPO_ROOT"/} — a TypeScript mirror of an authoritative Go function, forbidden by design unless added to ${MAP#"$REPO_ROOT"/}'s sharedNames allowlist (it is not):"
        echo "$UNALLOWED" | sed 's/^/        /'
        FAIL=1
        return
    fi

    echo "$LABEL (anti-mirror): no shared function names between ${GO_DIR#"$REPO_ROOT"/} and ${TS_DIR#"$REPO_ROOT"/}."
}

check_mirror "board" \
    "$REPO_ROOT/fixtures/board/mirror-map.json" \
    "$REPO_ROOT/fixtures/board/cases.json" \
    "$REPO_ROOT/backend/board" \
    "$REPO_ROOT/frontend/lib/board"

check_mirror "polar" \
    "$REPO_ROOT/fixtures/polar/mirror-map.json" \
    "$REPO_ROOT/fixtures/polar/cases.json" \
    "$REPO_ROOT/backend/polar" \
    "$REPO_ROOT/frontend/lib/polar"

anti_mirror "space" \
    "$REPO_ROOT/fixtures/space/mirror-map.json" \
    "$REPO_ROOT/backend/space" \
    "$REPO_ROOT/frontend/lib/space"

anti_mirror "system" \
    "$REPO_ROOT/fixtures/system/mirror-map.json" \
    "$REPO_ROOT/backend/system" \
    "$REPO_ROOT/frontend/lib/system"

anti_mirror "fleet" \
    "$REPO_ROOT/fixtures/fleet/mirror-map.json" \
    "$REPO_ROOT/backend/fleet" \
    "$REPO_ROOT/frontend/lib/fleet"

anti_mirror "galaxy" \
    "$REPO_ROOT/fixtures/galaxy/mirror-map.json" \
    "$REPO_ROOT/backend/galaxy" \
    "$REPO_ROOT/frontend/lib/galaxy"

anti_mirror "disclosure" \
    "$REPO_ROOT/fixtures/disclosure/mirror-map.json" \
    "$REPO_ROOT/backend/disclosure" \
    "$REPO_ROOT/frontend/lib/disclosure"

if [[ "$FAIL" -ne 0 ]]; then
    exit 2
fi

echo "PASS: all mirror maps complete — every mirrored pair fixture-covered or inventoried, and backend/space, backend/system, backend/fleet, backend/galaxy, and backend/disclosure carry no TypeScript mirror."
exit 0
