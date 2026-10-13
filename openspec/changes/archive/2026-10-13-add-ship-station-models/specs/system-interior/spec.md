## MODIFIED Requirements

### Requirement: Concurrent First-Explore Resolves to One Interior

The system SHALL claim interior materialization with an atomic create-if-absent write, so that two concurrent first requests for the same system's interior converge on a single persisted interior rather than double-writing. A caller losing that race SHALL read the persisted winner and apply the same station projection and continuous-body validation/cascade as an ordinary successful read before returning it. This convergence SHALL preserve existing current-clock and access-filtered response behavior; it SHALL NOT expose additional contacts or omit a provisioned station merely because the create write lost. An unreadable winner SHALL remain an error rather than returning an incomplete success.

#### Scenario: Losing a materialization race reads the winner's copy
- **WHEN** two concurrent calls to GetOrCreateInterior for the same unmaterialized system race, and one's create write loses because the interior already exists
- **THEN** the losing caller reads and returns the already-persisted interior instead of erroring or overwriting it
- **AND** it applies the same station projection and continuous-body validation/cascade as the successful read path

#### Scenario: Concurrent bootstrap resolves the provisioned station
- **GIVEN** a home station has been provisioned and concurrent bootstrap reads race on interior materialization
- **WHEN** a losing caller returns the winner's interior to station-hosted fleet seeding
- **THEN** the station is present with its validated continuous orbit and can be resolved by the body table
- **AND** successful bootstrap responses remain HTTP 200 with exactly-once spawn assets rather than an unknown-body error

#### Scenario: Winner projection preserves failure and filtering rules
- **WHEN** a materialization-race loser reads a winner containing an invalid parent chain or cannot read the winner
- **THEN** the readable winner receives the existing continuous-body omission cascade, while an unreadable winner returns an error
- **AND** current-clock and audience filtering semantics remain those of the existing ordinary response path
