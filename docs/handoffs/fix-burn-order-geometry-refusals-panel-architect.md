# Panel — architect — `fix-burn-order-geometry-refusals`

Date 2026-10-04. Spec phase. Method: source reading only; no suite run, nothing regenerated, no code, test, spec, proposal, delta or task edited. Authored: `openspec/changes/fix-burn-order-geometry-refusals/design.md`. `openspec validate --strict` passes before and after.

## Stop condition

**None found.** Nothing in the change alters `fixtures/space/cases.json`, `fixtures/system/cases.json`, `fixtures/space/turn-table.json` or any generated output, provided the two conditions in design.md hold: `backend/space` is not edited (Decision 3, 4), and the parent-index extraction in `StationContinuousOrbit` is a verbatim move whose `stationOrbit` / `stationOrbitSweep` families pass without re-recording (Decision 1). One adjacent item, MAJOR 1 below, touches a hand-maintained file under `fixtures/system/` that is not a recorded fixture; it needs an orchestrator call, not a stop.

## Confirmations requested by the launch

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Criterion (d) is computable in `corporations` from galaxy-tier data, no interior, no layering violation | **Confirmed** | `qualify` already holds each candidate's `galaxy.System` with skeleton (`backend/corporations/siteselection.go:195-201`); the galaxy seed is on the document `selectSpawnSite` already reads (`:67`, `backend/galaxy/model.go:136`); `corporations` already imports `system` and `space` (`spawn_position.go:4-5`); `StationContinuousOrbit` takes seed, system id and skeleton only (`backend/system/station_continuous.go:29`); the parent's radius is `ContinuousRadius` of the raw skeleton ring (`backend/system/generator.go:58`, `continuous.go:247-248`) |
| RULING 4's origin/destination distinction can be made in `backend/fleet` without editing `backend/space` | **Confirmed** | The guard is `from.Length() <= starClearance \|\| intercept.Length() <= starClearance` (`backend/space/burn.go:281`); `from` and `starClearance` are in hand at both call sites (`backend/fleet/service.go:678`, `:718`; `:1277`, `:1347`); `from` is constant across rounds (`burn.go:461-467`), so a pre-test with the identical expression equals the guard's origin half. RULING 4 does not collapse |
| Preview, commit and stop share one mapping | **Confirmed, with a condition** | All three reach `respond` (`backend/fleet/handler.go:233`, `:273`, `:351`); commit and preview share `solveOrder` (`service.go:785`, `:973`). Condition: MAJOR 2 |
| Existing `errors.Is` pins hold | **Confirmed** given wrapping sentinels (design.md Decision 3) | `star_destination_test.go:40`, `order_replace_and_retarget_test.go:199`, `service_test.go:224` |
| No pinned fixture or generated output changes | **Confirmed**, see above and MAJOR 1 | — |

## BLOCKER

None.

## MAJOR

### MAJOR 1 — "no edit under `fixtures/`" collides with the `system` coverage inventory

Evidence: `fixtures/system/mirror-map.json` `coverage` lists every rule-bearing function in `station_continuous.go` (`StationContinuousOrbit`, `inclinationForDominant`), and its `$comment` scopes the inventory to that file by name. Task 1.7 adds an exported rule-bearing predicate to that file. The proposal says "`fixtures/system/**` untouched" and task 6.2 requires an empty diff under `fixtures/`. The map is hand-maintained documentation, not recorded output, and no gate reads it for `system`: `harness/check-mirror-map.sh`'s `anti_mirror` returns at its directory-absent branch (`frontend/lib/system` does not exist). So following the convention breaks 6.2 as written, and honouring 6.2 leaves the inventory stale.

Recommendation: narrow the claim to the recorded files and add the entries. This is design.md Open Question 1; the orchestrator decides. Note the map's standing rule: an `inventory` entry obliges the next change that modifies `backend/system` to give the function a recorded family.

Paste-ready, proposal `What Changes` last bullet:

```
- No `space-kinematics` delta, no edit under `backend/space`, no fixture re-record (`fixtures/space/cases.json`, `fixtures/space/turn-table.json` and `fixtures/system/cases.json` untouched; `fixtures/system/mirror-map.json` gains coverage-inventory entries for the new predicate, which is hand-maintained documentation and not recorded output), no TypeScript mirror, no migration.
```

Paste-ready, tasks:

```
- [ ] 1.7 Dev: add one exported pure predicate in `backend/system` beside `StationContinuousOrbit`, over galaxy-tier data only; extract the station's parent index into one unexported helper both functions use (a verbatim move: the `stationOrbit` and `stationOrbitSweep` fixture families must pass without re-recording, and a failure there is a stop); add `inventory` coverage entries for the new functions to `fixtures/system/mirror-map.json`
- [ ] 6.2 Confirm `git diff` is empty for `backend/space`, for every `fixtures/**/cases.json` and for `fixtures/space/turn-table.json`
```

### MAJOR 2 — "the same reason on every route" fails if the new arms follow the existing `err.Error()` convention

Evidence: every reason-bearing arm in `respond` serves `err.Error()` (`backend/fleet/handler.go:471-593`). The solve errors arrive wrapped with route-specific prefixes: `fleet: solving burn: %w` (`backend/fleet/service.go:722`) and `fleet: solving stop burn: %w` (`:1350`). An arm written like its neighbours serves two different bodies for the same refusal on `orders` and `stop`, and leaks the `space:` text. Task 2.11 does not say which text is served. design.md Decisions 3, 5 and 6 fix it: the arm serves the fleet sentinel's own text.

Paste-ready, tasks:

```
- [ ] 2.10 Dev: in `backend/fleet`, add four sentinels that wrap the `space` ones (origin inside clearance, destination inside clearance, minimum arc, absent target body) and one solve helper that tests the target body's presence, then the origin against the clearance, then solves and classifies; `backend/space` is not edited and `space.ErrEndpointInsideClearance` is not split (design.md Decisions 3, 4)
- [ ] 2.11 Dev: add `respond` arms for the three `409` refusals and the `404` absent target body that serve the sentinel's own reason text, never the wrapped `err.Error()`, with no log line; add no arm for the raw `space` sentinels (design.md Decisions 5, 6)
```

### MAJOR 3 — "A Served Burn Solve Refusal Leaves No Trace" is false for a fleet with a due arrival or an elapsed hold

Evidence: `solveOrder` settles a due arrival (`backend/fleet/service.go:654`) and, on a commit, an elapsed station-keeping hold (`:668`) **before** the solve at `:720`. The first changes the stored park; the second debits fuel. Both are already-specified writes (live `fleet-movement` "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First"; `PreviewOrder`'s doc at `service.go:957-963`). The delta's "debit no fuel, and change no fleet attachment or park" and the scenario's "identical to before" are unsatisfiable in that state. Moving the checks earlier does not help: the destination and minimum-arc refusals need the settled state to solve from.

Paste-ready, replace the requirement body and its first scenario in `specs/fleet-movement/spec.md`:

```
### Requirement: A Served Burn Solve Refusal Leaves No Trace
IF a burn solve refusal named by this capability is served, THEN the system SHALL store no burn, create no action, claim no movement or sensor channel slot, debit no fuel for the refused order, and change no fleet attachment or park on account of it, and SHALL NOT write an error-level log entry for it. The settlement of an already-due arrival, and on a commit the settlement of an elapsed station-keeping hold, which precede every solve, are not effects of the refusal and are unchanged by this requirement.

#### Scenario: Every served refusal leaves state and fuel unchanged
- **GIVEN** a fleet with no due arrival and no elapsed station-keeping hold, a stored state, an empty action inbox and a known fuel level
- **WHEN** each of the origin-inside, destination-inside, too-short and absent-body refusals is served to it, one at a time, on a commit
- **THEN** after each, the fleet's stored state, its action list, its channel slots and its fuel are identical to before
```

(The second scenario, *A served refusal is not logged at error level*, is carried unchanged.)

### MAJOR 4 — the equality-boundary scenario cannot be arranged at site selection

Evidence: the bound takes a small discrete set of values, one per (parent ring, parent type), and the clearance one per star class (`backend/system/continuous.go:130-146`, `:155-172`; `params_continuous.go:32`, `:42`, `:60`, `:119`; `backend/space/params_const.go:34-35`, `:48`). No combination is equal: the closest is 0.08 (ice parent, ring 1, G star: 14.92 against 15.0). Scenario *A bound exactly equal to the clearance radius is excluded and one just above it qualifies* gives "two otherwise-qualifying candidates" to "home site selection", which no skeleton can produce. It is testable only at the comparison itself (design.md Decision 1, `shellClears`).

Paste-ready, replace the scenario in `specs/corporation-spawn/spec.md`:

```
#### Scenario: A bound exactly equal to the clearance radius is excluded and one just above it qualifies
- **WHEN** criterion (d) is evaluated for a lower bound on the station shell's distance from the star that equals the star-clearance radius exactly, and again for a bound that exceeds it
- **THEN** the first does not satisfy the criterion and the second does
```

Paste-ready, tasks (also corrects the enumeration, see MINOR 1):

```
- [ ] 1.1 SDET: `backend/system` calibration test for the pure predicate, enumerated over parent type by parent ring by star class: a ring-0 parent fails for every type and class; the comparison fails at a bound exactly equal to the clearance radius and passes above it; the smallest distance between any bound and any clearance is far above float rounding (scenarios: shell reaches clearance; equality boundary)
```

## MINOR

### MINOR 1 — the analysis's outcome table is the rocky row only

Evidence: analysis 12.2 ("ring 1 gives 15.67 and passes for M, K, G, F ... ring 2 and beyond ... passes for all"; "tightest passing margin is 0.17"). The station's local radius is a type-keyed ceiling (`backend/system/station_continuous.go:44-45`): rocky 10.00, ice 10.75, gas giant 14.50. A gas giant at ring 1 gives 11.17 (fails every class) and at ring 2 gives 17.96 (fails O); ice at ring 1 gives 14.92 (fails G, F, A, B, O). The predicate is unaffected; the test enumeration and any prose quoting the table are. Full table in design.md Decision 1. The spec scenario's ring-0 claim holds for every type (10.15, 9.40, 5.65 against a minimum clearance of 13.0). Fix is in the 1.1 text above; no delta change.

### MINOR 2 — task 1.9 describes a repair the fakes do not need

Evidence: the fake line graph's skeleton is already `{Type: BodyRocky, Ring: 1, Mineable: ...}` with an empty star class (`backend/corporations/siteselection_test.go:55-57`), which resolves to the default star size 6.0 (`backend/system/continuous.go:136-146`), clearance 15.0, against a bound of 15.67. Every existing fake candidate already satisfies (d).

Paste-ready:

```
- [ ] 1.9 Dev: make the fake line graph's star class explicit so its candidates satisfy (d) by statement rather than by the unknown-class default, without changing any test's intent; update the "three criteria" comments in `siteselection.go` and `params.go:9`; confirm the starting-fuel reachability sample still passes
```

(and drop "and update its 'all three criteria' comments" from 1.8, or leave it; either is fine.)

### MINOR 3 — which reason wins when both endpoints are inside is unspecified

Evidence: the requirement says the reason "SHALL state whether the fleet's own position (the origin) or the solved destination is the endpoint at or inside the clearance", and no scenario covers both. design.md Decision 4: the origin wins, because the origin is tested before the solve, and because no order from that position can succeed.

Paste-ready, append to the requirement body after "...or the lead point of a stop.":

```
When the origin is at or inside the clearance the origin reason SHALL be served, whatever the destination.
```

Paste-ready scenario:

```
#### Scenario: A fleet inside the clearance ordering a destination also inside it is refused with the origin reason
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order, and a preview, naming the star are submitted for that fleet
- **THEN** each response is `409` with the origin reason and not the destination reason
```

Task: extend 2.3 with "and a both-inside case serving the origin reason"; no new task.

### MINOR 4 — copy-line order: "before the generic line" is not enough for the origin reason

Evidence: `mappedCopy` is first-match on substring (`frontend/lib/rejection-copy.ts:56-62`); the legacy needles `star-clearance` / `star clearance` (`:72-73`) map to the destination copy, and both clearance reasons contain `star-clearance`. The origin needle must sit above those two lines, not merely above `not found` (`:76`). The existing test fixture also uses the raw `space:` text (`rejection-copy.test.ts:49`), which is never served after this change. Exact strings and fragments: design.md Decision 6. Consistent with the UX report's MAJOR 3.

Paste-ready:

```
- [ ] 3.1 SDET: `frontend/lib/rejection-copy.test.ts` cases using the four served reason strings recorded in design.md Decision 6 verbatim: the origin-clearance, minimum-arc and absent-body reasons map to three distinct lines, the destination reason maps to the existing destination line, the origin reason does not map to the destination line, and the absent-body reason is not caught by the generic `not found` line
- [ ] 3.2 Dev: add the three `BURN_COPY` lines (UX supplies the wording) and a `destination is at or inside` needle for the existing destination copy; the origin and destination needles sit above the legacy `star-clearance` lines, and the minimum-arc and absent-body needles above `not found`
```

Also extend 2.7 with "and each equals the literal string recorded in design.md Decision 6", so a text change fails on the Go side too.

### MINOR 5 — the zero-refusal scenario does not bound the other endpoint

Evidence: scenario *A home selected after this criterion yields no clearance refusal at its station* runs a solve "from the station" to an unstated destination; a departure toward the star is refused by the destination, correctly. "burning to insert around the station" in the shell definition can also be read as the whole burn path, which the bound does not cover (the avoidance keeps the path outside, separately).

Paste-ready, replace the scenario:

```
#### Scenario: A home selected after this criterion yields no clearance refusal at its station
- **GIVEN** a home system selected under criterion (d)
- **WHEN** a burn solve is run toward the station from an origin outside the clearance, and from a fleet parked at the station toward a destination outside the clearance, at every phase of a sweep across the station's orbit and a fleet's park around it
- **THEN** no solve is refused for an endpoint at or inside the star-clearance radius, on either the arrival or the departure side
```

and in the requirement body replace "or burning to insert around the station" with "or arriving at the end of a burn that inserts around the station".

Paste-ready task (location per design.md Decision 9):

```
- [ ] 1.6 SDET: a `backend/system` test (not `backend/space`, no fixture read or written) that, for the tightest qualifying parent type, ring and star class combinations, sweeps station phase and park phase in fixed steps and finds zero arrival and zero departure clearance refusals, with a ring-0 system as a control that does refuse (scenario: no clearance refusal at its station)
```

### MINOR 6 — minimum-arc on `stop`

Confirmed unreachable: lead point is `2 * MinArcLength` ahead (`backend/fleet/service.go:1343-1346`), the branch runs only above `StopInPlaceSpeedFloor` 4.0 (`:1299`) so `Normalize` succeeds (`backend/space/vec.go:95-99`), and a curve is never shorter than its 4.0 chord against a 2.0 minimum. The delta is right to name only `orders` and `orders/preview`. No change; task 2.13 stands and maps it anyway (design.md Decision 7).

### MINOR 7 — requirement vs design hygiene

Nothing to move. Criterion (d)'s bound is stated in domain terms with no Go identifier and belongs in the requirement (design.md Decision 8). The `fleet-movement` delta names no package. "no comparison of the target's identity with the star's is made" is not observable from outside, but it restates live wording (`openspec/specs/fleet-movement/spec.md:2416-2422`) and is acceptable.

## Task cap

33 tasks now. Every change above rewrites an existing task or extends one (1.1, 1.6, 1.7, 1.9, 2.3, 2.7, 2.10, 2.11, 3.1, 3.2, 6.2). **Total stays 33.** If other panel findings push past 40, the seam is the one the analysis names: link 1 is section 1 (placement, `corporation-spawn` only, no fleet code), link 2 is sections 2 to 5 (refusal shape). They share no code and either can archive first.

## Open questions carried in design.md

1. `fixtures/system/mirror-map.json` inventory entries (MAJOR 1) — orchestrator.
2. Whether the origin refusal logs at warn level — reliability.
3. Whether the legacy `star-clearance` needles are removed — UX and writer.
