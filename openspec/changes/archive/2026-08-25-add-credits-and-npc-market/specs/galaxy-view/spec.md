## MODIFIED Requirements

### Requirement: System Inspector on Selection
The system SHALL show, on selecting a system node, its name, region, lane
(connection) count, star class, and its full major-body skeleton — the
free astronomical layer, shown regardless of the requester's fog tier for
that system — and, when that system carries a station visible to the
requester (per `trading-station`'s visibility gate), the station's
presence and its current quotes (its price-ordered demand entries, per
`market-price-board`'s uniform quote shape — never a separate floor/
requests split). The system SHALL show an empty-state prompt when nothing
is selected.

#### Scenario: Selecting a node populates the inspector
- **WHEN** a system node is selected
- **THEN** the inspector shows its name, region, star class, lane count,
  and major-body list

#### Scenario: The major-body skeleton is never fog-gated
- **WHEN** a system with tier `starVisible` (no earned knowledge) is
  selected
- **THEN** its major-body skeleton is still shown in full

#### Scenario: Selecting a system with a visible station shows its quotes
- **WHEN** a system carrying a station visible to the requester (per the
  configured minimum visibility tier) is selected
- **THEN** the inspector shows the station's presence alongside its
  current price-ordered demand entries

#### Scenario: A system below the station visibility gate, or with none, shows no station section
- **WHEN** a system whose station (if any) does not clear the configured
  minimum visibility tier is selected
- **THEN** the inspector shows no station section for that system
