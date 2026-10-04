# Adversary round 2 — `surface-commit-stranding-warning` (change mode)

*Persisted by the orchestrator, verbatim, from the adversary's returned text
(2026-10-04); the adversary is read-only and does not write files. The
orchestrator's binding rulings and the verdict commit follow the report.*

**Counts:** 0 BLOCKER, 0 MAJOR, 2 MINOR (both in design.md, neither material). **Verdict: CLEAR.**

No material findings; the spec is implementation-ready. Nothing was run: this is from re-reading the four change files whole, RULING 13, the follow-up record, the corrected chain sections and `backend/fleet/service.go`.

## Round-1 findings

| Finding | Status | Evidence |
| --- | --- | --- |
| M1 | FIXED | New scenario *A second warned commit by the same fleet replaces the notice and raises its own warning* and its own task 3.14. A first-record-wins build now fails at "when a read reports the second order's instants the notice is still shown"; a deduplicated toast fails "two in total". The requirement now says "once per accepted warned response, at that acceptance". |
| M2 | FIXED | The clause now reads "it adds no text to the view's live-region announcement and causes no announcement of its own … (a landed arrival read that removes the notice still announces its landing…)". The scenario and task 3.17 name cut drive as the removal path, which announces nothing (`SystemSpaceView.tsx:603-604` announces only on an attached landing). The proposal's announcer row matches. |
| M3 | FIXED | Task 3.8 is two rows of one arrangement, each stating that a confirming read answers first and a poll-caused read answers second. The settle-inside-the-round-trip case is its own task 3.9. Task 3.11's two rows share one closing assertion, including "`toast.warning` called exactly once in total". |
| m1 | FIXED | Row two departs at 5000 and "still arrives at 61000", so an arrival-only comparison fails. A departure-only comparison would still pass, but two orders sharing a departure instant are not reachable (`DepartMs` is the server's clock at the solve), so I do not raise it. |
| m2 | FIXED | The GIVEN states "departing at 1000 and arriving at 61000"; task 3.2 matches. |
| m3 | FIXED | "Once a read has reported the order running, an arrival is known at…; if no read has yet reported the order running, the next read is the baseline poll or the player's retry." |
| m4 | FIXED | The `fleet-roster` row records the reading "no notice for that commit". |
| m5 | FIXED | "record" no longer appears in the delta. The copy scenario gains "it tells the player to place a different order", and task 3.19 pins the inline text to design's constant. |
| m6 | FIXED | chain.md's 2a-iii row, its "Delivers" and the 2a-iii-b section say the record is for warned orders only; task 5.2 carries it. Design Decision 2 stores the count unless the commit's read has already answered (`fetchStatus` idle with `status` success), so a paused or already-failed fetch leaves the gap open. |

## The revised areas

- **Count.** 25 scenarios and 40 checkboxes. Under RULING 12's test the count is honest: 3.7, 3.8 and 3.11 are each one arrangement with one closing assertion, and no repair introduced a new bundle. Task 3.14 is one arrangement walked in sequence.
- **Dangling references.** The delta says nothing about a response lacking an instant. The proposal lists it out of scope, and design Decision 7 points at the follow-up. Tasks 1.4 and 3.10 of round 1 are gone, and task 4.1 no longer says "null where absent".
- **RULING 13 is sound.** `OrderTo` builds `burnState` with a non-nil burn before the commit and assigns it to the returned fleet on every accepted order (`service.go:790`, `:877`). `strandingWarning` is set only on that path (`:892`). A warned response without both instants is not reachable on the real wire, so shedding it leaves no reachable state where the requirement is false or undefined.
- **No new contradictions.** The reworded lag sentence, the "notice exists only in the open view" sentences and the proposal rows are consistent with the code and with each other.

## MINOR (new, design.md only)

- **n1 — The design still builds the shed behaviour.**
  - Where: Decision 5 and Decision 8 keep `departMs: number | null` and `arriveMs: number | null`; Decision 6 keeps the null guards; Decision 7 says the case is "unspecified by this change".
  - Why: as written, the design yields RULING 10's gap-only notice with no scenario and no test.
  - Repair must achieve: either Decision 7 says the null-typed fields are a defensive type only and their behaviour is the follow-up's to specify, or the fields are narrowed. No task is needed.

- **n2 — One Risks sentence is stale against the revised Decision 2.**
  - Where: Risks says "In harnesses that mock `useMyFleets` the query does not exist, the count is `undefined`, no gap is ever open".
  - Why: under the new rule an absent query state is not "idle with success", so `undefined` is stored and equals the render-time `undefined`. The gap would then be open forever in those harnesses, not never. It is harmless today: the only `strandingWarning` values in `SystemSpaceView.burn-preview.test.tsx` and `SpaceCommandPanel.test.tsx` are on previews, so no existing test commits a warned burn.
  - Repair must achieve: the sentence agrees with Decision 2, or Decision 2 says what an absent query state stores.

## Verdict

**CLEAR.** All nine round-1 findings are fixed in substance, the repairs introduced no contradiction or bundled task, and RULING 13 holds against the backend. n1 and n2 are wording in design.md and can be corrected without reopening the delta or the task count.

---

## Orchestrator rulings (binding; 2026-10-04)

| Finding | Disposition |
| --- | --- |
| n1 | ACCEPTED — Decision 7 says the nullable fields are a defensive type only, their behaviour unspecified and untested here and the follow-up's to specify. Types not narrowed; no task. |
| n2 | ACCEPTED — the Risks sentence is made to agree with Decision 2. |

Both are repaired in design.md exactly as the adversary stated, inside the
verdict commit, without a third round
(`surface-commit-stranding-warning-rulings.md` RULING 14). Rounds used: 2 of 3.

**Verdict commit:** `af747be` — round 2 CLEAR; the verdict is current while `git diff af747be -- openspec/specs/system-space-view openspec/specs/fleet-roster openspec/changes/surface-commit-stranding-warning` is empty.
