---
name: scenario-test-automation
description: Turning OpenSpec scenarios into traceable automated tests, TEST-FIRST (TDD) - red/green/refactor lifecycle, test immutability rules, test-level selection (Go unit/integration, contract, Playwright e2e), scenario-to-test naming, coverage table format, determinism rules, assertion discipline. Load when writing the red-phase suite for an OpenSpec change or running the post-development integrity check (SDET work).
---

# Scenario Test Automation (Test-First)

The deliverable is not "tests" — it is **an executable spec, written before the code it specifies**: every `#### Scenario:` in the change's deltas maps to at least one automated test that fails if the behavior regresses, plus a coverage table proving it. The team practices strict TDD — this suite is authored in the red phase, from the scenarios and the API contract, never from an implementation.

## TDD lifecycle of a test

1. **Red**: written before production code, from scenario + contract. Run it; it must **fail for the right reason** — missing behavior (assertion mismatch, 404, element not found) — not a compile error, missing fixture, or broken harness. A test that passes with no implementation is tautological; a test red for the wrong reason wastes a developer's diagnosis. Verify both before handoff.
2. **Green**: developers make it pass. The test is now immutable to them — no assertion edits, skips, `.only`, exclusions, or deletions. A developer who believes a test is wrong files a dispute (orchestrator adjudicates against the spec); only the SDET revises tests, and only when the spec changed or the test provably misreads it. A red build is never grounds to change a test.
3. **Refactor**: with tests green, code may be restructured freely — the unchanged suite is what makes refactoring safe.
4. **Integrity check** (post-development): full suite green AND unchanged since handoff — diff test paths against the handoff state (git when available; otherwise the files/assertions recorded in the coverage table). Unauthorized changes are BLOCKER findings (false completion), reported — not quietly reverted and passed.

Where a scenario's THEN cannot be pinned before implementation (e.g., exact generated IDs), assert the contract-visible shape, not placeholder values to be "fixed later" — later never comes, and post-hoc edits violate immutability.

## Traceability (the contract)

- Test names carry the scenario verbatim so coverage is greppable in both directions:
  - Go: `t.Run("Scenario: Invalid TOTP rejected", func(t *testing.T) {...})`
  - Playwright: `test('Scenario: Invalid TOTP rejected', async ({page}) => {...})`
- Deliver the coverage table with every handoff:

  | Scenario (capability/file) | Test (file:name) | Level | Status |
  |---|---|---|---|
  | auth-2fa / Invalid TOTP rejected | totp_test.go:TestVerify/Scenario:_Invalid_TOTP_rejected | integration | automated |
  | auth-2fa / Lockout notification email | — | — | NOT AUTOMATED: no mail sandbox; manual QA step filed |

- **Unautomated scenarios are listed with reasons, never omitted.** A silent gap reads as coverage. An untestable-as-written scenario (no observable THEN, undefined threshold) is a spec defect — report it upstream; do not invent semantics to make a test pass.

## Test level selection

Cheapest level that genuinely exercises the scenario's WHEN → THEN:

| Scenario's THEN observes... | Level |
|---|---|
| Pure computation/validation/state transition in one package | Go unit (table-driven) |
| Persisted effect, transaction, uniqueness, cascade | Go integration vs. REAL database (testcontainers/compose harness) |
| Response shape/status of an added or modified endpoint | API/contract test — success shape + each error the scenarios distinguish (401 vs 403 vs 404 vs 409) + the design.md error envelope |
| User-visible behavior across the Next.js UI | Playwright e2e |

Push down relentlessly: a validation rule tested through the browser is slow, flaky, and points at nothing when it fails. E2e is reserved for the flow-level happy path plus user-visible failure states (error/empty states scenarios name). Don't re-test API logic through the UI.

**Failure-path scenarios get the same red-phase priority as happy paths.** Under test-first development every scenario is written before code, but when triaging effort, error handling, boundaries, and deny paths deserve the strongest tests — they're where implementations cut corners when coding to a green bar.

## Assertion discipline

- **Assert the THEN, not the implementation.** The scenario says "THEN the order is marked pending" → assert the order row/response state, not that `MarkPending()` was called. Mock-verification tests pass while real wiring is broken — false positives you own.
- Assert the whole relevant contract: status code AND body shape AND persisted effect when the scenario names them. Weak assertions (`status == 200` alone) let wrong bodies ship.
- Never weaken an assertion to make a failing test pass — a red test against correct-per-spec assertions is a production defect: file it with the failing test as the reproduction.
- Boundary probes beyond the literal scenarios are encouraged where cheap (limit ±1, empty, duplicate submit, unicode in text fields) — tag them `SDET-added:` so QA and the adversary know coverage exceeds spec, and so they're not mistaken for spec-mandated behavior.

## Determinism rules (flaky = broken)

- No `sleep`-based synchronization. Go: synchronize on channels/conditions; poll with deadline via the repo's helper if unavoidable. Playwright: web-first assertions (`await expect(locator).toBeVisible()`) auto-wait — never `waitForTimeout`.
- Each test owns its data: unique per-test fixtures (unique emails/IDs), no dependence on execution order, no shared mutable seed rows. Parallel-safe or explicitly serialized.
- Control the clock where scenarios involve time (expiry, lockout windows): inject the repo's clock abstraction; if none exists, request one from developers rather than testing with real 30-minute waits or flaky tolerances.
- External dependencies in tests are the harness's (containers, fakes) — never live third-party services.

## Playwright specifics

- Selectors: `getByRole`/`getByLabel`/`getByText` — accessible selectors double as an a11y smoke test; `data-testid` only when no accessible handle exists (and that's a UX finding to mention).
- Authenticate via API/storage-state setup, not by driving the login UI in every test (login UI gets its own dedicated tests).
- One flow per test; no mega-journeys that fail ambiguously. Screenshots/traces on failure enabled per repo config.

## Handoff checklists

**Red handoff (before development)**: every test runs and fails for the right reason (missing behavior, not harness/compile errors) · pre-existing suites still green (you broke nothing) · coverage table complete including NOT-AUTOMATED rows · spec-defect reports (untestable scenarios) sent upstream · no skipped/`.only` tests.

**Integrity check (after development)**: full suite green (`go test ./...`, `-race` where relevant, `npx playwright test`) · diff against handoff state clean, or unauthorized test changes reported as BLOCKERs · post-handoff test revisions logged with adjudicated cause · production defects filed with the failing test as repro.
