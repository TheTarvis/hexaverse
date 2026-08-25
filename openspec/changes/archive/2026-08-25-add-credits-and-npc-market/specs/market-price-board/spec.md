## ADDED Requirements

### Requirement: One Read Returns Every Visible Station's Quotes
The system SHALL serve one read that returns, for every station (venue)
meeting the visibility gate (see "Configured Minimum Visibility Tier"), its
system id and, per tradable kind, its ordered list of demand entries
(`{unitPrice, remainingQuantity, source}`, price-descending — the floor
represented as the entry of last resort, per `goods-sale`'s "Settlement
Folds Tonnage Across a Venue's Ordered Demand Entries" — never as a
separate `floor` field distinct from the entry list), and the current
world time — so a client can rank stations without a per-station read, and
so a future venue with player-sourced entries (M12) extends the same
response shape with no client-contract break. A requester with no visible
stations SHALL receive an empty set, not an error.

#### Scenario: A requester with multiple visible stations gets them all in one response
- **WHEN** a requester whose graph tier clears the visibility gate for two
  station-bearing systems reads the price board
- **THEN** the response includes both stations' demand-entry lists per
  tradable kind

#### Scenario: No visible stations returns an empty list, not an error
- **WHEN** a requester with no station-bearing system clearing the
  visibility gate reads the price board
- **THEN** the response is `200 OK` with an empty station list

#### Scenario: The response carries current world time
- **WHEN** the price board is read
- **THEN** the response includes the current world time

### Requirement: Live Quotes, Never Frozen At An Observation's asOf
Every quote this capability serves SHALL reflect the current live state of
its floor and requests, never a stored observation's frozen `asOf`
snapshot — market data is information, not subject to the three-band
feature-composition freeze `system-interior` applies to scanned detail. A
request another corporation exhausts between two of a requester's reads
SHALL show as exhausted (or absent) on the next read with no travel or
scan required by the reading corporation.

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
following the same tier-gate pattern `system-interior`'s "Charted Lane Gate
Filtering" already applies.

#### Scenario: A system at or above the configured minimum tier is included
- **WHEN** a requester's graph tier for a station-bearing system is at
  least the configured minimum
- **THEN** that station is included in the price-board read

#### Scenario: A system below the configured minimum tier is excluded
- **WHEN** a requester's graph tier for a station-bearing system is below
  the configured minimum (e.g., merely `starVisible`)
- **THEN** that station is excluded from the price-board read

### Requirement: Disclosure Is Limited To Quotes, Not "Nothing Beyond Existing Fog"
The price-board read SHALL disclose no fleet position, fleet ownership,
corporation identity, or system/lane content beyond what the requester's
existing fog already grants. **This requirement names the one honest
exception rather than claiming there is none**: this surface DOES disclose
live, exact per-venue demand-entry quantities (remaining tonnage on each
open premium request) to any requester clearing the visibility gate, and
those quantities change as other corporations trade — an activity signal
cheaper than a scan and requiring no travel (see design.md Decision 6's
second risk paragraph). The response SHALL NOT name a fleet, SHALL NOT
name a foreign corporation's identity, and SHALL omit the `ownerCorpId`
field entirely from a station entry rather than including it as `null`.

#### Scenario: The response names no fleet or foreign corporation identity
- **WHEN** the price board is read
- **THEN** the response for each visible station names no fleet and no
  corporation identity

#### Scenario: ownerCorpId is omitted, not shipped as null
- **WHEN** the price board is read in this version (no station is ever
  player-owned)
- **THEN** each station entry omits the `ownerCorpId` field entirely rather
  than including it with a `null` value

#### Scenario: The response discloses no system content the requester couldn't already see
- **WHEN** the price board is read
- **THEN** no system content (features, resources, lanes) beyond what the
  requester's existing fog already grants via the interior read is present
  in the response

#### Scenario: Live demand quantities are disclosed by design, named honestly
- **WHEN** a request's remaining quantity changes because another
  corporation traded against it
- **THEN** the price board reflects that change to any requester clearing
  the visibility gate — this is the surface's documented purpose, not an
  unintended leak, and is named here rather than claimed not to happen

### Requirement: No Response Is Served From Another Corporation's Cached Projection
A price-board response SHALL never be served from a cache entry populated
for, or shared across, a different requesting corporation — this is a
fog-gated, per-corporation projection (Configured Minimum Visibility Tier
is evaluated against the requester's own graph tier), and any caching
layer introduced for this read SHALL key its cache on the requesting
corporation's resolved id.

#### Scenario: Two corporations with different visibility never share a cached response
- **WHEN** two corporations with different graph-tier knowledge of the same
  station-bearing system each read the price board
- **THEN** each receives a response computed against its own visibility,
  never a response cached for the other corporation
