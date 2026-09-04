## MODIFIED Requirements

### Requirement: System Space View Route and Data Fan-In
The system SHALL render `/systems/:systemId` from four reads this view issues
itself, plus the corporation session read the surrounding layout already
makes:

- **The interior** (`system-interior`'s *Interior Read Serves Continuous
  Bodies* — every body's continuous position, size, and orbital element set,
  plus the `contacts` array of disclosed foreign presence), disabled until a
  non-empty system id is known. It draws the scene, and it is this view's only
  source of a body's visible resource kinds.
- **The requester's own fleets**, read corporation-scoped through
  `GET /v1/fleets?mine=true` and filtered to this system on the client. The
  own-fleets read SHALL NOT be the system-scoped `GET /v1/fleets?systemId=`
  form: that read does not settle a due arrival, so a fleet that has already
  arrived would render as still burning with no attachment on this view while
  the roster — which reads corporation-scoped — shows it docked, two panels on
  one screen disagreeing about one fleet and the docked commands unreachable on
  the one that offers them.
- **The open system's station**, read through
  `GET /v1/systems/:systemId/station` (`trading-station`'s *Home Station
  Visible On the Direct Station Read, No Scan Required*). This view SHALL
  consume only the station's identity — its system id and its feature id —
  and SHALL NOT derive its drawn position from the station response at all;
  the station's drawn position comes from the interior read's body for it,
  exactly as every other body's does.
- **The market price board**, read through `GET /v1/market/board`
  (`market-price-board`'s *One Read Returns Every Visible Station's Quotes*),
  from which this view SHALL select the venue quotes whose system id is the
  open system's station's, and no other venue's.

The requester's credit balance SHALL come from the ambient corporation session
read the surrounding layout already makes (`corporation-spawn`'s
balance-bearing session bootstrap), never from a fifth read issued by this
view.

Every offer and readout this view mounts SHALL be driven by the results of
those reads: `docked-fleet-actions`'s *Sell Offer on the Docked Fleet* by the
station and the venue quotes, its *Refuel Offer on the Docked Fleet* by the
station, and its *Credit Balance Readout* by the session balance. This view
SHALL NOT offer a control whose commit would have no station, no quote, or no
balance to name, and SHALL NOT render a balance readout that can never show a
figure.

The system SHALL show a loading state while the interior read is in flight,
or, while the view's rendering context is available and uninterrupted, until
it has produced its first rendered frame. The unsupported and interrupted
states defined by *Renderer Unavailability Is an Explicit State* and *Lost
Rendering Context Recovers Without Navigation* take precedence over this
loading state: once either fires, the view shows that state, not the loading
placeholder, regardless of whether a first frame has ever been produced.

The reads SHALL fail independently, and no read's failure SHALL disable
another read's surface:

- IF the interior read fails, THEN the view SHALL show an error state in the
  canvas region — carrying the underlying error message when one is available
  — and SHALL offer a retry affordance that refetches the interior. The fleet
  roster and the `docked-fleet-actions` panel SHALL remain mounted, and every
  command anchored to the acting fleet's own served state SHALL remain
  invokable: sell, refuel, hold, release, cut drive, stop, and jump. The mine
  offer SHALL NOT be shown, because the docked body's visible resource kinds
  reach this view only on the interior read; its absence SHALL be presented as
  a consequence of the failed read, alongside the same retry, and never as
  "this body has nothing to mine".
- IF the own-fleets read fails, THEN the view SHALL show an error state in the
  fleet panel region, with its own retry affordance, and SHALL continue to
  render the interior's bodies, lane gates, and contacts; only the own-fleet
  marks are absent.
- IF the station read fails, THEN the view SHALL withhold the sell and refuel
  offers, SHALL attribute their absence to the failed read alongside a retry
  that refetches the station, and SHALL NOT present that absence as the
  system having nothing to trade with; the canvas, the roster, and every
  command anchored to the acting fleet's own served state SHALL be unaffected.
  A station read that resolves to no station is NOT a failure — it is the
  ordinary answer for a system that has none — and in that case the sell and
  refuel offers are simply absent, with no error surface and no retry.
- IF the market price board read fails, THEN the view SHALL withhold the sell
  offer, whose kind picker and proceeds preview are computed from the venue
  quotes, and SHALL attribute its absence to the failed read alongside a
  retry; the refuel offer SHALL remain, its cost preview coming from the fuel
  price served on the fleet's own read rather than from the board.
- IF the corporation session read has not resolved or has failed, THEN the
  credit balance readout SHALL show an explicit unavailable indication rather
  than a figure, and the sell and refuel offers SHALL remain invokable — a
  missing balance withdraws a readout, never a verb.

#### Scenario: Loading state before data arrives
- **WHEN** the system space view route is opened and its interior read has
  not yet loaded
- **THEN** a loading placeholder is shown

#### Scenario: The own-fleets read is the corporation-scoped one
- **WHEN** the system space view opens and requests the requester's own
  fleets
- **THEN** the request is the corporation-scoped `mine=true` form, filtered
  to this system on the client, and no `systemId`-scoped fleet list request
  is issued by this view

#### Scenario: The view reads the open system's station and the market board
- **WHEN** the system space view opens for a system id
- **THEN** it issues a station read for that system and a market price board
  read, and selects from the board only the venue quotes whose system id is
  that station's

#### Scenario: The station-anchored controls are driven by the view's own reads
- **GIVEN** an own fleet docked to the open system's station with cargo
  aboard, and the interior, own-fleets, station, market-board, and
  corporation session reads all resolved
- **WHEN** the fleet panel renders
- **THEN** the sell offer is shown and its proceeds preview reflects that
  station's served venue quotes
- **AND** the refuel offer is shown
- **AND** the credit balance readout shows the corporation's served balance
  rather than an unavailable indication

#### Scenario: An arrived fleet reads as arrived on both the canvas and the roster
- **GIVEN** an own fleet whose burn's arrival time has already passed and
  whose arrival has not yet been settled by any other read
- **WHEN** the space view's own-fleets read completes
- **THEN** the canvas and the roster both show that fleet as arrived and
  attached, with no state in which one shows it burning while the other shows
  it docked

#### Scenario: A failed interior read shows a retriable error in the canvas region
- **WHEN** the interior read fails
- **THEN** the canvas region shows an error state carrying the underlying
  error message when available
- **AND** a retry affordance is offered that refetches the interior

#### Scenario: A failed interior read leaves the fleet-state-anchored commands usable
- **GIVEN** an acting fleet in one of the three states that anchor these
  commands — docked at a station, attached to a lane-gate body, or under way
  on a burn — no two of which one fleet can occupy at once
- **WHEN** that same fleet is rendered once with a healthy interior read and
  once with a failed one
- **THEN** the set of fleet-state-anchored commands offered is identical
  across the two renders, with the fleet roster and the
  `docked-fleet-actions` panel mounted in both
- **AND** the healthy render offers at least the commands that state anchors
  — sell and refuel when docked at a station, hold or release whenever the
  fleet's park mode offers one, jump when attached to a lane-gate body, cut
  drive and stop while under way — so an implementation that offers a command
  in neither render fails this scenario rather than satisfying it

#### Scenario: A failed interior read withdraws the mine offer without misreporting the body
- **WHEN** the interior read fails while the acting fleet is docked to a
  resource-bearing body
- **THEN** the mine offer is not shown, and what is shown attributes its
  absence to the failed read and offers the same retry — never a statement
  that the body carries no resources

#### Scenario: A failed own-fleets read shows a retriable error in the fleet panel
- **WHEN** the own-fleets read fails while the interior read succeeds
- **THEN** the fleet panel region shows an error state with its own retry
  affordance
- **AND** the canvas continues to render the system's bodies, lane gates, and
  contacts, with no own-fleet marks

#### Scenario: A failed station read withdraws the station-anchored offers without misreporting the system
- **WHEN** the station read fails while the acting fleet is parked in the
  open system
- **THEN** the sell and refuel offers are not shown, and what is shown
  attributes their absence to the failed read and offers a retry that
  refetches the station — never a statement that the system has nothing to
  trade with
- **AND** the canvas keeps rendering, and the fleet's cut-drive, stop, hold,
  release, and jump commands stay invokable

#### Scenario: A system with no station shows no station error
- **WHEN** the station read resolves with no station for the open system
- **THEN** the sell and refuel offers are absent with no error state and no
  station retry affordance shown

#### Scenario: A failed market-board read withdraws the sell offer but not the refuel offer
- **WHEN** the market price board read fails while the station read succeeds
  and the acting fleet is docked at that station with cargo aboard
- **THEN** the sell offer is not shown and its absence is attributed to the
  failed read, with a retry
- **AND** the refuel offer is still shown, its cost preview computed from the
  fuel price served on the fleet's own read

#### Scenario: An unresolved credit balance withdraws the readout, not the verbs
- **WHEN** the corporation session read has not resolved or has failed while
  the acting fleet is docked at a station with cargo aboard
- **THEN** the credit balance readout shows an explicit unavailable
  indication rather than a figure
- **AND** the sell and refuel offers remain invokable

#### Scenario: Loading persists through first frame after data arrives
- **WHEN** the interior read has completed and the view's rendering context is
  available and uninterrupted, but it has not yet produced its first frame
- **THEN** the loading placeholder remains shown rather than an empty or
  black canvas

#### Scenario: An unsupported rendering context takes precedence over the loading placeholder
- **WHEN** the interior read has completed but the view's rendering context
  cannot be created
- **THEN** the view's canvas region shows the unsupported state, not the
  loading placeholder
