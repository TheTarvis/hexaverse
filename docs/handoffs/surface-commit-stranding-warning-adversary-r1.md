# Adversary round 1 — `surface-commit-stranding-warning` (change mode)

*Persisted by the orchestrator, verbatim, from the adversary's returned text
(2026-10-04); the adversary is read-only and does not write files. The
orchestrator's binding rulings follow the report, under "Orchestrator rulings".*

**Counts:** 0 BLOCKER, 3 MAJOR, 6 MINOR. **Verdict: NOT CLEAR.**

Nothing was run: every claim below is from reading the change, the live specs, the handoffs and the code at the working tree. The React Query facts in design.md (cancelling invalidation, answer count) were checked against `frontend/hooks/use-fleets.ts` and the callers of the own-fleets key, not re-measured.

## What held under attack

- **Fidelity to B1.** Every end-of-life path B1 names is in "The end" with a scenario and a task: cut drive, stop above and below the floor, arrival at a body, arrival at a point, an outside re-task to the same or another target, and the gap. Each clause is stated against reads.
- **The gap mechanism.** The answer-count rule in design Decisions 2 and 6 is sound against the code. `useOrder`'s hook-level `onSuccess` invalidates the own-fleets key (`use-fleets.ts:72`, `:44`). No non-test code writes that key with `setQueryData`; the only other touches are invalidations (`use-fleets.ts:152`, `use-market.ts:120`), and the view's refetches (`SystemSpaceView.tsx:515`).
- **Identity.** `DepartMs` and `ArriveMs` are assigned only at burn construction (`backend/space/burn.go:480-481`) and in the codec. The commit response and the list read go through the same DTO (`handler.go:454-464`).
- **Failed read, degraded read, clock.** `ListForCorp` can return a due fleet unsettled (`service.go:404-452`), and the spec keeps the notice in that case. No two clauses give different answers on these paths.
- **Scope.** Nothing of 2a-iii-b leaked in. There is no backend, galaxy, palette or type change: `toast.warning` and the amber line already exist (`lib/toast.ts:31`, `SpaceCommandPanel.tsx:281`). There is no client arithmetic, nothing from the withheld-burn follow-up, and the U2 timer hunks are untouched.
- **Panel dispositions.** A1–A14, F1–F3, F5 and F6 are applied as disposed; F4 is declined as ruled.
- **Rulings.** The change is faithful to RULINGs 1–12 of this change and RULING 3 of `clear-burn-preview-on-commit`. I found no ruling that contradicts the design input or a live spec, apart from the count consequence in M3.
- **Counts.** 25 scenarios and 40 checkboxes, as stated. Every scenario has a task.

## MAJOR

### M1 — A second warned commit by the same fleet has no scenario and no task

**Where.** Delta, "Whose notice":
> "a fleet's later accepted burn commit ends that fleet's earlier notice at that acceptance, whether or not the later response carries the warning"

and "What the notice is":
> "The warning SHALL be conveyed to assistive technology exactly once, at the acceptance"

The only scenario for a later commit by the same fleet is *A later commit by the same fleet replaces the earlier notice*, whose WHEN is "accepted with no stranding field in its response". Tasks 3.13 and 1.6 match it: one unwarned follow-up, one warned commit.

**Why it is wrong.** The warned-then-warned path is the likeliest real one: a player sees the warning, re-targets, and the new course also strands. Two wrong implementations pass all 25 scenarios and all 40 tasks:
- **First record wins.** The view keeps the fleet's existing record when a second warned commit lands, and deletes only on an unwarned one. After the second acceptance the stored count is stale and the stored instants are the first order's. The notice disappears at the first read that reports the second order, while a warned order is running.
- **Toast deduplicated per fleet or per session.** "Exactly once" can be read as once per notice lifetime rather than once per warned acceptance. The second warned commit then raises no toast.

**What a repair must achieve.**
- A scenario and a test at the view, over the real hook: fleet A's order has a notice, A's next commit is accepted with the warning and different instants, and a read then reports the second order's instants. The notice must be shown at that point, and must be removed when a later read stops reporting the second order.
- The requirement must say unambiguously that the toast is once per accepted warned response, and the same test must count two toasts.
- This adds a closing assertion that 3.13 does not share, so it bears on the cap (see M3).

### M2 — The announcer clause is false on the commonest way the notice ends

**Where.** Delta, "What the notice is":
> "appearing or being removed SHALL NOT change the view's live-region announcement"
> "the notice's later removal, its return on a switch back to the fleet, and read refreshes SHALL NOT raise any further toast or announcement"

Scenario *The notice is advisory and distinct from the preview's stranding line*:
> "the view's live-region text is unchanged when the notice appears and when it is removed"

Task 3.16 says "the announcer text identical before its appearance, after it and after its removal", with the removal path unnamed.

**Why it is wrong.** Arrival at a body removes the notice, and the same read is required to change the announcer. Live *A Landed Resolution Is Announced to Assistive Technology* (`openspec/specs/system-space-view/spec.md:2002`) requires it, and `SystemSpaceView.tsx:603-604` sets "Burn complete — arrived and attached to …" in the effect that runs on that read. As written:
- The THEN is unsatisfiable on that path, so a correct implementation fails 3.16 if the test removes the notice by arrival at a body.
- A literal implementer could suppress the landing announcement to satisfy the sentence, which breaks the live requirement.
- The proposal row for the announcer requirement says "No delta", but the delta's sentence and that requirement give different answers for one read.

**What a repair must achieve.**
- The clause must be about what the notice contributes: it adds no text to the announcer and causes no announcement of its own. The announcer's text is whatever it would be without the notice.
- The scenario and task 3.16 must name a removal path that lands nothing announceable (cut drive, or arrival at a point), or assert on the arrival-at-body path that the announcer carries exactly the landed-resolution text.

### M3 — Task 3.8 is not one arrangement under RULING 12's own test, so 40 is not honest

**Where.** tasks.md 3.8:
> "One parametrised arrangement over three rows, same harness (a warned commit accepted, then an own-fleets read answered with the fleet in a state that is not the committed burn) … Row three: the first read requested after the acceptance already reports the settled park; this row additionally asserts the notice is present until that read answers"

RULING 12 allows a merged task only for "rows of one parametrised arrangement over the same harness state with the same closing assertion".

**Why it is wrong.** The task can be read two ways and fails under both.
- **Reading A: rows one and two follow their scenario.** *A different order placed elsewhere…* has GIVEN "the notice is shown for the order departing at 1000 and arriving at 61000", and "The lag" says an outside change is known at a baseline poll. So rows one and two need the first read to answer the committed burn, then a poll-caused read to answer a different burn. Row three has the first read itself answer the park. That is two harness states, and row three carries an extra assertion. By RULING 12 this is two tasks and the change is at 41.
- **Reading B: all three rows are answered by the first read after the acceptance.** Then the arrangement is honestly one. But no task then tests the transition the scenario is named for: a read confirms the order by its instants, and a later poll-caused read reports a different burn. Tasks 3.9, 3.5 and 3.7 cover confirmed-then-no-burn; 3.6 does not say whether the first read answered before the stop.

**The other two merged pairs.**
- 3.7 (arrival at a body / at a point) is honest: one arrangement, one assertion, rows differ only in the read's answer.
- 3.11 (switch back / late response) is defensible: the parameter is whether the response lands before or after the switch, and "toast called once in total" can be the identical closing assertion for both rows. As written the two rows state their extra assertion differently; it should be one assertion.

**What a repair must achieve.**
- 3.8 must state which read answers in each row.
- If rows one and two are poll-caused reads after a confirming read, the settle-inside-the-round-trip row is its own task.
- With M1 the honest count is then 42, and RULING 12's stated consequence applies. That is the orchestrator's to rule; it must not be absorbed by re-bundling.

## MINOR

- **m1 — No scenario pins "both instants".** The requirement says "departure instant and arrival instant both equal". Every differing example differs in both (5000/80000 and 70000/90000 against 1000/61000). An implementation comparing only `ArriveMs`, or only `DepartMs`, passes everything. Repair without a new task: make one existing row differ in exactly one instant (for example the same-target row departing at 5000 and arriving at 61000).

- **m2 — Scenario *A read begun before the commit…* never states the commit's instants.** Its last AND says the notice survives a read "burning 1000 to 61000", but the GIVEN gives the response no instants, so the THEN is undecidable as written. State them in the GIVEN.

- **m3 — One sentence of "The lag" is false when the view never read the burn.** "An arrival is known at the first read that reports it, which the view requests shortly after the order's served arrival instant." The ETA timer is built from the read's burns (`SystemSpaceView.tsx:542-551`), not from the commit response. If the first read after the acceptance fails, no timer is armed and the next request is the baseline poll or the manual retry. The paragraph's caveat ("assumes the read it names answers") does not cover a read that was never requested. The sentence must be conditioned on a read having reported the burn.

- **m4 — The `fleet-roster` "No delta" row does not record the reading it relies on.** Live scenario *A commit with no warning shows no stranding notice* says "no stranding notice is rendered". With per-fleet notices that is literally false in a reachable state: B's unwarned response lands after the player has switched back to A, whose notice is on screen. The sensible reading is "no notice for that commit"; the table row should say so, as the predecessor's m4 asked for the same kind of case.

- **m5 — Undefined term and an unasserted clause in the requirement.**
  - "changes no record" and "The record exists only in the open view" use "record" after A5 removed its definition from the delta. Either define it in behavioural terms or restate both sentences as what is shown.
  - "the notice's text also tells the player to place a different order" has no assertion. The copy scenario and task 3.18 check stations, lane gates, digits and "strand" only; the toast string is pinned to design's constant (task 1.6) but the inline string is not.

- **m6 — Two record and design mismatches for the next link.**
  - chain.md's 2a-iii row and "Delivers" say the view keeps "a record of the order it committed", and 2a-iii-b is "built on the order record 2a-iii lands". This change stores a record for warned orders only (A12, design Decision 5). Task 5.2's Taught list must say so, or 2a-iii-b will assume a record that does not exist for an ordinary commit.
  - Design Decision 2 stores `null` (no gap) "if none is [in flight]". A paused fetch (the connection drops as the response lands) or a first read that has already failed is not in flight and has not answered. The delta says the gap continues there; the design shows no notice until a read reports the burn, and never for a response without instants. Decision 2 should define "in flight" so that only an answered read closes the gap.

## Verdict

**NOT CLEAR.** No blocker: the lifetime rule is faithful to B1 and the mechanism holds against the code. M1 and M2 each let a wrong or self-contradictory build pass, and M3 means the task count is 41 before M1's repair and 42 after it, which is past the cap RULING 12 set.

---

## Orchestrator rulings (binding; 2026-10-04)

All nine findings are confirmed as real. Dispositions (full reasoning for the
sizing consequence: `surface-commit-stranding-warning-rulings.md` RULING 13):

| Finding | Disposition |
| --- | --- |
| M1 | ACCEPTED — a new scenario and its own view-level task: a warned commit, then the same fleet's next commit accepted with the warning and different instants; the notice is shown through the second acceptance, still shown when a read reports the second order's instants, removed when a later read stops reporting it. The requirement says the advisory toast is once per accepted warned response; the test counts two. |
| M2 | ACCEPTED — the clause is about what the notice contributes: it adds no text to the view's announcer and causes no announcement of its own. The scenario and task name cut drive as the removal path. The proposal's announcer row says so. |
| M3 | ACCEPTED — reading A. Task 3.8 keeps rows one and two (a confirming read, then a poll-caused read reporting a different burn; each row states which read answers); the settle-inside-the-round-trip row is its own task. Task 3.11's two rows state one identical closing assertion. |
| m1 | ACCEPTED — the same-target row differs in exactly one instant (departs 5000, arrives 61000). No new task. |
| m2 | ACCEPTED — the GIVEN states the instants. |
| m3 | ACCEPTED — the arrival sentence is conditioned on a read having reported the burn. |
| m4 | ACCEPTED — the `fleet-roster` row records the reading "no notice for that commit". |
| m5 | ACCEPTED — "record" leaves the delta (both sentences restated as what is shown); the "place a different order" clause is asserted in the existing copy scenario and its task (the inline text is pinned to design's constant, as the toast's is). |
| m6 | ACCEPTED — chain.md's 2a-iii row/section and task 5.2 say the record exists for warned orders only; design Decision 2 defines the gap as open until a read requested at or after the acceptance *answers*, so a paused or already-failed fetch does not close it. |
| Sizing | RULING 13 — M1 and M3 take the honest count to 42. The warned-response-without-both-instants case (RULING 10: one sentence, one scenario, two tasks) leaves the change as a filed follow-up; the count returns to 40. |

**Verdict commit:** none — round 1 was NOT CLEAR.
