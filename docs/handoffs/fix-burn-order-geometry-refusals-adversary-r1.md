# Adversary round 1 — `fix-burn-order-geometry-refusals`

**Date:** 2026-10-04. **Mode:** change. **Round:** 1 of 3. Read-only on specs and code.

Inputs read: the change folder (proposal, design, tasks, three deltas); both defect records;
the rulings file (HARD STOP 1, USER RULING 1, FULL-AUTO RULINGS 1-11); analysis sections 3 and
12; the consolidated panel dispositions; live `corporation-spawn`, `fleet-movement`,
`docked-fleet-actions`, `system-space-view`, `mutation-retry-policy`; the active change
`clear-burn-preview-on-commit`; and the code named in the brief.

**One probe was run, outside the repo.** A throwaway Go module in the session scratchpad
(`replace hexaverse => backend`, importing only `hexaverse/space` and `hexaverse/common`) drove
the real `space.SolveBurn`, `Park.Position` and `Park.Velocity` over a synthetic body table
(star, one rocky parent, one station at local radius 10.0, a fleet in an orbit park at 3.85;
24 x 24 x 24 phases x 3 world times = 41,472 arrangements per row, accel 8.0). Nothing in the
repo was written, no fixture read or regenerated, no suite run. Its numbers are quoted in
BLOCKER 2 and MINOR 5 and are marked as probe results; everything else is from reading.

## What held up (attacked, no finding)

- **The bound covers every radius the solver and the dock use.** Parent radius is
  `ContinuousRadius(b.Ring)` with the raw skeleton ordinal and id `feat-body-<i>`
  (`backend/system/generator.go:58-62`, `continuous.go:247`), the same index
  `StationContinuousOrbit` picks (`station_continuous.go:42-48`). The burn intercept is an orbit
  park at `InsertionStandoff(body)` (`space/burn.go:262-271`), the settled dock is that same
  park, a hold's offset is taken from an orbit park, and a release re-circularises at the planar
  offset or `MinOrbitRadius` 3.0 (`space/park.go:196-201`), all at or below 3.85. The clearance
  the service uses is `StarClearanceRadius(bt.StarSize())` (`fleet/service.go:718`) and the
  star feature's size is `StarSize(skeleton.StarClass)` (`generator.go:45`). Probe: rocky ring 1
  under F and under G, 0 arrival and 0 departure clearance refusals of 41,472 each; the ring-0
  control refused 5,448 arrivals and 4,944 departures.
- **No path mints a home or a station without selection.** `selectSpawnSite` has one caller
  (`corporations/service.go:560`), `EnsureStation` one production caller (`:388`); no test-env
  override or pin exists in `backend/corporations`.
- **The 16 live scenarios of *Home Site Selection* are carried byte-for-byte** (diffed); the
  delta adds one clause, one paragraph and 8 scenarios.
- **No shared requirement or file with `clear-burn-preview-on-commit`.** It touches
  `system-space-view` and `SpaceCommandPanel.tsx` / `SystemSpaceView.tsx` only.
- **Decision 4's pre-test agrees with the guard**, Decision 7 (minimum-arc unreachable on stop)
  and Decision 1's outcome table check out against the constants.
- **No retry is introduced**; `use-burn-preview.ts:61` is `retry: false` and
  `mutation-retry-policy` never resends a 4xx.

## BLOCKER 1 — no scenario and no task distinguishes "the station's derived parent" from "some skeleton body": criterion (d) can be wired to the wrong body, or the wrong seed, and every specified test passes

**Evidence.**
- Delta `specs/corporation-spawn/spec.md:29-30` states the rule over "the station's derived
  parent", and scenario `:226-233` opens "**GIVEN** a home system selected under criterion (d)".
- Every arrangement the change specifies is a single-body skeleton. `design.md:159`: "A
  single-body skeleton fixes the parent index at 0, so no seed search is needed." `design.md:84`:
  the fake line graph "is one rocky body at `Ring: 1`". `tasks.md:13` (1.9) keeps it that way.
- The fake graph's galaxy document carries no seed at all
  (`backend/corporations/siteselection_test.go:60-66`: `Id`, `OriginSystemId`, `Params` only),
  so `spawnWalk.seed` is 0 in every `backend/corporations` test.
- The parent index is `mix64(mix64(SystemSeed(galaxySeed, systemId))) % len(Bodies)`
  (`station_continuous.go:30,42`). With one body it is 0 for any seed and any id.
- Task 1.6 (`tasks.md:10`, `design.md:155-163`) never runs selection: it hand-builds a body table
  in package `system`. The scenario's GIVEN is not what the test arranges.

**Exploit.** An implementer can ship any of: the predicate evaluated on `skeleton.Bodies[0]`; on
the innermost or outermost body; with `galaxySeed` passed as 0, as a different field than
`meta.Seed`, or with a different id than the one `spliceStation` passes
(`system/service.go:206`). Tasks 1.1-1.6 all go green. In production the criterion then tests a
body the station does not orbit, a multi-body home whose real parent is at ring 0 still
qualifies, and the defect this change exists to remove survives at those homes. The only test
that touches real wiring is the repaired fuel e2e (task 4.1): 8 sampled spawns against a refusal
that fires on a few percent of phases. That is the sampled, cannot-observe-the-failure shape
`docs/handoffs/README.md` lessons one and two name.

**What a fix must achieve.** At least one scenario, with a task, whose arrangement has a
multi-body skeleton and a non-zero galaxy seed, in which the body the real derivation parents
the station to and at least one other body disagree on (d), in both directions (derived parent
fails while another body would pass: excluded; derived parent passes while another body would
fail: qualifies). The expected parent must come from `StationContinuousOrbit`'s own returned
`ParentId`, not from a second computation. And the "home selected under criterion (d)" scenario
must either be backed by a test that actually runs selection and then solves against that
home's real body table with its spliced station, or have its GIVEN reworded to what task 1.6
really arranges, with the wiring claim carried by the new scenario.

## BLOCKER 2 — the own-host scenario asserts an outcome the solver does not produce at most phases; it can only be made true by adding a target-identity refusal nobody ruled

**Evidence.**
- Delta `specs/fleet-movement/spec.md:46-50`: "**GIVEN** a fleet docked at a body **WHEN** an
  order, and a preview, naming that same body are submitted **THEN** each response is `409` with
  an `error` reason stating the curve is below the minimum length". Unconditional.
- `proposal.md:3`: "a burn toward the fleet's own host answers 500 too". Also unconditional.
- The live scenario it restates is conditional: "ordered to burn back to that same body,
  **yielding** a curve shorter than `space.MinArcLength`" (`openspec/specs/fleet-movement/spec.md:283-289`).
- The code already records that the condition is not reliable for a moving host:
  `backend/fleet/service.go:1051-1060`, "`space.SolveBurn` solves against a MOVING target — for
  an orbiting host, that candidate solve chases where the host will be at the CANDIDATE burn's
  own (new) arrival ... That is not the near-zero arc `space.ErrArcTooShort` exists to catch".
  `from` is frozen at the commit instant while the host keeps moving (`space/burn.go:461-467`).
- Probe (real `SolveBurn`, accel 8.0, departing tangent to the park's live velocity): a fleet
  in the insertion park of its own host, ordered to that host, got `ErrArcTooShort` in 6,144 of
  41,472 arrangements at a ring-1 home station (14.8%), 15,264 of 41,472 at a ring-8 station,
  8,640 of 41,472 docked at a ring-1 planet, 19,008 of 41,472 at a ring-10 planet. Every other
  arrangement **solved**, with curve lengths from 2.0 up to 62.6. No arrangement swept gave
  100%.

**Exploit.** Task 2.5's test, written from the scenario, is red against a correct
implementation for most injected instants. The cheapest way to make it green at every phase is
`if req.BodyId == f.AttachedTo { return ErrBurnArcTooShort }`. That is a new gameplay rule
(orders that commit today become refusals), it is exactly "Making Burn unavailable toward the
fleet's own host", which `proposal.md:29` lists as out of scope, and it puts a target-identity
comparison into a path whose live requirement forbids deciding by identity. The other way to
make it green is to pick the one instant where it happens to hold, which pins nothing.

**What a fix must achieve.** The scenario's trigger must be the solve outcome (a curve below
the minimum), not the dock relationship, with an arrangement that is stated and constructible
(a motionless host, or a named phase and injected world time at which the curve is short). The
proposal's Why and `defect-zero-length-burn-returns-500.md`'s closing note (task 5.2) must stop
saying own-host orders are refused as a rule: they are refused at some phases and accepted at
others, and the accepted ones commit a real burn. The spec must also not leave room for an
identity check: say so, or keep the point-target scenario (`:52-55`) as the only unconditional
one.

## MAJOR 1 — the copy requirement names "the stop-in-place command", the change repairs one of two stop surfaces, and the other shows the raw reason

**Evidence.**
- Delta `specs/docked-fleet-actions/spec.md:4`: "as mapped player-facing copy on the burn commit
  and on the stop-in-place command ... never the raw server reason."
- `tasks.md:36-37` (3.3, 3.4) and `proposal.md:16-17,38` cover `FleetActionsPanel` only.
- `frontend/components/galaxy/GalaxyView.tsx:321-326`: a second Stop command,
  `onError: (e) => toast.error(e.message || 'Stop failed')`.
- `frontend/lib/api-client.ts:82-83` sets `errorMessage = dataObj.error` when the body carries
  an `error` string.

**Exploit.** Today a refused stop is a bodyless 500, so that toast reads "API Error: 500 ...".
After this change the response carries `{"error": "fleet: burn destination is at or inside the
star-clearance radius"}`, and the galaxy roster's Stop toasts that string verbatim. The change
introduces a raw-reason leak on a surface it does not list, while every specified task passes.
Two readers of the requirement also disagree on whether that surface is covered.

**What a fix must achieve.** Either the requirement names the surfaces it binds and the galaxy
roster's Stop is brought under it (with a task, and `GalaxyView.tsx` in Impact; it is not a file
the active change touches), or the requirement is scoped explicitly to the fleet panel and the
galaxy-roster leak is filed by name as a residual. Silence is not an option, because this
change is what makes the leak visible.

## MAJOR 2 — the calibration scenario's threshold is "the floor the test records", and its THEN restates the rule

**Evidence.** Delta `specs/corporation-spawn/spec.md:193-203`: "every other combination
satisfies the criterion exactly when its bound is strictly greater than that star class's
clearance radius, as recorded in the calibration test's pass/fail table ... the test fails if
it shrinks below the floor the test records". `tasks.md:5` repeats "stays above the floor the
test records". `design.md:167`: "stays far above float rounding". No number anywhere. "the
outermost skeleton ring" (`:195-196`) is also unbounded.

**Exploit.** A floor of 0, or of 1e-300, satisfies the scenario; so does a pass/fail table
generated by calling the predicate. The first half of the THEN is the definition of (d), so it
proves nothing. The requirement delegates its content to an artefact that does not exist yet,
which two engineers will fill in differently.

**What a fix must achieve.** A stated floor with a unit and a reason (design.md is the right
home for the number, the scenario must reference a value that exists), a stated upper ring
bound, and a THEN that pins outcomes written by hand, at least the boundary rows of
`design.md:65-71` (which combinations pass and which fail), so the table is an independent
statement and not the predicate's own output.

## MAJOR 3 — "does not state or imply that the refusal is permanent" has no expressible test, and the three new copy lines are specified nowhere

**Evidence.** Delta `specs/docked-fleet-actions/spec.md:4` and scenario `:14-16`: "neither line
states or implies that the condition cannot change". `tasks.md:35` (3.2): "UX supplies the
wording, none reading as permanent". `design.md:136-143` pins the four server strings and says
only that the destination needle "reuses the existing destination copy", which is "That
destination is too close to the star to fly to." (`frontend/lib/rejection-copy.ts:72`). The UX
report's suggested origin line (`panel-ux.md:55`) was not carried into design.md.

**Exploit.** "Implies" is not decidable. Task 3.3 is told to cover "clearance line not
permanent" with a component test and has nothing to assert. The reused destination line is at
least arguably a statement of permanence (and for the star it is permanent), so the requirement
may already be violated by the copy the design keeps. Any wording ships.

**What a fix must achieve.** The player-facing lines pinned as literals in design.md (the active
change does this for its statement and asserts against "the design.md constant"), and the
scenario reduced to something a test can check: equality with those literals, or a stated list
of forbidden words. If the destination line is kept as is, the requirement must say why it does
not count as implying permanence, or exempt it.

## MAJOR 4 — two scenarios need one fleet to receive refusals that exclude each other, and the precedence between "absent body" and "origin inside" is in design.md only

**Evidence.**
- Delta `specs/fleet-movement/spec.md:70`: "a fleet F ... positioned so that its owner would be
  served each of the origin-inside, destination-inside, minimum-arc and absent-body refusals".
- `:99-100`: "**GIVEN** a fleet ... **WHEN** each of the origin-inside, destination-inside,
  too-short and absent-body refusals is served to it, one at a time".
- `:4`: "When the origin is at or inside the clearance the origin reason SHALL be served,
  whatever the destination."
- `:58`: an absent target body is a `404`. `design.md:117`: "Precedence is absent body, then
  origin, then destination, then minimum arc".

**Exploit.** A fleet inside the clearance is served the origin reason for every target, so it
can never be served destination-inside or minimum-arc; a fleet outside can never be served
origin-inside. Neither GIVEN can be constructed as written, so the SDET must silently rewrite
them. Separately, for a fleet inside the clearance naming an absent body, requirement text
`:4` says `409` origin and `:58` says `404`; only design.md breaks the tie, and an implementer
who puts the origin test first satisfies every scenario in the delta.

**What a fix must achieve.** The two GIVENs restated over separately arranged fleets (or an
explicit re-arrangement between requests), and the full precedence stated in requirement text
with one scenario for the absent-body-while-inside case.

## MINOR 1 — "key fragment" is used in a SHALL and never defined in the delta

`specs/fleet-movement/spec.md:76`: "Each reason SHALL carry a key fragment that no other reason
contains". Any set of pairwise distinct strings where none contains another satisfies this with
the whole string as the fragment, so the clause adds nothing beyond distinctness, and the
scenario at `:85-89` cannot be run without design.md's table. A fix must either name the four
fragments in the requirement (they are the client contract under RULING 7) or drop the clause
and keep the decidable parts (pairwise distinct, none contains `not found`).

## MINOR 2 — the log entry's system id cannot come from where design.md says it does

`design.md:130` and `tasks.md:29` (2.11) put the below-error entry in `respond`'s new arms,
"carrying the cause, the route, the fleet id and the system id". `respond` receives a nil fleet
on every error path (`handler.go:233,273,351,454-457`), and Decision 3's sentinels are matched
by pointer identity (`design.md:101`), so they cannot carry a per-request system id. The
requirement is fine and task 2.8 will catch an empty field; the design as written cannot be
followed. It needs one sentence saying where the entry is written or how the system id reaches
it.

## MINOR 3 — three live scenarios describe the same refusals in terms the new requirements contradict on a literal reading, and none is MODIFIED

- Live `fleet-movement/spec.md:283-289`: "rejected with `space.ErrArcTooShort`'s named reason".
  New `:76`: the reason "SHALL NOT contain ... the text of a wrapped internal error", and the
  served text is a different string.
- Live `:240-246` and `:937-942`: the star order "is rejected by `space.BuildCurve`'s
  endpoint-clearance guard". Live `:2416-2422`: "the solve is attempted". New `:32-35` serves the
  origin reason for a star order from a fleet inside the clearance, and under `design.md:110` the
  solve is not attempted and `BuildCurve` is not reached.

Both survive through `errors.Is` and only in a corner state, so nothing breaks. After archive
the capability says two things about one refusal. design.md should state that these live
scenarios stay true and in what sense, or the delta should MODIFY them.

## MINOR 4 — proposal prose and task wording that do not match the delta or the code

- `proposal.md:7`: "9 are added"; the delta adds 8 (already noted by the validator).
- `design.md:10`: "FULL-AUTO RULINGS 1-8"; the document relies on 9 and 11.
- `tasks.md:6` (1.2): "so changing any one moves the predicate". The inputs are package-level
  functions and constants; a test cannot change them, it can only recompute with the same
  calls, which mirrors the implementation. State what the test asserts.
- `tasks.md:34` (3.1) does not say that the existing cases built on
  `R.clearance = 'space: endpoint at or inside the star-clearance radius'`
  (`frontend/lib/rejection-copy.test.ts:49,99,105`) stop mapping once the legacy needles are
  replaced. That string was never served with a body; the cases must be re-pointed at the served
  literals, not left to fail.

## MINOR 5 — the stated residual omits one refusal that remains at newly selected, qualifying homes

`proposal.md:33` and `design.md:186` confine "a stop in place is refused" to existing homes that
fail (d). A fleet docked at a qualifying home has a live velocity above the speed floor at most
phases (`space/park.go:121-133`: host velocity plus the park's own), so Stop takes the burn
branch with a lead point 4.0 ahead (`fleet/service.go:1343-1346`), and that point is outside
the shell the criterion bounds. Probe, rocky ring 1 under F (margin 0.17): 0 refusals of 36,384
stop burns with a prograde system, 48 of 36,360 with the station retrograde, 312 of 36,360
(0.86%) with parent and station both retrograde. Each is a correct, typed destination refusal
under USER RULING 1 and no scenario in the delta is contradicted (the zero-refusal scenario
bounds arrivals and departures to a destination outside the clearance). The residual list and
task 5.3's filing should name it, so a future red in an arrangement that stops a docked fleet is
read in seconds.

VERDICT: FINDINGS (2B/4M/5m)

## Orchestrator rulings

Round 1 of 3. All eleven findings are CONFIRMED and routed to the writer; none disputed.

- **BLOCKER 1 — CONFIRMED.** The fix must add a selection-level scenario and task with a multi-body skeleton and a non-zero galaxy seed in which the derived station parent and another body disagree on (d), in both directions (parent fails / other passes → disqualified; parent passes / other fails → qualifies), run through the real selection walk, with the fake graph's galaxy document carrying the seed. The zero-refusal scenario's GIVEN must match what its test arranges.
- **BLOCKER 2 — CONFIRMED.** The own-host scenario is keyed on the solve outcome (a curve shorter than the minimum) with a stated, constructible arrangement; no `bodyId == attachedTo` refusal is introduced (out of scope stands); the proposal's Why is corrected to say an order to the fleet's own host is refused only when the solved curve is below the minimum.
- **MAJOR 1 — CONFIRMED.** Every surface that presents a stop refusal is covered, `frontend/components/galaxy/GalaxyView.tsx`'s stop toast included: the `docked-fleet-actions` requirement names stop surfaces without exception and a task repairs and tests that toast. No raw `fleet: …` text reaches a player.
- **MAJOR 2 — CONFIRMED; the floor is removed, not numbered.** No number has a recorded basis, and inventing one is a guess. The invariant is the strict inequality plus a pass/fail table WRITTEN OUT LITERALLY (parent type × ring × star class) in the scenario or design.md — hand-authored expected values, never produced by calling the predicate — so a retune that moves any cell fails the test. The "floor the test records" clause is deleted.
- **MAJOR 3 — CONFIRMED.** The untestable "does not state or imply permanence" clause is replaced by pinned literal copy lines (stated in the delta or design.md and asserted verbatim by test). The destination line keeps the existing copy (panel UX MINOR 1); the reliability note is satisfied by the pinned wording of the ORIGIN line only.
- **MAJOR 4 — CONFIRMED.** No scenario may require one fleet to receive two mutually exclusive refusals — rearrange with distinct fleets/arrangements. The precedence (absent body → origin inside → solve outcome classified) moves from design.md into requirement text, and the conflicting sentences at the cited lines are reconciled to it.
- **MINOR 1 — CONFIRMED.** Define the term in the delta or replace it with the literal fragments.
- **MINOR 2 — CONFIRMED.** design.md Decision 5 is revised so the log entry is written where fleet id and system id are in hand; the requirement's observable (one below-error entry with cause, route, fleet, system) is unchanged.
- **MINOR 3 — CONFIRMED.** Reword the new text so it does not contradict the three live scenarios on a literal reading; if a contradiction cannot be removed by wording, MODIFY the live requirement with every live scenario heading carried verbatim (reconcile must stay OK). `fleet-movement` is not touched by the other active change.
- **MINOR 4 — CONFIRMED.** Fix the count (8), the ruling range (1-11), make task 1.2 testable, and add the `R.clearance` re-pointing to task 3.1.
- **MINOR 5 — CONFIRMED.** The proposal's residual and design.md Risks state that a Stop from a fleet docked at a qualifying home can still be destination-refused (probe: 0.86% in a retrograde system), as a correct typed refusal under USER RULING 1.

Hard cap 40 tasks stands (35 before this round).

Verdict commit:
