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

## Acceptance criteria

Concrete, checkable conditions for "done." These become the review checklist
and, ideally, tests.

- [ ] ...
- [ ] ...

## Open questions

- Unresolved decisions. Owner + a resolution before this spec moves to
  `accepted`, or explicitly deferred.

## References

- Related specs: #NNNN
- `../vision.md`
- Archived design: `git show bf9c637:client/docs/Gameplay.mdc`
