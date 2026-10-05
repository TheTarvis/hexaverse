# add-burn-cost-overlay — design analysis (refreshed)

Analyst (`openspec-design-analyst`), 2026-10-05. Link **2a-iv** of the system-HUD
chain. Entry mode: specced. Baseline: tree and `openspec/specs/` at **`d965f5d`**
(`openspec list` reports no active change; `openspec/changes/` holds only
`archive/`). Read-only on the tree; no stack booted; no suite run; no fixture
regenerated. This file REPLACES the 2026-10-03 analysis written at `a1d1c8d`
(git keeps it).

Sources read whole: `docs/plans/system-hud/chain.md`, `docs/plans/system-hud.md`,
`docs/handoffs/add-burn-cost-overlay-rulings.md` (RULINGs 1-7 and the left-open
list), `openspec/specs/system-console/spec.md`,
`openspec/specs/system-space-view/spec.md` lines 32-248, 478-827 and 3324-3616,
`openspec/specs/figure-formatting/spec.md` lines 378-642,
`frontend/components/space/{SystemSpaceView,SpaceCommandPanel,VitalsStrip,Gauge}.tsx`,
`frontend/hooks/use-burn-preview.ts`, `frontend/lib/types/fleet.ts`,
`backend/fleet/service.go` 555-600, 735-770, 915-1040, `backend/fleet/handler.go`
300-322 and 655-720, `docs/handoffs/clear-burn-preview-on-commit-journey.md`,
`fix-burn-order-geometry-refusals-journey.md`,
`followup-explain-withheld-burn-command.md`. The design canvas was not read by
me; the orchestrator's 2026-10-05 reading of it is taken as given.

INFERRED marks a scenario the design implies but does not state. "Inferred by
code reading" marks a claim not observed on a running stack.

---

## What changed since the 2026-10-03 analysis

1. **This link is the overlay alone.** The lift, the panel's prop conversion, the
   harness migration, the running-mine fix, the docked-at-target precondition and
   the commit-clear all landed in three predecessor links. Old groups A and B
   (13 tasks) are gone; old Q7, Q10, Q12 are closed.
2. **The value the overlay needs already exists.** `SystemSpaceView.tsx:793`
   computes `currentQuote` once and hands it to the panel for the fuel ceiling.
   The overlay is its second reader. Every withheld, stale, failed, resumed and
   committed state is already folded into that one value (section 2).
3. **I now recommend NO `system-space-view` delta at all** (old analysis: two
   MODIFIED, one conditional). The stale-preview requirement has been rewritten
   twice and now has 9 scenarios; the taught rule "a clause about a new surface
   may only say what that surface contributes" puts the overlay's withdrawal in
   `system-console`. The Fan-In strip-driver list is already non-exhaustive at
   HEAD (the mining pill's running-mine read is not in it). The chain table's
   row ("MODIFIED `system-space-view` (stale-preview presentation; the fan-in's
   strip-driver list if ruled enumerated)") is therefore an over-count this
   time. This is Q1, for the orchestrator to rule.
4. **Old Q13 narrowed to one state.** With a current quote in hand, the Burn
   control can be unavailable for exactly one reason: the canvas is unavailable.
5. **A new drift candidate on this exact cell.** After a failed own-fleets
   refetch over retained data, the fuel and hold cells keep drawing the earlier
   read's figures (section 6, D1). Not filed anywhere I can find.
6. **The view harness fixtures cannot show an overlay as they stand.** Both
   view-level harnesses seed `cargo: {}` (fuel gauge `no-data`) with
   `cargoCapacity: 40` against a quote costing 744.2984 t (section 5).
7. **Test counts moved.** `SpaceCommandPanel.test.tsx` is now 52 tests / 1111
   lines and needs no edit; `SystemSpaceView.burn-preview.test.tsx` (22) and
   `SystemSpaceView.stranding-notice.test.tsx` (47) exist and are where the
   overlay's lifetime is observed.
8. **Estimate: 33 tasks (range 30-39)**, down from a 37 floor for the unsplit
   link, but a larger share of the cap than RULING 9's "about 15".

---

## 0. Headline findings

1. **No ruling is contradicted by the tree.** RULINGs 2-7 stand. Two notes, not
   contradictions: RULING 5's line reference `SpaceCommandPanel.tsx:183` is now
   `:224`; RULING 4's "a tone already on the strip's gauges" can only mean a zinc
   shade, because `Gauge.tsx:52-59` holds nothing else.
2. **RULING 3's two edge states are confirmed in `backend/fleet`** (section 3),
   plus a third, unreachable for a spawned hull.
3. **Requirement structure: 2 ADDED `system-console`, 0 MODIFIED anywhere**
   (recommended; Q1 and Q2 are the two rulings that could add a MODIFIED block).
4. **Painting is the unsolved part.** RULING 3 says the extent is drawn "so it is
   visible over the fill". On a 6 px by 40 px rail an opaque start-anchored
   extent hides the fill's end, which is the one thing the fuel gauge exists to
   show. The mock avoids this only because it draws nothing in the affordable
   state and only the overhang in the unaffordable one. Q4.
5. **No hard-stop candidate.** Every open question has a recommendation with a
   basis in the repo or a most-reversible option.

---

## 1. Capability map and requirement structure

| Capability | New or delta | Verdict |
| --- | --- | --- |
| `system-console` | delta | **2 ADDED** requirements. No live requirement MODIFIED (conditions below). |
| `system-space-view` | none recommended | Three candidates checked; each is a ruling (Q1). |
| `figure-formatting` | none | The overlay carries no figure (section 3). |
| `fleet-roster`, `docked-fleet-actions` | none | Neither names the fuel gauge, the strip or the preview's presentation. `docked-fleet-actions` line 627 only says a refusal in the no-quote state is not its concern. |

### 1.1 `system-console` — ADDED A (the overlay's content)

Draft header: *The Fuel Gauge Draws the Current Burn Quote's Served Fuel Cost as
One Start-Anchored Extent.*

Draft rule: WHILE the mounting view supplies a successful, current burn preview
for the acting fleet and the current selection, the fuel gauge SHALL draw one
cost extent, anchored at the gauge's start, whose length is that preview's
served `fuelCostTons` over the acting fleet's served `cargoCapacity` (the
denominator the fill uses), limited to the rail. Its affordability state SHALL
be that preview's served `affordable` flag, unchanged. The strip SHALL NOT
compute a shortfall, a remainder or an affordability, SHALL NOT decide the state
by comparing the extent with the fill, and SHALL NOT print the cost or any
difference as text. The fill's own extent and the gauge's existing no-data /
filled attribute are unchanged by the overlay.

| # | Scenario (draft title) | WHEN / THEN in one line | Provenance |
| --- | --- | --- | --- |
| A1 | A current quote draws a cost extent on the gauge's own scale | cost 30 t, capacity 200 t: an extent from the start, 15 % of the rail; the fill's geometry is what it was | chain doc, RULING 3 |
| A2 | An affordable quote's extent carries the affordable state | served `affordable: true`: the gauge's cost-state reads affordable | RULING 3, 4 |
| A3 | An unaffordable quote's extent carries the unaffordable state | served `affordable: false`: cost-state reads unaffordable, drawn in the existing amber | RULING 3, 4 |
| A4 | The state follows the served flag when the extent runs past the fill | fuel 40 t, cost 60 t, `affordable: true` (a burning fleet's re-target): state affordable | RULING 3; section 3 |
| A5 | The state follows the served flag when the extent lies inside the fill | fuel 80 t, cost 20 t, `affordable: false` (an open station-keeping hold): state unaffordable | RULING 3; section 3 |
| A6 | A cost above the capacity is limited to the rail | cost 744.3 t, capacity 200 t: the extent is the whole rail, never beyond it | Q3 |
| A7 | A zero cost is still a drawn overlay; a cost that is not a finite non-negative number draws none | cost 0: cost-state present, extent zero. Cost `NaN`/negative: no overlay | INFERRED; Q3 |
| A8 | With no fill to read it against, no overlay is drawn | capacity unserved or not positive, or no served fuel: no overlay, gauge still `no-data` | Q2 |
| A9 | The overlay exposes no figure and no control | no `data-raw`, no `data-unit`, no text, no accessible value, no focusable element; the gauge's existing state attribute keeps its three values | RULING 2; `Gauge.tsx:1-30` |
| A10 | The hold gauge never draws a cost overlay | with a current quote supplied, the hold gauge's subtree is unchanged | INFERRED (shared atom) |
| A11 | The overlay is drawn alongside the draining marker | burning acting fleet, re-target quote current: both the marker and the overlay | INFERRED (live "A burning fleet's re-target is previewed") |
| A12 | The affordability is never carried by the overlay alone | whenever the overlay is drawn in the view, the view also shows the quote's affordability as text | INFERRED; Q4 |

### 1.2 `system-console` — ADDED B (the overlay's lifetime)

Draft header: *The Cost Overlay Is Drawn Only for the View's Successful, Current
Preview, as the View Last Read It.*

Draft rule: the overlay SHALL be drawn exactly while the mounting view holds a
successful, current preview for the acting fleet and the current selection, as
`system-space-view`'s *A Failed or Stale Preview Is Never Presented as a Current
Quote* uses that phrase, and SHALL be absent otherwise. That is the same
determination from which the burn command's fuel ceiling is derived, so the
overlay and the ceiling are present and absent together. The requirement SHALL
NOT restate the withheld states or the committed order's life; it names the
owning requirements and inherits their lags. A stale quote is withdrawn from
the gauge, not marked (RULING 5). The overlay's state is the quote's and is at
most one preview refresh interval old; nothing else refreshes it (Q10).

| # | Scenario (draft title) | WHEN / THEN in one line | Provenance |
| --- | --- | --- | --- |
| B1 | With no selection there is no overlay | no selection: no overlay, fill as served | chain doc |
| B2 | A first preview still pending draws no overlay | selection made, first response not landed: none | INFERRED (section 2) |
| B3 | A failed first preview draws no overlay | no-quote state shown on the panel: none on the gauge | RULING 5 |
| B4 | A failed refresh withdraws the overlay and nothing else | refresh fails over shown figures: overlay gone; fuel figure, range and fill unchanged; the panel's figures stay, marked stale | RULING 5 |
| B5 | A later successful refresh restores it | next refresh succeeds: overlay back at the new cost and flag | INFERRED from the live stale requirement |
| B6 | Replacing the selection never shows the previous target's cost | target X overlaid, Y selected: none until Y's first response, then Y's | INFERRED (`use-burn-preview.ts:58`, `gcTime: 0`) |
| B7 | Clearing the selection withdraws the overlay | selection toggled off: none | chain doc journey |
| B8 | Switching the acting fleet never shows the previous fleet's cost | fleet B made acting, selection kept: none until B's first response | INFERRED |
| B9 | A withheld preview draws no overlay | three arrangements (running mine, lane transit, target is the fleet's own host): none, and no no-quote state | INFERRED from live withheld states |
| B10 | A committed order withdraws the overlay for its life | accepted commit: none at acceptance, through the gap, while the read reports that burn, and across a failed own-fleets read | live committed-selection requirement |
| B11 | A resumed preview draws no overlay until its restoring response lands | two arrangements (mine ends; order ended by cutting the drive): none while pending, then the new one | taught, 2a-ii ("what is shown at the moment it resumes?") |
| B12 | Another target is overlaid while the committed target is not | committed to X, Y selected: Y's overlay; X selected again: none | live "Not a dead end" |
| B13 | The overlay and the fuel ceiling appear and disappear together | across B1-B12's transitions, overlay present exactly when the ceiling is | one determination, two readers |
| B14 | The overlay is drawn while the canvas is unavailable | selection held, canvas lost, quote current: overlay drawn, as the panel's figures are | Q5 |
| B15 | The overlay is silent and costs no request | appearing, changing, withdrawing: no live-region text; one preview request per interval with both readers mounted | live "Quote changes are not announced", "The Strip Issues No Read of Its Own" |

Counts: **A 12 scenarios, B 15 scenarios, 27 in all.** A and B fail
independently (wrong geometry or state versus wrong lifetime), so two
requirements is right; a third for A9/A10/B15 would only move scenarios.

### 1.3 Live `system-console` requirements: MODIFIED or ADDED beside?

| Live header (exact) | Scen. | Verdict |
| --- | --- | --- |
| `The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge` | 4 | **No delta, on two conditions.** (1) The overlay's state lives on its own attribute and `data-gauge-state` keeps `no-data` / `empty` / `filled` (`vitals-strip-journey.spec.ts:320` asserts `filled`). (2) Q2 is ruled "no overlay on a no-data gauge". If Q2 is ruled the other way, the text "the gauge SHALL render no fill" and the `no-data` attribute are contradicted by a gauge that draws a cost, and this requirement is MODIFIED carrying its four headings verbatim: `The fuel cell shows tonnage and range`, `An unserved roster reads absent, and the gauge shows no fill`, `A fleet holding no fuel reads absent, exactly as its roster row does`, `The gauge's no-data state is DOM-distinguishable from a sub-pixel fill`. |
| `While Burning, the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain` | 2 | True after the change. The overlay moves only when a preview read lands. |
| `The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented Gauge` | 6 | True, and it constrains the atom: "the gauge itself SHALL expose no figure, no fill percentage and no accessible value". A numeric extent attribute on the shared atom would break it. |
| `The Strip Carries No Verb` | 3 | True if the strip gets no retry for a stale quote. |
| `The Strip Issues No Read of Its Own` | 1 | True; its text already names "no preview request". |
| `The Strip Announces Only Its Own Balance Changes` | 1 | True if the overlay is silent. |
| `The Strip Is Laptop-First and Never Overflows the View` | 2 | True; the rail's size does not change. |
| the other six | — | Unaffected (fleet cell, chevron, pill, credits, clock, selection). |

`## Purpose`: true as written. After archive, check the live paragraph survived
(the archiver discards a delta's `## Purpose`; an existing capability's should
be untouched, and the 2a-iii-b rehearsal found it preserved).

### 1.4 `system-space-view` — three candidates, none recommended

| Live header (exact) | Scen. | Why it was a candidate | Recommendation |
| --- | --- | --- | --- |
| `A Failed or Stale Preview Is Never Presented as a Current Quote` | 9 | Its text binds "figures"; the overlay is a graphical projection of the quote | **No delta.** ADDED B states the withdrawal for its own surface. A clause here ("every graphical projection SHALL be withdrawn") would newly bind the panel's amber styling and `preview-affordable` line under a stale quote (`SpaceCommandPanel.tsx:224,234,307-315`), which RULING 5 left open and Q7 recommends leaving alone. |
| `System Space View Route and Data Fan-In` | 15 | Lines 78-83 list what drives the strip; the preview read is not in the list | **No delta.** The sentence says "SHALL be driven by", not "only by", and it is already incomplete at HEAD: the strip's mining pill is driven by the running-mine read (`SystemSpaceView.tsx:453,744`), which the list omits (D2). Link 2b must MODIFY this requirement anyway (the column it describes retires). |
| `A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read` | 21 | Its text and first scenario enumerate the preview's elements "(its figures, its fuel ceiling, its affordability line and the preview's own stranding line)"; the overlay is a fifth | **No delta.** ADDED B10 states it for the overlay, by name. A 21-scenario MODIFIED block to add two words is the archiver trap at its largest. |

If the orchestrator rules any of these enumerations closed, the MODIFIED block
must carry every live heading verbatim. The nine of the stale requirement:
`A failed first preview shows a no-quote state, not empty figures`; `A failed
first preview offers a retry`; `A failed refresh marks the shown figures stale`;
`A later successful refresh clears the stale marking`; `The burn stays
committable without a quote, labelled as uncapped`; `A stale figure never
becomes a cap`; `A failed restoring request is a no-quote state, not a stale
one`; `A withheld preview is never presented as a failed one`; `The
uncapped-burn label is never shown beside an unavailable burn command`. The
fifteen of Fan-In are at spec lines 135-247; copy them with
`grep -n '^#### Scenario' openspec/specs/system-space-view/spec.md`, not from
this file.

**Change structure.** One change, `add-burn-cost-overlay`. Not splittable into
two shippable halves (section 5).

---

## 2. The overlay's lifetime, against the lifted quote's own currency

### 2.1 The value that already exists

`SystemSpaceView.tsx:770-793`:

- `mineRunning = !!runningMine && runningMine.eta > worldTime` (`:770`)
- `dockedAtTarget` (`:771-772`)
- `orderLive = awaitingRead || stillRunning` (`:773-784`)
- `selectionCommitted = orderLive && !!order && selectionKey(selection) === order.selectionKey` (`:786`)
- `previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget && !selectionCommitted` (`:787`)
- `burnPreview = useBurnPreview({ fleetId, selection, commitWouldBeAccepted: previewWanted })` (`:788-792`)
- **`currentQuote = burnPreview.preview && !burnPreview.stale ? burnPreview.preview : null`** (`:793`)

and in the hook (`use-burn-preview.ts:55,84-101`): `enabled = !!fleetId &&
!!request && commitWouldBeAccepted`; on disable the query is cancelled and
removed; `preview = enabled ? (query.data ?? null) : null`; `stale = failed &&
preview !== null`; `noQuote = failed && preview === null`.

So `currentQuote` is non-null exactly when there is an acting fleet, a selection
with a wire request, none of the four withheld states, a response in hand for
this (fleet, selection) key, and no error on the newest attempt. **That is "a
current, successful quote for the current selection and acting fleet", and it is
already the panel's only source for the fuel ceiling**
(`SpaceCommandPanel.tsx:148`). The overlay must be its second reader and must
not derive currency again (not from `burnPreview.preview`, not from `stale`, not
from `previewWanted`).

Recommended wiring (design.md, not spec): the view passes the strip a narrow
optional prop built from `currentQuote` (cost and flag only), omitted when
`currentQuote` is null (`frontend/CLAUDE.md`: omit optional props, never pass
`undefined`). The strip never receives a `BurnPreview`.

### 2.2 State by state

"Shows" is what the overlay must show. "Shared" is the existing derivation that
already yields it. "Observed by" is the existing view-level test that watches
that derivation; the overlay needs its own assertion beside each (section 5).

| State | `currentQuote` | Overlay shows | Shared derivation | Observed at the view today by |
| --- | --- | --- | --- | --- |
| No selection | null (`request` null) | nothing | hook `enabled` | `burn-preview.test.tsx:666` and the panel's prompt |
| No acting fleet / own-fleets never served | null (`fleetId` null) | nothing | `previewWanted` | `SystemSpaceView.test.tsx:1214` (strip absent form) |
| First request in flight | null (`query.data` undefined) | nothing | hook | implicit in every `burn-preview` test before the first answer |
| Successful quote | the quote | cost extent, state = `affordable` | `:793` | `burn-preview.test.tsx:666,684` via figures and ceiling |
| Refresh in flight over a good quote | the previous quote | unchanged until the response lands | hook (data kept, no error) | `:684` |
| Refresh failed over shown figures (stale-with-data) | **null** | nothing; fill and fuel figures unchanged | `:793` (`!stale`) | `burn-preview.test.tsx:696` (no `maxFuelTons`, no ceiling) |
| First request failed (no-quote), incl. a server refusal (409/404 since `fix-burn-order-geometry-refusals`) | null | nothing | hook `noQuote` | `use-burn-preview.test.tsx`; panel no-quote tests |
| Later successful refresh | the new quote | new extent and state | hook | `SpaceCommandPanel.test.tsx` stale-clears test (props); `burn-preview.test.tsx:696` family |
| Selection replaced | null until the new key answers | nothing, then the new target's | query key carries the selection; `gcTime: 0` | `stranding-notice.test.tsx:1380,1393` |
| Selection cleared | null | nothing | hook `enabled` | `burn-preview.test.tsx:775` |
| Acting fleet switched | null until the new key answers | nothing, then the new fleet's | query key carries the fleet | `stranding-notice.test.tsx:1457,1498` |
| Running mine, as last read | null | nothing | `mineRunning` → `previewWanted` | `burn-preview.test.tsx:438,456,507` |
| Lane transit, as last read | null | nothing | `!acting.jump` | `burn-preview.test.tsx:567` |
| Docked at the selected target | null | nothing | `dockedAtTarget` | `burn-preview.test.tsx:592,611` |
| Committed selection: from acceptance, through the commit-to-read gap, while the read reports that burn, across a failed own-fleets read | null | nothing | `selectionCommitted` ← `orderLive` | `stranding-notice.test.tsx:1138,1168,1182,1207,1334` |
| Commit in flight (clicked, not yet accepted) | the quote | unchanged | — | not separately observed; nothing changes until `handleCommitAccepted` |
| Response lands after the selection was replaced | the new selection's quote | the new selection's overlay | `selectionKey` comparison (`:786`) | `stranding-notice.test.tsx:1433` |
| Resumed preview (a withheld state ended; restoring request pending) | **null** (query was removed on disable) | nothing until the restoring response lands | hook `:84-89` | `burn-preview.test.tsx:850,862,878`; `stranding-notice.test.tsx:1227` |
| Restoring request failed | null (no-quote, never stale) | nothing | hook | `burn-preview.test.tsx:899` |
| Committed order ended at the selected body | null (docked-at-target takes over) | nothing | `dockedAtTarget` | `stranding-notice.test.tsx:1299` |
| Burn this view did not commit (opened on a burn; remount) | the re-target quote | overlay, with the draining marker | no committed record | `stranding-notice.test.tsx:1586,1595` |
| Canvas unavailable, selection held | the quote (canvas is not in `previewWanted`) | overlay (Q5) | — | **nothing pins this at the view** (follow-up F3 says so) |
| Own-fleets refetch failed over retained data | the quote (`acting` survives on cached data) | overlay (Q8) | — | **nothing**; see D1 |

### 2.3 How to write it

- **As last read.** ADDED B says "as the view last read it" once and inherits
  each withheld state's lag from its owner. It never says "while the fleet is
  mining" or "while the order runs".
- **Two clocks, stated as a bound.** The fill comes from the own-fleets read and
  the cost and flag from the preview read. No mutation invalidates the preview
  key (`use-fleets.ts:44-46,152-155`, `use-market.ts:80-85,120-122`), and live
  text requires "exactly one fresh preview request ... per elapsed interval ...
  and none between". So after a refuel the fill moves at once and the overlay's
  flag can be up to one `PREVIEW_REFRESH_MS` (10 s) behind. Say so; add no
  invalidation (Q10).
- **Resume.** Nothing to build: the hook discards on disable, so the overlay is
  empty at the moment of resume by construction. It still needs its own
  view-level row (B11), because a later change to the hook's discard would
  otherwise be caught only on the panel.
- **A derivation moves out from under its test only if it is copied.** If the
  dev reads `burnPreview.preview` for the strip instead of `currentQuote`, every
  panel test stays green and the overlay shows stale quotes. B4 and B13 are the
  rows a wrong reader fails.

---

## 3. Figure-versus-wire sweep

| Value the overlay renders or positions by | Typed at | Served? | Nullable / absent? | Overlay rule |
| --- | --- | --- | --- | --- |
| Cost extent numerator `fuelCostTons` | `lib/types/fleet.ts:208` (`number`) | Yes, unconditionally (`backend/fleet/handler.go:318`, no `omitempty`) | Typed non-optional, but `fleet-service.ts:73-79` casts the response with no runtime check. 0 is reachable (`backend/fleet/fuel.go:39-44`). | Finite and > 0: extent. Exactly 0: overlay present, zero extent. Not a finite number, or negative: no overlay. Above capacity: limited to the rail (Q3). |
| Affordability state `affordable` | `lib/types/fleet.ts:209` (`boolean`) | Yes, unconditionally (`handler.go:307-319`, comment says why) | Same cast. | Copied. If it is not a boolean, no overlay (do not default; the panel's `!preview.affordable` at `SpaceCommandPanel.tsx:224` would read a missing flag as unaffordable, which is the panel's business). |
| Denominator `roster.cargoCapacity` | `lib/types/fleet.ts:122` (`number`); `Fleet.roster?` at `:167` | Owner-only (`handler.go:697-717`); the acting fleet is always own | `roster` absent on a foreign fleet; capacity can be 0 for a roster with no hold (`backend/fleet/roster.go:93-99`) | `Gauge.tsx:61-63` already treats undefined, non-finite and <= 0 as `no-data`. No overlay then (A8). |
| The fill it sits on, `roster.cargo.fuel` | `lib/types/fleet.ts:121` (`Record<string, number> \| null`) | Yes; a kind held at zero is omitted, and `cargo` can be `null` | "Dry" and "not loaded" are one served condition (live Fuel Cell requirement) | Not an input to the extent. Whether the overlay is drawn without it is Q2. |
| "Shortfall", remaining fuel, the fuel the quote was solved against, `Refund`, `OpenHoldUpkeep`, `FuelActive` | — | **No** | — | Never rendered, never computed (RULING 3, fence). |
| Fuel ceiling `cost × BURN_FUEL_ALLOWANCE` | client-derived, panel only | — | — | Not drawn (RULING 6). |
| `strandingWarning` | `lib/types/fleet.ts:210` | Yes | — | Not shown on the strip (Q6). |
| Current / stale / no-quote | hook state | client state by design | — | Read through `currentQuote` only. |

**RULING 3's two edge states, checked in `backend/fleet` (read-only; inferred by
code reading, not observed on a stack).**

- The predicate is `CurrentFuel + Refund - OpenHoldUpkeep >= FuelCostTons`
  (`service.go:584-589`); the preview reports it verbatim (`service.go:998`).
- `CurrentFuel` is the stored `f.Cargo["fuel"]` (`service.go:747`), which is also
  what the roster serves (`handler.go:716`, `Cargo: f.Cargo`). So the fill is
  `CurrentFuel` as of the own-fleets read.
- **Burning fleet's re-target.** `Refund = priorBurnRefund(f, now)`
  (`service.go:746,1031-1036`), positive for a running, not-yet-arrived burn
  (`fuel.go:59-73`); the running burn's cost was debited at commit
  (`service.go:872-887`). So `affordable: true` with `fuelCostTons > fuel` is
  reachable: the extent runs past the fill in the affordable state. **Confirmed.**
- **Open station-keeping hold.** `OpenHoldUpkeep`
  (`service.go:756-757`, `stationkeep_hold_release.go:575-581`) is positive for
  an open hold before its dry instant and is priced in memory only, not written
  to cargo. So `affordable: false` with `fuelCostTons <= fuel` is reachable: the
  extent sits inside the fill in the unaffordable state. **Confirmed.**
- A third: `!FuelActive` returns `true` whatever the cost (`service.go:585-587`).
  It needs a nil `Cargo`, which the code says is "never true of a real, spawned
  hull" (`service.go:1007-1017`), and such a fleet serves `cargo: null`, so the
  gauge is `no-data`. Needs no scenario if Q2 is ruled as recommended.
- A fourth source of disagreement is not a rule at all: the two reads are taken
  at different instants (section 2.3).

**Does the overlay carry figure text or `data-raw`?** No (RULING 2).

**Does a test-facing `data-*` attribute fall under `figure-formatting`?**

- The total-function check (`lib/format/assert-figures.ts`, and the last
  scenario of *A Player-Facing Figure Is Produced Only By the Shared Formatter*)
  binds "any element carrying `data-raw` and `data-unit`". The closed
  vocabulary is `FigureUnit`'s eleven tokens (`lib/format/figures.ts:18-29`); it
  has no ratio or percentage token.
- **State attribute: provably not a figure.** A word token from a closed set
  (`affordable` / `unaffordable`, absent when there is no overlay), on an
  `aria-hidden` element with no text, carrying neither `data-raw` nor
  `data-unit`. Same class as the existing `data-gauge-state`, `data-affordable`
  (`SpaceCommandPanel.tsx:310`) and `data-available` (`VitalsStrip.tsx:175`),
  none of which the check binds. No `figure-formatting` delta.
- **Extent: do not expose it as a numeric attribute.** A `data-*` percentage is
  a number of a kind with no token, on an atom whose hold-cell requirement says
  the gauge exposes "no fill percentage". It would not trip the check (no
  `data-raw`), which is exactly why it is dangerous: it is link 1's "non-figure
  that is not provably one". Tests read the extent the way `Gauge.test.tsx:135-175`
  already reads the fill: the element's inline `style.width` and `style.left`.
  The state attribute alone makes a sub-pixel or zero extent DOM-observable.

---

## 4. Audit of "unaffected" and "no delta" claims

| # | Claim (source) | Verdict | Evidence |
| --- | --- | --- | --- |
| a | The strip "carries no verb" survives | **Holds, conditionally** | `The Strip Carries No Verb` scenario 3: every interactive element is the chevron or its menu. Holds if the overlay is not focusable and the strip gets no stale-quote retry (the retry stays at `SpaceCommandPanel.tsx:332-341`). A9 is the row. |
| b | The strip "renders only figures the mounting view supplies" (Purpose; `The Strip Issues No Read of Its Own`) | **Holds** | The overlay's inputs are props from `SystemSpaceView.tsx:788-793`. Must not be satisfied by importing `useBurnPreview` into `VitalsStrip` or `Gauge`: that would double the request rate. B15 and a static one-call-site guard. |
| c | The gauge's existing accessibility semantics are unaffected | **Holds, with a cost** | `Gauge.tsx:82` puts `aria-hidden="true"` on the root, so the overlay is invisible to assistive technology and its affordability reaches a screen-reader user only through the panel's `preview-affordable` text. True while the panel is on screen; link 2b moves the panel into a dock that is collapsed by default. Flag forward (Q4). |
| d | The hold gauge is unaffected | **Holds if the atom's new input is optional and the hold cell never passes it** | Shared atom, `VitalsStrip.tsx:83,139`. A10. The hold-cell requirement's "no figure, no fill percentage and no accessible value" binds the atom. |
| e | `figure-formatting` is untouched (chain doc; RULING 2) | **Holds** | Section 3. Breaks only if an extent is exposed as a number or text. |
| f | The command panel's own unaffordable styling under a stale quote is "left to the panel" (RULING 5) | **Open, and I recommend leaving it** | `SpaceCommandPanel.tsx:224`: `unaffordable = !!preview && !preview.affordable`, no `stale` term; the amber panel (`:234`) and the `preview-affordable` line (`:307-315`) stay under a stale quote, beside the `preview-stale` marking (`:327-331`). Live text asks for figures to be "marked ... stale rather than continuing to present them as current"; a marked panel satisfies it as written. After this link, a stale unaffordable quote shows an amber, stale-marked panel and no gauge overlay. Not a contradiction (marked on one surface, withdrawn on the other), and A12 still holds because the overlay is absent. Q7. |
| g | The 1280×720 width floor is unaffected | **Holds** | The rail stays `h-1.5 w-10` (`VitalsStrip.tsx:83`); the overlay is inside an `overflow-hidden` rail (`Gauge.tsx:85`). Breaks only if Q4 is answered by widening the rail or adding text. |
| h | Chain table: "MODIFIED `system-space-view` (stale-preview presentation; the fan-in's strip-driver list if ruled enumerated)" | **Over-counts** | Section 1.4. Neither is needed. |
| i | Chain doc section: the link "lifts", "converts to props", "carries a filed defect", MODIFIED `system-console` | **Stale by the section's own first paragraph** | Done by `lift-burn-preview-to-view`. And it is ADDED, not MODIFIED: no overlay requirement exists. |
| j | Chain doc journey: "pick an unaffordable target and watch the segment extend past the fill" | **Not arrangeable by picking** | Section 8. Starting fuel 100 t (`backend/fleet/fuel_params.go:71`); no e2e spec has ever read `data-affordable="false"`. |
| k | Scoping doc: "the red segment past the fill is the shortfall" | **False as a quantity; ruled** | RULING 3. The mock's width is the true shortfall; the wire has none. |
| l | `While Burning, the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain` is unaffected | **Holds** | The overlay changes only when a preview response lands; no interpolation. A11 covers coexistence with the marker. |
| m | `Animation Never Re-Renders the View, and Never Starves a Navigation` is unaffected | **Holds** | No new state or effect is needed in the view; the strip re-renders on the existing coarse tick and on a preview response. The dev must not copy the quote into state by an effect. |
| n | `fleet-roster`, `docked-fleet-actions` take no delta | **Holds** | No reference to the gauge, the strip or the quote's presentation in either. |
| o | `use-burn-preview.ts` needs an edit | **No** | The overlay needs nothing from the hook. Its header comment still counts three withheld states (lines 26-30); chain doc records that as link 4's (architect A10). Leave the file alone. |

---

## 5. Test-file sizing (measured at `d965f5d`) and task estimate

`it(` counts include `it.each(`.

| File | Lines | Tests | What must change |
| --- | --- | --- | --- |
| `frontend/components/space/Gauge.test.tsx` | 233 | 18 | No edit if the new input is optional. About 7 new tests. Extent read from inline style, as lines 135-175 do. |
| `frontend/components/space/VitalsStrip.test.tsx` | 673 | 40 | No edit (one `strip()` helper, line 82, spreads overrides). About 5 new tests. Its fleet fixture serves fuel, so it can show an overlay. |
| `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` | 924 | 22 | Real hook, real panel, real strip; **mocks `useMyFleets`** (line 74). Its fleet fixture is `cargo: {}`, `cargoCapacity: 40` (lines 256-259) and its quote costs 744.2984 t (line 297): fuel gauge `no-data`, cost 18 times the capacity. Needs a fuel-bearing fixture and a quote below capacity before any overlay assertion means anything. About 7 new tests. No existing test edited. |
| `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` | 1628 | 47 | Real `use-fleets` (no mock), service boundary mocked, reads settled by call index. Same `cargo: {}` / 40 / 744.2984 fixture (lines 253-256, 314). The only harness where the commit rows (B10-B12) can be observed. About 3 new tests. |
| `frontend/components/space/SystemSpaceView.test.tsx` | 1317 | 52 | Mocks `useBurnPreview` to `{ preview: null, ... }` (line 210): can never show an overlay. No edit. One strip-mount test exists at 1162-1214. |
| `SystemSpaceView.render-loop` / `scan-refetch` / `scan-settle-announcement` / `scan-targets-refetch-on-arrival` / `sighting-log-mount-ordering` / `sighting-log-no-ghost-reasons` `.test.tsx` | 460 / 300 / 181 / 886 / 215 / 284 | 6 / 3 / 1 / 11 / 1 / 4 | Each mocks `useBurnPreview` to the null shape (now the right shape). No edit. `render-loop` is the guard that the wiring adds no re-render loop. |
| `frontend/components/space/SpaceCommandPanel.test.tsx` | 1111 | 52 | No edit unless Q7 is ruled against the recommendation. |
| `frontend/hooks/use-burn-preview.test.tsx` | 534 | 19 | No edit. |
| `VitalsStripFleetCell.test.tsx`, `VitalsStripPill.test.tsx` | 220, 451 | 18, 27 | None. |
| `frontend/e2e/tests/vitals-strip-journey.spec.ts` | — | — | Asserts `fuel-gauge` `data-gauge-state` is `filled` (line 320). Stays true only with a separate overlay attribute. No edit. |
| new `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` | — | 1 | Written at the gate. |

Nothing mocks `./VitalsStrip` or `./Gauge` anywhere, so every `SystemSpaceView*`
file renders the real strip.

**The mocked-harness trap (chain doc, 2a-iii-b Taught), applied here.**

- `burn-preview.test.tsx` mocks `useMyFleets`, so after an accepted commit no
  read ever answers and the committed state holds until unmount. An overlay
  asserted to *return* after a commit there fails by construction. B10-B12 go in
  `stranding-notice.test.tsx`.
- A test that hand-sets the strip's cost prop observes an arrangement, not the
  derivation. That is right for group B below (the strip's own rendering) and
  wrong for groups C and D.
- The seven files that mock `useBurnPreview` cannot observe the overlay at all.
- A test that never selects passes against every lifetime bug.
- With the existing fixtures the fuel gauge is `no-data`. Under the recommended
  Q2 ruling, existing tests would show no overlay whatever the wiring does, so a
  green existing suite says nothing about the overlay.

**Task estimate: 33, range 30-39.** One task per test arrangement group
(`clear-burn-preview-on-commit` RULING 13's unit; a parametrised pair is one).

| Group | Tasks | n |
| --- | --- | --- |
| A. Gauge atom (`Gauge.test.tsx`) | extent geometry and paint order (A1); clamp, zero, non-finite (A6, A7); state attribute with `data-gauge-state` unchanged (A2, A3 at the atom); no overlay on a no-data gauge (A8); decorative invariants with an overlay present, and no overlay when the input is omitted (A9, A10); implementation; tone classes through the colour gate | 7 |
| B. Strip (`VitalsStrip.test.tsx`) | affordable / unaffordable pair from a supplied cost; flag-versus-picture pair (A4, A5); omitted prop draws none, and draining marker coexists (A11); no verb, no announcement, no request with an overlay present; `FuelCell` and props | 5 |
| C. View lifetime, mocked own-fleets (`burn-preview.test.tsx`) | fuel-bearing fixture, overlay reader and smoke; current quote and pending (B1, B2); failed first, failed refresh, restore (B3-B5); selection replaced and cleared (B6, B7); the three withheld arrangements and resume after a mine (B9, B11a); overlay and ceiling together, with text carrier (B13, A12); canvas unavailable (B14); silence and one request per interval (B15) | 8 |
| D. View lifetime, real own-fleets (`stranding-notice.test.tsx`) | fixture; committed order's life incl. gap and failed read (B10); cut returns it only after the restoring response (B11b); another target and back (B12); acting-fleet switch (B8) | 5 |
| E. Wiring | the view passes cost and flag from `currentQuote`; static guard: one `useBurnPreview` call site, neither `VitalsStrip` nor `Gauge` imports a hook | 2 |
| F. Gate | per-commit gate; journey spec; QA names the closing line per row; tier 4 then tier 3; reconcile, archive rehearsal, Purpose check; chain doc and rulings update | 6 |

Low end (30): Q5 and Q8 ruled out of the change, B8 folded into B6. High end
(39): Q2 ruled the other way (+1 MODIFIED block, +2 tasks), Q7 ruled in (+2),
a non-colour shape treatment with its own tests (+2).

**Against the cap.** 33 is inside it. Both of the last two links landed at
exactly 40 after shedding, and every predecessor grew at least 30 % under panel
review, so expect 38-43 after the panel. The scenarios most likely to multiply
are B9-B12: the adversary will ask for each way a withheld state begins and
ends. The defence is B13 (the overlay is the ceiling's twin) plus the rule that
ADDED B does not restate another requirement's life.

**Seam, if it passes 40. It is not worth a chain link.**

- The module seam (atom and strip versus view wiring) does not give two
  shippable changes: a strip that can draw an overlay nobody feeds is dead code,
  and a wiring change with nothing to draw has no observable behaviour.
- Shed instead, each to a filing: B14 (canvas unavailable) into the existing
  `followup-explain-withheld-burn-command.md`, whose F3 already owns that state;
  the own-fleets-failed case (Q8) into a new drift file for D1; Q7 stays with
  link 4. That recovers 2-4 tasks.
- If the panel still pushes it past 40 after that, the remainder is a filed
  follow-up, not a link.

---

## 6. Code-versus-spec discrepancies at HEAD on this surface

Reported, not resolved. All inferred by code reading.

- **D1. The fuel and hold cells keep an earlier read's figures after a failed
  own-fleets refetch.** `VitalsStrip.tsx:242` reads `acting?.roster` and passes
  it to `FuelCell` and `HoldCell` (`:264-265`) with no `fleetsFailed` term;
  `SystemSpaceView.tsx:1072` passes `acting` unconditionally, and `acting` is
  built from `fleets.data` (`:303-309`), which React Query retains across a
  failed refetch. Only the pill (`:743-744`) and the chevron menu
  (`VitalsStripFleetCell.tsx:74`) are gated. Spec: Fan-In lines 112-116, "The
  vitals strip's fleet, fuel, and hold cells ... never presenting a figure
  served by an earlier successful read as current once that read's most recent
  attempt has failed"; `system-console` *The strip survives a failed own-fleets
  read*. The impl contract said the same (`add-vitals-strip-impl-contract.md`
  615-617: "`fleetsFailed` drives three things at once ... the fuel/hold cells
  read absent"). Every test arranges the failure with `data: undefined`
  (`VitalsStrip.test.tsx:122`, `SystemSpaceView.test.tsx:646,1214`), which
  cannot tell the two implementations apart. Not found in any `defect-*` or
  `drift-*` file. Bears on this link: the overlay would be drawn on a rail
  whose fill is a figure the spec says must not be shown (Q8).
- **D2. Fan-In's strip-driver list omits the running-mine read.** Spec lines
  78-83 list own-fleets, interior, galaxy, session and the clock;
  `SystemSpaceView.tsx:453` reads `useRunningMine` and `:744` feeds it to the
  pill's derivation. `system-console`'s pill requirement itself names "a running
  mine action". Either the list is illustrative or it is already false. Evidence
  for Q1.
- **D3. The chain doc's Link 2a-iv section contradicts itself.** Its first
  paragraph says the link is the overlay alone; its "Delivers", "Why it is the
  expensive half", "Carries a filed defect" and "Touches" paragraphs still
  describe the unsplit link. Its journey line asks for a leg the stack cannot
  arrange by selection (section 8).
- **D4. RULING 5 cites `SpaceCommandPanel.tsx:183`; the expression is at `:224`.**
- **D5. Already filed, still true, not this link's:** the preview curve is never
  drawn (`drift-preview-curve-never-drawn.md`, link 4); the preview keeps
  polling with the canvas unavailable (`followup-explain-withheld-burn-command.md`
  F3); the drift notice shows after every real commit
  (`drift-commit-response-carries-no-delta-v.md`); `use-burn-preview.ts`'s header
  counts three withheld states.
- **D6. The mock shows no affordable-state overlay.** By the orchestrator's
  reading it draws only the fill and, in the unaffordable example, a tone past
  the fill's end. RULINGs 3 and 4 and the chain doc's journey ("select a target,
  watch the fuel gauge grow a cost segment") rule an affordable overlay in. Not
  a tree contradiction; recorded so the UX reviewer knows the affordable state's
  appearance has no mock.

---

## 7. Open questions

Numbered afresh. Old numbers in brackets. "Repo" says whether the answer can be
found in the repository.

**Q1 [Q16, widened] — Does any `system-space-view` requirement take a delta?**
- Lean recorded: none. The chain table says "if ruled enumerated".
- Recommendation: **none of the three** (section 1.4). Basis: the taught rule
  from 2a-iii ("a clause about a new surface may only say what that surface
  contributes"); D2 (the Fan-In list is already non-exhaustive); the 9, 15 and
  21 verbatim headings each block would carry.
- Most reversible: no delta. Adding a MODIFIED later is one block; removing an
  over-broad clause is a spec change.
- Repo: yes.

**Q2 [Q6] — What does the overlay do when the gauge holds no data?**
- Cases: capacity unserved or not positive; no served fuel (a dry fleet and an
  unloaded roster are one served condition).
- Lean recorded: none.
- Recommendation: **no overlay.** Basis: precedence 4. It leaves the live Fuel
  Cell requirement ("the gauge SHALL render no fill", the `no-data` attribute)
  true with no MODIFIED block, and adding the overlay later is additive.
- Cost, stated plainly: a dry fleet that selects a target sees no overlay. Its
  fuel figure reads `—` and the panel says "Not affordable with the fuel
  aboard". That is the fleet for which the overlay would matter most.
- The other option (draw the cost on an empty rail; needs only a valid
  capacity) is more informative and forces MODIFIED on the Fuel Cell
  requirement (4 scenarios) to say what `no-data` means beside a drawn cost.
- Repo: yes (a product trade-off, but rulable by precedence).

**Q3 [Q4] — The clamp, and degenerate costs.**
- Lean recorded, on existence only: "needs its own clamp rule for
  `fuelCostTons > cargoCapacity`" (`add-vitals-strip` design.md).
- Recommendation: limit the extent to the rail; no marker distinguishing a
  clamped overlay from an exact fit; zero cost is a drawn overlay with zero
  extent; a cost that is not a finite non-negative number draws none. Basis:
  the atom already clamps segments (`Gauge.tsx:90-93`, `Gauge.test.tsx:157,163`);
  RULING 2 forbids the text a marker would need; the served flag already says
  what a clamp could add (by the backend predicate a cost above the capacity
  cannot be affordable for a fuel-tracked fleet, which I note as an inference
  and the spec must not assert).
- Most reversible: the same.
- Repo: yes.

**Q4 [Q14, Q15] — How is the overlay painted so that both extents can be read,
and what tells the two states apart besides hue?**
- Facts: the rail is 6 px by 40 px (`VitalsStrip.tsx:83`). The fill is
  `bg-zinc-400 dark:bg-zinc-300` (`Gauge.tsx:53`). An opaque start-anchored
  extent over the fill hides the fill's end whenever cost >= fuel, and is
  invisible behind it whenever cost <= fuel. Measured costs: the mock's example
  is 53.8 t; real gate burns have left a 100 t fleet at 49.9 t after two commits
  and a cut (`clear-burn-preview-on-commit-journey.md`), so a typical extent is
  several pixels, not sub-pixel as the old analysis assumed. A cost under 5 t is
  under one pixel.
- Lean recorded: none for either half. RULING 4 fixes the families (amber;
  a tone already on the gauges, which is zinc).
- Recommendation: (a) no minimum drawn width and no change to the rail: the
  state attribute carries DOM observability, as the live sub-pixel scenario
  does for the fill; (b) the spec requires that the fill's own extent is
  unchanged and that the overlay is a separate element, and leaves the visual
  treatment (partial height, translucency, outline) to the UX reviewer inside
  RULING 4; (c) the non-colour carrier at this link is the panel's
  `preview-affordable` text, stated as scenario A12 at the view level.
- Flag forward: link 2b puts the panel inside a dock that is collapsed by
  default. From then on the strip's overlay would be the only on-screen carrier
  and A12 goes false unless 2b or link 4 gives the strip or the arc a text
  carrier. Write that into 2b's "read first".
- Most reversible: (a)-(c).
- Repo: (a) and (c) yes; (b) is the UX reviewer's judgement and needs eyes on a
  rendered rail, which tier 1 cannot give. Not a hard stop.

**Q5 [Q13, narrowed] — Is the overlay drawn while the canvas is unavailable?**
- With a current quote, the Burn control's only remaining unavailability is
  `!canvasAvailable` (`SpaceCommandPanel.tsx:365`; a selection, a fleet, no
  mine and no committed selection are already implied by `currentQuote`).
- Lean recorded: none.
- Recommendation: **draw it.** Basis: one determination, two readers. The panel
  shows the same quote's figures and ceiling in that state; withholding the
  overlay would make the strip disagree with the panel about one quote, and
  would need a second currency derivation. Live *The strip survives an
  unavailable renderer* says its figures still read.
- Whether the preview should be requested at all in that state is
  `followup-explain-withheld-burn-command.md` F3, out of this chain.
- Most reversible: either; one condition.
- Repo: yes.

**Q6 [Q11] — Does the strip show the quote's stranding advisory?**
- Lean recorded: none; both docs are silent for the strip.
- Changed since 2026-10-03: the commit's stranding notice now exists on the
  panel, beside the preview's own stranding line, and the strip's fleet cell
  already carries the served `stranded` marker.
- Recommendation: **no.** Basis: RULING 2 (segment only, no text); three
  stranding surfaces already exist; a design that is silent is not a
  requirement.
- Repo: yes.

**Q7 [Q8's second half; RULING 5 left it open] — Does this link touch the
panel's amber styling and affordability line under a stale quote?**
- Lean recorded: none ("left to this link's panel").
- Recommendation: **no.** Basis: live text asks for figures to be marked stale,
  and they are; link 4 retires `SpaceCommandPanel`; the follow-up already
  proposes to MODIFY the same requirement. Audit row (f) records the resulting
  asymmetry.
- Most reversible: no edit.
- Repo: yes.

**Q8 [new] — The overlay while the own-fleets read has failed over retained
data (D1).**
- Recommendation: file D1 as a drift on the fuel and hold cells and do not fix
  it here. Write no overlay rule of its own for this state: ADDED A8 (no
  overlay on a no-data gauge) composes with the fix, so the overlay goes when
  the fill does, with no further change. Basis: drift is adjudicated and routed,
  not patched in passing (RULING 7's basis); the fix is on the fill, which this
  link otherwise does not edit.
- If the orchestrator would rather fix D1 here: +2 tasks, no delta (it makes a
  live scenario true), and a test that arranges a failure over retained data.
- Repo: yes.

**Q9 [new] — The overlay's DOM contract.**
- Recommendation: a separate state attribute with two values, absent when no
  overlay is drawn; `data-gauge-state` untouched; no numeric extent attribute
  (section 3). The attribute's name is the architect's.
- Repo: yes. Listed because it decides whether `figure-formatting` stays
  untouched.

**Q10 [new] — The overlay's flag can lag a fuel change by one refresh
interval.**
- Recommendation: state the bound in ADDED B; add no invalidation. Basis: live
  "Exactly one fresh preview request SHALL be sent per elapsed interval while a
  preview is shown, and none between".
- Repo: yes.

**Q11 [Q17] — Can the journey reach an unaffordable quote?**
- Section 8. Not by selection. A bounded burn-down may reach it.
- Recommendation: SDET probes at kickoff with one stack boot's worth of
  quotes; the leg is asserted only if arranged, otherwise logged UNTESTED with
  tier 1 named as the cover.
- Repo: **no**: it needs quotes from a running stack. Not a hard stop, because
  logging the leg UNTESTED is established practice (2a-iii, 2a-iii-b).

---

## 8. Journey feasibility

Environment: e2e backend at world scale 5; random account-seeded spawn; nothing
sets a fleet's fuel; starting fuel 100 t; hold 200 t
(`backend/fleet/roster.go:44`). Measured: home-system flights 19.0-21.8 s of
world time (3.8-4.4 s wall), a gate flight 5.4 s wall; 15 of 15 targets quoted
HTTP 200 in the last walk; a select-plus-quote round trip well under a second
(`clear-burn-preview-on-commit-journey.md`).

| Leg | Deterministic? | Basis |
| --- | --- | --- |
| No selection: fuel gauge `filled`, no overlay | **Yes** | `vitals-strip-journey.spec.ts:320` already reads the gauge on a fresh corp. |
| Select a target: overlay in the affordable state | **Yes** | A fresh hull can afford its home station by a tier-3 test (`TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel`, 8-account sample in `fix-burn-order-geometry-refusals-journey.md`). Assert the gauge's state equals the panel's `preview-affordable[data-affordable]` for the same quote, so the leg does not depend on which value the stack serves. |
| Clear the selection: overlay gone | **Yes** | One click; no flight involved. |
| Replace the selection: the new target's overlay | **Yes**, if the system has two targets | A single-body spawn (`defect-spawn-system-single-body.md`) still has a station and gates; quote first, then choose. |
| Commit: overlay gone at acceptance | **Yes** | It happens at acceptance, inside any flight. Costs one burn. |
| **Unaffordable overlay** | **No, not by selection** | Needs a cost above the fuel aboard. Cost is delta-v / 5 per hull (`fuel_params.go`, `fuel.go:39-44`), so above 100 t means above 500 m/s; observed burns are a small fraction of that. No e2e spec has ever observed `data-affordable="false"`. |
| Unaffordable by burning fuel down | **Bounded, not deterministic** | Fuel only falls with each arrived burn, so "quote all targets; if none is unaffordable, commit the costliest and wait for arrival; repeat at most N times" terminates. Its length depends on random geometry; each round is a 4-5 s flight plus an arrival wait that can ride the 20 s baseline poll. Budget it from the first run's log, cap N, and log UNTESTED on running out. Unlike the stranding case this loop has a monotone bound. |
| Flag and picture disagree (burning re-target; open hold) | **No** | Each needs fuel low enough that a refund or upkeep term decides it. UNTESTED at tier 4; tier 1 rows A4, A5. |
| Failed refresh withdraws the overlay | Arrangeable only by intercepting the preview request in the browser | A test-side fault a player cannot cause. Optional; tier 1 row B4 is the cover. If walked, the wait is one 10 s interval. |
| Stale then restored; resume after a mine; two-interval windows | No (flights are 4 s) | UNTESTED at tier 4; tier 1. |
| Width floor at 1280×720 with an overlay drawn | **Yes** | Read the cells' boxes with a target selected. |

Carry forward: the `[journey-console]` capture with its hard update-depth
`afterEach`; `runLeg` with UNTESTED versus FAILED decided by what the UI shows;
the closing assertion naming which legs must be PASSED (here: no-selection,
affordable, clear). Key every window on the gauge, the surface the requirement
binds, not on the panel. Size every wait from the last gate's log. The gate
tiers are started by the orchestrator, one at a time.

---

## 9. Design decisions for design.md

- The strip's input is built from `currentQuote` and nothing else; a narrow
  optional prop (cost, flag), omitted when there is no current quote.
- `Gauge` gains one optional input; the hold cell never passes it.
- DOM contract: separate state attribute; no numeric attribute; extent as inline
  style geometry; no computed colour class (`Gauge.tsx:27-30`,
  `check-color-compliance.py` needs a dark variant on the same line).
- Geometry: start-anchored, limited to the rail, a separate element from the
  fill, painted per the UX ruling on Q4.
- Tones: amber family for unaffordable, a zinc shade for affordable (RULING 4).
  The strip's only amber today is a text class (`VitalsStrip.tsx:101`); the
  panel's amber classes carry no dark variants (`SpaceCommandPanel.tsx:115`), so
  the segment's background class is new within an existing family.
- No animation on the overlay (the fill has none); nothing for reduced motion to
  govern.
- No effect copies the quote into state; no second `useBurnPreview` call.
- View-test fixtures: fuel-bearing roster and a quote below capacity, added
  beside the existing ones, which other tests rely on.

## 10. Risks

- **The central claim is "does the gauge lie about affordability".** The review
  will concentrate on A4, A5 and Q4, as 2a's did on the pill.
- **Painting on 6 px.** A treatment that satisfies the DOM rows can still be
  unreadable. Tier 1 cannot judge it; the journey screenshot and the UX reviewer
  must.
- **Scenario multiplication on B9-B12** (section 5).
- **A wrong reader passes most tests.** Reading `burnPreview.preview` instead of
  `currentQuote` fails only B4 and B13.
- **Fixtures.** The existing view fixtures show no overlay for reasons unrelated
  to the wiring (section 5).
- **Colour-alone after 2b** (Q4).
- **Shared atom.** A change to `Gauge` for the fuel cell is a change to the hold
  gauge unless the input is optional and tested as absent there.
- **Archive traps.** If Q1 or Q2 adds a MODIFIED block: every live heading
  verbatim, `python3 harness/openspec-reconcile.py`, rehearse the archive on a
  copy.
- **Environment.** Scale-5 stack; random-spawn reds still filed
  (`defect-spawn-system-single-body.md`, `defect-scan-journey-spawn-in-gate-range.md`,
  `defect-slice-sell-price-changed-409.md`); name-matched `pkill` from sibling
  sessions. Check the emulator log before attributing a red.
- **U2** (`SystemSpaceView.tsx` timer hunks, Travis's to adjudicate) is in the
  one production file the wiring edits. Leave both hunks byte-identical.

## 11. Out of scope (record in the proposal)

- Cost or shortfall text on the strip; figures on the arc; Burn on the curve;
  the progress label; the undrawn preview curve
  (`drift-preview-curve-never-drawn.md`) — link 4.
- A served shortfall or any backend field, endpoint or query.
- The dock and its tabs (2b); the in-system list (3); retiring
  `SpaceCommandPanel` (4).
- Why the burn command is withheld, the canvas-unavailable polling, the refused
  preview's copy — `followup-explain-withheld-burn-command.md`.
- `drift-commit-response-carries-no-delta-v.md`,
  `defect-fleet-can-rest-inside-star-clearance.md`,
  `followup-warned-commit-without-burn-instants.md`,
  `followup-stranding-notice-untested-on-real-wire.md`.
- The panel's styling under a stale quote (Q7); D1 unless ruled in (Q8).
- `use-burn-preview.ts` (its stale header comment is link 4's).
- The galaxy view; a mobile layout; palette or type-scale changes; red or blue.
- U1-U10 in `add-vitals-strip-qa-reverify.md`.
