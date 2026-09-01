## MODIFIED Requirements

### Requirement: Mine Command Requires Fleet Ownership
The system SHALL commit a mine run only for the fleet named by `:fleetId`
when the requesting account's living corporation (`common.ActorCorp`) owns
that fleet, rejecting a request from any other corporation — and any
unauthenticated request — before any other precondition check, creating no
action and applying no lode delta or cargo credit. Existence is hidden: a
foreign or unknown fleet returns `404 Not Found`, matching the fog
convention `fleet-movement`'s read endpoints already use for foreign fleets
outside coverage. This requirement predates `fleet-movement`'s own
ownership check and is the same rule, stated independently: at the time
mine shipped, the sibling movement-command endpoints
(orders/cancel/cut-drive/stop/jump) accepted any authenticated caller
regardless of ownership — a gap `fleet-movement`'s "Movement Command
Endpoints Enforce No Fleet Ownership" recorded as open — and mine closed
the gap at its own endpoint rather than inheriting it, because claiming a
foreign fleet's movement slot to mine is a resource-griefing surface (locks
the victim in place, forces cargo into its hold, can consume a contested
lode on its behalf), not a reversible reposition (see design.md Decision
10). `replace-observation-with-sightings` subsequently closes that sibling
gap too, under `fleet-movement`'s "Fleet Command Endpoints Are Restricted
to the Owning Corporation"; mine's own ownership check, stated here, is
unchanged by that later change.

#### Scenario: An unauthenticated mine request is rejected
- **WHEN** `POST /v1/fleets/:fleetId/mine` is called with no valid Firebase
  bearer token
- **THEN** the response is `401 Unauthorized` and no action is created

#### Scenario: A foreign corporation cannot mine with another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/mine`
- **THEN** the response is `404 Not Found`, no action is created, no lode
  delta is appended, and F's cargo and movement slot are unchanged

#### Scenario: The owning corporation may mine its own fleet
- **WHEN** the requesting account's living corporation owns fleet F and all
  other mine preconditions hold
- **THEN** the run commits normally
