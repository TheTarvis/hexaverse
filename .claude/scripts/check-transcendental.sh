#!/usr/bin/env bash
#
# Cross-stack determinism lint (openspec capability: cross-stack-determinism).
#
# Rule-bearing values must cross the Go<->TS seam by exact arithmetic or a
# discretized choice. Go and JS do NOT agree on transcendental functions
# (sin/cos/atan2/...), ECMAScript's Math.sqrt is implementation-approximated
# rather than correctly-rounded, and math.Round vs Math.round is a GUARANTEED
# disagreement on every negative half-integer (Go rounds half away from zero,
# JS half toward +Inf). So in the packages this lint governs, a call to any of
# those is forbidden unless the line carries a reviewed pragma or the site is
# named in the capability's deviation register:
#
#   determinism:allow(discretized) — result immediately reduced to a discrete
#       choice among a finite, tie-broken candidate set (e.g. LaneGateHex)
#   determinism:allow(projection)  — render-only pixel math, never persisted,
#       never a solve result, never an ETA input, never a mutation input
#
#   fixtures/determinism-register.json — a KNOWN, FILED, not-yet-fixed
#       violation (open defect under docs/defects/). Register entries naming
#       this check ("transcendental-drift") suppress exactly the file:line
#       sites they list, and fail here if their defect is no longer open.
#
# A pragma marks a reviewed, sanctioned exception; a register entry marks an
# open defect. Never pragma a defect site — file it and register it.
#
# Scope: non-test .go files under the rule-bearing backend packages
# (board, polar, fleet, mine, galaxy, system, corporations, market — the
# packages whose outputs are persisted values, solve results, ETAs, or
# disclosure decisions) and non-test .ts files under frontend/lib/board/ and
# frontend/lib/polar/ (the two board-math mirrors; openspec
# board-tactical-math bars runtime trig AND sqrt outright from both pairs'
# rule-bearing surfaces — geometry runs on the pinned coordinate table, whose
# trigonometry executes only in the fixture-recording flow, i.e. in test
# files this lint already skips). Test files are skipped (they assert
# against fixtures and hold no rule logic; the recording flow lives there by
# design).
# Comment-only lines are skipped (prose naming Math.round is not a call
# site).
#
# NOTE: this lint is textual and SECONDARY — it cannot see FMA contraction
# (a + b*c), the majority hazard class. The primary mechanisms are the
# cross-architecture differential run and check-fma-contraction.sh; see the
# capability's design.md enforcement re-ranking.
#
# Input: JSON with file_path via stdin
# Output: JSON response with pass/fail status
# Exit codes:
#   0 = passed (clean, out of scope, or suppressed by pragma/register)
#   2 = failed (unreviewed call site, or a stale register entry)

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
    echo '{"status": "error", "reason": "No file_path provided"}'
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGISTER="$REPO_ROOT/fixtures/determinism-register.json"

# Scope: rule-bearing Go packages + the TS board-math mirror, production files only.
if [[ "$FILE_PATH" =~ backend/(board|polar|fleet|mine|galaxy|system|corporations|market)/.*\.go$ && ! "$FILE_PATH" =~ _test\.go$ ]]; then
    PATTERN='math\.(Sin|Cos|Tan|Asin|Acos|Atan|Atan2|Sinh|Cosh|Tanh|Asinh|Acosh|Atanh|Log|Log2|Log10|Log1p|Exp|Exp2|Expm1|Pow|Sqrt|Round)\('
    COMMENT_RE='^[0-9]+:[[:space:]]*(//)'
elif [[ "$FILE_PATH" =~ frontend/lib/(board|polar)/.*\.ts$ && ! "$FILE_PATH" =~ \.test\.ts$ ]]; then
    PATTERN='Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|log|log2|log10|log1p|exp|expm1|pow|sqrt|round)\('
    COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'
else
    echo '{"status": "pass", "reason": "Not a determinism-governed production file"}'
    exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
    echo '{"status": "pass", "reason": "File does not exist (deleted?)"}'
    exit 0
fi

# Repo-relative path for register lookup.
REL_PATH="${FILE_PATH#"$REPO_ROOT"/}"

# Register entries for this file naming this check ("transcendental-drift"):
# the line numbers they suppress, and the defect docs whose open status they
# depend on.
ALLOWED_LINES=""
STALE_DEFECTS=""
if [[ -f "$REGISTER" ]]; then
    ALLOWED_LINES=$(jq -r --arg f "$REL_PATH" \
        '[.entries[] | select(.file == $f) | .checks["transcendental-drift"] // [] | .[]] | unique | .[]' \
        "$REGISTER" 2>/dev/null || true)
    while IFS= read -r defect; do
        [[ -z "$defect" ]] && continue
        if ! grep -qE '^\*\*Status:\*\* open' "$REPO_ROOT/$defect" 2>/dev/null; then
            STALE_DEFECTS="$STALE_DEFECTS $defect"
        fi
    done < <(jq -r --arg f "$REL_PATH" \
        '[.entries[] | select(.file == $f and (.checks["transcendental-drift"] != null)) | .defect] | unique | .[]' \
        "$REGISTER" 2>/dev/null || true)
fi

# Candidate violations: pattern hits on non-pragma, non-comment-only lines.
CANDIDATES=$(grep -nE "$PATTERN" "$FILE_PATH" | grep -v 'determinism:allow' | grep -vE "$COMMENT_RE" || true)

VIOLATIONS=""
REGISTERED=""
while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    lineno="${hit%%:*}"
    if echo "$ALLOWED_LINES" | grep -qx "$lineno"; then
        REGISTERED="$REGISTERED $lineno"
    else
        VIOLATIONS="${VIOLATIONS}${hit}"$'\n'
    fi
done <<< "$CANDIDATES"
VIOLATIONS="${VIOLATIONS%$'\n'}"

if [[ -n "$STALE_DEFECTS" && -n "$REGISTERED" ]]; then
    echo "{\"status\": \"fail\", \"reason\": \"Deviation-register entry for $REL_PATH references a defect doc whose **Status:** line no longer reads open:$STALE_DEFECTS. A stale entry is not a valid suppression — the fix change must remove the register entry in the same commit (fixtures/determinism-register.json).\"}"
    exit 2
fi

if [[ -n "$VIOLATIONS" ]]; then
    LINES=$(echo "$VIOLATIONS" | head -5 | sed 's/"/\\"/g' | tr '\n' ' ')
    echo "{\"status\": \"fail\", \"reason\": \"Unreviewed transcendental/sqrt/Round call on a determinism-governed rule path. Go and JS disagree on transcendentals and Math.sqrt; math.Round vs Math.round is a guaranteed divergence on every negative half-integer; transcendentals also differ across Go build targets. Reduce to a discrete tie-broken choice, use roundf's explicit port, or keep it projection-only, then mark the line with determinism:allow(discretized|projection). A KNOWN open defect belongs in fixtures/determinism-register.json instead, referencing its docs/defects/ doc. See openspec cross-stack-determinism. Lines: $LINES\"}"
    exit 2
fi

if [[ -n "$REGISTERED" ]]; then
    echo "{\"status\": \"pass\", \"reason\": \"Clean except sites suppressed by the deviation register (open defects, lines:$REGISTERED) — see fixtures/determinism-register.json\"}"
    exit 0
fi

echo '{"status": "pass", "reason": "No unreviewed transcendental/sqrt/Round calls"}'
exit 0
