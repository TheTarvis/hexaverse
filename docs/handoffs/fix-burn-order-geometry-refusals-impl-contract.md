# `fix-burn-order-geometry-refusals` — implementation contract

**Authoritative over any in-file assumption made by the SDET or a developer.** The deltas pin behaviour; this file settles what they leave open (Go identifiers, signatures, log fields, file placement, test arrangements, ownership, order of work) so the SDET writes Go and TypeScript tests against one shape before either developer starts.

Items marked **pinned** are asserted by the red suite and may not be renamed. Items marked *renameable* are suggestions.

Written 2026-10-04 after re-reading `openspec/changes/fix-burn-order-geometry-refusals/` in full (proposal, design.md, tasks.md with 36 tasks, three deltas) at verdict commit `fde977d`, the rulings (USER RULING 1, FULL-AUTO RULINGS 1-11) and the orchestrator-rulings sections of adversary rounds 1 to 3. Code facts were read, not run. Nothing was regenerated.

---

## 0. Spec conflict check

**No spec conflict: the change can be built as written.** One arrangement constraint is settled here and should be known to the orchestrator before the red handoff.

**A cyclic or parent-missing body cannot exist in a real body table.** `system.Service.BodyTable` builds its table from `GetOrCreateInterior`, whose cascade drops, to a fixpoint, every feature whose parent chain fails `space.Position` (`backend/system/service.go:286-349`): a missing parent and a cycle alike. `fleet.BodySource` returns the concrete `*system.BodyTable` (`backend/fleet/service.go:170-172`), whose fields are unexported, so a `backend/fleet` test cannot hand the service a table holding such a body. Three scenario clauses depend on one:

- *A body-table cycle is still a 5xx with an error log*
- *A present target whose parent is missing is a 5xx, not the absent-body 404*
- the last AND of *A served refusal is recorded once by cause below error level* (a cycle writes an error-level entry naming no refusal cause)

Settlement (section 7.4): the solve helper takes the `space.Bodies` interface, not `*system.BodyTable`, so a test can call it with a map-backed fake holding the cycle or the missing parent, then feed the error it returns through the real `respond` via the handler test's fake service. The two halves are chained in one test, so the scenario's WHEN and THEN are both exercised; what is not exercised is the real table carrying the fault, which production cannot produce. The SDET records these three as covered at "helper + handler, composed" in the coverage table. If the orchestrator judges that insufficient, it is a ruling to make, not something a developer may solve by adding an exported table constructor (no task covers one).

*A fleet whose stored host no longer resolves* is arrangeable with a real table (a park naming an id the table lacks) and needs no composition.

---

## 1. What must not change

| Boundary | Rule |
| --- | --- |
| `backend/space/**` | No edit of any kind, tests included |
| `fixtures/**/cases.json`, `fixtures/space/turn-table.json` | No change. Nothing is re-recorded on this machine |
| `backend/system/station_continuous.go` `StationContinuousOrbit` | Output byte-identical. The `stationOrbit` and `stationOrbitSweep` families must pass unre-recorded. **A failure there is a stop: report it, regenerate nothing** |
| TypeScript mirror | None is added. No file under `frontend/lib/space`, `frontend/lib/system`, `frontend/lib/fleet` gains a rule |
| `time.Now()` | Not called in domain code or in any new test. World time comes from the injected clock (`fakeClock` in `backend/fleet/service_test.go:18`) |
| `backend/fleet/fuel.go` `reachableAtFloor` | Not touched; it keeps calling `space.SolveBurn` directly (RULING 8) |
| `openspec/specs/**`, `openspec/changes/clear-burn-preview-on-commit/**` | Not touched |
| Wire shape | No new field. The refusal body is exactly `{"error": "<reason>"}` |

---

## 2. Placement — `backend/system` and `backend/corporations`

### 2.1 Identifiers in `backend/system/station_continuous.go`

```go
// pinned
func StationShellClearsStar(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) bool

// pinned (unexported; tests live in package system)
func stationShellBound(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) (bound, clearance float64)
func shellClears(bound, clearance float64) bool   // return bound > clearance

// renameable
func stationParentIndex(systemSeed int64, bodyCount int) int
```

- `stationParentIndex` is the existing expression at `station_continuous.go:42` moved verbatim: `int(mix64(mix64(uint64(systemSeed))) % uint64(bodyCount))`. `StationContinuousOrbit` calls it in place of the inline expression and changes in no other way. The caller keeps the empty-skeleton guard; the helper is never called with `bodyCount == 0`.
- `stationShellBound`:
  - `orbit := StationContinuousOrbit(galaxySeed, systemId, skeleton)`
  - `standoff := space.InsertionStandoff(space.Body{Size: StationSize})`
  - body-parented: `k := stationParentIndex(galaxy.SystemSeed(galaxySeed, systemId), len(skeleton.Bodies))`, then `bound = float64(float64(ContinuousRadius(skeleton.Bodies[k].Ring) - orbit.Radius) - standoff)`
  - empty skeleton (the derivation's star-parented fallback): `bound = float64(orbit.Radius - standoff)`. It must not panic.
  - `clearance = space.StarClearanceRadius(StarSize(skeleton.StarClass))`
- `StationShellClearsStar` is `shellClears(stationShellBound(...))`. No store read, no clock, no square root, no trigonometry.

### 2.2 `fixtures/system/mirror-map.json` (RULING 9) — hand edit, golang-dev, task 1.8

Append to `coverage`:

```json
{ "go": "stationParentIndex", "coverage": "family:stationOrbit", "note": "indirect: StationContinuousOrbit's parent-index expression, extracted verbatim by fix-burn-order-geometry-refusals; its other caller is stationShellBound" },
{ "go": "stationShellBound", "coverage": "inventory", "note": "the lower bound on the station shell's star distance and the star clearance it is compared with; subtraction over already-guarded values" },
{ "go": "shellClears", "coverage": "inventory", "note": "the strict comparison deciding home-site criterion (d)" },
{ "go": "StationShellClearsStar", "coverage": "inventory", "note": "direct: corporations.qualify's criterion (d); shellClears(stationShellBound(...))" }
```

Append to `inventory` (existing entry shape: `pair`, `why`, `expectedChange`), one entry per inventoried function (`pair` is the function name, as the existing `gateId` entry does):

```json
{ "pair": "StationShellClearsStar", "why": "Added by fix-burn-order-geometry-refusals under a stop condition forbidding any recorded system fixture on the authoring machine. Its decisions are pinned by a hand-written pass/fail table over parent type, ring and star class in backend/system, not by a recorded family.", "expectedChange": "the next change that modifies backend/system gives it a recorded family, recorded off arm64 with the amd64 cross-check" }
```

and the same `why` and `expectedChange` for `stationShellBound` and `shellClears`. No other key of the file changes. If the first name is renamed, its entry follows.

### 2.3 `backend/corporations`

- `spawnWalk` gains `seed int64`, set from `meta.Seed` in `selectSpawnSite` (`siteselection.go:67-84`). *Field name renameable.*
- `qualify` (`siteselection.go:185-207`): after the mineable test, `if !system.StationShellClearsStar(w.seed, sys.Id, sys.Skeleton) { continue }`. Unconditional; no `SpawnParams` field.
- No other change to the walk, to `pickUniform`, to healing or to the commit transaction.
- Comments saying "three criteria" at `siteselection.go:50-53`, `:182` and `params.go:9` are updated (task 1.10, developer half).

---

## 3. Refusal shape — `backend/fleet`

### 3.1 Sentinels (pinned names, pinned text, pinned unwrap target)

New file `backend/fleet/solve_refusal.go` (*file name renameable*).

| Sentinel | `Error()` and served `error` text | Unwraps to | Status | Log `refusalCause` |
| --- | --- | --- | --- | --- |
| `ErrTargetBodyAbsent` | `fleet: target body is not present in this system` | `space.ErrUnknownBody` | 404 | `absent-body` |
| `ErrOriginInsideClearance` | `fleet: burn origin is at or inside the star-clearance radius` | `space.ErrEndpointInsideClearance` | 409 | `origin-inside-clearance` |
| `ErrDestinationInsideClearance` | `fleet: burn destination is at or inside the star-clearance radius` | `space.ErrEndpointInsideClearance` | 409 | `destination-inside-clearance` |
| `ErrBurnArcTooShort` | `fleet: burn curve is below the minimum arc length` | `space.ErrArcTooShort` | 409 | `minimum-arc` |

Each is a package-level `error` value holding a pointer to one unexported type (*type and field names renameable*) with `Error()` returning the text above and `Unwrap()` returning the `space` sentinel. Required properties, all asserted:

- `errors.Is(x, <its own sentinel>)` is true and `errors.Is(x, <any other of the four>)` is false, including origin against destination.
- `errors.Is(x, <its space sentinel>)` is true. The pins at `star_destination_test.go:40`, `order_replace_and_retarget_test.go:199` and `service_test.go:224` are not edited and stay green.
- The text contains no body id, point, coordinate or route.

### 3.2 Route (pinned values)

```go
type burnRoute string
const (
	routeOrder   burnRoute = "order"
	routePreview burnRoute = "preview"
	routeStop    burnRoute = "stop"
)
```

**Handlers do not supply the route.** The service entry point does: `OrderTo` passes `routeOrder`, `PreviewOrder` passes `routePreview`, `Stop` passes `routeStop`. `solveOrder` gains the parameter:

```go
func (s *Service) solveOrder(ctx context.Context, id string, req OrderRequest, route burnRoute, settleExpiredHold bool) (*orderSolve, error)
```

`ServiceInterface` and every handler signature are unchanged.

### 3.3 The solve helper (pinned name and signature)

```go
func solveBurnClassified(
	ctx context.Context, route burnRoute, fleetID, systemID string,
	bodies space.Bodies, from space.Vec3, target space.Target,
	departMs common.WorldMillis, accel float64, departDir *space.Vec3,
	starClearance float64,
) (space.SolveResult, error)
```

A package-level function, not a method: it needs no service state. `bodies` is the `space.Bodies` interface on purpose (section 0). It replaces the two direct `space.SolveBurn` calls at `service.go:720` and `:1348` and nothing else. Call sites keep computing `starClearance` as they do today (`:718`, `:1347`) and keep their existing `fmt.Errorf("fleet: solving burn: %w", err)` / `"fleet: solving stop burn: %w"` wraps around whatever the helper returns.

**Fixed decision order (pinned):**

1. `target.BodyId != ""` and `bodies.Body(target.BodyId)` reports absent: return `ErrTargetBodyAbsent`.
2. `starClearance > 0 && from.Length() <= starClearance`: return `ErrOriginInsideClearance`.
3. `space.SolveBurn(bodies, from, target, departMs, accel, departDir, starClearance, space.SolveRounds)`:
   - `errors.Is(err, space.ErrEndpointInsideClearance)`: return `ErrDestinationInsideClearance`
   - `errors.Is(err, space.ErrArcTooShort)`: return `ErrBurnArcTooShort`
   - any other error: return it unchanged, with no log entry from the helper
   - success: return the result

No identity comparison of the target with the star or with the fleet's host anywhere.

**The log entry (pinned).** Written by the helper, once, immediately before it returns one of the four sentinels, and nowhere else:

```go
log.Info().Ctx(ctx).
	Str("refusalCause", "<value from 3.1>").
	Str("route", string(route)).
	Str("fleetId", fleetID).
	Str("systemId", systemID).
	Msg("fleet: burn solve refusal served")
```

Level info. Field names, values and message are pinned. `respond` writes no entry for a served refusal. Tests capture it with the existing `captureLog` (`backend/fleet/coordinate_guard_test.go:33-41`), which swaps the global zerolog logger; that is the "injected logger" task 2.8 means.

### 3.4 Call-site placement

- `solveOrder`: the helper call sits where `space.SolveBurn` is today, after acceleration validation and the live-velocity read. Nothing is moved earlier. `f.Id` and `f.SystemId` supply the ids.
- `Stop` (task 2.12): the burn branch only (`service.go:1339-1351`), with `accel = defaultAccel`, `departDir = nil`. The free branch below the speed floor is not touched and refuses nothing (RULING 8).

### 3.5 `respond` (`backend/fleet/handler.go:467`)

Four arms, placed above `case err != nil`, each serving the **sentinel's own text**, never `err.Error()`:

```go
case errors.Is(err, ErrTargetBodyAbsent):
	c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": ErrTargetBodyAbsent.Error()})
case errors.Is(err, ErrOriginInsideClearance):
	c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": ErrOriginInsideClearance.Error()})
// destination and minimum-arc likewise, 409
```

No log call in these arms. **No arm** for raw `space.ErrEndpointInsideClearance`, `space.ErrArcTooShort` or `space.ErrUnknownBody`: an unclassified one reaches the existing default arm (error log, bodyless 500). Commit, preview and stop need no per-route code: all three already end in `respond`.

---

## 4. Frontend

### 4.1 `frontend/lib/rejection-copy.ts` — `BURN_COPY`, final order (pinned)

```ts
const BURN_COPY: CopyMap = [
  ['maxfueltons cap', /* unchanged */],
  ['maxfueltons must be', /* unchanged */],
  ['exceeds available fuel', /* unchanged */],
  ['lane transit', /* unchanged */],
  ['origin is at or inside', 'This fleet is too close to the star to take a course from here right now.'],
  ['destination is at or inside', 'That destination is too close to the star to fly to.'],
  ['minimum arc length', 'That burn is too short to fly. Choose a target farther away.'],
  ['target body is not present', 'That body is not in this system. Pick another target.'],
  ['commanded acceleration', /* unchanged */],
  ['movement channel', /* unchanged */],
  ['not found', /* unchanged */],
]
```

The two legacy lines keyed `star-clearance` and `star clearance` are **deleted** (RULING 11). No other table and no exported function changes. No new export.

### 4.2 The two Stop surfaces

| Surface | Today | After (task 3.4) |
| --- | --- | --- |
| `frontend/components/space/FleetActionsPanel.tsx:584` (the Stop button, `fleet-cmd-stop-<id>`) | `reportFailure(mineErrorCopy(commandErrorReason(error)))` | `reportFailure(burnErrorCopy(commandErrorReason(error)))` |
| `frontend/components/galaxy/GalaxyView.tsx:325` (roster Stop, rendered by `FleetRoster`, `fleet-cmd-stop-<id>`) | `toast.error(e.message \|\| 'Stop failed')` | `toast.error(burnErrorCopy(commandErrorReason(e)))` |

Only those two lines, plus the imports they need. The cut-drive handlers beside them (`FleetActionsPanel.tsx:570`, `GalaxyView.tsx:316`) are **not** in scope and are left as they are. No change to hooks, services, the API client, the preview panel or retry policy (RULING 10).

Switching the panel's Stop from the mine table loses nothing: every reason Stop can be refused with that the mine table mapped (`movement channel`, `not found`) is also in `BURN_COPY`, which additionally maps `exceeds available fuel`.

---

## 5. Cross-boundary contract

The only thing both stacks share is the four reason strings in section 3.1. Go owns them. Each side pins the same literals in its own tests (task 2.7 in Go, task 3.1 in TypeScript); there is no shared fixture file and none is to be added.

---

## 6. Ownership

| Tasks | Owner | Notes |
| --- | --- | --- |
| 1.1-1.7, 2.1-2.9, 3.1, 3.3 | **SDET** | The red suite |
| 1.10, fake-graph half | **SDET** | Making the fake line graph's star class explicit is an edit to a test file, done with the task 1.4 fake changes at red. Tests stay immutable to developers |
| 4.1, 4.2 | **SDET** | Edits to existing e2e-tagged tests and their comments |
| 1.8, 1.9, 1.10 (comments in `siteselection.go`, `params.go`; confirming the reachability sample) | **golang-dev** | |
| 2.10, 2.11, 2.12 | **golang-dev** | |
| 3.2, 3.4 | **nextjs-dev** | |
| 5.1-5.5 | **orchestrator** (records) | 5.2 waits for gate evidence; the rest can be written any time |
| 6.1-6.3 | **orchestrator / QA** | 6.2's diff check is section 1's table |

### Files each developer may touch

**golang-dev**

- `backend/system/station_continuous.go`
- `fixtures/system/mirror-map.json` (the entries in 2.2 only)
- `backend/corporations/siteselection.go`, `backend/corporations/params.go` (comment at `:9` only)
- `backend/fleet/solve_refusal.go` (new), `backend/fleet/service.go`, `backend/fleet/handler.go`
- Nothing else. No test file, no `backend/space`, no `backend/fleet/fuel.go`, no `backend/stations`, no router.

**nextjs-dev**

- `frontend/lib/rejection-copy.ts`
- `frontend/components/space/FleetActionsPanel.tsx` (the one line in 4.2 and its import)
- `frontend/components/galaxy/GalaxyView.tsx` (the one line in 4.2 and its import)
- Nothing else.

**SDET** — new and existing test files in section 7; `backend/corporations/siteselection_test.go`'s fake graph; `backend/fleet/handler_test.go`'s `fakeFleetSvc` (error fields for preview and stop); `backend/fuel_spawn_starting_fuel_e2e_test.go`; comments in `backend/stationkeep_e2e_helpers_test.go:204-220` and `backend/fleet_wrong_state_rejection_e2e_test.go:88-95`.

---

## 7. Where each task's tests live, and how they are arranged

File names are suggestions; **packages are pinned**. Test tiers and commands: `docs/testing-tiers.md` (per-task and per-commit gates never boot a stack; the full emulator suite and Playwright run once, at archive).

### 7.1 `backend/system` — `package system` (internal, so unexported names are reachable)

| Task | File | Arrangement |
| --- | --- | --- |
| 1.1 | `station_shell_test.go` | Single-body skeletons (parent index is 0 for one body, whatever the seed) over all six `galaxy.BodyType` values, rings 0 to 4, the seven star classes and one unknown class. Expected pass/fail is the hand-written table in the delta's scenario, typed out as a literal Go table, never computed. Equality: `shellClears(c, c)` is false and `shellClears(c + 1, c)` is true, called directly |
| 1.2 | `station_shell_test.go` | For each table row: build a map-backed `space.Bodies` (star at the origin; parent with `Orbit{ParentId: "feat-star", Radius: ContinuousRadius(ring)}`; station with `StationContinuousOrbit`'s returned orbit and `Size: StationSize`), place a `space.Park{Kind: ParkOrbit, BodyId: station, Radius: InsertionStandoff(station)}` and take `Park.Position` over a fixed grid of parent phase, station phase, park phase and world time. Assert every position's length is at least `stationShellBound`'s bound; for ring-0 rows assert at least one grid position is at or inside the clearance |
| 1.7 | `station_shell_sweep_test.go` | Decision 9 as written: the same fake `space.Bodies`; subjects rocky ring 1 under F, gas giant ring 2 under B, ice ring 1 under K; control a ring-0 system. Arrival: `space.SolveBurn` from a fixed origin outside the clearance to the station. Departure: from the park position to a fixed point outside the clearance. Fixed integer `SubTurns` steps and a fixed list of world times, all written in the test, with named system ids. Assert zero `space.ErrEndpointInsideClearance` for the subjects, on each side, and at least one for the control. No file is read or written |

The fake `space.Bodies` is a few lines in the test file; `backend/system/contacts_test.go:41` shows the in-package alternative of building a `BodyTable` literal, which is also acceptable.

### 7.2 `backend/corporations` — `package corporations`

| Task | File | Arrangement |
| --- | --- | --- |
| 1.3, 1.5 | `siteselection_shell_test.go` | The existing `lineGraph` fake, extended with a per-index skeleton function (today it returns one rocky ring-1 body for every index, `siteselection_test.go:55-57`). A failing candidate is a single ring-0 body. 1.5's exhaustion case follows the existing finite-component test's harness and asserts `ErrNoSpawnSite` with no corporation document, pointer or reservation |
| 1.4 | `siteselection_shell_test.go` | See below |
| 1.6 | beside the existing healing tests (`spawn_healing_test.go`), in whatever tier they run | A corporation recorded in a home that fails (d); healing leaves the home, runs no selection and makes no second reservation |
| 1.10 (fake half) | `siteselection_test.go` | `StarClass: "G"` on the fake's skeleton. No assertion changes |

**Task 1.4 arrangement (binding, from adversary round 2 MINOR 1).**

- The fake's `LiveGalaxyMeta` returns a **non-zero `Seed`**, a named constant in the test. Today it returns none (`siteselection_test.go:61-67`).
- One candidate id (the fake's `sys_<i>_0` form) is chosen at authoring time by searching `i` so that, for a two-body skeleton, `system.StationContinuousOrbit(seed, id, skel).ParentId == "feat-body-1"` **and** `system.StationContinuousOrbit(0, id, skel).ParentId == "feat-body-0"`. The id is then a constant.
- Direction "derived parent fails": skeleton `[ring 3, ring 0]`, so the derived parent (index 1) is the ring-0 body. The candidate is excluded; a farther single-body ring-1 decoy is the pick.
- Direction "derived parent passes": skeleton `[ring 0, ring 3]` under the same id, so the derived parent (index 1) is the ring-3 body. The candidate is the pick.
- With that one id, a wiring that passes seed 0 and a wiring that always reads `Bodies[0]` each fail both directions.
- Each test **first asserts the arrangement**: the two `ParentId` equalities above. On failure it reports "arrangement no longer holds" and stops, so a retune of the seed mix is not read as a selection regression.
- Both bodies are rocky and at least one is `Mineable`; the star class is explicit. Every other system on the line is non-mineable except the decoy, so the candidate's ring is the first one that can qualify. The run goes through `selectSpawnSite`, never by calling the predicate.

### 7.3 `backend/fleet` — `package fleet`

Harness: the real `Service` (`newSvc`, mock DAO, `fakeClock`) behind `NewHandlerWith(...).RegisterRoutes`, with `testBodyTable` for the body table (`space_testutil_test.go:72`). Bodies assert the JSON `error` text, never the status alone.

| Task | File |
| --- | --- |
| 2.1, 2.2, 2.3, 2.5, 2.6 | `solve_refusal_handler_test.go` |
| 2.4 | `solve_refusal_stop_test.go` |
| 2.7 | `solve_refusal_reason_test.go` (the four literals of 3.1 typed out) |
| 2.8 | `solve_refusal_trace_test.go` |
| 2.9 | `solve_refusal_faults_test.go` (the three existing pin files are not edited) |

**Sweep-located world times (tasks 2.2 and 2.5; adversary round 2 item (a)).**

1. **Locate at authoring time.** With the test's own body table and fleet state, step the fake clock over a fixed range and call `space.SolveBurn` with the inputs `solveOrder` would use at that instant: `from` = the fleet's position at `now`, `departDir` = its normalised live velocity (nil when it has none), `accel` = `DerivedAccelCeiling(*f, DefaultClassStats())`, `starClearance` = `space.StarClearanceRadius(bt.StarSize())`, `rounds` = `space.SolveRounds`. Record one instant per wanted outcome. The locating loop is throwaway and is not committed.
2. **Pin.** The instant is a named constant in the test with a comment saying which outcome it was located for and over what range. No fixture file.
3. **Assert the arrangement first.** Each such test begins with a direct `space.SolveBurn` call at the pinned instant, built from the same inputs, and asserts the `space` sentinel it depends on:
   - 2.2: the origin's length is greater than the clearance **and** the solve returns `space.ErrEndpointInsideClearance`
   - 2.5 short: `space.ErrArcTooShort`
   - 2.5 long enough: no error
   
   On failure: `t.Fatalf("arrangement no longer holds: ...")`. This precondition must not reference the fleet sentinels, so it is green at red and stays meaningful after a retune.
4. Only then drive the route and assert status and body.

Other arrangements:

- **2.4, lead point inside:** a drifting fleet 1.0 outside the clearance, velocity pointing at the star, speed above `space.StopInPlaceSpeedFloor`. **Origin inside:** a drifting fleet inside the clearance above the floor. Assert the stored attachment, motion state and fuel through the mock DAO's recorded writes (there are none).
- **2.6 deny matrix:** goes through the real ownership seam (`commandedFleetId`). Compare each response's status and raw body bytes with the nonexistent-fleet response.
- **2.8:** four separately arranged fleets, none with a due arrival or an elapsed hold. With `captureLog`, assert exactly one line with `"level":"info"` and the four fields of 3.3, and no `"level":"error"` line, per route that can raise each refusal (origin and destination: order, preview, stop; minimum-arc and absent-body: order, preview).

### 7.4 The three composed fault cases (section 0)

In `solve_refusal_faults_test.go`:

1. Build a map-backed `space.Bodies` with the fault (a two-body parent cycle; or a present body whose `Orbit.ParentId` names an id not in the map), a `from` outside the clearance, and a target naming the faulty body.
2. Call `solveBurnClassified` under `captureLog`. Assert: an error; `errors.Is` false for all four fleet sentinels; and no info-level refusal line. For the missing parent also assert `errors.Is(err, space.ErrUnknownBody)` is true while `errors.Is(err, ErrTargetBodyAbsent)` is false, which is exactly the distinction the 404 requirement draws.
3. Feed that same error, wrapped as the call sites wrap it, through the real handler using `fakeFleetSvc` (extended with error fields for `PreviewOrder` and `Stop`) on `orders`, `orders/preview` and `stop`. Assert a bodyless `500` and exactly one error-level line carrying no `refusalCause` field.

The stored-host case uses the real service and a real table: a fleet parked at a body id the table lacks; assert `500`, an error-level line, and not the absent-body `404`.

### 7.5 Frontend

| Task | File | Arrangement |
| --- | --- | --- |
| 3.1 | `frontend/lib/rejection-copy.test.ts` | The four literals of 3.1 as inputs; the four lines of 4.1 as expected output, verbatim. `R.clearance` (`:49`) is re-pointed at the destination literal so the existing cases at `:99` and `:105` keep their intent. Also assert each reason contains its own fragment and no other's, and none contains `not found` |
| 3.3 | `frontend/components/space/FleetActionsPanel.test.tsx`, `frontend/components/galaxy/GalaxyView.test.tsx` | The existing mocked `useStop` (`GalaxyView.test.tsx:183,287`); invoke the mutation's `onError` with an error whose `data.error` is the origin, then the destination, literal. Assert the pinned line verbatim, and that the displayed text contains neither `fleet:` nor the raw reason |

### 7.6 Test repair (task 4.1)

`backend/fuel_spawn_starting_fuel_e2e_test.go`, both tests (`:53`, `:236`), on a non-200: read the `error` body and branch on its text.

- contains `exceeds available fuel`: the unaffordable outcome the test samples; keep today's tuning message
- contains `origin is at or inside`, `destination is at or inside` or `minimum arc length`: `t.Errorf`/`t.Fatalf` with a message naming home-site criterion (d) as the suspect and stating it is not a tuning signal
- anything else: fail, reporting status and body

This file is e2e-tagged; it is verified at the archive gate, not per task.

---

## 8. Sequencing

1. **Contract first** — this file. Sections 3.1 and 4.1 are the whole cross-boundary surface.
2. **SDET red**, both stacks, from this file alone. Go tests naming the new identifiers are compile-red by design; record them as such in `fix-burn-order-geometry-refusals-red-coverage.md`. The arrangement preconditions in 7.2 and 7.3 are written so they are green at red.
3. **golang-dev and nextjs-dev in parallel after red.** They share no file. Backend and frontend may land in either order (an old frontend shows the generic line; an old backend never serves the new strings).
4. **Within Go**, in this order:
   1. 1.8 — the predicate and the verbatim extraction. Run the `backend/system` fixture tests immediately; a `stationOrbit` or `stationOrbitSweep` failure stops the run before anything else is built.
   2. 1.9, then 1.10's comments.
   3. 2.10 and 2.12 together (same helper, both call sites), then 2.11.
   
   Sections 1 and 2 share no code, so if two Go developers are available they can split there.
5. **Within Next.js:** 3.2, then 3.4.
6. **Records and gates:** 5.1, 5.3, 5.4, 5.5 any time; 6.2 before the archive gate; 5.2 after it.

---

## 9. Observations outside this change (not to be acted on here)

- The cut-drive toast on the galaxy roster (`GalaxyView.tsx:316`) also shows `e.message`, and the fleet panel's cut-drive (`FleetActionsPanel.tsx:570`) routes through the mine copy table. Neither is named by any requirement in this change.
- A refused preview on a query path is retried by `shouldRetryQuery` for any status below 500 other than 401/403 (`frontend/lib/query-client.ts:28-37`). Whether the preview's 409s should be retried belongs with the RULING 10 follow-up.
