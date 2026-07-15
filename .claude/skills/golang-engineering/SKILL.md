---
name: golang-engineering
description: Go service engineering standards for the OpenSpec team - package layout, context and cancellation, error taxonomy mapped to API responses, HTTP handler discipline, concurrency rules, testing conventions, transaction boundaries. Load when designing or implementing Go work from an OpenSpec change.
---

# Go Engineering Standards

Baseline: modern Go (1.22+), standard library first, PostgreSQL via the repo's chosen driver/ORM. When the repo disagrees with this document, the repo wins — match existing conventions first.

## Package and layout discipline

- Package by domain capability (`auth`, `orders`, `billing`), not by layer (`models`, `utils`, `helpers`). A package named `util` is a finding against yourself.
- Accept interfaces, return structs. Define interfaces where they're CONSUMED, sized to what the consumer needs (1-3 methods), not god-interfaces exported by the implementor.
- No package-level mutable state. Dependencies (db pool, logger, config) enter through constructors and ride structs.
- `internal/` for anything other modules must not import.

## Context and cancellation

- `ctx context.Context` is the first parameter of anything that does I/O, waits, or can be cancelled — threaded unbroken from the HTTP handler down to the query. `context.Background()` appears in `main`, tests, and deliberately-detached work only (with a comment saying why).
- Every outbound call (HTTP client, DB, queue) runs under a deadline — either inherited or set per design.md's timeout table. An outbound call with no timeout is a MAJOR review finding.
- Honor cancellation in loops doing batch work: check `ctx.Err()` per iteration or select on `ctx.Done()`.

## Error taxonomy → API contract

This is where Go discipline meets the spec: scenarios that distinguish outcomes ("not found" vs "forbidden" vs "conflict") require errors the handler can distinguish.

- Define sentinel/typed errors at the domain layer: `ErrNotFound`, `ErrForbidden`, `ErrConflict`, `ValidationError{Fields}` — whatever the change's scenarios distinguish.
- Wrap with context on the way up: `fmt.Errorf("loading order %s: %w", id, err)`. Never discard the chain; never wrap with `%v` when callers need `errors.Is/As`.
- Handle once: either log it or return it, not both (double-logging makes incident triage lie).
- The HTTP layer owns the mapping: one function translating domain errors → status + the design.md error envelope. Handlers never invent per-endpoint error shapes. Internal error text never reaches responses (leak + contract break); log the detail, return the envelope.

## HTTP handler discipline

Handlers are thin: decode/validate → call domain function → encode. Business logic in handlers can't be tested without HTTP plumbing and can't be reused by other transports.

- Validate at the boundary: size-limit request bodies (`http.MaxBytesReader`), reject unknown fields where the contract is strict, validate before touching the domain.
- AuthN/AuthZ in middleware + explicit authz check at the domain operation (defense in depth — the scenario "WHEN a user requests another user's order THEN 404/403" is enforced at the query or domain check, not by URL obscurity).
- Idempotency where the spec demands it: mutations that clients retry take an idempotency key or are naturally idempotent (design.md decides which).

## Concurrency rules

- No goroutine without an owner: who waits for it (`errgroup`/`sync.WaitGroup`), how it stops (ctx), where its error goes. Fire-and-forget goroutines in request handlers outlive the request and leak.
- Prefer no concurrency until a scenario or design.md demands it. When used: channels for handoff, mutexes for state, `errgroup.WithContext` for fan-out with failure propagation.
- Anything touched by concurrent code is tested with `-race`, always.

## Transactions and data access

- The transaction spans exactly the unit scenarios treat as atomic — no more (long transactions hold locks), no less (partial writes violate the spec). Pass the tx/querier explicitly; don't smuggle it in context unless the repo already does.
- Parameterized queries only — string-built SQL is an automatic BLOCKER.
- Read-modify-write flows use the strategy design.md names (optimistic version column, `SELECT ... FOR UPDATE`, or atomic single-statement UPDATE); lost updates that violate a requirement are spec failures, not bad luck.

## Spec-first discipline

- **No task, no code.** Every production edit implements a task in an approved change's tasks.md, which traces to a scenario/requirement. Adjacent improvements, drive-by refactors, and "obvious" fixes outside the change are reported as proposed changes, not made — unrequested edits are how code drifts from spec.
- Existing code found diverging from `openspec/specs/` is **drift**: report file:line + the spec passage; the orchestrator decides whether the fix is a corrective change (code wrong) or a baseline correction (spec wrong). Never patch either side quietly.

## Testing conventions

- **Test-first, at every grain.** The SDET's scenario suite exists before your code: run it red, implement to green, refactor with it green. For units below its reach, write your own table-driven test first and watch it fail before implementing — a test you never saw red proves nothing.
- **Tests are immutable to implementers.** Never change an assertion, add `t.Skip`, exclude via build tags, or delete a test to get to green — including your own once written. A test you believe wrong is a dispute for the orchestrator (cite the scenario text); only the SDET revises tests, post-adjudication.
- Table-driven tests for behavior with variants; name subtests after spec scenarios (`t.Run("Scenario: Invalid TOTP rejected", ...)`) so coverage is greppable.
- Test exported behavior, not private plumbing. If a private function needs its own tests, it probably wants to be a package.
- Persistence-touching scenarios test against a real database (repo harness: docker compose/testcontainers), not a mocked store — mocked-store tests of SQL behavior are false confidence.
- `go build ./... && go vet ./... && go test ./...` (plus `-race` where concurrency changed) clean before any task is checked off.
