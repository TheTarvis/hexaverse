---
name: qa-acceptance-testing
description: Scenario-based acceptance verification method - building the acceptance matrix from OpenSpec deltas, executing against the running system, evidence standards for failure reports, exploratory testing charters, verdict discipline. Load when verifying an implemented OpenSpec change (QA work).
---

# QA Acceptance Testing Against OpenSpec Scenarios

QA's question is narrow and absolute: **does the running system do what every scenario says?** Not "is the code good" (review's job), not "do tests exist" (SDET's job) — does the behavior, observed live, match the spec.

## Build the acceptance matrix

Source: every `#### Scenario:` in `openspec/changes/<id>/specs/**` — not tasks.md (what devs planned), not the code (what devs did). One row per scenario:

| # | Capability | Scenario | Steps (from WHEN) | Expected (quoted THEN) | Verdict | Evidence |

- GIVEN → setup you must arrange; WHEN → actions you perform; THEN/AND → each is a separate check (a scenario with 3 THENs can half-pass — record which clause failed).
- MODIFIED requirements: test ALL their scenarios, not just new ones — the modification may have broken retained behavior.
- Read design.md/project.md for how to run the system; getting it running is your first task, and failing to is a BLOCKED verdict with exact error output, not a silent skip.

## Execute against the real system

- Drive the actual interface the scenario implies: browser for UI scenarios, curl/httpie for API scenarios, real requests with real responses. Check persisted effects where THEN names them (query the DB via the repo's tooling).
- **Verdicts**: PASS (observed = expected, evidence attached) · FAIL (mismatch, evidence attached) · BLOCKED (couldn't execute — say exactly what's missing) · INSPECTED (verified only by reading code — a last resort, never silently upgraded to PASS).
- Evidence standards: the command/request you sent and the verbatim response; for UI, what was on screen (text you observed). Evidence is what makes your FAIL unarguable and your PASS auditable.
- Test failure scenarios by actually inducing the failure: wrong password, malformed payload, deleted resource ID, killed dependency container if the harness allows. "Couldn't induce it" → BLOCKED with the reason, which is itself a testability finding.

## Failure report format

A developer must reproduce from the report alone, zero questions:

```
FAIL — <capability> / Scenario: <name>
Spec: openspec/changes/<id>/specs/<capability>/spec.md
Steps: 1. <exact command/click sequence with real values used>
Expected (quoted): "- **THEN** authentication fails with a retriable error"
Actual (verbatim): HTTP 500 {"error":"internal"} — connection log attached
Severity: MAJOR
Notes: passes with valid TOTP; fails only when code contains whitespace
```

Severity: BLOCKER (data loss, security, core flow broken) · MAJOR (scenario fails) · MINOR (cosmetic deviation from THEN). Narrow the repro before filing — "fails only when X" halves the fix time.

## Exploratory pass (after the matrix, never instead of it)

Time-boxed charters targeting where scripted testing is blind:

1. **Seam charter**: transitions BETWEEN scenarios — do B before A, abandon a flow midway and return, mix two features' state.
2. **Repetition charter**: double-click every submit, back-button after every mutation, refresh mid-operation, replay the same request twice.
3. **Input charter**: boundary ±1 on every stated limit, empty strings, 10k-char strings, unicode/emoji/RTL text, whitespace-padded values.
4. **Session charter**: expired session mid-flow, logged-out retry of a captured URL, two tabs with divergent state.
5. **First-run charter**: brand-new user/tenant with zero data walks every new view — empty states are where implementations lie.

Anything broken files as a finding even without a covering scenario — tagged **SPEC GAP** so the orchestrator routes it to the spec writer as well as the developers.

## Verdict discipline

- Matrix summary: n PASS / n FAIL / n BLOCKED / n INSPECTED, plus exploratory findings and spec gaps.
- Cross-check tasks.md: a `- [x]` task whose scenario FAILs is its own finding (false completion claim).
- One-line verdict: **SHIP** (all PASS, no BLOCKER/MAJOR exploratory findings) · **RETURN TO DEV** (any FAIL) · **BLOCKED** (can't verify). There is no "mostly passing" — a FAIL either blocks or the spec writer must downgrade the scenario, explicitly, in the spec.
- Re-verification rounds: re-run every previously-FAILED row AND its capability's siblings (fixes regress neighbors); spot-check, don't re-run, distant PASSes.
