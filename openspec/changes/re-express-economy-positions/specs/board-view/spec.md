## MODIFIED Requirements

### Requirement: Mine Offer on the Docked Fleet
The system SHALL offer the mine verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a feature
carrying at least one visible resource AND the fleet's movement channel is
free (no running mine, not burning) — anchored to the fleet's docked
state, requiring no board selection: a fleet can only mine what it is
docked to, so selecting the body underneath it (which its own glyph
occludes) is never a precondition. The offer SHALL present a resource-kind
picker limited to the docked feature's visible resource kinds, defaulting
to the richest, and a tonnage input defaulting to the fleet's free hold
and constrained to a positive value no greater than the free hold.

#### Scenario: Mine is offered while docked at a resource-bearing body
- **WHEN** the acting fleet's effective state is `docked` to a feature
  carrying visible resources
- **THEN** the fleet panel offers the mine verb with a kind picker and a
  tonnage input defaulted to the fleet's free hold, with no board
  selection required

#### Scenario: Mine is not offered when merely co-located, not docked
- **WHEN** the acting fleet is parked at or near a resource feature's
  position but its effective state is not `docked` to it
- **THEN** the mine verb is not offered

#### Scenario: Mine is not offered when the docked body has no visible resources
- **WHEN** the acting fleet is docked to a feature that carries no visible
  resources
- **THEN** the mine verb is not offered

#### Scenario: Tonnage input clamps to free hold
- **WHEN** a tonnage greater than the fleet's free hold is entered
- **THEN** the input clamps the value to the free hold

### Requirement: Sell Offer on the Docked Fleet
The system SHALL offer the sell verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a station and
the fleet's cargo pool holds at least one kind of tonnage — anchored to the
fleet's docked state, requiring no board selection, mirroring `### Requirement:
Mine Offer on the Docked Fleet`'s anchoring rationale (a fleet can only
sell what it is docked to and currently holds). The offer SHALL present a
resource-kind picker limited to kinds the fleet currently holds AND that
the station is configured to buy (excluding a kind with no configured floor
for the station's region, so the picker never offers a guaranteed-fail
selection), defaulting to the kind with the greatest held tonnage among
those eligible, and a tonnage input defaulting to the fleet's full held
tonnage of the selected kind, constrained to a positive value no greater
than that held tonnage, alongside a live proceeds preview computed by
folding the selected tonnage across the station's demand entries for the
selected kind (per `goods-sale`'s "Settlement Folds Tonnage Across a
Venue's Ordered Demand Entries" and per-portion rounding rule), pinned to
the exact same fold and rounding the server settlement uses via the shared
`fixtures/market/cases.json` golden (design.md Decision 22) — so a player
is never shown a split or a total the settlement won't honor.

#### Scenario: Sell is offered while docked at a station with cargo aboard
- **WHEN** the acting fleet's effective state is `docked` to a station and
  its cargo pool holds at least one kind of tonnage
- **THEN** the fleet panel offers the sell verb with a kind picker and a
  tonnage input, with no board selection required

#### Scenario: Sell is not offered when merely co-located, not docked
- **WHEN** the acting fleet is parked at or near a station's position but
  its effective state is not `docked` to it
- **THEN** the sell verb is not offered

#### Scenario: Sell is not offered when the cargo pool is empty
- **WHEN** the acting fleet is docked to a station but its cargo pool holds
  no tonnage of any kind
- **THEN** the sell verb is not offered

#### Scenario: Tonnage input clamps to held tonnage of the selected kind
- **WHEN** a tonnage greater than the fleet's held tonnage of the selected
  kind is entered
- **THEN** the input clamps the value to that held tonnage

#### Scenario: The proceeds preview reflects the served quote
- **WHEN** the tonnage or kind selection changes while the sell offer is
  shown
- **THEN** the previewed proceeds update to reflect the served quote for
  the newly selected kind and tonnage

#### Scenario: A kind with no configured floor at this station is excluded from the picker
- **WHEN** the acting fleet holds a kind for which the docked station's
  region has no configured floor price
- **THEN** that kind does not appear in the sell offer's kind picker, even
  though the fleet holds tonnage of it

#### Scenario: A split-fill preview matches the settlement fold exactly
- **WHEN** the selected tonnage exceeds the station's highest-priority open
  demand entry's remaining quantity for the selected kind
- **THEN** the preview's reported per-entry portions and total proceeds are
  the exact values the shared fixture (`fixtures/market/cases.json`) pins
  for that case, identical to what the server's settlement would apply
