## MODIFIED Requirements

### Requirement: The Body Table Is an Unfiltered Internal Seam, Never a Response
The body table SHALL be an unfiltered, requester-agnostic view of a system:
it resolves every body the system contains, including features the requester
has never observed and lane gates toward systems the requester has not
charted. It SHALL NOT be serialized into any response, in whole or in part.
A consumer building a response SHALL serve every body's position, id, count,
and any aggregate over the table **unfiltered** — no per-requester band,
tier, or charted-knowledge filter is computed over body geometry or
identity, per `system-interior`'s "Bodies Are Public; Ships Are Disclosed"
(`replace-observation-with-sightings`). The one value a consumer resolves
through the table that SHALL NOT be served unfiltered is **foreign ship
presence**: a consumer serving ship positions SHALL project them through
`proximity-disclosure`'s per-requester disclosure filter before
serialization, never emitting the table's own ship-position view directly.
No field of any response SHALL be derived from the table except through
that ship-presence filter or the unfiltered-body rule above.

#### Scenario: The table carries bodies the requester could not see
- **WHEN** a table is built for a system in which a requester has neither
  coverage nor memory of some features, and has no graph-tier knowledge of
  some lane destinations
- **THEN** the table still resolves every one of those bodies and every one of
  those gates, because it is not requester-scoped

#### Scenario: No response field is derived from the unfiltered table
- **WHEN** any response is built for a requester
- **THEN** every body's position, id, count, or aggregate taken directly
  from a body table is served unfiltered, per `system-interior`'s "Bodies
  Are Public; Ships Are Disclosed"
- **AND** the only value the response derives from the table through a
  per-requester filter is foreign ship presence, projected through
  `proximity-disclosure` before serialization
