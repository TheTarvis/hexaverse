# `add-vitals-strip` — requirements analysis

Link 2a of the system-HUD chain (`docs/plans/system-hud/chain.md`), `--full-auto`.
Input: the chain doc, `docs/plans/system-hud.md`, `add-vitals-strip-rulings.md`
(RULINGs 1–8, treated as settled), the four live specs this change touches, and
the components and test files named below. Entry mode: **specced brownfield** —
no baseline retrofit is proposed for any existing capability.

**Headline findings, before the detail:**

1. **The chain doc undercounts again, in both directions.** It names two
   `docked-fleet-actions` requirements and one `fleet-roster` requirement.
   The true set is **two REMOVED + two MODIFIED + one ADDED** in
   `docked-fleet-actions`, **three MODIFIED** in `system-space-view` (only one
   of which the doc names), **one MODIFIED** in `figure-formatting` (which the
   doc does not mention at all), and — arguing from the spec text —
   **zero** in `fleet-roster`.
2. **"The twelve-button camera cluster becomes four" cannot be executed
   literally.** The twelfth button is not a camera control: it is
   `select-pan-target-point`, mandated by `system-space-view`'s *Body,
   Lane-Gate, and Point Selection Is Keyboard-Operable*. And the four
   `camera-pan-*` buttons are the **only** keyboard pan path in the app, which
   the same spec calls "load-bearing, not polish". The chain doc's claim that
   *Space View Camera Is Keyboard-Operable* "is unaffected" is wrong as
   written; see § 4.1 and the flagged disagreement in § 8.
3. **Two cells are not served as the chain doc describes them** and are
   re-scoped under RULING 8, not backed by backend tasks: the acting fleet has
   **no name on the wire** (§ 6.1) and there is **no served fuel-drain figure**
   (§ 6.2).
4. **No new `data-unit` token is needed.** Every figure the strip renders maps
   onto the closed vocabulary (§ 3). There is therefore no `figure-formatting`
   delta *for a token* — but there is one for a stale cross-reference.
5. **Honest task estimate is 52–58, over the 40 cap.** A clean seam exists at
   the burn-preview lift; see § 7.3.
6. **One live defect found by reading:** the running-mine preview suppression
   is specified, tested at the hook, and **not wired at the only call site**
   (§ 5.1). This change lifts that call site, so it must not carry the bug up.

---

## 1. Capability map

### 1.1 ADDED — `system-console` (new capability)

Per **RULING 1**. This change adds the capability carrying the **strip half
only**; link 2b MODIFIEs it to add the dock. Everything in § 2 lands here.

Nothing else in the tree owns a strip today, so there is no requirement to
migrate into it beyond the two re-homed readouts named below.

### 1.2 `docked-fleet-actions` — 2 REMOVED, 2 MODIFIED, 1 ADDED

All header text below is **character-for-character** from
`/Users/travis/Projects/hexaverse/openspec/specs/docked-fleet-actions/spec.md`.

| Op | Exact `### Requirement:` header text | Scenarios it carries today | Why |
|---|---|---|---|
| REMOVED | `Fleet Panel Cargo Hold Readout` | **3** | The hold readout leaves the panel for the strip (RULING 7 — no coexistence). Re-homed as `system-console` R8; **Reason/Migration** must name `system-console`, and all three scenarios must reappear there (adapted to the strip) or the behaviour is silently dropped. |
| REMOVED | `Credit Balance Readout` | **7** | The credits readout leaves the panel for the strip. Re-homed as `system-console` R9 — **but only six of its seven scenarios travel**; see the trap immediately below. |
| MODIFIED | `Sell Commit` | **4** | Its scenario *A successful sale refreshes hold and balance* asserts "the fleet's hold readout and the requester's credit balance both reflect the sale's effect" — two readouts this change removes from this panel. The requirement text ("refresh the fleet's hold and the requester's credit balance without requiring navigation") must say the refreshed reads land on the strip, not on this panel. |
| MODIFIED | `Refuel Commit` | **3** | Same defect: *A successful refuel refreshes hold, range, and balance*. Range lives on the roster row (unchanged) and on the strip's fuel cell (new); hold and balance move. |
| ADDED | *(new)* e.g. `A Failed Command Is Announced to Assistive Technology` | 1 (new) | **The trap.** `Credit Balance Readout`'s seventh scenario is *A failed sale's or refuel's error is announced to assistive technology* — a **panel** behaviour that has nothing to do with credits, implemented as `panel-error-live-region` in `FleetActionsPanel.tsx` and covered by `FleetActionsPanel.test.tsx:918`. If `Credit Balance Readout` is removed wholesale, that behaviour loses its only requirement. It must be re-anchored in `docked-fleet-actions` as its own ADDED requirement before the readout is removed. |

**Requirements this change does NOT touch in `docked-fleet-actions`, verified by
reading rather than assumed:**

- `Sell Offer on the Docked Fleet` (8) — its held-tonnage and proceeds figures
  are inside the sell section, which stays until 2b.
- `Refuel Offer on the Docked Fleet` (7) — reads the credit *balance* to cap its
  default tonnage, but consumes it as a prop from the mounting view, not from
  the readout. The prop's source is unchanged. Its scenario *An unavailable
  credit balance falls the default back to free hold* cross-references
  `system-space-view`'s fan-in, not the readout, so it survives verbatim.
- `Mine Offer on the Docked Fleet` (4) — free hold is an input default, not a
  readout.
- `Station-Keeping Hold and Release Controls` (8) — the served upkeep rate stays
  on the panel. Note the **one-link duplication** this creates: the strip's pill
  renders `Holding · 0.4 t/h` from the same served field
  (`roster.stationKeepRateTonsPerSecond`) that `stationkeep-rate` renders on the
  panel. Two *readouts* of one served field through one formatter cannot
  disagree, so this does not violate RULING 7 (which is about two renderings
  that *can* disagree) nor the one-control-per-verb rule (which is about verbs).
  Recorded so the adversary does not re-litigate it: 2b removes the duplicate.
- `Mine ETA Preview From the Served Mining Rate`, `Mine Commit`, the three
  double-submit guards, `Rejection Reasons Map to Player-Facing Copy…`,
  `Running Mine Gates the Fleet Panel's Commands` — no figure this change moves.

### 1.3 `system-space-view` — 3 MODIFIED (one of them the doc names), 1 recommended, 1 optional

| Op | Exact `### Requirement:` header text | Scenarios today | Why |
|---|---|---|---|
| MODIFIED | `System Space View Route and Data Fan-In` | **15** | Three reasons, any one of which is sufficient. (a) Its text names "its *Credit Balance Readout*" as `docked-fleet-actions`'s — after this change that requirement does not exist there. (b) Two of its scenarios assert on the balance readout by name (*The station-anchored controls are driven by the view's own reads*, *An unresolved credit balance withdraws the readout, not the verbs*) and must now point at the strip. (c) This is the requirement that says what the view fans its reads into; the strip is a new consumer of the fleet read, the corporation session, the world clock and its scale, and (RULING 5) the lifted burn preview. **This is the "layout requirement the column lives under" the chain doc gestures at** — there is no separate layout requirement; the fan-in requirement is it. 15 scenarios must be reproduced verbatim in the MODIFIED body. |
| MODIFIED | `Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point` | **3** | Its text states: "the acting fleet for `docked-fleet-actions`' commands is instead set by the fleet roster's row selection (`fleet-roster`'s *Row Selection Delegated to the Mounting View*)". The strip's chevron makes that a second path. **It is already inaccurate today** — `SpaceStage.tsx:754` renders a `fleet-mark-*` button whose activation calls `onActivateFleet` → `setActingFleetId` ("Click to command this fleet"), so a fleet mark is a third path that no requirement records. The MODIFIED body should enumerate every acting-fleet path (roster row, fleet mark, strip chevron) while keeping the real claim — a fleet is never a member of the *selection* — intact. Cheap: 3 scenarios. |
| MODIFIED | `Space View Camera Is Keyboard-Operable` | **7** | The cluster shrink lands here. See § 4.1 for why the change cannot leave this requirement alone: today the four `camera-pan-*` buttons are the entire implementation of "a dedicated pan input… reachable without a pointer", and the pan axis's at-limit DOM state lives on those buttons. The requirement's *text* already permits a key-based pan ("per key press"), so the MODIFIED body is mostly the 7 existing scenarios verbatim plus a composition clause and one or two new scenarios pinning the four-cell cluster and the surviving pan input. |
| MODIFIED *(recommended)* | `A Failed or Stale Preview Is Never Presented as a Current Quote` | **6** | The strip's cost overlay is a *graphical* projection of the preview. The requirement's text binds "figures"; an implementer can read a coloured gauge segment as not-a-figure and leave a stale quote painted on the strip. This is exactly link 2a's adversary target ("does the strip lie about state"). Add one clause — any presentation of a preview, figure or graphical — and one scenario. If the task budget forces a cut, state the binding inside `system-console` R6 instead and accept that the rule then has two homes. |
| MODIFIED *(optional, only if the cluster composition is pinned here instead)* | `Space View Camera Orbit, Pan, and Zoom` | **14** | Its text mentions "an on-screen camera control (the recenter control, or a keyboard-operable orbit/pan/zoom affordance)" and its scenarios name no button. It remains true after the shrink. **Recommendation: do not modify it** — 14 scenarios of verbatim reproduction to pin a clause that fits in the keyboard requirement. |

**Requirements verified NOT to need a delta, though a reader might expect one:**

- `Space View Camera Manual Recenter` (3) — recenter is one of the surviving four.
- `Camera Controls Are Inert While the Space View Is Unavailable` (1) — its text
  names "the keyboard-operable orbit/pan/zoom affordances and the recenter
  control" generically; still true with four.
- `Space View Camera Touch Pinch-Zoom` (7) — pointer/touch only.
- `Body, Lane-Gate, and Point Selection Is Keyboard-Operable` (6) — the
  point-selection control must **survive** the shrink (§ 4.1), and its two live
  scenarios plus `SpaceStage.interaction.test.tsx:130,184` already guard that.
  No text change; a guard the implementer must not break.
- `Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch` (5) —
  the off-screen chips are **link 3**, not this change. Do not touch
  `offscreen-*`.
- `Burn Preview Reflects the Server-Solved Order, Without Committing` (7) — the
  preview's *source* and cadence are unchanged by lifting where the hook is
  called; RULING 5 forbids a second query, which this requirement's
  one-request-per-interval scenario already enforces.
- Every scan, sighting, renderer-unavailability and refetch requirement.

### 1.4 `fleet-roster` — **no delta required** (contra the chain doc)

The chain doc says `fleet-roster`'s `Row Selection Delegated to the Mounting
View` "gains the chevron as a second delegate". Reading the requirement:

> The system SHALL, on a row click, hand the clicked fleet back to the mounting
> view via a callback, without itself deciding what selecting a fleet means…

It claims nothing about exclusivity, and it is scoped to *a row click* on the
roster panel. The chevron is rendered by the strip, not by the roster, so
putting the chevron's behaviour here would make `fleet-roster` own an element it
does not render. The exclusivity claim that actually goes stale lives in
`system-space-view`'s *Toggle-to-Deselect…* (§ 1.3), which is where I have put
the delta.

The other two candidates also come out clean:

- `The Roster Row Shows Held Fuel and an Estimated Range` (4) — the chain doc is
  explicit that "the row keeps them — the roster stays a complete surface". No
  text changes.
- `One Row Per Owned Fleet, Derived From Kinematic State` (9) — see ambiguity
  **A-4**: extending `roster-status.ts` for the pill does **not** change what the
  row renders, so this requirement is only touched if the panel rules that the
  row must display the new distinctions too. Recommend not.

**If the spec writer disagrees and wants the chevron recorded in `fleet-roster`
anyway**, the only honest shape is a MODIFIED of `Row Selection Delegated to the
Mounting View` (1 scenario) broadening "on a row click" to "on a row click, or
from any other surface the mounting view mounts against the same callback" —
cheap, but it makes a roster requirement true of a non-roster element.

### 1.5 `figure-formatting` — 1 MODIFIED (not for a token)

| Op | Exact `### Requirement:` header text | Scenarios today | Why |
|---|---|---|---|
| MODIFIED | `An Absent, Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a Number` | **5** | Its last scenario, *The absent form does not override a capability's own unavailable copy*, reads "(`docked-fleet-actions`'s *Credit Balance Readout*)" — a requirement this change deletes from that capability. Re-point to `system-console`'s readout. All five scenarios reproduced verbatim, one parenthetical changed. |

`figure-formatting`'s R11/R12/R13/R14 are inherited whole-tree invariants
(RULING 6) and are **not** restated as `system-console` requirements — link 1's
Taught record is explicit that a cross-surface invariant with two homes ships
false in one of them. Each strip cell's requirement says "presented per
`figure-formatting`" and names its token; the invariant stays where it is.

### 1.6 In-flight conflicts

`openspec/changes/` contains only `archive/`. **No active change touches these
capabilities**, so there is no coordination conflict. `add-figure-formatting`
archived on 2026-09-09 (`a4471a3`) and its spec is live.

---

## 2. ADDED `system-console` — requirements and scenarios

Drafted as one observable behaviour per requirement, RFC-2119 SHALL, every
requirement carrying at least one scenario and (where the design implies one) a
failure/edge scenario. Scenarios marked **INFERRED** are drawn from what the
design implies rather than states, and are flagged for the panel.

### R1 — The Vitals Strip Is Present on Every Render of the System Space View

The system SHALL render a single full-width strip along the bottom edge of the
system space view on every render of that view, including while the interior
read has failed, while the own-fleets read has failed, and while the renderer is
unavailable. A cell whose served input is unavailable SHALL render
`figure-formatting`'s absent form for its figures rather than being removed, so
the strip's cell set is fixed and a player never has to work out which
instrument disappeared.

- **Scenario: The strip renders with every read resolved** — WHEN the view
  renders with interior, own-fleets, station, board and session reads resolved
  → the strip is present with its fleet, fuel, hold, credits and clock cells.
- **Scenario: The strip survives a failed interior read** — WHEN the interior
  read fails → the strip is still rendered; the cells fed by the fleet read and
  the session are unchanged. *(INFERRED from the fan-in requirement's
  independent-failure rule.)*
- **Scenario: The strip survives an unavailable renderer** — WHEN the canvas
  region shows the unsupported or interrupted state → the strip is still
  rendered and its figures still read.
- **Scenario: With no acting fleet the fleet-scoped cells read absent, not
  empty** — WHEN the view renders with no own fleet in this system → the fleet,
  fuel and hold cells show the absent form and the credits and clock cells still
  show their figures.

### R2 — The Strip Carries No Verb

The strip SHALL NOT render any control that commits, cancels, or otherwise
mutates server state. The one interactive affordance the strip MAY render is the
fleet cell's chevron (R3), which changes only which fleet the mounting view is
commanding and issues no mutation. (RULING 3.)

- **Scenario: A docked fleet's strip offers no trade verb** — WHEN the acting
  fleet is docked at a station with cargo aboard → the strip renders no refuel,
  sell, mine, jump, hold or release control; those remain on the fleet panel.
- **Scenario: A burning fleet's strip offers no burn-ending verb** — WHEN the
  acting fleet is burning → the strip renders no cut-drive or stop control.
- **Scenario: The chevron is the strip's only interactive element** — WHEN the
  strip's interactive elements are enumerated → every one is the chevron or a
  descendant of the chevron's own menu.

### R3 — The Fleet Cell Names the Acting Fleet and Delegates a Switch to the Mounting View

The system SHALL show, in the strip's leftmost cell, the acting fleet's served
identity and a chevron affordance that hands a chosen own fleet back to the
mounting view through the **same callback contract** the fleet roster's row
selection uses (`fleet-roster`'s *Row Selection Delegated to the Mounting
View*), so the acting fleet is set by exactly one code path and the strip itself
decides nothing about what switching means.

- **Scenario: Choosing a fleet in this system sets it acting** — WHEN a fleet in
  the open system is chosen from the chevron → it becomes the acting fleet and
  no navigation occurs.
- **Scenario: Choosing a fleet in another system navigates there** — WHEN a
  fleet located in a different system is chosen → the view navigates to that
  system's route, identically to selecting its roster row.
- **Scenario: Choosing a fleet out on a lane navigates to the galaxy view** —
  same delegate, same outcome.
- **Scenario: A sole owned fleet leaves the chevron with nothing to offer** —
  WHEN the requester owns exactly one fleet → the chevron is rendered
  non-interactive (or offers only that fleet) and activating it changes nothing.
  *(INFERRED — empty-state coverage.)*

### R4 — The Fleet Cell's State Pill Is a Projection of the Shared Roster Derivation

The system SHALL render, beneath the fleet's identity, exactly one state pill
whose state is produced by the **same exported derivation the roster row uses**
(`frontend/components/fleet/roster-status.ts`) over the same served inputs, and
SHALL NOT branch on `Fleet.state`, `attachedTo`, a park kind, or an action ETA
inside the strip. A distinction the pill needs and the derivation does not make
SHALL be added to the derivation, so both surfaces read one implementation.
(RULING 4.)

The pill's states are: docked (naming the host where the view can resolve it),
under way (naming the burn's served target and the remaining duration), holding
(naming the served station-keeping rate), mining (naming the run's remaining
duration), drifting, in transit, and on station.

- **Scenario: A docked fleet's pill names its host** — WHEN the acting fleet is
  parked with `attachedTo` set and the interior read resolves that host → the
  pill reads the docked state naming that host.
- **Scenario: A burning fleet's pill counts down to its served arrival** — WHEN
  the acting fleet's effective state is a burn → the pill names the burn's
  served target and a remaining duration presented per `figure-formatting`
  (`world-ms-span-left`) carrying its raw unscaled world-millisecond span.
- **Scenario: A station-keeping fleet's pill shows the served upkeep rate** —
  WHEN the acting fleet's park mode is `stationkeep` → the pill shows the fleet
  read's served rate presented per `figure-formatting`
  (`tons-per-world-s`), never a rate derived from the host's orbital elements.
- **Scenario: A mining fleet's pill counts down to the run's ETA.**
- **Scenario: The pill and the roster row never disagree** — WHEN the strip and
  the roster are rendered for the same fleet in the same state → both surfaces'
  states are the output of the one derivation for the same inputs, and no second
  derivation of fleet state exists in the strip.
- **Scenario: An unresolvable host degrades the pill, it does not blank it** —
  WHEN the acting fleet is docked but the interior read has failed, so the host
  cannot be named → the pill still reads the docked state, with the raw
  attachment id or no host label, never an empty pill. *(INFERRED.)*

### R5 — The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge

The system SHALL show the acting fleet's served held `fuel` tonnage and its
server-reported estimated maximum range, each presented per `figure-formatting`
(`tons`, `range`) and carrying its own raw served value, rendered over a gauge
whose fill is the ratio of two served values. This capability SHALL NOT compute
or re-derive either figure. Because the range figure carries no unit name of its
own, it SHALL be rendered adjacent to a label identifying it as a range. WHEN
either figure is unavailable on the fleet read, the cell SHALL show that
figure's absent form and the gauge SHALL render no fill, rather than a zero fill
indistinguishable from a dry fleet.

- **Scenario: The fuel cell shows tonnage and range** — with `data-raw` on each.
- **Scenario: An unserved roster reads absent, and the gauge shows no fill.**
- **Scenario: A dry fleet reads zero, distinguishably from absent** — WHEN the
  served fuel is 0 → the figure reads `0.0 t` and the gauge shows an empty fill,
  distinct from the absent state above. *(INFERRED — link 1's Taught record
  names the `?? 0` "0t fuel" defect explicitly.)*

### R6 — The Fuel Gauge Shows a Previewed Burn's Cost Only While That Quote Is Current

WHILE the mounting view holds a successful, current burn preview for the current
selection and the acting fleet, the system SHALL draw the preview's served
`fuelCostTons` as an overlay on the fuel gauge, styled by the preview's served
`affordable` verdict. The strip SHALL issue no preview request and hold no
preview state of its own (RULING 5). IF no preview has succeeded for the current
selection, or the newest refresh failed, THEN no overlay SHALL be drawn — a
graphical projection of a quote is a presentation of that quote
(`system-space-view`'s *A Failed or Stale Preview Is Never Presented as a
Current Quote*). The overlay SHALL clear when the selection is cleared or
replaced and when an order commits.

- **Scenario: A resolved preview grows a cost segment** — WHEN a preview
  resolves for the current selection → the gauge draws the cost overlay for its
  served fuel cost.
- **Scenario: An unaffordable cost is shown as such** — WHEN the preview reports
  the target unaffordable → the overlay is drawn in the state visually distinct
  from an affordable one, and extends past the current fill.
- **Scenario: A failed first preview draws no overlay.**
- **Scenario: A stale preview is not painted as a current quote** — WHEN a
  periodic refresh fails over shown figures → the overlay is withdrawn or
  marked, never left presenting as current.
- **Scenario: Clearing the selection clears the overlay.**
- **Scenario: A cost larger than the gauge's span clamps at its end** — WHEN the
  served fuel cost exceeds the gauge's full span → the overlay clamps at the end
  of the gauge and the unaffordable state is still conveyed. *(INFERRED —
  boundary.)*

### R7 — While Burning, the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain

WHILE the acting fleet's effective state is a burn, the system SHALL mark the
fuel cell as draining and SHALL update its figure and its gauge fill only when a
read serves new values. The client SHALL NOT interpolate, extrapolate, or
otherwise compute fuel consumed in flight: fuel per unit of delta-v is a
rule-bearing `backend/space` computation and no client mirror of it exists
(RULING 8; `space-kinematics`' sole-authority requirement).

- **Scenario: A burning fleet's fuel cell is marked as draining.**
- **Scenario: The figure moves only when a read lands** — WHEN world time
  advances between two refetches while the fleet burns → the fuel figure and its
  `data-raw` are unchanged, and change on the next served read.

### R8 — The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented Gauge

The system SHALL show the acting fleet's used capacity, total capacity and free
hold, each presented per `figure-formatting` as a tonnage — the total capacity
and the free hold carrying their own raw served values and the used capacity its
own raw client-derived value (`capacity − freeHold`) — over a gauge carrying one
segment per resource kind the served cargo pool holds, sized by that kind's
served tonnage, with `fuel` treated as a kind like any other. Each segment SHALL
be identified by its kind and its tonnage in text or an accessible name, so the
segmentation is never conveyed by colour alone. WHEN the fleet read has not
served roster fields, the cell SHALL show the absent form for all three figures
and render no segments.

- **Scenario: The hold cell shows contents and capacity** — with a segment per
  held kind, each carrying its kind and tonnage.
- **Scenario: An empty hold shows no segments and a free figure equal to
  capacity.**
- **Scenario: An unloaded roster reads as absent, never `0 / 0 t`.**
- **Scenario: The segmentation is legible without colour** — WHEN a segment is
  inspected → its kind and tonnage are available as text or an accessible name.
  *(INFERRED — the repo forbids a palette change, so segments are shades; the
  a11y fallback is what makes shades acceptable.)*

### R9 — The Credits Cell Shows the Corporation's Served Balance and Announces Its Changes

*(The re-homed `docked-fleet-actions` requirement — its six surviving scenarios
must be reproduced, adapted to the strip.)*

The system SHALL show, in the strip, the requester's own corporation's credit
balance, sourced from the ambient corporation session read the surrounding
layout makes and supplied to the strip by the mounting view, reflecting the
post-settlement balance after a sale or a refuel resolves through the fleet
panel's commits, without requiring navigation, and SHALL announce a balance
change to assistive technology at the moment it updates. The balance is
presented per `figure-formatting` as a credit figure and carries its raw served
value. IF the session balance is unavailable, THEN the cell SHALL show an
explicit unavailable indication and SHALL NOT show a figure — never
`figure-formatting`'s generic absent form in place of this capability's own
mandated copy. A transition between the figure and the unavailable indication,
in either direction, SHALL be announced through that same live region.

- **Scenario: The strip shows the current credit balance.**
- **Scenario: An unavailable balance reads as unavailable, not as a figure.**
- **Scenario: The balance visibly updates when a sale resolves.**
- **Scenario: The balance visibly updates when a refuel resolves.**
- **Scenario: A balance change is announced to assistive technology.**
- **Scenario: A transition to or from an unavailable balance is announced.**

### R10 — The Clock Cell Shows the Absolute World Instant at Its Served Scale

The system SHALL show, at the strip's trailing edge, the mounting view's
projected world time as an absolute instant presented per `figure-formatting`
(`world-ms-instant`), carrying its raw world-millisecond value and the
accessible explanation of its `×N` suffix that `figure-formatting`'s stamp rule
requires. WHEN no world-clock scale has been served, the stamp SHALL still
render its `T+ Dd HH:MM` portion with the absent suffix `×—`.

- **Scenario: The clock reads `T+ Dd HH:MM ×N` with its raw value.**
- **Scenario: The suffix carries its accessible explanation.**
- **Scenario: With no served scale the stamp still renders, with `×—`.**

### R11 — The Strip Issues No Read of Its Own

The strip SHALL render only from values the mounting view supplies and SHALL
issue no network read — no preview request, no fleet read, no session read, no
board read. (RULING 5, generalised: a second reader is a second truth.)

- **Scenario: Rendering the strip issues no request** — WHEN the strip is
  rendered in isolation with values supplied → no network request is made.

### R12 — Activating the Strip Changes No Space-View Selection

Activating any part of the strip, by pointer or keyboard, SHALL NOT change the
space view's current body, lane-gate or point selection, and SHALL NOT be
treated as a space-view click, regardless of what the canvas draws beneath it.

- **Scenario: Clicking a strip cell leaves the selection unchanged.**
- **Scenario: Switching the acting fleet leaves the selection unchanged.**

### R13 — The Strip Announces Only Its Own Balance Changes

The strip SHALL NOT announce a landed burn, jump, or mine to assistive
technology; those are announced once, by the mounting view's existing announcer
(`system-space-view`'s *A Landed Resolution Is Announced to Assistive
Technology*). The credits cell's own live region (R9) is the strip's only
announcing surface.

- **Scenario: A landing is announced exactly once** — WHEN a burn's arrival
  lands while the strip shows the fleet's pill flipping out of the burning state
  → exactly one announcement is made.

### R14 — The Strip Is Laptop-First and Never Overflows the View

The strip SHALL render every one of its cells, without horizontal overflow and
without removing, truncating or wrapping a cell onto a second row, at the
viewport width the archive-gate journey runs at and at every wider viewport. No
layout below that width is specified, produced, or tested. (RULING 2. See
ambiguity **A-1** — the ruling's `85vw` phrasing is not a decidable width and is
restated here against the journey's own viewport.)

- **Scenario: Every cell is inside the viewport at the journey's width** — WHEN
  the view is rendered at the archive-gate journey's configured viewport → each
  of the five cells is rendered, non-empty, and inside the viewport bounds.

---

## 3. The `data-unit` vocabulary — every strip figure, mapped (prompt item c)

`FigureUnit` in `/Users/travis/Projects/hexaverse/frontend/lib/format/figures.ts`
is closed and exported:
`world-ms-span-in | world-ms-span-left | world-ms-span-ago | world-ms-span-bare
| world-ms-instant | tons | range | delta-v | credits | tons-per-world-ms |
tons-per-world-s`.

| Strip figure | Raw value (source) | Token | Notes |
|---|---|---|---|
| Fuel tonnage | `roster.cargo.fuel` (served) | `tons` | Identical to the roster row's `fleet-fuel-*`. |
| Range | `roster.estimatedRange` (served) | `range` | Needs an adjacent "range" label — the token renders no unit name. |
| Hold used | `cargoCapacity − freeHold` (client-derived, precedent: `hold-capacity-used`) | `tons` | |
| Hold capacity | `roster.cargoCapacity` (served) | `tons` | |
| Hold free | `roster.freeHold` (served) | `tons` | |
| Per-kind hold segment label | `roster.cargo[kind]` (served) | `tons` | |
| Credits | `corporation.credits` (session) | `credits` | |
| Clock | projected world ms | `world-ms-instant` | Plus `instantScaleLabel()` as the accessible title. |
| Pill ETA — burn | `Burn.ArriveMs − worldTime` | `world-ms-span-left` | A running order's remainder → the `left` form, matching the roster row. |
| Pill ETA — mine | `action.eta − worldTime` | `world-ms-span-left` | Same. |
| Pill holding rate | `roster.stationKeepRateTonsPerSecond` (served) | `tons-per-world-s` | Same token the panel's `stationkeep-rate` uses. |
| Cost overlay | `BurnPreview.fuelCostTons` (served) | `tons` — **only if rendered as text** | See below. |

**Conclusion: no new token is required, and there is therefore no
`figure-formatting` delta for the vocabulary.** Two caveats the writer must
carry:

1. **The cost overlay is a gauge segment, not a figure.** The chain doc's 2a
   scope says only "the segment past the fill is the shortfall, in the
   affordability colour"; the *textual* `▲ short 6.6 t` line is the arc label,
   which is **link 4**. If the panel decides the strip should also print the
   cost or the shortfall as text, then: the cost is `tons` on a served raw (no
   problem), and a *shortfall* is `tons` on a **client-derived** raw
   (`fuelCostTons − heldFuel`). That derivation must happen at the call site, in
   the strip, never inside `@/lib/format` — `figure-formatting`'s R14 names
   "a shortfall" explicitly among the things the module must not compute. The
   precedent for a client-derived raw with an existing token is
   `preview-fuel-ceiling` (`cost × BURN_FUEL_ALLOWANCE`). Recommend keeping 2a
   text-free here and letting link 4 own the shortfall copy.
2. **Gauge geometry is not text and carries no attributes.** A fill expressed as
   a CSS width is outside R11/R12 (which bind "the string a player reads").
   But any `aria-valuetext` or accessible name on a gauge **is** read text and
   must be produced by the shared formatter, per R11's toast/aria-label clause
   (same formatter, no attributes). Pin this in the impl contract; it is exactly
   the kind of bypass link 1's Taught record says review, not tests, catches.

---

## 4. Enumerating the camera work (prompt item a, second half)

### 4.1 Every `system-space-view` requirement that touches the on-screen cluster

`SpaceStage.tsx:599–644` renders **twelve** buttons inside
`data-testid="space-camera-controls"`:

- 4 × `camera-orbit-{left,right,up,down}`
- 4 × `camera-pan-{left,right,up,down}`
- 2 × `camera-zoom-{in,out}`
- 1 × `camera-recenter`
- 1 × **`select-pan-target-point`** — *not a camera control*

| Requirement (exact header) | Relationship to the cluster | Verdict |
|---|---|---|
| `Space View Camera Is Keyboard-Operable` (7) | Mandates "a dedicated pan input, distinct from the orbit input and reachable without a pointer… per key press", and an at-limit DOM state for orbit, pan and zoom. Today's implementation of the pan input **is the four `camera-pan-*` buttons**; the group's own `onKeyDown` handles arrows → **orbit only**. Its at-limit scenario is asserted against `camera-pan-right` / `camera-pan-left` (`SpaceStage.interaction.test.tsx:278`). | **MODIFIED** — the cluster composition clause lands here, and the surviving pan input must be named. |
| `Body, Lane-Gate, and Point Selection Is Keyboard-Operable` (6) | Owns `select-pan-target-point`: "The system SHALL additionally provide a keyboard-reachable control that selects the point in space at the camera's current pan target… in the same tab order as the hit targets." | **No delta — but the control MUST survive.** It is the twelfth button and is not one of the four. Deleting it breaks two live scenarios and the "control that can only ever produce an illegal target" argument the requirement spends a paragraph on. |
| `Space View Camera Orbit, Pan, and Zoom` (14) | Prose mentions "an on-screen camera control (the recenter control, or a keyboard-operable orbit/pan/zoom affordance)"; scenario *Activating a camera control does not change the selection*. Names no button. | **No delta needed** (optional home for the composition clause; not recommended — 14 scenarios). |
| `Space View Camera Manual Recenter` (3) | Recenter survives. | No delta. |
| `Camera Controls Are Inert While the Space View Is Unavailable` (1) | Generic. | No delta. |
| `Space View Camera Touch Pinch-Zoom` (7) | Pointer/touch gestures only — **this change must not touch it**. | No delta. |

**Requirements about keyboard or pointer camera control that this change must
NOT touch:** all of `Space View Camera Touch Pinch-Zoom`, the pointer-gesture
half of `Space View Camera Orbit, Pan, and Zoom` (drag-to-orbit,
secondary-drag-to-pan, wheel zoom, the 8-CSS-pixel threshold), and the keyboard
*orbit* binding (arrow keys on the focused group), which already exists and is
unaffected.

### 4.2 What "four" can actually mean

The four visible camera cells can be **orbit affordance, zoom in, zoom out,
recenter** only if:

- the **orbit affordance is the focusable group itself** (it already is:
  `tabIndex={0}` with an arrow-key handler), so keyboard orbit survives with no
  new mechanism;
- a **keyboard pan binding** replaces the four pan buttons — a modifier+arrow or
  a dedicated key pair on the same group. The requirement's own words ("per key
  press") permit this; only the *implementation* and its tests change. Without
  it, `select-pan-target-point` can only ever name the star, which every burn
  solve rejects — the exact failure the live requirement was written to prevent;
- the **pan axis's at-limit state** moves from the (now absent) pan buttons to
  the existing `camera-limit-status` live region, which already computes
  `atPanLimit`. The requirement permits "an attribute **or a status message
  conveyed to assistive technology**";
- **`select-pan-target-point` survives** as a fifth element in (or beside) the
  cluster. It is a selection affordance, not a camera control, so it does not
  count against "four" and RULING 3's no-verbs rule does not reach it (it lives
  on the stage, not the strip).

---

## 5. Discrepancies between the design input, the specs, and the code

### 5.1 Live defect: the running-mine preview suppression is not wired

`system-space-view`'s *Burn Preview Reflects the Server-Solved Order* says a
preview "SHALL NOT be requested while the acting fleet's movement channel is
claimed by a running mine", with the scenario *No preview is requested while a
mine holds the movement channel*.

`hooks/use-burn-preview.test.tsx:123` tests that scenario by passing
`commitWouldBeAccepted: false` **into** the hook. The only production call site,
`SpaceCommandPanel.tsx:109–115`, passes:

```ts
commitWouldBeAccepted: !!fleet && !fleet.jump,
```

`mineRunning` is in scope on that component (it is a prop, used to disable the
button) and is **not** part of the flag. So in the running app a preview is
requested every `PREVIEW_REFRESH_MS` while a mine holds the movement channel.
The scenario passes only because the panel's suite mocks the hook wholesale.

This change **lifts that call site into the mounting view** (RULING 5). Carrying
the expression up unchanged carries the defect up. Recommend the lift compute
`!!acting && !acting.jump && !mineRunning` with a view-level test; it satisfies
an existing scenario rather than changing one, so it needs no delta.

### 5.2 The acting fleet already has a third setter that no spec records

`SpaceStage.tsx:754` renders a `fleet-mark-*` button whose activation calls
`onActivateFleet` → `SystemSpaceView`'s `setActingFleetId`, with the on-hover
copy "Click to command this fleet". `system-space-view`'s *Toggle-to-Deselect…*
says the acting fleet "is instead set by the fleet roster's row selection". The
chevron makes it three paths. Folded into the MODIFIED in § 1.3.

### 5.3 The `85vw` in the code is a width cap, not a viewport threshold

`max-w-[85vw]` appears on six elements (`SystemSpaceView.tsx:791`,
`FleetActionsPanel.tsx:329,338`, `SpaceCommandPanel.tsx:84`,
`ScanControl.tsx:171,184`, `FleetRoster.tsx:150`). It caps a 288-px (`w-72`)
panel so it never exceeds 85 % of the viewport. It is not a breakpoint and there
is no "85vw viewport width". See ambiguity **A-1**.

---

## 6. Re-scopes under RULING 8 (a cell whose figure is not served)

### 6.1 A fleet has no name on the wire

`frontend/lib/types/fleet.ts` `Fleet` carries `id`, `corporationId`, `systemId`,
`state`, `attachedTo`, `jump`, `laneId`, `position`, `own`, `roster`,
`worldTime`, `scale`, `strandingWarning`. **There is no `name`.** The roster row
shows the *system* name as its heading; the fleet marks show `mark.id`.

Re-scope: the fleet cell names the acting fleet by its **served id**, exactly as
`fleet-facts` and the roster's command testids already do. Do not add a backend
field; do not synthesise a client-side display name (a second naming scheme is a
divergence waiting to happen). Recorded here as the finding RULING 8 requires.

### 6.2 There is no served fuel-drain figure

The chain doc asks the fuel gauge for "a **drain** while burning". Nothing on
the wire carries fuel consumed so far on a running burn: `roster.cargo.fuel` is
the balance at read time, and `BurnPreview.fuelCostTons` prices a *previewed*
order, not the running one. A continuous drain would require fuel-per-delta-v
integrated over flight — `backend/space` rules, anti-mirror, and forbidden to
the client.

Re-scope (R7): "drain" is a **visual state** on the cell plus step-wise updates
as reads land. This is honest and testable; a smooth animated drain is not
implementable without a client mirror of a Go rule.

### 6.3 The fuel gauge has no served denominator

No "fuel tank capacity" exists: fuel rides the cargo pool
(`add-fuel-as-cargo` — fuel is a reserved cargo kind). The only served
denominators are `cargoCapacity` and `freeHold`. See ambiguity **A-2**.

---

## 7. Sizing (prompt item b)

### 7.1 Test files whose assertions move or break

| File | Size | What this change does to it |
|---|---|---|
| `components/space/FleetActionsPanel.test.tsx` | 971 lines, **53 tests** | Two whole describes move to the strip's suite: *the cargo hold readout* (4 tests) and *the credit balance readout* (5 tests, one of which — the failed-command announcement — **stays** and re-anchors to the new ADDED requirement). Two more rewrite: *A successful sale refreshes hold and balance*, *A successful refuel refreshes hold, range, and balance* — the panel can no longer see either readout. 41 references to `balance-*` / `hold-*` in this file. |
| `components/space/SpaceCommandPanel.test.tsx` | 630 lines, **34 tests** | The preview lift turns `vi.mock('@/hooks/use-burn-preview')` + a mutable `previewState` into props. **23 `previewState` references** across ~20 test bodies become `panel({ preview: … })`; mutations that today happen after render must become re-renders. Mechanical, but it is the single largest churn in the change. |
| `components/space/SpaceStage.interaction.test.tsx` | 622 lines, **34 tests** | Breaks on the cluster shrink: *Pan keys translate the camera's target* (clicks `camera-pan-right`), *SDET-added: the pan input is a DISTINCT control from the orbit input* (asserts all four pan buttons exist), *Keyboard input at a clamp is distinguishable from no input* (asserts `data-at-limit` on `camera-pan-right`/`-left`), *A keyboard-only player can pan to a point away from the star*. Four tests rewritten against the new pan input; `select-pan-target-point` tests must keep passing untouched. |
| `components/space/SpaceStage.renderer.test.tsx` | 456 lines, 23 tests | Two camera tests reference `space-camera-controls`, `camera-recenter`, `camera-zoom-in` — all survivors. Expect no change, but re-run. |
| `components/space/SystemSpaceView.test.tsx` | 1029 lines, **38 tests** | Asserts `balance-value` / `balance-figure` (*The panel shows the current credit balance (the view sources it, not the panel)*) and `space-world-clock`. The balance assertion re-points at the strip; new tests land for the strip's mount, the lifted preview, and the fan-in. |
| `components/fleet/roster-status.test.ts` | 224 lines, 9 tests | New cases for whatever the pill needs the derivation to add (park kind, host, burn target). |
| `components/fleet/FleetRoster.test.tsx` | 509 lines, 23 tests | Should be untouched (the row keeps fuel/range/eta) — but must be re-run to prove the derivation extension changed nothing. |
| `components/space/SpaceStage.fleet-mark.test.tsx`, `SpaceStage.test.tsx` | small | Re-run only. |
| **e2e (tier 4)** `refuel-commit.spec.ts`, `slice.spec.ts`, `space-journey.spec.ts`, `space-double-submit.spec.ts`, `new-user.spec.ts` | 5 files, 18 references | They read `balance-value`, `hold-readout`, `hold-capacity-used`, `fleet-fuel-*`, `fleet-range-*`. **Lever: if the strip reuses the same `data-testid`s the panel used, all five specs pass unchanged.** Strongly recommend pinning that in the impl contract — it removes five tier-4 edits and keeps the "assert the value, not the presence" discipline link 1 was taught. |
| **New** `VitalsStrip*.test.tsx` (probably 2–3 files) | — | ~14 requirements × 2–4 scenarios. |

### 7.2 Honest task estimate

| Block | Tasks |
|---|---|
| Change scaffolding, deltas, design.md | 4 |
| `roster-status.ts` extension + tests (pill projection, one derivation) | 4 |
| Shared gauge atom + tests (fill, segments, accessible naming) | 3 |
| Fleet cell + chevron + delegate wiring + tests | 5 |
| Pill rendering (7 states, degradation) + tests | 5 |
| Fuel cell (figures, gauge, absent/zero, drain state) + tests | 5 |
| Hold cell (three figures, kind segments, a11y naming) + tests | 5 |
| Credits cell incl. live region + announcement transitions + tests | 4 |
| Clock cell + accessible scale label + tests | 2 |
| Strip container: always-present, no-verbs, no-reads, no-selection-change, no-double-announce, width floor | 6 |
| Burn-preview lift to the view + `SpaceCommandPanel` prop conversion + the 5.1 fix + test-harness migration | 6 |
| Delete panel readouts; migrate/rewrite 11 `FleetActionsPanel` tests | 5 |
| Camera cluster shrink, keyboard pan binding, pan at-limit via status, 4 test rewrites | 6 |
| `SystemSpaceView` wiring + view-level tests | 4 |
| Journey update + tier-3/4 gate | 3 |
| **Total** | **≈ 57** |

**This exceeds the 40-task cap.** Link 1 came in at 55 against an implied ~30 by
exactly this arithmetic, so I am not discounting it.

### 7.3 Proposed seam — and why it is clean

**Cut at the burn-preview lift.**

- **`add-vitals-strip`** (~40–42 tasks): R1–R5, R7–R14 — the strip, all five
  cells, the plain fuel gauge, the pill, the chevron, the camera cluster shrink,
  the panel readout deletions.
- **`add-burn-cost-overlay`** (~14–16 tasks): R6 alone — lifting the preview to
  the mounting view, converting `SpaceCommandPanel` to props (its 34-test
  harness migration), the 5.1 fix, the gauge overlay, the recommended
  `A Failed or Stale Preview Is Never Presented as a Current Quote` MODIFIED.

**Why this seam and not another.** Every whole-surface invariant this change
states — no verbs (R2), always present (R1), no reads (R11), the width floor
(R14), the single-announcer rule (R13) — is a property of *the strip's own
elements*, and it is fully true of a strip whose fuel gauge has no overlay yet.
That is the difference from link 1's R12, which was a **tree-wide** invariant
over components the change did not own and therefore could not be half-shipped.
Here the second link adds one segment to one gauge; it re-asserts nothing.

The cross-component refactor (the preview lift) is also the only part that
touches a file the strip otherwise never opens, so the seam falls on a real
module boundary rather than through one.

Alternative seam considered and rejected as insufficient: splitting the camera
cluster into its own change (~6 tasks) leaves the strip at ~50 — still over.
It can ride either link; keep it with the strip, since the cluster only moves
because the strip takes the bottom edge.

**Ordering:** `add-vitals-strip` → `add-burn-cost-overlay` → `add-console-dock`
(2b). 2b depends on the strip existing, not on the overlay, so the split does
not disturb the chain's archive order.

---

## 8. Ambiguities, with the precedence tier that can resolve each

**A-1 — "the `85vw` floor" is not a decidable width.** *(Flagged disagreement
with RULING 2 as phrased.)* RULING 2 says the strip must be legible "at and
above an `85vw` viewport width". `85vw` is 85 % of whatever the viewport is; it
is not a threshold, and the code's `max-w-[85vw]` is a *cap on a 288-px panel*,
not a breakpoint (§ 5.3). The ruling's **intent** is unambiguous and I have kept
it (no mobile layout; the strip must not overflow); only its unit is unusable.
Resolution tier: **most-reversible** — restate against the archive-gate
journey's own viewport, `devices['Desktop Chrome']` = 1280 × 720 in
`frontend/playwright.config.ts`, which is the only laptop width this repo
actually exercises. R14 is written that way. If the panel prefers the literal
phrasing, it must supply a pixel number; the design input contains none, and
inventing one is the "premature precision" the spec-quality skill forbids.

**A-2 — What is the fuel gauge's 100 %?** The design gives the fuel cell a gauge
but names no denominator; no fuel-tank capacity is served (§ 6.3). Options:
(a) `cargoCapacity` — served, needs nothing new, and honest (fuel *is* cargo),
but it makes the fuel gauge a redundant view of one segment of the hold gauge;
(b) `cargoCapacity − (non-fuel cargo)` i.e. fuel + free hold — "how full could I
top up", arguably the more useful instrument, still purely served;
(c) a client high-water mark — stateful, unserved, rejected.
Resolution tier: **panel call** (a UX judgement), falling back to
**most-reversible** = (a), one expression. My recommendation is **(b)**: it is
the same two served fields, it is the figure a player refuelling actually wants,
and it keeps the two gauges from saying the same thing twice. Either way the
denominator must be named in the requirement so the gauge is testable.

**A-3 — Does the cost overlay imply a shortfall *figure* in 2a?** The chain doc
says only "the segment past the fill is the shortfall, in the affordability
colour"; the textual `▲ short 6.6 t` appears under Surface 3, which is link 4.
Resolution tier: **chain-doc lean** → no shortfall text in 2a. Recorded because
adding it later is free and removing it later is a spec change.

**A-4 — Is `Stranded` a pill *state* or an adornment?** The design lists
`Stranded` among the pill's values, but a stranded fleet is simultaneously
docked, parked or burning, and `fleet-roster`'s live *The Roster Row Shows a
Persistent Stranded Indication* renders it **alongside** the activity, not
instead of it. Making it a mutually-exclusive pill state would hide the fleet's
actual state exactly when the player most needs it. Resolution tier: **repo
decision** (the live roster requirement) → render the served `stranded` flag as
a distinct marker on the fleet cell, never replacing the activity. Recommended;
needs a one-line panel ratification.

**A-5 — Does extending `roster-status.ts` oblige the roster row to show the new
distinctions?** RULING 4 says "the derivation is extended once and both surfaces
read the extension". If the pill distinguishes `Holding` and the row still says
`Docked`, do they "disagree"? I read that as a projection difference, not a
contradiction — but it is the adversary's most likely line of attack.
Resolution tier: **panel call**. Recommendation: the extension adds fields the
row may ignore; `fleet-roster`'s *One Row Per Owned Fleet…* (9 scenarios) is
**not** modified, and `system-console` R4 states the agreement rule as "both
surfaces are functions of the one derivation's output for the same inputs", not
"both render identical text". If the panel rules the other way, budget one more
MODIFIED with 9 verbatim scenarios.

**A-6 — What does the chevron open?** A menu of own fleets, a cycle-to-next
control, or a mounted mini-roster? The chain doc calls it "the roster's *switch
acting fleet* affordance". Resolution tier: **most-reversible** → a menu of the
requester's own fleets delegating to the same callback the roster row uses (R3);
it gives cross-navigation for free and mounts no second roster. A
cycle-to-next control is cheaper but is undiscoverable and cannot express
"switch to the fleet three systems over".

**A-7 — How are hold-gauge kind segments distinguished without a palette
change?** No per-resource-kind colour vocabulary exists anywhere in the client
(`metals`/`volatiles`/… appear only in `lib/types/system-space.ts` and a spike
mock); the renderer defines none. The chain forbids palette changes.
Resolution tier: **repo decision** (`frontend/CLAUDE.md`'s colour system) →
zinc-family shades ordered stably by kind, with the kind and tonnage in each
segment's accessible name (R8), so the information is never colour-only. Flagged
because "segmented by kind" reads like it implies hues, and it must not.

**A-8 — Does the strip's clock replace the sr-only `space-world-clock`
element?** That span (`SystemSpaceView.tsx:670`) exposes `data-scale` and
`data-world-time` and is asserted by `SystemSpaceView.test.tsx`. It is not a
player-facing figure and no requirement covers it. Resolution tier:
**most-reversible** → keep it; the strip's clock is a `Figure` with its own
`data-raw`/`data-unit`. Two elements, two purposes, no duplicated *copy*.

**A-9 — Which fleets does the chevron offer: this system's, or all owned?**
Design input is silent. Resolution tier: **repo decision** → all owned, because
`system-space-view`'s *Fleet Roster Cross-Navigation* already defines what
choosing an elsewhere fleet means, and offering a subset would make the chevron
a second visibility filter (the pattern the chain doc's own link-3 ruling
refuses). Folded into R3.

**Nothing here needs information nobody in the repo has.** No hard stop.

---

## 9. Design decisions worth a `design.md`

1. **Where the burn-preview state lives after the lift** (RULING 5) and the
   prop shape passed to two consumers — plus the 5.1 defect it must not carry
   up. Include the `SpaceCommandPanel` test-harness migration note.
2. **The gauge as a shared atom**, its denominators (A-2), its clamping (R6's
   overflow case), and why its geometry carries no `data-raw` while its
   accessible name is formatter-produced (§ 3, caveat 2).
3. **The camera cluster's new shape** — which four cells, where the keyboard pan
   binding goes, why `select-pan-target-point` is not one of the four, and how
   the pan at-limit state is exposed once the pan buttons are gone (§ 4.2).
4. **The `roster-status.ts` extension** — the fields added, and the rule that the
   strip contains no branch on raw fleet state (RULING 4's enforcement shape;
   this is the "computable check" lesson from link 1 applied to state, not text).
5. **Testid preservation as a deliberate contract** — the strip inherits
   `balance-value`, `balance-figure`, `balance-live-region`, `hold-readout`,
   `hold-capacity-used`, `hold-capacity-total`, `hold-free`, `hold-<kind>-tons`
   so five tier-4 specs need no edit.

## 10. Out of scope — record in the proposal, do not spec

- The dock, its tabs, `Esc`, the selected-entity tab (links 2b and 4).
- The in-system list and the retirement of the `offscreen-*` chips (link 3).
- Figures on the arc, the Burn button on the curve, the shortfall *text*, the
  progress label (link 4).
- Retiring `SpaceCommandPanel`, `ScanControl`, `SightingLog`'s floating panel,
  the log toggle, or the right column — all 2b/4.
- The galaxy-view strip (chain doc: ruled *no* for this chain).
- Any mobile or responsive layout below the journey viewport.
- Any palette, type-scale or panel-fill change.
- Any backend field, endpoint, query or wire-shape change (RULING 8).
- Fixing `middlewares/oidc.go`'s `pushAudience` bug, `defect-station-order-500`,
  or the post-sale 409 — all named in the repo, all backend, none touchable here.

## 11. Proposed change structure

| # | Change id | Capabilities | Est. tasks |
|---|---|---|---|
| 2a-i | `add-vitals-strip` | ADDED `system-console`; MODIFIED `system-space-view` (`System Space View Route and Data Fan-In`, `Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point`, `Space View Camera Is Keyboard-Operable`); MODIFIED `docked-fleet-actions` (`Sell Commit`, `Refuel Commit`), REMOVED (`Fleet Panel Cargo Hold Readout`, `Credit Balance Readout`), ADDED (the failed-command announcement); MODIFIED `figure-formatting` (`An Absent, Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a Number`) | ~40 |
| 2a-ii | `add-burn-cost-overlay` | MODIFIED `system-console` (R6); MODIFIED `system-space-view` (`A Failed or Stale Preview Is Never Presented as a Current Quote`) | ~15 |

If the panel rejects the split, the single change is ~57 tasks and its own panel
will split it — the same conclusion link 1's *Why 2 is two links* reached about
step 2.
