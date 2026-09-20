#!/usr/bin/env bash
# delete-the-lattice, task 7.4 — falsification proof that the new
# `check_mirror market` pass CAN fail, not merely pass.
#
# NOT a permanent test (tasks.md 7.4's own words: "temporarily add a
# function ... then revert"). Run this ONLY AFTER the developer has:
#   - landed task 7.2/7.2b: fixtures/market/mirror-map.json exists
#   - landed task 7.3: check-mirror-map.sh calls
#       check_mirror "market" fixtures/market/mirror-map.json \
#         fixtures/market/cases.json backend/market frontend/lib/market
#     in place of `check_mirror "board"` / `check_mirror "polar"`
#
# It CANNOT be run meaningfully before those land — today (pre-implementation,
# at SDET red handoff) `check_mirror` has no market call site, so this script
# would silently prove nothing. This file is the developer's/QA's runnable
# procedure, not a red test the SDET can execute now (recorded as such in
# link9-red-coverage.md).
#
# Usage: bash docs/plans/continous_space/handoffs/link9-task7.4-falsification-proof.sh
# Run from anywhere; it cds to the repo root itself.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

TARGET="frontend/lib/market/fold.ts"
MARKER="neverMapped"

if [[ ! -f "$TARGET" ]]; then
    echo "FAIL: $TARGET not found — has the market TS mirror moved?" >&2
    exit 1
fi
if grep -q "$MARKER" "$TARGET"; then
    echo "FAIL: $TARGET already contains a '$MARKER' marker — a previous run of this script did not clean up. Run 'git checkout -- $TARGET' first." >&2
    exit 1
fi

echo "=== Leg 1: baseline (before injection) — expect exit 0 ==="
set +e
bash .claude/scripts/check-mirror-map.sh
BASELINE_EXIT=$?
set -e
echo "baseline exit=$BASELINE_EXIT"
if [[ "$BASELINE_EXIT" -ne 0 ]]; then
    echo "FAIL: baseline is not clean (exit $BASELINE_EXIT) — fix that before this proof means anything." >&2
    exit 1
fi

echo
echo "=== Leg 2: inject an unmapped TS function into frontend/lib/market/fold.ts ==="
printf '\nexport function %s(x: number): number { return x }\n' "$MARKER" >> "$TARGET"

set +e
bash .claude/scripts/check-mirror-map.sh
INJECTED_EXIT=$?
set -e
echo "injected exit=$INJECTED_EXIT"

echo
echo "=== Leg 3: revert the injection ==="
git checkout -- "$TARGET"

set +e
bash .claude/scripts/check-mirror-map.sh
REVERTED_EXIT=$?
set -e
echo "reverted exit=$REVERTED_EXIT"

echo
echo "=== Summary ==="
echo "baseline exit  = $BASELINE_EXIT (want 0)"
echo "injected exit  = $INJECTED_EXIT (want 2, naming '$MARKER')"
echo "reverted exit  = $REVERTED_EXIT (want 0)"

if [[ "$BASELINE_EXIT" -eq 0 && "$INJECTED_EXIT" -eq 2 && "$REVERTED_EXIT" -eq 0 ]]; then
    echo "PASS: check_mirror market correctly fails on an unmapped TS function and passes once reverted."
    exit 0
else
    echo "FAIL: the falsification proof did not observe the expected exit codes (0 / 2 / 0) — record this as a BLOCKER, not a pass." >&2
    exit 1
fi
