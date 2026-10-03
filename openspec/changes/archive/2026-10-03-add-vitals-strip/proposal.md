## Why

The system view's always-true facts — the acting fleet's state, its fuel and
range, its cargo hold, the corporation's credit balance, the world clock —
currently live scattered across a right-column fleet panel and roster row
that stack in fixed source order regardless of what the fleet is doing.
Link 2a of the system-HUD chain (`docs/plans/system-hud/chain.md`) replaces
that with a single always-on bottom strip, the instrument panel half of the
console the chain is building toward. This is the first surface change in
that chain and must land before the dock (link 2b), whose collapsed state
the strip defines.

## What Changes

- ADD `system-console`, a new capability owning the vitals strip: a fleet
  cell (acting fleet's served id, a chevron menu of every owned fleet with
  its own keyboard-operability requirement, and a state pill projected from
  the shared roster derivation, with the served `stranded` flag as an
  adornment beside it), a fuel cell (tonnage and range over a plain gauge,
  draining marker while burning), a hold cell (used, total, and free tonnage
  over a kind-segmented gauge), a credits cell (the corporation's balance
  with its own live region), and a clock cell (the absolute world instant)
  — plus the strip's whole-surface invariants: always present, no verbs
  beyond the chevron, no reads of its own, no selection change on
  activation, a single announcing surface, and a 1280×720 CSS-pixel width
  floor below which nothing is specified.
- Re-home `docked-fleet-actions`' cargo hold readout and credit balance
  readout from the fleet panel onto the strip's hold and credits cells;
  update `Sell Commit` and `Refuel Commit` so their post-success refresh
  is described as landing on the strip, not the panel.
- Re-anchor the panel's failed-command assistive-technology announcement —
  previously the seventh scenario of the removed *Credit Balance Readout* —
  under its own new `docked-fleet-actions` requirement, so that behaviour
  keeps a home.
- Shrink the on-screen camera cluster in `SpaceStage.tsx` from twelve
  buttons to four (orbit, zoom-in, zoom-out, recenter); delete the four
  `camera-pan-*` buttons and bind a keyboard pan input on the surviving
  focusable group so `Space View Camera Is Keyboard-Operable`'s load-bearing
  pan capability and `select-pan-target-point`'s point-selection path both
  survive.
- Correct `system-space-view`'s *Toggle-to-Deselect…* requirement, which
  claims the acting fleet is set only by the roster row: it is set by three
  paths today (roster row, fleet mark, and now the strip chevron), and the
  requirement is rewritten to say so.
- Re-point `system-space-view`'s data fan-in requirement and
  `figure-formatting`'s absent-figure requirement at the strip's credits
  cell now that `docked-fleet-actions`' *Credit Balance Readout* no longer
  exists to cross-reference.
- **BREAKING** (repo convention: no coexistence period — root `CLAUDE.md`
  "solo toy, no backcompat"): from this change forward the fleet panel shows
  no cargo-hold or credit-balance readout of its own; those figures are
  strip-only, and the twelve-button camera cluster no longer exists.

## Out of scope

- **The fuel gauge's cost overlay** and everything that feeds it: lifting the
  burn preview to the mounting view, converting `SpaceCommandPanel` to props,
  the § 5.1 running-mine preview-suppression defect fix, and the
  `system-space-view` *A Failed or Stale Preview Is Never Presented as a
  Current Quote* MODIFIED. All of these are `add-burn-cost-overlay`, chain
  link 2a-ii, authored after this change archives (FULL-AUTO RULING 9). This
  change ships the strip with a **plain** fuel gauge — tonnage and range,
  no cost segment — so a reader should not read the absence of an overlay
  here as the fuel gauge being forgotten; it is the next link's payload.
- The console dock, its tabs, `Esc`, and the selected-entity tab (chain
  links 2b and 4).
- The in-system list and the off-screen reach chips' retirement (chain
  link 3).
- Figures on the arc, the Burn button on the curve, the shortfall *text*,
  and the burning-progress label (chain link 4).
- `fleet-roster` — no delta. The chevron delegates through that capability's
  existing *Row Selection Delegated to the Mounting View* callback contract
  without changing its text (FULL-AUTO RULING 15).
- Any backend field, endpoint, query, or wire-shape change (FULL-AUTO
  RULING 8). Any mobile or responsive layout. Any palette, type-scale, or
  panel-fill change.

## Impact

- Affected specs: ADDED `system-console`; MODIFIED `system-space-view`
  (*System Space View Route and Data Fan-In*, *Toggle-to-Deselect Single
  Selection Among a Body, a Lane Gate, or a Point*, *Space View Camera Is
  Keyboard-Operable*); MODIFIED `docked-fleet-actions` (*Sell Commit*,
  *Refuel Commit*); REMOVED `docked-fleet-actions` (*Fleet Panel Cargo Hold
  Readout*, *Credit Balance Readout*); ADDED `docked-fleet-actions` (*A
  Failed Command Is Announced to Assistive Technology*); MODIFIED
  `figure-formatting` (*An Absent, Non-Finite, or Unsupplied Figure Reads as
  Explicitly Absent, Never as a Number*).
- Affected code: `frontend/components/space/` (new `VitalsStrip*`
  components, `SystemSpaceView.tsx` wiring, `SpaceStage.tsx`'s camera
  cluster and keyboard pan binding), `frontend/components/fleet/
  roster-status.ts` (derivation extension), `frontend/components/space/
  FleetActionsPanel.tsx` (hold/balance readout removal, failed-command
  live region re-anchored), `frontend/components/corporation-provider.tsx`
  (new non-throwing `useCorporationSessionOptional()` accessor exposing
  `isError` for the credits cell's stale-balance rule), `frontend/lib/types/
  fleet.ts` (new `PARK_KIND_ORBIT`/`_STATIONKEEP`/`_POINT` exports).
