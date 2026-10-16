# Travel

Purpose: whole-fleet movement within systems and through lanes, including idle
parking and host attachment. Canonical domain record, 2026-10-16.

## Settled intent

Travel moves the command fleet; inspecting an object alone does not change who
receives commands. Continuous space and simplified gravity retain orbits without
requiring realistic orbital piloting. Travis confirmed quiet parking at arbitrary
positions, including far out, on 2026-10-16. This records a goal; current point
travel already implements part of it. [HUD](../hud.md) owns review/commit interaction;
[sensors](sensors-and-stealth.md) owns the visibility consequences of movement.

## Current implementation and gaps

- [OrderRequest](../../backend/fleet/model.go) names a body or a point.
  [PreviewOrder/OrderTo](../../backend/fleet/service.go) use the server solve;
  quote caps and fuel affordability are checked at commitment. Frontend estimates
  must use served quotes, not duplicate physics or prototype fixture arithmetic.
- Go [space state](../../backend/space/state.go) owns effective position at world
  time. A completed body-target burn folds to an orbit park; a point-target burn
  folds to a fixed `ParkPoint`. Fleet attachment is a separate relationship,
  cleared on departure and settled by fleet resolution.
- [Parking](../../backend/space/park.go) supports free orbit, fuel-consuming
  station-keeping and free fixed-point parking. Station-keeping has a stored
  dry instant and releases into an orbit when fuel reaches its reserve.
  Unpowered drift is a separate kinematic mode, not fixed-point parking.
- [CutDrive and Stop](../../backend/fleet/service.go) are distinct operations.
  CutDrive produces unpowered drift; Stop parks instantly at sufficiently low
  speed or commits a braking burn to a nearby point. Closing a status card does
  neither. Existing fuel/refund rules remain authoritative in code/tests. Burn
  acceptance may warn about stranding without requiring a blanket return reserve;
  this warning is not a promised rescue capability.
- [Jump](../../backend/fleet/service.go) requires attachment to the lane's own
  gate, materializes the destination lane horizon before commit and carries
  fleet-owned transit state. There is no local-system position while in transit.
  Attachment makes the fleet immediately eligible, with no dwell. Its current
  eligibility is gate attachment, not a charted-lane prerequisite;
  older architecture/spec claims to the contrary are historical.
- [Point picking](../../frontend/components/space/space-selection.ts) supports
  bounded pick-plane destinations and conversion to the wire vector. Production
  [HUD integration](../hud.md) is under review; far-out/non-planar input still
  needs design rather than an assumed unrestricted coordinate editor.

## Open questions

How should players select far-out and non-planar holding positions? Are additional
parking policies desired beyond current physics? Future escort/formation and
combat evasion behavior need separate scope. Arrival exposure rules belong to
sensors; they do not follow automatically from the jump implementation.

## Related sources

[Ships/fleets](ships-and-fleets.md), [actions/time](actions-and-time.md),
[economy](economy.md), [stations](stations.md), [sensors](sensors-and-stealth.md).
Historical lineage: [board movement](../specs/0004-movement-board.md),
[lane movement](../specs/0008-movement-galaxy.md),
[continuous-space decisions](../plans/continous_space/decisions.md).
Those records retain provenance, not authority for retired hex/ring mechanics.
