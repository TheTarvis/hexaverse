## MODIFIED Requirements

### Requirement: Sell Commit
The system SHALL, when the sell command is invoked with a chosen kind and
tonnage, submit the sale against the acting fleet's docked station; on
success it SHALL show a success toast, and the fleet's hold and the
requester's credit balance SHALL both reflect the sale's effect without
requiring navigation — on the strip's hold and credits cells
(`system-console`) that render them, this panel no longer carrying either
readout; on failure it SHALL show an error toast carrying player-facing copy
mapped from the server's distinguishable rejection reason and leave the
offer's state unchanged — except for a "price changed" (slippage guard)
rejection, which SHALL instead refresh the offer to the server's current
applicable price(s) and proceeds total, showing that refreshed figure
alongside the one the player originally expected — each presented per
`figure-formatting` as a credit figure, in its own element carrying its own
raw value, never combined into a single interpolated string — so the player
can accept or abandon the new price from inside the flow without
re-navigating; re-committing after such a refresh SHALL use a newly
generated operation key (a re-priced sale is a new intent, never a retry of
the old one).

#### Scenario: A successful sale refreshes hold and balance
- **WHEN** the sell command succeeds
- **THEN** a success toast is shown, and the strip's hold cell and credits
  cell (`system-console`) both reflect the sale's effect without a page
  navigation

#### Scenario: A failed sale toasts player-facing copy, not raw server text
- **WHEN** the sell command fails (for example: over-held tonnage, no
  configured floor for the kind, or a budget/absorption limit)
- **THEN** an error toast surfaces player-facing, actionable copy mapped
  from the server's distinguishable rejection reason (never the raw
  sentinel-error string verbatim), and the offer remains available for
  retry

#### Scenario: A price-changed rejection refreshes the offer instead of freezing it
- **WHEN** the sell command fails with the "price changed" slippage
  rejection
- **THEN** the offer refreshes to the server's current applicable price(s)
  and total proceeds, displaying that figure alongside the player's
  originally expected one — each presented per `figure-formatting` as a
  credit figure in its own element with its own raw value — rather than
  leaving the stale pre-rejection offer on screen

#### Scenario: Re-committing a re-priced sale uses a new operation key
- **WHEN** a player re-commits a sale after a price-changed refresh
- **THEN** the re-commit is submitted with a newly generated operation key,
  distinct from the original attempt's key

### Requirement: Refuel Commit
The system SHALL, when the refuel command is invoked with a chosen
tonnage, submit the refuel against the acting fleet's docked station; on
success it SHALL show a success toast, and the fleet's hold, its estimated
range, and the requester's credit balance SHALL all reflect the refuel's
effect without requiring navigation — the estimated range on the fleet
roster row (unchanged) and the strip's fuel cell, and the hold and the
balance on the strip's hold and credits cells (`system-console`), this panel
no longer carrying either readout; on failure — including a rejection
because the requested tonnage's cost exceeds the requester's credit balance,
since a refuel never partially fills (`fuel-purchase`'s "Refuel Is
All-Or-Nothing, Never Partially Filled") — it SHALL show an error toast
carrying player-facing copy mapped from the server's distinguishable
rejection reason and leave the offer's state unchanged. Unlike the sell
command, a refuel rejection carries no price-changed slippage refresh,
because the fuel price is a single global constant that never moves between
the offer's preview and its commit.

#### Scenario: A successful refuel refreshes hold, range, and balance
- **WHEN** the refuel command succeeds
- **THEN** a success toast is shown, and the fleet's estimated range on the
  roster row, and the strip's hold cell and credits cell (`system-console`),
  all reflect the refuel's effect without a page navigation

#### Scenario: An unaffordable refuel is rejected in full, never partially filled
- **WHEN** the refuel command's requested tonnage would cost more than the
  requester's current credit balance
- **THEN** the refuel is rejected in full — no partial tonnage is
  credited, no partial credits are debited — and an error toast surfaces
  player-facing copy

#### Scenario: A failed refuel toasts player-facing copy, not raw server text
- **WHEN** the refuel command fails for any reason
- **THEN** an error toast surfaces player-facing, actionable copy mapped
  from the server's distinguishable rejection reason, never the raw
  sentinel-error string verbatim

## REMOVED Requirements

### Requirement: Fleet Panel Cargo Hold Readout
**Reason**: The cargo hold readout leaves the fleet panel for the vitals
strip (RULING 7 — no coexistence). Re-homed as `system-console`'s *The Hold
Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented Gauge*, which
carries all three of this requirement's scenarios, including the
mine-resolution refresh, adapted to the strip.
**Migration**: No stored data is affected. The panel's hold section is
deleted in this same change; the fleet's cargo hold is read only from the
strip from this change forward.

### Requirement: Credit Balance Readout
**Reason**: The credit balance readout leaves the fleet panel for the vitals
strip (RULING 7 — no coexistence). Re-homed as `system-console`'s *The
Credits Cell Shows the Corporation's Served Balance and Announces Its
Changes*, which carries six of this requirement's seven scenarios adapted to
the strip. The seventh — *A failed sale's or refuel's error is announced to
assistive technology* — is a panel behaviour, not a credits behaviour, and is
re-anchored in this same change under this capability's new *A Failed
Command Is Announced to Assistive Technology*, so it is not lost with the
readout that happened to carry it.
**Migration**: No stored data is affected. The panel's credit balance
section is deleted in this same change; the corporation's balance is read
only from the strip from this change forward.

## ADDED Requirements

### Requirement: A Failed Command Is Announced to Assistive Technology
The system SHALL announce a failed sell or refuel command's error to
assistive technology via an accessible live region, not conveyed by a
purely visual toast alone.

#### Scenario: A failed sale's or refuel's error is announced to assistive technology
- **WHEN** a sell or refuel command fails and an error toast is shown
- **THEN** the error's player-facing copy is announced via an accessible
  live region, not conveyed by a purely visual toast
