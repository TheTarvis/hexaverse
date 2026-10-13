## MODIFIED Requirements

### Requirement: One Starting Hull at a Deterministic Home Park

The system SHALL seed exactly one fleet for a fresh corporation in its chosen home system, attached to its provisioned home station in a free host orbit using that station's insertion standoff and period at the seeding clock epoch. Its position SHALL resolve from the served station and orbit rather than an account-derived point park. Spawn healing SHALL preserve an existing fleet's identity, state and attachment, never reposition it or seed a second hull. The orbit SHALL charge no stationkeeping upkeep before the first order. Concurrent seeding or healing attempts for the same corporation SHALL converge atomically on one stored hull identity and return that winner without overwriting its state; a failed create/read SHALL propagate an error rather than returning an unsaved candidate.

#### Scenario: The starting hull is deterministic per account
- **WHEN** a fresh spawn seeds a starting hull and a later healing retry runs for the same account
- **THEN** the initial hull is attached to its home station in that station's insertion orbit
- **AND** the retry returns the same hull without changing its stored state or attachment, including when it has moved since spawn

#### Scenario: The starting hull never lands inside the star's clearance
- **WHEN** a starting hull is seeded
- **THEN** its position lies outside the home system star's configured clearance radius

#### Scenario: Starting orbit requires no upkeep
- **WHEN** the newly seeded hull is read before any player order
- **THEN** its park is a free station-hosted orbit, not stationkeeping, and no stationkeeping fuel upkeep is charged

#### Scenario: Concurrent missing-hull healing returns one winner
- **GIVEN** two bootstrap requests for the same corporation both observe no hull
- **WHEN** their station-hosted seeding attempts overlap
- **THEN** both successful requests return the same stored fleet id and exactly one hull exists for that corporation
- **AND** the starting-fuel grant is credited exactly once to that winning hull

#### Scenario: Losing seed preserves winner movement and fuel
- **GIVEN** another seed attempt has created the winning hull and its stored state, attachment or fuel has subsequently changed
- **WHEN** a competing seed attempt loses atomic creation
- **THEN** it returns the persisted winner without overwriting any of those changes with its candidate's spawn defaults

#### Scenario: Failed atomic seed cannot fabricate success
- **WHEN** atomic hull creation fails for a reason other than an existing winner, or reading the existing winner fails
- **THEN** seeding returns an error and does not return its unsaved candidate or mark spawn assets complete

### Requirement: Starting Fuel Is a Configured Constant, Guarded By a Reachability Sample

The system SHALL grant a fresh corporation's starting hull the configured constant amount of fuel, FuelParams.StartingFuelTons, exactly once. The grant SHALL NOT depend on a spawn-time kinematic solve. Because the hull starts attached to its home station, it SHALL have immediate access to that station's attachment-gated services without needing a burn to the host it already occupies. A generated sample of seeded accounts spanning spawnable systems SHALL verify the configured grant and resolvable, clearance-safe station attachment for every sampled hull. This replaces the former unattached point-spawn burn-to-station premise; it SHALL NOT introduce a special zero-length burn or weaken ordinary burn pricing or refusal rules.

#### Scenario: A seeded hull can reach its home station on its starting fuel
- **WHEN** a fresh corporation's starting hull is seeded
- **THEN** it is already attached in a resolvable orbit around its home station and carries exactly the configured starting-fuel grant
- **AND** access to station services needs no initial station-targeted burn or fuel debit

#### Scenario: The guarantee is checked over a generated sample, not one fixture account
- **WHEN** the starting-fuel and station-access check runs over a large generated sample of accounts spanning the galaxy's spawnable systems
- **THEN** every sampled hull has the configured grant exactly once and a resolvable station-hosted orbit outside star clearance
- **AND** a sample member lacking its station, grant or valid orbit fails the check rather than accepting a geometry refusal as success
