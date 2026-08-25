#!/usr/bin/env bash
#
# Cross-target FMA-contraction check (openspec capability:
# cross-stack-determinism, requirement "Rule-Bearing Values Are Reproducible
# Across Build Targets of the Same Language").
#
# The Go spec permits fusing `a + b*c` into one rounded FMA "possibly across
# statements"; gc does it on arm64 and not on amd64 at GOAMD64=v1 — so the
# same source computes different values per architecture. A grep can't see
# this (it's an instruction-selection fact, not a textual one), and most of
# the hazard lives on continuous float domains no differential run can
# enumerate. So this check inspects COMPILED OUTPUT: it builds the whole
# backend module for both targets with -gcflags=-S and diffs the set of
# FMADDD/FMSUBD emission sites (file:line).
#
#  - A site emitted on arm64 must be named (file + line) in a deviation-
#    register entry bridging the "cross-target" check, with an OPEN defect —
#    otherwise this check fails. Only an explicit float64(...) conversion
#    around the product is spec-guaranteed to prevent the fusion (assigning
#    it to a local does NOT — verified in compiler output; see the
#    capability's design.md).
#  - Any FMA emission on the amd64/GOAMD64=v1 leg fails outright: that target
#    being non-contracting is the contract the whole matrix rests on.
#  - A register entry whose referenced defect is no longer open fails.
#  - The register's contents are printed on every run, so suppressed
#    violations are visible in the check's own output.
#
# Exit codes: 0 = pass, 2 = fail.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGISTER="$REPO_ROOT/fixtures/determinism-register.json"
BACKEND="$REPO_ROOT/backend"

if [[ ! -f "$REGISTER" ]]; then
    echo "FAIL: deviation register not found at fixtures/determinism-register.json"
    exit 2
fi

echo "=== cross-stack-determinism deviation register (fixtures/determinism-register.json) ==="
jq -r '.entries[] | "  [\(.checks | keys | join(","))] \(.site)\n      defect: \(.defect)  filed: \(.filed)\n      magnitude: \(.magnitude)"' "$REGISTER"
echo "==="

# Every register entry must reference an open defect — a stale entry fails
# whichever check consults the register, and this check consults it.
STALE=0
while IFS= read -r defect; do
    if ! grep -qE '^\*\*Status:\*\* open' "$REPO_ROOT/$defect" 2>/dev/null; then
        echo "FAIL: register entry references '$defect', whose **Status:** line no longer reads 'open'."
        echo "      The fix change must remove the register entry in the same commit."
        STALE=1
    fi
done < <(jq -r '[.entries[].defect] | unique | .[]' "$REGISTER")

extract_sites() {
    # stdin: go build -gcflags=-S output; stdout: unique repo-relative file:line
    grep -E 'FMADDD|FMSUBD' \
        | grep -oE '\([^)]+\.go:[0-9]+\)' \
        | sed -e 's/^(//' -e 's/)$//' -e "s|^$REPO_ROOT/||" \
        | sort -u
}

echo "Building backend for linux/arm64 with -gcflags=-S (contracting target)..."
ARM64_SITES=$(cd "$BACKEND" && GOOS=linux GOARCH=arm64 go build -gcflags=-S ./... 2>&1 | extract_sites || true)

echo "Building backend for linux/amd64 GOAMD64=v1 with -gcflags=-S (non-contracting target)..."
AMD64_SITES=$(cd "$BACKEND" && GOOS=linux GOARCH=amd64 GOAMD64=v1 go build -gcflags=-S ./... 2>&1 \
    | grep -E 'FMADDD|FMSUBD|VFMADD[0-9]*[SP]D|VFMSUB[0-9]*[SP]D' \
    | grep -oE '\([^)]+\.go:[0-9]+\)' | sed -e 's/^(//' -e 's/)$//' -e "s|^$REPO_ROOT/||" | sort -u || true)

FAIL=$STALE

if [[ -n "$AMD64_SITES" ]]; then
    echo "FAIL: FMA instructions emitted on the amd64/GOAMD64=v1 leg — the non-contracting"
    echo "      target contract is broken (is the toolchain honoring GOAMD64=v1?):"
    echo "$AMD64_SITES" | sed 's/^/        /'
    FAIL=1
fi

# Registered cross-target sites: "file:line" per entry line list.
REGISTERED_SITES=$(jq -r '.entries[] | select(.checks["cross-target"] != null) | .file as $f | .checks["cross-target"][] | "\($f):\(.)"' "$REGISTER" | sort -u)

UNREGISTERED=""
while IFS= read -r site; do
    [[ -z "$site" ]] && continue
    if ! echo "$REGISTERED_SITES" | grep -qx "$site"; then
        UNREGISTERED="${UNREGISTERED}${site}"$'\n'
    fi
done <<< "$ARM64_SITES"
UNREGISTERED="${UNREGISTERED%$'\n'}"

if [[ -n "$UNREGISTERED" ]]; then
    echo "FAIL: FMA contraction emitted on arm64 at site(s) not named in the deviation register:"
    echo "$UNREGISTERED" | sed 's/^/        /'
    echo "      Each is a same-language cross-target divergence hazard on a rule-bearing path."
    echo "      Either make the expression contraction-independent (wrap the product in an"
    echo "      explicit float64(...) conversion — a bare local does NOT inhibit fusion), or"
    echo "      file a defect under docs/defects/ and add a register entry naming this check"
    echo "      ('cross-target') with the exact file:line. If an existing entry's line drifted,"
    echo "      update the entry — line numbers are load-bearing by design."
    FAIL=1
fi

# Registered sites that no longer emit: not a failure (only a closed defect
# invalidates an entry), but surface them — they may indicate a fixed site
# whose defect/entry cleanup was forgotten, or drifted line numbers.
while IFS= read -r site; do
    [[ -z "$site" ]] && continue
    if ! echo "$ARM64_SITES" | grep -qx "$site"; then
        echo "WARN: registered cross-target site '$site' no longer emits FMA on arm64 —"
        echo "      if its defect is fixed, close the defect doc and remove the entry;"
        echo "      if the code moved, update the entry's line number."
    fi
done <<< "$REGISTERED_SITES"

if [[ "$FAIL" -ne 0 ]]; then
    exit 2
fi

COUNT=$(echo "$ARM64_SITES" | grep -c . || true)
echo "PASS: all $COUNT arm64 FMA-contraction site(s) are register-bridged with open defects; amd64/GOAMD64=v1 emits none."
exit 0
