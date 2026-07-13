---
number: NNNN
title: <Feature name>
status: draft   # draft | accepted | implemented | superseded
created: YYYY-MM-DD
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# NNNN — <Feature name>

> One-sentence summary of what this spec proposes.

## Problem / motivation

What's the situation today, and why does it need to change? Who is affected
(a player experience, a developer workflow, a system constraint)? Keep it
concrete — a reader who knows nothing should understand the pain here.

## Goals

- What this change must achieve. Bullet, testable where possible.

## Non-goals

- What this deliberately does *not* do. Prevents scope creep and sets review
  expectations. Point to a future spec if relevant.

## Proposed approach

The core idea, in prose. How does it work? What are the key moving parts?
Enough that someone could start building — but not a line-by-line plan.

## Design details

Data model, API surface, events, algorithms, edge cases. Reference the actual
codebase where it lands (`backend/<domain>/`, `frontend/lib/...`, Pub/Sub
constants in `backend/common/pubsub.go`, SSE channels). Diagrams/tables
welcome.

## Scenarios

Behavioral use cases in **Given / When / Then**. Each is a `### S<n> — <title>`
heading; its global ID is `NNNN/S<n>` (the spec number namespaces it). A test
declares coverage by citing that ID in a comment (`// Spec: NNNN/S1`), and
`frontend/lib/spec-scenarios.test.ts` fails if an `accepted`/`implemented` spec
has a scenario with no such marker. Cover the behavior that matters — the happy
path plus the edges that would bite (idempotency, races, fog boundaries,
failure modes). Structural facts that aren't behavioral (a knob lives in a
params object, a field is indexed) belong in Acceptance criteria, not here.

### S1 — <short scenario name>

- **Given** <the starting state / preconditions>
- **When** <the trigger — an action, an event, a read>
- **Then** <the observable outcome; add more Then/And lines as needed>

### S2 — <next scenario>

- **Given** ...
- **When** ...
- **Then** ...

## Acceptance criteria

Concrete, checkable conditions for "done" that aren't captured as a scenario
above — invariants, structural facts, non-behavioral guarantees. These become
the review checklist. (Behavioral "done" lives in **Scenarios**; don't
duplicate it here.)

- [ ] ...
- [ ] ...

## Open questions

- Unresolved decisions. Owner + a resolution before this spec moves to
  `accepted`, or explicitly deferred.

## References

- Related specs: #NNNN
- `../vision.md`
- Archived design: `git show bf9c637:client/docs/Gameplay.mdc`
