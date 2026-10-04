# Architect addendum 2 — `clear-burn-preview-on-commit`, findings on the round-1 repairs (2026-10-04)

*Persisted by the orchestrator, verbatim, from the architect's returned report
after it brought design.md current against revision pass 2. All four are
ACCEPTED for the writer (orchestrator; within RULING 14 — each completes a
round-1 repair). No new task: the count stays 40.*

**P1 — Scenario 14's new THEN clause is not arrangeable in arrangement one, and does not fail the build it was added for in arrangement two.** (`spec.md:248`, task 3.14)
- The clause is "while B is acting B's preview figures stay shown across A's acceptance", and task 3.14 calls it part of the "same closing assertion" for both rows.
- In row one, B is made acting after A's acceptance, so B is not acting across it and has no preview entry until then. The clause is observable in row two only.
- In row two, the build adversary m2 names (drop B's cache entry at A's acceptance) re-requests at once. The harness's `mocks.preview` auto-resolves (`mockResolvedValue(QUOTE)`), and `settle()` flushes before any assertion, so "figures stay shown" and "a preview is requested for B" both pass that build.
- The discriminating observation is that B's preview request count is unchanged across `answerOrder` (or the preview held on a deferred).
- Suggested repair: scope the clause to the second arrangement and add "and no preview request is sent for B at that acceptance"; task 3.14 row two asserts the count. No new task.

**P2 — Task 3.4's new step can pass the wrong build unless the fixture is dated in both places.** (scenario 4's last AND is fine; this is a task-precision issue)
- The view sees a served world time in two places: the envelope (`useMyFleets().worldTime`) and each fleet's own `worldTime` (`SystemSpaceView.tsx:470` reads `acting?.worldTime`).
- `answerListMine(index, fleets, worldTime)` dates only the envelope; `fleetOf` pins every fleet at `worldTime: W0`.
- A build that ends the state on `acting.worldTime >= ArriveMs` passes a row that dates only the envelope.
- Task 3.4 should say the answering read carries the past-arrival world time on the envelope and on the fleet.

**P3 — Nit: tasks 5.3 and 5.4 list the guards 3.15, 3.17 and 3.18 under "gates".** The header says they are green before implementation. "Gates" there can only mean "must stay green"; one word would say so.

**P4 — A failed read after the gap has ended — a real gap, minor** (the writer's second "noted, not applied" item).
- A build with an error term, e.g. `awaitingRead = countEqual || fleets.isError` (a natural reading of "IF a read fails THEN the gap continues"), passes all of 3.10.
- After a cut or stop has ended the state, the stale record is still in the map, so any failed poll re-enters it: the statement returns, Burn is disabled and the resumed quote is removed until a read succeeds.
- It fails safe (withheld, never uncapped), but it makes "leaves the last answer, and so all three, standing" false with no red test.
- It does not need a new arrangement: it is a fifth step on 3.10's walk and one AND on scenario 10. After the drifting answer, a further read fails: no statement, Burn available, the resumed preview untouched.
