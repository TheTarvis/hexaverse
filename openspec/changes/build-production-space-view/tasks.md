## 1. Frontend — `lib/space` render math, and the guard that polices it

- [ ] 1.1 Widen `cross-stack-determinism`'s anti-mirror requirement itself to
      say the name comparison and the `sharedNames` match are
      case-insensitive, and that a collision is resolved by renaming the
      TypeScript rather than by widening the allowlist. Without this the check
      built by 1.2 is STRICTER than the requirement it enforces, and a future
      agent "fixing" it back to case-sensitive would be following the spec
      (`cross-stack-determinism`: "A lower-camel twin of an authoritative Go
      export fails the check")
- [ ] 1.2 Make `check-mirror-map.sh`'s anti-mirror comparison
      **case-insensitive** on both sides, and match `sharedNames`
      case-insensitively too, so `ArcParam`/`arcParam`, `Speed`/`speed` and
      `StateAt`/`stateAt` collide. In the same edit, fix the scan's **reach**:
      `anti_mirror` walks `for f in "$TS_DIR"/*.ts` — one directory level, and
      `.tsx` excluded — while the requirement it enforces demands *every*
      exported declaration in that directory. Make it **recurse** into
      subdirectories and include `.tsx`, excluding `*.test.ts`/`*.test.tsx` as
      today. Its failure mode is a silent pass: a mirror one directory down,
      or in a `.tsx` file, is invisible to the check that exists to catch it
      (`cross-stack-determinism`: "A Go-sole-authority capability's mirror map
      runs in anti-mirror mode", "A lower-camel twin of an authoritative Go
      export fails the check", "A declaration form the extractor has no rule
      for fails the check rather than passing" — a code-is-wrong fix to a
      check too weak to enforce a live requirement)
- [ ] 1.3 Add a regression case to the check's own coverage: a TypeScript file
      declaring a lower-camel twin of an existing `backend/space` export must
      make the check exit non-zero. Place that regression twin in a
      **subdirectory** of `frontend/lib/space/` (and add a second in a `.tsx`
      file), so 1.2's recursion is what the case proves — a twin placed at the
      directory's top level passes under both the old glob and the new one and
      therefore proves nothing. Add a third case twinning an **unexported** Go
      function (`cross-stack-determinism`: "A lower-camel twin of an
      authoritative Go export fails the check", "A twin in a subdirectory or a
      .tsx file fails the check", "An unexported Go function counts as an
      authoritative name")
- [ ] 1.4 Create `frontend/lib/space/` with exactly four kinds of pure
      function: a position from a served orbital element set; a position from
      a served park or drift; a served quintic Bézier evaluated at a
      parameter `u`; and screen projection/formatting. No arc-length
      inversion, no speed profile, no flight time, no intercept, no settled
      park (`system-space-view`: "Own-Fleet Position, Burn Curve, and Arrival
      Ghost Render Continuously", "A burning fleet's mark advances by curve
      parameter, not by arc length")
- [ ] 1.5 Name every `lib/space` export subject-prefixed and draw-scoped —
      `drawOrbitPosition`, `bezierPointAt`, `vecAdd`, `projectToScreen` — and
      keep `fixtures/space/mirror-map.json`'s `sharedNames` **empty**. Under
      1.2's case-insensitive comparison the bare names collide with
      `backend/space`'s `Add`, `Sub`, `Dot`, `Cross`, `Length`, `Point`,
      `Scale`, `Position`, `Velocity` and `Speed` — Go TitleCase against TS
      camelCase for the same trivial helpers. **Unexported Go functions count
      too**: the check's Go side is `grep -hE '^func '`, which enumerates
      every top-level declaration regardless of export, so the reserved set
      also includes `resolvePosition`, `resolveVelocity`, `bernsteinPoint`,
      `bernsteinDerivative`, `flightSeconds`, `coveredLength`, `octantOf`,
      `floorMod`, `wrapSubTurn`, `decodeControlPoints`, `avoidStar`,
      `angularRateScale`, `elevateCubicToQuintic`, `perpendicularToChord`,
      `crossAtOrBefore`, `minDistanceAndParamOf`, `rotateInclinationNode` and
      `loadTurnTable`. Several are the obvious TypeScript name for a render
      helper, so an implementer WILL hit one; the answer is always to rename
      the TypeScript. A collision is never a reason to widen the allowlist —
      `sharedNames` stays empty, and it is the door that must stay empty
      (`cross-stack-determinism`: "A lower-camel twin of an authoritative Go
      export fails the check")
- [ ] 1.6 Implement the burning-fleet mark at
      `u = (now − departMs) / (arriveMs − departMs)` clamped to [0, 1], and
      the past-arrival freeze at the served intercept with no client-side
      settle (`system-space-view`: "A burn past its served arrival freezes at
      the intercept until a refetch")
- [ ] 1.7 Port nothing from `frontend/app/spike/space-3d/sim.ts` that computes
      `arcTable`, `arcParam`, `burnProgress`, `burnSpeed`, `resolveShip`, or
      `stationKeepRate`; record in the module header that these six are
      deliberately absent (`system-space-view`: "No displayed value is
      derived from a drawn position")
- [ ] 1.8 Deterministic unit tests for every `lib/space` function against
      known inputs — no `Date.now`, no `Math.random` — and an assertion that
      no exported function takes an unsolved origin/target/acceleration triple

## 2. Frontend — route, data fan-in, and scene rendering

- [ ] 2.1 **Replace** `app/systems/[systemId]/page.tsx` — the route already
      exists and renders `components/board/SystemBoardView`; this is a
      rewrite of a live file, not a new one — with a thin `'use client'`
      shell over `components/space/SystemSpaceView`, the WebGL canvas
      dynamically imported with SSR disabled, and its existing
      `page.test.tsx` rewritten against the new shell (design.md Decision 7)
- [ ] 2.1b **In the same commit as 2.1**, deal with the four e2e suites that
      drive `/systems/:systemId` through board test ids —
      `jump-commit.spec.ts`, `slice.spec.ts`, `refuel-commit.spec.ts`,
      `new-user.spec.ts`: either rewrite them against the new view's test ids
      now, or `test.skip` each **by name** with a comment naming task 10.8 as
      the change that restores it. 2.1 replaces the live route, so these four
      go red the moment it lands — about eighty tasks before section 9 — and
      an e2e leg that is expected to be red for eighty tasks is an e2e leg
      that reports nothing. Do not leave them failing silently (design.md
      Decision 11's amendment)
- [ ] 2.2 Read the interior (`GET /v1/systems/:systemId`) and the requester's
      own fleets via `GET /v1/fleets?mine=true`, filtered to this system on
      the client; issue no `systemId`-scoped fleet list request from this view
      (`system-space-view`: "System Space View Route and Data Fan-In", "The
      own-fleets read is the corporation-scoped one", "An arrived fleet reads
      as arrived on both the canvas and the roster")
- [ ] 2.3 Drive the view's clock from `useWorldTime(serverWorldTime, { scale })`
      with the **served** world-clock scale from the interior read, and fall
      back to the **own-fleets read's** served scale whenever the interior read
      has failed — the state in which the roster and the fleet-anchored
      commands stay mounted with their countdowns still ticking, and the fleet
      read is the only clock on screen. Never the hook's default of 1. `frontend/hooks/use-world-time.ts` defaults `scale`
      to 1 today with a comment anticipating exactly this; `WORLD_TIME_SCALE`
      is a real server flag, and under continuous space a mis-scaled clock
      draws every orbit and burn mark visibly wrong (`system-space-view`:
      "Live world time is projected at the served scale, not an assumed one")
- [ ] 2.4 Loading state, and its persistence through the first rendered frame
      (`system-space-view`: "Loading state before data arrives", "Loading
      persists through first frame after data arrives")
- [ ] 2.5 Independent error paths: an interior-read failure shows a retriable
      error in the canvas region while the roster and the
      `docked-fleet-actions` panel stay mounted with every
      fleet-state-anchored command still invokable — and with the mine offer
      **withdrawn**, attributed to the failed read rather than to an empty
      body, since resource kinds reach this view only on that read (design.md
      Decision 12); an own-fleets-read failure shows a retriable error in the
      fleet panel while the canvas keeps rendering bodies, gates, and contacts
      (`system-space-view`: "A failed interior read shows a retriable error in
      the canvas region", "A failed interior read leaves the
      fleet-state-anchored commands usable", "A failed interior read
      withdraws the mine offer without misreporting the body", "A failed
      own-fleets read shows a retriable error in the fleet panel")
- [ ] 2.6 Render every body and lane gate from its served position and size,
      advancing continuously from its served `orbitElements`
      (`system-space-view`: "An idle fleet renders at its live position,
      advancing with world time")
- [ ] 2.7 Render each own fleet at its drawn position; while burning, render
      its full served curve and an arrival ghost at the target's position at
      `arriveMs` (`system-space-view`: "A burning fleet renders its curve and
      an arrival ghost")
- [ ] 2.8 Omit a fleet reporting no position (`system-space-view`: "A fleet
      with no reported position is omitted from the scene")
- [ ] 2.9 Render the interior read's `contacts` **frozen at their served
      positions** — never integrated forward from the served `velocity` —
      distinguishing emitting and scanning contacts, with no identity; and
      display the served `velocity` as a heading-and-speed readout on the
      selected or hovered contact, which is that field's one consumer
      (`system-space-view`: "Foreign Contacts Render at Their Served
      Position", "A contact does not drift between reads", "A contact's
      served velocity is displayed, not integrated")
- [ ] 2.10 Omit and log any non-star body, fleet, or contact resolving to the
      exact origin, and render the star there normally (`system-space-view`:
      "A Non-Star Position at the Origin Is Omitted From the Scene, Not Drawn
      Atop the Star")
- [ ] 2.11 Render belt members as an undifferentiated decorative field with no
      individual hit target and no per-member facts (`system-space-view`:
      "Belt Members Render as Decorative Detail, Never as Separate Pickable
      Bodies")
- [ ] 2.12 Assert by test that no displayed value — arrival, remaining
      duration, delta-v, fuel cost, distance, affordability, stranding — is
      computed from a drawn position (`system-space-view`: "No displayed value
      is derived from a drawn position")
- [ ] 2.13 Implement realtime refetch: mine-ETA and burn/jump-arrival
      self-scheduled refetches, live-channel subscription with reconnect
      resync, and a constant baseline poll, with animation between refetches
      making no request (`system-space-view`: "Realtime Refetch Rules While
      the Space View Is Open")
- [ ] 2.14 Announce landed resolutions — burn arrival and its attachment, jump
      arrival, mine completion — through a polite live region, and announce
      nothing before a resolution lands (`system-space-view`: "A Landed
      Resolution Is Announced to Assistive Technology")

## 3. Frontend — selection and picking

- [ ] 3.1 Single selection among body/lane-gate/point with toggle-to-deselect,
      replacement across kinds, and pick-radius-miss clearing; no fleet or
      contact is ever a member of the selection set (`system-space-view`:
      "Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a
      Point")
- [ ] 3.2 Picking: body, lane-gate, and point resolution, generous hit
      targets, and documented draw-order precedence for overlapping marks
      (`system-space-view`: "Space View Picking Resolves to the Body, Lane
      Gate, or Point Under the Pointer")
- [ ] 3.2b Draw a **visible selected mark for a picked point in empty space**,
      at the position it was picked at. A point in vacuum has no body mark to
      highlight and no intrinsic outline, so without this an implementer can
      ship an invisible point selection and still satisfy every other
      scenario — the player commits a burn to a target they cannot see. The
      live `board-view` guaranteed this for a bare cell, with its own
      scenario, and it was thinned out of the port (`system-space-view`: "A
      selected point in empty space is visibly marked")
- [ ] 3.3 Off-screen affordance for every body and lane gate whose mark is
      outside the viewport, operable by pointer and by touch, selecting and
      reframing; offered only for off-screen marks (`system-space-view`:
      "Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch")
- [ ] 3.4 Keyboard-operable body and lane-gate selection in the defined tab
      order, with focus surviving animation frames and a visible focus
      indicator (`system-space-view`: "Body, Lane-Gate, and Point Selection Is
      Keyboard-Operable")
- [ ] 3.5 Keyboard-reachable control that selects the point at the camera's
      current pan target, producing a selection indistinguishable from a
      clicked point — and reachable to a **legal** target, which requires
      task 5.5's keyboard pan: at default framing the pan target is the star,
      which every burn solve rejects (`system-space-view`: "A keyboard control selects the
      point at the camera's pan target", "The point-selection control is in
      the tab order and shows focus")

## 4. Frontend — preview, quote lock, and the burn/jump commands

- [ ] 4.1 Add the missing client seam for the preview endpoint before any
      component calls it: a `preview(fleetId, request)` method on
      `frontend/lib/services/fleet-service.ts` (which today has `listMine`,
      `get`, `order`, `cutDrive`, `stop`, `jump`, `mine` and nothing else) and
      a hook over it. `frontend/CLAUDE.md` fixes component → hook → service →
      `apiClient`, and `/check` runs a raw-`fetch` validator, so a component
      calling the route directly fails the gate (design.md Decision 14)
- [ ] 4.2 Request `POST /v1/fleets/:fleetId/orders/preview` on selection
      change whenever a commit would be accepted — **including while the
      acting fleet is burning** — and render its curve and figures as a
      distinct overlay; suppress it while a running mine holds the movement
      channel or the fleet is in lane transit (`system-space-view`: "Selecting
      a target shows a preview curve and its figures", "A burning fleet's
      re-target is previewed", "No preview is requested while a mine holds the
      movement channel")
- [ ] 4.3 Refresh the preview on a **single named client-side interval
      constant, defined in exactly one module** — exactly one request per
      elapsed interval, none between; clear it on selection change, clear, or
      commit; render an unaffordable preview distinctly. The endpoint reads
      the body table, may write an arrival settlement, and runs an N-solve
      stranding scan per acting fleet per player, so the cadence is a real
      server cost and SHALL NOT be scattered across call sites. Its **value**
      is design.md OQ-14, open for Travis; pick a placeholder and name it
      (`system-space-view`: "The preview refreshes on exactly one named
      interval while shown", "The refresh interval is defined in exactly one
      place", "Clearing the selection clears the preview", "An unaffordable
      preview is shown as such")
- [ ] 4.4 Preview failure states: a no-quote state with a retry for a failed
      first request, and a stale marking with a retry for a failed refresh,
      cleared by a later success (`system-space-view`: "A failed first preview
      shows a no-quote state, not empty figures", "A failed first preview
      offers a retry", "A failed refresh marks the shown figures stale", "A
      later successful refresh clears the stale marking")
- [ ] 4.5 Keep the burn committable without a current quote, labelled as
      uncapped, and never derive a cap from a stale figure
      (`system-space-view`: "The burn stays committable without a quote,
      labelled as uncapped", "A stale figure never becomes a cap")
- [ ] 4.6 Send `maxFuelTons` derived from the current preview's fuel cost by
      one named client-side allowance factor, defined in exactly one place,
      and display the resulting ceiling alongside the point cost
      (`system-space-view`: "A commit with a current preview carries a cap",
      "The ceiling the player agrees to is the one displayed")
- [ ] 4.7 On a cap rejection, request a fresh preview and present the new
      figures for re-confirmation without committing and without an automatic
      retry (`system-space-view`: "A cap rejection re-quotes in flow instead
      of failing the interaction")
- [ ] 4.8 Report every burn commit's outcome: success feedback carrying the
      served arrival time, and mapped error copy on failure, including the
      no-distinguishable-reason fallback (`system-space-view`: "Burn Commit
      Reports Its Outcome")
- [ ] 4.9 Surface actual-versus-previewed arrival time and delta-v when they
      differ, including on an uncapped commit (`system-space-view`: "A
      Commit's Actual Result Is Never Silently Swapped for the Previewed One")
- [ ] 4.10 Unify the burn command path across body/lane-gate/point selections —
      one submit path, no kind-specific branch or refusal copy
      (`system-space-view`: "Burn Command Targets Any Selected Body, Lane
      Gate, or Point Uniformly", "No kind-specific selection branch survives
      the unification")
- [ ] 4.11 Jump commit sourcing `laneId` from **one** source only — the acting
      fleet's own read (`fleet-movement`: "Fleet Read Serves the Attached
      Gate's Lane Id") — for a fleet attached to a gate in this system or any
      other, never from the interior read's gate list, `GET /v1/galaxy`'s
      `links[]`, or the charted-lane set; with mapped rejection copy, and a
      test that jump still commits with the interior read failed (design.md
      Decision 12; `system-space-view`: "Jump Commit", "Jump still commits
      when the interior read has failed")
- [ ] 4.12 Departure hand-off scoped to the **acting** fleet only, preserving
      selection and typed input when a non-acting fleet departs, and not
      firing for a fleet already in transit when the view opened
      (`system-space-view`: "Departure Hand-Off to the Galaxy View")
- [ ] 4.13 Fleet roster cross-navigation to another system's space view and to
      the galaxy for a fleet with no position (`system-space-view`: "Fleet
      Roster Cross-Navigation")

## 5. Frontend — camera

- [ ] 5.1 Orbit/pan/zoom camera: primary-drag orbit, secondary-drag pan, wheel
      zoom dollying toward the pan target, click-versus-gesture
      disambiguation at the 8px threshold, and gestures beginning over a mark
      still moving the camera (`system-space-view`: "Space View Camera Orbit,
      Pan, and Zoom")
- [ ] 5.1b Scale the default distance, the zoom clamps, the pan bound, and the
      maximum pick radius off the interior read's served continuous `extent`
      — one configured multiplier each, never an absolute scene constant and
      never the lattice `radius`, which section 9 removes and link 9 deletes
      the producer of. Task 10.11's grep looks for `@/lib/board` **imports**,
      so a camera scaled off a lattice-derived wire field would pass it
      silently (`system-space-view`: "The framing scales with the system's
      served extent")
- [ ] 5.1c Clamp the pan target to the configured bound and pin it with a test
      that drives the pan repeatedly in one direction, by drag and by
      keyboard, and asserts it stops — the live `board-view` camera had this
      scenario and it was thinned out of the port (`system-space-view`: "Pan
      clamps at the configured bound")
- [ ] 5.2 Camera state persists across selection change and realtime refetch;
      resets to default framing with no transition on `systemId` change
      (`system-space-view`: "Camera state survives a selection change and a
      realtime refetch", "Camera resets when the system changes")
- [ ] 5.3 Picking stays correct after camera movement, including a
      point-in-space click and a beyond-pick-radius click that still clears
      the selection (`system-space-view`: "Picking survives camera movement",
      "A point-in-space click resolves correctly after camera movement", "A
      click beyond the pick radius still clears the selection after camera
      movement")
- [ ] 5.4 Touch pinch-zoom keeping the pan target fixed on screen (never
      anchoring on the pinch midpoint), single-finger orbit, and the
      stationary-tap selection path with its threshold pinned at **exactly**
      8 CSS pixels resolving as an orbit — both boundaries were live in
      `board-view` and thinned out of the port (`system-space-view`: "Space
      View Camera Touch Pinch-Zoom", "Pinch zoom keeps the centred point fixed
      on screen", "Movement exactly at the tap threshold resolves as an
      orbit")
- [ ] 5.5 Keyboard-operable camera: arrow-key orbit, **a dedicated pan input
      distinct from the orbit input**, dedicated zoom keys, tab order before
      body and gate hit targets, off-screen-focus reframing, and a
      distinguishable at-limit state on all three axes. Keyboard pan is not
      optional: two requirements cite a "keyboard-operable orbit/pan/zoom
      affordance", and the point-selection control reads the camera's pan
      target — with no keyboard pan that target is the star at default
      framing, the one point every burn solve rejects by the
      endpoint-clearance guard (`system-space-view`: "Space View Camera Is
      Keyboard-Operable", "Pan keys translate the camera's target", "A
      keyboard-only player can pan to a point away from the star", "Keyboard
      input at a clamp is distinguishable from no input")
- [ ] 5.6 Manual recenter, keyboard-reachable, a no-op at default framing
      (`system-space-view`: "Space View Camera Manual Recenter")
- [ ] 5.7 Camera controls unrendered and non-intercepting while the canvas is
      unavailable (`system-space-view`: "Camera Controls Are Inert While the
      Space View Is Unavailable")

## 6. Frontend — renderer availability and accessibility

- [ ] 6.1 Unsupported-context state: named user-actionable cause, retry
      affordance, canvas-region containment of thrown errors, and the
      container remaining present (`system-space-view`: "Renderer
      Unavailability Is an Explicit State")
- [ ] 6.2 Keep the roster and `docked-fleet-actions` panel usable while the
      canvas is unavailable, with the enumeration that actually ships: mine,
      sell, refuel, hold, release, cancel-mine, **cut drive**, **stop in
      place**, and jump — replacing `board-view`'s "today: scan", a control
      the client never had (`system-space-view`: "Surrounding panels remain
      usable", "A burn can be ended while the canvas is unavailable")
- [ ] 6.3 Disable or hide canvas-only controls, and suppress the
      select-a-target prompt, while the canvas is unavailable
      (`system-space-view`: "A canvas-only control is disabled while the
      canvas is unavailable", "Burn target selection is unreachable without
      the canvas") — and confirm jump stays invokable in this state, since its
      lane comes from the acting fleet's own attachment, not from a canvas
      selection
- [ ] 6.4 Error-state precedence: unsupported state independent of the data
      reads, a failed interior read taking precedence in the canvas region
      with the panel still usable, and a failed own-fleets read not
      suppressing the unsupported state (`system-space-view`: "The unsupported
      state is independent of the interior data read", "A failed interior read
      takes precedence over the unsupported state", "A failed own-fleets read
      does not suppress the unsupported state")
- [ ] 6.5 Interrupted-context recovery without navigation: retry that releases
      prior resources, duplicate-attempt prevention, second-loss no-op,
      in-flight selection and typed input survival, first-frame liveness, and
      distinguishable-by-cause diagnostic logging (`system-space-view`: "Lost
      Rendering Context Recovers Without Navigation")
- [ ] 6.6 Live-region announcement of the state change, keyboard-operable
      retry, and focus preservation across the canvas region's transitions
      (`system-space-view`: "Renderer Unavailability States Are Accessible")
- [ ] 6.7 Reduced-motion handling: freeze decorative animation while positions
      and orbital advance stay live (`system-space-view`: "Space View Respects
      Reduced-Motion Preference")

## 7. Frontend — `docked-fleet-actions`

- [ ] 7.1 Mine offer anchored to the acting fleet's docked state, with the
      not-docked and no-visible-resources cases and the free-hold clamp
      (`docked-fleet-actions`: "Mine Offer on the Docked Fleet")
- [ ] 7.2 Mine ETA preview from the served mining rate, tracking the tonnage
      input, and the committed countdown using the server's ETA
      (`docked-fleet-actions`: "Mine ETA Preview From the Served Mining Rate")
- [ ] 7.3 Mine commit, arming the countdown on success and toasting the reason
      on failure (`docked-fleet-actions`: "Mine Commit")
- [ ] 7.4 Cargo hold readout showing contents and capacity, filling visibly
      when a mine run resolves (`docked-fleet-actions`: "Fleet Panel Cargo
      Hold Readout")
- [ ] 7.5 Sell offer: kind and floor filtering, held-tonnage clamp, proceeds
      preview pinned to `fixtures/market/cases.json`, and the split-fill
      preview matching the settlement fold (`docked-fleet-actions`: "Sell
      Offer on the Docked Fleet")
- [ ] 7.6 Sell commit including the price-changed refresh flow and a fresh
      operation key per re-priced attempt (`docked-fleet-actions`: "Sell
      Commit")
- [ ] 7.7 Refuel offer: affordability-capped default tonnage, free-hold clamp,
      and a cost preview from the served fuel price
      (`docked-fleet-actions`: "Refuel Offer on the Docked Fleet")
- [ ] 7.8 Refuel commit, including the all-or-nothing unaffordable rejection
      (`docked-fleet-actions`: "Refuel Commit")
- [ ] 7.9 Add the missing client seams for the station-keeping verbs before
      the control uses them: `hold(fleetId)` and `release(fleetId)` on
      `frontend/lib/services/fleet-service.ts` and hooks over them.
      `add-stationkeep-hold-verb` shipped both verbs server-side with no
      client at all, so this change is the only thing that can give them one
      (design.md Decision 14)
- [ ] 7.10 Station-keeping hold/release control offered by effective park mode,
      committing instantly via `/hold` and `/release`, with the
      **at-or-below-reserve** rejection toasted. Map that reason to copy
      naming the reserve as the boundary, never "no fuel":
      `add-stationkeep-hold-verb` rejects at or below
      `FuelParams.StationKeepReserveTons`, so a fleet holding 0.4 t against a
      1 t reserve hits it (`docked-fleet-actions`: "Station-Keeping Hold and
      Release Controls", "Holding an orbiting fleet submits hold and the panel
      reflects station-keep", "Releasing a station-keeping fleet submits
      release and the panel reflects orbit", "No control is offered while
      burning, drifting, or point-parked", "A hold at or below the reserve is
      rejected and toasted, not silently accepted")
- [ ] 7.11 Upkeep readout taken **only** from the fleet read's served
      upkeep-rate field, with no client-side derivation from a body's radius,
      period, or orbital elements anywhere in the view — rendered on **both**
      park modes the field is served for: as the live drain while
      `stationkeep`, and on the "Hold here" control while `orbit`, as what
      holding would cost. Serving the orbit-park rate and rendering only the
      hold case is the built-and-never-called pattern this chain has already
      recorded five times (`docked-fleet-actions`: "The drain readout shows
      the served upkeep rate while holding", "The Hold control prices the hold
      before it is taken", "The drain readout is never derived from orbital
      elements")
- [ ] 7.12 No client-side prediction of the dry-instant force-demotion; the
      panel changes only when a refetch lands it (`docked-fleet-actions`:
      "Reaching the dry instant is reflected only on the next refetch")
- [ ] 7.13 Credit balance readout with accessible live-region updates on sale
      and refuel resolution, and announced errors (`docked-fleet-actions`:
      "Credit Balance Readout")
- [ ] 7.14 Central rejection-copy mapping, consumed by every command in this
      capability and by `system-space-view`'s burn and jump commands, with a
      safe fallback for an unmapped reason (`docked-fleet-actions`: "Rejection
      Reasons Map to Player-Facing Copy, Not Raw Server Text")
- [ ] 7.15 Running-mine gating of the roster's burn, cut-drive, stop, and jump
      commands, with a cancel-mine control (`docked-fleet-actions`: "Running
      Mine Gates the Fleet Panel's Commands")

## 8. The shared submit guard, and the confirmed sell double-submit defect

- [ ] 8.1 Add one shared synchronous submit guard
      (`frontend/hooks/use-submit-guard.ts`): a ref checked-and-set at the top
      of the handler, released in `onSettled`, taking effect within the same
      invocation rather than a render later (design.md Decision 8)
- [ ] 8.2 Fix `commitSell`'s **confirmed** defect: guard before
      `newOperationKey()` and before `sell.mutate(...)`, so a second
      activation in the same tick mints no key and issues no request. The
      requirement (`docked-fleet-actions`: "Sell Control Guards Against
      Double-Submit") is already correct and already live — this is a
      code-is-wrong fix, and it carries no spec delta restating it
      (`docked-fleet-actions`: "Two activations in one tick submit one sale
      and mint one key")
- [ ] 8.3 Apply the same guard to the mine commit
      (`docked-fleet-actions`: "Mine Control Guards Against Double-Submit")
      and to the burn and jump commits (`system-space-view`: "Burn and Jump
      Commit Controls Guard Against Double-Submit")
- [ ] 8.4 Migrate the refuel commit's hand-rolled `useRef` guard onto the
      shared hook, with its existing scenarios as the regression
      (`docked-fleet-actions`: "Refuel Control Guards Against Double-Submit")
- [ ] 8.5 Playwright scenarios for sell, mine, refuel, and burn that fire two
      activations with **no `await` between them**, asserting exactly one
      request and one operation key leaves the client. A unit test whose
      harness holds the mutation promise open cannot observe this failure —
      `hooks/use-refuel.test.tsx` passes against the broken code — so these
      SHALL be browser-level and SHALL NOT be substituted with unit tests
      (`docked-fleet-actions`: "Two activations in one tick submit one sale
      and mint one key", "Two activations in one tick submit one mine run",
      "Two activations in one tick submit one refuel and mint one key";
      `system-space-view`: "Two activations in one tick submit one burn
      order")

## 9. Backend — remove every lattice field from the interior read

This section runs **here**, immediately before section 10's deletions, and not
first. Every field it drops is read by `frontend/components/board/*`, which
10.1 deletes; run first, it breaks the only playable view, reds its component
suite and all six e2e suites that drive it, and leaves `/check` carrying no
signal for the whole build of the replacement — a real regression introduced in
sections 1–8 would be indistinguishable from the self-inflicted breakage.
Nothing in sections 1–8 needs these fields **absent**; they need
`orbitElements`, the preview endpoint, the upkeep rate and the world-clock
scale **present**, and `serve-orbital-elements-and-burn-preview` delivers all
four additively. This is an ordering change only: there is still no flag, no
dual path, and no coexistence in what ships (design.md Decision 11).

- [ ] 9.1 Drop the lattice `Radius` from `system.interiorDTO` — the continuous
      `extent` the sibling change added is its successor, and leaving both
      would let a consumer keep scaling continuous space off the lattice
      number — and drop `Footprint`, `Orbit` (the lattice object), `ParentId`,
      `Fixed`, `Band`, `Live`, and `AsOf` from `system.fogFeatureDTO`, and
      `Cell` from `system.LaneGate`, leaving a response carrying `systemId`,
      `extent`, `character`, `starClass`, `worldTime`, `scale`, `features`,
      `laneGates` and `contacts`; a feature body's `id`, `type`, `resources`,
      `effects`, `space`, `size` and `orbitElements`; and a lane-gate body's
      `destSystemId`, `laneId`, `space`, `size` and `orbitElements`. (An
      earlier draft also listed `ownerCorpId` as surviving; it is on the
      `system.Feature` domain model, never on `fogFeatureDTO`, so there is
      nothing to preserve.) (`system-interior`: "Lattice-only fields are
      absent from the response")
- [ ] 9.2 Remove `projectUnfogged`'s population of the dropped fields and the
      `bandVisible` constant, and confirm `system.Feature`'s own lattice
      fields stay untouched — they are `delete-the-lattice`'s to remove, not
      this change's (`system-interior`: "Lattice-only fields are absent from
      the response")
- [ ] 9.3 Confirm the surviving response still satisfies every unchanged
      scenario: the `404` paths, continuous position and size on every body
      including gates, the full element set on non-star bodies and gates, the
      star's absent element set, and element-completeness for a body whose
      position could not be resolved (`system-interior`: "Unknown or
      ungenerated system", "No live galaxy", "A materialized system's read
      carries every body's continuous position and size", "A non-star body's
      read carries its full orbital element set", "A lane-gate body's read
      carries its full orbital element set", "The star carries no orbital
      element set", "A body served without a resolvable continuous position
      is still element-complete", "The read carries the interior's continuous
      extent", "The read carries the world clock's scale alongside its world
      time")
- [ ] 9.4 `grep` `backend/` for every remaining production reader of the
      dropped fields and remove or repoint it before deleting the
      serialization; re-record the interior-read fixtures and handler tests
      against the new shape rather than relaxing their assertions

## 10. Removal and de-latticing

- [ ] 10.1 Delete `frontend/components/board/` in full — `SystemBoardView`,
      `BoardStage`, `BoardCanvas`, `BoardOverlay`, `FactsPanel`,
      `BalanceReadout`, `SellSection`, `RefuelSection`, `BoardCameraControls`,
      `BoardTuning`, `board-camera`, `board-frame`, `board-pack`,
      `board-palette`, `board-selection`, `fleet-collection`,
      `glyph-geometry`, `use-board-gestures`, `use-board-projection`, the
      `webgl/` subtree, and every corresponding test — once sections 1–8 cover
      every surviving requirement
- [ ] 10.2 Delete `frontend/hooks/use-board-realtime.ts` and
      `use-board-realtime.test.tsx`, **carrying `ETA_CUSHION_MS` out of the
      file first** rather than dropping it with the rest. Define it as a
      single exported named constant in a new `frontend/lib/realtime.ts` —
      one definition site, imported by 2.13's rebuilt refetch and by any
      later consumer, never redeclared. Not `lib/space/` (1.4 admits only
      pure draw math there, and 1.5's name guard polices that directory) and
      not a hook module: the cushion has a consumer *outside* this change —
      `add-scan-and-sightings-surface` schedules its settle refetch on this
      same cushion and archives after this change — which must not have to
      import through a hook it otherwise does not use, and which today cites
      a constant that this deletion would otherwise erase. **The value stays
      `400`; this is a relocation, not a retuning — do not change it in
      passing.** The rebuilt baseline poll interval belongs in the same
      module for the same reason. Its only importer is
      `components/board/SystemBoardView.tsx` (`lib/query-keys.ts` merely names
      it in a comment, which is fixed in the same edit), so 10.1 orphans it and
      `hooks/` is outside every other deletion task's scope — it survives as
      dead code unless named (design.md Decision 14)
- [ ] 10.3 Delete `frontend/lib/types/system-board.ts` and
      `frontend/hooks/use-system-board.ts`'s lattice shapes, replacing them
      with the space view's own types generated against the sibling change's
      recorded wire sample
- [ ] 10.4 Cut `frontend/lib/types/action.ts`'s `import type { Cell, Target }
      from '@/lib/board'` and the `params.origin`/`params.target` fields typed
      by them — both are already dead against the live wire (a burn's
      `action.Params` carries only `state`, and nothing in the frontend reads
      either)
- [ ] 10.5 Delete `frontend/app/spike/webgl-board/` (`page.tsx`,
      `mock-board.ts`, and their tests) — a tuning bench for the renderer
      being deleted — and `frontend/app/spike/hex-board/mock-system.ts`
- [ ] 10.6 Delete `frontend/app/spike/space-3d/` (`sim.ts`, `SpaceView.tsx`,
      `page.tsx`, and their tests); its production successor now exists
- [ ] 10.7 Delete the two lattice e2e suites,
      `frontend/e2e/tests/board.spec.ts` and
      `frontend/e2e/tests/board-camera.spec.ts`
- [ ] 10.8 Rewrite the four remaining e2e suites that use board test ids —
      `jump-commit.spec.ts`, `slice.spec.ts`, `refuel-commit.spec.ts`,
      `new-user.spec.ts` — plus `renderer-availability.spec.ts`, against the
      space view's own test ids
- [ ] 10.9 Update `galaxy-view`'s "Enter system" navigation target and
      `fleet-roster`'s "here"-status **wording** to the new terminology. The
      route itself is unchanged — `/systems/:systemId` already exists and is
      already the navigation target; only the copy that calls it a "board"
      changes (`galaxy-view`: "Entering a system navigates to its board";
      `fleet-roster`: "A fleet in the currently open board is marked 'here'")
- [ ] 10.10 Repoint `galaxy-view`'s *Jump Commit* rejection-copy citation from
      `board-view` to `docked-fleet-actions` in the shared copy module, so the
      code and the spec name the same source (`galaxy-view`: "A failed jump
      commit toasts the reason", "A jump against a fleet the requester does
      not own toasts generically", "A destination-not-ready rejection toasts
      as retryable, not generically", "A failure with no distinguishable
      reason still toasts safely", "A gate absent from the fetched galaxy
      graph still commits", "The jump command is offered for a gate absent
      from the graph")
- [ ] 10.11 `grep` the whole frontend tree for any surviving import of
      `@/lib/board` or `@/lib/polar` from a non-deleted path; there SHALL be
      none once this section completes — this is `delete-the-lattice`'s
      precondition, and the grep is the evidence

## 11. Validation and the journey

- [ ] 11.1 Component and unit tests for every requirement in sections 1–8,
      following each requirement's own scenarios
- [ ] 11.2 Playwright journey against the real stack: spawn → see the home
      system rendered → burn to a body → dock → mine → sell → refuel → fly to
      a lane gate → jump — entirely through the new view (proposal's Exit
      criterion). The gate step SHALL exercise the off-screen affordance, not
      a hand-set camera position
- [ ] 11.3 `bash .claude/scripts/check-mirror-map.sh` green with the
      case-insensitive comparison in place, and its new regression case red
      when a lower-camel twin is introduced
- [ ] 11.4 `python3 .claude/skills/code-quality-checks/check.py` and
      `bash .claude/scripts/check.sh --backend --frontend --lint --test` green
- [ ] 11.5 `openspec validate build-production-space-view --strict` green, and
      `openspec diff` reviewed against the live text of every capability this
      change touches: `galaxy-view`, `fleet-roster` and
      `cross-stack-determinism` (MODIFIED), and `system-interior` (one
      requirement REMOVED and re-ADDED under a new name)

## 12. Archive rehearsal — before the real archive

`openspec validate --strict` does not cover the retirement mechanic below: it
reports this change valid either way. The archiver is the gate, and it is the
archiver that must be rehearsed.

- [ ] 12.1 Copy `openspec/` to a scratch directory and, **in that copy,
      archive the predecessors first** — `add-stationkeep-hold-verb`, then
      `serve-orbital-elements-and-burn-preview` — so the rehearsal runs
      against the tree this change will actually meet; against an unarchived
      tree it rehearses a shape that never ships. Then run
      `openspec archive build-production-space-view --yes` there. Confirm: the
      archive succeeds even though `board-view` has no delta; every MODIFIED
      requirement in the rebuilt specs carries **every** scenario heading the
      delta wrote and none it did not; and that
      `openspec/specs/system-interior/spec.md` now carries *Interior Read
      Serves Continuous Bodies* and **no** *Interior Read Endpoint*, with
      "Pre-existing wire fields are unchanged" gone from the file — the
      retirement and re-add landed, rather than a MODIFIED block having
      silently shed it
- [ ] 12.1b Re-run the **re-ADD audit** mechanically against the live
      `openspec/specs/board-view/spec.md` before archiving: for every
      requirement this change re-ADDs under `system-space-view` or
      `docked-fleet-actions`, diff the requirement body and the scenario list
      against its `board-view` original, and account for every clause and
      every scenario title that is absent — restored, merged, redistributed,
      or deliberately dropped with a stated reason. This audit has been run
      once (its findings are recorded in the proposal's `board-view`
      retirement bullet), and it must be re-run if any re-ADDed requirement
      is edited, because the archiver's MODIFIED-block scenario check does
      **not** see a re-ADD under a new capability and neither does
      `openspec-reconcile.py`. This structure is exactly what removes that
      protection, so the audit is the only thing standing in for it
- [ ] 12.2 In the same rehearsal copy, delete `openspec/specs/board-view/` and
      `grep` every surviving spec for the literal `board-view`; there SHALL be
      no remaining citation. `--strict` does not catch a dangling
      cross-reference to a retired capability, so this grep is the only guard

## 13. Post-archive manual steps

These act on `openspec/specs/`, which only an archive writes to, and none is
reachable by a delta mechanism (each is prose outside a `### Requirement:`
block, or a directory removal). The `## Purpose` edits run **before** the
`board-view` deletion and its grep, so that grep runs against a tree from
which every stale citation has already been removed.

- [ ] 13.1 Hand-edit `openspec/specs/space-kinematics/spec.md`'s `## Purpose`:
      repoint the `frontend/app/spike/space-3d` carve-out sentence at the
      spike paths that remain (`audio/`, `intel/`, `hex-board/`, `stealth/`) —
      **not** simply delete it, because *Every Rule-Bearing Value of This
      Capability Is Computed Only in the Authoritative Implementation*
      requires the exemption to be "stated in the capability's Purpose
      alongside the named path", and deleting the only such statement leaves
      that clause unsatisfied. Also remove the sentence citing `board-view`'s
      *Move Preview From the Acting Fleet's Live Position*, which the served
      burn preview supersedes
- [ ] 13.2 Hand-edit the three other stale `## Purpose` sections:
      `system-interior` ("a single star system's tactical polar board" and its
      fog-of-war sentence), `fleet-movement` (its `board-tactical-math`
      effective-state-fold sentence and its reference to the deleted
      `observation-fog-and-scan`), and `fleet-roster` ("the system board
      view")
- [ ] 13.3 Write a real `## Purpose` for **both** new capabilities. The
      archiver creates a new capability spec carrying literally `TBD - created
      by archiving change build-production-space-view. Update Purpose after
      archive.`, and link 4 shipped with exactly this left undone. Both
      `openspec/specs/system-space-view/spec.md` and
      `openspec/specs/docked-fleet-actions/spec.md` need one, and
      `docked-fleet-actions`'s SHALL state what its name under-describes: the
      hold/release controls act on an **orbiting** fleet, the credit readout
      is **corporation**-scoped, and its rejection-copy mapping is a
      **shared** module three capabilities consume (design.md Decision 13)
- [ ] 13.4 Leave `space-kinematics`'s exemption clause inside *Every
      Rule-Bearing Value of This Capability Is Computed Only in the
      Authoritative Implementation* **unedited**, and confirm by reading it
      that no edit is due: it is written generically over
      `frontend/app/spike/`, names no specific spike, and stays true while
      `audio/`, `intel/`, `hex-board/` and `stealth/` remain there. An earlier
      draft proposed hand-editing it on the premise that it "names the
      now-deleted spike path"; it does not. Only the `## Purpose` sentence
      names `space-3d`, and 13.1 covers that
- [ ] 13.5 After `openspec archive build-production-space-view --yes`
      succeeds and 13.1–13.4 are done, delete `openspec/specs/board-view/` by
      hand (design.md Decision 9; `polar-lattice-math` and
      `observation-fog-and-scan` are the confirmed-absent precedents), then
      re-run the section 12.2 grep against the real tree
