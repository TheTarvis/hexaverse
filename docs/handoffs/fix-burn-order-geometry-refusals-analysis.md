# Analysis — `fix-burn-order-geometry-refusals`

Read-only analysis at `c3fcfcf`. No stack booted, no test suite run, no fixture regenerated, no spec file edited. Code claims are from reading source. The numbers in section 4 come from a throwaway probe compiled through a Go build overlay from the session scratchpad (nothing written inside the repo), calling `galaxy.GenerateStartArea`, `system.Generate`, `system.StationContinuousOrbit` and `space.SolveBurn` directly; they are `space`-level measurements, not HTTP reproductions.

**Headlines**

- **Entry mode: delta, no brownfield baseline needed.** Every behaviour the fix changes has a live requirement. What is unspecced is narrower: the HTTP status and served reason for a geometry refusal. That is new requirement text (ADDED), as the defect record itself says.
- **The defect record's mechanism is half right, and its origin claim is wrong.** The standoff point is taken on the side of the body facing the fleet, and the affected hosts are trading stations riding an inner planet. But a fleet **docked** at such a station is itself inside the clearance for part of every park orbit, so the **origin** endpoint trips the same guard on departure. Measured: 8.2% of departure solves in affected systems. No handoff records this.
- **"Clamp outward" has two readings with very different blast radius.** A radial push of the intercept breaks three `space-kinematics` invariants and makes the star orderable unless conditioned. Sliding the insertion **phase** to the far side of the same standoff circle keeps every park, tangency and bit-identity invariant, keeps the star refused by geometry with no identity check, and leaves one rare residual. The mechanism has no recorded lean.
- **The family is three player-causable `space` sentinels on three routes**, not two on two: `ErrEndpointInsideClearance`, `ErrArcTooShort`, `ErrUnknownBody`, reaching the bodyless 500 from `orders`, `orders/preview` and `stop`.
- **Fixture verdict:** every geometry option re-records `fixtures/space/cases.json` (sweep digests and `measured`). No option except a generator change touches `fixtures/system/**` or either `start-area.json`. The response-shape half touches no fixture.
- **Size: 34 to 38 tasks as one change** if the origin side is served as a typed refusal. Ruling the origin-side geometry in pushes it past 40; the seam is named in section 8.

---

## 1. Triage

| Record | Verdict | Reason |
| --- | --- | --- |
| `defect-station-order-500.md` | **IN** (primary) | Both halves: geometry and response shape. |
| `defect-zero-length-burn-returns-500.md` | **IN** | Same handler arm, same two routes, a live requirement already demands a named reason (`fleet-movement/spec.md:283`, `space-kinematics/spec.md:235`). Three or four tasks. |
| `defect-post-dock-burn-cost-drift.md` | **OUT** | Not a refusal and not the default arm: it is a served `409` with a body. Its cause is unconfirmed ("Candidates, none confirmed", `:33-41`) and its own cheapest step (log and diff the two solves' inputs, `:54-56`) has not been done. Section 4 notes one interaction to hand to whoever picks it up. |
| `defect-post-sale-departure-burn-409s.md` | **OUT** | Already "RESOLVED / RECLASSIFIED 2026-09-09" by its own header; it decomposed into the retry fix (shipped), the cost drift above, and a wake flake. Nothing left to fix here. |
| `defect-point-burn-serves-empty-bodyid.md` | **OUT** | A served-shape and client-typing question on a success response, "not verified on a running stack", and its own text assigns the call to Travis. Not on the refusal path. |

Found during the sweep and **not** analysed in (recommend filing, not fixing here): `OrderRequest.Point` has no extent or magnitude validation (`backend/fleet/model.go:171-174`). I did not trace what a point such as `{x:1e300}` does to `FlightSeconds` and `QuantizeArrival`; it is unverified and it is input validation, not a sentinel reaching the default arm.

---

## 2. Entry mode — the live requirement each change targets

| Behaviour | Live requirement (file:line) | Operation |
| --- | --- | --- |
| Where the intercept sits on the standoff circle | `space-kinematics/spec.md:554` *Intercept Against a Moving Target Runs a Fixed Number of Rounds* — "The insertion phase index SHALL be derived first, by resolving the horizontal-plane projection of the direction from the target body's position ... to the burn's origin point"; scenario `:613` *The standoff is taken on the approaching side, in the horizontal plane* | MODIFIED under any geometry option |
| Endpoint star-clearance guard | `space-kinematics/spec.md:419` *A Burn Path Is Displaced Perpendicular to the Chord to Clear the Star* — "IF either endpoint lies at or inside the clearance radius, THEN the commit SHALL be rejected with its own named reason"; scenario `:456` | Unchanged under the phase option. MODIFIED only if the origin guard is relaxed or the radial clamp is chosen |
| Intercept equals the settled park's position; settled park radius is the standoff | `space-kinematics/spec.md:377` *Arrival Is Tangent to the Target's Settled Motion...*; `:759` *A Burn Past Its Arrival Is Its Settled Park...*; scenario `:598` | Unchanged under the phase option. All three MODIFIED under the radial clamp |
| Minimum curve length | `space-kinematics/spec.md:197` *Flight Time Is the Brachistochrone...* (scenario `:235`); `fleet-movement/spec.md:208`, scenario `:283` *A target too close to solve is rejected by name* | Unchanged. Already specced; the handler never implemented it (drift) |
| Star rejected by geometry, no identity check | `fleet-movement/spec.md:208` *In-System Burn Order to a Body or a Point* (scenario `:240`); `:872` *Every Body ... Is a Valid Attachment Host* (scenario `:937`); `:2291` *Burn Order Preview Solves Without Committing* (scenario `:2416`) | Must keep holding. No edit needed under the phase option (section 4) |
| Unknown body target | `fleet-movement/spec.md:248` "fails with a named error and no state change occurs"; `:2431` | Unchanged; served shape is the gap |
| Order and preview refusal to status + reason | **Unspecced for these sentinels.** `fleet-movement/spec.md:240-246` demands no status and no reason. Precedent text for the shape exists at `:1572-1574` ("None of the three rejections above SHALL be served as a bodyless `5xx`") | **ADDED** requirement in `fleet-movement` |
| "A preview is refused wherever the commit would be refused" | `fleet-movement/spec.md:2291`, scenario `:2431` (lists lane transit, ambiguous, empty, acceleration, absent body; the prose at `:2336-2340` adds the clearance guard) | Holds by construction (`handler.go:273` routes the preview through `respond`). The ADDED requirement states the shape for both routes; this 100-line, 11-scenario requirement is best left unmodified (MODIFIED-block omission hazard) |
| Stop-in-place solve refusal | `fleet-movement/spec.md:364` *Stop In Place Commits a Velocity-Nulling Burn* — silent on a solve that refuses | Covered by the ADDED requirement naming the route |
| Rejection reason to copy | `docked-fleet-actions/spec.md:558` *Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text* (generic: every distinguishable reason is mapped); `system-space-view/spec.md:847` *Burn Commit Reports Its Outcome*, whose scenario at `:869-876` already names "a target inside the star's clearance" as a distinguishable server reason | No delta required. New copy lines are tasks in the shared module |
| Stranding candidates that fail to solve | `fleet-movement/spec.md:1145` and `:1228` — "any other named `space` error SHALL count as unreachable" | Unchanged unless question Q2 rules the origin side in |

Capabilities checked with **no delta** under the recommended shape: `system-space-view`, `docked-fleet-actions`, `trading-station` (`:138` station orbit), `system-interior` (`:142` invariant 3 bounds a body's centre, not its standoff shell), `system-body-table`, `corporation-spawn` (`:389`, test repair only).

A point worth stating: `system-space-view/spec.md:869-876` is evidence the frontend spec has always assumed the clearance refusal is distinguishable. The frontend already carries the copy (`frontend/lib/rejection-copy.ts`, `BURN_COPY`: `'star-clearance'` to "That destination is too close to the star to fly to."). It has never rendered, because the server sends no body.

---

## 3. The family sweep

`respond` is `backend/fleet/handler.go:467-605`; the default arm is `:594-596` (`log.Error` then bodyless 500). The commit reaches it from `Order` (`:233`), the preview from `OrderPreview` (`:273`, same `respond`), stop from `Stop` (`:351`). Commit and preview share `solveOrder` (`backend/fleet/service.go:625`), which wraps every solver error as `fleet: solving burn: %w` (`:720-723`). `Stop` has its own `SolveBurn` call (`:1348-1351`, wrapped `fleet: solving stop burn`).

| Sentinel | Raised at | Routes reaching the 500 arm | Player-causable by an ordinary action | Live spec |
| --- | --- | --- | --- | --- |
| `space.ErrEndpointInsideClearance` | `space/burn.go:281-283` | `orders`, `orders/preview`, `stop` | **Yes, five ways.** (a) a body whose facing-side standoff dips inside (stations, section 4); (b) the star, by design; (c) a point at or inside the clearance, including the keyboard point-select at default framing (`system-space-view/spec.md:1499-1502`); (d) **origin**: a fleet docked at an affected body during the starward part of its park orbit, or a fleet drifting through the clearance after a cut; (e) `stop` from either of those, or with the lead point inside | "rejected with its own named reason, distinct from the minimum-arc-length rejection" (`space-kinematics:456`). No status anywhere |
| `space.ErrArcTooShort` | `space/burn.go:470-472` | `orders`, `orders/preview`. `stop` appears unreachable (lead point is `2 * MinArcLength` ahead and avoidance only lengthens) — inferred, not proven | **Yes.** Burn toward the fleet's own host while docked (the control is enabled there: `followup-explain-withheld-burn-command.md`), or a point within about 2 units | `fleet-movement:283`, `space-kinematics:235`: named reason. Handler never mapped it |
| `space.ErrUnknownBody` (target) | `space/body.go:18`, via `TargetPosition` / `BuildCurve` (`burn.go:247-249`) | `orders`, `orders/preview` | Only by direct request, the agent's token passthrough, or a stale client selection; the UI offers served bodies only | `fleet-movement:248`, `:2431`: "named error", "same named reason" |
| `space.ErrUnknownBody` (the fleet's own stored host) | via `Service.Position` (`service.go:678`, unwrapped) and `currentVelocity` (`:709-712`) | all three | No: stale data after a retune or a degraded gate read. Reads already degrade (`handler.go:750`); commands do not | `fleet-movement:872` covers reads only |
| `space.ErrCutAfterArrival` | `space/cutdrive.go:14` | none (mapped 409, `handler.go:524`) | — | done in link 7b |
| `space.ErrBodyCycle`, `space.ErrUnknownParkKind`, codec errors through `fleet.ErrKinematicDecode` | `body.go:22`, `park.go:79`, `fleet/kinematic_decode.go:27` | any | No: data or programmer faults | stay 500, correctly |
| `fleet.ErrNoBodySource`, `system.ErrNotFound`, `system.ErrInteriorPredatesContinuum`, `system.ErrBodyTableNoStar` | `bodiesFor` (`service.go:456`) | any | No: wiring or data faults | stay 500 |
| `action` errors other than `ErrActiveActionExists`; Firestore errors | `actions.Cancel` / `actions.Commit` | commit paths | No | stay 500 |

Jump, cut-drive and cancel do not share the solve path. Jump's only wrapped error is the lane crossing (`service.go:1474-1477`), whose `galaxy.ErrLaneNotFound` is already a reason-bearing 404.

**One consumer swallows the sentinel instead of serving it.** `reachableAtFloor` (`backend/fleet/fuel.go:151-168`) treats every solver error except `ErrArcTooShort` as "candidate unreachable", per the live rule at `fleet-movement/spec.md:1179-1187`. When the **origin** is inside the clearance, `BuildCurve` returns the clearance error before the arc-length check, so every candidate fails, including the fleet's own dock. `FuelStatus` (`service.go:1845-1869`) would then report `stranded: true` for a docked fleet with a full tank, for the seconds its park orbit spends inside the clearance. This follows from the code; I have not observed it on a running stack. It sits against the intent of scenario `:1276` *A docked fleet with a full tank never reads as stranded merely because its own dock is too close to solve*.

**The response-shape decision the record asks for** (`defect-station-order-500.md:308-310`) reduces to one ADDED requirement: every refusal the burn solve returns for a player-causable geometric or target condition is served, on `orders`, `orders/preview` and `stop`, with the same status and the same reason-bearing body on each route, pairwise distinct reasons, no stored burn, no action, no debit, and no error-level log.

---

## 4. The geometry

### How the intercept is computed (`backend/space/burn.go:239-284`)

For a body target, each solve round:

1. resolves the body's position at that round's quantized arrival (`:251`);
2. takes `approach = from - bodyAt` and resolves its horizontal projection to a phase index through the pinned table (`:255-261`);
3. builds an orbit park around the body with radius `InsertionStandoff(body) = 2.5 + 1.5 * size` (`park.go:145`, `params_const.go:33-36`), that phase, and epoch = arrival (`:262-270`);
4. defines the intercept as that park's own position (`:271-275`);
5. refuses if `from` or the intercept is at or inside `StarClearanceRadius = 2.5 * starSize` (`:280-284`).

So the intercept is the point of the standoff circle **facing the fleet**. Its distance from the star ranges over `[bodyDist - standoff, bodyDist + standoff]` depending on where the fleet is coming from.

### Why it is intermittent, precisely

Two motions combine. The station is body-parented: it orbits a skeleton planet at local radius `MaxFeatureSize(parentType) + InsertionStandoff(that ceiling) + StationStandoff` (`system/station_continuous.go:43-45`), which is 10.0 for a rocky parent. Its star distance therefore swings between `parentRadius - 10` and `parentRadius + 10` every 14 seconds of world time. Then the fleet-facing standoff takes off up to another 3.85.

With `ContinuousRadius(idx) = 24 * 1.23^idx` and clearances from 13.0 (M) to 19.0 (O):

| Station parent's orbital index | Parent radius | Lowest intercept distance | Dips inside clearance for |
| --- | --- | --- | --- |
| 0 | 24.0 | 10.15 | every star class |
| 1 | 29.5 | 15.67 | A, B, O |
| 2 and beyond | 36.3+ | 22.5+ | none |

A planet at index 0 around an O or B star also dips (lowest intercept 17.9 for a size-2.4 rocky world). Gas giants never sit below index 7, so moons and giant-parented stations are clear. Gates sit at `1.1 * Extent` and are clear.

**Measured** (probe, 40 seeds of `GenerateStartArea`, 2,885 systems):

- 258 systems (8.9%) have a station whose standoff dips inside the clearance at some instant.
- 99 (3.4%) have a station whose **own centre** is inside the clearance at some instant.
- 1 has a station whose **entire** standoff circle is inside the clearance at some instant (worst margin 1.09 units).
- In affected systems, 9.9% of station-targeted solves from a fixed origin at radius 80 are refused. Across all systems that is 0.8 to 1.0%, the same order as the record's "roughly 2%", and it explains the clustering the record observed (none in a 40-spawn sample, then 1 in 10 against one unlucky spawn).
- No other body class dipped in a three-seed sample of roughly 2,700 bodies except two rocky planets.

**Discrepancy with the design input.** The captured case is recorded as "a station provisioned at ring 4 of `sys_3_2`, star size 5.2, clearance 13.0" (`defect-station-order-500.md:26`). Under today's derivation a parent at index 4 sits at 54.9 and cannot dip. Either "ring 4" predates the continuous station derivation (the lattice was deleted two days after that entry) or it names something other than the parent's orbital index. It does not change the fix.

**The origin endpoint is guilty too.** The record says "the *origin* endpoint is never the guilty one; it is always the destination standoff" (`:28-30`), reasoning from `SeedFleet`. That holds only for the first order after spawn. After arrival the fleet's park is an orbit of radius 3.85 around the station with an 8.5-second period (`InsertionPeriod`), and `Service.Position` resolves the docked fleet through that park (`service.go:485-490`). Whenever the station is on the starward side, the park sweeps inside the clearance and `from.Length() <= starClearance` refuses any departure. Measured: **8.2% of departure solves** from a fleet docked at an affected station. The log line is identical for both endpoints, so past occurrences cannot be attributed to one or the other from the logs.

### What "clamp the insertion point outward" could concretely mean

**Option A — radial clamp.** Push the intercept along the star-to-intercept ray out to the clearance radius plus a margin.

- The intercept leaves the standoff circle. That contradicts `space-kinematics:554` (the intercept **is** the settled park's position), `:377` (zero positional discontinuity across arrival) and `:759` (settled park radius is the body's standoff, nothing extra persisted). Keeping them true means storing a per-burn park radius: a `Burn` field, a codec change, and the `stateAt` and codec fixture families.
- The star: an unconditional clamp would make an order to the star **succeed**. It must be conditioned geometrically (for example, clamp only when the body's own centre is outside the clearance). The star's centre is at the origin, so it stays refused with no identity check. The same condition leaves the 3.4% of stations whose centre dips still refused at those instants.
- Needs a margin value. The design input gives none.

**Option B — phase slide (clamp along the standoff circle).** Keep the radius. When the fleet-facing point is at or inside the clearance, take the intercept at a different phase of the same circle.

- B1: the phase pointing directly away from the star (the horizontal projection of the body's own position, through the same `PhaseIndexOf`). One extra table lookup, no search, no margin constant.
- B2: the nearest clear phase to the approach side. Shorter detour, but needs a fixed-step search to satisfy `space-kinematics:525` *Fixed-Round Iteration Replaces Every Data-Dependent Loop Exit*.
- Every park invariant holds by construction: the intercept is still `park.Position` at the stored phase, the settled park is still the standoff orbit, the arrival tangent is still that park's velocity (and `avoidStar` never moves the control points that set it).
- Where the fleet ends up: the **same orbit around the same body**, entered at a different angle. With an 8.5-second park period the difference is gone within seconds. Attachment follows the target id (`fleet-movement:872`), so docking, masking, mine, sell and refuel preconditions are untouched.
- The star: every point of the star's standoff circle is at distance `2.5 + 1.5 * size` from the origin, which is below `2.5 * size` for every size above 2.5 (the table's smallest is 5.2). No phase clears, so the order is refused by the unchanged guard, with no identity check. The sentence at `fleet-movement:213-218` stays literally true and needs no edit.
- Residual: a body whose whole standoff circle is inside the clearance at the arrival instant is still refused (1 station in 2,885 systems, at some instants). That is the case the typed refusal exists for.
- Only `space-kinematics:554` and its scenario `:613` change: the approaching side becomes the default, with the stated exception.

**Option C — exempt body-standoff endpoints from the guard.** Not viable as written: `avoidStar` sizes its push against the worst sampled point, and an endpoint inside the clearance is always the worst point at the floor weight, so 32 rounds of push accumulate into an enormous detour (`burn.go:393-427`). It would need a redesign of avoidance.

**Option D — generator change** so no targetable body's standoff shell can reach the clearance (station parent restricted to index 2 and beyond, or a larger `BaseOrbitRadius`). Removes the cause for both endpoints and needs no solver change, but it moves existing stations and changes generated output. See section 5: it is blocked on this machine.

### Interactions to hand the architect

- **Fixed-point solve.** The phase is re-derived every round, so under B the choice can flip between rounds as the arrival estimate moves. The solve stays deterministic, but the recorded round-to-round residual may grow. `space-kinematics:554` forbids re-recording that bound upward "without a stated reason", and `SolveRoundResidualP99BoundMs` / `MaxBoundMs` (`params_const.go:120-123`) are the pinned ceilings.
- **Quote lock.** A preview and the commit that follows it are solved at different instants. If the dip condition flips between them the path length steps, and the commit can exceed its cap and re-quote in flow (specced behaviour, `system-space-view:807`). Magnitude unmeasured. This is the one thing in this change that could aggravate `defect-post-dock-burn-cost-drift.md`; I am not claiming it is that defect's cause.
- **Path displacement.** A far-side intercept puts the chord closer to the star for an inbound fleet; `avoidStar` handles it, and the fixture's `starClearanceViolations: 0` is the guard.
- **Starting fuel.** A far-side entry is a slightly longer burn. `corporation-spawn:389` prices the spawn-to-home burn at the ceiling against a constant grant; the sample test is the guard for a marginal account.
- **None of the options fixes the origin side.** That is question Q2.

---

## 5. Fixture hazard (reported, nothing regenerated)

| Option | `fixtures/space/cases.json` | `fixtures/system/**`, `frontend/public/galaxy/start-area.json`, `fixtures/system/start-area.json` | `fixtures/fleet/cases.json`, `fixtures/galaxy/**` |
| --- | --- | --- | --- |
| Response shape only | unchanged | unchanged | unchanged |
| A or B (solver geometry) | **changes**: `buildCurveSweep` and `solveBurnSweep` digests, and the `measured` block (`solveSweepSolvedCases` 4853, tangent counts, residuals). The sweep draws clearances up to 40 against a fixture system with a body at radius 33, so some of its 147 refused draws become solved | unchanged | unchanged |
| A additionally | `stateAt` and codec families, if a per-burn park radius is stored | unchanged | unchanged |
| D (generator) | unchanged | **changes**: `stationOrbit` / `stationOrbitSweep`, and `continuousRadius` / `interiorElements` if `BaseOrbitRadius` moves. **Must not be recorded on this machine.** | unchanged |

- The hand cases in `fixtures/space/cases.json` that pin the clearance refusal use a point target with the **origin** inside, and the unknown-body case uses `nosuchbody`; neither changes under B.
- `fixtures/space/` is not the family the arm64 prohibition covers (that is `fixtures/system/`), and `harness/skills/code-quality-checks/check.py:1108-1122` runs `./space/ ./system/ ./galaxy/` on native and on `GOARCH=amd64 GOAMD64=v1`. A re-record of the space family on this machine is therefore checkable, but only if the amd64 leg actually runs (it needs Rosetta). Whether that is acceptable is the orchestrator's call, not mine; I have not run it.
- New arithmetic in `backend/space` must follow the package's `float64(...)` guarding and `determinism:allow` annotations, and a new exported function needs a `fixtures/space/mirror-map.json` coverage entry. `backend/space` has no TypeScript mirror and none may be added.
- Station orbit derivation (`system.StationContinuousOrbit`) is untouched by A, B and the response-shape work.

---

## 6. The other active change

`openspec/changes/clear-burn-preview-on-commit/` (implementation tasks checked; tier-4 archive gate 7.4 and post-archive 7.7 open) carries, in `system-space-view` only: one ADDED requirement and MODIFIED blocks for *Burn Preview Reflects the Server-Solved Order, Without Committing* (`spec.md:478`), *A Failed or Stale Preview Is Never Presented as a Current Quote* (`:716`) and *Burn and Jump Commit Controls Guard Against Double-Submit*.

The recommended shape of this fix has **no `system-space-view` delta at all**, so there is no shared requirement and no archive-order hazard in either direction. The hazard appears only if a reviewer asks for the no-quote state to explain a geometry refusal: that would MODIFY `:716`, which the active change also replaces whole. Keep that out (it belongs to `followup-explain-withheld-burn-command.md`). The only frontend file this fix edits is `frontend/lib/rejection-copy.ts`, which the active change's task 5.5 confirms it did not touch.

A preview refused with a 4xx behaves exactly as a 500 does today on the client: the no-quote state, a retry, and Burn still available and labelled uncapped (`system-space-view:716-736`).

---

## 7. Capability map, requirements and scenarios

### `space-kinematics` — delta (geometry; wording below assumes Option B1, pending Q1)

**MODIFIED** *Intercept Against a Moving Target Runs a Fixed Number of Rounds* (`:554`). Change only the phase-derivation sentence; carry all seven scenario headings verbatim (`:598`, `:605`, `:613`, `:619`, `:625`, `:633`, `:642`).

- The system SHALL derive the insertion phase from the fleet-facing direction as today, EXCEPT that where the intercept at that phase lies at or inside the star-clearance radius, the system SHALL instead derive it from the horizontal projection of the direction from the star to the target body's position at the stored arrival millisecond. The intercept SHALL remain the settled park's own position at the chosen phase.
- Scenario (edit of `:613`): two burns from opposite sides of a body whose standoff circle is wholly outside the clearance still intercept on opposite sides.
- Scenario (new): a body whose fleet-facing standoff point is inside the clearance and whose far-side point is outside is solved, the intercept is at the standoff distance from the body, and its distance from the star exceeds the clearance radius.
- Scenario (new): the settled park's position at the arrival millisecond is bit-identical to the stored intercept when the far-side phase was used.
- Scenario (new, failure): a body whose far-side standoff point is also at or inside the clearance is refused with the endpoint-clearance reason, and nothing is stored.
- Scenario (new): the star as a target is refused, with no comparison against the star's identity (INFERRED from `fleet-movement:240`; restated here because this is where the geometry lives).
- Scenario (new, degenerate): a body whose horizontal projection from the star is zero-length uses the documented default phase.

### `fleet-movement` — delta (response shape)

**ADDED** — suggested name: *Burn Solve Refusals Are Served With a Named Reason on Every Route, Never as a Bodyless 5xx*.

The system SHALL serve each of the following refusals of an in-system burn solve, on `orders`, `orders/preview` and `stop` alike, with the same status and the same reason-bearing body on every route that can raise it, the reasons pairwise distinct, and SHALL store no burn, create no action, claim no channel slot and debit no fuel:

1. an endpoint at or inside the star-clearance radius;
2. a solved curve below the minimum arc length;
3. a target body id absent from the system's body table.

Statuses are Q4. Whether the origin and destination cases of (1) carry distinct reasons is Q5.

Scenarios, one per row unless noted:

- Commit to a body whose standoff cannot clear the star: refused with the clearance reason; fleet state and fuel unchanged.
- Preview of the same order: same status, same body.
- Commit and preview naming the star: the same refusal as any other clearance refusal, by the same path (keeps `:240` and `:2416` true).
- Commit to a point at or inside the clearance: refused with the clearance reason.
- Commit from a fleet whose live position is inside the clearance: refused with the reason Q5 assigns (INFERRED; the design input does not know this case exists).
- Commit and preview toward the fleet's own host while docked there: refused with the minimum-arc reason, distinct from the clearance reason (the security reviewer's scenario, `lift-burn-preview-to-view-panel-security.md:64-69`).
- Commit and preview naming an absent body id: refused with its own reason; no state change.
- Stop-in-place whose solve is refused for clearance: same shape as the commit; the fleet's state, attachment and fuel are unchanged (INFERRED: `Stop` clears `AttachedTo` in memory before the solve, `service.go:1286`, and nothing is written on this path today; the scenario pins that).
- The reasons are pairwise distinct in body text, not merely different from a 500 (the test-shape lesson in `drift-fleet-wrong-state-500.md`, "Test shape").
- A refusal is not logged at error level (Q6).
- Negative: a genuine internal fault on these routes (an undecodable stored state, a body cycle) is still a 5xx. The requirement must not read as "these routes never return 5xx".

No MODIFIED block is needed on `:208`, `:364` or `:2291` under B1. If the writer prefers to cross-reference, the cheapest safe edit is to `:208` (ten scenarios); avoid `:2291`.

### `docked-fleet-actions` / frontend — no delta, tasks only

`BURN_COPY` in `frontend/lib/rejection-copy.ts` needs lines for the minimum-arc reason, the unknown-body reason, and (per Q5) the origin-side clearance reason. The existing `'star-clearance'` line reads "That destination is too close to the star to fly to", which is wrong for an origin-side refusal if both share one server string. Copy is UX's to write.

### Altitude sort

- Requirement: which refusals are served, on which routes, with what shape; where the intercept sits.
- design.md: B1 against A, B2 and D; the phase re-derivation per round and its effect on the residual bound; one typed fleet-level sentinel per refusal against matching `space` sentinels in the handler; how the target-form `ErrUnknownBody` is told apart from the stale-host form (the solve wrap at `service.go:722` is the natural discriminator).
- tasks.md: handler arms, copy lines, fixture re-record with the amd64 leg, test repairs, defect-record updates.

---

## 8. Change structure and size

One change, `fix-burn-order-geometry-refusals`, touching `space-kinematics` (1 MODIFIED) and `fleet-movement` (1 ADDED).

| Group | Tasks |
| --- | --- |
| `space` red tests for the phase fallback (clear case unchanged, far-side case, bit-identity, residual refusal, star, degenerate) | 6 |
| `space` implementation, fixture re-record, `measured` review, amd64 leg, mirror-map entry | 4 |
| `fleet` handler and service tests: three sentinels by three routes, pairwise distinct, preview parity, nothing stored, log level | 9 |
| `fleet` implementation (typed refusals, `respond` arms, stop path) | 4 |
| Frontend copy lines and their tests | 3 |
| Test repairs (section 9) | 4 |
| Records: close the two defect files, correct the origin claim, file the point-extent note | 3 |
| Validation and gates | 4 |
| **Total** | **37** |

That is inside the cap with little room. **Pre-identified seam, if the panel adds work:** response shape (the `fleet-movement` ADDED requirement, handler, copy, test repairs; about 20 tasks, no fixture, shippable alone) against geometry (the `space-kinematics` MODIFIED requirement and the fixture re-record; about 14). Note the order of value: only the geometry half removes the red runs, because a test that orders a burn to its home station fails on a 409 as surely as on a 500.

If Q2 rules a geometric fix for the origin side in, that is a second change by construction (it redesigns the origin guard or star avoidance) and should not be folded in.

**Panel:** architect (solver change, determinism rules, fixture re-record, sentinel layering), reliability (error budget, log level, gate flake, what a retry means for a time-varying refusal), ux (three or four new copy lines; origin against destination wording). Security as a light pass: the refusal bodies add no disclosure (an absent body already differs observably from a present one today, 500 against 200, including for `gate-<systemId>` ids), and the preview's ownership-before-settlement order is untouched. **dba: not needed** under B1 (no stored shape, index or collection changes); needed only if Option A's per-burn park radius is chosen.

---

## 9. Test-shape notes for the SDET

- **No retry, anywhere.** The record is explicit (`defect-station-order-500.md:65-70`). After the fix a retry would hide the origin-side refusal exactly as it would have hidden this one.
- **Reproduce deterministically, not statistically.** The dip is a pure function of system, body and world time. A `space`-level test can construct it directly (a body at radius just over clearance plus standoff, an origin on the star side). An e2e test should pick a system and instant where the dip is known rather than sample spawns and hope.
- **`fuel_spawn_starting_fuel_e2e_test.go` — in scope, as this change's own test work.** Both tests (`:53` and `:236`) turn any non-200 into a starting-fuel verdict (`:249`, "a signal to retune `FuelParams.StartingFuelTons`"). Once refusals carry reasons the test can and should separate three outcomes: unaffordable (the condition it samples, `ErrInsufficientFuel`'s reason), geometry refusal (report as such, never as a tuning signal), and anything else. The record calls this distinction "trivial once the handler-mapping half of this defect is fixed" (`:215-217`). It belongs here because this change is what makes it possible and because leaving it would let the residual case be misread the same way.
- **Stale diagnosis comments to correct:** `backend/stationkeep_e2e_helpers_test.go:204-220` (`arriveInOrbitAround`) states the origin is never guilty and cites the ring-4 case; `backend/fleet_wrong_state_rejection_e2e_test.go:88-95` explains why it targets a gate. Both remain useful, but the first is now wrong on the origin point.
- **Existing tests that pin the sentinel identity** and must stay green: `backend/fleet/star_destination_test.go:40` (the star traces to `ErrEndpointInsideClearance`), `backend/fleet/order_replace_and_retarget_test.go:199` (`ErrArcTooShort`), `backend/fleet/service_test.go:224` (`ErrUnknownBody`). If the service introduces fleet-level sentinels, they must wrap the `space` ones so these `errors.Is` checks keep holding.
- **Assert the body, not the status.** Pairwise-distinct reasons, and for the preview the same body as the commit. A status-only assertion passes against a handler that maps everything to one generic 409.
- **Arrangements that dock and then order** (`slice.spec.ts`, `space-journey.spec.ts`, `refuel-commit.spec.ts`'s `burnToSelectionAndDock`, and the Go e2e helpers) will still hit the origin-side refusal in affected home systems after this change unless Q2 is ruled in. They will then fail with a readable reason. Do not edit those fixtures beyond what this change's own tests need; record the residual.
- Where the signature lives: `frontend/playwright/.auth/backend.log`, not the Playwright report (`defect-station-order-500.md:219-241`). After the fix the refusal is no longer logged at error level, so the grep in that section stops finding it; update the record's "Where to look".

---

## 10. Open questions

Precedence for the orchestrator: design-input recommendation, then root `CLAUDE.md` / `openspec/project.md`, then panel, then most reversible.

**Q1. Which clamp mechanism: A (radial), B1 (far-side phase), B2 (nearest clear phase), or D (generator)?**
Recorded lean on clamping at all: Travis's choice, "Clamping the insertion point outward removes the most frequent backend red", and `defect-station-order-500.md:55-57`, "Should the standoff be clamped outward to the clearance radius rather than rejected, so a reachable body stays reachable at every orbital phase? That is a gameplay call, not only a numerical one — it changes where a fleet parks", with `:88-91`, "The first unblocks the gate; the second does not."
Recorded lean on the mechanism: **none anywhere.** The record's wording ("clamps outward to the clearance radius") reads most naturally as A, but it was written without the invariants in section 4 in view. B1 satisfies the stated purpose ("a reachable body stays reachable") and is the most reversible (one requirement, no stored shape). D is blocked by the fixture prohibition. Needs the architect.

**Q2. Is the origin side in this change?** A fleet docked at an affected station is refused departure 8.2% of the time in those systems, and reads as stranded during those seconds.
Recorded lean: **none anywhere**; the design input asserts the case cannot occur (`:28-30`). Options: (i) serve it as a typed refusal now and file the geometry (most reversible, keeps the cap); (ii) relax the origin guard or teach avoidance to ignore endpoints (a solver redesign, a second change); (iii) Option D later. **This needs information nobody in the repo has**: whether the clearance is meant as a place a fleet may never *be* (parks already sweep through it with no consequence) or only a place a burn may not *end*. That is Travis's gameplay call.

**Q3. If Q2 is (i), does the stranded indication change?** `fleet-movement:1179-1187` and `:1228` count a clearance failure as unreachable, which false-alarms when the origin is inside. Recorded lean: none. Leaving it is the smaller change; fixing it MODIFIES two large requirements.

**Q4. Status codes.** Recorded lean: `drift-fleet-wrong-state-500.md:58-70`, "`409 Conflict` + `{"error": ...}` for state-precondition and resource-insufficiency rejections ... `400 Bad Request` for request-shape errors"; `defect-zero-length-burn-returns-500.md:21`, "map it to a 4xx with a named reason on both routes"; and the handler's own statement at `handler.go:483-487` that 409 is "this capability's status for a rejection the request cannot be rewritten out of by fixing its syntax". A geometry refusal depends on the world at that instant, which points at 409 for clearance and minimum-arc. For an absent body id the code precedent is a reason-bearing 404 (`galaxy.ErrLaneNotFound`, `handler.go:588-593`; `ErrScanHostUnresolved`, `:553-558`); no handoff states it.

**Q5. One clearance reason or several?** `defect-station-order-500.md:58-59` says "the reason must be reason-bearing and distinguishable from the star case". **That conflicts with the live spec**: `fleet-movement:2416-2422` requires the star to be refused "with the same observable reason a committed order naming the star produces" with "no destination-identity comparison"; a reason that singles out the star needs to know the target is the star. The conflict dissolves only if the distinction is geometric (for example origin against destination, or body centre inside against standoff point inside). A station whose centre dips would then share the star's reason. Recorded lean beyond that quote: none. Flagged, not resolved.

**Q6. Log level for a refusal.** Recorded lean: `defect-station-order-500.md:36-38`, "logged at error level so genuine faults and ordinary geometry are mixed in the logs", and the security reviewer's scenario, "no 5xx is logged" (`lift-burn-preview-to-view-panel-security.md:69`). Both point at not logging refusals as errors.

**Q7. Is the absent-body target in scope?** It is the third sentinel on the same arm and the record asks for a sweep (`:124-126`, "should sweep every `space` sentinel reaching `respond`, not map them one at a time"). It is not named in any handoff. It costs about three tasks.

**Q8. Is `stop` in scope?** Same reasoning as Q7; the record names only `orders` and `orders/preview` (`:308-310`). Leaving it out leaves a known player-causable 500 on a sibling route.

**Q9. A machine-readable reason code in the body, or text only?** The frontend keys copy on text fragments today (`rejection-copy.ts`). Recorded lean: none. A new field is a wire addition; the run excludes `drift-commit-response-carries-no-delta-v.md` for being one, which suggests text only.

**Q10. May `fixtures/space/cases.json` be re-recorded on this machine?** The stated prohibition covers system-generation fixtures. `check.py` cross-checks `./space/` on amd64, which needs Rosetta locally. Recorded lean: none for the space family. Orchestrator's call.

**Q11. Residual wording.** For a body whose whole standoff circle is inside the clearance the refusal is transient (seconds). Should the copy say "try again shortly"? Recorded lean: none. UX.

---

## 11. Out of scope (record in the proposal)

- `defect-post-dock-burn-cost-drift.md`, `defect-post-sale-departure-burn-409s.md`, `defect-point-burn-serves-empty-bodyid.md` (section 1).
- `defect-spawn-system-single-body.md`, `defect-scan-journey-spawn-in-gate-range.md`, `defect-slice-sell-price-changed-409.md`, any change to `wakeNewCorp` or spawn-site pinning, `drift-commit-response-carries-no-delta-v.md` (excluded by the request).
- Making Burn unavailable toward the fleet's own host, and any stated reason beside a withheld or failed preview: `followup-explain-withheld-burn-command.md`.
- `defect-burn-cancels-running-mine.md` (the commit path cancelling a mine).
- A generator change so no body's standoff shell reaches the clearance (Option D), unless Q1 rules otherwise; blocked here by the fixture prohibition.
- Validation of an out-of-extent point target (unverified; file separately).
- Commands degrading for a fleet whose stored host no longer resolves (reads already degrade; commands still 500; a data fault, not player-causable).

## Files

- Design input: `/Users/travis/Projects/hexaverse/docs/handoffs/defect-station-order-500.md`, `/Users/travis/Projects/hexaverse/docs/handoffs/defect-zero-length-burn-returns-500.md`
- Solver: `/Users/travis/Projects/hexaverse/backend/space/burn.go`, `/Users/travis/Projects/hexaverse/backend/space/park.go`, `/Users/travis/Projects/hexaverse/backend/space/params_const.go`
- Fleet: `/Users/travis/Projects/hexaverse/backend/fleet/service.go`, `/Users/travis/Projects/hexaverse/backend/fleet/handler.go`, `/Users/travis/Projects/hexaverse/backend/fleet/fuel.go`
- Station and orbit laws: `/Users/travis/Projects/hexaverse/backend/system/station_continuous.go`, `/Users/travis/Projects/hexaverse/backend/system/params_continuous.go`, `/Users/travis/Projects/hexaverse/backend/system/continuous.go`
- Copy: `/Users/travis/Projects/hexaverse/frontend/lib/rejection-copy.ts`
- Specs: `/Users/travis/Projects/hexaverse/openspec/specs/space-kinematics/spec.md`, `/Users/travis/Projects/hexaverse/openspec/specs/fleet-movement/spec.md`
- Fixtures: `/Users/travis/Projects/hexaverse/fixtures/space/cases.json`, `/Users/travis/Projects/hexaverse/fixtures/system/cases.json`
- Tests to repair: `/Users/travis/Projects/hexaverse/backend/fuel_spawn_starting_fuel_e2e_test.go`, `/Users/travis/Projects/hexaverse/backend/stationkeep_e2e_helpers_test.go`

---

## 12. Addendum — after USER RULING 1

Written 2026-10-04 against `fix-burn-order-geometry-refusals-rulings.md`, USER RULING 1: "star clearance is a space that a fleet may never be." Same method as before: source reading plus a throwaway overlay probe from the scratchpad (31 seeds of `galaxy.GenerateStartArea` with `StartAreaParams`, 2,223 systems). Nothing regenerated, no stack booted, nothing edited but this file and its index. Each claim below is marked measured, derived (from code or arithmetic) or inferred.

**Supersedes:** section 4's option list as the geometric fix, section 5's table, section 7's `space-kinematics` delta, section 8's structure and size, and questions Q1, Q2, Q10 and Q11 of section 10. Sections 1, 2 (except the `space-kinematics:554` row), 3, 6 and 9 stand.

**One correction to section 5.** It names `fixtures/system/start-area.json`. That file does not exist; I misread a directory listing. The only start-area file is `frontend/public/galaxy/start-area.json` (galaxy id, seed, bounds, systems, lanes; no station orbit, no site-selection output).

### 12.1 The solver after the ruling

- **The guard stands as written (derived).** `backend/space/burn.go:281` refuses when the origin or the intercept is at or inside the clearance, and `space-kinematics/spec.md:419` / scenario `:456` say the same. Under the ruling both halves are correct: a burn may not end there, and a fleet that is there is in a state the game should not have produced. No edit to either.
- **Options A, B1 and B2 are out (derived, and consistent with the earlier measurement).** All three move only the arrival point. The settled park is still an orbit of radius `InsertionStandoff(station)` around the station, so it still sweeps inside the clearance; the 8.2% departure refusal rate is untouched by any of them. B1 and B2 are worse than neutral under the ruling: they would admit arrivals at stations the guard refuses today, putting more fleets inside the clearance, not fewer.
- **`fixtures/space/cases.json` is not re-recorded, and Q10 is moot, on one condition.** With no solver geometry change, `backend/space` needs no edit at all. The condition: the response-shape half must not split `space.ErrEndpointInsideClearance` into two sentinels to tell origin from destination. The `buildCurve` hand case records the error by name and the two sweeps digest it, so a renamed or split sentinel changes the file. If Q5 rules that the two cases carry distinct reasons, the distinction has to be made in `backend/fleet` (for example by testing the origin against the clearance before the solve and wrapping), not in `space`.

### 12.2 The predicate

A station's shell is three nested motions: the station around its parent planet at `local = MaxFeatureSize(parentType) + InsertionStandoff(that ceiling) + StationStandoff` (`system/station_continuous.go:43-45`); a docked fleet's park, a station-keeping hold, and a burn's intercept, all at distance `InsertionStandoff(station) = 2.5 + 1.5 * 0.9 = 3.85` from the station.

The triangle inequality bounds every one of those positions, at every phase and every inclination:

> `ContinuousRadius(parent.Ring) - local - InsertionStandoff(station)  >  StarClearanceRadius(StarSize(starClass))`

**Strict `>`**, because the guard refuses at `<=`. Every term is a galaxy-tier value (skeleton ring, body type, star class): no interior read, no clock.

The outcomes are a small enumerable set (derived): parent at ring 0 gives 10.15 and fails for every star class; ring 1 gives 15.67 and passes for M, K, G, F (clearances 13.0 to 15.5) and fails for A, B, O; ring 2 and beyond gives 22.46 or more and passes for all. The tightest passing margin is 0.17 (ring 1, F star), far above float rounding, so a calibration test can enumerate it.

**Measured:** over 587 systems that satisfy the predicate, arrival refusals 0 of 563,520 solves and departure refusals 0 of 563,520. The same predicate zeroes both, because the intercept and the park lie on the same circle.

### 12.3 The two placement mechanisms

| Axis | (a) Derivation: `system.StationContinuousOrbit` picks a clear parent | (b) Site selection: `corporations.qualify` rejects a home that fails the predicate |
| --- | --- | --- |
| (i) Fixtures and pinned outputs | **`fixtures/system/cases.json` changes**: the `stationOrbit` hand cases (7) and `stationOrbitSweep` (100,000 draws). The family's recorded inputs are galaxy seed, system id and body types only, with no ring and no star class, so the input schema itself must grow and the whole family is re-recorded. That is a system-generation fixture file: **the stop condition applies.** `fixtures/space/cases.json`, `fixtures/fleet/**`, `fixtures/galaxy/**` and `frontend/public/galaxy/start-area.json` unchanged | **None.** No generated output changes. There is no `fixtures/corporations/` and no site-selection pin under `fixtures/`. `frontend/public/galaxy/start-area.json` unchanged. What moves is test expectations in `backend/corporations/` (11 site-selection tests over fake graphs whose skeletons may not carry rings or a star class) |
| (ii) Live requirements | MODIFIED `trading-station/spec.md:138` *A Station's Continuous Orbit Is Derived, Never Rolled*: its input list ("system id, the live galaxy's seed, that system's skeleton body count, and its chosen parent's `galaxy.BodyType`") gains ring ordinals and star class, and the parent rule changes. The fallback branch becomes reachable (below), so its scenarios stop being about an unreachable case | `corporation-spawn/spec.md:122` *Home Site Selection*: a fourth qualification criterion. Either MODIFIED (49 lines, 17 scenarios to carry verbatim) or an ADDED requirement stating the criterion "in addition to" the three; the writer's call, flagged because `:133-136` enumerates "(a) ... (b) ... (c)" as the full list. No `trading-station`, `system-interior`, `space-kinematics` or `fleet-movement` movement |
| (iii) Zeroes both refusal rates | Yes for every station, existing and future, because the orbit is re-derived on every interior read (`system/service.go:206`) and never persisted. **Except** where no parent qualifies: 31 of 2,223 systems (1.39%, measured) have no clear parent and fall to the star-parented `StationFallbackRadius` of 40.0. That orbit clears the star (36.15 against 19.0) but sits between ring 2 (36.3) and ring 3 (44.7), so its shell overlaps a ring-2 planet's own standoff shell. That is new design work, not a constant tweak | Yes for every home selected after the change (measured 0 and 0, above). Not for a corporation already living in a failing home: healing reuses the recorded home (`corporation-spawn:160-162`, scenario "Healing reuses the recorded home") and `EnsureStation` is idempotent. Solo toy, no migration; the e2e emulator project is wiped per run, so only long-lived dev-emulator corps are exposed, and they get the typed refusal |
| (iv) Cost | 172 of 2,223 stations (7.7%, measured) move to a different parent. No system stops being spawnable. Station variety narrows to parents at ring 1 or beyond. Stations in inner systems sit farther out, so the spawn-to-station burn changes length; `corporation-spawn:390`'s sample test is the guard | **203 of 2,102 mineable systems (9.7%, measured) stop qualifying as homes.** The walk continues past a ring with no qualifier, so spawn still always succeeds. `MinSpawnDistance` and the reservation rule are untouched; the "one station per spawn home" rule is untouched. An account's pick can change, because the uniform draw runs over a smaller ring; that affects only tests that pin a specific home. The live seed's origin system (`sys_0_-1`, K star, parent at ring 8) passes, so the first corporation in a fresh world still takes the origin. Starting-fuel reachability is unchanged for a qualifying home |
| (v) Tasks and reversal | About 12, plus a fallback-orbit design question, **blocked on the fixture stop.** Reversal: revert and re-record the same family again | About 10 (a pure predicate in `system` with its calibration tests; the criterion and its walk tests in `corporations`; the spec delta). Reversal: delete one criterion; homes already recorded stay valid either way |

**Checks the orchestrator asked for on (b):**

- **Layering (derived):** no violation. `backend/corporations` already imports `system` and `space` (`spawn_position.go:4-5`). The predicate should live in `system` as one exported pure function beside `StationContinuousOrbit`, so the station's radius law has one owner; `selectSpawnSite` already reads the galaxy document (`LiveGalaxyMeta`), which carries `Seed`.
- **Is selection the only path that mints a station (derived):** yes in production. `stations.EnsureStation` has one non-test caller, `corporations/service.go:388`, reached from spawn and from healing with the recorded home; the home is only ever chosen by `selectSpawnSite` (`service.go:560`). `trading-station:62` *Stations Exist Only At Spawn Homes* is the live rule. Tests in `stations/` and `market/` call `EnsureStation` on arbitrary ids; those are arrangements, not a mint path.
- **Healing through `GET /me` (derived):** reuses the recorded home and never re-runs selection, so (b) changes nothing for an existing corporation.

### 12.4 Every way a fleet can be at or inside the clearance today

| Path | Status | Recommendation | Basis |
| --- | --- | --- | --- |
| Park orbit or station-keeping hold at a station whose shell dips | Happens today (8.9% of systems) | **Close** by placement | USER RULING 1 |
| Burn intercept at such a station | Refused by the guard, as a 500 | Closed by placement; the refusal is typed for any pre-existing home | USER RULING 1; `defect-station-order-500.md:308-310` |
| Spawn park | Clear by construction (derived): radius `Extent * GateRadiusFactor`, and `SeedFleet` refuses inside (`fleet/service.go:1791`) | Nothing to do | `fleet-movement:572`, `corporation-spawn:384` |
| Jump-arrival park near a gate | Clear by construction (derived): gates sit at `1.1 * Extent`, standoff 4.3 (`fleet/resolver.go:362`) | Nothing to do | `system-body-table` *A Gate Sits Outside Every Generated Orbit* |
| Park orbit at a **non-station** body whose shell dips | Happens: a ring-0 rocky planet around an O star (24.0 minus up to 6.1 against 19.0). Measured 5 bodies in 5 of 2,223 systems (0.22%). The guard refuses only when the fleet-facing point dips; an arrival on the outer side is accepted and the park then sweeps inside | **Leave filed; new product call (12.5)** | no recorded lean |
| Mid-burn position | Kept outside at 33 sampled points (`space-kinematics:419`); the fixture records zero violations. A sampled guarantee, not a continuous one (inferred) | Leave | `space-kinematics:419` |
| Drift after a cut drive | A drift is a straight line at constant velocity with no clearance check; a cut while heading starward coasts through the clearance, and through the star | **Typed refusal for the orders that follow; file the drift itself** | no recorded lean |
| Stop in place while drifting inside at or below the speed floor | The free branch writes a point park at the current position (`fleet/service.go:1299-1336`) with no clearance check, so a fleet can come to rest inside | **File**, with the drift | no recorded lean |
| Stop in place above the floor, origin or lead point inside | Refused by the guard, as a 500 | Typed refusal (section 7) | section 3 |
| Point-target burn to a point inside | Refused by the guard, as a 500 | Typed refusal | `system-space-view:869-876` |

A consequence worth stating: because the guard also refuses on the origin, a fleet that does get inside by drifting cannot burn out. It can only keep drifting, or stop and stay. That is the guard working as the ruling describes, and it is also the reason the drift path needs its own decision.

### 12.5 Non-station bodies and the whole-circle case

- **The whole-circle case disappears (derived).** The one instance measured in section 4 was a station. A station that passes the predicate has its whole shell outside by a margin, and every star-parented body sits at 24.0 or more, beyond the largest clearance of 19.0, so no generated body's entire standoff circle can be inside.
- **Non-station bodies are not settled by the ruling.** For a star-parented planet the shell's inner edge is a constant, `radius - standoff`, so a ring-0 planet around an O star dips permanently, not by phase. The ruling says a fleet may never be inside; today's guard does not enforce that for such a planet, because it tests one point of the circle at one instant. A typed refusal on the facing-side dip is consistent with the ruling but incomplete: outer-side arrivals still dock, and the park sweeps inside.
- **So "typed refusal is the permanent, correct answer" does not follow from the ruling.** It follows only for the star and for point targets. For a dipping planet the ruling implies one of two things, and choosing is a product call with no recorded basis: either the planet is undockable, and therefore unmineable, forever (a solver rule refusing any body whose park circle would reach the clearance, which changes `space` and re-records `fixtures/space/cases.json`), or the generator never produces it (a `BaseOrbitRadius` or star-size change, which re-records the system-generation fixtures). Both are blocked by the fixture stops in this run. Recommend filing it as its own defect record, with the 0.22% figure, and serving the typed refusal meanwhile.

### 12.6 Revised change structure

One change, `fix-burn-order-geometry-refusals`: the response-shape half exactly as section 7 states it (one ADDED `fleet-movement` requirement, three sentinels on `orders`, `orders/preview` and `stop`) plus the placement mechanism. No `space-kinematics` delta. No edit under `backend/space`.

| Group, assuming mechanism (b) | Tasks |
| --- | --- |
| `system`: the pure predicate, a calibration test enumerating the ring-by-class margins, a test that it uses the derivation's own local radius | 3 |
| `corporations`: the criterion, an excluded-candidate test, a ring-with-no-qualifier test (walk continues), determinism, repairs to existing fake-graph tests | 6 |
| A `space`-level test, no code change: a qualifying system has zero arrival and departure refusals across a phase sweep | 1 |
| `fleet` handler and service tests | 9 |
| `fleet` implementation | 4 |
| Frontend copy and tests | 3 |
| Test repairs (section 9) | 4 |
| Records, including the two new filings from 12.4 and 12.5 | 4 |
| Validation and gates | 4 |
| **Total** | **38** |

Inside the cap, narrowly. **Seam, geometry first:** link 1 is placement alone (10 tasks, `corporation-spawn` only, no fixture) and is what removes the red runs for newly spawned corporations; link 2 is the response shape (about 28). Link 1 is small enough that splitting costs more ceremony than it saves unless the panel adds work.

With mechanism (a) the total is about 40 and the change cannot be completed in this run at all.

**Panel:** architect (where the predicate lives, the criterion's effect on the walk, the fleet-level sentinel design under the 12.1 condition), reliability (error budget, log level, what remains red after the fix), ux (copy). Security as a light pass, unchanged. **dba: still not needed.** Neither mechanism changes a stored shape: (b) adds no field to the corporation document or `spawnClaims`, and (a)'s orbit is never persisted.

**Open questions, revised.**

- **Q1 (solver mechanism): moot.** Replaced by Q12.
- **Q2 (origin side): answered** by USER RULING 1.
- **Q3 (stranded false alarm): narrowed.** With placement it can no longer occur at a station. It remains for a fleet docked at a dipping planet or drifting inside. No recorded lean; recommend leaving `fleet-movement:1145` and `:1228` unmodified and noting it in the 12.5 filing.
- **Q4 (status codes): stands,** leans unchanged.
- **Q5 (one clearance reason or several): stands,** with the added constraint from 12.1 that any distinction is made in `fleet`, not by splitting the `space` sentinel. The conflict between `defect-station-order-500.md:58-59` and `fleet-movement:2416-2422` is still unresolved.
- **Q6, Q7, Q8, Q9: stand,** leans unchanged.
- **Q10 (re-record the space fixture here): moot,** subject to the 12.1 condition.
- **Q11 (residual wording): changed.** No clearance refusal is transient for a station any more, so "try again shortly" copy is wrong for the common case. It remains transient only for a pre-existing home. UX.
- **Q12 (new). Mechanism (a) or (b).** Recorded lean: the rulings file leaves it "a separate ruling, pending the analyst's addendum". The fixture stop in that same file excludes (a) for this run.
- **Q13 (new). Dipping non-station bodies** (12.5). No recorded lean. A product call.
- **Q14 (new). Drifting or stopping inside the clearance** (12.4). No recorded lean. A product call; the ruling says the state is forbidden and says nothing about which verb must prevent it.
- **Q15 (new). Corporations already living in a failing home** under (b). Lean: `CLAUDE.md` memory "solo toy, no backcompat" and the launching constraint "no migrations or compat shims" both say leave them.
- **Q16 (new). MODIFIED or ADDED on `corporation-spawn:122`.** Writer and validator; no product content.

### 12.7 Recommendation

**Mechanism (b), site selection.**

1. It satisfies the ruling for stations at both endpoints, measured: zero arrival and zero departure refusals in qualifying systems.
2. It changes no fixture and no generated output, so neither fixture stop is reached. Mechanism (a) cannot be finished in this run.
3. It is the most reversible: one criterion, about ten tasks, no stored shape.
4. It leaves `trading-station:138` and the station derivation alone. Mechanism (a) makes the fallback orbit reachable in 1.39% of systems, and that orbit overlaps a ring-2 planet's shell; fixing that is unscoped design.

What (b) costs, plainly: 9.7% of otherwise-eligible systems can never be a home; a corporation already in a failing home is not repaired; and the rule that keeps stations clear of the star lives in spawn selection, one step removed from the derivation that creates the problem. Mechanism (a) is the more direct fix and repairs existing homes for free, and it is the better long-term shape if the system fixture family can be re-recorded with the amd64 cross-check. One observation relevant to that, reported and not acted on: `fixtures/system/cases.json`'s own `_meta` stamp says it was recorded on arm64, re-recorded under `GOARCH=amd64 GOAMD64=v1`, and found byte-identical, which suggests the divergence behind the prohibition may already be fixed. Whether that lifts the stop is not mine to decide.

**New product calls with no recorded basis:** Q13 (dipping planets: undockable forever, or generated away) and Q14 (drift and stop inside the clearance). Neither blocks this change; both should be filed by it.
