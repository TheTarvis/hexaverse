#!/usr/bin/env bash
# delete-the-lattice — the change's real acceptance criterion, as a single
# runnable script (SDET deliverable, per the orchestrator's task brief).
#
# This is the developers' and QA's acceptance harness. It collects EVERY
# verification grep tasks.md states for sections 1-12 (1.1, 1.3, 1.4,
# 2.1-2.10, 3.1-3.4, 4.2, 4.2b, 4.3, 5.2, 6.1, 6.3, 7.1, 8.10, 10.1, 10.1b,
# 10.1c, 10.2, 10.3b, 12.4, 12.5a/b) and, for each, prints the command, its
# expected result, and PASS/FAIL/INFO — exiting non-zero if any PASS/FAIL
# leg fails.
#
# Two kinds of leg:
#   - PASS/FAIL legs assert a grep returns nothing (or, for a small number,
#     returns something — noted per-leg). These are the change's real
#     acceptance gate and are meant to be run to a clean PASS after every
#     section 2-10 task lands.
#   - INFO legs are baselines or mechanically-derived file lists tasks.md
#     itself says not to trust as a fixed enumeration (1.4, 2.10) — they
#     always "pass" (exit 0 contribution) but print their output for a human
#     to read, because their job is "derive the list", not "assert empty".
#
# Run from anywhere; the script cds to the repo root itself.
#
# IMPORTANT — read before running:
#   - Written and dogfooded against macOS's default /bin/bash (3.2 — no
#     `lastpipe`, no associative arrays). Do NOT pipe a command's output
#     directly into a result-recording function (`cmd | record ...`): bash
#     3.2 runs every stage of a pipeline, INCLUDING THE LAST, in its own
#     subshell, so any PASS_COUNT/FAIL_COUNT/INFO_COUNT/FAILED_LEGS update
#     made inside that function is silently lost the instant the pipe
#     completes — every run would print a correct-looking per-leg PASS/FAIL
#     but a "0 pass, 0 fail, 0 info" summary and ALWAYS exit 0, regardless of
#     real failures. (Caught by dogfooding an earlier, pipe-based version of
#     this exact script.) Every check below therefore captures its command's
#     output into a plain variable via command substitution FIRST, in the
#     main shell, and passes that string as an ARGUMENT to record_empty /
#     record_nonempty / record_info — no pipe into a function anywhere.
#   - Sections 12.4/12.5a run against a SCRATCH COPY of openspec/ per
#     tasks.md 12.1 (archive rehearsal), never the live tree — this script
#     runs their commands against the LIVE tree instead and labels the
#     result INFO, because a scratch copy is a manual, one-time rehearsal
#     step this script cannot safely automate (it would have to archive a
#     copy of openspec/ on every run). Section 12.5b runs against the real
#     repo (as tasks.md itself specifies) and IS a PASS/FAIL leg.
#   - Run at SDET red handoff (before any development), this script is
#     EXPECTED to report many FAILs — the whole surface it checks has not
#     been deleted yet. That is not a bug in the script; see the "expected
#     red before implementation" section of link9-red-coverage.md for the
#     leg-by-leg breakdown captured at handoff time.
#   - Several greps below scan `backend/` or `.` recursively; a stray build
#     artifact (a compiled binary checked out or left in the tree) can make
#     a naive `grep -rn` slow or noisy. Every recursive grep here passes
#     `-I` (skip binary files) for exactly that reason — do not drop it if
#     you copy a leg out for ad-hoc use.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

PASS_COUNT=0
FAIL_COUNT=0
INFO_COUNT=0
FAILED_LEGS=""

# record_empty NAME EXPECTED_DESC OUTPUT -- PASSes if OUTPUT is empty.
record_empty() {
    local name="$1" expected="$2" out="$3"
    echo "--- $name ---"
    echo "expected: $expected"
    if [[ -z "$out" ]]; then
        echo "PASS (empty)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "FAIL — found:"
        echo "$out" | sed 's/^/    /'
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILED_LEGS="$FAILED_LEGS
  - $name"
    fi
    echo
}

# record_nonempty NAME EXPECTED_DESC OUTPUT -- PASSes if OUTPUT is non-empty
# (a small number of legs assert a repointed site EXISTS).
record_nonempty() {
    local name="$1" expected="$2" out="$3"
    echo "--- $name ---"
    echo "expected: $expected"
    if [[ -n "$out" ]]; then
        echo "PASS (found):"
        echo "$out" | sed 's/^/    /'
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "FAIL — nothing found"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILED_LEGS="$FAILED_LEGS
  - $name"
    fi
    echo
}

# record_info NAME NOTE OUTPUT -- always contributes a pass; prints output
# for a human to read.
record_info() {
    local name="$1" note="$2" out="$3"
    echo "--- $name (INFO — $note) ---"
    if [[ -z "$out" ]]; then
        echo "(no output)"
    else
        echo "$out" | sed 's/^/    /'
    fi
    INFO_COUNT=$((INFO_COUNT + 1))
    echo
}

echo "======================================================================"
echo "delete-the-lattice acceptance greps — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "repo root: $REPO_ROOT"
echo "======================================================================"
echo

# --- Section 1: preconditions -----------------------------------------------

out="$(grep -I -rnE "from '@/lib/(board|polar)'|require\('@/lib/(board|polar)'\)" frontend --include='*.ts' --include='*.tsx' 2>/dev/null \
  | grep -v node_modules | grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/')"
record_empty "1.1 (also 6.1) frontend importers of @/lib/board or @/lib/polar from a surviving path" \
  "nothing" "$out"

out="$(grep -I -rn "board-view" openspec/specs/ 2>/dev/null)"
record_empty "1.3 board-view citations in live specs" "nothing" "$out"

out="$(cd backend && grep -I -rln '"hexaverse/board"\|"hexaverse/polar"' --include='*.go' . 2>/dev/null)"
record_info "1.4 backend Go files importing hexaverse/board or hexaverse/polar" \
  "baseline only — SHALL list exactly the files sections 2-5 remove; re-derive, don't trust a stale count" "$out"

# --- Section 2: backend/system -----------------------------------------------

out="$(grep -I -rn 'Footprint\|\.Fixed\b\|f\.Orbit\|Orbit \*Orbit' backend/system 2>/dev/null)"
record_empty "2.1 system.Orbit / Feature.{Orbit,Fixed,Footprint}" "nothing outside deleted code" "$out"

out="$(grep -I -rn 'PeriodFor' backend/ 2>/dev/null)"
record_empty "2.2 system.PeriodFor" "nothing" "$out"

out="$(grep -I -rn 'featureRingOK\|clampRing' backend/ 2>/dev/null)"
record_empty "2.3 featureRingOK / clampRing" "nothing" "$out"

out="$(grep -I -rn 'r2 == nil\|latticeDrawCount' backend/system 2>/dev/null)"
record_empty "2.6 generateWithStreams nil-r2 mode / latticeDrawCount" "nothing" "$out"

out="$(grep -I -rn 'occlusionRadius2(' backend/ 2>/dev/null | grep -v _test.go | grep -v '^backend/system/fog_source.go:25')"
record_empty "2.8 occlusionRadius2 call sites (excluding its own definition line, per C3)" "nothing" "$out"

out="$(grep -I -rn 'BoardFog' backend/ 2>/dev/null)"
record_empty "2.9 BoardFog" "nothing" "$out"

out="$(cd backend && grep -l -E 'clampRing|featureRingOK|generateWithStreams|PeriodFor|Footprint|LaneGates\(|Orbit\.(Ring|Angle0|Dir)|latticeDrawCount' system/*_test.go 2>/dev/null)"
record_info "2.10 system test files touching lattice-era symbols" \
  "baseline only — derive mechanically each run; today 21 files at authoring, DO NOT hardcode this count" "$out"

# --- Section 3: backend/stations ---------------------------------------------

out="$(grep -I -rn 'DeriveOrbit' backend/ 2>/dev/null)"
record_empty "3.1 stations.DeriveOrbit" "nothing" "$out"

out="$(grep -I -rn '\.Orbit\b' backend/stations/ 2>/dev/null)"
record_empty "3.2b stations.Station.Orbit" "nothing" "$out"

out="$(grep -I -rn 'angle0' frontend --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v node_modules | grep -v '^frontend/lib/board/')"
record_empty "3.2c frontend Station.orbit angle0 literal (outside frontend/lib/board, which section 6 deletes)" \
  "nothing outside frontend/lib/board/ (which is itself deleted by task 6.2 — until then this leg tolerates ONLY frontend/lib/board/ hits, already excluded above)" "$out"

# --- Section 4: tuning / params -----------------------------------------------

out="$(grep -I -rn 'OrbitBasePeriod\|OrbitPeriod' backend/ 2>/dev/null)"
record_empty "4.2 OrbitBasePeriod / OrbitPeriod" "nothing" "$out"

out="$(grep -I -rn 'MsPerTile\|InterceptHorizon' backend/ 2>/dev/null)"
record_empty "4.2b MsPerTile / InterceptHorizon" "nothing" "$out"

out="$(grep -I -rn 'BoardRadius' backend/ 2>/dev/null)"
record_empty "4.3 (+4.1) BoardRadius" "nothing" "$out"

# --- Section 5: package deletion ----------------------------------------------

out="$(grep -I -rn 'hexaverse/board\|hexaverse/polar' backend/ 2>/dev/null)"
record_empty "5.2 hexaverse/board or hexaverse/polar imports (incl. comments/string literals)" "nothing" "$out"

# --- Section 6: frontend mirrors ----------------------------------------------
# 6.1 is the same command as 1.1, run again after sections 2-5 (a backend
# change can add a frontend type import); not re-run separately here since
# the command and expectation are identical — see 1.1 above.

out="$(grep -I -rn 'systemBoard\|lib/board\|lib/polar\|ring\b.*slot\b' frontend --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v node_modules)"
record_empty "6.3 frontend lattice vocabulary sweep (systemBoard / lib/board / lib/polar / ring..slot)" "nothing" "$out"

# --- Section 7: fixtures -------------------------------------------------------

out="$(grep -I -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null \
  | grep -v '^./docs/plans/' | grep -v '^./docs/handoffs/' | grep -v '^./docs/defects/' \
  | grep -v '^./docs/specs/' | grep -v '^./openspec/changes/archive/' \
  | grep -v '^./openspec/changes/delete-the-lattice/')"
record_info "7.1 fixtures/board or fixtures/polar citations outside the historical-record allow-list" \
  "expect nothing once task 7.1's sixteen named repoints land; run as INFO here because — per tasks.md's own note — at this point in the sequence it ALSO legitimately returns openspec/specs/cross-stack-determinism/spec.md and openspec/specs/board-tactical-math/spec.md, cleared only by sections 12-13, so this leg cannot be a clean PASS/FAIL until the whole change (not just 7.1) has landed" "$out"

# --- Section 8: enforcement ----------------------------------------------------

out="$(grep -I -rn 'components/board' .claude/ 2>/dev/null)"
record_empty "8.10 leg 1: components/board carve-out" "nothing" "$out"

out="$(grep -I -rn 'components/space/webgl' .claude/ 2>/dev/null)"
record_nonempty "8.10 leg 2: components/space/webgl repointed carve-out" \
  "the repointed predicate/comment (non-empty)" "$out"

# --- Section 10: whole-tree sweep ----------------------------------------------

# --- The 10.1/10.2 exemption block — READ BEFORE TOUCHING EITHER LEG ------------
# Adversary round 7 MAJOR-2, as SUPERSEDED by the orchestrator's addendum ruling
# of 2026-09-04 ("Addendum — MAJOR-2's fix REVISED after the SDET measured it",
# parts A-E, in link9-adversary-r7.md). MAJOR-2's original three-exemption text
# is NOT what these legs implement: measurement showed it was too broad in one
# place and too narrow in another. tasks.md 10.1/10.2 are being rewritten to the
# exact filter set below, so harness and task stay byte-consistent. Three
# exemptions per leg, each with its cause and its measured blast radius at
# c74766f + this change's RED suite:
#
#   10.1:
#     (i)   --exclude-dir=.next --exclude-dir=.next-e2e — gitignored Next.js
#           build output is not source; the sweep's subject is source residue and
#           no source edit can ever clear a compiled bundle (ruling D).
#           Removes 17 lines.
#     (ii)  '^./openspec/changes/delete-the-lattice/' — a PATH exclusion of this
#           change's own folder, which cannot describe a deletion without naming
#           the deleted paths (ruling C). Removes 81 lines. PRE-ARCHIVE ONLY:
#           after `openspec archive` the folder moves under
#           openspec/changes/archive/, which the allow-list above already covers,
#           and this filter becomes dead. It REPLACED a `grep -v
#           'delete-the-lattice'` CONTENT filter whose 79-line reach was
#           invisible; measured identical at file granularity, so this is a
#           strict narrowing, not a behaviour change.
#     (iii) 'commit_params_validator_continuous_test.go' — this change's own RED
#           file, whose :13/:20 prose says `backend/board` is deleted by this
#           change; removed with that file's GREEN rewrite, not before. Removes
#           exactly 2 lines, both of them that prose.
#   10.2:
#     (i)   --exclude-dir=.next --exclude-dir=.next-e2e — same cause (ruling D).
#           Removes 42 lines.
#     (ii)  'sub-lattice' — LOAD-BEARING MATHEMATICS in
#           backend/system/phase_reachability_test.go: task 2.11's replacement
#           coverage asserts the continuous phase draw is not confined to a
#           coarse sub-lattice OF THE TURN — a lattice of real numbers, nothing
#           to do with the deleted board. Renaming it would make the test's own
#           failure message lie. Removes 7 lines, ALL in that one file.
#     (iii) -Ev 'RED-phase .*delete-the-lattice' — the red-manifest HEADER FORM
#           and nothing else. The change id CONTAINS the swept word and the
#           manifest convention heads every RED test with the id it belongs to,
#           so every RED file fails the sweep by OBEYING the convention. Removes
#           exactly 4 lines, each a file's line-3 header
#           (action/commit_params_validator_continuous_test.go,
#           fleet/jump_parked_at_target_gate_not_attached_test.go,
#           refuel/parked_at_station_not_attached_test.go,
#           system/phase_reachability_test.go — all four survive their own GREEN
#           step; a RED file GREEN deletes would need no exemption).
#
# WHAT IS DELIBERATELY *NOT* EXEMPTED (ruling B) — do not re-add any of these:
#   - NO blanket `grep -v 'delete-the-lattice'` on either leg. On 10.2 that
#     filter hid SIX prose lines in TRACKED files that cite this change by id:
#     backend/system/{fog.go:22, model.go:130,
#     interior_wire_lattice_removal_test.go:209,
#     generator_continuous_test.go:327,339,383}. They sit on code this change
#     deletes, so they must genuinely VANISH with the implementation; under a
#     blanket id filter the gate goes blind on exactly the residue class Goal 2
#     exists to kill. All six ARE visible in 10.2's output today and are part of
#     its expected-red baseline — verify they are gone at the gate.
#   - No `TestInteriorRead_...` filter on 10.1: tasks.md 10.1 does not grant it
#     and it matches 0 lines of this leg's pattern set (deviation upheld, r7).
#   - No `sub-lattice` filter on 10.1: it removes 0 lines there — 10.1's patterns
#     are paths, and a line naming a deleted path is residue whatever else it
#     says. Dropping a zero-effect filter is narrowing, never slack.
#   - No `commit_params_validator_continuous_test.go` filter on 10.2: after
#     ruling A's rewording that file's only surviving `lattice` hit is its
#     header, already covered by 10.2 (iii). Removes 0 lines, so it is not
#     carried.
#
# Ruling A closed, by REWORDING the comments rather than exempting them, the
# five RED-artifact hits no line-oriented filter could reach
# (phase_reachability_test.go:4,20,22,103 and
# commit_params_validator_continuous_test.go:10) plus a sixth that ruling B's
# removal of the blanket id filter newly exposed (phase_reachability_test.go:25,
# "post-delete-the-lattice" -> "post-deletion"). SDET-owned, comment-only, no
# assertion / test name / failure-message string touched, logged with cause in
# link9-red-coverage.md and the red manifest re-recorded. RED artifacts now
# contribute ZERO surviving hits to either leg.
#
# DO NOT WIDEN these filters. The REMAINDER of both sweeps is still required
# EMPTY: a wholesale waiver of 10.2 is exactly how the silently-inert residue
# Goal 2 exists to kill would reach the archive. Measured at this re-handoff,
# with the filters above and nothing else: 10.1 = 182 hits, 10.2 = 592 hits —
# every one of them the not-yet-deleted surface (expected RED; see
# link9-red-coverage.md). Re-measure and re-record these two numbers here if you
# ever change a filter.
out="$(grep -I -rn 'backend/board\|backend/polar\|frontend/lib/board\|frontend/lib/polar\|fixtures/board\|fixtures/polar\|board-tactical-math\|polar-lattice-math' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.next-e2e 2>/dev/null \
  | grep -v '^./openspec/changes/archive/' | grep -v '^./docs/plans/' \
  | grep -v '^./docs/handoffs/' | grep -v '^./docs/defects/' | grep -v '^./docs/specs/' \
  | grep -v '^./openspec/changes/delete-the-lattice/' \
  | grep -v 'commit_params_validator_continuous_test.go')"
record_empty "10.1 whole-tree sweep, outside the historical-record allow-list (plus the three exemptions ruled in r7's addendum — see the block above)" "nothing" "$out"

out="$(grep -I -rnE '"board"|"polar"|\(board |[( ]polar[) ]|\./board/|\./polar/' .claude .gitlab-ci.yml infra 2>/dev/null)"
record_empty "10.1b bare-token sweep of .claude/.gitlab-ci.yml/infra (C15: misses .gitlab-ci.yml:371 and infra/docker/test-runner.Dockerfile:5 — verify those two BY HAND, this leg cannot see them)" \
  "nothing (but see the C15 caveat above — a clean run here is NOT sufficient proof those two sites are gone)" "$out"

out="$(grep -I -rnE '\b(board|polar)\.[A-Za-z]' backend --include='*.go' 2>/dev/null \
  | grep -v 'market/board_integration_test.go')"
record_empty "10.1c leg 1: backend symbol citations of board./polar. (excluding market's own price-board Venues/RefreshCadenceMs)" \
  "nothing" "$out"

out="$(grep -I -rnE '\b(board|polar)\.[A-Za-z]' frontend --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v node_modules \
  | grep -v 'components/market/MarketBoardPanel.tsx' | grep -v 'app/spike/hex-board/mock-system.ts' \
  | grep -v 'lib/types/system-space.ts')"
record_empty "10.1c leg 2: frontend symbol citations of board./polar. (excluding the price-board panel and two filename-based false positives)" \
  "nothing" "$out"

# The 10.2 half of the exemption block above — read it before touching this leg,
# including the six TRACKED prose lines that are deliberately still visible here.
out="$(grep -I -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-e2e 2>/dev/null \
  | grep -v 'TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse' \
  | grep -v 'sub-lattice' \
  | grep -Ev 'RED-phase .*delete-the-lattice')"
record_empty "10.2 case-insensitive 'lattice' sweep (excluding the one surviving wire-contract guard's test name, plus the three exemptions ruled in r7's addendum)" \
  "nothing but that one test function name (which itself must still appear exactly once, unchecked by this leg)" "$out"

out="$(grep -I -rn 'time\.Now()' backend/space backend/disclosure backend/charts --include='*.go' 2>/dev/null | grep -v _test.go \
  | grep -v '^backend/space/vec.go:10:')"
record_empty "10.3b world-clock widening: no real time.Now() call in space/disclosure/charts (excluding the doc-comment mention)" \
  "nothing" "$out"

# --- Section 12: archive rehearsal (informational against the LIVE tree) ------

out="$(grep -I -rn 'board-tactical-math' openspec/specs/ 2>/dev/null)"
record_info "12.4 board-tactical-math citations in openspec/specs/" \
  "run against a SCRATCH COPY after hand-deleting openspec/specs/board-tactical-math/ per tasks.md 12.1-12.4 — against the LIVE tree (this run) it correctly finds the spec's own directory and is not a failure" "$out"

RETIRED_TITLES_FILE="$(mktemp)"
trap 'rm -f "$RETIRED_TITLES_FILE"' EXIT
{
  # 22 board-tactical-math requirement titles (derived mechanically —
  # re-run this extraction rather than trusting a hardcoded count if
  # board-tactical-math/spec.md changes before archive):
  if [[ -f openspec/specs/board-tactical-math/spec.md ]]; then
    grep '^### Requirement:' openspec/specs/board-tactical-math/spec.md | sed 's/^### Requirement: //'
  fi
  # The six REMOVED+ADDED pairs' ORIGINAL (retired) titles (design.md
  # Decision 2's table):
  cat <<'EOF'
Square Roots In Rules Are Pinned, Not Assumed
Lazy, Deterministic Interior Generation
Interiors Emit Continuous Orbital Elements For Every Body
Orbital Radii Ascend With the Skeleton Ordinal and Are Separated
A Retrograde Orbit Is Expressed By Inclination, Never By a Non-Positive Period
Station Is a Dockable, Non-Mineable Board Feature
EOF
  # The five pure REMOVED requirement titles:
  cat <<'EOF'
Orbital Period Read from Live Tuning
Interior Feature Decode Validates Ring Against the Live Schedule
Lattice Placement Is Independent Of The Continuous Stream
Deterministic, Non-Core, Off-Gate-Ring, Prograde, Orbiting Placement
A Station Orbit Outside the Live Board Radius Is Omitted, Never Panicked
EOF
} > "$RETIRED_TITLES_FILE"

TITLE_COUNT="$(wc -l < "$RETIRED_TITLES_FILE" | tr -d ' ')"
echo "--- 12.5 retired-title list built: $TITLE_COUNT lines (want 33) ---"
echo

out="$(grep -F -f "$RETIRED_TITLES_FILE" -rn openspec/specs/ 2>/dev/null)"
record_info "12.5a leg one (scratch-copy only): retired-title citations inside openspec/specs/" \
  "run against a SCRATCH COPY per tasks.md 12.1 — against the LIVE tree (this run) every board-tactical-math title trivially self-matches its own still-live spec file, so this is not a meaningful pass/fail until archive" "$out"

out="$(grep -F -f "$RETIRED_TITLES_FILE" -rn . --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=archive --exclude-dir=handoffs --exclude-dir=plans 2>/dev/null \
  | grep -v '^./openspec/specs/board-tactical-math/')"
record_empty "12.5b leg two: retired-title citations across the whole real repo (excluding board-tactical-math's own still-live spec, cleared only by section 13's hand-delete)" \
  "nothing outside openspec/specs/board-tactical-math/ itself (already excluded above) — six known citations are named in tasks.md 12.5b and must be repaired by name: fixtures/determinism-register.json, generator_continuous_test.go, continuous_test.go, generate_streams_test.go, generator.go, no_lattice_dock_predicate_test.go" "$out"

# --- Summary -------------------------------------------------------------------

echo "======================================================================"
echo "SUMMARY: $PASS_COUNT pass, $FAIL_COUNT fail, $INFO_COUNT info"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo "FAILED LEGS:$FAILED_LEGS"
fi
echo "======================================================================"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
    exit 1
fi
exit 0
