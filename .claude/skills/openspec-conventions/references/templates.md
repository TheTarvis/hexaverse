# OpenSpec File Templates

Copy-paste skeletons. Replace ALL-CAPS placeholders; delete sections that don't apply only where marked optional.

## specs/CAPABILITY/spec.md (full spec — produced by archiving, or when scaffolding manually)

```markdown
# CAPABILITY-TITLE Specification

## Purpose

WHY-THIS-CAPABILITY-EXISTS (one paragraph).

## Requirements

### Requirement: REQUIREMENT-NAME
The system SHALL OBSERVABLE-BEHAVIOR.

#### Scenario: HAPPY-PATH-NAME
- **WHEN** TRIGGER
- **THEN** OBSERVABLE-OUTCOME

#### Scenario: FAILURE-PATH-NAME
- **WHEN** FAILURE-TRIGGER
- **THEN** OBSERVABLE-FAILURE-OUTCOME
```

## changes/CHANGE-ID/proposal.md

```markdown
## Why

PROBLEM-AND-WHY-NOW (1-3 sentences, grounded in the design doc).

## What Changes

- CONCRETE-CHANGE-1
- CONCRETE-CHANGE-2 (**BREAKING** if applicable)

## Impact

- Affected specs: CAPABILITY-1, CAPABILITY-2
- Affected code: DIRECTORIES-OR-SYSTEMS
```

## changes/CHANGE-ID/specs/CAPABILITY/spec.md (delta)

```markdown
## ADDED Requirements

### Requirement: NEW-REQUIREMENT-NAME
The system SHALL OBSERVABLE-BEHAVIOR.

#### Scenario: SCENARIO-NAME
- **GIVEN** PRECONDITION            <!-- optional -->
- **WHEN** TRIGGER
- **THEN** OBSERVABLE-OUTCOME
- **AND** ADDITIONAL-OUTCOME        <!-- optional -->

## MODIFIED Requirements

### Requirement: EXACT-EXISTING-NAME-FROM-CURRENT-SPEC
COMPLETE-UPDATED-TEXT — full replacement, all scenarios included even unchanged ones.

#### Scenario: SCENARIO-NAME
- **WHEN** TRIGGER
- **THEN** OBSERVABLE-OUTCOME

## REMOVED Requirements

### Requirement: EXACT-EXISTING-NAME
**Reason**: WHY-REMOVED
**Migration**: WHAT-HAPPENS-TO-EXISTING-BEHAVIOR-OR-DATA

## RENAMED Requirements

- FROM: `### Requirement: OLD-EXACT-NAME`
- TO: `### Requirement: NEW-NAME`
```

Delete any operation section (`## ADDED ...` etc.) with no entries.

## changes/CHANGE-ID/tasks.md

```markdown
## 1. GROUP-NAME

- [ ] 1.1 SMALL-VERIFIABLE-TASK
- [ ] 1.2 SMALL-VERIFIABLE-TASK

## 2. Validation

- [ ] 2.1 TESTS-COVERING-SCENARIOS
```

## changes/CHANGE-ID/design.md (optional — cross-cutting/complex changes only)

```markdown
## Context

CONSTRAINTS-AND-BACKGROUND.

## Goals / Non-Goals

- Goal: ...
- Non-goal: ...

## Decisions

### Decision: DECISION-TITLE
CHOICE-MADE.
- Alternatives considered: ALTERNATIVE — WHY-REJECTED

## Risks / Trade-offs

- RISK — MITIGATION

## Migration Plan

STEP-BY-STEP (expand → migrate → contract for schema changes).

## Open Questions

- UNRESOLVED-AMBIGUITY (owner: WHO-DECIDES)
```

## openspec/project.md (created by `openspec init`; keep current)

```markdown
# Project Context

## Purpose
WHAT-THIS-PROJECT-IS.

## Tech Stack
- Frontend: e.g. Next.js 15 App Router, TypeScript, Tailwind
- Backend: e.g. Go 1.23, chi, PostgreSQL 16
- Testing: e.g. go test + testcontainers, Playwright

## Project Conventions
CODE-STYLE, LAYOUT, ERROR-ENVELOPE, API-CONTRACT-SOURCE-OF-TRUTH.

## How to run
COMMANDS for dev server, tests, migrations.
```
