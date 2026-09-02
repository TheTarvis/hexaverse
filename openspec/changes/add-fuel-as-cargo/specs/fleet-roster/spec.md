## ADDED Requirements

### Requirement: The Roster Row Shows Held Fuel and an Estimated Range
The system SHALL show, on each owned fleet's roster row, its currently
held `fuel` tonnage and the estimated maximum range the fleet read
endpoint reports for it (`fleet-movement`'s "Fleet Read Reports an
Estimated Maximum Range From Current Fuel"), rendering the server-reported
figures as-is — this capability SHALL NOT compute or re-derive either
value.

#### Scenario: A roster row shows the fleet's held fuel and estimated range
- **WHEN** a roster row is rendered for an owned fleet
- **THEN** it shows that fleet's currently held `fuel` tonnage and its
  server-reported estimated maximum range

#### Scenario: The roster never computes range client-side
- **WHEN** a roster row's fuel or range figure is rendered
- **THEN** both values are the server's own reported figures, with no
  client-side recomputation from acceleration, hull count, or fuel alone

### Requirement: The Roster Row Shows a Persistent Stranded Indication
The system SHALL show, on an owned fleet's roster row, the server-reported
persistent stranded indication (`fleet-movement`'s "A Fleet's Read Reports
a Persistent Stranded Indication, Computed at the Acceleration Floor"),
rendered so it is visually and semantically distinguishable from an idle
fleet's row — this capability SHALL NOT compute or re-derive the
condition client-side, and SHALL render it whenever it is present on the
fleet read, independent of whether the player ever witnessed the
one-shot commit-time warning that may have first created the condition
("A Burn Commit's Stranding Warning Is Surfaced to the Player" below).

#### Scenario: A stranded fleet's roster row shows a persistent indication
- **WHEN** a roster row is rendered for an owned fleet whose read reports
  the stranded indication set true
- **THEN** the row shows a stranded indication, visually and semantically
  distinct from how an idle fleet with no active order is rendered

#### Scenario: The indication persists across sessions and reloads
- **WHEN** a stranded fleet's roster row is rendered in a session where no
  commit-time warning was ever shown to this player (e.g. after a page
  reload, or from a different device)
- **THEN** the stranded indication is still shown, because it is read
  fresh from the fleet's own read on every render, not from any
  session-local record of a past warning

#### Scenario: A non-stranded fleet's roster row shows no stranded indication
- **WHEN** a roster row is rendered for an owned fleet whose read reports
  the stranded indication set false
- **THEN** no stranded indication is shown, regardless of whether the
  fleet is idle or has an active order

### Requirement: A Burn Commit's Stranding Warning Is Surfaced to the Player
The system SHALL, when a burn order's commit response carries the
distinguishable stranding warning (`fleet-movement`'s "A Burn Commit
Warns, But Does Not Block, When It Would Leave the Fleet Unable to Reach a
Station or Gate"), render it to the player as a visible, non-blocking
notice distinct from an error toast — the order has already succeeded, so
this is advisory, not a failure state — and SHALL NOT suppress or discard
the committed order's own success feedback when the warning is also
present.

#### Scenario: A stranding warning renders alongside a successful commit
- **WHEN** a burn order's commit response carries a stranding warning
- **THEN** the order's own success feedback is shown, and the warning is
  additionally rendered as a distinct, non-blocking notice

#### Scenario: A commit with no warning shows no stranding notice
- **WHEN** a burn order's commit response carries no stranding warning
- **THEN** no stranding notice is rendered

#### Scenario: The warning is never rendered as an error
- **WHEN** a stranding warning is rendered
- **THEN** it is visually and semantically distinguished from the error
  styling used for a rejected command, since the underlying order
  succeeded
