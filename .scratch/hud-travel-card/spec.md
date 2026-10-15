# System HUD: compact Travel here interaction

Status: ready-for-agent

## Problem Statement

The system HUD currently consumes too much space when destination details,
fleet information and travel review are open together. Players need to choose
a destination, understand the trip and issue an order quickly on both desktop
and portrait phones. On a phone, the cards must provide enough information to
make that decision without relying on the map.

The preferred existing reference is HUD variant D, but its arrangement is not
an accepted final design. The broader HUD discussion grew too large to judge
effectively. The next step is a focused, interactive travel slice that can be
reviewed visually before expanding other activities or integrating a new HUD
into production gameplay.

## Solution

Build a compact Travel here interaction in the existing development HUD
studio, using simulated fleets, destinations and travel outcomes. Reuse the
existing inspection and command-fleet concepts, while giving the card one
responsibility at each step:

1. Inspect a destination and choose Travel here.
2. Replace destination details with a travel review in the same card.
3. Review fleet, destination, arrival duration, fuel cost and fuel remaining.
4. Optionally change fleets through a compact picker without losing the
   destination. Recalculate the trip before allowing commitment.
5. Start travel explicitly. On success, replace review with the command
   fleet's normal status card, which owns destination, progress and ETA.

Blocked trips remain reviewable, with an inline reason and a disabled Start
travel action. Back restores destination details and the retained browsing
context. The whole interaction must work on desktop and portrait phones
without requiring multiple full cards or map-based figures to stay visible.

## User Stories

1. As a player, I want a focused Travel here action on a destination, so that I can plan a trip without navigating unrelated activities.
2. As a player, I want to inspect a destination without changing my command fleet, so that browsing cannot silently redirect my commands.
3. As a player, I want the travel flow to use my chosen command fleet, so that I know which fleet will receive the order.
4. As a player, I want opening travel review to leave my fleet stationary, so that looking at a trip does not commit it.
5. As a player, I want travel review to replace destination details in the same card, so that planning does not stack more panels over the system.
6. As a phone player, I want every trip-decision fact in the card, so that I can decide without reading the map.
7. As a desktop player, I want the same travel steps and information, so that device size does not change the command's meaning.
8. As a player, I want the review to identify fleet and destination together, so that I can verify both ends of the order.
9. As a player, I want to see the estimated arrival duration, so that I can judge how long the trip will take.
10. As a player, I want to see the outbound fuel cost with units, so that I can judge its expense.
11. As a player, I want to see fuel remaining after an affordable trip, so that I can judge my fleet's resulting reserve.
12. As a player, I want a distinct Start travel action, so that the order begins only after my explicit decision.
13. As a player, I want Back to return to the inspected destination, so that I can reconsider without restarting browsing.
14. As a player, I want my search and filters retained after leaving review, so that I can continue considering the same candidates.
15. As a player, I want my list position or inspected-result position retained, so that Back does not lose my place.
16. As a player, I want to open a compact fleet picker from the fleet name in review, so that I can consider a different fleet without leaving the trip.
17. As a player, I want changing fleets to preserve the destination, so that I do not have to find it again.
18. As a player, I want changing fleets to recalculate the trip, so that I see the estimate and fuel balance for the fleet I will actually command.
19. As a player, I want commitment unavailable until the replacement fleet's estimate is ready, so that I cannot act on the previous fleet's figures.
20. As a player, I want choosing another fleet to leave travel uncommitted, so that fleet selection remains separate from issuing an order.
21. As a player, I want an unaffordable trip to remain visible in review, so that I can understand why it is blocked.
22. As a player, I want insufficient-fuel review to show fuel needed, fuel aboard and the shortfall, so that I know the size of the problem.
23. As a player, I want Start travel disabled when the trip is blocked, so that an unavailable action cannot appear ready to execute.
24. As a player, I want fleet-unavailability reasons beside the disabled action, so that I do not have to infer the problem from another panel.
25. As a player, I want Back available on blocked trips, so that I can choose another destination.
26. As a player, I want to select a different fleet for a blocked trip, so that I can see whether another owned fleet can make it.
27. As a player, I want successful commitment to open the travelling fleet's normal status card, so that I receive clear confirmation of what started.
28. As a player, I want destination, completion percentage and arrival countdown on that fleet card, so that ongoing status belongs to the fleet.
29. As a player, I want the compact command-fleet control to reopen that same fleet card, so that there is one consistent place to check progress.
30. As a player, I want a Stop travel control on the travelling fleet card, so that I can access the fleet's existing stop behavior there.
31. As a player, I want to resume destination browsing after starting travel, so that monitoring one trip does not block my next decision.
32. As a player, I want to dismiss the fleet card while travel continues, so that I can recover screen space without cancelling the order.
33. As a phone player, I want readable trip details and usable touch controls without horizontal page scrolling, so that the interaction works comfortably in portrait orientation.
34. As a design reviewer, I want reproducible affordable, blocked and fleet-switching examples, so that I can assess the travel flow before committing to a broader HUD redesign.

## Implementation Decisions

- Deliver a reviewable development-only interaction prototype in the existing
  HUD studio. Commands and progression remain simulated. Do not replace the
  production system HUD or introduce backend changes in this slice.
- Extend the existing HUD prototype, its destination inspector, command-fleet
  selection and fleet-status presentation. The exact component extraction and
  prototype variant are implementation choices. Variant D is a visual
  reference, not a placement constraint or a requirement to preserve its
  current travel behavior.
- Use the domain distinction between command fleet and inspected object.
  Inspection alone does not take command of another fleet. Apply this rule to
  the travel slice rather than undertaking an unrelated rewrite of every
  prototype variant.
- Model the visible flow as destination inspection, travel review and fleet
  status, with a compact fleet picker reachable from review. Blocked travel
  is a review state. Replace the card's body between states; do not append
  review below the full destination details or add a permanent transfer card.
- Show fleet → destination, estimated arrival duration, outbound fuel cost,
  fuel remaining and Start travel in an affordable review. Use readable
  durations and explicit fuel units. Do not imply that an outbound estimate
  guarantees a return trip or add return-route planning.
- Back from review returns to destination inspection. Retain the search,
  filters, list scroll and inspected-result position applicable to the
  existing browser. Opening or leaving review does not commit an order.
- The fleet name in review opens a compact picker of owned fleets. Choosing
  another fleet changes the command fleet, preserves the destination and
  recomputes the estimate and eligibility. Dismissing the picker without a
  selection leaves the trip unchanged.
- Associate every estimate with the actual fleet/destination pair. Existing
  prototype destination-only costs must not make fleet switching appear to
  recalculate while retaining another fleet's figures. Use deterministic
  pair-specific fixture estimates; do not introduce a client physics model.
- Clear or visibly invalidate the previous estimate while a replacement is
  being calculated. Enable Start travel only when the displayed fleet,
  destination and valid estimate agree and the trip is permitted. Do not
  commit automatically after recalculation.
- Insufficient-fuel review shows fuel needed, fuel aboard and the positive
  shortfall, rather than a negative fuel-remaining figure. Other existing
  eligibility failures, including fleet unavailability, use an inline reason
  beside disabled Start travel. Back and fleet selection remain available.
- Start travel is the only commitment step. Use the existing command
  submission conventions to prevent repeated activation from starting
  duplicate simulated trips. A failed simulated commitment stays in review
  with actionable feedback rather than falsely showing a travelling fleet.
- After successful commitment, inspect the command fleet and show its normal
  status card: travelling activity, destination, completion percentage,
  arrival countdown and Stop travel. Remove the finished review. This is the
  same status presentation reached through the compact command-fleet control.
- Ongoing ETA and progress belong to the fleet, not to a lingering planning
  card. The compact command-fleet control continues to identify the fleet and
  summarize its activity; full fleet details need not remain open while
  browsing other objects.
- Reuse existing simulated stop, arrival and reset behavior as needed to make
  the study usable. This spec does not redefine movement cancellation,
  arrival physics or notification policy.
- Adapt the same interaction to desktop and actual portrait phone viewports.
  All decision data and actions remain usable without the map. Use one
  focused card at a time and avoid simultaneous full destination, fleet and
  review panels. Exact dimensions, materials and animation are visual
  implementation choices for review, not settled production design.
- The explicitly agreed in-card travel review governs this prototype,
  including on phones. It takes precedence over the generic frontend
  preference for putting multi-step forms in modals; no additional modal
  approval step is required.
- Preserve development-only availability, fictional data and reset behavior.
  This slice introduces no persistence schema, production API contract or
  new movement/sensor-channel rules.

## HUD Card Shell Visual Study

The reusable card foundation is being designed separately from travel content.
Travis selected option C in [shell comparison 02](card-shell-options-02.png):

- An opaque, smooth, dark navy surface that keeps the map from competing with
  card content.
- An angular silhouette with clipped corners and a medium structural frame.
- Subtle cyan illuminated corner accents.

This selects the visual direction; exact CSS values and responsive geometry
remain to be reviewed in the interface. The generated image is a visual
reference, not a runtime card asset.

For headers, Travis selected options C and D in
[header comparison 03](card-header-options-03.png):

- Titled cards use a label embedded in a tab in the top structural frame.
- The title tab is centered by default.
- Compact action strips can omit the header and retain the same shell style.
- The shell supports an optional upper-right close control: present for
  dismissible cards and omitted for persistent controls.

Travis refined the title placement to straddle the top border, centered both
horizontally and vertically on that border, recovering the unused header space.
See [border-title revision 05](card-border-title-05.png). He then approved
moving the shell into code for Storybook review. He then selected a small
transparent close control near the outer top-right corner: a 14px cyan X
matching the corner lights' color and glow, in a 28px button offset -10px from
the top and right. Its keyboard focus outline and touch target remain.

The initial reusable implementation is
[`HudCardShell`](../../frontend/components/hud/HudCardShell.tsx), with stories
under `HUD / Card Shell`. Run `npm run storybook` from `frontend/`; it uses this
checkout's `PORT_STORYBOOK`. Stories cover tall, wide, narrow, headerless,
long-title and scrolling examples, plus a size comparison with optional content
boundary guides. Callers supply dimensions, content and dismissal behavior.
The initial code keeps frame details fixed while resizing and uses equal 24px
content padding. Those dimensions and the provisional long-title truncation
remain subject to visual review. The base shell uses CSS and decorative SVG.
The scroll viewport meets the frame's inner edge and shares the surface's angled
clipping outline. Side padding is 16px to use more of the interior width;
corner lights sit above the clipped content. The initial top and final bottom
padding scroll with the content, leaving no permanent empty strip while scrolling.
The approved coded appearance is captured in
[the final content-width preview](card-shell-wider-content.png). Earlier
intermediate screenshots have been removed.

Travis selected Signal pulse as the reusable foundation: two traveling pulses
180 degrees apart, with the reduced brightness approved in the lighting study.
`HudCardShell` includes this treatment by default, loading the decorative GPU
layer lazily. `lighting="none"` opts into a plain shell, and `paused` freezes the
decoration. Defaults retain the reviewed intensity (1.2), speed (0.7) and signal
strength (2.1). Callers need no lighting wrapper or travel-specific content.

[`HudFrameLighting`](../../frontend/components/hud/HudFrameLighting.tsx) owns
the decorative layer through the existing renderer owner, with WebGPU and
WebGL 2 compatibility. CSS provides the frame during startup and if rendering
is unavailable. Reduced motion freezes shader motion; paused, hidden and
offscreen cards have no continuous animation loop. Active decoration is capped
at 30fps. Title and close-control masks follow changes to the card's chrome.

Storybook presents the shared shell under `HUD / Card Shell`, with Signal pulse
as the default and controls for plain lighting and pause. The exploratory
lighting stories, comparison harness and unused alloy/corner shader variants
have been removed. Selecting this foundation does not replace the production
system HUD or give decorative pulses gameplay-state meaning.

The lighting study was checked in Chromium on the WebGPU backend and in WebGL 2
compatibility. Manual browser checks confirmed material switching, animated
pulse, frozen pixels while paused or under reduced motion, no horizontal
overflow at 375px, and an axe WCAG A/AA scan without violations. The plain shell
initializes no GPU renderer. Component checks cover usable content/dismissal
before rendering, unavailable backends, reduced-motion resume, hidden-tab
suspension and teardown. Storybook build and frontend lint/typecheck passed with
one pre-existing unrelated unused-variable warning.

Screen attachment and final phone presentation remain undecided. The illustrated action buttons are
examples, not an accepted button design or required action inventory. The
foundation should support reuse by other HUD cards without inheriting travel
content.

## Testing Decisions

- The user confirmed the existing browser interaction seam as the primary
  verification boundary, exercised at desktop and portrait-phone sizes.
  Reuse Playwright and the project's browser-test conventions rather than
  introducing a new test framework or parallel component-level suite for
  the same flow.
- Exercise the HUD studio's visible destination inspector, travel review,
  fleet picker and fleet status as one interaction. Assert accessible
  controls, displayed facts and user-visible outcomes, not internal React
  state, component structure, private helper calls or diagnostic state dumps.
- Prior art includes the current object-selection/burn-preview journey,
  committed-selection journey, console-dock interactions and same-tick
  double-submit browser coverage. Some existing movement journeys now assert
  that retired Burn controls are absent; reuse their testing patterns without
  treating them as proof of a working production travel UI.
- Cover inspection without command-fleet changes; Travel here replacing the
  destination body; required review figures; and explicit commitment rather
  than starting travel on inspection or review entry.
- Cover Back restoring destination details and retained search, filters and
  position. If the source browser scrolls, verify that returning to it retains
  that position rather than merely preserving the search text.
- Cover fleet-picker selection preserving the destination and changing the
  displayed fleet and estimates. Include distinct pair-specific estimates,
  an unavailable fleet, and switching from insufficient fuel to an affordable
  fleet. Verify stale figures cannot be committed during recalculation.
- Cover insufficient-fuel figures, inline shortfall and disabled commitment;
  other represented blockers; and continued availability of Back and fleet
  selection. Avoid a snapshot of every possible backend refusal, since this
  is a simulated UI slice.
- Cover successful Start travel showing the same fleet-status presentation
  as the compact fleet control, with destination, percentage, countdown and
  Stop travel. Verify closing the card or resuming browsing leaves travel
  active. Exercise the existing simulated stop transition without testing
  new physics semantics.
- Verify repeated activation cannot start a second trip or deduct fuel twice,
  and a represented commitment failure retains review without a false
  travelling state. Reuse deterministic fixtures and controlled time;
  do not wait for real multi-minute journeys.
- Run the flow without map interactions at both viewport sizes. Check that
  key facts/actions remain visible or reachable, touch controls work, and the
  page does not overflow horizontally. Manual visual review should assess
  density and wasted space; browser assertions do not establish aesthetic
  acceptance or lock exact pixel dimensions.
- Keep fixtures within the existing development prototype. Browser coverage
  of simulated orders proves the interaction, not live API commitment,
  server authorization, movement resolution or persistence. Existing backend
  and production movement coverage remains separate.
- During implementation, run affected browser coverage and applicable
  frontend checks. Publication of this spec does not claim those feature
  tests have been implemented or run.

## Out of Scope

- Production HUD replacement, live travel-service integration, backend or
  schema changes, movement physics and fuel-model changes.
- The broader HUD action map and implementation of mining, docking,
  refuelling, selling, scanning, gate travel or combat controls.
- Travel-and-mine, travel-and-dock and other queued follow-up orders. Those
  outcomes were discussed but the chosen first slice is Travel here alone.
- Stealth-breaking rules, scan exposure/range, contact identification,
  combat initiation and tactical hiding mechanics.
- A new object-discovery/search/filter system, comprehensive destination
  comparisons, or implementing the proposed swipe-card browser. Preserve
  existing browsing context; use available selection to enter this slice.
- Designing arbitrary-point destination entry, cross-system route planning,
  return trips or multi-fleet commands.
- Reworking every HUD variant, finalizing the global desktop/phone layout,
  replacing the renderer or introducing a new visual asset system.
- New stop-confirmation policy, braking semantics, arrival actions or alert
  design. Expose existing simulated behavior only where needed for review.

## Further Notes

This spec intentionally narrows the conversation after Travis asked to stop
expanding the action inventory and break down one action. The separately
recorded scanning, filtering, card-swiping and station-action ideas remain
context, not additional acceptance criteria here.

The source of the agreed decisions is the task-first interview and travel
section of [the HUD plan](../../docs/plans/system-hud.md). The development
reference is `/dev/system-storyboard/hud?variant=D`, currently served locally
on port 20200. That route is for review, not production gameplay.

The current prototype stacks destination details with course review, stores
some estimates on destinations alone, and has inspection/command coupling
that differs from the glossary. Those behaviors are references to improve,
not requirements to preserve. The existing separate Transfer experiment is
also not the accepted interaction: ongoing trip status belongs to the fleet.

Travis explicitly confirmed replacing details with review, switching to fleet
status after commitment, explaining blocked trips beside disabled commitment,
and changing fleets within review while retaining the destination. Visual
acceptance of the resulting desktop and phone layouts remains a review of the
implemented prototype, rather than approval of the existing variant D layout.
