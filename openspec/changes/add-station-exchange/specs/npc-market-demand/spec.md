## ADDED Requirements

### Requirement: NPC Floor and Requests Ride the Unified Book as Standing Orders
Every station's floor price SHALL present, to `market-settlement`'s matching
walk, as a bottomless standing buy-side entry at that station's venue for
each tradable kind, and every open request SHALL present as a
quantity-limited standing buy-side entry priced above the floor — both
participating in price-then-time priority (see `market-settlement`'s "Taker
Order Walks Resting Opposing Listings By Price-Then-Time Priority") alongside
player-posted buy listings at the same venue, without requiring a distinct
code path in the matching core.

#### Scenario: A player's open buy listing priced above a station's open request fills before that request
- **WHEN** a player posts an open buy listing at a station's venue priced
  above that station's open request for the same kind, and a sale is made
  there
- **THEN** the player's buy listing fills before the request

#### Scenario: A sale still fills against the request then the floor with no player listings open
- **WHEN** no player buy listing is open at a station's venue for a kind
- **THEN** a sale there fills against the open request first, then the
  floor for any remainder, exactly as before this capability's book
  unification

#### Scenario: The floor's standing entry never runs out
- **WHEN** any number of taker fills consume a station's floor entry for a
  kind
- **THEN** the floor entry remains available to fill against afterward,
  never exhausted

### Requirement: NPC Standing Orders Are Exempt From Credit Escrow, the Budget Knob Stands In
A floor or request standing entry SHALL NOT lock any corporation's credits on
creation or on a fill against it — the NPC station's configured
budget/absorption limit (see "Budget/Absorption Knobs, Unlimited In This
Version, With Specified Binding Behavior") remains the sole mechanism
bounding how much an NPC entry can pay out, in place of a real escrow
reservation.

#### Scenario: An NPC request or floor fill settles with no corresponding credit-lock ever created
- **WHEN** an NPC request or floor entry fills
- **THEN** no `creditsLocked` change is ever recorded for the NPC side of
  that fill, since no NPC corporation balance exists to lock

#### Scenario: A configured budget/absorption ceiling still rejects a fill in full
- **WHEN** a fill would exceed a station's configured (finite, fixtured)
  budget or absorption ceiling for the current window
- **THEN** the fill is rejected in full, exactly as specified before book
  unification
