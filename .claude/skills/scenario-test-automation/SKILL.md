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
4. **Integrity check** (post-development): the red suite green at its own tiers AND unchanged since handoff — `openspec-red-manifest.sh verify`, falling back to git or the coverage table's file list. Unauthorized changes are BLOCKER findings (false completion), reported — not quietly reverted and passed.
5. **Journey** (archive gate, after every task is checked): one Playwright spec per change walking the slice in order, plus any deferred router-level e2e, run **once** with the tree locked. Red → one batched revision round → one rerun. Details and tier commands: `docs/testing-tiers.md`.

The red phase is **unit and integration only**. Playwright written before the UI exists is written blind and produces test-side reds (wrong copy, missing controls, helpers that can't tell "empty" from "never captured") at the same rate as product defects. End-to-end-only scenarios are recorded as `Playwright, deferred` in the coverage table and covered by the journey.

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
| User-visible behavior of one component/hook (states, copy, disabled controls) | vitest + Testing Library |
| The whole slice, step after step, against the real stack | the one Playwright journey per change — written after the build, `Playwright, deferred` until then |

Push down relentlessly: a validation rule tested through the browser is slow, flaky, and points at nothing when it fails. The journey is reserved for what only sequence-against-the-real-stack can show. Don't re-test API logic or single-component states through the UI.

**Failure-path scenarios get the same red-phase priority as happy paths.** Under test-first development every scenario is written before code, but when triaging effort, error handling, boundaries, and deny paths deserve the strongest tests — they're where implementations cut corners when coding to a green bar.

## Assertion discipline

- **Assert the THEN, not the implementation.** The scenario says "THEN the order is marked pending" → assert the order row/response state, not that `MarkPending()` was called. Mock-verification tests pass while real wiring is broken — false positives you own.
- Assert the whole relevant contract: status code AND body shape AND persisted effect when the scenario names them. Weak assertions (`status == 200` alone) let wrong bodies ship.
- Never weaken an assertion to make a failing test pass — a red test against correct-per-spec assertions is a production defect: file it with the failing test as the reproduction.
- Boundary probes beyond the literal scenarios are encouraged where cheap (limit ±1, empty, duplicate submit, unicode in text fields) — tag them `SDET-added:` so QA and the adversary know coverage exceeds spec, and so they're not mistaken for spec-mandated behavior.

## Determinism rules (flaky = broken)

- No `sleep`-based synchronization. Go: synchronize on channels/conditions; poll with deadline via the repo's helper if unavoidable. Playwright: web-first assertions (`await expect(locator).toBeVisible()`) auto-wait — never `waitForTimeout`.
- Data is unique **per spec file**, shared across that file's read-only tests: one provisioned fixture in a package-level `sync.Once` helper or `test.beforeAll`, named so no other file can collide (parallel-safe without a wiping `TestMain`, so `-p 1` is never needed). Provision fresh only in tests that mutate ownership or delete. No dependence on execution order within the file beyond the shared fixture. Per-test provisioning through the real router is what made hexaverse's e2e package grow superlinearly — from under two minutes to over forty in three changes.
- Control the clock where scenarios involve time (expiry, lockout windows): inject the repo's clock abstraction; if none exists, request one from developers rather than testing with real 30-minute waits or flaky tolerances.
- External dependencies in tests are the harness's (containers, fakes) — never live third-party services.

## Playwright specifics

- Selectors: `getByRole`/`getByLabel`/`getByText` — accessible selectors double as an a11y smoke test; `data-testid` only when no accessible handle exists (and that's a UX finding to mention).
- Authenticate via API/storage-state setup, not by driving the login UI in every test (login UI gets its own dedicated tests).
- **One journey spec per change**, asserting at every step so a red points at the step that broke. Per-scenario and per-edge specs are not written; those live in vitest. A precondition a human cannot arrange through the UI (a timing window, a race) is arranged through the API with the assertion still in the UI. Screenshots/traces on failure enabled per repo config.
- Written only after every task is checked, run once at archive time with the tree locked; red → one batched revision round → one rerun. Never raise a timeout to get to green. `docs/testing-tiers.md` has the commands and the stack-reuse setup for chains.

## Handoff checklists

**Red handoff (before development)**: every test runs and fails for the right reason (missing behavior, not harness/compile errors; a symbol that does not exist yet is verified `compile-red` in a scratch worktree with the symbol stubbed) · pre-existing tier 1 and tier 2 suites still green (you broke nothing) · coverage table written to `docs/plans/continous_space/handoffs/<change-id>-red-coverage.md` with every row in one of `assertion-red` / `compile-red` / `already-green` (say why) / `Playwright, deferred` / `reasoned-not-automated` (say why) · spec-defect reports (untestable scenarios) sent upstream · no skipped/`.only` tests · `openspec-red-manifest.sh record` run **before any developer starts**.

**Integrity check (after development)**: red suite green at its tiers (`go test -short`, package emulator tests, `-race` where relevant, vitest) · `openspec-red-manifest.sh verify` clean, or unauthorized test changes reported as BLOCKERs · post-handoff test revisions logged with adjudicated cause · production defects filed with the failing test as repro. Tiers 3 and 4 are **not** run here.

**Journey (archive gate)**: every task checked · journey spec written against the UI that exists · tree lock confirmed · tier 4 then tier 3 run once each, backgrounded, never concurrently · all findings from a red run reported together for one batched round · `docs/plans/continous_space/handoffs/<change-id>-journey.md` written with the suite budget line.
