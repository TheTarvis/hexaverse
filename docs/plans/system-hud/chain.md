# The change chain — system HUD

The ordered set of OpenSpec changes that rebuilds the system view's chrome
around the three surfaces Travis picked on 2026-09-08: the **in-system list**,
**figures on the arc**, and the **console dock whose collapsed state is the
vitals strip**. The scoping doc `../system-hud.md` is the model and carries
the DECIDED / RECOMMENDED rulings; this document is the sequencing.

**Status (2026-09-08): drafted, nothing authored.** Every link is
`not authored` — no `openspec/changes/<id>/` folder exists yet. A plain
`/team --chain` run stops at link 1; `/team docs/plans/system-hud/chain.md
--full-auto` authors each link in-run from this document, the scoping doc and
the archived predecessors' specs, ruling the open questions below from their
recorded leans.

**No backend work anywhere in this chain.** Every figure the HUD shows is
served today — burn preview, roster, credits, market board, scan targets,
action inbox, sighting pile. A link that finds itself wanting a new field is
mis-scoped, not under-served; stop and re-read `../system-hud.md` "What this
does NOT do".

**Ground rules carried over from `../continous_space/README.md`:** solo toy,
burn the boats. No coexistence period for the old right column, no flag
guarding it, no "legacy layout" toggle. Each link deletes what it replaces
in the same change.

**Handoffs.** The team tooling (`.claude/commands/team.md`,
`.claude/workflows/openspec-team.js`) writes every per-change record —
panel reports, adversary rounds, rulings, journey — to
`docs/plans/continous_space/handoffs/` by a hardcoded path. This chain's
records land there too until that path is parameterised; the file names
carry the change-id, so nothing collides.

---

## The chain

| # | Change | Delivers | Capabilities | State |
| --- | --- | --- | --- | --- |
| 1 | `add-figure-formatting` | `lib/format/` — every player-facing figure has a unit; applied to today's panels; `lib/eta.ts` retired | ADDED `figure-formatting`; MODIFIED `system-space-view`, `docked-fleet-actions`, `fleet-roster`, `sighting-log` (copy only) | ✅ authored r3 `da3ba36` |
| 2a | `add-vitals-strip` | The 56px bottom strip: fleet + state pill, fuel gauge with cost overlay, hold gauge, credits, clock; camera cluster shrinks to four | ADDED `system-console` (strip half); MODIFIED `system-space-view`, `docked-fleet-actions` (readouts re-homed), `fleet-roster` (switch-fleet chevron) | ⬜ not authored |
| 2b | `add-console-dock` | The dock beneath the strip with **Acting fleet**, **Scan**, **Log**, **Fleets** tabs; the right column, the floating log panel and its toggle retired | MODIFIED `system-console`, `system-space-view`, `docked-fleet-actions`, `fleet-roster`, `sighting-log` (mounted-in-the-console deltas) | ⬜ not authored |
| 3 | `add-in-system-list` | Top-left list of every known entity with its discovery subtitle; click = select + reframe; off-screen reach chips retired | MODIFIED `system-space-view` | ⬜ not authored |
| 4 | `add-arc-figures-and-entity-tab` | Course label + Burn on the drawn curve, progress while burning; the **Selected entity** dock tab; `SpaceCommandPanel` retired last | MODIFIED `system-console`, `system-space-view`, `market-board-panel` (mounted as a station's tab) | ⬜ not authored |

**The archive order is the row order.** 2a and 2b are the scoping doc's step
2 pre-split (see *Why 2 is two links*); 4 carries a pre-identified seam in
case its panel finds it past the 40-task cap.

Out of the chain, deliberately: the galaxy-view strip (open question, ruled
*no* for now), a mobile layout, a theming pass, a resizable dock. None gates
any link.

---

## Link 1 — `add-figure-formatting`

**Why first.** Fault #1 in the scoping doc — raw wire values reach the eye —
is the only fault that is not layout, and every later surface renders the
same figures. Landing the formatter alone gives links 2–4 their copy and
proves the test-migration pattern with zero layout risk.

**Delivers.** One pure module `frontend/lib/format/` with a function per
quantity in `../system-hud.md` "Formatting", fixture-tested against a table
of (raw, expected) pairs:

| Quantity | Rule | Example |
| --- | --- | --- |
| Duration to/since an ETA | `Nm Ss` under an hour, `Nh Mm` under a day, `Nd Hh` beyond; relative, `in` / `left` / `ago` | `in 4m 12s` |
| World time absolute | `T+ Dd HH:MM` from the epoch, served scale after | `T+ 2d 04:13 ×60` |
| Tons | one decimal under 100, none above, thin space before `t` | `47.2 t`, `153 t` |
| Range / distance | three significant figures + magnitude suffix | `13.9k` |
| Δv | integer m/s | `269 m/s` |
| Credits | thousands separator, `₡` glyph | `₡ 1,000` |
| Rates | per the unit the player waits in | `2.4 t/min`, `0.4 t/h` |

Applied in the same change to every figure the current panels show —
`SpaceCommandPanel` (arrival, Δv, fuel, ceiling, the committed-vs-previewed
line), `FleetActionsPanel` (hold, credits, mine ETA), `FleetRoster` (fuel,
range, ETA), `SightingLog` (`asOf` stamps), `ScanControl` (sweep time) — and
`lib/eta.ts` deleted, its one caller-set moved onto the module.

**The contract that must survive review.** The raw served value stays on a
`data-*` attribute of the formatted element (`data-raw`, or per-figure names —
the writer picks one and the spec pins it) so tests keep asserting on wire
figures, never on copy. The formatter is the *only* place a wire number
becomes text; a component that calls `toFixed` or template-interpolates a
number is a defect.

**The hidden cost is the tests.** Every existing assertion on rendered
figures — `preview-arrival`, `preview-fuel`, `fleet-fuel-*`, `fleet-row-eta-*`
and their kin — reads the text today and must read the attribute after.
Size the tasks against the test files, not the components.

- **Touches:** ADDED `figure-formatting` (the rules table as requirements,
  one scenario per row plus the rounding edges — 99.95 t, 0 s, negative
  durations, scale ≠ 1); MODIFIED `system-space-view` "Burn Preview Reflects
  the Server-Solved Order…" and "A Commit's Actual Result Is Never Silently
  Swapped…" (the copy clauses only), `docked-fleet-actions` "Fleet Panel
  Cargo Hold Readout" / "Credit Balance Readout" / "Mine ETA Preview…",
  `fleet-roster` "The Roster Row Shows Held Fuel and an Estimated Range",
  `sighting-log` row stamps.
- **Must rule (see *Open decisions*):** what clock a relative duration counts
  in. `lib/eta.ts` assumes scale 1 in its own header comment while
  `SystemSpace.scale` is documented "never assumed to be 1"; the formatter
  must take the served scale and the spec must say which way it divides.
- **Anti-mirror:** `lib/format/` is presentation, not rules. It does not
  join the market mirror pair and must not compute anything Go decides
  (no affordability, no shortfall arithmetic — those arrive on the wire).
- **Journey:** the existing burn-preview walk with the arrival read as a
  relative duration and the fuel as tons; one assertion per formatted
  figure via its `data-*` attribute.
- **Source:** `../system-hud.md` "The problem" fault #1 and "Formatting";
  `frontend/lib/eta.ts`; the five components above.

## Link 2a — `add-vitals-strip`

**Why before the dock.** The strip is the dock's collapsed state, and
"default is collapsed" (DECIDED) means the strip alone must carry the common
case. Build the thing that is always on screen first; the dock then has a
top row to hang from.

**Delivers.** A single 56px bar along the bottom edge, always present,
full-width, **no verbs** — the instrument panel. Cells left to right per
`../system-hud.md` "Surface 1":

- **Fleet** — acting fleet's name; a chevron that is the roster's
  *switch acting fleet* affordance; beneath, one state pill derived from
  `Fleet.state`, `attachedTo`, the active action's ETA and
  `roster.stranded` — `Docked · Gate sys_2_0`, `Burning · feat-extra-0 · 2m
  40s`, `Holding · 0.4 t/h`, `Mining · 1h 23m`, `Stranded`.
- **Fuel** — `47.2 t · range 13.9k` over a gauge; a **cost overlay** whenever
  a preview resolves (the segment past the fill is the shortfall, in the
  affordability colour) and a **drain** while burning.
- **Hold** — `47 / 200 t · 153 free` over a gauge segmented by kind (fuel is
  a kind).
- **Credits** — `₡ 1,000`.
- **Clock** — `T+ 2d 04:13 ×60`, right-aligned.

In the same change: credits and the hold readout leave `FleetActionsPanel`
(the panel keeps its verbs until 2b), fuel/range leave the roster row's
prime position (the row keeps them — the roster stays a complete surface —
but the strip is now their home), and the twelve-button camera cluster
becomes four (orbit, zoom in, zoom out, recenter) in the bottom-right corner
above the strip. Orbit up/down/left/right and pan stay keyboard and pointer;
"Space View Camera Is Keyboard-Operable" is unaffected.

**What the state pill is not.** It is a projection of served state through
`roster-status.ts`'s existing derivation, never a second state machine. If
the pill and the roster row can disagree, one of them is wrong.

- **Touches:** ADDED `system-console` (the strip's cells, the no-verbs
  invariant, the gauge overlays, the state-pill derivation, the `85vw` floor
  as a MUST); MODIFIED `system-space-view` "Space View Camera Orbit, Pan, and
  Zoom" (the on-screen cluster) and the layout requirement the column lives
  under; `docked-fleet-actions` "Fleet Panel Cargo Hold Readout" and "Credit
  Balance Readout" re-homed to the strip; `fleet-roster` "Row Selection
  Delegated to the Mounting View" gains the chevron as a second delegate.
- **Sizing risk:** the gauge overlays are the only new rendering; the cost
  overlay reads `BurnPreview.fuelCostTons` and `affordable` off the preview
  the command panel already holds — lift that state to the view, do not
  re-query.
- **Journey:** dock at a station, read the strip's four cells, select a
  target and watch the fuel gauge grow a cost segment, commit and watch the
  pill flip to `Burning · … · Nm Ss`.
- **Source:** `../system-hud.md` "Surface 1" and "What leaves"; the design
  canvas (two states); `SpaceStage.tsx` camera cluster;
  `components/fleet/roster-status.ts`.

## Link 2b — `add-console-dock`

**Carved out of the scoping doc's step 2** — see *Why 2 is two links*.

**Delivers.** The dock beneath the strip: a tab bar and a ~164px detail
area (220px total with the strip), default collapsed, four tabs that always
exist:

| Tab | Content | Moves from |
| --- | --- | --- |
| **Acting fleet** (by name) | state, park mode, hold/release, cut drive, and the docked verbs when attached — refuel/sell at a station, jump at a gate, mine at a feature | `FleetActionsPanel`; the jump control out of `SpaceCommandPanel` |
| **Scan** | the focused-scan target list, sweep cost as time-and-exposure, commit, running window, cancel | `ScanControl`, whole |
| **Log · N** | the sighting log | `SightingLog`, whole; the floating panel and its toggle retire |
| **Fleets · N** | the roster, `commandOwner="view"` | `FleetRoster` |

The right column (`inset-y-4 right-4 … w-72`) is deleted. `Esc` collapses
the dock (the second-press rule lands with selection in link 4). The
`SpaceCommandPanel` loses its jump half to the Acting-fleet tab here and
keeps its course half — mounted in that same tab as an interim home — until
link 4 retires it. That is the one piece of chrome that survives two links,
and it is because the arc label does not exist yet.

**The requirements move, not change.** Every `docked-fleet-actions`,
`sighting-log`, and scan requirement keeps its scenarios verbatim; the delta
is a "mounted in the console" clause on each. The adversary's job on this
link is to catch a behavioural change smuggled in as a placement change —
the double-submit guards, the running-mine gating, the inbox-driven cancel
and the log's mount-ordering rule are the ones most likely to break when
their host component is remounted inside a tab.

**Tab remount is the trap.** `SystemSpaceView.tsx` already computes the
running-sweep marker *outside* `ScanControl` because the control must
survive a remount while the window is open. A tabbed dock remounts every
tab's content on switch unless the spec says otherwise. Rule it: tab
content stays mounted and hidden, or the spec names the state that must
survive a switch and the tests prove it.

- **Touches:** MODIFIED `system-console` (the dock, tabs, collapse, Esc);
  `system-space-view` (the column retired; the log-reachable, scan-surface
  and roster cross-navigation requirements re-pointed at the dock);
  `docked-fleet-actions`, `fleet-roster`, `sighting-log` (mounted-in-the-
  console deltas, scenarios verbatim).
- **Journey:** dock, open the Acting-fleet tab, refuel; switch to Scan and
  commit a sweep; switch to Log while it runs; switch back and cancel; the
  log row count is unchanged by the tab dance.
- **Source:** `../system-hud.md` "Surface 4" (all but the selected-entity
  tab), "What leaves"; `SystemSpaceView.tsx:779–890`.

## Link 3 — `add-in-system-list`

**Why after the dock.** The list drives selection and, in link 4, selection
drives the dock. Landing the list before the dock exists would give a click
nothing to open.

**Delivers.** Top-left, under the breadcrumb, headed `In system · N known`.
One pill per entity the canvas draws: star, features, lane gates, stations,
foreign contacts, sighting ghosts. Each pill: the canvas's own mark colour
as a dot, the name, a discovery subtitle —

- `surveyed` / `remembered` — the band the entity is read in
- `docked here` — the acting fleet is attached to it
- `uncharted` — a gate whose lane the corp has not charted (dimmed)
- `ghost · T+ 1d 22:40` — a frozen sighting, at its `asOf`
- a contact's subtitle per the *Open decisions* ruling

Clicking a pill selects the entity — the **same** selection as clicking its
mark ("Toggle-to-Deselect Single Selection…", unchanged) — and reframes the
camera on it. The off-screen reach chips (`offscreen-*` in `SpaceStage.tsx`)
are deleted in the same change; "Off-Screen Bodies and Lane Gates Are
Reachable by Pointer and Touch" is rewritten to be satisfied by the list.

**The list is the fog's output made legible.** It draws from the same
`space-scene` marks the canvas draws, so it can never list something the
scene does not show or miss something it does. A ghost is listed but is
"Not a Member of the Space View's Selection" — clicking its pill reframes
without selecting, exactly as clicking its mark does today.

- **Touches:** MODIFIED `system-space-view` — the off-screen reach
  requirement (chips → list), "Body, Lane-Gate, and Point Selection Is
  Keyboard-Operable" (the list is a second keyboard path and must not
  double-announce), the ghost non-selection requirement (a pill case).
- **Journey:** a system with a body off-screen at the default framing; click
  its pill; the camera lands on it and the burn preview resolves against it;
  a ghost pill reframes and selects nothing.
- **Source:** `../system-hud.md` "Surface 2"; `SpaceStage.tsx` chips;
  `space-scene.ts`, `space-selection.ts`.

## Link 4 — `add-arc-figures-and-entity-tab`

**Why last.** The course panel is the last right-column occupant standing,
and it can only retire once *both* of its replacements render the preview —
the label on the arc and the dock's course column. This link lands both and
deletes `SpaceCommandPanel`.

**Delivers, half one — figures on the arc.** When a target is selected and
the preview resolves, a two-line mono label near the curve's midpoint with a
short leader:

```
4m 12s · Δv 269
53.8 t  ▲ short 6.6 t
```

Border and text in the affordability colour. The **Burn** button at the
destination end of the curve. While burning the label flips to progress —
`2m 40s left · Δv 269` / `burned 21.3 t · 32.5 t to go` — and the curve
draws its travelled portion solid, the remainder dashed. The label is a
projection of the existing preview, never a second quote; quote-lock, stale-
preview and double-submit apply to the Burn button wherever it sits.

**Delivers, half two — the Selected entity tab.** Appears when something is
selected; selecting opens the dock on it if collapsed; `Esc` clears
selection, a second `Esc` collapses. Columns for an asteroid field:
Identity (kind, id, orbit `r 62 · 14d period`, seen when and in which band,
distance from the acting fleet), Lodes · remaining (the #0005 fold the board
read serves; unobserved kinds read `— not seen`; your rate and time-to-full-
hold from `roster.miningRate`), Course (the arc's figures plus the ceiling),
Actions (every applicable verb, **dimmed rather than hidden** with the
reason — `Refuel 7 t · 28 ₡`, `Burn` dimmed unaffordable, `Mine · after
arrival`). For a station: the market board as the tab content
(`market-board-panel` mounts here), fuel price, Sell/Refuel. For a gate: the
far system, charted or not, Jump. For a ghost: the record and its age. For a
contact: what the fog serves and nothing more.

**Selection drives the dock; the acting fleet's state does not.** Planning a
burn while docked and reading dock actions while burning are both just tabs.

**Pre-identified seam, if the panel finds this past 40 tasks:** half one
ships as `add-arc-figures` (label, Burn on the arc, progress, the command
panel's course figures moved to the Acting-fleet tab's course column,
`SpaceCommandPanel` retired); half two follows as `add-selected-entity-tab`
(the tab, `market-board-panel` mounted, the Esc two-press rule). Half one
is self-contained: the course panel can retire once the arc label and the
Acting-fleet tab's course column both render the preview.

- **Touches:** MODIFIED `system-space-view` "Burn Preview Reflects the
  Server-Solved Order…", "Burn Commit Reports Its Outcome", "Burn and Jump
  Commit Controls Guard Against Double-Submit" (one handler, two placements
  is a scenario, not an assumption), "Own-Fleet Position, Burn Curve, and
  Arrival Ghost Render Continuously" (solid/dashed split), "A Landed
  Resolution Is Announced…" (the label's flip is a second announcer — must
  not double-announce); `system-console` (the selected-entity tab, open-on-
  select, Esc); `market-board-panel` "Row Selection Delegated to the
  Mounting View" (the tab is the mounting view).
- **Must rule (see *Open decisions*):** where Burn lives.
- **Journey:** the M11 slice through the new chrome — dock at home, mine
  from the entity tab, sell from the station's tab, pick a premium from
  the board, select the far gate from the list, commit the burn from the
  arc, watch the label count down, jump.
- **Source:** `../system-hud.md` "Surface 3" and "Surface 4" (the
  selected-entity tab); `SpaceCommandPanel.tsx`; `space-scene.wire-curve`.

---

## Why 2 is two links

The scoping doc's step 2 moves five things at once: four persistent readouts
to a new strip, the actions panel and the roster into a new dock, and the
camera cluster. The previous chain's link 8a claimed 47 tasks and was 131;
its 8b, a "surface" change like these, was 119. `docked-fleet-actions` alone
carries fifteen requirements whose scenarios must survive a remount verbatim.
A single step-2 change would be authored past the cap and split by its own
panel anyway — better to split it here, at the seam the doc already names
(strip = instruments, dock = verbs), so each half has one journey and one
adversary target: 2a's is *does the strip lie about state*, 2b's is *did a
remount change a behaviour*.

## Why this order and not the doc's

The order is the scoping doc's own (formatting → strip → list → arc), with
the one split above. The alternative worth naming — arc figures before the
list, because the burn decision is the motivating problem — was rejected:
the arc label projects a preview that needs a selection, and until the list
lands, selection is canvas-only, so the label's journey could not walk from
"see it in the list" to "commit on the arc". Link 4's journey is the whole
loop; it needs everything before it.

## Open decisions gating the chain

Each row carries a recorded lean so a `--full-auto` run can rule with a
basis (`chain-doc`); a ruling Travis makes here before the run overrides
the lean. Rulings land as `FULL-AUTO RULING` entries in the link's
`-rulings.md` handoff.

| Decision | Gates | Lean |
| --- | --- | --- |
| **What clock a relative duration counts in.** `lib/eta.ts` assumes scale 1; `SystemSpace.scale` says never assume that. | link 1 | **Wall-clock.** A relative duration (`in 4m 12s`, `2m 40s left`) is the real time the player will wait: world-ms ÷ served scale. The absolute `T+` stamp is world time, with `×scale` shown so the two are never confused. Reversal: one function. |
| **Does the formatter earn its own capability?** | link 1 | **Yes** — `figure-formatting`. The rules are cross-surface and fixture-pinned; hanging them off `system-space-view` would make every later placement change reopen them. |
| **Who owns the strip and dock — a new capability or `system-space-view`?** | links 2a–4 | **New: `system-console`.** Collapse, tabs, open-on-select and Esc are behaviours that outlive any placement. `system-space-view` keeps *what the canvas draws and how you pick*; `system-console` is *what floats over it*. |
| **Do tabs stay mounted when hidden?** | link 2b | **Yes, mounted and hidden** (`hidden` attribute), so the running-sweep marker, the log's cursor and any in-flight commit survive a tab switch without a lifted-state refactor. Reversal: one prop. |
| **Where Burn lives.** Arc only, console only, or both. | link 4 | **Both, one handler** — the arc button is the primary path, the tab's is the same control in a wider frame; the double-submit guard is shared by construction. The scoping doc's stated lean. |
| **Does selecting from the list reframe the camera, or only highlight?** | link 3 | **Reframe on click.** It is what the chips do today, what the mock assumes, and what makes the list satisfy the off-screen reach requirement. Keyboard focus moving through the list highlights only; `Enter` selects and reframes. Reversal: one handler. |
| **Foreign contacts in the list.** | link 3 | **Listed — the list shows every mark the scene draws, one rule.** A contact the fog serves is already on the canvas; a list that omits it would be the second visibility filter this project has repeatedly refused to build. Subtitle `contact`. |
| **Dock height.** 220px fixed vs a drag handle. | link 2b | **Fixed 220px, no handle.** One less thing to test; the number is the mock's. Reversal: one change adding the handle. |
| **Persistent strip across views** (galaxy view). | none | **No, not in this chain.** The scoping doc lists it under "does NOT do"; the departure hand-off question is a later chain. |

Nothing else in `../system-hud.md` is open: the three placements and the
dock-as-home-of-detail are **DECIDED**; everything marked RECOMMENDED there
is the design input the writer authors from.

## What every link must not do

- Add a backend field, endpoint or query. The board read, preview, roster,
  inbox and pile already carry every figure.
- Touch the galaxy view.
- Produce a mobile layout. The `85vw` cap the column had is the floor.
- Change the palette, type scale or panel fill. Same zinc, same 11px mono
  labels, same `white/[0.12]`. Placement and weight change; vocabulary
  does not.
- Keep the thing it replaces. Column, chips, floating log, twelve-button
  cluster, `lib/eta.ts`, `SpaceCommandPanel` — each is deleted by the link
  that supersedes it, in the same change.
