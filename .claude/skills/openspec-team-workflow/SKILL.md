---
name: openspec-team-workflow
description: Orchestration playbook for the OpenSpec agent team - phase pipelines, reviewer panel selection matrix, finding routing and conflict tie-breaks, repair-loop convergence rules, gate criteria, delegation prompt requirements. Load when orchestrating the OpenSpec team across a design-to-spec or spec-to-implementation run.
---

# OpenSpec Team Workflow (Orchestration Playbook)

The team's structure exists to keep four separations absolute: **authors don't judge their own work** (writer vs. adversary/panel), **judges don't edit** (reviewers report; writer applies), **builders don't accept their own build** (devs vs. QA/SDET), **implementers don't touch tests** (SDET writes the failing suite first; devs make it pass and may never alter it). Every orchestration decision defends these lines.

The team practices strict TDD in Phase 2: tests derive from scenarios and exist red before production code; implementation changes to satisfy tests, never the reverse. A written test changes only via the SDET, and only for a spec change or an adjudicated test defect — a red build is never a reason.

## Spec-first invariant (no vibe coding)

Production code changes ONLY as implementation of a validated, adversary-reviewed OpenSpec change. The full trace must hold for every edit: **code ← task (tasks.md) ← scenario/requirement (delta) ← change ← design intent.** Anything that breaks the chain is drift being manufactured.

- **No exemptions by size or urgency.** A one-line fix gets a minimal fast-tracked change — tiny proposal, one requirement/scenario delta, one task — through writer → validator → adversary (the panel may be skipped; the adversary may not). Fast-track shrinks the artifacts, never the gates.
- **No opportunistic edits.** "While we're in there" refactors, adjacent bug fixes, and unrequested hardening are reported as proposed tasks/changes, not done. A diff that exceeds the change's stated Impact is a finding against the developer.
- **Drift handling.** When code and `openspec/specs/` are found to disagree, the orchestrator adjudicates which side is wrong: code wrong → corrective change through the pipeline; spec wrong about pre-existing behavior → baseline correction via the brownfield agent (with its baseline-mode adversary audit). Silently editing either side to match the other is forbidden — that's how drift compounds invisibly.
- **Archive closes the loop.** Implemented behavior isn't "done" until its change is archived and the deltas are merged into `openspec/specs/` — unarchived-but-shipped changes are scheduled drift.

## Entry modes (Phase 0)

| Starting state | Route | Why |
|---|---|---|
| Existing code, affected capabilities unspecced | `openspec-brownfield` retrofits baseline specs for those capabilities first (it writes `openspec/specs/` directly — the one sanctioned exception to specs-change-only-via-archive, because baselines document current truth) | MODIFIED/REMOVED deltas must target existing requirement headers |
| Net-new app (idea/brief, no code) | `openspec-greenfield` scaffolds, writes project.md, draws the MVP line, produces the foundational analysis (replaces the analyst for the first change); confirm the MVP line with the user before authoring (under `--full-auto`: draw it from the design input's stated scope and record where it was drawn) | greenfield's failure mode is speccing a fantasy — the MVP gate contains it |
| Specs already cover the affected capabilities | straight to Phase 1 | steady state |

Brownfield discipline: baselines document what the code DOES — suspected defects are flagged in the report, never canonized as SHALLs nor silently "corrected"; behavior changes go through normal changes. A brownfield retrofit followed by a change to the same capability is two steps, not one. Retrofitted baselines get a **baseline-mode adversary audit** (spec-vs-code, the codebase as source of truth) before any delta targets them — a wrong baseline poisons every change built on it.

## The adversary is non-skippable

Proportionality applies to the panel, never to the adversary. Every path ends in adversarial review before its output is trusted: authored changes (change mode, vs. the design doc), brownfield baselines (baseline mode, vs. the code), resumed changes whose content changed since their last verdict (a spec edit expires the prior verdict). Small change, tight deadline, "the panel already looked at it" — none of these are exemptions. An orchestration run that presents or implements a spec with no current adversary verdict is misconfigured.

## Panel selection matrix (Phase 1, step 3)

| Reviewer | Include when the change... | Skip when... |
|---|---|---|
| architect | spans capabilities, crosses the Next.js/Go seam, or needs design.md | single-capability text-level tweak |
| ux | has ANY user-facing surface (UI, emails, error text, CLI output) | pure backend/internal |
| security | adds endpoints/actions, accepts input, touches auth or sensitive data — **default include**; it self-exits cheaply | provably no surface |
| reliability | adds external deps, cross-service calls, queues, or availability-relevant behavior | pure UI copy/logic change |
| dba | touches persistent data at all (schema, queries, retention) | stateless change |

Launch selected reviewers **in parallel, each with the same inputs**: design doc path, change-id, and the instruction to return findings with paste-ready delta text.

## Finding routing and consolidation

1. Collect all panel findings; **dedupe before routing** (ux and reliability both flag double-submit; security and dba both flag SQL injection — merge, credit both).
2. Resolve inter-reviewer conflicts BEFORE the writer sees them, by standing tie-break: **architect wins on technical shape, security wins on controls, dba wins on data integrity mechanics, ux wins on user-observable behavior** — and any conflict touching the design doc's explicit intent goes back to the design doc (or becomes an open question).
3. Send the writer ONE consolidated revision pass, not five sequential ones — sequential passes churn the same files and invalidate earlier reviewers' reads.
4. Findings tagged as **spec gaps** by downstream agents (QA, SDET, adversary) always route to the writer, never get patched ad hoc by developers.

## Repair-loop convergence (Phase 1, step 6)

- Adversary → writer → validator, max **3 rounds**. Each round the adversary verifies prior findings were actually fixed, then spot-checks only revised areas.
- Not converging? Diagnose before looping: findings disputed by the writer → orchestrator adjudicates against the design doc; findings requiring information nobody has → they're **open questions**, record and exit the loop; findings recurring in new text → the writer needs the finding's *principle*, not just its instance — restate it as a rule.
- Open questions NEVER block validation-clean specs from being presented — they ship in design.md `## Open Questions` and in your report. Silence is the only failure mode.

## Gates

- **Phase 1 → user**: validator PASS (`--strict`) + adversary "no material findings" (or round-cap with open items listed). Present spec; stop unless end-to-end delivery was requested.
- **Phase 1 → Phase 2**: user approval (explicit, a prior end-to-end mandate, or a `--full-auto` run).
- **Kickoff → Build (red gate)**: impl contract in `docs/handoffs/`; SDET red handoff delivered — coverage table in `docs/handoffs/<id>-red-coverage.md` accounts for **every scenario** (`assertion-red` / `compile-red` / `already-green` / `Playwright, deferred` / `reasoned-not-automated`), every written test confirmed failing for the right reason, red manifest recorded. The red suite is unit and integration only. Developers do not start before this gate.
- **Build → Verify (green gate)**: all tasks checked or explicitly blocked; the SDET suite fully green at tiers 1 and 2.
- **Verify → Journey**: SDET integrity check clean (manifest verify) + QA matrix with every row PASS or BLOCKED-awaiting-journey + security/dba implementation audits clear + zero unchecked tasks. Any FAIL is one batched dev round and one re-verification, not a loop.
- **Journey → Archive**: tree locked; journey spec written; tier 4 and tier 3 run once each and green — or red once, one batched revision round, and green on the single rerun. `docs/handoffs/<id>-journey.md` written with the suite budget line. QA's BLOCKED rows closed from it. `openspec-reconcile.py` clean. Then `openspec archive <id> --yes`.
- A gate that can't be evaluated (QA BLOCKED, validator can't run) halts the pipeline with a report — never waved through.

## Delegation prompt requirements

Subagents start with zero context. Every delegation includes: the design doc **path** (not a summary — summaries launder ambiguity), the change-id and its folder path, the agent's phase-appropriate task, what to return (findings format / files written / verdict), and for revision passes: the **path** to the findings file in `docs/handoffs/` — the reviewer's own report or the consolidated set with every accepted finding restated in full. Never paraphrase one agent's findings to another — paraphrase drops the quoted evidence the fix depends on.

Delegations never carry test commands, suite timeouts, or standing prohibitions copied from a previous delegation. They cite `docs/testing-tiers.md` for the former. A prohibition names its cause ("do not regenerate X *because* defect D is open") so the agent can check whether the cause still holds — an inherited rule is never re-derived by the agent following it, and hexaverse carried one four days past the fix that dissolved it.

## Handoff files are the state

`docs/handoffs/README.md` names the file each phase writes. The orchestrator's context is a cache of those files, not the source: a fresh orchestrator resuming a change reads `<id>-rulings.md`, the latest `<id>-adversary-r<N>.md`, `<id>-impl-contract.md`, `<id>-red-coverage.md`, and `red-manifest-<id>.txt`, and continues from the right stage. This is what makes a long chain affordable — the orchestrator can be dropped between links instead of carrying every link's transcript.

Consolidation discards findings unless every accepted finding is restated in full; when a reviewer's own report was never persisted and the artifact has since changed, the recovery is to re-run the reviewer against the current artifact, not to reconstruct what it said.

## Verdict expiry and re-attack scope

An adversary verdict records the commit it was issued at (`<id>-adversary-r<N>.md`). It is current while `git diff <verdict-sha> -- openspec/specs/<touched capabilities> openspec/changes/<id>` is empty. When it is not, the re-attack scope is **that diff** — the clauses whose live targets or delta text changed — plus a verification that prior findings stayed fixed. Not a full re-attack. The common trigger is archiving a predecessor change whose deltas landed in the specs this change targets.

## Chains (`/team --chain <chain doc>`)

A chain doc (`docs/plans/<chain>/chain.md`) lists changes in archive order with what each delivers and its state. Running a chain means, per link:

1. Confirm the link's adversary verdict is current by diff; re-attack only the diff if not.
2. Phase 2 through the journey and archive, as above.
3. Record the archive commit in the chain doc's state column, plus what the link taught.
4. Move to the next link with a **fresh orchestrator** reading the chain doc and the handoff files — never one orchestrator carrying every link.

Links are sized to 20–40 tasks; a link that grows past that under panel review is split before authoring continues (hexaverse's links grew from 47 to 131 tasks, and every adversary round and dev pass re-read all of it). Archiving link N is the moment link N+1's verdict most likely expires; check by diff before implementing it, not by re-running the whole harden phase.

A plain chain run implements **authored** links only: the first link with no `openspec/changes/<id>/` folder stops it, because there is no verdict to check and nothing to build.

### Full-auto chains (`--full-auto`)

`--full-auto` lifts every user gate and nothing else. Per link, in addition to the four steps above:

1. **An unauthored link is authored in-run, after its predecessor archived** (so its MODIFIED deltas target specs that exist). Design input is the chain doc: the link's row, the open-decisions section, the "taught" records of archived links, and every source document the doc names for that link. Full Phase 1 — analyst → writer → panel → validator → adversary loop — no shortcuts because "the roadmap already described it".
2. **Open questions are ruled, not asked.** Precedence: the chain doc's or design input's recorded recommendation → a settled decision in the root `CLAUDE.md` / `openspec/project.md` → the panel's recommendation → the most reversible option (one migration, one flag, or one file to undo, no backfill). Each ruling is written to `docs/handoffs/<id>-rulings.md` as a `FULL-AUTO RULING` with its basis, the alternatives rejected, and the reversal cost, and the writer authors from the ruling. A ruling with a recorded basis is a decision; a choice without one is a guess, and guesses are forbidden.
3. **Hard stops.** A question that needs information nobody in the repo has — a credential, an external account, a product call with no recorded lean anywhere — halts the chain before authoring, with the question in the report. So does BLOCKER residue at the adversary round cap; MAJOR/MINOR residue becomes a follow-up change and the chain continues.
4. **The verdict gets a real commit.** After the adversary clears, commit the change folder and handoffs, append that hash to the latest `<id>-adversary-r<N>.md` as the verdict commit for currency checks, and set the chain doc state to `authored r<N> <hash>` — then run the ordinary currency check and build. Without this step the next currency diff sees an untracked folder and can never be current.
5. **Splits still fire.** Past 40 tasks, split at the link's pre-identified seam (or the architect's); the second half's row goes into the chain doc right after the first, state `authored`, and is picked up as the next link.

Everything else holds unchanged: the adversary is non-skippable, TDD is strict, the archive gate is the single journey run, one fresh orchestrator per link.

## Parallelism map

- Parallel-safe: panel reviewers (read-only) · nextjs-dev + golang-dev AFTER the SDET's red handoff · QA + security/dba implementation audits (after the SDET integrity check) · the SDET writing the journey spec while QA verifies the matrix.
- Sequential by necessity: analyst → writer → panel → writer revision → validator → adversary · architect kickoff (contract) → SDET red suite → dev work → SDET integrity check → QA/audits → journey → archive.
- **Exclusive by necessity: the journey run.** Nothing edits the tree while tier 3 or tier 4 runs, and the two never run concurrently (one emulator project). A developer editing during a run produced hot-reload reds that cost hexaverse a full cycle.
- One writer at a time per change — two writer instances editing one change folder race on tasks.md and deltas.

## Failure playbook

| Situation | Action |
|---|---|
| Dev reports spec conflict mid-build | halt that task; route to writer (mini Phase 1: writer → validator → affected reviewer); resume with revised spec |
| Dev disputes a test | halt that task; adjudicate against the spec's scenario text. Dev is right → SDET (only the SDET) revises the test, logged with cause. Dev is wrong → dev implements to the test as written. Never let the dev "resolve" it in code+test simultaneously |
| Spec changes mid-build (from any route) | revised scenarios go to the SDET first — tests update to the new spec red/green cycle before dev work resumes on the affected tasks |
| Integrity check finds altered/skipped tests | BLOCKER: treat the associated tasks as falsely complete; restore tests via SDET, return tasks to the responsible dev; report the violation to the user — never quietly fix and pass |
| QA FAIL | batch every FAIL from the pass into one round to the owning devs with QA's repro verbatim; one re-verification of FAILed rows + capability siblings |
| Journey red | collect **every** finding from the run — test-side misreadings and product defects alike — into one batched revision round (writer for spec gaps → adversary spot-check of revised clauses only → SDET → dev), then one rerun. Never a round per red leg; never a raised timeout |
| Suite overruns its timeout | report the wall time and stop; raising the budget is not a fix (a growing suite hides a real hang). Fixture sharing or a package split is the user's decision, filed as a follow-up |
| Foreground command killed by the tool timeout | not a test failure — do not rerun in the foreground; rerun once in the background with a log file |
| Adversary rounds converge to residue only | convergence, not another full attack: verify residue, rule MAJOR/MINOR forward as a follow-up change at the cap, BLOCKERs stop the run for the user |
| Validator BLOCKED (content missing, e.g. requirement without scenario) | writer, not validator, supplies content |
| CLI absent | scaffold per `openspec-conventions`, validate manually, tell the user to install `@fission-ai/openspec` |
| Two in-flight changes touch one requirement | surface to user — sequencing changes is a product decision, not yours |
| User asks for a direct code edit / "quick fix" with no change | don't code; fast-track a minimal change (writer → validator → adversary) and implement THAT — explain the one extra step to the user |
| Agent reports code-vs-spec drift | adjudicate: code wrong → corrective change; spec wrong about pre-existing behavior → brownfield baseline correction + adversary audit. Never silently edit either side |
| Dev's diff exceeds the change's stated Impact | finding against the dev: revert the out-of-scope edits or spec them as a follow-up change; they don't ride along |
