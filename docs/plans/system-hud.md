# System HUD — Scoping

## Task-first design interview — 2026-10-14

Variant D is the current preferred reference, but its layout is not a
constraint on this interview. Define the required player tasks and decisions
before choosing card arrangements or persistent HUD surfaces.

**Confirmed by Travis in this round:**

- Model finding objects (browse, search and filter), inspecting them,
  choosing a command fleet, issuing orders and monitoring progress.
- Use **travel** for moving a whole fleet to a destination, including a
  point in empty space. This does not mean transferring ships between fleets.
- Start with two end-to-end scenarios: find and compare resource-bearing
  objects, then send a fleet; and review fleets, choose an available fleet,
  then issue its next order.
- Phones support full completion of those tasks in portrait orientation.
  Cards must contain enough information to make the decision without
  relying on the map. The map can supplement that information.
- Focused choices may use temporary overlays. Avoid requiring several
  panels to remain open together, and keep finding and issuing orders quick.

**Confirmed in the next round:**

- Reasons for travel include engaging in combat, docking at a station,
  hiding a fleet within the system and mining minerals. Destination
  information must support these different decisions; mining is not the
  sole model for destination selection.
- Support goal-oriented object filtering alongside name search and object
  types, retaining search, filters and list position when returning from
  details.
- Once travel is committed, its ETA belongs to the fleet's activity rather
  than a persistent travel-planning card. Planning and ongoing fleet status
  are separate responsibilities.

**Confirmed card navigation and command flow:**

- Cards and the searchable text list present the same filtered objects.
  Preserve filters and selection when switching views. Mobile supports
  swiping through detail cards; desktop provides previous/next controls
  and keyboard navigation through the same results.
- Destination cards offer travel alone and, when supported, travel with an
  explicit activity on arrival, such as Travel and mine or Travel and dock.
  The review states the intended outcome. Combat initiation requires its
  own rules before an automatic attack-on-arrival action can be accepted.
  These are UX requirements, not claims that chained orders exist today.
- While browsing destinations, a compact command-fleet control shows its
  name and current activity, including destination and ETA during travel.
  Opening it shows the fleet's full card; full fleet details do not need to
  remain beside each destination card.
- Swiping changes only the inspected object within the current filtered
  results (for example Station 1, Station 2, Station 3). It does not issue
  an order or enter course review.

**Scanning and stealth clarification from Travis:**

- Include scanning in the HUD's action inventory. Its entry points and
  status requirements are confirmed below.
- Intended stealth is a cat-and-mouse interaction: a non-burning fleet is
  hidden; burning reveals a contact, which an opponent must scan to learn
  what it is; scanning exposes the scanner in turn. Exactly what a scan
  identifies remains open.
- For this HUD discussion, hiding can mean remaining docked, stationed or
  orbiting somewhere. It does not yet require a separate Hide command.
- Current code masks attached fleets and has scan-produced sightings;
  this does not establish the broader intended rule that every non-burning
  fleet is hidden. Preserve that distinction when implementing this design.
- The proposed purpose-specific card fields have not yet been accepted.
  In particular, reliable remaining mineral quantities and enemy combat
  strength are not currently served facts; requirements must distinguish
  desired information from available information.

**Confirmed scanning HUD scope:**

- Support starting an area scan from the fleet card and starting a scan
  of a contact or location from its inspected card. Identify the acting
  fleet and what is being scanned.
- Show scan details, ETA, completion percentage and results when complete.
- Visible burns remain unknown contacts until scanning supplies more
  information. Cards distinguish observed facts and observation age from
  information the player has not learned.
- Defer stealth-breaking rules, scan exposure and detailed range rules to
  another session. Travis clarified that scanning a ship exposes the
  scanner, whereas scanning an asteroid does not; do not generalize all
  scanning as exposing the fleet or add an exposure-review requirement in
  this HUD session.

**Still open:** the information required for each decision, precise object
filters, card/list navigation and comparison, transitions between tasks,
and which information persists.
Earlier layout choices below remain context rather than constraints.

### Narrowed interview: travel first

Travis requested stopping expansion of the action inventory and breaking
down one action before adding more. Focus next on **Travel here**, from
destination inspection through review, explicit commit and fleet-owned
progress. Work through this interaction one decision at a time. Other
activities remain parked; their inclusion does not settle their flows.

**Confirmed travel review:** choosing Travel here replaces the destination's
details with a compact review in the same card. Show fleet → destination,
arrival duration, fuel cost, fuel remaining and an explicit Start travel
action. Back returns to destination details with the filtered results and
browsing position preserved. Do not stack the full destination details and
the trip review within the card.

**Confirmed successful commit:** after Start travel succeeds, replace the
review with the command fleet's normal status card, showing destination,
progress, arrival countdown and Stop travel. This is the same fleet card
opened from the compact fleet control, not a separate trip-tracking card.
The player can resume browsing or dismiss it.

**Confirmed blocked travel:** keep the review visible, explain the blocker
beside a disabled Start travel action, and retain Back navigation. For an
insufficient-fuel trip, show fuel needed, fuel aboard and the shortfall
rather than a misleading negative fuel-remaining figure. Apply the same
inline-blocker pattern when the fleet is unavailable.

**Confirmed fleet switching during review:** tapping the fleet name opens
a compact fleet picker. Choosing a different fleet preserves the destination
and recalculates the trip. Show the newly selected fleet and updated estimate
before enabling Start travel again; blocked trips remain disabled with their
reason. Fleet switching does not commit travel.

The final inventory round confirmed the following for later work:

- Include refuelling, selling cargo at stations, gate travel and stopping
  or cancelling activities. Combat controls require a separate session.
- Fleet details show movement/mining and concurrent scanning separately,
  each with progress, ETA and applicable controls; the compact fleet control
  can summarize both.
- Completed scans show Results ready on the fleet and a completion event
  opening the report, without replacing the current inspection. Retain
  reports for later access, including explicit nothing-detected results.

## Design interview reopened — 2026-10-14

The current UI and a space-strategy reference prompted a fresh HUD review.
The September layout below remains historical design context; its specific
placements are not newly ratified by this interview.

**Confirmed by Travis:**

- Borrow the reference's layout principles: a dominant map, compact persistent
  status, readable labels, and contextual selection panels.
- The redesign may change selection, inspection and command interactions,
  as well as visual styling.
- A fleet overview shows which fleets need attention and what the others are
  doing, while the player inspects an individual fleet. Problems, completed
  activities and progress should be visible without inspecting every fleet.
- Ordinary commands target one fleet at a time. Ships are managed within
  their fleet; commanding multiple fleets together is a separate design topic.
- The fleet overview includes owned fleets across systems, with navigation
  to their locations.
- The compact fleet overview is visible by default, can be collapsed, and
  supports filtering and scrolling as fleet count grows. Rows show fleet
  name, location, activity, progress or ETA, and attention flags.
- Selecting a fleet in the overview shows its details and commands without
  moving the camera. A separate Go to fleet action opens its system and
  centers it.
- Players can select system objects through the HUD without clicking the
  canvas. Object details include fleets and bodies.
- The HUD communicates events such as fleet arrival and a detected unknown
  engine burn. Notifications distinguish urgency: a fleet under attack
  demands a prominent alarm; arrival is informational.
- Critical alerts stay prominent until acknowledged. Informational events
  appear briefly and remain in event history. Acknowledging an attack clears
  its alarm presentation, but not the fleet's ongoing danger indicator.
- A compact, searchable system object browser is visible by default, with
  filters for crowded systems. It includes known bodies, stations, gates,
  fleets and detected contacts. The browser and fleet overview are collapsible.
  Selecting an object opens details without moving the camera.
- Inspecting an object does not change the fleet receiving commands. Actions
  clearly identify that fleet and relate it to the inspected target. This
  also applies when inspecting another fleet or an unknown contact.
- Fleet rows stay in a stable order. Badges and notifications convey danger;
  needs-attention filtering or sorting is optional.
- Mobile is a design target: players should be able to play almost as easily
  as on a larger screen. The historical laptop-only scope below is reopened.
- Inspection leads with decision-relevant facts, using a small identifying
  visual. Large artwork and deeper statistics are available on expansion.
  Fleet details prioritize activity, destination, ETA, fuel and cargo; bodies
  prioritize known resources and nearby activity; contacts prioritize what
  was detected, where and how recently, with uncertainty explicit.
- An unknown engine burn normally produces an inspectable warning; a
  confirmed attack produces a critical alarm.
- Phones support the same core gameplay capabilities as larger screens,
  with an arrangement adapted to the device.
- Mobile starts with the map. Selecting an object opens a drawer version
  of the HUD, where the player can inspect and navigate between HUD content.
  Persistent Fleets / Objects / Events controls opening a bottom sheet were
  proposed, but the drawer-on-selection flow is Travis's preferred direction.
- Choosing a travel destination opens a course preview identifying the fleet,
  target, arrival time and fuel cost. Travel starts only through a separate
  explicit commit action, on desktop and mobile.
- The system object list and inspector are one browser. Selecting a row
  replaces the list with details; Back restores the list's filter, search
  and scroll position. The same navigation works inside the phone drawer.
- Owned-fleet details provide an explicit Command this fleet button. The
  command fleet stays visible while the player browses other objects;
  camera focus remains a separate Go to action.
- A target's command area explicitly shows Command fleet → Target above
  the available actions, including during course review. Selecting the target
  alone does not issue a command or transfer command to an inspected fleet.
- Fleet status and controls appear once, inside the combined browser when
  inspecting the command fleet. The separate persistent command card was
  rejected as duplicating that view. A compact command selector remains
  visible and opens the fleet's status and controls directly; target inspection
  replaces those details rather than adding another panel.

**Provisional layout, pending visual prototype review:** fleet overview,
combined object browser/inspector, persistent command-fleet status and actions,
compact global status and notifications, and a dominant map. The combined
browser supersedes the earlier proposal for separate object-list and detail
panels. Travis requested a visual prototype before committing to placements.
Desktop and phone layouts must both be reviewable.

**Rejected default:** automatically sorting the fleet overview by problems,
then completed activities, then ongoing work. Use stable rows and separate
notifications instead.

**Attention model:** monitor all owned fleets across systems while issuing
commands to one fleet at a time. Travis highlighted fuel, mining, scanning,
local travel and inter-system travel, with an arbitrary number of fleets,
each containing one or more ships.

**Prototype question:** which desktop arrangement best supports monitoring,
inspection and commands, and how should its drawer adapt to a phone? Compare
three structural variants on the existing HUD studio route using simulated
multi-fleet data. Layout acceptance waits for Travis's visual review.

**Unresolved:** exact placements and mobile drawer behavior pending prototype
review, detailed flows for individual activities, and large-fleet scaling.

### Prototype review

**First review: rejected.** Travis found the mobile layout wasteful and all
three desktop variants visually flat and neutral. None is an accepted layout.
The next pass keeps the settled interaction model but revisits presentation:
an edge-to-edge mobile drawer, one compact command header, report rows instead
of tall event cards, and a more expressive space-strategy visual direction.
Metallic framing, faction crests, illuminated controls, stronger color roles
and layered panel materials are prototype proposals awaiting review.

Run `npm run dev:frontend` from the repository root if the frontend is not
already running. Open `/dev/system-storyboard/hud?variant=A` on its local
port (20200 in this checkout). The original studio without a variant remains
available. All variants are development-only, with fictional data and commands
held in memory; reload or Reset restores the initial scenario.

- **A — Bridge:** vertically stacked fleet and object lists on the left,
  object details and fleet controls replace the object list; blue framing.
- **B — Operations:** fleet and object rails on opposite sides of the map,
  object details replace the object rail; industrial amber instruments.
- **C — Console:** horizontal fleet watch along the bottom, object browser
  on the left, details and fleet controls within the browser; violet panels.

All three now use an edge-to-edge bottom drawer on phones. Event history fits
its content up to the available height, with scrolling for longer histories;
other sections use a taller drawer with an explicit expand control. Drawer
navigation and the command fleet share two compact header rows, without a
separate event-page heading. The map remains visible above the event history.
The drawer has Fleets, Objects and Events sections. Inspection replaces its
source list within that section, with Back returning to the retained list.
After selecting Command this fleet, Choose a target opens the object list
with all object types shown. The command-fleet identity stays visible in
the drawer header; on desktop it also appears in the top status bar.

Use the floating arrows or keyboard left/right arrows to switch variants;
the URL preserves the choice. Phone preview constrains the viewport to 390px;
the same layouts also respond to actual phone-sized browser windows.
Study state exposes the command fleet, inspection, camera, fleet activities,
course preview and events. The visual system and simplified map are prototype
assets, not a replacement for the live 3D renderer.

Review the distinction between inspecting and taking command, navigation to a
remote fleet, acknowledgement of an attack while danger continues, and the
course preview / commit / simulated arrival sequence. Scan, mining and fuel
purchases have illustrative controls; this is a layout study, not complete
gameplay implementation. No layout has been selected for production.

---

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
