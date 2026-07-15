---
description: Launch the OpenSpec team - orchestrates design-to-spec (and optionally implementation) via the openspec-orchestrator agent
argument-hint: <design doc path | feature request | change-id> [--implement] [--brownfield <capabilities>] [--greenfield] [--workflow]
---

Launch the OpenSpec spec-driven development team on: $ARGUMENTS

You are the entry point for the OpenSpec agent team. Delegate the work to the `openspec-orchestrator` agent via the Agent tool — do not run the pipeline yourself in this session. The orchestrator coordinates: entry-mode routing (brownfield/greenfield/specced), design analysis, spec authoring, the specialist review panel, validation, adversarial review, and (only when implementation is requested) the TDD implementation crew.

## Interpret the arguments

- **A file path** (design doc, PRD, brief): the source document for a design-to-spec run. Verify the file exists before delegating; if it doesn't, tell the user instead of launching.
- **Free text**: treat as a feature request / mini design brief; pass it verbatim. This includes "quick fix" and bug-report phrasing — the team never edits code directly; small requests become fast-tracked minimal changes (writer → validator → adversary) and are implemented from the change, so set that expectation when relaying results.
- **An existing change-id** (matches a folder in `openspec/changes/`): resume work on that change — the orchestrator should assess its state (validated? reviewed? implemented?) and continue from the right stage. Remind it that a resumed change whose content has no CURRENT adversary verdict gets adversarial review before anything else proceeds — prior verdicts expire on edit.
- **`--implement`**: authorize end-to-end delivery (Phase 2 after Phase 1) without a second approval gate. WITHOUT this flag the orchestrator must stop after presenting the validated spec.
- **`--brownfield <capabilities>`**: start with a baseline retrofit of the named capabilities via `openspec-brownfield` before any change is authored.
- **`--greenfield`**: force the net-new bootstrap path via `openspec-greenfield` (also inferable when no code and no `openspec/` exist).
- **`--workflow`**: run the deterministic multi-agent pipeline instead of a single orchestrator agent — invoke the Workflow tool with `{name: "openspec-team", args: {...}}` (this flag is your authorization to call Workflow). Map the other arguments into workflow args: `designDoc` (resolved path), `request` (free text), `changeId`, `implement: true` for `--implement`, `entryMode: "brownfield"` + `capabilities: [...]` for `--brownfield`, `entryMode: "greenfield"` for `--greenfield`. The workflow never archives unless `archive: true` is passed — only add it if the user explicitly asks to archive. The workflow runs in the background; relay its returned report (entryMode, changeIds, harden status, open questions, implementation results) when it completes.
- **No arguments at all**: don't guess. Report the current state (is the `openspec` CLI installed — `openspec --version`? does `openspec/` exist? active changes via `openspec list` or the changes/ folder? obvious design docs in the repo?) and ask the user what to run. A missing CLI is not a blocker to mention as one — the team installs it as part of any run.

## Delegation

Spawn `openspec-orchestrator` (Agent tool, subagent_type `openspec-orchestrator`) with a prompt containing:

1. The user's request verbatim, plus resolved file paths (never summarize a design doc — pass the path)
2. The entry-mode signal you inferred or the user forced (brownfield/greenfield/specced), with your evidence
3. Whether Phase 2 is authorized (`--implement` present) or the run stops at the validated spec
4. The reminder that its final report must include: change-id(s), file tree created, validation status, findings resolved vs. open questions, and Phase 2 results if run

When the orchestrator returns, relay its report to the user faithfully — including open questions and unresolved findings, not just the successes.
