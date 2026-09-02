## MODIFIED Requirements

### Requirement: Live Quotes, Never Frozen At An Observation's asOf
Every quote this capability serves SHALL reflect the current live state of
its floor and requests, never a sighting's frozen `asOf` snapshot — market
data is information, not a historical record captured at scan time the way
a `sighting-records` entry is. A request another corporation exhausts
between two of a requester's reads SHALL show as exhausted (or absent) on
the next read with no travel or scan required by the reading corporation.

#### Scenario: An exhausted request reflects immediately on the next read
- **WHEN** another corporation fully sells against a request between two of
  the requester's price-board reads
- **THEN** the requester's next read shows that request exhausted or
  absent, having performed no travel or scan themselves

#### Scenario: A floor reads live even with no sensor coverage
- **WHEN** a requester reads a station's floor price while having no live
  sensor coverage of that system
- **THEN** the reported floor is the current configured value, not a stale
  or frozen figure

### Requirement: Configured Minimum Visibility Tier
The system SHALL include a station in this read only when the requester's
graph-tier knowledge of that station's system is at least a configured
minimum tier (`market.Params.MinVisibilityTier`, defaulted to `rumored`),
following the same tier-gate pattern `trading-station`'s "Home Station
Visible On the Direct Station Read, No Scan Required" already applies
against that same configured tier.

#### Scenario: A system at or above the configured minimum tier is included
- **WHEN** a requester's graph tier for a station-bearing system is at
  least the configured minimum
- **THEN** that station is included in the price-board read

#### Scenario: A system below the configured minimum tier is excluded
- **WHEN** a requester's graph tier for a station-bearing system is below
  the configured minimum (e.g., merely `starVisible`)
- **THEN** that station is excluded from the price-board read
