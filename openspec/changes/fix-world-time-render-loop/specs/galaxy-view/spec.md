## ADDED Requirements

### Requirement: Animation Never Re-Renders the Galaxy View, and Never Starves a Navigation
The galaxy view SHALL NOT, by itself, cause any component of its tree to
render because an animation frame has passed: the live world time it projects
SHALL NOT be held in component state, in a React external store, or in any
other value a component subscribes to per frame, and no effect SHALL write
component state in response to a per-frame value. A frame-rate subscription
in a leaf is the same default-priority update at a smaller scope, and is
equally prohibited. This view's clock drives no picture at all — its only
consumer is the fleet roster's countdowns and command gating (`fleet-roster`)
— so a per-frame render here buys nothing and costs a navigation.

Every figure this view presents that counts in time, and every roster command
whose availability turns on a served instant passing, SHALL update within one
wall-clock second of that instant, and SHALL NOT require a per-frame render to
do so.

An in-app navigation issued from this view while it is mounted — the drill-in
to a system's space view (*Drill-In Navigation to the System Board*), and the
roster's burn redirect, which sends a fleet's burn command to that fleet's
system view (`fleet-roster`'s *The Roster Row Is the Fleet Command Surface
Where the Mounting View Provides None, Jump Gated by Attachment Alone*) —
SHALL commit, and SHALL arrive within 20 seconds of the action that requested
it — a ceiling taken from the journey budget this defect was measured against
(`defect-cross-system-chevron-nav-stall.md`), not a target, and not to be
relaxed. A route transition renders at a lower priority than an ordinary
state update; `system-space-view`'s own cross-system navigation — sharing
this mechanism by construction — measured 4 of 6 solo repeats failing to
arrive within 20 seconds with the per-frame update in place, and 0 of 6 with
it silenced (`defect-cross-system-chevron-nav-stall.md`); this view's own
navigations have not been separately measured (this change's proposal,
"Unmeasured, stated"). This view SHALL NOT be the reason a requested
navigation fails to arrive. A roster row's *selection* on this view SHALL
continue to select and reframe without navigating.

The world time this view projects SHALL be extrapolated at the served
world-clock scale — the same scale it hands the roster for formatting — never
at an assumed scale of 1. A clock advancing at one rate while its countdowns
are formatted at another disagrees with itself the moment a world runs at any
scale but 1. WHILE no world-clock scale has been served — the own-fleets
read has not yet landed, so the only served world time is the galaxy read's,
which carries no scale — the view SHALL hold the last served world instant
rather than projecting it forward at an assumed rate, the same protection
`system-console`'s clock cell takes.

#### Scenario: Frames pass without the galaxy view rendering
- **GIVEN** the galaxy view is mounted with its reads settled and no input,
  refetch, or coarse tick occurring
- **WHEN** several animation frames elapse
- **THEN** the view's component tree has not rendered in that interval

#### Scenario: A roster countdown advances without a per-frame render
- **GIVEN** an own fleet is burning with a served arrival in the future
- **WHEN** two wall-clock seconds elapse with no read landing
- **THEN** that fleet's roster row countdown's raw span (`data-raw`) has
  decreased by the elapsed world-millisecond span
- **AND** the view rendered no more than three times in that interval

#### Scenario: A drill-in issued while the view animates arrives
- **WHEN** "Enter system" is invoked for a selected system while the view is
  mounted and animating
- **THEN** the browser arrives at that system's space-view route within 20
  seconds of the invocation

#### Scenario: A roster burn redirect from the galaxy view commits while the graph animates
- **GIVEN** the galaxy graph is mounted and animating
- **WHEN** a fleet's burn command is invoked from the roster on this view
- **THEN** the browser arrives at that fleet's system route within 20 seconds
  of the command

#### Scenario: The projected clock runs at the served scale
- **GIVEN** a world whose simulation clock runs at a scale other than 1
- **WHEN** the view projects world time for the roster between reads
- **THEN** it projects at the scale the read served — the same scale it passes
  to the roster for formatting

#### Scenario: The projected clock holds when no scale has been served
- **GIVEN** the view has a served world time but no served scale
- **WHEN** wall-clock time passes with no read landing
- **THEN** the projected world time holds at the last served instant
