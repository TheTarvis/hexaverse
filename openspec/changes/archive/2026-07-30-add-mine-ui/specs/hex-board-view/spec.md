# hex-board-view Delta Specification

## ADDED Requirements

### Requirement: Mine Offer on the Docked Fleet
The system SHALL offer the mine verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a feature
carrying at least one visible resource AND the fleet's movement channel is
free (no running mine, not burning) — anchored to the fleet's docked
state, requiring no board selection: a fleet can only mine what it is
docked to, so selecting the body underneath it (which its own glyph
occludes) is never a precondition. The offer SHALL present a resource-kind
picker limited to the docked feature's visible resource kinds, defaulting
to the richest, and a tonnage input defaulting to the fleet's free hold
and constrained to a positive value no greater than the free hold.

#### Scenario: Mine is offered while docked at a resource-bearing body
- **WHEN** the acting fleet's effective state is `docked` to a feature
  carrying visible resources
- **THEN** the fleet panel offers the mine verb with a kind picker and a
  tonnage input defaulted to the fleet's free hold, with no board
  selection required

#### Scenario: Mine is not offered when merely co-located, not docked
- **WHEN** the acting fleet occupies the same hex as a resource feature
  but its effective state is not `docked`
- **THEN** the mine verb is not offered

#### Scenario: Mine is not offered when the docked body has no visible resources
- **WHEN** the acting fleet is docked to a feature that carries no visible
  resources
- **THEN** the mine verb is not offered

#### Scenario: Tonnage input clamps to free hold
- **WHEN** a tonnage greater than the fleet's free hold is entered
- **THEN** the input clamps the value to the free hold

### Requirement: Mine ETA Preview From the Served Mining Rate
The system SHALL, while the mine offer is shown, preview the run's duration
as the entered tonnage divided by the fleet's served derived mining rate
(from the fleet read's roster fields), recomputed live as the tonnage or
kind selection changes; after commit, countdowns SHALL use the ETA frozen
on the returned action, not the client preview.

#### Scenario: The preview tracks the tonnage input
- **WHEN** the tonnage input value changes
- **THEN** the previewed duration updates to the new tonnage divided by the
  fleet's served mining rate

#### Scenario: The committed countdown uses the server's ETA
- **WHEN** a mine run commits successfully
- **THEN** the running countdown derives from the action's returned ETA,
  not from the pre-commit client preview

### Requirement: Mine Commit
The system SHALL, when the mine command is invoked with a chosen kind and
tonnage, submit the mine order against the acting fleet's docked feature;
on success it SHALL show a success toast and arm the ETA refetch; on
failure it SHALL show an error toast carrying the server's distinguishable
rejection reason and leave the offer's state unchanged.

#### Scenario: A successful mine commit arms the countdown
- **WHEN** the mine command succeeds
- **THEN** a success toast is shown and a refetch is armed for the run's
  ETA

#### Scenario: A failed mine commit toasts the reason
- **WHEN** the mine command fails (for example: over free hold, depleted
  lode, busy movement slot)
- **THEN** an error toast surfaces the server's rejection reason and the
  offer remains available

### Requirement: Running Mine Gates the Movement Channel
The system SHALL, while the acting fleet has a running mine action whose
ETA has not yet passed, disable the mine and move commands and show a
countdown to the run's ETA; the scan command SHALL remain enabled
(independent sensor channel); and a cancel-mine control SHALL be offered
that cancels the run via the generic action cancel endpoint. Once the ETA
passes, the gating SHALL lift without requiring navigation.

#### Scenario: Move is disabled while a mine is running
- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** the move command is unavailable and a countdown to the mine's
  ETA is shown

#### Scenario: Scan stays enabled while a mine is running
- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** the scan control remains enabled

#### Scenario: A running mine can be cancelled
- **WHEN** the cancel-mine control is invoked during a running mine
- **THEN** the cancellation is submitted through the generic action cancel
  endpoint and the movement channel frees on success

### Requirement: Fleet Panel Hold Readout
The system SHALL show, for the acting (own) fleet, a hold readout derived
from the fleet read's owner-only roster fields: cargo contents by resource
kind and used versus total capacity; the readout SHALL reflect the
post-resolution cargo after a mine run resolves (via the board's refetch
rules), without requiring navigation.

#### Scenario: The hold readout shows contents and capacity
- **WHEN** the board renders an acting fleet whose fleet read carries
  roster fields
- **THEN** the fleet panel shows cargo tons by kind and the used/total
  hold capacity

#### Scenario: The hold visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the board's refetch lands the
  updated fleet read
- **THEN** the hold readout shows the credited cargo without a page
  navigation

## MODIFIED Requirements

### Requirement: Realtime Refetch Rules While the Board Is Open
The system SHALL keep the open board's interior and fleet reads current
via three independent mechanisms: (1) a self-scheduled refetch shortly
after the soonest known future ETA among the requester's own fleets'
arrivals, the running scan's ETA, and the running mine's ETA, (2) a live
subscription to the system's event channel that refetches on a completion
event and again on reconnect after a drop, and (3) a periodic poll —
tightened while an own scan is running (its progressively landing echoes)
and relaxed otherwise.

#### Scenario: An own fleet's arrival self-schedules a refetch
- **WHEN** an own fleet in the system has a burn with a known arrival time
- **THEN** a refetch is scheduled to fire shortly after that arrival time

#### Scenario: A running mine self-schedules a refetch at its ETA
- **WHEN** the acting fleet has a running mine with a known ETA
- **THEN** a refetch is scheduled to fire shortly after that ETA, so the
  resolved cargo and freed movement channel land without user action

#### Scenario: A missed event on reconnect triggers a resync
- **WHEN** the system channel's live connection drops and later
  reconnects
- **THEN** a refetch fires on reconnect to resync any missed completions

#### Scenario: The poll tightens while a scan is running
- **WHEN** the acting fleet has a running scan on this board
- **THEN** the periodic poll interval is shorter than when no scan is
  running
