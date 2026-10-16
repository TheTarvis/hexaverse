# Combat

Purpose: engagements between ships/fleets, including weapons, defensive systems
and escape. Canonical concept record, 2026-10-16. Source: Travis's weekend design
conversation. Implementation is deferred and separately scoped.

## Settled intent

The initial weapon families are lasers constrained by range and available power,
longer-range missiles, and defensive point-defense cannons (PDCs). More detailed
hull differentiation can follow later. Piracy and escorted hauling are intended
contexts; [ships/fleets](ships-and-fleets.md) owns their composition/role direction.
These concepts establish neither a damage system nor automatic engagement rules.

## Current implementation and gaps

The current backend audit found no implemented weapon/engagement system or gameplay
fleet-destruction path. [Fleet composition](../../backend/fleet/model.go) currently
has one seed class, not weapon slots or differentiated combat hulls. Current
[sensing](sensors-and-stealth.md) supplies anonymous disclosure, not an accepted
combat targeting contract. Ownership/home naming protection is not combat immunity.

## Open questions

Choose engagement control first: manual fire, standing rules or automatic exchange?
What observation/identification is required to target, and what happens when contact
is lost? Only then settle resolution cadence, aiming/hit rules, damage, available
power, missile flight/guidance, PDC targeting, ammunition, retreat and destruction
consequences. A missile already in flight when its target goes dark is a useful
case; continuous movement physics does not answer its behavior.

## Related sources

[Sensors/stealth](sensors-and-stealth.md), [ships/fleets](ships-and-fleets.md),
[travel](travel.md), [economy](economy.md), [actions/time](actions-and-time.md).
[Historical sensors brainstorm](../plans/sensors-and-stealth.md) is context,
not approval to implement its exotic sensing/combat proposals.
