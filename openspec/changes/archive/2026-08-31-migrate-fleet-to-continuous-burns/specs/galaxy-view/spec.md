## REMOVED Requirements

### Requirement: Select-Preview-Commit Travel Gesture

**Reason**: Superseded by nothing. This requirement previews and commits a
server-computed shortest charted-lane route (per-leg and total ETA) to an
arbitrary selected system; the server route-preview endpoint and every
multi-hop routing primitive it depends on are deleted outright
(`Service.PreviewRoute`, `planRoute`, `reconstruct`, `RoutePreview`,
`GET /v1/fleets/:fleetId/route` — design.md Decision 10). Lane travel is now
a single-hop `jump` from a fleet already attached to a gate; a client-side
multi-hop planner over the corp's charted lanes is deferred to link 8
(design.md Decision 10, Non-Goals) and is not specified by this change.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Transit Fleet Selection and Card

**Reason**: Superseded by nothing. This requirement's card shows a multi-leg
route with per-leg ETAs for a fleet "currently in lane transit or
lane-held"; `laneHold` has no successor at all, and a lane crossing is now a
single, atomic hop with one ETA, not a route composed of legs (design.md
Decision 4, Decision 10). No successor card is specified by this change;
a jump-transit card is left to link 8's client-side routing work.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Bridge Lane Rendering

**Reason**: Superseded by "Bridge Lane Rendering Is Visually Distinct" — this
requirement's second scenario exercises "the user previews and commits a
route" over a bridge lane, but the galaxy view offers no route preview or
travel-commit gesture at all after this change: multi-hop routing is
deleted outright and a lane crossing is a single-hop `jump` commanded from
the roster panel, attached to a gate, never from a galaxy-view lane
interaction (design.md Decision 10, Decision 12's roster-panel-as-command-
surface precedent). There is no surviving interaction for the scenario to
describe, only the render-distinctness half.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Bridge Lane Rendering Is Visually Distinct

The galaxy view SHALL render lanes carrying the `bridge` marker visually
distinct from ordinary lanes (a fainter/differentiated style), so
void-crossing routes read differently from local roads. The galaxy view
offers no route preview or travel-commit interaction on any lane, bridge or
ordinary — a lane crossing is commanded as a single-hop `jump` from the
roster panel, not by interacting with a lane in this view (design.md
Decision 10, Decision 12).

#### Scenario: A bridge lane renders distinctly

- **WHEN** the galaxy view renders a charted lane whose `bridge` flag is set
- **THEN** its visual style differs from ordinary charted lanes

## MODIFIED Requirements

### Requirement: Own-Fleet Presence and Recenter Target

The system SHALL mark systems hosting at least one of the requester's own
fleets that are not currently mid-jump (crossing a lane) as presence
markers on the graph, and SHALL drive the recenter control to snap to the
requester's active fleet's system when one exists, falling back to a
whole-galaxy framing otherwise. A jump is atomic and single-hop — there is
no held-mid-lane state for a fleet to occupy (design.md Decision 4,
Decision 10).

#### Scenario: A traveling fleet is not marked at the system it left

- **WHEN** an own fleet's `jump` field is set (a lane crossing is underway)
- **THEN** its origin system is not marked with a presence indicator for
  that fleet
