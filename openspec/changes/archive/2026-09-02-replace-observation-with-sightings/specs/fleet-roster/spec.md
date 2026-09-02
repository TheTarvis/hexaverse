## REMOVED Requirements

### Requirement: The Roster Row Is the Fleet Command Surface
**Reason**: Superseded — design.md Decision 2 drops the charted-lane
precondition on `Jump` entirely; jump-eligibility on the server is now
exactly "attached to the lane's own gate body," with no charting
condition. This requirement's own text and its *Jump is offered only while
attached to a charted gate*/*Jump is withheld at an uncharted gate*
scenarios still name charting as a client-side gate on the jump command,
which the server no longer enforces. Left as written, the client imposes a
dwell the no-dwell ruling forbids: the charted set arrives on a separate,
differently cadenced read (`GET /v1/galaxy`) from the one that reports
attachment, so the jump button would stay hidden for a real interval after
attaching even though the server would accept the order immediately; and
if the new `via: gate` charting write on attachment ever failed, the
client would silently restore the exact traversability blocker this change
closes, while every server-side test stayed green. Restated below, renamed
to name what actually gates jump now, with every other command-visibility
scenario carried forward unchanged.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: The Roster Row Is the Fleet Command Surface, Jump Gated by Attachment Alone
The system SHALL offer, on each owned fleet's roster row, the commands that
kinematic state and attachment make valid: burn SHALL be offered
regardless of the fleet's current kinematic state; cut drive SHALL be
offered only while the fleet's effective kinematic state is a burn; stop in
place SHALL be offered only while the fleet's effective kinematic state is
a burn or a drift; and jump SHALL be offered whenever the fleet is attached
to a lane-gate body, with no charted-lane condition — charting is map
knowledge and a sellable intel product, never a permission
(`replace-observation-with-sightings` design.md Decision 2), and the
server grants jump-eligibility on attachment alone. A command not made
valid by the fleet's current state or attachment SHALL NOT be offered.

#### Scenario: Burn is always available

- **WHEN** a roster row is shown for a fleet in any kinematic state (burn,
  park, or drift)
- **THEN** the burn command is offered on that row

#### Scenario: Cut drive is offered only while burning

- **WHEN** a fleet's effective kinematic state is a burn
- **THEN** the cut-drive command is offered on its row

#### Scenario: Cut drive is withheld outside a burn

- **WHEN** a fleet's effective kinematic state is a park or a drift
- **THEN** the cut-drive command is not offered on its row

#### Scenario: Stop in place is offered while burning or drifting

- **WHEN** a fleet's effective kinematic state is a burn or a drift
- **THEN** the stop-in-place command is offered on its row

#### Scenario: Stop in place is withheld while parked

- **WHEN** a fleet's effective kinematic state is a park
- **THEN** the stop-in-place command is not offered on its row, the fleet
  already having nothing to stop

#### Scenario: Jump is offered while attached to any lane-gate body

- **WHEN** a fleet is attached to a lane-gate body
- **THEN** the jump command is offered on its row, regardless of whether
  the corporation has charted that gate's lane

#### Scenario: Jump is withheld when not attached to a gate

- **WHEN** a fleet has no `attachedTo` set, or is attached to a body that
  is not a lane gate
- **THEN** the jump command is not offered on its row
