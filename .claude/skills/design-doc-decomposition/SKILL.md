---
name: design-doc-decomposition
description: Method for decomposing a design document (PRD, RFC, architecture doc) into OpenSpec capabilities, requirements, and scenarios - extraction passes, capability boundary heuristics, ambiguity triage, change-splitting rules. Load when analyzing a design doc before spec authoring.
---

# Decomposing Design Documents into OpenSpec Material

Design docs are written to persuade and inform, not to specify — behavior hides in narrative prose, mockup captions, and throwaway sentences. This method extracts it systematically.

## Pass 1 — Inventory (read everything, extract candidates)

Read the full document once without deciding anything. Then sweep for these markers, tagging each hit:

- **Behavior verbs**: "the user can...", "the system will...", "when X happens...", "should be able to" → candidate requirements.
- **Numbers**: limits, timeouts, sizes, counts, percentages. Every number in a design doc is either a requirement threshold or decoration — decide which.
- **Negations and prohibitions**: "must never", "should not", "without" → SHALL NOT requirements (the most commonly dropped category).
- **Actors and roles**: every noun that does something (admin, guest, service, cron). Build the actor list; requirements will need it for authorization.
- **Nouns that persist**: anything stored, listed, or referenced later → data entities with lifecycle questions (created how? deleted how? unique by what?).
- **Hedges**: "probably", "ideally", "in the future", "eventually", "v2" → out-of-scope or open-question candidates. Never spec a hedge as a SHALL.
- **Mockups/diagrams**: every distinct UI state and every arrow in a sequence diagram implies behavior the prose may not repeat.

## Pass 2 — Capability mapping

Group candidate requirements into capabilities:

- A capability is a cohesive set of behaviors a user or system gets (`user-auth`, `order-checkout`, `notification-delivery`) — kebab-case, verb-noun scoped.
- **Split test**: if describing it needs "and", split. **Merge test**: if two capabilities always change together, merge.
- Map each capability against the existing `openspec/specs/` (read them; run `openspec list --specs` if available): **new** capability, or **delta** to an existing one? For deltas, quote the exact existing `### Requirement:` headers being modified.
- Check `openspec/changes/` for in-flight changes touching the same capabilities — flag conflicts; two active changes modifying one requirement is a coordination problem to surface, not ignore.
- Verify against the codebase: where the design doc describes current behavior, spot-check the code — design docs routinely mis-describe the system they're changing. Discrepancies are findings.

## Pass 3 — Requirement extraction per capability

For each capability, convert candidates using the patterns in `spec-writing-quality`:

- Rephrase to SHALL + observable behavior; classify ADDED / MODIFIED / REMOVED / RENAMED.
- For each requirement, draft scenarios via the coverage heuristic (happy path, failures, boundaries, empty state, repetition, concurrency) — from what the design doc IMPLIES, not just states. A design doc that shows a payment form implies decline, timeout, and double-click behavior even if it never mentions them; draft the scenario and mark it INFERRED so the writer and reviewers know its provenance.
- Sort each statement by altitude: requirement (WHAT) vs. design decision (HOW → design.md candidates) vs. work item (tasks.md candidates).

## Pass 4 — Ambiguity triage

Every gap found becomes exactly one of:

1. **Resolvable** — the answer is elsewhere in the doc, the existing specs, or the code. Resolve it and cite where.
2. **Inferable-with-flag** — an industry-standard default exists (e.g., email case-insensitivity). Propose the default explicitly marked INFERRED for reviewer confirmation.
3. **Open question** — genuinely the author's call (business rule, threshold, priority). Quote the ambiguous passage, state the question, list the options with consequences. NEVER silently pick.

Contradictions within the design doc (page 2 says 30 days, page 5 says 60) are always category 3.

## Pass 5 — Change structuring

- One change per independently shippable, reviewable unit. A change someone can't review in one sitting is too big; a change that can't deploy without its sibling is too small.
- Order multiple changes by dependency; name the dependency in each proposal's Impact section.
- Propose verb-led kebab-case change IDs.

## Output structure

Deliver the analysis as:

1. Capability map (new vs. delta, with existing-requirement quotes)
2. Per capability: requirements (classified) with draft scenarios (INFERRED ones marked)
3. Design-decision candidates for design.md
4. Ambiguities: resolved (with citation) / inferred (flagged) / open questions (quoted + options)
5. Out of scope (deferred by the doc — goes in the proposal so it's recorded as deliberate)
6. Proposed change structure with IDs and ordering
