---
name: openspec-conventions
description: Canonical OpenSpec format and CLI reference - directory layout, spec/delta/proposal/tasks file formats, validation rules, change lifecycle. Load before creating, editing, validating, or archiving anything under openspec/. The single source of truth for the OpenSpec team; templates in references/templates.md.
---

# OpenSpec Conventions

OpenSpec (https://openspec.dev, npm `@fission-ai/openspec`) is a lightweight spec-driven framework: specs describe what IS built, changes describe what SHOULD change, and archiving merges approved deltas back into specs.

## Directory layout

```
openspec/
├── project.md                        # project context: stack, conventions, how to run things
├── AGENTS.md                         # generated agent instructions (openspec update refreshes)
├── specs/                            # CURRENT TRUTH - only modified via archive
│   └── <capability>/spec.md          # one capability per folder, kebab-case
└── changes/                          # PROPOSALS - all authoring happens here
    ├── <change-id>/
    │   ├── proposal.md               # Why / What Changes / Impact
    │   ├── tasks.md                  # numbered checkbox implementation plan
    │   ├── design.md                 # optional; technical decisions
    │   └── specs/<capability>/spec.md  # DELTAS relative to specs/
    └── archive/
        └── YYYY-MM-DD-<change-id>/   # completed changes, date-prefixed
```

- **Capability names**: kebab-case, single-purpose, verb-noun scoped (`user-auth`, `payment-capture`). If describing it needs "and", split it.
- **Change IDs**: kebab-case, verb-led, unique including against `changes/archive/` (`add-two-factor-auth`, `refactor-session-storage`).
- Never edit `openspec/specs/` directly for proposed work — current specs change only when a change is archived.

## Spec file format (`specs/<capability>/spec.md`)

```markdown
# <Capability> Specification

## Purpose
One paragraph: why this capability exists.

## Requirements

### Requirement: Interactive Login
The system SHALL authenticate users with email and password before establishing a session.

#### Scenario: Valid credentials
- **WHEN** a user submits a correct email and password
- **THEN** a session is established
- **AND** the user is redirected to their dashboard

#### Scenario: Invalid credentials
- **WHEN** a user submits an incorrect password
- **THEN** authentication fails with a retriable error
```

Hard rules:
- Header hierarchy is exact: `## Requirements` → `### Requirement: <Name>` → `#### Scenario: <Name>`. Colon-space after the keyword. No other H3/H4 forms inside Requirements.
- **Every requirement has at least one scenario.** This is the #1 `--strict` validation failure.
- Scenario steps are bulleted bold keywords: `- **WHEN**`, `- **THEN**`, optionally `- **GIVEN**` (first) and `- **AND**` (continuation). Not numbered lists, not plain prose, not lowercase.
- Requirement text uses RFC-2119 language: **SHALL** (or MUST) for mandatory behavior, SHOULD for strong recommendation, MAY for optional. Default to SHALL; a spec full of SHOULDs specifies nothing.
- One observable behavior per requirement. Requirements state WHAT, never HOW (technology choices belong in design.md).

## Delta format (`changes/<id>/specs/<capability>/spec.md`)

Deltas contain ONLY changed requirements, grouped under operation headers:

```markdown
## ADDED Requirements

### Requirement: Two-Factor Authentication
The system SHALL require a second factor for all interactive logins.

#### Scenario: Valid TOTP accepted
- **WHEN** a user submits a valid TOTP code within its validity window
- **THEN** the session is established

## MODIFIED Requirements

### Requirement: Session Expiry
[COMPLETE updated requirement text + ALL its scenarios - the archiver replaces the
entire requirement with exactly what is written here; fragments silently drop behavior]

#### Scenario: Idle timeout
- **WHEN** a session is idle for 30 minutes
- **THEN** the session is invalidated

## REMOVED Requirements

### Requirement: Password-Only Login
**Reason**: Superseded by two-factor authentication
**Migration**: Existing sessions remain valid until natural expiry

## RENAMED Requirements

- FROM: `### Requirement: Login`
- TO: `### Requirement: Interactive Login`
```

Delta hard rules:
1. Operation headers exactly: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`. No variants ("Added", "New", "Changes").
2. MODIFIED/REMOVED/RENAMED-FROM requirement names must match the existing spec's `### Requirement:` header **character-for-character** — grep `openspec/specs/<capability>/spec.md` to copy it; a mismatch means the archiver can't find the target.
3. MODIFIED bodies are complete replacements (header text + all scenarios, including unchanged ones). The #2 silent-data-loss bug is a MODIFIED delta that omits scenarios the old requirement had.
4. Every ADDED and MODIFIED requirement needs ≥1 scenario.
5. A new capability's delta uses `## ADDED Requirements` for everything; the capability folder is created under both the change's `specs/` and (on archive) `openspec/specs/`.

## proposal.md

```markdown
## Why
1-3 sentences: the problem and why now.

## What Changes
- Bulleted concrete changes
- Mark breaking changes with **BREAKING**

## Impact
- Affected specs: <capability list>
- Affected code: <systems/directories>
```

## tasks.md

```markdown
## 1. Implementation
- [ ] 1.1 Create TOTP secret provisioning endpoint
- [ ] 1.2 Add verification step to login flow

## 2. Validation
- [ ] 2.1 Tests for expiry and reuse edge cases
```

Numbered `## N. Section` groups; `- [ ] N.M description` items; small, ordered, verifiable; every scenario covered by at least one task. Mark `- [x]` as work completes — tasks.md is the shared progress ledger.

## design.md (only when warranted)

Create for: cross-cutting changes, new dependencies, schema/data migrations, security-sensitive surfaces, competing technical approaches. Sections: `## Context`, `## Goals / Non-Goals`, `## Decisions` (with alternatives considered), `## Risks / Trade-offs`, `## Migration Plan`, `## Open Questions`.

## CLI reference

```
openspec init [path]              # scaffold openspec/ in a project
openspec update                   # refresh AGENTS.md agent instructions
openspec list                     # active changes; --specs lists capabilities
openspec show <change-id>         # render a change; --json --deltas-only to verify parsing
openspec show <spec-id>           # render a spec
openspec diff <change-id>         # what would change on archive
openspec validate <change-id> --strict   # ALWAYS use --strict before handoff
openspec archive <change-id> --yes       # merge deltas into specs/, move to archive/
```

Newer releases also install `/opsx:*` slash commands (`explore`, `propose`/`proposal`, `apply`, `archive`) into AI tools. If the CLI is missing, INSTALL it — see the bootstrap procedure below; manual scaffolding is the last resort, not the first response.

## Installation & bootstrap (when the CLI is missing)

Any agent that needs the CLI runs this procedure itself before falling back to manual scaffolding:

1. **Detect**: `openspec --version`. Present → skip to step 4.
2. **Prerequisite**: `node --version` must be ≥ 20.19.0. Node missing or too old → STOP and report to the user (installing/upgrading Node is a system-level change the user makes), then use the manual fallback for the current run.
3. **Install**: `npm install -g @fission-ai/openspec@latest` (use the pnpm/yarn/bun equivalent if the repo clearly uses one). Re-verify with `openspec --version`. Install failure (network, permissions) → report the exact error, manual fallback.
4. **Init** (only when no `openspec/` directory exists): run `openspec init --help` FIRST to discover the current flags, and prefer a non-interactive invocation. `openspec init` is interactive by default — it asks which AI tools to configure; when a choice is offered, pick **Claude Code**. If it cannot be run non-interactively from your shell, scaffold manually (below) and tell the user to run `! openspec init` themselves afterward to wire up the tool integrations.
5. **Configure**: fill `openspec/project.md` from repo reality (template in `references/templates.md`) — stack and versions read from package.json/go.mod, real run/test commands, observed conventions. Run `openspec update` to (re)generate AGENTS.md.
6. **Verify**: `openspec list` and `openspec list --specs` run clean. Report what was installed/configured in your final message.

**Manual fallback scaffold** (CLI truly unavailable this run): create `openspec/` with `project.md`, `specs/`, and `changes/archive/` per the layout above. Validation then relies on the manual checklist (openspec-validator) until the CLI exists — say so in your report, with the install command the user needs.

## Lifecycle

1. Author change folder → 2. `openspec validate --strict` → 3. review/approve → 4. implement, checking off tasks.md → 5. verify scenarios pass → 6. `openspec archive <id> --yes` → deltas merge into `openspec/specs/`, folder moves to `changes/archive/YYYY-MM-DD-<id>/`.

Full copy-paste templates for every file: `references/templates.md` in this skill.
