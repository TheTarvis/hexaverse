# Rulings — `fix-burn-order-geometry-refusals`

Append-only. Read `fix-burn-order-geometry-refusals-rulings-index.md`, not this file.

## HARD STOP 1 — the run stopped after analysis, before authoring: the geometric fix re-records `fixtures/space/cases.json` and the origin-side refusal is a product call with no recorded lean

**Date:** 2026-10-04. **Stage:** Phase 1 step 1 complete (analysis); nothing authored, no change folder, no code.

**Not a ruling — no question was ruled in this run.** Two conditions, each sufficient:

1. **Fixture condition (the launching instruction's own stop rule).** Every solver-geometry option
   (analysis section 5, lines 147-162) changes `fixtures/space/cases.json`: the `buildCurveSweep`
   and `solveBurnSweep` digests and the `measured` block. The generator option (D) changes
   `fixtures/system/cases.json`, which must not be recorded on this arm64 machine. The instruction
   was to stop and report before regenerating anything. Nothing was regenerated.
2. **Product call with no recorded lean (analysis Q2, lines 271-272).** The clearance guard refuses
   on the ORIGIN as well as the intercept (`backend/space/burn.go:281`; live scenario
   `space-kinematics/spec.md:456`). A fleet docked at an affected station sweeps inside the
   clearance on its park orbit, so departures are refused too (analyst probe: 8.2% of departure
   solves in the 8.9% of affected systems). `defect-station-order-500.md:28-30` asserts the origin
   is never guilty; that is wrong after the first order. No clamp of the insertion point fixes
   it. Whether the clearance is a place a fleet may never be, or only a place a burn may not end,
   is recorded nowhere.

**What resumes the run:** answers to analysis Q1 (mechanism), Q2 (origin side) and Q10 (may the
space fixture family be re-recorded here), then spec writer from
`fix-burn-order-geometry-refusals-analysis-index.md`. Adversary rounds used: 0 of 3.

## USER RULING 1 — star clearance is a space a fleet may never be; the solver guard on both endpoints stands, and the geometric fix moves to where a station is placed

**Date:** 2026-10-04. **Who:** Travis, relayed verbatim by the coordinating session on resume
(not a FULL-AUTO RULING). **Answers:** HARD STOP 1 condition 2 (analysis Q2).

> "1) star clearance is a space that a fleet may never be."

**Consequences drawn by the orchestrator (each to be verified by the analyst addendum, not assumed):**

- The guard at `backend/space/burn.go:281` / `space-kinematics/spec.md:456` refuses on origin and
  intercept alike and is correct as it stands; it is not relaxed.
- Far-side phase entry (analysis option B1/B2) and radial push (option A) are out as the
  geometric fix: neither stops a docked fleet's park orbit sweeping inside the clearance, which
  the ruling forbids. If so, no solver geometry changes and `fixtures/space/cases.json` is not
  re-recorded (analysis Q1's solver options and Q10 become moot).
- The geometric fix belongs where the station is placed: no station may have a standoff/park
  shell that reaches the clearance. Mechanism (derivation vs. spawn site selection) is a
  separate ruling, pending the analyst's addendum.
- Fixture stop conditions are unchanged: no system-generation fixture is recorded on this arm64
  machine, and `fixtures/space/cases.json` is not recorded without the amd64 cross-check.

## FULL-AUTO RULING 1 — the geometric fix is a spawn site-selection criterion (mechanism b): a system whose station shell would reach the star clearance never qualifies as a home; the station derivation and the solver are untouched

**Question:** analysis Q12 (section 12). **Basis:** USER RULING 1 (a fleet may never be inside the
clearance, so the fix is placement, not the solver) → the launching brief's stop condition forbids
re-recording a system-generation fixture on this machine, which mechanism (a) requires
(`fixtures/system/cases.json` `stationOrbit` / `stationOrbitSweep`) → most reversible (one
predicate, no stored shape, no fixture). Predicate and measurements: analysis section 12.
**Rejected:** (a) derivation picks a clear parent — repairs existing corps too, but blocked by the
fixture condition and leaves a 1.39% star-parented fallback; solver options A/B1/B2 — out under
USER RULING 1. **Reversal cost:** delete one criterion and its requirement text; no data to undo.

## FULL-AUTO RULING 2 — corporations already homed in a failing system are not repaired or migrated

**Question:** Q15. **Basis:** root `CLAUDE.md` memory "solo toy, no backcompat — never plan
migrations"; the resume instruction restates it. Healing keeps the recorded home. Such a corp
gets the typed refusal instead of a 500. **Rejected:** re-homing on heal; a backfill.
**Reversal cost:** none (nothing built).

## FULL-AUTO RULING 3 — clearance and minimum-arc refusals are 409 with a reason body; a target body id absent from the system is a reason-bearing 404; the same body on orders, orders/preview and stop

**Question:** Q4. **Basis:** `drift-fleet-wrong-state-500.md:58-70`,
`defect-zero-length-burn-returns-500.md:21`, `backend/fleet/handler.go:483-487` and the 404
precedents at `:553-558`, `:588-593`; `defect-station-order-500.md:308-310` (one decision across
routes). **Rejected:** 400 (not a request-shape error); 422. **Reversal cost:** one handler arm each.

## FULL-AUTO RULING 4 — the clearance refusal distinguishes origin-inside from destination-inside, decided in backend/fleet; `space.ErrEndpointInsideClearance` is not split and the star shares the destination reason with no identity check

**Question:** Q5. **Basis:** `defect-station-order-500.md:58-59` ("distinguishable") reconciled
with live `fleet-movement/spec.md:2416-2422` (no destination-identity comparison) by a purely
geometric distinction; analysis section 12 item 1 (splitting the `space` sentinel would re-record
`fixtures/space/cases.json`, a stop condition). **Rejected:** a star-specific reason; a split
sentinel in `space`; one undifferentiated reason. **Reversal cost:** collapse two reason strings
to one. If the architect finds the distinction cannot be made in `fleet` without editing
`backend/space`, it collapses to one reason — the fixture condition outranks this ruling.

## FULL-AUTO RULING 5 — a served solve refusal is not logged at error level

**Question:** Q6. **Basis:** `defect-station-order-500.md:36-38`;
`lift-burn-preview-to-view-panel-security.md:69`. **Rejected:** keep error-level. **Reversal cost:** one line.

## FULL-AUTO RULING 6 — the absent-body target and the stop route are in scope; faults that are not player-causable stay 500

**Question:** Q7, Q8. **Basis:** `defect-station-order-500.md:124-126` (sweep every sentinel, do
not map one at a time) and `:308-310`. **Rejected:** orders + preview only. **Reversal cost:** n/a.

## FULL-AUTO RULING 7 — refusal reasons are text in the existing `error` body; no machine-readable reason code is added

**Question:** Q9. **Basis:** the brief excludes new wire fields
(`drift-commit-response-carries-no-delta-v.md` is out for being one); the frontend already keys
copy on text (`frontend/lib/rejection-copy.ts`). **Rejected:** a `reason` code field.
**Reversal cost:** additive later.

## FULL-AUTO RULING 8 — dipping non-station bodies, drift or free-stop inside the clearance, and the stranded false alarm are NOT ruled: they are new product calls, filed by this change and left open; the typed refusal is what they serve meanwhile

**Question:** Q3, Q13, Q14. **Basis:** no recorded lean anywhere; USER RULING 1 states the
principle but not the mechanism for these (undockable planet vs. generator change vs. drift
clearance check), and each candidate mechanism hits a fixture stop condition. They do not block
this change: none is on the home-station order path this change repairs. **Rejected:** guessing a
mechanism; hard-stopping a change they do not gate. **Reversal cost:** none. Filed as
`defect-fleet-can-rest-inside-star-clearance.md`.

## FULL-AUTO RULING 9 — the new station-shell predicate gets a hand-written entry in `fixtures/system/mirror-map.json`'s inventory; no recorded fixture is touched, and the change's empty-diff check covers recorded fixture files only

**Question:** architect MAJOR 1. **Basis:** panel (architect) recommendation; the stop condition
names RECORDED system-generation fixtures (`fixtures/system/cases.json`), and the mirror map is
hand-maintained inventory that no gate reads for `system`. **Rejected:** leaving the inventory
stale; treating a documentation entry as a fixture stop. **Reversal cost:** delete one entry.
**Carried forward:** the entry obliges the next change that modifies `backend/system` to give the
predicate a recorded family (to be recorded off this machine).

## FULL-AUTO RULING 10 — showing the refusal reason in the preview's no-quote state and hiding Retry is NOT in this change; it is appended to `followup-explain-withheld-burn-command.md`

**Question:** UX MAJOR 2. **Basis:** design input scope — analysis section 11 and
`defect-zero-length-burn-returns-500.md` already assign "any stated reason beside a withheld or
failed preview" to that follow-up; spec-first forbids a task-only behaviour change, and its delta
would land in `system-space-view`, which the active `clear-burn-preview-on-commit` touches
(archive-order hazard the brief says to avoid). **Rejected:** a task-only UI change; a
`system-space-view` delta here. **Reversal cost:** none.

## FULL-AUTO RULING 11 — every served refusal writes one below-error log entry (cause, route, fleet, system); the legacy `star-clearance` copy needle is replaced by the origin and destination needles; when both endpoints are inside, the origin reason is served

**Question:** reliability M1 vs architect design.md open question 2; design.md open question 3;
writer open question 2. **Basis:** panel — reliability on observability (consistent with RULING
5: not error level), architect on the both-inside order and reason strings (design.md decisions
4, 6), UX on copy. **Rejected:** no log at all (a criterion regression would be silent); a
separate warn level for origin; keeping a needle no served string matches.
**Reversal cost:** one log call; one copy-table line.

## FULL-AUTO RULING 12 — the three fault clauses a real body table cannot arrange (cycle 5xx, present target with a missing parent 5xx, the cycle's error-level log) are covered as "helper + handler, composed"; no exported table constructor is added

**Question:** impl contract, "the arrangement constraint". **Basis:** panel (architect, technical
shape): `system.Service.BodyTable` drops every unresolvable feature, so the fault is unreachable
through the real table; the solve helper takes the `space.Bodies` interface. Most reversible: no
production surface is added for tests. **Rejected:** an exported table constructor (no task covers
it; exceeds Impact); marking the clauses reasoned-not-automated. **Reversal cost:** none.

## FULL-AUTO RULING 13 — tasks 1.10 (starting-fuel sample clause), 5.2 and 6.3 close from the archive gate itself; they do not block entry to the journey

**Question:** the Verify → Journey gate asks for zero unchecked tasks, but these three are
defined in terms of the gate's own result (the sample is an e2e-tagged tier-3 test; 5.2 closes
defect records "with the evidence of the gates that pass"; 6.3 is the gate). **Basis:**
`docs/testing-tiers.md` (tier 3 runs once per change, at archive time, never as a per-task
check); precedent `clear-burn-preview-on-commit` tasks 7.3-7.6. **Rejected:** a separate tier-3
run before the gate (forbidden "confirming rerun"). **Reversal cost:** none.

## FULL-AUTO RULING 14 — task 1.10 closes on the tier-3 pass of both starting-fuel tests; the accounts and homes they asserted are NOT named, and that limit is stated rather than bought with another run

**Question:** task 1.10 asks to confirm the reachability sample passes "naming the accounts and
homes it asserts"; the gate run passed both tests (the flagship and the 8-account sample) but a
passing Go test logs nothing, so the journey record cannot name them. **Basis:** RULING 13 and
`docs/testing-tiers.md` — tier 3 runs once per change and a confirming or verbose rerun is
forbidden; the clause's purpose (reliability m2: a failing sample is attributable) is met by the
repaired test, which names the sample index and the refusal class on failure. **Rejected:** a
verbose tier-3 rerun; leaving the task unchecked and the change unarchivable over a logging
detail. **Reversal cost:** none. **Carried forward:** if the homes matter, have the sample log
each account's home system id (a test-only follow-up).

## FULL-AUTO RULING 15 — the archive gate is GREEN at both tiers, run once each by one runner, with no residue to rule; the change is archived

**Basis:** `fix-burn-order-geometry-refusals-journey.md` — tier 4 28 passed / 0 failed (410 s),
tier 3 1979 tests / 1 by-design skip / 0 failures (1026 s), zero star-clearance error lines, no
SIGTERM during either run; process table and test ports checked clear by the orchestrator at
20:12 before the tree was touched; manifest verify clean at 21 files; `validate --strict` valid,
reconcile OK, archive rehearsed on a scratch copy (8 added, 1 modified, all three `## Purpose`
sections preserved). QA's matrix had no row waiting on the journey. **Rejected:** n/a.
**Reversal cost:** n/a.
