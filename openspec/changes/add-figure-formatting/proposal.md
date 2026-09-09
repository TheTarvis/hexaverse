## Why

The system space view's HUD renders wire values straight to the eye: an
arrival reads as `21646048727`, fuel as `47.23519999999999 t`, range as
`13944.775743999995`. Nothing has a unit a player can reason in, and now
that fuel and burning are live, deciding whether a burn is affordable and
whether it strands the fleet is the first real decision the game asks a
player to make — the HUD does not support that decision. This is link 1 of
the `docs/plans/system-hud/chain.md` chain: a single pure formatting module
applied to every figure the current panels already show, fixing fault #1
with zero layout risk and giving links 2–4 their copy.

## What Changes

- **ADD** a new capability `figure-formatting` — `frontend/lib/format/`, a
  pure presentation module (no wire-rule computation, no ambient state) with
  one function per quantity: duration (relative, `Nm Ss`/`Nh Mm`/`Nd Hh`,
  wall-clock at the served scale), absolute world-time stamp (`T+ Dd HH:MM
  ×N`, world time, never divided by scale), tonnage (one decimal below 100,
  none at or above, thin space before `t`), range/distance (three
  significant figures, magnitude suffix, no unit name), delta-v (integer
  m/s), credits (`₡` glyph, thousands separator), rate (converted to a
  wall-clock denominator, unit chosen by magnitude), and the absent-value
  form (a single `—` for `undefined`/`null`/`NaN`/non-finite), and the
  absent-scale rule (a scale-dependent figure — a duration, a rate, or a
  stamp's `×N` suffix — reads absent, `—` or `×—`, on a mounting view that
  has not yet received a served world-clock scale, rather than assuming
  scale 1). Every rendered figure carries its raw served value and its unit
  on `data-*` attributes so tests assert wire figures, never copy, and the
  `×N` scale suffix carries an accessible label stating the world clock's
  rate, so its meaning does not depend on reading external documentation.
- **Delete `frontend/lib/eta.ts`** and both duplicated local `countdown()`
  copies (`FleetActionsPanel.tsx`, `ScanControl.tsx`) in the same change —
  three duration formatters collapse into the one module. No coexistence
  period.
- **Apply the module** to every figure `SpaceCommandPanel`,
  `FleetActionsPanel`, `FleetRoster`, `ScanControl`, `SightingLog`, and
  `SpaceStage`'s duration-bearing figures currently render, replacing
  component-local `toFixed` calls and raw template interpolation.
- **The mine and scan countdowns visibly change shape**, from `M:SS`
  (`2:03`) to the single cross-surface duration form (`2m 3s`). This is an
  intended, visible copy change on two surfaces, named here so it is not
  mistaken for a rendering regression.
- **`FleetRoster`'s `?? 0` fuel/range fallback becomes the absent form
  (`—`), a behaviour fix rather than pure formatting.** Today a fleet whose
  roster fields are unavailable reads `0t fuel`, indistinguishable from a
  fleet that is genuinely dry; after this change it reads as explicitly
  absent.
- **`stationkeep-rate` stops reading a raw world-second figure
  (`0.02 t/s`) and reads a wall-clock rate** (e.g. `1.2 t/min`), because a
  rate's denominator is converted to the time the player actually waits in,
  by direct analogy with the duration rule. The served rate field remains
  the sole source; the conversion is a presentation transform of that value,
  never a re-derivation from orbital elements.
- **MODIFY** `system-space-view` (7 requirements: burn preview figures, the
  burn-commit fuel ceiling, the commit-drift notice's four figures, the
  focused-scan target list's served duration, the running sweep's
  countdown, the sighting ghost's `asOf` label, and the burn commit's
  success toast), `docked-fleet-actions` (7
  requirements: cargo hold tonnage, credit balance, mine ETA preview, sell
  proceeds preview, refuel cost preview, station-keeping upkeep rate, and
  the sell commit's price-changed refresh), `fleet-roster` (2 requirements:
  fuel/range readout, the roster row's ETA countdown), and `sighting-log`
  (1 requirement: the row's `asOf` stamp) — copy-presentation clauses only;
  every existing scenario is reproduced unchanged except the one clause
  each delta amends.
- **`FleetRoster`'s `GalaxyView` mount gains a `scale` prop** (from
  `myFleets?.[0]?.scale`) so its ETA countdown can call the scale-taking
  duration formatter; this is a one-prop change at a shared component's
  mount site, not a change to the galaxy view's own chrome.

**Two credit vocabularies coexist until link 4.** `market-board-panel`'s
`{row.price} cr/t` is untouched by this change (it is chain link 4's
capability); `₡ 1,000` and `1000 cr/t` will read side by side on screen
until then. This is a recorded, temporary inconsistency, not an oversight.

## Impact

- **Affected specs:** ADDED `figure-formatting`; MODIFIED
  `system-space-view`, `docked-fleet-actions`, `fleet-roster`,
  `sighting-log`.
- **Affected code:** `frontend/lib/format/` (new),
  `frontend/components/figure/Figure.tsx` (new — the shared presentation
  element every migrated call site mounts), `frontend/lib/eta.ts`
  (deleted), `frontend/components/space/SpaceCommandPanel.tsx`,
  `FleetActionsPanel.tsx`, `ScanControl.tsx`, `SightingLog.tsx`,
  `SpaceStage.tsx`, `frontend/components/fleet/FleetRoster.tsx`,
  `frontend/components/galaxy/GalaxyView.tsx` (one prop at the roster mount
  site), plus the 9 vitest files and 6 Playwright files/helpers whose
  assertions read rendered figure text today and must read the raw-value
  attribute after.
- **No backend work.** Every figure this change formats is served today,
  including the `T+` stamp (world-ms is already elapsed-since-epoch,
  `backend/common/worldtime.go`) and the scale (`SystemSpaceRead.scale`,
  `Fleet.scale`). No new field, endpoint, or query.
- **Out of scope, deliberately, and recorded rather than silently skipped:**
  - The galaxy view's own chrome, layout, inspector, and clock. The galaxy
    clock's own assumed-scale-of-1 projection is a **pre-existing defect**,
    filed separately as
    `docs/plans/continous_space/handoffs/defect-galaxy-clock-assumes-scale-1.md`
    and left for a later change against `galaxy-view` — not fixed here.
  - `MarketBoardPanel`'s figures (`{row.price} cr/t`, the spread) — chain
    link 4's capability.
  - `SpaceStage`'s bearing and speed readouts (`toFixed`-formatted hover
    facts). They have no covering requirement in any live spec today
    (verified by grep), so adding rounding rules for them here would invent
    behaviour rather than migrate it; filed separately as
    `docs/plans/continous_space/handoffs/defect-hover-facts-unspecced.md`
    for a future brownfield pass. `SpaceStage`'s duration figures (`Arrives
    in …`, the ghost's sr-only `asOf` label) **do** move onto the formatter
    in this change, since `lib/eta.ts` dies with it.
  - Any layout, palette, type-scale, or panel-fill change.
  - Locale-aware or i18n formatting.
