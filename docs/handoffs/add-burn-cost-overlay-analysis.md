# add-burn-cost-overlay — design analysis

Analyst (`openspec-design-analyst`), 2026-10-03. Link 2a-ii of the system-HUD
chain. Entry mode: specced. Baseline: `openspec/specs/` at `a1d1c8d`
(`openspec list` reports no active change; nothing in flight conflicts).
Read-only on the tree; no stack booted; no suite run.

Sources read whole: `docs/plans/system-hud/chain.md`, `docs/plans/system-hud.md`,
`docs/handoffs/drift-running-mine-preview-unsuppressed.md`,
`docs/handoffs/defect-post-dock-burn-cost-drift.md`,
`docs/handoffs/defect-docked-selection-polls-zero-length-preview.md`,
`docs/handoffs/add-vitals-strip-qa-reverify.md`, `add-vitals-strip-rulings.md`
RULINGs 5, 9, 18, 36, 41 by range, `openspec/specs/system-console/spec.md`,
`figure-formatting/spec.md`, `system-space-view/spec.md` (lines 32-280, 478-830,
2720-2845, plus every `preview` hit elsewhere), and the code named in the brief.

INFERRED marks a scenario the design implies but does not state.

---

## 0. Headline findings

1. **The wire cannot back the sentence "the segment past the fill is the
   shortfall".** `BurnPreview` carries `fuelCostTons` and `affordable` and no
   shortfall. The backend's affordability predicate is not `cost <= held fuel`:
   `backend/fleet/service.go:584-589` is
   `CurrentFuel + Refund - OpenHoldUpkeep >= FuelCostTons`. Neither `Refund`
   (a superseded burn's refund) nor `OpenHoldUpkeep` (an open station-keeping
   hold's accrued upkeep) is served. So in two reachable states the picture and
   the served flag disagree — see section 3. Any client subtraction
   `fuelCostTons - heldFuel` is a mirror of a Go rule, and an inaccurate one.
2. **The chain doc's claim that only one `system-space-view` requirement is
   touched is false.** `System Space View Route and Data Fan-In` (15 scenarios)
   carries a closed enumeration of what drives the strip, which the overlay makes
   incomplete. A third requirement is conditionally touched. Section 4.
3. **The chain doc overstates the harness migration.** `SpaceCommandPanel.test.tsx`
   has 34 tests and 23 `previewState` references, as stated, but **zero**
   mutations after render and no `rerender` call anywhere in the file; all 34
   tests go through one `panel()` helper. The real cost has moved to the
   view-level tests, which must be written new. Section 5.
4. **Two further pre-existing drifts sit on this link's surface**, neither filed:
   the previewed curve is never drawn, and the preview does not clear when an
   order commits. Section 6.
5. **Floor estimate 37 tasks** against the 40 cap (RULING 9 guessed ~15). No
   split is forced by the floor; a seam is pre-identified because panel growth
   has been +30 % or more on both predecessors. Section 7.

---

## 1. Capability map

| Capability | New or delta | Why |
| --- | --- | --- |
| `system-console` | delta | The overlay is a strip behaviour. **Requirement-level it is ADDED, not MODIFIED** — the chain table says "MODIFIED `system-console` (the overlay requirement)" but no overlay requirement exists in the live spec. |
| `system-space-view` | delta | The stale-quote rule gains its graphical clause; the fan-in requirement's strip-driver list gains the preview; conditionally the preview requirement gains scenarios. |
| `figure-formatting` | no delta, conditionally | Holds only for a segment-only overlay. Section 4 (c). |
| `docked-fleet-actions`, `fleet-roster`, `fleet-movement`, `mutation-retry-policy`, `galaxy-view`, `cross-stack-determinism`, `world-clock` | no delta | Every `preview` hit read; none names the burn quote's presentation or its call site. `docked-fleet-actions` *Running Mine Gates the Fleet Panel's Commands* names "`system-space-view`'s command panel (burn and jump)" and stays true — the panel survives this link. |

No new capability. The lift itself (hook call moves from `SpaceCommandPanel` to
`SystemSpaceView`, panel takes props) is HOW, not WHAT: at spec altitude the
panel is part of the view, so the lift belongs in design.md and tasks.md and has
no requirement of its own.

---

## 2. Requirements per capability

### 2.1 `system-console`

Recommend **two ADDED requirements** rather than one (one requirement holding
geometry, state, lifecycle and non-interactivity would carry 15+ scenarios and
fail two independent ways).

**ADDED A — the overlay's content.** Draft: *The Fuel Gauge Overlays the Current
Burn Quote's Served Fuel Cost on the Gauge's Own Scale.* The system SHALL draw,
on the fuel gauge, an overlay whose extent is the mounting view's current burn
quote's served `fuelCostTons` over the acting fleet's served `cargoCapacity` —
the denominator the fill already uses — and whose affordability state is the
quote's served `affordable` flag, verbatim. The strip SHALL NOT compute a
shortfall, a remainder, or an affordability of its own, and SHALL NOT decide the
overlay's state by comparing the cost extent with the fill.

| Scenario | Provenance | Notes |
| --- | --- | --- |
| A current quote draws a cost extent on the gauge's own scale | chain doc | concrete: cost 30 t, capacity 200 t, extent 15 % |
| An unaffordable quote is drawn in the unaffordable state | chain doc | state from served `affordable: false`; see Q5, Q14 for colour and non-colour cue |
| The overlay's state follows the served flag when the cost extent exceeds the fill | INFERRED (backend predicate, section 3) | burning fleet re-target, `affordable: true`, cost > held fuel |
| The overlay's state follows the served flag when the cost extent is within the fill | INFERRED (same) | station-keeping fleet, `affordable: false`, cost <= held fuel |
| A cost above the capacity is clamped and distinguishable from an exact fit | RULING-recorded gap ("needs its own clamp rule") | rule itself is Q4 |
| A sub-pixel cost is still DOM-observable | INFERRED from the live fuel-gauge scenario (0.05 t against 200 t) | the gauge rail is 40 px wide (`h-1.5 w-10`); a 4.5 t burn on a 200 t hold is under one pixel |
| The overlay exposes no figure | INFERRED from `Gauge.tsx` contract | no `data-raw`, no `data-unit`, no accessible value; conditional on Q1 |
| With no served capacity, or no served fuel, the overlay follows the ruled rule | gap | Q6 |
| The overlay is drawn alongside the draining marker on a burning fleet | INFERRED | re-target preview is mandated live |

**ADDED B — the overlay's lifetime.** Draft: *The Cost Overlay Is Drawn Only
While Its Quote Is Current.* The overlay SHALL be drawn only while the mounting
view holds a successful, current quote for the current selection and the acting
fleet, and SHALL be withdrawn when there is none.

| Scenario | Provenance |
| --- | --- |
| No selection, no overlay | chain doc |
| A failed first preview draws no overlay | chain doc, RULING 5 |
| A failed refresh withdraws the overlay and leaves the fill and figures | chain doc ("withdrawn ... when a refresh fails"); see Q8 |
| A later successful refresh restores it | INFERRED from the live stale requirement |
| Clearing or replacing the selection withdraws it | chain doc |
| A committed order withdraws it | chain doc; mechanism is Q7 |
| Switching the acting fleet never shows the previous fleet's quote | INFERRED (query key carries the fleet id; `gcTime: 0`) |
| A suppressed preview (running mine, lane transit) draws no overlay | INFERRED from the drift fix |
| The overlay adds no interactive element and no announcement | INFERRED from *The Strip Carries No Verb* and *The Strip Announces Only Its Own Balance Changes* — the retry stays on the command panel |
| Rendering the strip with a quote supplied issues no request | INFERRED from *The Strip Issues No Read of Its Own* |

**Live `system-console` requirements checked, each by header, and the verdict:**

| Live header (character-for-character) | Scenarios | Verdict |
| --- | --- | --- |
| `The Vitals Strip Is Present on Every Render of the System Space View` | 6 | true after the change; no delta |
| `The Strip Carries No Verb` | 3 | true **only if** the strip gets no retry affordance for a stale quote; its third scenario ("every one is the chevron or a descendant") is the test |
| `The Fleet Cell Names the Acting Fleet and Delegates a Switch to the Mounting View` | 9 | unaffected |
| `The Fleet Cell's Chevron and Menu Are Keyboard-Operable` | 3 | unaffected |
| `The Fleet Cell's State Pill Is a Projection of the Shared Roster Derivation` | 19 | unaffected |
| `The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge` | 4 | **at risk.** Text says the gauge exposes "whether it holds no data or a rendered fill". Stays true only if the overlay's state lives on a **separate** attribute and `data-gauge-state` keeps its three values (`no-data`, `empty`, `filled`). `vitals-strip-journey.spec.ts:320` asserts `data-gauge-state` is `filled`. If the writer folds the overlay into this requirement instead, it is MODIFIED with all 4 scenarios verbatim. Recommend no delta. |
| `While Burning, the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain` | 2 | true; the overlay changes only when a preview read lands. No delta. |
| `The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented Gauge` | 6 | unaffected, but it shares the `Gauge` atom; its "the gauge itself SHALL expose no figure, no fill percentage and no accessible value" must not be broken by an atom change |
| `The Credits Cell Shows the Corporation's Served Balance and Announces Its Changes` | 7 | unaffected |
| `The Clock Cell Shows the Absolute World Instant at Its Served Scale` | 6 | unaffected |
| `The Strip Issues No Read of Its Own` | 1 | true and now load-bearing ("no preview request" is named in its text) |
| `Activating the Strip Changes No Space-View Selection` | 2 | unaffected |
| `The Strip Announces Only Its Own Balance Changes` | 1 | true only if the overlay is silent; "the credits cell's own live region is the strip's only announcing surface" |
| `The Strip Is Laptop-First and Never Overflows the View` | 2 | true for a segment-only overlay; a text ruling on Q1 widens the fuel cell at the 1280 px floor and must be re-proved by the journey |

Purpose paragraph: true as written ("renders only figures the mounting view
supplies, issues no read of its own"). The archiver discards a delta's
`## Purpose`; for an existing capability verify after archive that the live
paragraph survived, and restore it if it did not.

### 2.2 `system-space-view`

**MODIFIED — `A Failed or Stale Preview Is Never Presented as a Current Quote`.**
Live text binds "figures" only. Add the graphical clause: a graphical projection
of a quote is a presentation of that quote. All six scenarios must be carried
verbatim:

1. `A failed first preview shows a no-quote state, not empty figures`
2. `A failed first preview offers a retry`
3. `A failed refresh marks the shown figures stale`
4. `A later successful refresh clears the stale marking`
5. `The burn stays committable without a quote, labelled as uncapped`
6. `A stale figure never becomes a cap`

New scenarios: a failed refresh withdraws every graphical projection of the
quote; a no-quote state draws none.

Warning for the writer: the command panel already has a graphical projection of
a possibly stale quote. `SpaceCommandPanel.tsx:183` computes
`unaffordable = !!preview && !preview.affordable` with no `stale` test, so a
stale unaffordable quote keeps the amber panel styling and the
`preview-affordable` line. A clause worded as "every graphical projection SHALL
be withdrawn" silently creates a new obligation on the panel. Either scope the
clause to projections outside the figures' own marked-stale panel, or accept the
obligation and add its task and test. Q8.

**MODIFIED — `System Space View Route and Data Fan-In`.** The live sentence:

> The vitals strip this view mounts (`system-console`) SHALL be driven by the
> own-fleets read, the interior read (for the name of a docked fleet's host), the
> galaxy read (for the name of the system a fleet is in), the corporation session
> read, and the world clock and its served scale — alongside every other reader
> of those same reads, and never from a read the strip issues itself.

After this change the strip is also driven by the view's burn-preview read. The
list is enumerated and becomes incomplete. All fifteen scenarios must be carried
verbatim:

1. `Loading state before data arrives`
2. `The own-fleets read is the corporation-scoped one`
3. `The view reads the open system's station and the market board`
4. `The station-anchored controls are driven by the view's own reads`
5. `An arrived fleet reads as arrived on both the canvas and the roster`
6. `A failed interior read shows a retriable error in the canvas region`
7. `A failed interior read leaves the fleet-state-anchored commands usable`
8. `A failed interior read withdraws the mine offer without misreporting the body`
9. `A failed own-fleets read shows a retriable error in the fleet panel`
10. `A failed station read withdraws the station-anchored offers without misreporting the system`
11. `A system with no station shows no station error`
12. `A failed market-board read withdraws the sell offer but not the refuel offer`
13. `An unresolved credit balance withdraws the readout, not the verbs`
14. `Loading persists through first frame after data arrives`
15. `An unsupported rendering context takes precedence over the loading placeholder`

New scenario (INFERRED from "the reads SHALL fail independently"): a failed
preview read withdraws only the cost overlay; the fuel figure, the range figure
and the fill are unchanged. Note the requirement's "five reads this view issues
itself" is already non-exhaustive (the inbox, scan-target and sighting reads are
governed by other requirements), so that count is not made false by the lift.
The orchestrator may rule the strip-driver list non-exhaustive too and drop this
delta; that is a ruling, not something the analyst may assume.

**MODIFIED, conditional — `Burn Preview Reflects the Server-Solved Order,
Without Committing`** (7 scenarios: `Selecting a target shows a preview curve
and its figures`, `A burning fleet's re-target is previewed`, `Clearing the
selection clears the preview`, `The preview refreshes on exactly one named
interval while shown`, `The refresh interval is defined in exactly one place`,
`An unaffordable preview is shown as such`, `No preview is requested while a
mine holds the movement channel`). Touched only if the orchestrator rules in
either of: a scenario for the text's existing but unscenarioed clause "SHALL
clear ... when an order commits" (Q7), or the docked-at-target precondition
(Q10). The drift fix alone does not touch it.

**Checked and not touched:** `A Burn Commit Is Quote-Locked to the Preview the
Player Agreed To` (3), `Burn Commit Reports Its Outcome` (3), `Burn and Jump
Commit Controls Guard Against Double-Submit` (4), `A Commit's Actual Result Is
Never Silently Swapped for the Previewed One` (3), `Burn Command Targets Any
Selected Body, Lane Gate, or Point Uniformly` (6), `Jump Commit`, `Realtime
Refetch Rules While the Space View Is Open` (no preview clause),
`Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point`,
`Renderer Unavailability Is an Explicit State`, `Animation Never Re-Renders the
View, and Never Starves a Navigation`. The last one constrains the
implementation: the lifted quote must not be copied into component state by an
effect, and the suppression flag reads the coarse world time (its permitted
one-second lag applies).

---

## 3. Figure-versus-wire sweep

Wire type: `BurnPreview` in `frontend/lib/types/fleet.ts:203-211` —
`controlPoints`, `departMs`, `arriveMs`, `deltaV`, `fuelCostTons`, `affordable`,
`strandingWarning`. Fleet side: `FleetRoster.cargo.fuel`, `cargoCapacity`,
`freeHold`, `estimatedRange`, `stranded`.

| Thing the overlay renders or might render | Served field | On the wire? |
| --- | --- | --- |
| Fuel fill (exists) | `roster.cargo.fuel` over `roster.cargoCapacity` | yes |
| Cost extent | `BurnPreview.fuelCostTons` over `roster.cargoCapacity` | yes — two served values from two reads, one ratio, same arithmetic class as the existing fill |
| Affordability state and colour | `BurnPreview.affordable` | yes |
| "Shortfall" (the part past the fill) as a quantity | none | **no** |
| Shortfall text `short 6.6 t` | none | **no** — link 4 inherits this; flag it forward |
| Fuel remaining after the burn | none (`RemainingFuel()` is backend-only) | **no** |
| The fuel figure the quote was solved against (`CurrentFuel`) | none | **no** — the fill comes from a different read at a different instant |
| `Refund`, `OpenHoldUpkeep`, `FuelActive` | none | **no** |
| Cost as text, if ruled in | `fuelCostTons`, existing `tons` token | yes |
| Fuel ceiling (`cost x BURN_FUEL_ALLOWANCE`) | client-derived, existing precedent on the panel | not served; Q9 |
| Stranding advisory | `BurnPreview.strandingWarning` | yes; design silent on the strip, Q11 |
| Current versus stale | hook state (`stale`, `noQuote`), not wire | client state by design |
| Clamp past capacity | none | a presentation rule the spec must state, Q4 |

**What the segment geometry can be derived from without mirroring a backend
rule:** two independent extents on one scale, both anchored at the gauge's start
— fill `fuel / cargoCapacity`, cost `fuelCostTons / cargoCapacity`, each clamped
to the rail — plus a state token copied from `affordable`. No subtraction, no
comparison. The part of the cost extent that shows beyond the fill is then a
visual consequence of two honest bars, not a computed value.

**What it cannot be:** a shortfall. The served flag and the picture disagree in
at least two reachable states.

| State | Served flag | Picture |
| --- | --- | --- |
| Burning fleet, re-target (fuel was debited at commit, `Refund > 0`) | `affordable: true` | cost extent can run past the fill |
| Open station-keeping hold (`OpenHoldUpkeep > 0`) | `affordable: false` | cost extent can sit wholly inside the fill |
| Fleet read older than the quote | either | fill and cost drawn from different instants |

A geometry that draws the cost backward from the fill's end ("what this burn
will consume") needs `fuel - cost`, which is `RemainingFuel` without its refund
and upkeep terms — a mirror, and forbidden. This is a finding against the design
sentence in the chain doc and scoping doc, not against the link: the link is
buildable inside the fences if the spec says "cost on the fuel scale, state from
the served flag" and never calls the overhang a shortfall.

---

## 4. Audit of "unaffected" and "no delta" claims

| # | Claim (source) | Verdict | Evidence |
| --- | --- | --- | --- |
| a | Only `A Failed or Stale Preview Is Never Presented as a Current Quote` is touched in `system-space-view` (chain doc "Touches") | **False** | `System Space View Route and Data Fan-In` strip-driver enumeration, spec lines 78-83. Conditionally also `Burn Preview Reflects the Server-Solved Order, Without Committing`. |
| b | The drift fix needs no delta (chain doc, RULING 18, drift file) | **Holds** | The scenario `No preview is requested while a mine holds the movement channel` exists verbatim and the fix makes it true. Two caveats. The fix changes what the panel shows during a mine: today the request goes out and the server refuses it (`ErrPreviewChannelHeld`), so the panel shows `preview-no-quote` and `preview-retry` every 10 s; after the fix it shows neither. No live scenario states what a suppressed preview looks like ("a suppressed preview is not a failed one" exists only as a code comment in `use-burn-preview.ts`). And the requirement's stated rationale, "since a commit would be refused in both cases", is false for a mine on the commit path (`defect-burn-cancels-running-mine.md`: the commit is accepted and cancels the run). The SHALL NOT is explicit, so the fix stands; the rationale is stale prose this link should not repeat. |
| c | `figure-formatting` is untouched (chain doc) | **Holds conditionally** | True for a segment-only overlay whose DOM-observable state is a plain `data-*` token: `FigureUnit` stays the closed eleven-token union, no `data-raw`, no new figure kind. Breaks if the strip prints a ratio or percentage (no token exists), if a test hook is put on `data-raw`, or if an accessible value is added to the gauge. A cost printed as text uses the existing `tons` token and needs no delta. A shortfall printed as text has no served raw and is barred by `The Formatter Is Pure Presentation and Derives No Rule-Bearing Value` in spirit and by the chain doc's anti-mirror rule in terms. |
| d | "23 references become props, and mutations that happen after render today must become re-renders" (chain doc) | **Half false** | 23 references, yes (5 are the declaration and `beforeEach` resets; 11 tests touch the object). No test mutates after render; the file contains no `rerender`. `A later successful refresh clears the stale marking` sets state before its only render. |
| e | "MODIFIED `system-console` (the overlay requirement)" (chain table) | **Misnamed** | No such requirement exists. ADDED. |
| f | "`add-burn-cost-overlay` (~15 tasks)" (RULING 9) | **Undercount** | 37 floor, section 5. |
| g | No backend field is needed (chain doc, scoping doc) | **Holds only under Q2's cheap reading** | A true shortfall segment needs a served shortfall. |
| h | The predecessor analyst's note that a shortfall could be a client-derived raw "at the call site", by precedent of `preview-fuel-ceiling` (`add-vitals-strip-analysis.md` section on tokens) | **Unsafe** | The ceiling is a client rule the spec names. A shortfall is a backend rule with two unserved terms. |
| i | Drift file's line reference `SpaceCommandPanel.tsx:109-115` | **Still accurate** | Line 114 is `commitWouldBeAccepted: !!fleet && !fleet.jump`. |
| j | `guards.test.ts`'s line-anchored exception list needs re-anchoring | **Not for this link** | Its anchors are in `SpaceStage.tsx` and `webgl/SpaceWorld.tsx`. Neither is edited unless the preview-curve drift (section 6) is pulled in. |

---

## 5. Test-file sizing

Counts are `it(` occurrences and literal references, measured on `a1d1c8d`.

| File | Lines | Tests | Hook-mock or `previewState` refs | Work |
| --- | --- | --- | --- | --- |
| `frontend/components/space/SpaceCommandPanel.test.tsx` | 630 | 34 | 23 `previewState`, 1 `vi.mock('@/hooks/use-burn-preview')` | delete the mock; `panel()` helper supplies quote props; 11 tests change their arrange step; 23 tests need no edit |
| `frontend/components/space/SystemSpaceView.test.tsx` | 1317 | 52 | 1 mock, **wrong shape** (`{ data, isLoading, isError, isFetching }`, not `{ preview, stale, noQuote, retry }`), an inline arrow that cannot record arguments | convert to a hoisted recording mock or drop it; about 9 new tests |
| `SystemSpaceView.render-loop.test.tsx` | 460 | 6 | 1 wrong-shape mock | one-line shape fix |
| `SystemSpaceView.scan-refetch.test.tsx` | 300 | 3 | 1 wrong-shape mock | same |
| `SystemSpaceView.scan-settle-announcement.test.tsx` | 181 | 1 | 1 wrong-shape mock | same |
| `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` | 886 | 11 | 1 wrong-shape mock | same |
| `SystemSpaceView.sighting-log-mount-ordering.test.tsx` | 215 | 1 | 1 wrong-shape mock | same |
| `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx` | 284 | 4 | 1 wrong-shape mock | same |
| `frontend/hooks/use-burn-preview.test.tsx` | 325 | 12 | real hook, `fleetService.preview` mocked | none unless Q7 or Q10 lands in the hook |
| `frontend/hooks/use-sightings.test.tsx` | 58 | 4 | 1 mention (comment) | none |
| `frontend/components/space/VitalsStrip.test.tsx` | 673 | 40 | 0 | `strip()` helper plus 8 direct renders; no edit if the new prop is optional; about 7 new tests |
| `frontend/components/space/Gauge.test.tsx` | 233 | 18 | 0 | no edit if the new prop is optional; about 6 new tests |
| `VitalsStripFleetCell.test.tsx`, `VitalsStripPill.test.tsx` | 220, 451 | 18, 27 | 0 | none |
| `FleetActionsPanel.test.tsx`, `GalaxyView.test.tsx` | 917, 914 | 45, 34 | 0 | none |
| `frontend/lib/format/guards.test.ts` | — | — | anchors in `SpaceStage.tsx`, `SpaceWorld.tsx` only | none |
| `frontend/lib/realtime.test.ts`, `lib/space-quote.test.ts` | — | — | declared-once guards on `PREVIEW_REFRESH_MS`, `BURN_FUEL_ALLOWANCE` | none; the lift must not redeclare either |
| `frontend/e2e/helpers/space-view.ts` | — | — | `preview-panel` at line 455 | none if panel testids are kept |
| `e2e/tests/space-journey.spec.ts`, `scan-journey.spec.ts`, `vitals-strip-journey.spec.ts` | — | — | 12, 1, 11 preview or fuel-gauge references | none if testids and `data-gauge-state` values are kept |
| new `e2e/tests/burn-cost-overlay-journey.spec.ts` | — | 1 journey | — | written at the archive gate |

**View-level harness (brief item 5).** One exists. `SystemSpaceView.test.tsx`
renders the real view with the real `SpaceCommandPanel` and `VitalsStrip` inside
a `QueryClientProvider` (line 418), with a hoisted `useRunningMine` mock (line
50) and a mocked `SpaceStage` exposing a `mock-select-body` button that calls
the view's real `onSelect` with `{ bodyId: 'feat-body-0' }` (line 255). What it
lacks: its `useBurnPreview` mock is an inline arrow of the wrong shape, so it can
neither record the argument nor return a quote. Two ways to close the drift
finding, both view-level:

- record the argument: hoist the mock to a `vi.fn()` and assert the last call's
  `commitWouldBeAccepted` after a selection is made with a mine running;
- stronger: a new file that does **not** mock the hook, mocks
  `@/lib/services`'s `fleetService.preview` as `use-burn-preview.test.tsx`
  already does, and asserts the scenario's actual THEN — no request is sent.

Either test must make the selection first. With no selection the hook is
disabled regardless, so a test that never selects passes against the bug.

**Task estimate — 37 (floor), range 34-40.**

| Group | Tasks |
| --- | --- |
| A. Lift and prop conversion: panel prop contract; panel harness migration; 11 arrange-step migrations; static guard that the panel no longer imports the hook and one production call site exists; view harness mock; six sibling mock-shape fixes; view test of the call-site arguments; view test that both consumers read one quote and one request goes out per interval; the lift itself; cap-rejection re-quote reaching the real retry; header-comment cleanup | 10 |
| B. Drift fix: view test with a mine running; view test for lane transit and no acting fleet; the one-expression fix | 3 |
| C. Gauge atom: geometry test; clamp test; state-attribute and decorative tests; implementation; colour-compliance and non-colour cue; existing `data-gauge-state` tests still green | 6 |
| D. Strip: overlay for a current quote; unaffordable state; withheld for null, stale, no-quote, absent inputs; draining coexistence plus no verb, no announcement, no read; `FuelCell` and props; view-to-strip wiring | 6 |
| E. View-level lifetime: selection clear; failed refresh; commit; acting-fleet switch; preview failure leaves the fuel cell alone | 5 |
| F. Stale clause on the panel's own styling, if ruled in | 1 |
| G. Gate: per-commit gate; journey spec; QA naming the closing line per row; tier 4 then tier 3; reconcile, archive, Purpose check; close the drift file and update the chain doc | 6 |

Add 2 for Q10 (docked-at-target) and 1-2 for Q7 if it needs a scenario delta.
Both predecessors grew under panel review (link 1: about 30 to 55; link 2a: 57
before its split, 42 after), so expect 45-50 after the panel unless questions are
ruled narrowly.

---

## 6. Code-versus-doc discrepancies found

1. **`drift-running-mine-preview-unsuppressed.md` — confirmed, unchanged.**
   `SpaceCommandPanel.tsx:114`. Owned by this link.
2. **`defect-docked-selection-polls-zero-length-preview.md` — bears on this
   link.** RULING 36 names 2a-ii as its "natural candidate". After a dock the
   host stays selected, the preview polls a zero-length burn, the server answers
   500 every 10 s. For the overlay this lands in the no-quote state (no overlay),
   so it does not make the overlay lie; it does put a recurring 500 in the
   journey's console capture, which is now a hard `afterEach` assertion surface.
   Whether to carry it is Q10.
3. **`defect-post-dock-burn-cost-drift.md` — bears as a risk, not as scope.**
   Its cause is unconfirmed and backend-side; this link cannot fix it inside the
   fences. Consequence here: the overlay draws the point cost while a commit
   moments later can solve 22.7 % higher, and the player sees a refusal for a
   burn the gauge showed as affordable. It also argues for a journey that does
   not commit a burn. It feeds Q9 (point cost or ceiling).
4. **New, unfiled: the previewed curve is never drawn.** The requirement says
   the system SHALL "render its solved curve as a distinct preview overlay", and
   its first scenario says the returned curve is rendered. `BurnPreview.controlPoints`
   has no production consumer: `buildSceneModel` takes no preview input
   (`space-scene.ts:266`), and the only curves pushed are a running burn's
   (`space-scene.ts:405-412`). The lift is what makes a fix possible (the view
   will hold the quote), and link 4 presumes "the drawn curve". Fixing it here
   touches `space-scene.ts`, `SpaceStage.tsx` and `webgl/SpaceWorld.tsx` and the
   line-anchored exception list. Q12.
5. **New, unfiled: the preview does not clear when an order commits.** The
   requirement text says it SHALL; there is no scenario; the code keeps the
   selection and keeps polling, now as a re-target quote for the target the
   fleet is already flying to. The chain doc's "withdrawn ... when an order
   commits" makes this live for the overlay. Q7.
6. **The scoping doc's colours do not exist in the code.** It says "the red
   segment" and "blue affordable, red not". The panel's unaffordable state is
   amber (`border-amber-500/60 bg-amber-500/10 text-amber-200`); there is no red
   and no blue class anywhere under `components/space` or `components/fleet`. Q5.
7. **The design canvas is not in the repo.** Both docs cite it for the overlay's
   two states (`https://claude.ai/code/artifact/6e306911-...`). The exact drawn
   geometry exists only there.

---

## 7. Proposed change structure

**One change, `add-burn-cost-overlay`,** on the floor estimate. Deltas:
`system-console` (2 ADDED), `system-space-view` (2 MODIFIED, 1 conditional).

**Pre-identified seam, if the panel pushes it past 40:**

- `lift-burn-preview-to-view` — groups A and B, plus Q10 and Q7 if ruled in.
- `add-burn-cost-overlay` — groups C, D, E, F and both `system-space-view`
  MODIFIED blocks named in 2.2.

Why it is clean: the first half is behaviour-preserving for the panel apart from
the precondition fixes; the second is purely additive on state the first half
already lifted; the module boundary is the hook call site versus `Gauge` and
`VitalsStrip`; the only shared file is `SystemSpaceView.tsx`, where the first
adds the hook call and the second adds one prop.

Why it may not be available: an OpenSpec change needs a delta, and the lift plus
the drift fix have none. The first half exists as a change only if Q10 or Q7
gives it a `Burn Preview Reflects the Server-Solved Order, Without Committing`
MODIFIED. If both are ruled out, there is no seam and the link runs long.

**Design decisions for design.md**

- The lifted quote's shape and who derives "current" (`preview && !stale`) —
  once, in the view, so the panel's ceiling and the strip's overlay cannot
  disagree about currency.
- The panel's new props and the retry callback's name; the hook's signature
  stays as is.
- The overlay's DOM contract: a separate state attribute on the gauge, the
  existing `data-gauge-state` vocabulary untouched, no `data-raw`.
- Geometry: two start-anchored extents, clamp rule, z-order.
- New `VitalsStrip` and `Gauge` props are optional and omitted when absent
  (`frontend/CLAUDE.md`: omit optional props, never pass `undefined`).
- The commit-withdrawal mechanism (Q7).
- No effect copies the quote into component state.

**Journey (one spec, archive gate).** Wake a corp, open the home system, read the
fuel gauge with no overlay; select a body and read the overlay in the affordable
state; select an unaffordable target and read the unaffordable state; deselect
and read the overlay gone. Carry forward the `[journey-console]` capture with its
hard update-depth assertion and the webServer `stdout: 'pipe'`. Recommended
additions: count `orders/preview` POSTs with `capturePosts` to prove one request
per interval with two consumers. Geometry belongs in vitest — the rail is 40 px.
Recommend the journey commits no burn (discrepancy 3).

**Intersections with the unspecced edits U1-U10** (Travis's to adjudicate; this
change neither reverts, retro-specs, nor silently builds on them):

| Edit | Intersection |
| --- | --- |
| U2 `SystemSpaceView.tsx:187-192`, `:556-562`, import at `:50` | **Same file this link edits.** The lift adds an import and a hook call and two prop passes; it must leave both timer hunks byte-identical and must not cite `wallMsUntil` in any requirement or task. |
| U1 `wallMsUntil` | None, provided the commit-withdrawal rule (Q7) uses no timer. |
| U9 warped e2e stack (scale 5, cheap lanes) | The journey proves the overlay at scale 5 only. Fuel cost is not scale-dependent as far as the wire shows; record the environment in the journey handoff. |
| U6, U7 e2e frontend boot path | The journey depends on them as every tier-4 run does. Name that in the proposal's Impact as environment, not as endorsement. |
| U3, U4, U5, U8, U10 | None. |

---

## 8. Open questions

Recorded leans are quoted. None is resolved here.

**Q1 — Text or segment only?** Lean, chain doc: "The chain doc's 2a scope said
segment-only, with `▲ short 6.6 t` belonging to link 4." Predecessor analyst
A-3: "chain-doc lean → no shortfall text in 2a. Recorded because adding it later
is free and removing it later is a spec change." New input: a shortfall text has
no served raw at all (section 3), and a text ruling widens the fuel cell at the
1280 px floor.

**Q2 — Is the overhang a "shortfall"? HARD-STOP candidate if Travis wants a true
one.** Chain doc: "the segment past the fill is the shortfall, in the
affordability colour". No lean addresses the disagreement states in section 3.
Options: (a) the spec says cost extent plus served state and never names a
shortfall — inside every fence; (b) a true shortfall, which needs a served field
and breaks "No backend field, endpoint or query". Only Travis can trade that
fence.

**Q3 — Which end is the cost drawn from? HARD-STOP candidate.** Start-anchored
(derivable) or drawn backward from the fill's end (needs `fuel - cost`, a
mirror). The mock that would answer it is the design canvas, which is not in the
repo. The prose supports either.

**Q4 — The clamp rule.** Lean on existence only: "needs its own clamp rule for
`fuelCostTons > cargoCapacity`. That is 2a-ii's requirement to write"
(`add-vitals-strip` design.md). No lean on the rule, or on how a clamped overlay
is told from an exact fit.

**Q5 — The affordability colour.** Scoping doc: "the red segment past the fill";
Surface 3: "blue affordable, red not". Code: amber, no red, no blue. Fence: "Same
zinc ... Placement and weight change; vocabulary does not." No lean reconciles
them.

**Q6 — Absent inputs.** Capacity unserved: the fill is already `no-data`. Fuel
absent (a dry fleet and an unloaded roster are one served condition) with a
current quote: draw the cost extent on an empty rail, or nothing? No lean.

**Q7 — What "withdrawn when an order commits" means mechanically.** Chain doc:
"withdrawn when the selection clears, when a refresh fails, or when an order
commits." Live text: the preview "SHALL clear ... when an order commits", with
no scenario and no implementation. Options: clear the selection on a successful
commit (changes selection behaviour, likely a third MODIFIED); or suppress the
quote for the committed selection until the selection changes (keeps the
selection, contradicts "a burning fleet's re-target is previewed" for that one
target unless worded carefully). Applies to the panel too.

**Q8 — Stale: withdraw or mark?** Chain doc: "drawn only while the quote is
current, withdrawn ... when a refresh fails". Predecessor draft: "withdrawn or
marked, never left presenting as current". And does the clause reach the panel's
own unaffordable styling under a stale quote?

**Q9 — Point cost or ceiling?** Lean, chain doc sizing note: "It still reads
`BurnPreview.fuelCostTons` and `affordable` off the preview the command panel
already holds." The live quote-lock requirement wants the ceiling displayed "so
the figure the player agrees to is the figure that is actually enforced"; the
panel does that. No lean on whether the gauge should.

**Q10 — Carry the docked-at-target defect?** RULING 36: "It is a natural
candidate for link 2a-ii ... Reconsider only if the SDET shows it blocks the
journey." The defect file offers two fix shapes and chooses neither: clear the
selection on dock (needs a delta), or skip the preview when the target is the
fleet's own `attachedTo` (arguably the existing "and only then" clause).

**Q11 — Does the strip show the stranding advisory?** `strandingWarning` is
served; both docs are silent for the strip. No lean.

**Q12 — The undrawn preview curve.** File it, fix it here, or leave it to link 4?
No lean; found by this analysis.

**Q13 — The overlay while the burn command is unreachable.** With the canvas
unavailable and a selection still held, the preview keeps polling and Burn is
disabled. Draw the overlay or not? No lean.

**Q14 — Not colour alone.** The hold cell's requirement forbids conveying
segmentation by colour alone; the fuel gauge is `aria-hidden`. Until link 4 the
panel's `preview-affordable` text is the only non-colour carrier. Is that enough
for this link, or does the strip need its own non-colour cue (which reopens Q1)?
No lean.

**Q15 — Legibility at 40 px.** A typical cost is under one pixel on the current
rail. A minimum drawn width misstates the scale; widening the rail is a layout
change at the 1280 px floor. No lean.

**Q16 — Does `System Space View Route and Data Fan-In` take a delta?** The
analyst reads the strip-driver list as enumerated. The orchestrator may rule it
illustrative. No lean.

**Q17 — Can the journey reach an unaffordable quote deterministically?** The
fixture spawns into a random system (`defect-spawn-system-single-body` has fired
in three of four gate runs). Needs a stack to answer, which the analyst may not
boot; the SDET should probe at kickoff. A far point target is the likeliest
route.

---

## 9. Risks

- **The central claim will draw the review.** For 2a it was "does the strip lie
  about state". Here it is "does the gauge lie about affordability". Q2 and Q3
  are where the rounds will go; rule them before authoring.
- **A second hook instance** would double the request rate against an endpoint
  the live requirement prices at exactly one request per interval. Guard it
  statically and in the journey.
- **The six wrong-shape mocks** pass today only because the view never reads
  them. After the lift the view passes `retry: undefined` to the panel; nothing
  fails until something calls it.
- **Render scope.** A quote refresh now re-renders the view rather than the
  panel. Within the live render-loop requirement (it is a 10 s cadence beside an
  existing 1 Hz tick), but `SystemSpaceView.render-loop.test.tsx` is the guard
  and must stay green.
- **The journey's console assertion** is now hard. The docked-at-target 500s and
  any preview refusal are console errors.
- **Archive traps** (project memory): a MODIFIED block must keep every scenario
  heading verbatim — 15 and 6 here — and `--strict` does not catch an omission.
  Run `python3 harness/openspec-reconcile.py` and rehearse the archive on a copy.
- **Environment.** Tier 4 runs on the warped stack; name-matched `pkill` from
  sibling sessions kills the emulators. Check the emulator log before
  attributing a red.

---

## 10. Out of scope (record in the proposal)

- Shortfall text, figures on the arc, Burn on the curve, the progress label —
  link 4.
- The dock, its tabs, `Esc` — link 2b. The in-system list — link 3.
- Retiring `SpaceCommandPanel` — link 4. This link deletes only the hook call
  inside it.
- Any backend field, endpoint or query; the galaxy view; a mobile layout; palette
  or type-scale changes.
- The cause of the post-dock cost drift; whether a burn should cancel a running
  mine.
- U1-U10.
