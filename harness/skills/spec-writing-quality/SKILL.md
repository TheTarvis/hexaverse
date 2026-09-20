---
name: spec-writing-quality
description: How to write requirements and scenarios that are unambiguous, testable, and at the right altitude - SHALL patterns, weasel-word list, scenario coverage heuristics, requirement decomposition. Load when authoring or judging the CONTENT of OpenSpec requirements (format rules live in openspec-conventions).
---

# Writing High-Quality Requirements and Scenarios

Format compliance (headers, keywords) is `openspec-conventions`. This skill is about content: a requirement can validate `--strict` and still be worthless. The bar: **two engineers who have never met must build the same observable behavior from it.**

## Requirement patterns

Use the pattern that matches the behavior type (adapted from EARS):

| Type | Pattern | Example |
|---|---|---|
| Ubiquitous | The system SHALL `<behavior>` | The system SHALL store passwords only as salted hashes. |
| Event-driven | WHEN `<trigger>`, the system SHALL `<response>` | WHEN a login fails 5 times within 15 minutes, the system SHALL lock the account for 30 minutes. |
| State-driven | WHILE `<state>`, the system SHALL `<behavior>` | WHILE a subscription is past due, the system SHALL restrict access to read-only. |
| Conditional | IF `<condition>`, THEN the system SHALL `<behavior>` | IF the export exceeds 10,000 rows, THEN the system SHALL deliver it asynchronously by email. |
| Unwanted-event | IF `<failure>`, THEN the system SHALL `<recovery>` | IF the payment provider times out, THEN the system SHALL mark the order pending without charging. |

Rules regardless of pattern:

- **One behavior per requirement.** "SHALL validate and store and notify" is three requirements. Test: can it fail in two independent ways? Split it.
- **Active voice, named actor.** "The system SHALL return the user's orders" — which user, to whom? Data-exposing/mutating requirements name WHO may invoke them.
- **Every quantity has a unit and bound.** "quickly" → "within 2 seconds (p95)". "large files" → "files over 10 MB". If the design doc gives no number, that's an open question to flag — never invent a number to seem precise.
- **SHALL for mandatory** (the default), SHOULD only with a reason a reviewer would accept for skipping it, MAY only for true options. Never "will", "can", "should probably".

## The weasel-word list

These words in a requirement are defects. Each must be replaced by a decidable condition or flagged as an open question:

> appropriate, properly, correctly, gracefully, efficiently, robust, seamless, user-friendly, intuitive, fast, slow, quickly, soon, periodically, regularly, as needed, if necessary, where applicable, reasonable, sufficient, adequate, minimal, optimal, secure, reliable, scalable, flexible, easy, simple, handle, support, manage, process, deal with, etc., and so on, including but not limited to

"Handle errors gracefully" specifies nothing. "WHEN the API returns 5xx, THEN the form redisplays with entered values preserved and a retry action" specifies everything.

## Requirement vs. design vs. task altitude

| Statement | Belongs in |
|---|---|
| "Sessions SHALL expire after 30 minutes of inactivity" | requirement (WHAT, observable) |
| "Sessions are stored in Redis with TTL-based expiry" | design.md (HOW, decision) |
| "Add session middleware to the router" | tasks.md (work step) |

If a requirement names a technology, library, or internal component, move the technology to design.md and keep the observable behavior. Exception: when the technology IS the requirement (a compliance mandate, a contractual integration).

## Scenario quality

A scenario is a concrete, executable example — the acceptance test in prose form.

- **THEN must be observable**: a response, rendered state, persisted effect, emitted event. "THEN the system handles it" is untestable. If you can't say what a tester would look at, the scenario isn't done.
- **WHEN must be inducible**: a tester can cause it. "WHEN the database is corrupted" — how? Prefer "WHEN the database returns an error" (injectable).
- **Concrete values beat abstractions** at boundaries: "WHEN a user submits a 0-item order", not "an edge-case order".
- **Coverage heuristic per requirement** — walk this list and include what the design implies (not mechanically all of them):
  1. Happy path (exactly one, first)
  2. Each distinct failure the requirement can hit (invalid input, not found, forbidden, conflict, dependency down/timeout)
  3. Boundaries of every stated limit (at the limit, one past it)
  4. Empty/zero/first-time state
  5. Repetition: duplicate submit, retry, replay
  6. Concurrent access, if two actors can touch the same thing
- **A requirement whose scenarios are all happy-path is presumptively incomplete** — the failure behavior is where implementations diverge.

## Anti-patterns

- **The everything requirement**: one requirement with 12 scenarios spanning login, logout, and password reset. Decompose.
- **The mirror scenario**: THEN restates WHEN ("WHEN the user logs in THEN the user is logged in"). Say what changed observably.
- **Spec-by-example-only**: scenarios without a SHALL statement generalizing them — the requirement text must state the rule, scenarios illustrate it.
- **Negative space omission**: specifying what the system does, never what it must NOT do, when the design doc names prohibitions (SHALL NOT log card numbers).
- **Premature precision**: inventing thresholds the design doc doesn't support. Flag, don't fabricate.

## Self-review before handoff

For each requirement ask: (1) Could two implementations both satisfy this yet behave differently in a way a user would notice? (2) What test proves it? (3) Is any word on the weasel list? (4) Does every scenario THEN name something observable? (5) Did I write the failure paths?
