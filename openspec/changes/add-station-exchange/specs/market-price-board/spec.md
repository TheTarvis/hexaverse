## ADDED Requirements

### Requirement: Price Board Includes Player Book Entries Alongside NPC Quotes
The board's read SHALL, for each visible station, additionally report open
player-posted sell and buy listings at that station's venue (item reference,
unit price, remaining quantity, and posted time for tie-break context)
alongside its floor price and open requests, so a client can rank every
standing entry — NPC and player alike — by price.

#### Scenario: A visible station with an open player sell listing reports it alongside its floor
- **WHEN** a visible station carries an open player-posted sell listing
- **THEN** the price-board response includes that listing's kind, price,
  and remaining quantity alongside the station's floor

#### Scenario: A visible station with an open player buy listing reports it alongside its requests
- **WHEN** a visible station carries an open player-posted buy listing
- **THEN** the price-board response includes that listing's kind, price,
  and remaining quantity alongside the station's open requests

#### Scenario: A station with no player listings reports only its floor and requests
- **WHEN** a visible station carries no open player listing
- **THEN** the response for that station is unchanged from before this
  capability (floor and requests only)

### Requirement: Best Bid and Best Ask Are Summarized Per Venue and Kind
For each visible station and tradable kind, the board's read SHALL report the
single best (highest) standing buy-side price and, when any open player sell
listing exists there, the single best (lowest) standing sell-side price — so
a ranking client need not itself walk every entry to find the top of book.

#### Scenario: The reported best bid matches the highest-priced standing buy-side entry
- **WHEN** the price board is read for a station and kind
- **THEN** the reported best bid equals the highest-priced standing buy-side
  entry there (a request, the floor, or a player buy listing)

#### Scenario: The reported best ask is present only when an open player sell listing exists
- **WHEN** a station carries at least one open player sell listing for a
  kind
- **THEN** the response reports the lowest-priced such listing as the best
  ask

#### Scenario: No open sell listings anywhere for a kind reports no best ask
- **WHEN** a station carries no open player sell listing for a kind
- **THEN** the response reports no best ask for that kind — not a zero or
  null price standing in for "none"
