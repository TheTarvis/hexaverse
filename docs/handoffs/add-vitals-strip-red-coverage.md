# `add-vitals-strip` — red-phase coverage table

SDET red handoff. Basis: the four spec deltas at verdict commit `aa21687`
(`openspec/changes/add-vitals-strip/specs/{system-console,system-space-view,
docked-fleet-actions,figure-formatting}/spec.md`), the implementation
contract (`add-vitals-strip-impl-contract.md`), the rulings doc (RULINGS
1-28), and the three adversary rounds with their appended orchestrator
rulings.

**Status legend**

- `assertion-red` — a real assertion fails today against the missing/
  incomplete production surface; confirmed by running the suite (see §3).
- `compile-red` — the test file itself does not type-check / resolve an
  import yet (the module doesn't exist); confirmed via `tsc --noEmit` and a
  `vitest run` showing "Failed to resolve import" rather than an assertion.
  Every file in this change that is compile-red is *also* assertion-red for
  its individual `it()`s once vitest reports per-test failures (vitest
  reports a failed suite, not per-test compile errors, for a missing
  import) — noted per file in §3.
- `already-green` — the scenario's behaviour is already correct against the
  CURRENT tree and the test passes today, with the reason it is still a
  legitimate, non-vacuous regression guard for this change (most commonly:
  RULING 17's testid inheritance, or a pre-existing, unmodified surface this
  change's spec delta merely reproduces verbatim).
- `Playwright, deferred` — provable only end to end; written at the archive
  gate against the real, built UI (`docs/testing-tiers.md`).
- `reasoned-not-automated` — not automated, with the reason stated.

Every test file this table cites was executed; §3 records the run output
that shows each red group failing for the right reason.

---

## 1. `system-console` (14 requirements, 71 scenarios)

### 1.1 The Vitals Strip Is Present on Every Render of the System Space View (6)

| Scenario | Test | Level | Status |
|---|---|---|---|
| The strip renders with every read resolved | `VitalsStrip.test.tsx` › "always present" › *The strip renders with every read resolved* | unit | assertion-red |
| The strip survives a failed interior read | `SystemSpaceView.test.tsx` › "the vitals strip is mounted…" › *The strip survives a failed interior read* — VitalsStrip's own props (contract §7.2) carry no interior read at all, so this is provable only at the mounting view | integration | assertion-red |
| The strip survives a failed own-fleets read | `VitalsStrip.test.tsx` › *The strip survives a failed own-fleets read* + `SystemSpaceView.test.tsx` › *…failed own-fleets read, with no error or retry of its own* | unit + integration | assertion-red |
| The strip survives an unavailable renderer | `SystemSpaceView.test.tsx` › *The strip survives an unavailable renderer* — same reasoning as the interior case | integration | assertion-red |
| With no acting fleet the fleet-scoped figures read absent and the chevron stays | `VitalsStrip.test.tsx` › *With no acting fleet…* | unit | assertion-red |
| A requester owning no fleet at all still gets the strip | `VitalsStrip.test.tsx` › *A requester owning no fleet at all…* | unit | assertion-red |

### 1.2 The Strip Carries No Verb (3)

| Scenario | Test | Level | Status |
|---|---|---|---|
| A docked fleet's strip offers no trade verb | `VitalsStrip.test.tsx` › "no verb" › *A docked fleet's strip offers no trade verb* | unit | assertion-red |
| A burning fleet's strip offers no burn-ending verb | `VitalsStrip.test.tsx` › *A burning fleet's strip offers no burn-ending verb* | unit | assertion-red |
| The chevron is the strip's only interactive element | `VitalsStrip.test.tsx` › *The chevron is the strip's only interactive element* + `VitalsStripFleetCell.test.tsx`'s own companion | unit | assertion-red |

### 1.3 The Fleet Cell Names the Acting Fleet and Delegates a Switch to the Mounting View (9)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Choosing a fleet in this system sets it acting | `VitalsStripFleetCell.test.tsx` › "choosing an entry delegates…" › *Choosing a fleet in this system sets it acting…* | unit | assertion-red |
| Focus and the chevron's own label confirm a same-system switch | `VitalsStripFleetCell.test.tsx` › *Focus and the chevron's own label confirm a same-system switch* | unit | assertion-red |
| Choosing a fleet in another system navigates there | `VitalsStripFleetCell.test.tsx` › *Choosing a fleet in another system navigates there…* (asserts the delegate is called with the correct fleet — the callback itself, `SystemSpaceView.selectFleet`, is pre-existing and covered by `SystemSpaceView.test.tsx`'s "roster cross-navigation" describe, unmodified) | unit | assertion-red |
| Choosing a fleet out on a lane navigates to the galaxy view | `VitalsStripFleetCell.test.tsx` › *Choosing a fleet out on a lane navigates to the galaxy view…* | unit | assertion-red |
| The chevron's menu lists every fleet the requester owns | `VitalsStripFleetCell.test.tsx` › "chevron menu membership" › *The chevron's menu lists every fleet the requester owns…* | unit | assertion-red |
| A sole owned fleet leaves the chevron's menu with one entry | `VitalsStripFleetCell.test.tsx` › *A sole owned fleet leaves the chevron's menu with one entry* | unit | assertion-red |
| The chevron survives the no-acting-fleet state | `VitalsStripFleetCell.test.tsx` › "identity" › *The chevron survives the no-acting-fleet state…* | unit | assertion-red |
| A menu entry names its fleet's system before it navigates | `VitalsStripFleetCell.test.tsx` › *A menu entry names its fleet's system before it navigates…* | unit | assertion-red |
| A failed own-fleets refetch empties the menu rather than freezing it | `VitalsStripFleetCell.test.tsx` › *A failed own-fleets refetch empties the menu rather than freezing it* | unit | assertion-red |

### 1.4 The Fleet Cell's Chevron and Menu Are Keyboard-Operable (3)

| Scenario | Test | Level | Status |
|---|---|---|---|
| The chevron opens from the keyboard | `VitalsStripFleetCell.test.tsx` › "keyboard operability" › *The chevron opens from the keyboard…* | unit | assertion-red |
| Menu entries are reachable and selectable from the keyboard | `VitalsStripFleetCell.test.tsx` › *Menu entries are reachable and selectable from the keyboard…* | unit | assertion-red |
| Escape closes the menu without choosing | `VitalsStripFleetCell.test.tsx` › *Escape closes the menu without choosing and returns focus to the chevron* | unit | assertion-red |

### 1.5 The Fleet Cell's State Pill Is a Projection of the Shared Roster Derivation (19)

| Scenario | Test | Level | Status |
|---|---|---|---|
| A docked fleet at a lane gate names its destination system | `VitalsStripPill.test.tsx` › "rendered ladder" › *A docked fleet at a lane gate names its destination system…*; label resolution correctness pinned in `roster-status.test.ts` › "hostLabel" › *a laneGates hit names Gate plus the resolved destination system name* | unit | assertion-red |
| A docked fleet at a feature names its type and served id | `VitalsStripPill.test.tsx` › *A docked fleet at a feature names its type and served id…*; `roster-status.test.ts` › *a features hit names its served type word and served id* | unit | assertion-red |
| A burning fleet's pill counts down to its served arrival, naming a body target by type and id | `VitalsStripPill.test.tsx` › *A burning fleet's pill counts down…naming a body target by type and id…* (asserts against an invented name and a type-word drop); `roster-status.test.ts` › targetLabel "a burn toward a features entry…" | unit | assertion-red |
| A burn toward a lane gate names the gate's destination system | `VitalsStripPill.test.tsx` › *A burn toward a lane gate names the gate's destination system…*; `roster-status.test.ts` › targetLabel "a burn toward a laneGates entry…" | unit | assertion-red |
| An unresolvable burn target degrades the pill, it does not blank it | `VitalsStripPill.test.tsx` › "degradation" › *An unresolvable burn target degrades the pill…*; `roster-status.test.ts` › *a burn target matching neither collection degrades to the raw body id* + *a failed interior read (no resolveBody supplied)…* | unit | assertion-red |
| A station-keeping fleet's pill shows the served upkeep rate | `VitalsStripPill.test.tsx` › "rendered ladder" › *holding -> "Holding" + vitals-pill-rate…* | unit | assertion-red |
| A mining fleet's pill counts down to the run's ETA | `VitalsStripPill.test.tsx` › *mining -> "Mining" + vitals-pill-eta* | unit | assertion-red |
| A burn toward a point in space names the point, not an empty target | `VitalsStripPill.test.tsx` › "degradation" › *A burn toward a point in space names the point…*; `roster-status.test.ts` › targetLabel "a point target…named 'a point in space'…" | unit | assertion-red |
| An idle, undocked fleet's pill reads on station | `VitalsStripPill.test.tsx` › "rendered ladder" › *onstation -> "On station"…* | unit | assertion-red |
| A drifting fleet's pill reads drifting | `VitalsStripPill.test.tsx` › *drifting -> "Drifting"…* | unit | assertion-red |
| A fleet mid-jump's pill counts down to its lane arrival | `VitalsStripPill.test.tsx` › *transit -> "In transit" + vitals-pill-eta* | unit | assertion-red |
| An unserved rate degrades the holding pill, it does not blank it | `VitalsStripPill.test.tsx` › "degradation" › *An unserved rate degrades the holding pill…* | unit | assertion-red |
| The pill's countdown and rate read absent until a scale is served | `VitalsStripPill.test.tsx` › "countdown and rate absent before scale" › both tests | unit | assertion-red |
| The countdown advances between reads | `VitalsStripPill.test.tsx` › "countdown advances" › *The countdown advances between reads…* | unit | assertion-red |
| No second derivation of fleet state exists in the strip | `VitalsStripPill.test.tsx` › "no second derivation" (structural, same-status-two-worldTimes) + whole-tree enforcement in `lib/format/guards.test.ts` ("no component-local duration formatter", already-green today and re-run at integrity check to confirm `VitalsStripPill.tsx`/`VitalsStripFleetCell.tsx`/`VitalsStrip.tsx`/`Gauge.tsx` introduce no `countdown`/`formatEta`) | unit + whole-tree static | assertion-red (new component) / already-green (guard mechanism) |
| The pill is a function of the derivation's output alone | `VitalsStripPill.test.tsx` › "the property test" › *The pill is a function of the derivation's output alone…* + its own vacuity guard (SDET-added, asserts the fixtures are not the degenerate `null,null` case) | unit | assertion-red |
| A failed refetch retires the pill rather than freezing it | `VitalsStripPill.test.tsx` › "failed refetch retires the pill" | unit | assertion-red |
| A docked fleet at an unresolvable host degrades the pill, it does not blank it | `VitalsStripPill.test.tsx` › "degradation" › *A docked fleet at an unresolvable host…*; `roster-status.test.ts` › hostLabel "an attachedTo id matching neither collection…" + "with no resolveBody supplied at all…" | unit | assertion-red |
| A stranded fleet shows the marker alongside its activity pill | `VitalsStripPill.test.tsx` › "stranded marker" › *A stranded fleet shows the marker alongside its activity pill…* (all seven states) | unit | assertion-red |

### 1.6 The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge (4)

| Scenario | Test | Level | Status |
|---|---|---|---|
| The fuel cell shows tonnage and range | `VitalsStrip.test.tsx` › "fuel cell" › *The fuel cell shows tonnage and range…* | unit | assertion-red |
| An unserved roster reads absent, and the gauge shows no fill | `VitalsStrip.test.tsx` › *An unserved roster reads absent…* | unit | assertion-red |
| A fleet holding no fuel reads absent, exactly as its roster row does | `VitalsStrip.test.tsx` › *A fleet holding no fuel reads absent…* (asserts `data-gauge-state` is `no-data`, never `empty`) | unit | assertion-red |
| The gauge's no-data state is DOM-distinguishable from a sub-pixel fill | `VitalsStrip.test.tsx` › *The gauge's no-data state is DOM-distinguishable from a sub-pixel fill* + `Gauge.test.tsx` › the atom-level equivalent (0.05t/200t) | unit | assertion-red |

### 1.7 While Burning, the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain (2)

| Scenario | Test | Level | Status |
|---|---|---|---|
| A burning fleet's fuel cell is marked as draining | `VitalsStrip.test.tsx` › "while burning" › *A burning fleet's fuel cell shows a visible draining marker* | unit | assertion-red |
| The figure moves only when a read lands | `VitalsStrip.test.tsx` › *The figure moves only when a read lands…* | unit | assertion-red |

### 1.8 The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented Gauge (6)

| Scenario | Test | Level | Status |
|---|---|---|---|
| The hold cell shows contents and capacity | `VitalsStrip.test.tsx` › "hold cell" › *The hold cell shows contents and capacity…* | unit | assertion-red |
| An empty hold shows no segments and its served free figure | `VitalsStrip.test.tsx` › *An empty hold shows no segments and its served free figure* | unit | assertion-red |
| An unloaded roster reads as absent, never `0 / 0 t` | `VitalsStrip.test.tsx` › *An unloaded roster reads as absent, never `0 / 0 t`* | unit | assertion-red |
| The segmentation is legible without colour | `VitalsStrip.test.tsx` › *The segmentation is legible without colour…* + `Gauge.test.tsx`'s own decorative-atom describe | unit | assertion-red |
| The hold cell visibly fills when a mine run resolves | `VitalsStrip.test.tsx` › *The hold cell visibly fills when a mine run resolves…* | unit | assertion-red |
| The gauge's no-data and no-segments states are DOM-distinguishable | `VitalsStrip.test.tsx` › *The gauge's no-data and no-segments states are DOM-distinguishable* + `Gauge.test.tsx`'s own no-data/empty describe | unit | assertion-red |

### 1.9 The Credits Cell Shows the Corporation's Served Balance and Announces Its Changes (7)

| Scenario | Test | Level | Status |
|---|---|---|---|
| The strip shows the current credit balance | `VitalsStrip.test.tsx` › "credits cell" › *The strip shows the current credit balance…* | unit | assertion-red |
| An unavailable balance reads as unavailable, not as a figure | `VitalsStrip.test.tsx` › *An unavailable balance reads as unavailable, not as a figure* | unit | assertion-red |
| A stale session read is never presented as a current balance | `SystemSpaceView.test.tsx` › "vitals strip" › *a session that resolved once and has since failed to refresh reads Unavailable…* (the `useCorporationSessionOptional`-driven `creditsShown` derivation lives in `SystemSpaceView`, not `VitalsStrip` — contract §6.3) + `corporation-provider.test.tsx` › *a session that resolved once and has since failed to refresh…* (the hook itself) + `VitalsStrip.test.tsx`'s own SDET companion (the mechanical half: `credits` flipping to `null` on a rerender) | unit + integration | assertion-red |
| The balance visibly updates when a sale resolves | `VitalsStrip.test.tsx` › *The balance visibly updates when a sale resolves* + `SystemSpaceView.test.tsx` › *A successful sale refreshes hold and balance — landing on the strip…* (the wiring) | unit + integration | assertion-red |
| The balance visibly updates when a refuel resolves | `VitalsStrip.test.tsx` › *The balance visibly updates when a refuel resolves* + `SystemSpaceView.test.tsx` › *A successful refuel refreshes hold, range, and balance…* | unit + integration | assertion-red |
| A balance change is announced to assistive technology | `VitalsStrip.test.tsx` › *A balance change is announced to assistive technology…* | unit | assertion-red |
| A transition to or from an unavailable balance is announced | `VitalsStrip.test.tsx` › *A transition to or from an unavailable balance is announced…* | unit | assertion-red |

### 1.10 The Clock Cell Shows the Absolute World Instant at Its Served Scale (6)

| Scenario | Test | Level | Status |
|---|---|---|---|
| The clock reads `T+ Dd HH:MM ×N` with its raw value | `VitalsStrip.test.tsx` › "clock cell" › *The clock reads T+ Dd HH:MM ×N with its raw value* | unit | assertion-red |
| With no world time ever served, the whole stamp reads absent | `VitalsStrip.test.tsx` › *With no world time ever served, the whole stamp reads absent…* | unit | assertion-red |
| The suffix carries its accessible explanation | `VitalsStrip.test.tsx` › *The suffix carries its accessible explanation* | unit | assertion-red |
| With no served scale the stamp still renders, with `×—` | `VitalsStrip.test.tsx` › *With no served scale the stamp still renders, with ×—* | unit | assertion-red |
| The stamp advances between reads | `VitalsStrip.test.tsx` › *The stamp advances between reads…* | unit | assertion-red |
| With no served scale, the stamp holds rather than advancing | `VitalsStrip.test.tsx` › *With no served scale, the stamp holds rather than advancing…* + its "re-renders at the NEWEST served instant" companion | unit | assertion-red |

### 1.11 The Strip Issues No Read of Its Own (1)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Rendering the strip issues no request | `VitalsStrip.test.tsx` › "issues no read of its own" › *Rendering the strip issues no request* (spies on `globalThis.fetch`, throws if called) | unit | assertion-red |

### 1.12 Activating the Strip Changes No Space-View Selection (2)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Clicking a strip cell leaves the selection unchanged | `SystemSpaceView.test.tsx` › "vitals strip" › *Clicking a strip cell leaves the selection unchanged* (`selection` is `SystemSpaceView`'s own state — provable only there); `VitalsStrip.test.tsx`'s structural companion (`VitalsStripProps` carries no selection callback at all) | unit + integration | assertion-red |
| Switching the acting fleet leaves the selection unchanged | `SystemSpaceView.test.tsx` › *Switching the acting fleet leaves the selection unchanged* | integration | assertion-red |

### 1.13 The Strip Announces Only Its Own Balance Changes (1)

| Scenario | Test | Level | Status |
|---|---|---|---|
| A landing is announced exactly once | `VitalsStrip.test.tsx` › "announces only its own balance changes" › *A landing is announced exactly once* — structural: exactly one `[aria-live]`/`[role=status]`/`[role=alert]` element exists in the strip's subtree, and it is `balance-live-region` | unit | assertion-red |

### 1.14 The Strip Is Laptop-First and Never Overflows the View (2)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Every cell is inside the viewport at 1280×720 | — (jsdom computes no real CSS layout — `getBoundingClientRect` is a hand-mocked constant elsewhere in this repo's suites, never a genuine box model — so overflow/containment at a specific viewport is provable only against the real rendered stack) | e2e | Playwright, deferred |
| No other floating surface covers a strip cell | — (same reason: the command column / camera cluster / `sightings-unavailable` overlap claim is a geometry question jsdom cannot answer) | e2e | Playwright, deferred |

**system-console subtotal: 71/71 scenarios accounted for** — 69 with a vitest test (assertion-red or compile-red-then-assertion-red), 2 `Playwright, deferred`.

---

## 2. `system-space-view` (3 requirements MODIFIED, 28 scenarios)

Most of this delta's scenario text is **pre-existing behaviour reproduced
verbatim** (RULING 16's "the requirement is MODIFIED anyway; the correction
rides in the same body", and the *Space View Camera…* MODIFIED block's own
statement that "its seven existing scenarios are reproduced verbatim").
`already-green` below means exactly that: the scenario is unchanged by this
delta and its existing test continues to pass unedited.

### 2.1 System Space View Route and Data Fan-In (15)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Loading state before data arrives | `SystemSpaceView.test.tsx` › *Loading state before data arrives* | integration | already-green (pre-existing, unedited) |
| The own-fleets read is the corporation-scoped one | `SystemSpaceView.test.tsx` › *The own-fleets read is the corporation-scoped one* | integration | already-green |
| The view reads the open system's station and the market board | `SystemSpaceView.test.tsx` › *The view reads the open system's station and the market board* — **NEW test**: this scenario had no prior coverage anywhere in the frontend suite (a pre-existing gap, not introduced by this change); closed here, and passes against the current tree | integration | already-green (gap closed by this red phase) |
| The station-anchored controls are driven by the view's own reads | `SystemSpaceView.test.tsx` › *The panel shows the current credit balance (the view sources it, not the panel)* + *sell is offered against the station the view read…* | integration | already-green |
| An arrived fleet reads as arrived on both the canvas and the roster | `SystemSpaceView.test.tsx` › *An arrived fleet reads as arrived on both the canvas and the roster* | integration | already-green |
| A failed interior read shows a retriable error in the canvas region | `SystemSpaceView.test.tsx` › *A failed interior read shows a retriable error in the canvas region* | integration | already-green |
| A failed interior read leaves the fleet-state-anchored commands usable | `SystemSpaceView.test.tsx` › *A failed interior read leaves the fleet-state-anchored commands usable* | integration | already-green |
| A failed interior read withdraws the mine offer without misreporting the body | `SystemSpaceView.test.tsx` › *A failed interior read withdraws the mine offer without misreporting the body* | integration | already-green |
| A failed own-fleets read shows a retriable error in the fleet panel | `SystemSpaceView.test.tsx` › *A failed own-fleets read shows a retriable error in the fleet panel* | integration | already-green |
| A failed station read withdraws the station-anchored offers without misreporting the system | `SystemSpaceView.test.tsx` › *A failed station read withdraws the station-anchored offers…* — **NEW test**, same pre-existing-gap note as above | integration | already-green (gap closed) |
| A system with no station shows no station error | `SystemSpaceView.test.tsx` › *A system with no station shows no station error* — **NEW test** | integration | already-green (gap closed) |
| A failed market-board read withdraws the sell offer but not the refuel offer | `SystemSpaceView.test.tsx` › *A failed market-board read withdraws the sell offer but not the refuel offer* — **NEW test** | integration | already-green (gap closed) |
| An unresolved credit balance withdraws the readout, not the verbs | `SystemSpaceView.test.tsx` › *An unresolved credit balance withdraws the readout, not the verbs* — **NEW test** | integration | assertion-red (the `useCorporationSessionOptional`-driven distinction does not exist on the current tree; `sell-section`/`refuel-section` presence already passes, `balance-value`'s `data-available="false"` does not) |
| Loading persists through first frame after data arrives | `SystemSpaceView.test.tsx` › *Loading persists through first frame after data arrives* | integration | already-green |
| An unsupported rendering context takes precedence over the loading placeholder | `SystemSpaceView.test.tsx` › *An unsupported rendering context takes precedence over the loading placeholder* | integration | already-green |

### 2.2 Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point (3)

RULING 16's correction ("the acting fleet has three setters… none of them
adds the fleet to this selection") is a sentence, not new scenario
behaviour; its own three scenarios are reproduced verbatim and untouched.

| Scenario | Test | Level | Status |
|---|---|---|---|
| Re-selecting the same body deselects it | `space-selection.test.ts` › *Re-selecting the same body deselects it* | unit (pure fn) | already-green |
| Selecting a point replaces a body selection | `space-selection.test.ts` (the same `toggleSelection` fixture covers body→point) | unit (pure fn) | already-green |
| Clicking beyond the pick radius clears the selection | `SpaceStage.interaction.test.tsx` › *A click beyond the pick radius still clears the selection after camera movement* (rewritten for the shrink, §3 below) proves the DOM behaviour; the underlying pick-radius clamp is `space-camera.test.ts`'s pure-function subject | unit | already-green |

### 2.3 Space View Camera Is Keyboard-Operable (10)

This requirement is MODIFIED by this change (RULING 10) — the camera
cluster shrinks to four cells and keyboard pan moves onto `camera-orbit`.
Seven scenarios are reproduced verbatim from the pre-shrink text (mechanism
changes, claim doesn't); three are new to this MODIFIED block.

| Scenario | Test | Level | Status |
|---|---|---|---|
| Arrow keys orbit the camera | `SpaceStage.interaction.test.tsx` › *Arrow keys orbit the camera* — untouched by the shrink (bare arrows on `camera-orbit`, unchanged from the old wrapper's own handler) | unit | already-green |
| Pan keys translate the camera's target | `SpaceStage.interaction.test.tsx` › *Pan keys translate the camera's target* — **rewritten**, `Shift`+ArrowRight on `camera-orbit` | unit | assertion-red |
| A keyboard-only player can pan to a point away from the star | `SpaceStage.interaction.test.tsx` › *A keyboard-only player can pan to a point away from the star* — **rewritten** | unit | assertion-red |
| Zoom keys zoom the camera | `SpaceStage.interaction.test.tsx` › *Zoom keys zoom the camera* — untouched (zoom buttons unchanged) | unit | already-green |
| A focused camera control shows a focus indicator | `SpaceStage.interaction.test.tsx` › *A focused camera control shows a focus indicator* — untouched (asserted against `camera-zoom-in`, not a deleted button) | unit | already-green |
| Focus moving to an off-screen glyph brings it into view | `SpaceStage.interaction.test.tsx` › *Focus moving to an off-screen glyph brings it into view* — untouched | unit | already-green |
| Keyboard input at a clamp is distinguishable from no input | `SpaceStage.interaction.test.tsx` › *Keyboard input at a clamp is distinguishable from no input* — **rewritten**, `data-pan-at-limit`/`data-orbit-at-limit` on `camera-orbit` | unit | assertion-red |
| A pan limit is still observable while the camera is also at the zoom clamp | `SpaceStage.interaction.test.tsx` › *A pan limit is still observable while the camera is also at the zoom clamp* — **new** | unit | assertion-red |
| The camera group's accessible description names the pan binding | `SpaceStage.interaction.test.tsx` › *The camera group's accessible description names the pan binding* — **new** | unit | assertion-red |
| The on-screen cluster renders exactly four camera cells | `SpaceStage.interaction.test.tsx` › *The on-screen cluster renders exactly four camera cells* — **new** | unit | assertion-red |

**system-space-view subtotal: 28/28 scenarios accounted for** — 21
already-green (14 in §2.1 fan-in + 3 in §2.2 toggle-to-deselect + 4 in §2.3
camera), 7 assertion-red (1 in §2.1 — the credits-staleness scenario + 6 in
§2.3 — the two rewritten pan tests, the rewritten at-limit test, and the
three brand-new scenarios this MODIFIED block adds). The per-row counts
above are authoritative; this line is their sum.

---

## 3. `docked-fleet-actions` (5 requirements, 8 scenarios)

| Scenario | Test | Level | Status |
|---|---|---|---|
| A successful sale refreshes hold and balance | `FleetActionsPanel.test.tsx` › *A successful sale refreshes hold and balance* (panel half: commit + toast — already-green, narrowed off the deleted `balance-figure` assertion) + `VitalsStrip.test.tsx` › *The balance visibly updates when a sale resolves* + its hold-cell "mine run resolves" analogue + `SystemSpaceView.test.tsx` › *A successful sale refreshes hold and balance — landing on the strip…* (the wiring) | unit + integration | assertion-red (strip-reflection half) |
| A failed sale toasts player-facing copy, not raw server text | `FleetActionsPanel.test.tsx` › *A failed sale toasts player-facing copy, not raw server text* — unedited | unit | already-green |
| A price-changed rejection refreshes the offer instead of freezing it | `FleetActionsPanel.test.tsx` › *Scenario: Re-committing a re-priced sale uses a new operation key* (covers both this and the next scenario, unedited) | unit | already-green |
| Re-committing a re-priced sale uses a new operation key | same test as above | unit | already-green |
| A successful refuel refreshes hold, range, and balance | `FleetActionsPanel.test.tsx` › *A successful refuel refreshes hold, range, and balance* (panel half, unedited) + `VitalsStrip.test.tsx` › *The balance visibly updates when a refuel resolves* + `SystemSpaceView.test.tsx` › *A successful refuel refreshes hold, range, and balance — landing on the strip and the roster row…* (also proves the roster row's `fleet-range-fleet_1`, unchanged surface) | unit + integration | assertion-red (strip-reflection half) |
| An unaffordable refuel is rejected in full, never partially filled | `FleetActionsPanel.test.tsx` › *An unaffordable refuel is rejected in full, never partially filled* — narrowed off the removed `hold-fuel-tons` assertion, still proves rejection-in-full via `refuel.mutate` called exactly once and the error toast | unit | already-green |
| A failed refuel toasts player-facing copy, not raw server text | same test as above (combined `it()`, per the source file's own comment pairing) | unit | already-green |
| A failed sale's or refuel's error is announced to assistive technology | `FleetActionsPanel.test.tsx` › new describe *"A Failed Command Is Announced to Assistive Technology (docked-fleet-actions ADDED)"* › the same, unedited test, re-homed | unit | already-green |

**docked-fleet-actions subtotal: 8/8 scenarios accounted for** — 6
already-green (unchanged panel behaviour), 2 assertion-red (the strip-side
half of the two "refreshes…" scenarios — the panel's own half of both was
already proven and stays green).

---

## 4. `figure-formatting` (1 requirement MODIFIED, 5 scenarios)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Undefined | `frontend/lib/format/figures.test.ts` › the R10 "absent-value rows" describes, parametrized over `cases.json`, per quantity | unit | already-green (unedited, unaffected by this change) |
| NaN | same suite | unit | already-green |
| Infinity | same suite | unit | already-green |
| Zero is not absent | `figures.test.ts` › *Zero is not absent, across every quantity that has a zero figure* | unit | already-green |
| The absent form does not override a capability's own unavailable copy | `VitalsStrip.test.tsx` › *An unavailable balance reads as unavailable, not as a figure* — the concrete instance this scenario names (`system-console`'s credits cell, `null` credits) | unit | assertion-red |

**figure-formatting subtotal: 5/5 scenarios accounted for** — 4
already-green, 1 assertion-red.

---

## 5. Grand total

| Capability | Scenarios | assertion-red | already-green | Playwright, deferred |
|---|---:|---:|---:|---:|
| `system-console` | 71 | 69 | 0 | 2 |
| `system-space-view` | 28 | 7 | 21 | 0 |
| `docked-fleet-actions` | 8 | 2 | 6 | 0 |
| `figure-formatting` | 5 | 1 | 4 | 0 |
| **Total** | **112** | **79** | **31** | **2** |

Every scenario in all four spec deltas appears above exactly once. No
scenario was silently skipped; the two `Playwright, deferred` rows and every
`already-green` row states its reason.

---

## 6. The two jobs specific to this handoff (delegation §"Two jobs…")

### 6.1 `frontend/lib/format/guards.test.ts` — the line-anchored `.toFixed(` exception list (RULING 25)

**Not resolved with a line-number edit.** I re-grepped the current file:
the anchors `[681, 682, 738, 739, 903]` are correct for the tree AS IT
STANDS TODAY, and build-order steps A–E never touch `SpaceStage.tsx` — so
the guard stays green through every step except the camera-cluster shrink
(step F).

I attempted a predictive re-anchor (computing the shrink's line-count delta
from the contract's prose) and rejected it: guessing the shrink's exact
future line count and getting it wrong would have made this guard **red
through steps A–E instead** — a regression against every step before
`SpaceStage.tsx` is even touched, which is strictly worse than the
one-step gap RULING 25 itself predicts. Since I cannot write the
production diff to know its real line count, and a wrong guess is worse
than no guess, I left the anchors correct-for-today and added a prominent,
impossible-to-miss comment in `guards.test.ts` (quoted below) documenting:
the exact re-anchor RULING 25 requires, why it isn't done yet, and that it
is a **same-day SDET touch-up** run immediately after step F's
`SpaceStage.tsx` diff exists and **before** that step's commit — never
developer work, and not a cause requiring fresh adjudication (the guard's
own stated procedure at guards.test.ts:60-64 already describes this exact
maintenance).

**Action for the orchestrator:** schedule my (the SDET's) re-anchor as the
first sub-step of build-order step F, gating that step's commit — not
optional, and not something the developer can do instead.

### 6.2 The fourteen SpaceStage.interaction.test.tsx tests (contract §10.4)

All fourteen are rewritten (not merely re-pointed where the contract calls
for a rewrite — line 245's "the pan input is a DISTINCT control" test is a
genuine rewrite, driving both inputs on the surviving `camera-orbit` cell
and asserting each moves exactly one camera property; line 278's
at-limit test now drives the pan clamp while the zoom clamp is ALSO
engaged). Plus the three brand-new `system-space-view` scenarios this
MODIFIED requirement adds (accessible description names the pan binding;
exactly four cells; pan limit observable at the zoom clamp — this last one
doubles as line 278's own regression guard, so it appears both as the
rewrite and as its own scenario row above). Confirmed: 17 tests fail today
(14 rewrites + 3 new), all other 20 pre-existing tests in the file are
untouched and still pass. See §7 run output.

---

## 7. Confirmation every test fails for the right reason

Run 2026-09-09, against the tree at this handoff (production code
unchanged). Commands per `docs/testing-tiers.md` tier 1 (`npx vitest run`,
no stack). Full-suite run (`cd frontend && npx vitest run`) at the end
shows no collateral damage: **exactly 8 files fail, the other 111 pass
unchanged.**

```
$ cd frontend && npx vitest run components/fleet/roster-status.test.ts
 Test Files  1 failed (1)
      Tests  21 failed | 13 passed (34)
```
21 new additive-field cases fail (module doesn't yet export the new fields/
`resolveBody` param — TypeScript confirms this compile-red separately, see
below); the original 9 cases + 4 trivially-true additive negatives
(`parkMode`/`hostLabel`/`targetLabel` undefined where the field doesn't
exist yet either way) pass.

```
$ npx vitest run components/space/Gauge.test.tsx
Error: Failed to resolve import "./Gauge" — Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
compile-red: `Gauge.tsx` does not exist.

```
$ npx vitest run components/space/VitalsStripPill.test.tsx
Error: Failed to resolve import "./VitalsStripPill"
 Test Files  1 failed (1)
      Tests  no tests
```
compile-red: `VitalsStripPill.tsx` does not exist.

```
$ npx vitest run components/space/VitalsStripFleetCell.test.tsx
Error: Failed to resolve import "./VitalsStripFleetCell"
 Test Files  1 failed (1)
      Tests  no tests
```
compile-red: `VitalsStripFleetCell.tsx` does not exist.

```
$ npx vitest run components/space/VitalsStrip.test.tsx
Error: Failed to resolve import "./VitalsStrip"
 Test Files  1 failed (1)
      Tests  no tests
```
compile-red: `VitalsStrip.tsx` does not exist.

```
$ npx vitest run components/corporation-provider.test.tsx
 Test Files  1 failed (1)
      Tests  3 failed | 6 passed (9)
```
The 3 new `useCorporationSessionOptional` tests fail with
`TypeError: useCorporationSessionOptional is not a function`; the 6
pre-existing `CorporationProvider` tests are untouched and pass.

```
$ npx vitest run components/space/SpaceStage.interaction.test.tsx
 Test Files  1 failed (1)
      Tests  17 failed | 20 passed (37)
```
All 17 failures are `getByTestId('camera-orbit')`-style "unable to find an
element" (the cell doesn't exist until the shrink lands) or the
corresponding at-limit-attribute assertions; the 20 pre-existing,
untouched tests pass.

```
$ npx vitest run components/space/SystemSpaceView.test.tsx
 Test Files  1 failed (1)
      Tests  10 failed | 42 passed (52)
```
9 of the 10 new failures are `vitals-*`-testid assertions failing with
"unable to find an element" (the strip is not mounted yet) — the always-
present matrix, the credits/clock-wiring tests, and the two
no-selection-change tests. The 10th (*An unresolved credit balance
withdraws the readout, not the verbs*) fails on `data-available` (`"true"`
vs the expected `"false"` — the session-aware `useCorporationSessionOptional`
derivation doesn't exist yet). The 42 passes include the 4 brand-new
station/board read-issuance tests that closed a genuine pre-existing gap
and legitimately pass today (§2.1's "gap closed" rows), plus every
pre-existing test, unedited.

```
$ npx vitest run lib/format/guards.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
```
Still green (§6.1) — correctly anchored to today's tree, with the required
future re-anchor documented inline and flagged to the orchestrator, not
silently deferred.

```
$ npx vitest run components/space/FleetActionsPanel.test.tsx
 Test Files  1 passed (1)
      Tests  45 passed (45)
```
Green — this file's edits are migrations/narrowings of assertions against
UNCHANGED production code, not new red; every scenario it still owns
(6 of the 8 `docked-fleet-actions` scenarios) continues to pass.

```
$ cd frontend && npx vitest run
 Test Files  8 failed | 111 passed (119)
      Tests  51 failed | 1451 passed (1502)
```
The 8 failing files are exactly the 10 recorded in the manifest minus the 2
that stay fully green (`guards.test.ts`, `FleetActionsPanel.test.tsx`). No
other suite in the repository was touched or broke.

```
$ npx tsc --noEmit   # (filtered to this change's files)
```
Every remaining error is `TS2307` (cannot find module — the six new
production files), `TS2339`/`TS2551`/`TS2561`/`TS2554` (missing fields/
extra args on `RosterRowStatus`/`rosterRowStatus`), or `TS2724` (missing
`useCorporationSessionOptional` export) — i.e., exactly the compile-red
surface this change's tasks.md 1.1/1.3/2.x/3.x/4.x/5.x/6.1 create. No
stray type error of the SDET's own making remains (confirmed by iterating:
one `MockInstance` typing mismatch in `VitalsStrip.test.tsx` and one
unused-parameter lint warning in `roster-status.test.ts` were found and
fixed during this red phase).

```
$ python3 .claude/skills/code-quality-checks/check.py --files-only
All checks passed!
```
Tier 0 (data-testid, frontend-test-coverage) is clean on every changed file.

---

## 8. The red manifest

Recorded at the moment of this handoff, before the developer starts:

```
bash .claude/scripts/openspec-red-manifest.sh record add-vitals-strip \
  frontend/components/fleet/roster-status.test.ts \
  frontend/components/space/Gauge.test.tsx \
  frontend/components/space/VitalsStripPill.test.tsx \
  frontend/components/space/VitalsStripFleetCell.test.tsx \
  frontend/components/space/VitalsStrip.test.tsx \
  frontend/components/corporation-provider.test.tsx \
  frontend/lib/format/guards.test.ts \
  frontend/components/space/SpaceStage.interaction.test.tsx \
  frontend/components/space/SystemSpaceView.test.tsx \
  frontend/components/space/FleetActionsPanel.test.tsx
```

Written to
`docs/plans/continous_space/handoffs/red-manifest-add-vitals-strip.txt`,
generation **1** (first and only recording — no revision pass has happened
since). 10 files hashed. `guards.test.ts` and `FleetActionsPanel.test.tsx`
are included even though every test in them is green right now: both were
edited in this red phase (the former gains a documented future-work
comment with no behaviour change; the latter has its cargo-hold/
credit-balance describes migrated out and two assertions narrowed), and the
manifest's job is to prove no **unauthorized** change happens after
handoff — not to prove every recorded file is currently failing.

**Known, pre-authorized future generation-2 event:** §6.1 requires a
second `record` (or a hand-edit followed by `verify`) for `guards.test.ts`
alone, immediately after build-order step F's `SpaceStage.tsx` diff exists
and before that step's commit. When that happens, the SDET re-running this
handoff must say plainly that the manifest is a later generation and why —
this note is that disclosure, made in advance.
