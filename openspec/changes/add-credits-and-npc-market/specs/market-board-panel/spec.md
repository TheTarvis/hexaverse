## ADDED Requirements

### Requirement: Ranked Quote List By Kind
For a chosen resource kind, the panel SHALL list every visible station's
best demand entry for that kind (per `market-price-board`'s uniform,
price-ordered demand-entry list), ordered best-price-first, visually
distinguishing a premium-request entry from the floor (last-resort) entry
by more than color alone (e.g., an icon or text label in addition to any
color cue, per `frontend/CLAUDE.md`'s color-system convention), and
showing a request entry's remaining quantity.

#### Scenario: Selecting a kind renders stations ordered best-first
- **WHEN** a resource kind is chosen
- **THEN** the panel lists every visible station's best demand entry for
  that kind, ordered from best to worst

#### Scenario: A request row is visually distinct and shows remaining quantity
- **WHEN** a station has an open request entry for the chosen kind
- **THEN** its row is distinguished from a plain floor-entry row by more
  than color alone, and shows the request's remaining quantity

#### Scenario: A station with no request shows only its floor
- **WHEN** a visible station has no open request entry for the chosen kind
- **THEN** its row shows only the floor (last-resort) entry's price

### Requirement: Spread Surfaced Without Arithmetic
The panel SHALL show, for a selected kind, the difference between the best
remote price and the price at the player's current position (or nearest
known station) as a direct, pre-computed figure or percentage — never
requiring the player to subtract two displayed numbers themselves.

#### Scenario: A remote premium is shown as a legible spread
- **WHEN** a remote station's price for the selected kind exceeds the
  price at the player's current position
- **THEN** the panel shows that difference as a computed figure or
  percentage (e.g., "+40%" or "+120cr/t"), not merely two raw prices side
  by side

### Requirement: Row Selection Delegated to the Mounting View
The panel SHALL, on a row click, hand the clicked station back to the
mounting view via a callback, without itself deciding what selecting a
station means — mirroring `fleet-roster`'s "Row Selection Delegated to the
Mounting View".

#### Scenario: Clicking a row invokes the mounting view's callback
- **WHEN** a station row is clicked, on either mount point (the galaxy view
  or the station inspector)
- **THEN** the mounting view's selection callback is invoked with that
  station's data

### Requirement: Loading, Empty, and Error States Are Independent
The panel SHALL show a loading placeholder while quotes are in flight, an
empty-state message when no station qualifies, and an error state when the
quote read fails; a failed quote read SHALL NOT prevent the rest of the
mounting view from rendering.

#### Scenario: Quotes in flight show a loading placeholder
- **WHEN** the panel's quote read is in flight
- **THEN** a loading placeholder is shown

#### Scenario: Zero qualifying stations show an empty-state message
- **WHEN** the quote read succeeds with no visible stations
- **THEN** an empty-state message is shown, not an error

#### Scenario: A failed quote read is contained to the panel
- **WHEN** the panel's quote read fails
- **THEN** the panel shows an error state, and the rest of the mounting
  view (e.g., the galaxy renderer) continues to render normally

### Requirement: Quote Freshness Via Stated Refresh Cadence
The panel SHALL re-fetch its quotes on a stated periodic cadence
(`market.Params.BoardRefreshCadence`, proposed default 30 seconds — see
design.md Open Questions; no live push in this version), treating a quote
up to one cadence period stale as acceptable for a decision that itself
takes minutes of travel to act on, so a request another corporation
exhausts becomes visible without requiring a manual reload.

#### Scenario: An exhausted request becomes visible after the next refresh
- **WHEN** another corporation exhausts a request between two of the
  panel's automatic refresh cycles
- **THEN** the panel shows it exhausted after the next cycle, with no user
  action required
