## 1. Roster-status derivation and gauge atom

- [ ] 1.1 Extend `roster-status.ts` ADDITIVELY: `tone`, `where`, `activity`
      and `remainingMs` SHALL return byte-identical values for every input
      they return today, and the pill's new distinctions arrive as NEW
      optional fields the roster row is free to ignore, each an
      already-resolved label or token, never a raw wire enum for the pill to
      branch on itself: park mode (resolved from `Park.Kind`); the docked
      host's served type word and served id (looked up by `attachedTo`
      against BOTH the interior read's `features` and its `laneGates`; a
      `laneGates` hit resolves to `Gate` plus `systemNames[gate.destSystemId]`,
      falling back to the raw `destSystemId` when the galaxy read has not
      resolved it, since no body on either collection carries a `name`
      field — never a client-synthesised host name for a `features` hit,
      and the raw `attachedTo` id when neither collection matches); the
      burn's served target, resolved by the **same both-collections lookup
      as the docked host** — a `features` hit as its served type word plus
      served id, a `laneGates` hit as `Gate` plus
      `systemNames[gate.destSystemId]` (same raw-id fallback), and, when the
      served target's body id matches neither collection or the interior
      read has failed, the raw body id — or naming a point target
      explicitly as "a point in space", never raw coordinates, when the
      served target carries no body id; the station-keeping rate; and, for
      any figure with a remaining duration (burn, jump, mine), an
      **absolute world-millisecond instant** field (the underlying ETA)
      additive alongside the existing span-shaped `remainingMs`, so a
      consumer can re-express the countdown against a later projected world
      time without re-deriving it. Naming the stationkeep park needs
      `Park.Kind`, an opaque wire enum already hard-coded in two places
      (`FleetActionsPanel.tsx:310-311`, `space-scene.ts:589,602`): export
      `PARK_KIND_ORBIT`/`PARK_KIND_STATIONKEEP`/`PARK_KIND_POINT` once from
      `lib/types/fleet.ts` beside the existing `SHIP_MODE_*` constants and
      repoint both existing sites, so the derivation is not the third copy
- [ ] 1.2 Keep every existing `roster-status.test.ts` case asserting the old
      four fields exactly — that table is the additive-only check — and add
      cases for the new fields only; re-run `FleetRoster.test.tsx` to
      confirm the row is unaffected
- [ ] 1.3 Build a shared gauge atom: a plain fill-ratio variant (fuel) and a
      kind-segmented variant (hold), both over the served `cargoCapacity`
      denominator, segments sorted by kind name — so two reads of the same
      pool render the same order — in zinc-family shades. The gauge is
      DECORATIVE — `aria-hidden`, no `data-raw`, no
      `aria-valuenow`/`aria-valuetext`, no percentage, no accessible name;
      every number a player or a test reads is an adjacent `<Figure>` in the
      cell's text. The gauge carries a DOM-observable state attribute
      distinguishing no data, no fill/no segments, and a rendered fill, so
      that state is assertable without parsing the adjacent figure's text
- [ ] 1.4 Test the gauge atom: fill ratio, segment count and order, the
      no-data/no-fill/filled state attribute, legibility with colour removed
      — the gauge exposes no accessible value; every kind and tonnage is
      carried by the cell's text

## 2. Fleet cell and chevron

- [ ] 2.1 Render the fleet cell's identity from the acting fleet's served
      id (no synthesized display name — `Fleet` carries no `name` field)
      and its chevron; when there is no acting fleet the identity shows the
      absent form but the chevron stays present and interactive
- [ ] 2.2 Wire the chevron to a menu of every fleet the requester owns
      (never filtered to the open system, and reading the own-fleets query's
      live data on every render rather than a snapshot frozen at open time;
      an own-fleets read whose most recent attempt has failed empties the
      menu rather than freezing its last-served membership or destinations),
      delegating the chosen fleet through the roster row's existing callback
      contract; on a same-system choice, return focus to the chevron and
      update its accessible name to name the newly acting fleet. Each entry
      shows its fleet's served id and the display name of the system it is
      in (`systemNames`, falling back to the raw system id when the galaxy
      read has not resolved it), or that it is under way between systems
      for a fleet in lane transit
- [ ] 2.3 Verify the fleet-mark activation path (`onActivateFleet`), the
      roster row, and the chevron all delegate to that one callback, and
      that none of the three adds the fleet to the space-view's
      body/lane-gate/point selection
- [ ] 2.4 Make the chevron and its menu keyboard-operable: reachable via the
      strip's tab order, opens with Enter or Space, entries reachable by
      arrow-key navigation and selectable with Enter, and Escape closes the
      menu without choosing and returns focus to the chevron — a
      conventional accessible menu-button primitive (a native `<select>` or
      an ARIA `menu`/`listbox` pattern) gets this for free
- [ ] 2.5 Test: identity by served id, the chevron surviving the
      no-acting-fleet state, chevron menu membership (all owned fleets,
      sole-fleet case, empty for a requester who owns no fleet),
      same-system/other-system/on-lane delegate outcomes,
      selection-independence across all three paths, keyboard operability of
      the chevron and its menu (open, navigate, select, Escape), focus
      return plus the accessible-name update on a same-system switch, each
      entry's fleet-id-plus-system-name label with the raw-id fallback, and
      the menu emptying rather than freezing after a failed own-fleets
      refetch

## 3. State pill

- [ ] 3.1 Render the pill from a props signature of the derivation's return
      value — or its explicit absence, supplied by the mounting view
      whenever the own-fleets read's most recent attempt has failed — the
      served `stranded` flag, the served world-clock `scale`, and the
      mounting view's projected `worldTime`. The pill SHALL NOT receive a
      `Fleet`, and SHALL NOT read `Fleet.state`, `attachedTo`, a park kind,
      or an action ETA **from the fleet read** — the derivation's own
      additive fields (park mode, the resolved host/target labels, the
      remaining-duration span, and its absolute-instant ETA anchor) are its
      resolved conclusions, not raw fleet state, and the pill renders them
      without branching on a wire enum; a branch on an actual `Fleet` field
      is a type error rather than a review finding. `scale` and `worldTime`
      are the only additional inputs beyond the derivation's output, since
      `figure-formatting` makes scale a required argument of the
      duration/rate formatters this pill renders and the projected clock is
      what task 3.4's advancing countdown reads from
- [ ] 3.2 Render the served `stranded` flag as a marker beside the pill,
      distinct from and never replacing the activity pill
- [ ] 3.3 Degrade the pill to the raw id (never blank) when the interior
      read cannot resolve a docked host or a burn target — including when
      `attachedTo`, or the burn's served target body id, matches neither
      the interior read's `features` nor its `laneGates` collection, or the
      interior read has failed; same pattern for the holding state's rate
      figure when the fleet read has not yet served it
- [ ] 3.4 Compute a duration the pill renders from the derivation's
      absolute-instant ETA anchor (task 1.1) and the `worldTime` prop (task
      3.1), via `figure-formatting`'s `world-ms-span-left` formatter, rather
      than a value baked in at the last read, so it advances between reads
      with no refetch and no new derivation output — the same fixed anchor
      formatted against a later `worldTime`. A rate the pill renders (the
      holding state's station-keeping rate) is the fleet read's served
      value at the served scale and is NEVER computed against the projected
      clock. Show the pill's absent form, not the last-rendered state, when
      the own-fleets read's most recent attempt has failed, even though a
      cached fleet read remains
- [ ] 3.5 Test: all seven pill states — including drifting, in transit, and
      on station, asserted against the strip component directly rather than
      through `SystemSpaceView` — the stranded marker alongside each, the
      degraded-host cases (a `laneGates` hit naming the destination system,
      a `features` hit naming its type and id, a match against neither
      collection), the degraded-target cases (a burn toward a `laneGates`
      entry naming `Gate` plus the destination system, and a burn target
      matching neither collection or a failed interior read naming the raw
      body id), the degraded-rate case, a body-target burn naming the
      target by its served type word and served id — asserted to fail
      against an invented name and against a render that drops the type
      word where one is available, and, separately, against a raw-id-only
      render for a resolvable target (never against the legal raw-id
      fallback for an unresolvable one, which the degraded-target cases
      above assert directly) — a point-target burn naming the target as a
      point with no raw X/Y/Z coordinate figures, the pill's countdown and
      rate reading absent before a world-clock scale is served, the
      property check that two fleets with equal derivation output, and not
      absent, render identical pill text at the same projected world time
      when supplied only that output, the served `stranded` flag, the
      served scale, and
      that world time, a countdown advancing between two renders at
      different `worldTime` values with no new derivation output, and the
      pill going absent (not frozen) when the own-fleets read's most recent
      attempt has failed

## 4. Fuel cell

- [ ] 4.1 Render fuel tonnage and range (`figure-formatting` `tons`/`range`)
      over the gauge atom (fill = served `fuel` / served `cargoCapacity`),
      with an adjacent label identifying the range
- [ ] 4.2 Handle the absent case (no gauge fill) identically for an
      unserved roster and for a fleet whose cargo pool carries no `fuel`
      entry — the wire omits a kind held at zero, so there is no served
      zero to distinguish; this matches the roster row's own absent
      rendering for the same fleet
- [ ] 4.3 Mark the cell draining while the acting fleet's effective state is
      a burn; update the figure and gauge fill only when a read serves new
      values, never interpolated between reads
- [ ] 4.4 Test: figures and gauge fill, the absent state for a fleet holding
      no fuel or an unserved roster (matching the roster row's rendering for
      the same fleet), drain marker, figure unchanged between reads while
      burning, and the gauge's state attribute reading its no-data value for
      an unserved roster and its rendered-fill value — never the same
      value — for a fixture whose fill rounds to less than one pixel at the
      1280-px width floor (0.05 t against 200 t capacity), so a thin fill
      cannot pass as the no-data case

## 5. Hold cell

- [ ] 5.1 Render used, total, and free hold tonnage (`figure-formatting`
      `tons`), each derived from the acting fleet's own owner-only roster
      fields, over the kind-segmented gauge atom, `fuel` as an ordinary kind
- [ ] 5.2 Handle the unloaded-roster absent case (all three figures absent,
      no segments) and the empty-hold case (no segments, the served `free`
      figure rendered — never client-derived — for a fixture where it
      equals capacity); reflect the post-resolution cargo when a running
      mine's ETA passes and the space view's refetch lands the updated
      fleet read, via the mounting view's existing refetch rules, without
      navigation
- [ ] 5.3 Test: contents and capacity with segments (each segment's own
      served tonnage on `data-raw`), the empty-hold case asserting the
      served `free` value rather than the capacity−freeHold equation,
      absent roster, each segment's kind-and-tonnage text, the
      no-data/no-segments state attribute, and the hold's refresh when a
      running mine resolves

## 6. Credits and clock cells

- [ ] 6.1 Add `useCorporationSessionOptional()` beside `useCorporationOptional`
      in `frontend/components/corporation-provider.tsx`, returning
      `{ corporation: Corporation | null, isError: boolean }` without
      throwing when no provider is mounted (the throwing
      `useCorporationContext` is not an option here, for the same reason
      the space view already avoids it for the balance). Render the credit
      balance (`figure-formatting` `credits`) from that accessor — not
      `useCorporationOptional`'s bare `corporation?.credits` — so a session
      read that resolved once and has since failed to refresh also shows
      the unavailable indication rather than the stale balance — with an
      explicit unavailable indication distinct from `figure-formatting`'s
      generic absent form
- [ ] 6.2 Add the live region announcing a balance change and a
      figure/unavailable transition, in either direction
- [ ] 6.3 Render the world clock (`figure-formatting` `world-ms-instant`)
      with its accessible `×N` scale explanation, `×—` when no scale is
      served, and track whether a world time has ever been served (latched
      true the first time `serverWorldTime` is defined) so the whole stamp
      reads absent — never `T+ 0d 00:00` — until that latch flips,
      independent of `useWorldTime`'s own client-local animation default.
      WHILE no world-clock `scale` has been served, the stamp SHALL hold at
      the last served world instant and SHALL NOT project forward from the
      mounting view's ticking `worldTime` — `useWorldTime`'s own internal
      `?? 1` default is for its animation only and is never an honest rate
      to advance the clock cell at, and re-renders at the newest served
      instant whenever a later read serves one, still without projecting it
      forward. Once latched AND a scale has been served, the stamp and its
      `data-raw` re-render as the mounting view's projected `worldTime`
      advances, with no refetch required
- [ ] 6.4 Test: balance figure, unavailable indication, a stale balance
      after a prior successful read is never shown as current
      (`useCorporationSessionOptional`'s `isError` case), update on sale,
      update on refuel, change announcement, transition announcement, clock
      stamp and accessible suffix, unscaled `×—` case, the whole stamp
      reading absent before any world time has been served, the stamp
      advancing between two renders at different `worldTime` values with no
      new read while a scale is served, and the stamp holding at its last
      served instant — not projecting forward at an assumed scale of 1 —
      across two renders while no scale is served

## 7. Strip container invariants

- [ ] 7.1 Mount the strip on every render of the system space view —
      including a failed interior read, a failed own-fleets read, and an
      unavailable renderer — with unfed cells showing the absent form
      rather than being removed, and rendering no error or retry affordance
      of its own for a failed own-fleets read (that surface belongs to the
      fleet panel)
- [ ] 7.2 Enforce, across the strip: no element beyond the chevron and its
      menu issues a mutating request; the strip issues no network read of
      its own; activating any strip element never changes the space-view
      selection; the strip announces only the credits cell's own changes,
      never a landed burn, jump, or mine
- [ ] 7.3 Enforce the 1280×720 CSS-pixel width floor: every cell renders
      without horizontal overflow, truncation, or a second row, at that
      viewport and every wider one, and no other floating surface (command
      column, camera cluster, failed-sightings retry) overlaps a strip cell
- [ ] 7.4 Test: the always-present matrix (failed interior, failed
      own-fleets with no retry of its own, unavailable renderer, no acting
      fleet in this system with the chevron still listing fleets owned
      elsewhere, no owned fleet at all with an empty chevron menu), the
      no-verbs and no-reads enumerations, no-selection-change on activation,
      the single-announcer rule, the width floor at 1280×720, and no strip
      cell overlapped by the command column, camera cluster, or a failed
      sightings retry at that viewport

## 8. Wire the strip in and retire the panel's readouts

- [ ] 8.1 Mount the strip full-width across the foot of `SystemSpaceView`,
      supplying the own-fleets read (its data and its error state, so a read
      that resolved once and has since failed to refresh is distinguishable
      from current), the interior and galaxy reads the pill needs, the
      corporation session (via `useCorporationSessionOptional`, its data and
      its error state), the world clock's served scale and its live
      projected `worldTime` for every advancing figure (never
      `serverWorldTime` for those — the pill and clock cell both need the
      ticking value to advance between reads), plus the last served world
      instant itself, which the clock cell holds at while no scale has been
      served, and the roster derivation's output; and clear
      the bottom band for it — raise the command column's bottom inset
      above the strip (`SystemSpaceView.tsx:791`'s `inset-y-4`), lift
      `sightings-unavailable` (`:759`) above it so its retry stays
      reachable, and re-anchor the camera cluster bottom-right above it
      (`SpaceStage.tsx:609`)
- [ ] 8.2 Remove `FleetActionsPanel`'s cargo hold and credit-balance
      readouts; leave `panel-error-live-region`
      (`FleetActionsPanel.tsx:371-373`) in place — it is a sibling of the
      balance block, not inside it — and re-point its comment and its test
      at this capability's new *A Failed Command Is Announced to Assistive
      Technology* requirement
- [ ] 8.3 Point `Sell Commit`'s and `Refuel Commit`'s post-success refresh at
      the strip's hold and credits cells, reusing the panel's former
      testids on the strip's cells so the tier-4 specs that read them need
      no edit: `balance-readout`, `balance-value` (keeping its
      `data-available` attribute), `balance-figure`, `balance-live-region`,
      `hold-readout`, `hold-capacity`, `hold-capacity-used`,
      `hold-capacity-total`, `hold-free`, `hold-<kind>`, `hold-<kind>-tons`.
      Each of these testids' subtrees SHALL contain exactly the one
      `[data-raw]` it names (`hold-capacity` excepted, read only via
      `-used`/`-total`) — the e2e `digits()` helper throws on a composite
      (`e2e/helpers/space-view.ts:488-497`)
- [ ] 8.4 Migrate/rewrite `FleetActionsPanel.test.tsx`'s cargo-hold-readout
      and credit-balance-readout describes onto the strip's suite; keep the
      failed-command-announcement test in place, re-pointed at the panel's
      new requirement
- [ ] 8.5 Test: `SystemSpaceView` mounts the strip fed from its own reads;
      the panel renders no hold or balance readout; a sale's or refuel's
      refreshed reads land on the strip

## 9. Camera cluster shrink

- [ ] 9.1 Restructure the cluster to exactly four sibling cells —
      `camera-orbit` (one focusable cell carrying `tabIndex=0`,
      `CAMERA_CONTROL_ATTR` and the key handler, replacing the four
      `camera-orbit-*` buttons; pointer orbit is already served by canvas
      drag), `camera-zoom-in`, `camera-zoom-out`, `camera-recenter`. Delete
      the four `camera-pan-*` buttons. Move `select-pan-target-point` out of
      the cluster wrapper so the four-cell count is a DOM fact, carrying
      `CAMERA_CONTROL_ATTR` onto it so `SpaceStage.tsx:252`'s canvas-pick
      suppression still reaches it
- [ ] 9.2 Bind `Shift`+arrow-key pan on `camera-orbit`'s existing
      `onKeyDown`, using the deleted buttons' exact step vectors (Left
      `-1,0`, Right `1,0`, Up `0,1`, Down `0,-1`) and the existing pan
      bound; bare arrows continue to orbit. Update the camera cluster's
      accessible name or description to state the `Shift`+arrow pan binding,
      so a screen-reader user discovers the mechanism without the deleted
      on-screen buttons
- [ ] 9.3 Move BOTH axes' at-limit state onto `camera-orbit`:
      `data-pan-at-limit` naming the blocked pan directions (from the
      existing `panAtLimit` helper) and `data-orbit-at-limit` (`min`/`max`,
      from `orbitLimit`), each absent away from its clamp. Leave
      `camera-limit-status` and its zoom>pan>orbit priority chain unchanged
- [ ] 9.4 Confirm `select-pan-target-point` is untouched by the shrink —
      still in tab order, still selecting the live pan target
- [ ] 9.5 Repoint every `SpaceStage.interaction.test.tsx` test that drives
      the camera through a deleted button — fourteen tests reference
      `camera-pan-*`/`camera-orbit-*`, and nine of them belong to
      requirements this change does not touch (recenter, selection
      survival, pick radius) and merely used the pan button as a
      camera-mover. Drive them by the new `Shift`+arrow pan and the single
      `camera-orbit` cell instead; assert the at-limit tests against
      `data-pan-at-limit`/`data-orbit-at-limit`, including a pan limit
      staying observable while the camera is also at the zoom clamp;
      re-run the `select-pan-target-point` tests unmodified

## 10. Verification

- [ ] 10.1 Per-commit gate green: `bash .claude/scripts/check.sh` and
      `python3 .claude/skills/code-quality-checks/check.py --files-only`
- [ ] 10.2 Journey spec written after every task above is checked; tier 4
      then tier 3 run once each with the tree locked — archive time only,
      never per task
- [ ] 10.3 `docs/plans/continous_space/handoffs/add-vitals-strip-journey.md`
      written with the suite budget line. After `openspec archive`, confirm
      `openspec/specs/system-console/spec.md`'s `## Purpose` reads the
      boundary paragraph already pasted verbatim into
      `docs/plans/system-hud/chain.md`'s Link 2b section — the artifact
      link 2b inherits — and not the archiver's generated `TBD - created by
      archiving change add-vitals-strip` placeholder: `grep -c 'TBD -
      created by archiving' openspec/specs/system-console/spec.md` SHALL
      return `0`; if it does not, paste the Purpose in by hand. Record the
      confirmation (pass or the hand-paste) in the journey handoff
