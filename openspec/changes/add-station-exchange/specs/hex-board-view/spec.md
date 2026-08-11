## ADDED Requirements

### Requirement: List Offer on the Docked Fleet
The system SHALL offer a "post sell listing" verb on the acting fleet's panel
section whenever the acting fleet's effective state is `docked` to a station
and the fleet's cargo pool holds at least one kind of tonnage — anchored to
the fleet's docked state, requiring no board selection, mirroring `###
Requirement: Sell Offer on the Docked Fleet`'s anchoring rationale (a sell
listing's escrow physically deposits the named tonnage into station storage,
so it requires the fleet's physical presence exactly as an instant sale
does). The offer SHALL present a resource-kind picker limited to kinds the
fleet currently holds, a tonnage input constrained to a positive value no
greater than that held tonnage, a unit-price input, and a preview of the
listing fee that will be charged on post.

#### Scenario: A sell listing is offered while docked at a station with cargo aboard
- **WHEN** the acting fleet's effective state is `docked` to a station and
  its cargo pool holds at least one kind of tonnage
- **THEN** the fleet panel offers the post-sell-listing verb with a kind
  picker, a tonnage input, a unit-price input, and a fee preview

#### Scenario: The sell listing offer is not offered when merely co-located, not docked
- **WHEN** the acting fleet occupies the same hex as a station but its
  effective state is not `docked`
- **THEN** the post-sell-listing verb is not offered

#### Scenario: Tonnage input clamps to held tonnage of the selected kind
- **WHEN** a tonnage greater than the fleet's held tonnage of the selected
  kind is entered
- **THEN** the input clamps the value to that held tonnage

### Requirement: List Commit
The system SHALL, when the post-sell-listing command is invoked with a
chosen kind, tonnage, and unit price, submit the listing against the acting
fleet's docked station; on success it SHALL show a success toast and refresh
the fleet's hold without requiring navigation; on failure it SHALL show an
error toast carrying player-facing copy mapped from the server's
distinguishable rejection reason (mirroring `### Requirement: Rejection
Reasons Map to Player-Facing Copy, Not Raw Server Text` — never the raw
sentinel-error string verbatim) and leave the offer's state unchanged.

#### Scenario: A successful listing post refreshes the fleet's hold
- **WHEN** the post-sell-listing command succeeds
- **THEN** a success toast is shown, and the fleet's hold readout reflects
  the escrowed tonnage's removal, without a page navigation

#### Scenario: A failed listing post toasts player-facing copy, not the raw server reason
- **WHEN** the post-sell-listing command fails (for example: over-held
  tonnage, an invalid price, or a storage-capacity rejection)
- **THEN** an error toast surfaces player-facing copy mapped from the
  server's distinguishable rejection reason — never the raw sentinel-error
  string verbatim — and the offer remains available for retry

### Requirement: Cancel Own Listing From the Board
The system SHALL offer a cancel action, on the fleet panel or the station
facts panel, for any of the requester's own open listings at the docked
station, sourced from `market-listings`'s "Owner's Own-Listings Read,
Including Recently Terminal" filtered to that station's venue — never
inferred from the board's general (fog-gated, foreign-visible) read, so no
foreign corporation's listing can ever be mistaken for the requester's own
or offered a cancel action. On success it SHALL refresh the fleet's hold or
the requester's storage readout without requiring navigation; on failure it
SHALL show an error toast carrying player-facing copy mapped from the
server's distinguishable rejection reason.

#### Scenario: The owner cancels their own open sell listing from the board
- **WHEN** the requester cancels one of their own open sell listings at the
  docked station
- **THEN** the listing is removed from "my listings" for that venue and the
  escrowed tonnage becomes withdrawable (free) storage, reflected without
  navigation

#### Scenario: A listing not owned by the requester is structurally never offered a cancel action on the board
- **WHEN** the board renders another corporation's open listing at the
  station (visible via the general fog-gated read)
- **THEN** no cancel action is offered for it, because it never appears in
  the owner-scoped read this action is sourced from

#### Scenario: A failed cancel toasts player-facing copy, not the raw server reason
- **WHEN** a cancel fails (for example: the listing already filled or
  expired concurrently)
- **THEN** an error toast surfaces player-facing copy, never the raw
  sentinel-error string verbatim
