# fleet-movement Delta Specification

## MODIFIED Requirements

### Requirement: Fleet Read Surfaces Roster, Cargo, and Derived Capacity
The system SHALL include the fleet's ship roster, its cargo pool, its
derived total cargo capacity, its derived free hold, and its derived
mining rate in the response of the fleet read endpoints (`GET
/v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, `GET
/v1/fleets?mine=true`) for an owning corporation reading its own fleet —
these are not internal-only values computed for the mining verb's use, but
part of the fleet's observable state. For a foreign fleet, these fields
carry exactly the same audience-fog redaction `fleet-movement`'s "Fleet
Read Endpoints and Audience Fog" already applies to path/target/ETA: a
foreign fleet visible inside the requester's live sensor coverage is
redacted to a snapshot that omits `ships`, `cargo`, derived total cargo
capacity, derived free hold, and derived mining rate, disclosing only
movement mode and position.

#### Scenario: The fleet read response includes roster, cargo, and derived capacity
- **WHEN** an owning corporation reads its fleet via the existing fleet
  GET endpoint
- **THEN** the response includes the fleet's `ships` roster, its `cargo`
  pool by kind, its derived total cargo capacity, its derived free hold
  (capacity minus total tons held), and its derived mining rate (the
  roster's summed extraction rate)

#### Scenario: A foreign fleet's cargo and roster are not disclosed
- **WHEN** a requester lists or fetches a foreign fleet currently inside
  their live sensor coverage
- **THEN** the response omits that fleet's `ships` roster, `cargo` pool,
  derived total cargo capacity, derived free hold, and derived mining rate
  — the redacted snapshot carries only movement mode and position,
  extending the same audience-fog redaction `fleet-movement` already
  guarantees for path/target/ETA to the roster and cargo fields
