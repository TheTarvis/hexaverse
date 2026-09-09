# System HUD — Scoping

> **Status: scoping (2026-09-08).** The system view's chrome is reorganised
> around three surfaces — an **in-system list**, **figures on the arc**, and a
> **console dock whose collapsed state is the vitals strip**. The direction
> was picked by Travis from four mocked alternatives on the design canvas
> (see Pointers). `?` = open; **DECIDED** = locked by Travis;
> **RECOMMENDED** = proposed here, not yet ratified. Depends on nothing new
> in the backend: every figure this HUD shows is already served.

## The problem (why this doc exists)

Fuel and burning landed, and with them the first real *decision* a player
makes in the system view: does this burn cost more than I have, and will it
strand me. The HUD that grew up alongside the earlier verbs cannot present
that decision. Four distinct faults, only one of them layout:

1. **Raw wire values reach the eye.** Arrival is a world-millis integer
   (`21646048727`), fuel is `47.23519999999999 t`, range is
   `13944.775743999995`. Nothing has a unit a player can reason in.
2. **Everything has the same weight.** A persistent vital (credits), a
   transient plan (course), an idle mode (scan), a toggle button and an
   error card all render as the same 11px-mono-label box in the same
   column. The eye has no way to tell what is *always true* from what is
   *about to happen*.
3. **The column is verb-ordered, not state-ordered.** Course, actions, scan,
   log and roster stack in fixed source order whatever the fleet is doing.
   A docked fleet still shows *Cut drive / Stop*. The fleet's state — the one
   fact that decides which verbs make sense — is buried in the roster card
   at the bottom.
4. **Low-frequency chrome takes prime space.** Twelve camera buttons sit
   dead-centre bottom; the off-screen reach chips top-left have no heading
   and no visible relation to the canvas.

The renderer is not the problem. Continuous space, the drawn burn curve, the
arrival ghost and the sighting ghosts all read well. This doc is about what
floats over it.

## The principle — where information lives is the design

**DECIDED (Travis, 2026-09-08).** Three placements, each answering one
question:

- **What is here?** → the **in-system list**, top-left. Every known entity
  in the system with its discovery status. Selection starts here or on the
  canvas; both are the same selection.
- **What will this cost?** → **figures on the arc**. The course's time, Δv,
  fuel and shortfall ride the drawn curve, because that is where the player
  is looking when they decide.
- **What do I know, and what can I do?** → the **console dock**, bottom.
  One tab per entity of interest, the acting fleet always among them.
  Collapsed, the dock *is* the vitals strip.

Nothing lives on the right any more. The right column — command panel,
actions panel, scan control, log toggle, roster — is retired as a
placement, not as a set of features; every feature moves to one of the three
surfaces below.

## Surface 1 — the vitals strip (the dock, collapsed)

**RECOMMENDED.** A single 56px bar along the bottom edge, always present,
full-width, the one place the always-true facts live. Left to right:

| Cell | Content | Source today |
|---|---|---|
| Fleet | acting fleet's name, chevron to switch; beneath it a state pill — `Docked · Gate sys_2_0`, `Burning · feat-extra-0 · 2m 40s`, `Holding · 0.4 t/h`, `Mining · 1h 23m`, `Stranded` | `Fleet.state`, `attachedTo`, active action ETA, `roster.stranded` |
| Fuel | `47.2 t · range 13.9k` over a gauge; the gauge draws a **cost overlay** whenever a course is previewed (the red segment past the fill is the shortfall) and a **drain** while burning | `roster.cargo.fuel`, `roster.estimatedRange`, `BurnPreview.fuelCostTons` |
| Hold | `47 / 200 t · 153 free` over a gauge segmented by kind (fuel is a kind) | `roster.cargo`, `cargoCapacity`, `freeHold` |
| Credits | `₡ 1,000` | `Corporation.credits` |
| (flex) | — | — |
| Clock | `T+ 2d 04:13 ×60` | `worldTime`, served `scale` |

The strip carries **no verbs**. It is the instrument panel; commands are in
the dock. That split is what gives the two weights the current column lacks.

The fleet cell's chevron is the roster's *switch acting fleet* affordance
(`fleet-roster` "Row Selection Delegated to the Mounting View"); the full
roster with per-fleet fuel/range/stranded stays a dock tab.

## Surface 2 — the in-system list

**RECOMMENDED.** Top-left, under the breadcrumb, headed `In system · N
known`. One pill per known entity: star, features, lane gates, stations,
foreign contacts and sighting ghosts the fog serves. Each pill shows a
colour dot (the canvas's own mark colour), the name, and a discovery
subtitle:

- `surveyed` / `remembered` — the observation band the entity is read in
- `docked here` — the acting fleet is attached to it
- `uncharted` — a gate whose lane the corp has not charted (dimmed)
- `ghost · T+ 1d 22:40` — a frozen sighting, at its `asOf`

Clicking a pill selects the entity (same selection as clicking its mark —
`system-space-view` "Toggle-to-Deselect Single Selection…") **and** reframes
the camera on it. This absorbs the off-screen reach chips
(`SpaceStage.tsx` `offscreen-*`): every entity is reachable from the list
whether on-screen or not, so the chips lose their reason to exist. The
"Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch"
requirement is satisfied by the list.

The list is **what's been discovered**, stated as a list — the fog's output
made legible without opening anything. That is the value Travis named in
direction A.

## Surface 3 — figures on the arc

**RECOMMENDED.** When a target is selected and the preview resolves, the
course label sits on the drawn curve near its midpoint, tethered by a short
leader:

```
4m 12s · Δv 269
53.8 t  ▲ short 6.6 t
```

Two lines, mono, 10px, the label's border and text in the affordability
colour (blue affordable, red not). The **Burn** button sits at the
destination end of the curve. While burning, the same label flips to
progress — `2m 40s left · Δv 269` / `burned 21.3 t · 32.5 t to go` — and the
curve draws its travelled portion solid, the remainder dashed.

The label is a projection of the existing preview
(`system-space-view` "Burn Preview Reflects the Server-Solved Order…"), not
a second quote; the quote-lock, stale-preview and double-submit
requirements apply unchanged to the Burn button wherever it is placed.

**`?` Open — where Burn lives.** Two readings:

- *On the arc only.* A player commits from the label without opening the
  console. Fastest loop; the label must then carry enough to commit
  responsibly (it carries time, Δv, cost and shortfall — the stranding
  warning is the shortfall line).
- *In the console only.* Commit always happens beside the full breakdown
  (ceiling, refuel-first suggestion). Slower, harder to mis-commit.

The mock shows both, with the arc's Burn dimmed when unaffordable. My lean
is **both**, with the arc button the primary path and the console's the
same control in a wider frame — one handler, two placements, so the
double-submit guard is shared. Travis to rule.

## Surface 4 — the console dock (expanded)

**DECIDED (Travis, 2026-09-08)** that the dock is the home of per-entity
detail. **RECOMMENDED** shape:

The strip stays as the dock's top row. Beneath it a tab bar and a detail
area of ~164px (220px total with the strip). Tabs:

| Tab | Always? | Content |
|---|---|---|
| **Acting fleet** (by name) | yes | state, park mode, hold/release, cut drive, and the docked verbs when attached — refuel/sell at a station, jump at a gate, mine at a feature (`docked-fleet-actions`, unchanged in substance) |
| **Selected entity** | when selected | what is known + what can be done *with* it — see below |
| **Scan** | yes | the focused-scan target list, sweep cost as time-and-exposure, commit, running-sweep window and cancel (`ScanControl` moves here whole) |
| **Log · N** | yes | the sighting log (`SightingLog` moves here whole; the floating panel and its toggle retire) |
| **Fleets · N** | yes | the roster (`FleetRoster`, `commandOwner="view"`) |

The selected-entity tab is the new thing. Its columns, for an asteroid
field:

- **Identity** — kind, id, orbit (`r 62 · 14d period`), when seen and in
  which band, distance from the acting fleet.
- **Lodes · remaining** — per kind, from the #0005 fold the board read
  already serves; kinds not observed read `— not seen`; beneath, *your rate
  and how long a full hold takes* from `roster.miningRate`.
- **Course** — the same figures as the arc label, plus the ceiling.
- **Actions** — every verb that applies to this entity, **dimmed rather than
  hidden** when it needs a state the fleet is not in: `Refuel 7 t · 28 ₡`
  (lit: a station is one jump or a docked hop away and the shortfall is
  known), `Burn` (dimmed: unaffordable), `Mine · after arrival` (dimmed:
  not attached).

For a station: offers and demand from the market board (`market-board-panel`
moves here as the station's tab content), fuel price, `Sell`/`Refuel`. For a
gate: the far system, charted or not, `Jump`. For a ghost: the sighting
record and its age. For a foreign contact: what the fog serves and nothing
more.

**Selection drives the dock; the acting fleet's state does not.** This
resolves the mode-versus-selection question: planning a burn while docked
and reading dock actions while burning are both just tabs. Selecting an
entity opens the dock on its tab if the dock is closed; `Esc` clears the
selection and, on a second press, collapses the dock.

**Default is collapsed.** The dock plus strip is close to a third of a
laptop viewport, so the strip alone must carry the common case and the arc
label must be sufficient to commit a burn (see the open question above).

## Formatting — the fix that is independent of layout

**RECOMMENDED.** One `lib/format/` module, pure, fixture-tested, used by
every surface:

| Quantity | Rule | Example |
|---|---|---|
| Duration to/since an ETA | `Nm Ss` under an hour, `Nh Mm` under a day, `Nd Hh` beyond; always relative, prefixed `in` / suffixed `left` / `ago` | `in 4m 12s` |
| World time absolute | `T+ Dd HH:MM` from the epoch, with the served scale after | `T+ 2d 04:13 ×60` |
| Tons | one decimal under 100, none above, thin space before `t` | `47.2 t`, `153 t` |
| Range / distance | three significant figures with a magnitude suffix | `13.9k`, `1,180 km` |
| Δv | integer m/s | `269 m/s` |
| Credits | thousands separator, `₡` glyph | `₡ 1,000` |
| Rates | per the unit the player waits in | `2.4 t/min`, `0.4 t/h` |

The raw served value stays on a `data-*` attribute of the formatted element
so tests keep asserting on wire figures, never on copy.

## What leaves

- The right column and its five occupants as *placements*
  (`SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`, the log toggle,
  `FleetRoster`) — their contents redistribute per the tables above; their
  requirements survive under new homes.
- The floating `SightingLog` panel at `right-[calc(18rem+2rem)]`.
- The off-screen reach chips.
- The twelve-button camera cluster, replaced by four (orbit, zoom in, zoom
  out, recenter) in the bottom-right corner above the strip. Orbit
  up/down/left/right and pan stay on keyboard and pointer
  (`system-space-view` "Space View Camera Is Keyboard-Operable" is
  unaffected); the on-screen buttons were always the fallback.

## What this does NOT do

- **No new backend.** Every figure is served today: preview, roster,
  credits, board, scan targets, inbox, sighting pile.
- **No galaxy-view change.** The galaxy view keeps its inspector; the strip
  is a system-view instrument. Whether the strip should persist across the
  departure hand-off is a later question.
- **No mobile layout.** The strip and dock are laptop-first; the `85vw`
  cap the column had today is the floor to keep.
- **No theming rework.** Same zinc palette, same 11px mono labels, same
  `white/[0.12]` panel fill — the mock lifts them from the current
  components. What changes is placement and weight, not vocabulary.

## Sequencing

**RECOMMENDED**, four steps, each shippable:

1. **Formatting module** — lands alone, applied to the current panels. Fixes
   fault #1 with zero layout risk and gives the later steps their copy.
2. **The strip + retire the right column's persistent bits** — credits,
   hold, fuel/range and fleet state move to the strip; the actions panel
   and roster move to a first-cut dock with fleet and fleets tabs. Camera
   cluster shrinks.
3. **The in-system list + selection reframing** — replaces the chips.
4. **Figures on the arc + the selected-entity tab** — the course panel
   retires last, once the arc label and the dock's course column both
   render the preview.

The change chain — ids, order, per-link scope, and the leans a full-auto
run rules from — is `system-hud/chain.md`; step 2 is split there into the
strip and the dock.

Each step is one OpenSpec change touching `system-space-view` (MODIFIED
placement requirements) with `docked-fleet-actions`, `fleet-roster`,
`sighting-log` and `market-board-panel` gaining "mounted in the console"
deltas rather than behavioural ones. Playwright journey at archive per
`docs/testing-tiers.md`.

## Open questions

- **`?` Burn placement** — arc only, console only, or both (lean: both, one
  handler). See Surface 3.
- **`?` Does selecting from the list reframe the camera, or only highlight?**
  Reframe is what the chips do today and what the mock assumes; a player
  browsing the list may not want the camera jumping.
- **`?` Persistent strip across views** — should the galaxy view show the
  same strip for the acting fleet, so the departure hand-off does not
  drop the instruments?
- **`?` Dock height** — 220px total is the mock's number; a resizable
  drag-handle is cheap but is one more thing to test.
- **`?` Foreign contacts in the list** — listed with the fog's audience
  rules, or only ghosts and own knowledge? The fog filter already answers
  what is servable; the question is whether a contact that is merely
  *visible* earns a list row.

## Pointers

- Design canvas (the four directions and the blend, two states):
  https://claude.ai/code/artifact/6e306911-277e-4c04-b46b-01a8db82f04f
- Today's HUD: `frontend/components/space/SystemSpaceView.tsx` (the column,
  `inset-y-4 right-4 … w-72`), `SpaceCommandPanel.tsx` (course),
  `FleetActionsPanel.tsx` (hold, credits, docked verbs), `ScanControl.tsx`,
  `SightingLog.tsx`, `SpaceStage.tsx` (camera buttons, off-screen chips),
  `frontend/components/fleet/FleetRoster.tsx`.
- Specs touched: `openspec/specs/system-space-view`, `docked-fleet-actions`,
  `fleet-roster`, `sighting-log`, `market-board-panel`, `focused-scan`.
- Related scoping: `propellant-and-delta-v.md` (why the burn decision is now
  the one that matters), `board-visual-language.md` (legible variation —
  the same instinct applied to chrome), `camera-and-input.md`.
