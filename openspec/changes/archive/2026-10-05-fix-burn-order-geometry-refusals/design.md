# Design — `fix-burn-order-geometry-refusals`

## Context

Two defects reach the same default arm of the fleet handler (`backend/fleet/handler.go:594-596`: error log, bodyless 500):

- `docs/handoffs/defect-station-order-500.md` — a burn to a home station is refused by the solver's endpoint-clearance guard (`backend/space/burn.go:280-283`) in systems where the station's shell reaches the star clearance.
- `docs/handoffs/defect-zero-length-burn-returns-500.md` — a burn whose solved curve is below the minimum arc length (for the fleet's own host, at some phases only) yields `space.ErrArcTooShort` (`backend/space/burn.go:470-472`), which no arm maps.

Binding rulings (`docs/handoffs/fix-burn-order-geometry-refusals-rulings.md`): USER RULING 1 (a fleet may never be inside the star clearance, so the guard stands on both endpoints) and FULL-AUTO RULINGS 1-11 (9: mirror-map inventory entry; 10: refused-preview display is a follow-up; 11: one below-error log entry per served refusal, legacy copy needles replaced). The change therefore has two halves that share no code:

1. **Placement** (`corporation-spawn`): a system whose station shell reaches the clearance never qualifies as a home.
2. **Refusal shape** (`fleet-movement`): the three player-causable solve refusals are typed and served on `orders`, `orders/preview` and `stop`.

Constraints that shaped every decision below: no edit under `backend/space`; no recorded fixture changes (`fixtures/space/cases.json`, `fixtures/system/cases.json`); `backend/space` and `backend/system` stay Go-sole-authority with no TypeScript mirror; no `time.Now()` in domain code; no migration.

All code facts cited here were read, not run. No test suite was executed and nothing was regenerated.

## Goals / Non-Goals

**Goals**

- A newly selected home never has a station whose shell reaches the star clearance, decided from galaxy-tier data only.
- Origin-inside-clearance, destination-inside-clearance, minimum-arc and absent-target-body are served with stable, pairwise distinct reason text and the ruled statuses, identically on every route that can raise them.
- The existing `errors.Is` pins on the `space` sentinels keep holding.
- Faults that are not player-causable keep reaching the 500 arm and its error log.

**Non-Goals**

- Any solver or generator change; any `space-kinematics` or `trading-station` delta.
- Repairing or re-homing a corporation already in a failing home (RULING 2).
- Dipping non-station bodies, drift or free stop inside the clearance, and the stranded false alarm in `reachableAtFloor` (RULING 8). `backend/fleet/fuel.go:151-168` keeps calling `space.SolveBurn` directly and is not touched.
- A machine-readable reason code or any new wire field (RULING 7).

## Decisions

### Decision 1 — The predicate lives in `backend/system`, beside the derivation it bounds

One exported pure function in `backend/system/station_continuous.go`:

```go
func StationShellClearsStar(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) bool
```

Same inputs as `StationContinuousOrbit` (`station_continuous.go:29`), no store read, no clock. It computes

```
bound     = ContinuousRadius(parent.Ring) - orbit.Radius - space.InsertionStandoff(space.Body{Size: StationSize})
clearance = space.StarClearanceRadius(StarSize(skeleton.StarClass))
return bound > clearance          // strict: the guard refuses at <=
```

where `orbit` is `StationContinuousOrbit`'s own return value, so the station's radius law has exactly one owner (task 1.2 checks the bound against positions computed from that orbit). When the derivation returns its star-parented fallback (empty skeleton), the parent term is zero and `bound = orbit.Radius - standoff`; this branch is unreachable under criterion (a) but must not panic.

Supporting shape:

- The parent index `k` is currently an inline expression using the unexported `mix64` (`station_continuous.go:42`). Extract it into one unexported helper used by both `StationContinuousOrbit` and the predicate. This is a verbatim move: the `stationOrbit` and `stationOrbitSweep` families in `fixtures/system/cases.json` must pass **without re-recording**. If either fails, stop; do not regenerate.
- The comparison is its own unexported function, `shellClears(bound, clearance float64) bool`. The equality boundary is not reachable from real galaxy-tier values (see the table below), so this is the only place it can be tested.
- Every arithmetic step is a subtraction or a comparison over values already produced behind explicit `float64(...)` guards (`ContinuousRadius`, `InsertionStandoff`, `StarClearanceRadius`). No square root, no trigonometry, no fusable multiply-add in the predicate itself.

Why the bound is sound: the parent is star-parented at `ContinuousRadius(Ring)` with the raw skeleton ordinal (`generator.go:58`, `continuous.go:247-248`); the station sits at `orbit.Radius` from the parent; a docked park, a station-keeping hold and a burn intercept all sit at `InsertionStandoff(station) = 3.85` from the station (`space/burn.go:262`, `system/service.go:208`), and a released hold re-circularises at no more than the held offset (`MinOrbitRadius` 3.0 is below 3.85). The triangle inequality bounds all of them at every phase and inclination.

The outcome table depends on the parent's **type** as well as its ring, because the station's local radius is a type-keyed ceiling. Derived from the constants (`BaseOrbitRadius` 24.0, `RadiusGrowth` 1.23, `featureSizeBands`, `starClearanceFactor` 2.5):

| Parent | ring 0 | ring 1 | ring 2 | ring 3 |
| --- | --- | --- | --- | --- |
| rocky (local 10.00) | 10.15 | 15.67 | 22.46 | 30.81 |
| ice (local 10.75) | 9.40 | 14.92 | 21.71 | 30.06 |
| gas giant (local 14.50) | 5.65 | 11.17 | 17.96 | 26.31 |

Clearances: M 13.0, K 14.0, G 15.0 (and the unknown-class default), F 15.5, A 16.5, B 17.5, O 19.0. Ring 0 fails for every type and class. The analysis's "ring 1 passes M to F, ring 2 passes all" (section 12.2) is the rocky row only: a gas giant at ring 1 fails every class and at ring 2 fails O; ice at ring 1 fails G and F. The smallest distance from the boundary anywhere in the table is 0.08 (ice, ring 1, G), which the hand-written table in the delta pins cell by cell.

*Alternatives considered.* (a) The predicate in `backend/corporations`: rejected, it would need the parent index, which means either exporting `mix64`-derived internals or parsing `feat-body-%d` out of `ParentId`, and it puts a second owner on the station radius law. (b) A method on a materialised interior: rejected, the criterion must not materialise an interior during the walk.

### Decision 2 — Criterion (d) is applied in `qualify`, in memory, with no new storage call and no knob

`backend/corporations` already imports `system` and `space` (`spawn_position.go:4-5`), and `system` imports only `galaxy`, `space`, `common`, `action`, `disclosure`, so there is no cycle and no layering violation: the predicate is a pure package function, not another domain's DAO.

- `selectSpawnSite` already holds the galaxy document (`siteselection.go:67`); `spawnWalk` gains a `seed int64` field set from `meta.Seed` (`galaxy/model.go:136`).
- `qualify` (`siteselection.go:185-207`) already holds each candidate's `galaxy.System` with its skeleton from `GetLiveSystems` (`:195`). Criterion (d) is one more `continue` after the mineable test (`:201`). No interior is read, no extra fan-out, so the walk's storage cost per ring is unchanged.
- No `SpawnParams` field. RULING 1 says such a system never qualifies; a switch would be an untested second mode.
- The walk needs no change: `run` already advances past a ring with no qualifier (`:149-157`), and `pickUniform` already sorts by id and seeds from the account (`:279-283`), so determinism holds over the smaller set.

The existing fake line graph already satisfies (d): its skeleton is one rocky body at `Ring: 1` with an empty star class (`siteselection_test.go:55-57`), which resolves to the default star size 6.0, clearance 15.0, against a bound of 15.67. The repair in task 1.10 is therefore making the star class explicit, not adding rings. Task 1.4's selection-level test additionally gives the fake graph's galaxy document a non-zero seed (it carries none today, so the walk's seed is 0) and a multi-body skeleton.

### Decision 3 — Four fleet-level sentinels that wrap the `space` ones; `space` is not edited

In `backend/fleet`, one small unexported error type and four exported sentinels:

```go
type solveRefusal struct { reason string; cause error }
func (r *solveRefusal) Error() string { return r.reason }
func (r *solveRefusal) Unwrap() error { return r.cause }

ErrOriginInsideClearance      -> unwraps to space.ErrEndpointInsideClearance
ErrDestinationInsideClearance -> unwraps to space.ErrEndpointInsideClearance
ErrBurnArcTooShort            -> unwraps to space.ErrArcTooShort
ErrTargetBodyAbsent           -> unwraps to space.ErrUnknownBody
```

`errors.Is(err, ErrOriginInsideClearance)` matches by pointer identity and does not match `ErrDestinationInsideClearance`, while `errors.Is(err, space.ErrEndpointInsideClearance)` matches both through `Unwrap`. The three pins keep holding unchanged: `star_destination_test.go:40`, `order_replace_and_retarget_test.go:199`, `service_test.go:224`.

*Alternatives considered.* Splitting `space.ErrEndpointInsideClearance`: excluded by RULING 4 (the `buildCurve` hand case records the error by name). `fmt.Errorf("...: %w", space.Err...)` as the sentinel: works for identity but puts the `space:` text into the served reason. Mapping the raw `space` sentinels in `respond`: cannot tell origin from destination, and cannot tell an absent target from the fleet's own stored host failing to resolve.

### Decision 4 — One classifying solve helper, called by `solveOrder` and `Stop`

One unexported function in `backend/fleet` replaces the two direct calls at `service.go:720` and `:1348`. In order:

1. **Absent target body.** If the target names a body and `bt.Body(id)` reports it absent, return `ErrTargetBodyAbsent`. This is the same lookup `space.BuildCurve` makes (`burn.go:247-249`).
2. **Origin.** If `starClearance > 0 && from.Length() <= starClearance`, return `ErrOriginInsideClearance`. This is the origin half of the guard's own expression (`burn.go:281`), evaluated on the same `from` with the same `Vec3.Length`. `from` is constant across solve rounds (`burn.go:461-467`), so the pre-test agrees with the guard exactly.
3. **Solve.** Call `space.SolveBurn`. Classify `space.ErrEndpointInsideClearance` as `ErrDestinationInsideClearance` (the origin is already known to be outside) and `space.ErrArcTooShort` as `ErrBurnArcTooShort`. Any other error is wrapped with `%w` and returned unclassified.

Consequences:

- **RULING 4 is feasible in `backend/fleet` alone.** `from` and `starClearance` are both in hand at each call site (`service.go:678`, `:718`; `:1277`, `:1347`).
- **Both endpoints inside: the origin reason wins**, because step 2 runs before the solve. That is also the true statement for the player: no order from that position can succeed, whatever the target.
- **Precedence** is absent body, then origin, then destination, then minimum arc, which preserves `space`'s own order (`TargetPosition`, then the guard, then the length check).
- **Absent target vs stored host.** Only step 1 produces `ErrTargetBodyAbsent`. A fleet whose own host is missing fails earlier at `s.Position` (`service.go:678`, `:1277`) or `currentVelocity` (`:709`, `:1281`) with a raw `space.ErrUnknownBody`; a target whose parent chain is broken fails inside the solve with the same raw sentinel. `respond` gets no arm for raw `space.ErrUnknownBody`, so both stay 500 with an error log.
- **Fail loud.** `respond` gets no arm for raw `space.ErrEndpointInsideClearance` or `space.ErrArcTooShort` either. A future call site that bypasses the helper surfaces as a 500, not as a mis-labelled refusal.
- The checks sit immediately before the solve, after acceleration validation, so today's precedence among existing rejections (transit, 400s for acceleration) is unchanged.
- `reachableAtFloor` (`fuel.go:153`) is not routed through the helper (RULING 8).
- **Live scenarios that name the guard.** `fleet-movement` scenarios that say a star order is "rejected by `space.BuildCurve`'s endpoint-clearance guard" and a short curve is "rejected with `space.ErrArcTooShort`'s named reason" stay true for a fleet outside the clearance and for the same conditions: the served sentinels unwrap to those `space` errors and name the same condition. They are not modified; in the corner state of a fleet already inside the clearance the origin reason is served before the solve and `BuildCurve` is not reached, which the new requirements state explicitly.
- **Own host is not a rule.** An order whose target is the fleet's own host is refused only when the solved curve is below the minimum, which for an orbiting host depends on phase and injected world time (a moving target); the helper makes no identity comparison.

### Decision 5 — `respond` serves the sentinel's own text, never `err.Error()`

Existing arms serve `err.Error()` because their sentinels arrive unwrapped. The solve errors arrive wrapped with route-specific prefixes (`fleet: solving burn: ...` at `service.go:722`, `fleet: solving stop burn: ...` at `:1350`), so `err.Error()` would give `stop` a different body from `orders` and break "the same reason on every route". The new arms extract the `*solveRefusal` with `errors.As` and serve its `reason`:

- `ErrOriginInsideClearance`, `ErrDestinationInsideClearance`, `ErrBurnArcTooShort`: `409`, `{"error": reason}`.
- `ErrTargetBodyAbsent`: `404`, `{"error": reason}`, distinct from `ErrNotFound`'s bodyless 404 (`handler.go:469-470`).

Each served refusal writes exactly one entry below error level (info) carrying the cause, the route, the fleet id and the system id, and never an error-level entry (RULINGS 5 and 11); there is no separate warn level for the origin refusal. The entry is written by the Decision 4 solve helper, not by `respond`: `respond` receives a nil fleet on its error paths and the sentinels are matched by identity, so neither carries a per-request system id, whereas the helper has the fleet, the system and, as a parameter from `solveOrder` and `Stop`, the route. `respond` only maps the sentinel to its status and reason. Commit, preview and stop already converge on `respond` (`handler.go:233`, `:273`, `:351` via `respondWithStrandingWarning`), so one mapping serves all three with no per-route code.

### Decision 6 — Exact reason strings and their key fragments

The Go sentinel text is the single source of truth. `frontend/lib/rejection-copy.ts` matches by lower-cased substring, first match wins (`:56-62`), so each reason carries one key fragment that no other reason contains, and none contains `not found`. No reason embeds a body id.

| Sentinel | Served `error` text | Key fragment |
| --- | --- | --- |
| `ErrOriginInsideClearance` | `fleet: burn origin is at or inside the star-clearance radius` | `origin is at or inside` |
| `ErrDestinationInsideClearance` | `fleet: burn destination is at or inside the star-clearance radius` | `destination is at or inside` |
| `ErrBurnArcTooShort` | `fleet: burn curve is below the minimum arc length` | `minimum arc length` |
| `ErrTargetBodyAbsent` | `fleet: target body is not present in this system` | `target body is not present` |

`BURN_COPY` line order (`rejection-copy.ts:66-77`): the `origin is at or inside` and `destination is at or inside` needles go **in place of** the two legacy `star-clearance` / `star clearance` lines; both clearance reasons contain `star-clearance`, so a surviving legacy needle would map the origin reason to the destination copy. The destination needle reuses the existing destination copy. The legacy lines are replaced by the two new needles (Decision 12). `minimum arc length` and `target body is not present` go above `not found`.

Drift guard: a Go test pins the four literal strings, and `rejection-copy.test.ts` uses the same four literals as its inputs. Changing a string on one side fails a test on that side; the pair is small enough that a shared fixture file is not worth an edit under `fixtures/`.

### Decision 7 — Minimum-arc is unreachable on `stop`, and is mapped there anyway

The stop burn's lead point is `pos + unit * 2 * MinArcLength` (`service.go:1343-1346`). The branch runs only when speed exceeds `StopInPlaceSpeedFloor` (4.0, `:1299`), so `Normalize` succeeds (`space/vec.go:95-99`), the chord is 4.0, the target is a static point, and a curve is never shorter than its chord, against a minimum of 2.0. The requirement is right to name only `orders` and `orders/preview` for this reason. Because `Stop` uses the same helper, the refusal would still be a typed 409 if a future change to the lead distance made it reachable. No stop scenario is specified for it, since none can be arranged.

### Decision 8 — The bound stays in the requirement; identifiers and numbers stay here

Criterion (d)'s bound, stated in domain terms (parent orbital radius, less the station's orbit radius around it, less the station's insertion standoff, strictly greater than the clearance radius), is the rule itself: a different bound is a different placement rule, and the strictness is observable. It belongs in the requirement, as drafted. Function names, the Go expression and the constants belong here and are not to be copied into the delta; the pass/fail table is the exception: it is written out by hand in the delta's calibration scenario (Decision 10).

### Decision 9 — The zero-refusal sweep is a `backend/system` test

Task 1.7 lives in package `system` (for example `backend/system/station_shell_sweep_test.go`). `system` already imports `space`, owns the predicate and the derivation, and cannot import `fleet` or `corporations`, which keeps the test about geometry.

- Bodies: a map-backed fake implementing `space.Bodies` holding the star, one parent with `Orbit{ParentId: "feat-star", Radius: ContinuousRadius(ring)}`, and the station with `StationContinuousOrbit`'s orbit and `StationSize`. A single-body skeleton fixes the parent index at 0, so no seed search is needed.
- Sweep: fixed integer `SubTurns` steps for the station's phase and the fleet's park phase, at a fixed set of world times. No random source, no clock.
- Arrival: `space.SolveBurn` from a fixed origin outside the clearance to the station. Departure: from the fleet's orbit park around the station (`space.Park.Position`) to a fixed point outside the clearance.
- Subjects: the tightest qualifying rows of the Decision 1 table (rocky ring 1 under F; gas giant ring 2 under B; ice ring 1 under K) must show zero clearance refusals; a ring-0 system is the control and must show at least one.
- It records nothing: assertions are counts, no file under `fixtures/` is read or written.

### Decision 10 — The calibration test pins a hand-written table, not a floor

Task 1.1 enumerates parent type by ring by star class and asserts the pass/fail table written out literally in the `corporation-spawn` scenario, with expected values authored by hand and never produced by calling the predicate. No numeric margin floor is specified (no number has a recorded basis). The smallest distance from a boundary is 0.08 (ice, ring 1, G star); a retune that moves any cell, or flips a cell near that margin, fails the table.

### Decision 11 — The mirror map's inventory gains entries for the predicate (FULL-AUTO RULING 9)

`fixtures/system/mirror-map.json`'s `coverage` inventory names every rule-bearing function in `station_continuous.go`. The new predicate and its helpers get `inventory` entries by hand. The map is hand-maintained documentation, not recorded output, and no gate reads it for `system`. The empty-diff check (task 6.2) is therefore narrowed to recorded fixture files (`fixtures/**/cases.json`, `fixtures/space/turn-table.json`). Alternative rejected: leaving the inventory stale.

### Decision 12 — Served refusals log once below error; the legacy copy needles are replaced (FULL-AUTO RULING 11)

Every served refusal writes one below-error entry (Decision 5). The legacy `star-clearance` and `star clearance` needles are replaced by the `origin is at or inside` and `destination is at or inside` needles, the destination needle keeping the existing destination copy, because after this change no served reason reaches the legacy needles without first matching a new one. Alternatives rejected: no log at all (a criterion regression would be silent); a separate warn level for origin; keeping a needle no served string matches.

### Decision 13 — The four player-facing lines are pinned

The `docked-fleet-actions` requirement pins the four lines verbatim: origin "This fleet is too close to the star to take a course from here right now."; destination "That destination is too close to the star to fly to." (the existing line); minimum arc "That burn is too short to fly. Choose a target farther away."; absent body "That body is not in this system. Pick another target." The origin line carries "right now" because the refusal depends on the fleet's position and the instant. The destination line is kept as is: it is about the chosen target, which the player can change, and is exempt from any permanence reading. Frontend tests assert the lines verbatim.

## Risks / Trade-offs

- **The rule lives one step from its cause.** Stations are kept clear of the star by spawn selection, not by the derivation. A future second path that mints a station (`stations.EnsureStation` has one production caller today) would bypass it. Accepted under RULING 1; mechanism (a) is the long-term shape when the system fixture family can be re-recorded.
- **Retuning silently changes who qualifies.** Moving `BaseOrbitRadius`, `RadiusGrowth`, a size band, `StationStandoff` or a star size shifts the table. The hand-written table (Decision 10) fails when any cell moves; it does not pin which systems qualify.
- **Fewer home candidates.** About 9.7% of mineable systems stop qualifying (analyst's measurement). The walk continues outward and `MaxSpawnWalkBlocks` is unchanged. A test that pins a specific home for a specific account can change; the live origin system passes per the analysis.
- **Existing homes still refuse.** A corporation in a failing home gets the typed 409 (often the origin reason, while its park sweeps inside). Arrangements that dock then order in such homes keep failing, readably.
- **Text is the contract.** Reasons are matched by substring on the client (RULING 7). Decision 6's two-sided literal pin is the mitigation.
- **A refused commit can still have written.** `solveOrder` settles a due arrival (`service.go:654`) and, on a commit, an elapsed station-keeping hold (`:668`) before it solves. Those are separate, already-specified writes; the refusal itself writes nothing. The requirement ("Changes Nothing And Is Not An Error") states that these settlements precede the solve and are not effects of the refusal.
- **Origin refusals are not silent.** Every served refusal, origin included, writes one below-error entry with cause, route, fleet and system (RULING 11), so a regression of criterion (d) is countable.
- **The residual is intermittent, not standing.** Existing homes failing (d) (about 8.9% of systems) refuse a docked fleet's departure for a fraction of park phases (8.2% of departure solves measured); a re-issue may succeed. During those seconds the fleet reads as stranded with a full tank (`fuel.go:151-168`, untouched, RULING 8), and stop-in-place is refused for a fleet already inside. Separately, at a newly selected qualifying home a Stop from a docked fleet takes the burn branch at most phases with a lead point 4.0 ahead (`fleet/service.go:1343-1346`); that point lies outside the shell the criterion bounds, and the probe measured 0 of 36,384 refusals prograde and 312 of 36,360 (0.86%) with parent and station both retrograde. Each is a correct typed destination refusal under USER RULING 1. Arrangements that dock then order in such homes can fail intermittently, now with a reason.
- **Home distribution narrows.** 203 of 2,102 mineable systems (9.7%) stop qualifying; spawn still always succeeds.
- **The claude-agent's handling of the new 4xx bodies is unverified** and not changed here.
- **Mirror-map inventory obligation.** The hand-written entry for the predicate obliges the next change that modifies `backend/system` to give it a recorded family, to be recorded off this machine.
- **Refactor of a fixture-pinned function.** Extracting the parent index touches `StationContinuousOrbit`. It is a verbatim move guarded by two recorded families; a failure there is a stop, not a re-record.

## Migration Plan

None. No stored shape changes, no backfill, no compatibility path (RULING 2). Reversal is deleting one criterion and collapsing or removing four sentinels and two `respond` arms.

## Open Questions

None. Open questions 1-3 of the first draft are answered by FULL-AUTO RULINGS 9 and 11 (Decisions 11 and 12).
