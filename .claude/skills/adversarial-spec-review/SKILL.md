---
name: adversarial-spec-review
description: Attack playbook for red-teaming OpenSpec changes - fidelity walk against the source design doc, ambiguity and testability attacks, the malicious-implementer test, contradiction hunting, finding quality bar. Load when adversarially reviewing a spec change before implementation.
---

# Adversarial Spec Review Playbook

Objective: find where the spec permits a wrong implementation. The core mental move is the **malicious-implementer test** — for each requirement, ask: *what is the laziest, most literal, most wrong implementation that still technically satisfies this text?* If that implementation would upset the design doc's author, the spec has a hole. Name the hole.

Adversarial review is non-skippable: every spec the team produces — authored changes AND brownfield baselines — gets this review before it is trusted, and a spec edit expires any prior verdict.

## Baseline mode (brownfield retrofits)

When the artifact under attack is a retrofitted baseline in `openspec/specs/` rather than a change, **the codebase replaces the design doc as the source of truth** and the attacks retarget:

- Attack 1 (fidelity) becomes **spec-vs-code**: sample each requirement against the code that supposedly backs it — same behavior? same values, actors, error responses? Then reverse: sweep the capability's code surface (handlers, validation, constraints, error paths) for observable behavior the spec omits. Wished-for behavior specced as current truth is the BLOCKER class.
- Attacks 2–4 (ambiguity, testability, coverage) apply unchanged — transcribed reality must still be decidable and testable.
- Attack 5 retargets to **flag laundering**: behavior the retrofit report marked as a suspected defect must carry that flag in the report trail, not appear as a clean SHALL.
- Fixes route to the brownfield agent and always correct the spec toward the code — never the reverse.

## Attack 1 — Fidelity walk (needs the ORIGINAL design doc)

The highest-value attack, and the one only you perform. Walk the design document claim by claim against the change:

- Build a claim list: every stated behavior, limit, constraint, prohibition, and non-functional statement in the design doc.
- For each: covered by a requirement/scenario? Explicitly deferred in the proposal? Or **silently dropped** (finding — BLOCKER)?
- Reverse walk: every requirement in the deltas traces to design-doc support, resolved analyst inference, or reviewer finding. Requirements with no provenance are **invented behavior** (finding).
- Pay special attention to: prohibitions ("must never") — most often dropped; numbers changed in translation (doc says 15 minutes, spec says 30); qualifiers lost ("admins can delete" became "users can delete").

Without the design doc you cannot run this attack — say so rather than skipping silently.

## Attack 2 — Ambiguity

Hunt the weasel list (see `spec-writing-quality` — appropriate/gracefully/fast/secure/handle/etc.) plus:

- **Undefined actors**: "the user" in a multi-role system — which role?
- **Unbounded quantifiers**: "all", "any", "every" without scope ("SHALL notify all users" — of the tenant? the system?).
- **Ambiguous pronouns**: "it", "they" with two possible referents in requirement text.
- **Undefined terms**: domain words used before any requirement defines them ("active user", "valid document").

For each: quote the sentence, give the two readings, state which one a lazy implementer picks.

## Attack 3 — Testability

For each requirement: write (mentally) the test that proves it. Findings when:
- No observable output to assert (THEN describes internal state no interface exposes)
- No measurable threshold ("rate-limits" — at what rate? "large" — how large?)
- No inducible trigger (WHEN describes a condition a tester can't cause)
- Scenario THEN merely restates WHEN (proves nothing)

## Attack 4 — Coverage gaps

For each requirement, run the failure catalog and note what's missing **where the design implies it matters**: invalid input, not-found, forbidden, conflict/duplicate, dependency timeout/error, empty/zero state, boundary ±1 of every stated limit, double-submit/retry, concurrent modification, partial failure mid-sequence. Happy-path-only requirements are presumptively incomplete.

Also: clock skew for anything time-based, unicode/injection for any free text, pagination for any list that grows, idempotency for anything retried.

## Attack 5 — Contradictions and drift

- Requirement vs. requirement within the change.
- Change vs. **unmodified** requirements in `openspec/specs/` (the new 2FA requirement vs. an existing "users SHALL log in with email and password only").
- Change vs. other in-flight changes in `openspec/changes/`.
- MODIFIED deltas that silently drop scenarios/behavior the old requirement had, without a REMOVED entry or stated reason — diff old requirement text against the delta line by line.
- tasks.md vs. deltas: scenarios with no implementing task; tasks implementing nothing any requirement demands.
- proposal.md honesty: unmarked **BREAKING** changes; Impact section missing capabilities the deltas clearly touch.

## Finding quality bar

Every finding must have all four, or it doesn't ship:

1. **Location**: file + quoted text.
2. **Exploit**: the concrete wrong implementation or missed behavior it permits ("an implementer could ship X and still satisfy this spec").
3. **Severity**: BLOCKER (permits wrong implementation / omits designed behavior) · MAJOR (ambiguous or untestable) · MINOR (style, redundancy).
4. **Smallest fix**: proposed replacement text or the missing scenario, in valid OpenSpec format.

Discipline rules:

- **Verify before filing**: re-read the whole requirement, its sibling scenarios, and other capabilities' deltas — the coverage you think is missing may live next door. False findings burn a round of the repair loop.
- **No padding**: five confirmed kills beat twenty maybes. If the spec is good, the correct output is "no material findings" — manufactured objections erode the team's trust in real ones.
- **Attack the spec, not the design**: whether the feature is a good idea is out of scope; whether the spec faithfully and unambiguously captures it is the whole scope.
- **Escalating rounds**: in repair-loop round 2+, verify prior findings were actually fixed (not just acknowledged), then spot-check only areas the revision touched — don't re-litigate the untouched remainder.
