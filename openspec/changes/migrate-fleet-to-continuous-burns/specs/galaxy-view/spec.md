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
