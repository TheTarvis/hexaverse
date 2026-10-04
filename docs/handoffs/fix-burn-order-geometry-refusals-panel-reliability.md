# fix-burn-order-geometry-refusals — panel review: reliability

Reviewer: reliability. Scope: spec stage, read-only. Verdict: **NEEDS FAILURE SPECS** (0 BLOCKER, 3 MAJOR, 4 MINOR).
Spawn-always-succeeds, determinism and healing are sound as specified. The gaps are observability after RULING 5, how the invariant is stated, and the residual.
Task budget: 33 now; the text below edits existing tasks and adds 1 (34 of 40).

## Lens answers (no finding)

1. **Spawn still succeeds.** `backend/corporations/siteselection.go:150-155` returns on the first ring with a qualifier. `qualify` (`:185-208`) just filters, so adding (d) there makes the walk continue past a ring with no qualifier (the `for hop` loop, `:123-171`). The exhaustion and depth-cap paths end in `ErrNoSpawnSite` (`:179`), already specified (spec.md:159-170). The analysis measures 203 of 2,102 mineable systems (9.7%) losing eligibility (analysis section 12.3 table, iv) and the live origin `sys_0_-1` passing. Determinism: `pickUniform` sorts by id and uses an account-seeded source (`:274-282`), so it stays per-account deterministic. Healing reuses the recorded home (spec.md:145-150, 217-222). See m1 for the one missing exhaustion scenario.
4. **Mutation retry policy.** `openspec/specs/mutation-retry-policy/spec.md` (Requirement 1) never resends any 4xx, including 409 and 404, and never resends 5xx. A 500 became a 409/404; neither is auto-resent, so there is no behaviour change and no retry amplification. See m3 for the two consequences that remain: the refusal is time-dependent, and the frontend copy matches on reason text.
5. **Rollback.** The change is reversible after taking traffic: no schema, no migration, and (d) applies only to new picks. Reverting the code leaves corps homed under (d) valid. This is not written down; see m4.

## MAJOR

### M1. A served refusal is invisible once it is not an error log (RULING 5)
- **Evidence:** the requirement "A Served Burn Solve Refusal Leaves No Trace" (specs/fleet-movement/spec.md:77-87) forbids error-level logging and says nothing about any lower-level record. The title says "no trace", which contradicts any record. Task 5.1 records that the old gate signature (the `log.Error` grep, `defect-station-order-500.md:219-241`) stops finding it.
- **Why it matters:** this change exists because a refusal was intermittent and only the error log showed it. Afterwards, a regression of criterion (d), or a genuine refusal at a qualifying home, becomes a bare 409 with no log line. "Zero refusals at a qualifying home" (see M2) cannot be observed in operation. Refusals are also not countable by cause.
- **Rename** the requirement to `### Requirement: A Served Burn Solve Refusal Changes Nothing And Is Not An Error`.
- **Add** to that requirement body, and add the scenario below:
```
The system SHALL record each served refusal named by this capability at a level below error, carrying the refusal cause (origin-inside-clearance, destination-inside-clearance, minimum-arc, absent-body), the route (order, preview, stop), the fleet id and the system id, such that served refusals are countable per cause and per route and distinguishable from internal faults, which are recorded at error level.

#### Scenario: A served refusal is recorded by cause below error level
- **WHEN** each of the four refusals is served on a commit, a preview and a stop
- **THEN** the captured log contains exactly one entry for the request, below error level, naming the cause, route, fleet id and system id
- **AND** a body-table cycle on the same routes produces an error-level entry that names no refusal cause
```
- **Task edit, 2.8:** append "and that exactly one below-error entry naming cause, route, fleet and system is written (log captured through an injected logger, no real sink)". **Task edit, 2.11:** "none logged at error level; each logged once below error with its cause".

### M2. The core invariant is stated as a sweep and a margin adjective, not a checkable predicate
- **Evidence:**
  - spec.md:187-193 says "a margin above float rounding", an adjective with no number.
  - spec.md:209-215 states the invariant through a sweep ("every phase of a sweep"). Task 1.6 sweeps phase, which is sampling by construction.
  - The analysis (section 12.2) gives the exact enumerable outcome: ring 0 gives 10.15 and fails for every class; ring 1 gives 15.67 and passes for M, K, G, F (clearances 13.0 to 15.5) and fails for A, B, O; ring 2 and beyond gives 22.46 or more. The tightest passing margin is 0.17 (ring 1, F).
  - That table is the checkable invariant. The sweep is only a cross-check of the triangle-inequality argument.
- **Edit the equality scenario (spec.md:187-193):** replace "exceeds it by a margin above float rounding" with "exceeds it by at least 0.1 world units (the tightest margin among passing (ring, star class) pairs is 0.17)". Note that 0.1 is only a test floor, 0.07 below the measured 0.17; if the analysis margin changes, the floor must be revisited, not the other way round.
- **Add a scenario to criterion (d), and edit task 1.1:**
```
#### Scenario: The predicate's outcome is fixed for every parent ring and star class
- **WHEN** criterion (d) is evaluated for every station-parent ring from 0 through the outermost skeleton ring and every star class
- **THEN** ring 0 fails for every class, ring 1 passes exactly for the classes whose clearance radius is below the ring-1 bound, and every ring from 2 outward passes for every class
- **AND** the smallest bound-minus-clearance margin among passing pairs is at least 0.1
```
  Task 1.1 should become: "enumerate every (ring, star class) pair and pin the pass/fail table and the smallest passing margin (0.17 at present)".
- **Drift coupling (extends task 1.2):** the predicate must take the clearance function, the ring-radius function, the parent feature ceiling and the insertion standoff from the same functions the solver and `StationContinuousOrbit` call, not copies. Task 1.2 should assert that changing any one of those terms moves the predicate. Otherwise a retune of `InsertionStandoff` makes (d) unsound without any test failing.
- **Sweep (task 1.6):** keep it as a corroborating test only, on a fixed grid. State the grid in the task (phases per revolution of station and park, inclinations covered) and run it on a named qualifying system id and a named failing control id, with an injected world clock. It must not draw homes by sampling. The failing control is already in 1.6.

### M3. The residual is stated incompletely and the risk has no home
- **Evidence:**
  - proposal.md:22 and :30 say existing homes "keep failing, now with a readable reason". The analysis says the failure is intermittent: 8.2% of departure solves at a docked fleet in an affected system (analysis section 4, "origin endpoint is guilty too"), in about 8.9% of systems (12.4). It is a function of park phase and world time, not a standing refusal.
  - The stranded false alarm is named in proposal.md:23 but not quantified. It reads as stranded with a full tank for the seconds the park is inside (`fuel.go:151-168`, per analysis section 3).
  - The proposal never says that stop-in-place is also refused for a fleet already inside, so a fleet inside the clearance cannot be stopped (analysis 12.4 closing note). Before this change that was a 500; after it, a typed 409.
  - The proposal also does not state that 9.7% of mineable systems stop being eligible homes (analysis 12.3, iv). No spawn fails, but the home distribution narrows.
  - The change has no design.md `## Risks`, so these trade-offs sit only in the handoffs.
- **Add to proposal.md under `### Out of scope`, replacing the last bullet "Arrangements that dock and then order...":**
```
- Existing corporations in a failing home (about 8.9% of systems, 31 more without a clear parent): their docked fleet still has an intermittent refusal, a function of park phase, not a standing one: 8.2% of departure solves measured. Each is now a typed 409 with a reason, and a re-issue after the park moves on may succeed. During those seconds the fleet also reads as stranded with a full tank, and a stop in place is refused. Arrangements that dock and then order in such homes can therefore still fail intermittently. Not repaired (RULING 2).
```
- **Add to `## Impact`:** "Home eligibility narrows: 203 of 2,102 mineable systems (9.7%, measured) stop qualifying; spawn still always succeeds."
- **Frontend copy (task 3.2):** since the origin and destination refusals are time-dependent, the lines must not say "impossible" or "never". Ask UX to word them as "blocked right now, try again shortly" for the clearance reasons, and "not available" for the absent-body line.
- **Add 1 task, 5.5:** "Record the residual in `defect-fleet-can-rest-inside-star-clearance.md` with the measured rates: 8.2% departure refusal, about 8.9% systems affected, stranded false alarm, stop refused for a fleet inside."

## MINOR

### m1. No scenario for criterion (d) exhausting every candidate
Exhaustion of the walk is covered generically (spec.md:165-170), but no scenario shows (d) as the cause. Add, and fold it into task 1.4:
```
#### Scenario: A field whose only candidates fail the station-shell criterion fails as ErrNoSpawnSite and leaves the account corpless
- **GIVEN** a deliberately pocketed test field in which every system satisfying criteria (a) through (c) fails (d)
- **WHEN** site selection runs
- **THEN** it fails with `ErrNoSpawnSite` and no corporation document, account pointer or reservation exists for the account
```
Optional: have the `ErrNoSpawnSite` log or wrap record how many candidates (d) excluded, so the rail's cause is attributable. This is a polish item.

### m2. Test determinism of the geometry tests and the starting-fuel test
- Task 1.9 keeps "the starting-fuel reachability sample" as a guard. The picks it depends on change under (d), though they are deterministic per account. Name the accounts and homes it asserts so it does not become another statistical test.
- Task 4.1 says "geometry refusal (reported as such, never a tuning signal)". At a qualifying home a geometry refusal is a violation of the invariant, not a data point. Edit 4.1 to read: "geometry refusal fails the test with a message naming criterion (d) as the suspect".
- Tasks 2.2 to 2.5 that arrange a position inside the clearance must set world time through the injected clock, not `time.Now()` (backend/CLAUDE.md `WorldClock`). Add the phrase "world time injected" to 2.3 and 2.4.

### m3. Retry policy and frontend skew
- No change to `mutation-retry-policy` is needed, but no scenario states that the new reason-bearing 409 and 404 are not resent. Do not add a scenario, because the existing one (`mutation-retry-policy/spec.md`, "A 409 conflict is not resent" and the other-4xx scenario covering 404) already covers it. One line in tasks 3.1 is enough: "no retry added".
- Copy is selected by matching reason text ("ordered so each matches before the generic line", task 3.2). Backend reason text and frontend patterns can drift apart with no failing test, and the player then sees the generic line. Pin one literal reason per refusal in a backend test and the same literal in `rejection-copy.test.ts`. Skew is tolerable in both deploy orders: an old frontend shows the generic or raw line. State that in task 3.2.
- I did not check `claude-agent/` tool handling of 4xx bodies; the agent is a second consumer of the new 409/404 and its handling is unverified.

### m4. Rollout is reversible but unstated
Add one sentence to the proposal `## Impact`: "No schema, migration or backfill; the change is reversible by redeploy, and homes selected under (d) remain valid if reverted. Backend and frontend may deploy in either order: an old frontend shows the generic line."

## Proposed delta summary
- fleet-movement: rename and extend "A Served Burn Solve Refusal Leaves No Trace" (M1).
- corporation-spawn: numeric margin and enumeration scenario (M2), exhaustion scenario (m1).
- proposal: residual and impact text (M3, m4).
- tasks: edit 1.1, 1.2, 1.4, 1.6, 2.3, 2.4, 2.8, 2.11, 3.2, 4.1; add 5.5.
