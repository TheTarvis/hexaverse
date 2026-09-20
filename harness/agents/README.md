# OpenSpec Spec-Driven Development Team

A team of Claude Code subagents that turn design documents into validated [OpenSpec](https://openspec.dev/) changes (`openspec/changes/<change-id>/`) — and can then implement them on a Next.js + Go stack.

## The team

### Entry agents (phase 0 — pick by starting state)

| Agent | Starting state | Role | Writes? |
|---|---|---|---|
| `openspec-brownfield` | Existing codebase, unspecced | Reverse-engineers current behavior (code > tests > schema > docs) into baseline specs under `openspec/specs/`; flags suspected defects instead of canonizing them | baseline specs + project.md |
| `openspec-greenfield` | Net-new app (idea/brief) | Elicits scope and actors, scaffolds `openspec/`, draws the MVP line (IN/NEXT/OUT), produces the walking-skeleton-first change roadmap and foundational analysis | scaffold + project.md only |

### Core spec pipeline

| Agent | Role | Writes? |
|---|---|---|
| `openspec-orchestrator` | Team lead — runs both phases end to end | via delegates |
| `openspec-design-analyst` | Decomposes a design doc into capabilities, requirements, scenarios, ambiguities | read-only |
| `openspec-spec-writer` | Authors proposal.md, spec deltas, tasks.md in exact OpenSpec format | yes |
| `openspec-validator` | `openspec validate --strict` + manual format checklist | mechanical fixes only |
| `openspec-adversary` | Red team — attacks specs for design-doc gaps, ambiguity, untestability; **runs on every path, always** (change mode vs. the design doc; baseline mode vs. the code for brownfield retrofits; re-runs when a resumed change was edited) | read-only |

### Specialist review panel (spec phase)

Read-only reviewers that return findings with paste-ready delta text; the spec writer applies them.

| Agent | Brought in when the change... | Lens |
|---|---|---|
| `openspec-architect` | spans capabilities or the stack (always for big changes) | boundaries, design.md (it authors it), Next.js/Go feasibility |
| `openspec-ux` | has user-facing surface | five UI states, error experience, flow dead ends, a11y requirements |
| `openspec-security` | adds endpoints, input, auth, sensitive data | threat model, authz per requirement, limits, deny-path scenarios |
| `openspec-reliability` | adds dependencies or availability-relevant behavior | failure modes, thresholds not adjectives, rollout/rollback safety |
| `openspec-dba` | touches persistent data | integrity as requirements, migration plan audit, lifecycle/pagination |

### Implementation crew (phase 2, on request)

The crew practices strict TDD: the SDET writes every scenario's test first (confirmed failing), developers implement to make them pass, and no one may edit a test to reach green — test changes require a spec change or an adjudicated test defect, and only the SDET applies them.

| Agent | Role |
|---|---|
| `openspec-sdet` | FIRST: turns every scenario into failing unit/integration tests with a coverage table (end-to-end-only rows are `Playwright, deferred`); AFTER the build: integrity check that no test was altered; AT THE ARCHIVE GATE: writes and runs the one Playwright journey per change |
| `openspec-nextjs-dev` | Makes the SDET's frontend tests pass; test-first for its own units; never edits tests; per-task gate is vitest + tsc, never Playwright; checks off tasks.md |
| `openspec-golang-dev` | Makes the SDET's backend tests pass; same TDD contract; per-task gate is `go test -short` + the touched package's emulator tests, never the full suite; stops on spec conflicts and test disputes |
| `openspec-qa` | Verifies the scenario acceptance matrix against test evidence, drives live only what evidence can't reach, marks journey-only rows BLOCKED until it runs; SHIP / RETURN TO DEV verdict |

Security and DBA return in phase 2 for implementation audits.

## Pipeline

```
Phase 0 — Entry
  existing unspecced code → brownfield (baseline specs) → adversary baseline audit ┐
  net-new app             → greenfield (scaffold + MVP roadmap + analysis)   ├→ Phase 1
  already specced         → straight to Phase 1                             ┘

Phase 1 — Spec
  design doc → analyst → spec-writer → ┌ architect ┐
                              ▲        │ ux        │
                              │        │ security  ├→ writer revision → validator → adversary
                              │        │ reliability│                                   │
                              │        └ dba       ┘                                   │
                              └───────────── confirmed findings (max 3 rounds) ────────┘

Phase 2 — Implementation (on request, strict TDD)
  architect kickoff (impl contract) → sdet (RED: failing unit/integration tests; e2e-only rows deferred)
                    → nextjs-dev + golang-dev (GREEN: make tests pass, never edit them; tier 1-2 gate only)
                    → sdet integrity check → qa (evidence-based) + security/dba audits
                    → JOURNEY: tree locked, one Playwright spec + full backend suite, run once
                      (red → one batched revision round → one rerun)
                    → openspec archive
```

Test tiers, their commands, and when each runs are defined once in `docs/testing-tiers.md`; the team's durable state (panel reports, adversary rounds with verdict commits, rulings, impl contracts, coverage tables, journey records) lives in `docs/handoffs/` per its README. Delegations cite both and never paste commands or findings.

Role separation is absolute: reviewers and the adversary never edit specs, the writer never judges its own work, the SDET never touches production code, developers never touch tests, QA never fixes.

**Spec-first is absolute — no vibe coding.** Production code changes only as implementation of a validated, adversary-reviewed change: every edit traces code ← task ← scenario ← change. "Quick fixes" get fast-tracked minimal changes (smaller artifacts, same gates), out-of-scope edits get reverted or specced as follow-ups, and code-vs-spec drift gets adjudicated (corrective change vs. baseline correction) — never silently patched on either side.

## Usage

Quickest entry — the `/team` command (defined in `harness/commands/team.md`) launches the orchestrator:

```
/team docs/payment-redesign.md              # design doc → validated spec (stops there)
/team docs/payment-redesign.md --implement  # end-to-end: spec → TDD build → QA → archive
/team add-two-factor-auth                   # resume an existing change from its current state
/team --brownfield auth,billing            # retrofit baseline specs first
/team docs/idea.md --greenfield            # bootstrap a net-new app
/team                                      # report current state and ask
/team docs/payment-redesign.md --workflow  # same pipeline as a deterministic multi-agent Workflow
/team --chain docs/plans/billing/chain.md  # implement authored changes in archive order, one fresh orchestrator per link
/team --chain docs/plans/billing/chain.md --full-auto  # also author each unauthored link in-run (rulings recorded, no user gates), then build it
/team docs/plans/billing/chain.md --full-auto  # same — a chain doc path implies --chain
```

The `--workflow` variant runs `.claude/workflows/openspec-team.js` — the same pipeline with script-enforced structure: the panel fans out in parallel, the adversary repair loop is hard-capped at 3 rounds, Phase 2 only runs with `implement: true` (or a chain, or `fullAuto: true`), and `openspec archive` only ever runs with an explicit `archive: true` or a chain. `fullAuto: true` is the `--full-auto` flag: unauthored chain links are authored in-run, open questions are ruled from the recorded recommendations into `docs/handoffs/<id>-rulings.md`, and a question the repo cannot answer is a hard stop. The orchestrator agent (default) is better when the run needs judgment calls mid-flight; the workflow is better for big changes where you want maximum parallelism and predictable gates.

Full pipeline, in your own words:

> Use the openspec-orchestrator agent to turn docs/payment-redesign.md into OpenSpec changes.

End to end including implementation:

> Use openspec-orchestrator to spec docs/payment-redesign.md and implement it.

Retrofit specs onto an existing codebase:

> Use openspec-brownfield to retrofit baseline OpenSpec specs for the auth and billing capabilities in this repo.

Bootstrap a brand-new app:

> Use openspec-greenfield to stand up OpenSpec for the app described in docs/idea.md.

Or invoke a specialist directly:

> Use openspec-security to threat-model the add-two-factor-auth change against docs/auth-design.md.

## Model assignments

Each agent pins the model matched to its task profile (set in frontmatter; override per-run with the Agent tool's `model` param if needed):

| Model | Agents | Why |
|---|---|---|
| **opus** | orchestrator, design-analyst, adversary, architect, security, greenfield | Judgment-heavy work where misses are expensive: routing and adjudication, ambiguity detection, adversarial attacks, architecture trade-offs, threat modeling, MVP scoping with nothing to anchor on |
| **sonnet** | spec-writer, nextjs-dev, golang-dev, sdet, qa, ux, reliability, dba, brownfield | Skilled execution against strong backing-skill playbooks: format-precise authoring, TDD implementation, test automation, matrix-driven QA, checklist-guided specialist reviews, code-faithful transcription |
| **haiku** | validator | Mechanical format checking against an exact checklist — fast and cheap, run often |

The split follows the pipeline's economics: sonnet-tier agents run most often (authoring, coding, panel fan-outs), opus guards the decision points where a wrong call cascades (a missed ambiguity becomes a wrong spec becomes wrong code), and the adversary — the last line before implementation — always gets the strongest reasoning.

## Backing skills

Each agent loads canonical knowledge from `harness/skills/` (a "Backing skills" section in every agent lists its reads). One source of truth per topic — update the skill, and every agent that uses it updates with it.

| Skill | Contents | Used by |
|---|---|---|
| `openspec-conventions` | Format canon: layout, spec/delta/proposal/tasks formats, CLI, lifecycle (+ `references/templates.md`) | everyone |
| `openspec-team-workflow` | Panel selection matrix, finding routing, tie-breaks, repair-loop convergence, gates | orchestrator |
| `design-doc-decomposition` | Five-pass extraction method, capability heuristics, ambiguity triage | analyst |
| `spec-writing-quality` | SHALL patterns, weasel-word list, altitude rules, scenario coverage heuristic | analyst, writer, adversary, ux |
| `adversarial-spec-review` | Five attacks, malicious-implementer test, finding quality bar | adversary |
| `nextjs-engineering` | RSC boundaries, caching, mutations, five UI states, a11y floor | architect, nextjs-dev, sdet |
| `golang-engineering` | Package layout, context, error taxonomy → API, concurrency, transactions | architect, golang-dev, sdet |
| `scenario-test-automation` | Level selection, traceability naming, coverage table, determinism rules | sdet |
| `qa-acceptance-testing` | Acceptance matrix, evidence standards, exploratory charters, verdicts | qa |
| `spec-threat-modeling` | STRIDE per requirement, deny paths, stack traps, implementation audit | security |
| `reliability-review` | Failure inventory, thresholds not adjectives, idempotency, rollout safety | reliability |
| `postgres-safe-migrations` | Constraints table, expand-migrate-contract, lock hazards, backfills | dba, golang-dev |

## Helper scripts

Two gates the CLI does not give you, both in `harness/`:

| Script | What it catches |
|---|---|
| `openspec-reconcile.py [change-id...]` | What `openspec archive` will **refuse**: a `## MODIFIED` block that omits a scenario the live spec still has. `validate --strict` doesn't check this, so a change can be strict-valid for days and still abort at archive time. Run before presenting a change and again before archiving; exit 1 = archive would fail. |
| `openspec-red-manifest.sh record\|verify <change-id> [paths...]` | The SDET's red-handoff baseline. Committing a red suite would turn `main` red, so this records content hashes of the test files instead (`docs/handoffs/red-manifest-<id>.txt`, override with `RED_MANIFEST_DIR`); `verify` reports any test modified, deleted, or added since the handoff — the integrity check's evidence. |

## Prerequisites

- **Node.js ≥ 20.19** is the only hard prerequisite — the agents install and configure the OpenSpec CLI themselves when it's missing (`npm install -g @fission-ai/openspec@latest`, non-interactive `openspec init` where possible, `openspec update`), following the bootstrap procedure in `harness/skills/openspec-conventions/SKILL.md`. Manual scaffolding is the fallback only when install genuinely fails (no Node/network), and reports say so. Note: `openspec init` may need an interactive run (`! openspec init`) to wire tool integrations if the installed version has no non-interactive flags.
