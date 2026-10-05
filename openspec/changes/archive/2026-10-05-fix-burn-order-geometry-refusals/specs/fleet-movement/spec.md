## ADDED Requirements

### Requirement: A Burn Solve Refused for the Star Clearance Is Served as 409 Naming Origin or Destination
IF an in-system burn is refused because an endpoint is at or inside the star-clearance radius, THEN the system SHALL serve the refusal as `409 Conflict` with a reason in the response body's `error` field, on `POST /v1/fleets/:id/orders`, `POST /v1/fleets/:id/orders/preview` and the stop-in-place route alike, with the same status and the same reason on every route that can raise it. The reason SHALL state whether the fleet's own position (the origin) or the solved destination is the endpoint at or inside the clearance. The destination is the solved intercept of a body target, the point of a point target, or the lead point of a stop. When the origin is at or inside the clearance the origin reason SHALL be served, whatever the destination, except when the target body is absent from the system (see *Burn Solve Refusals Are Decided in a Fixed Order*). The distinction SHALL be made from geometry alone: the system SHALL NOT compare the target's identity with the star's, so an order naming the star and an order naming any other body or point whose destination is at or inside the clearance carry the same destination reason. The refusal SHALL add no field to the response body.

#### Scenario: A body whose solved standoff point is inside the clearance is refused with the destination reason
- **GIVEN** a body table, a fleet position outside the clearance and an injected world time for which the real solve of an order naming a body is refused for its destination (the instant is located beforehand by sweeping the injected clock against the same solver and is fixed in the test)
- **WHEN** that order is committed
- **THEN** the response is `409` with the destination reason
- **AND** the fleet's stored state and fuel are unchanged

#### Scenario: A preview of the same order is refused with the same status and the same body
- **GIVEN** the body table, fleet and world time of the preceding scenario
- **WHEN** a preview of the same order is requested
- **THEN** the response is `409` with the byte-identical `error` reason the commit produced

#### Scenario: An order naming the star is refused by the same destination reason as any other clearance refusal
- **GIVEN** a fleet outside the clearance
- **WHEN** an order, and a preview, naming the star are submitted
- **THEN** each response is `409` with the same destination reason a point target inside the clearance produces
- **AND** no comparison of the target's identity with the star's is made

#### Scenario: A point target at or inside the clearance is refused with the destination reason
- **GIVEN** a fleet outside the clearance
- **WHEN** an order, and a preview, naming a point whose distance from the star is below the clearance radius, and again exactly equal to it, are submitted
- **THEN** each response is `409` with the destination reason

#### Scenario: A fleet whose own position is inside the clearance is refused with the origin reason
- **GIVEN** a fleet whose position is inside the star-clearance radius and a point target outside it
- **WHEN** an order, and a preview, are submitted for that fleet
- **THEN** each response is `409` with the origin reason
- **AND** that reason differs in text from the destination reason

#### Scenario: A fleet inside the clearance ordering a destination also inside it is refused with the origin reason
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order, and a preview, naming the star are submitted for that fleet
- **THEN** each response is `409` with the origin reason and not the destination reason

#### Scenario: A stop whose origin is inside the clearance is refused with the origin reason
- **GIVEN** a fleet moving above the stop-in-place speed floor whose position is inside the clearance
- **WHEN** stop-in-place is submitted for it
- **THEN** the response is `409` with the origin reason
- **AND** the fleet's stored attachment, motion state and fuel are unchanged

#### Scenario: A stop whose lead point is inside the clearance is refused with the destination reason
- **GIVEN** a fleet moving above the stop-in-place speed floor, positioned 1.0 outside the clearance and heading straight at the star
- **WHEN** stop-in-place is submitted for it
- **THEN** the response is `409` with the destination reason
- **AND** the fleet's stored attachment, motion state and fuel are unchanged

### Requirement: A Burn Solve Refused for Too Short a Curve Is Served as 409 With Its Own Reason
IF the solve of an in-system burn yields a curve below the minimum arc length, THEN the system SHALL serve the refusal as `409 Conflict` with a reason in the response body's `error` field, on `orders` and `orders/preview`, with the same status and the same reason on both, and the reason SHALL differ in text from every star-clearance reason. The refusal SHALL NOT be served as a bodyless `5xx`. The refusal SHALL be decided by the solved curve's length alone: the system SHALL NOT refuse an order because its target is the body the fleet is docked at or orbits, and an order to that body whose solved curve is at or above the minimum SHALL commit as any other order.

#### Scenario: An order whose solved curve is below the minimum toward the fleet's own host is refused with the minimum-arc reason
- **GIVEN** a fleet parked in an orbit around a body, and an injected world time at which the real solve of an order naming that same body yields a curve below the minimum arc length (the instant is located beforehand by sweeping the injected clock against the same solver and is fixed in the test)
- **WHEN** an order, and a preview, naming that body are submitted
- **THEN** each response is `409` with the minimum-arc reason
- **AND** the two bodies are byte-identical

#### Scenario: An order to the fleet's own host whose solved curve is long enough commits
- **GIVEN** the fleet and body of the preceding scenario, at an injected world time at which the real solve of an order naming that body yields a curve at or above the minimum arc length
- **WHEN** an order naming that body is submitted
- **THEN** the order is accepted and its burn is stored, not refused

#### Scenario: A point closer than the minimum arc length is refused with the minimum-arc reason
- **GIVEN** a stationary fleet outside the clearance
- **WHEN** an order naming a point closer to the fleet than the configured minimum arc length is submitted
- **THEN** the response is `409` with the minimum-arc reason and not a clearance reason

### Requirement: A Burn Naming a Body Absent From the System Is Served as a Reason-Bearing 404
IF a burn order or preview names a target body id that is not in the system's body table, THEN the system SHALL serve `404 Not Found` with a reason in the response body's `error` field stating the body is not present in the system, on `orders` and `orders/preview` alike. This reason-bearing `404` SHALL differ in body from the bodyless `404` served for an unknown or foreign fleet. Absence SHALL be decided by the requested id's absence from the body table: a target that is present but whose parent chain names a missing body, and a fleet whose own stored host no longer resolves, are not covered by this requirement.

#### Scenario: A commit naming an absent body id is refused with a reason
- **WHEN** an order is committed naming a body id that is not in the fleet's system
- **THEN** the response is `404` with an `error` reason stating the body is not present in the system
- **AND** no burn is stored and no action is created

#### Scenario: A preview naming an absent body id is refused with the same reason
- **WHEN** a preview naming the same absent body id is requested
- **THEN** the response is `404` with the byte-identical `error` reason the commit produced

#### Scenario: An unknown or foreign fleet still answers a bodyless 404
- **GIVEN** four fleets owned by another corporation, arranged so that their owner would be served, respectively, the origin-inside refusal, the destination-inside refusal, the minimum-arc refusal and the absent-body refusal
- **WHEN** a foreign requester, and separately a requester with no corporation, submits to `orders` and `orders/preview` the request that would raise each fleet's refusal, and stop-in-place for the fleets on which stop can be refused, and the same requests for a fleet id that does not exist
- **THEN** every response is `404` with no body, byte-identical to the response for the nonexistent fleet id
- **AND** no clearance, minimum-arc or absent-body reason is served, and no fleet's stored record is changed

### Requirement: Burn Solve Refusals Are Decided in a Fixed Order
The system SHALL decide an in-system burn solve refusal in this order: first an absent target body, then an origin at or inside the star clearance, then a destination at or inside the star clearance, then a curve below the minimum arc length; the first that applies SHALL be the one served. A fault discoverable only in the solve itself, such as a present target body whose parent chain names a missing body, is therefore not reached for a fleet whose origin is inside the clearance, which is served the origin refusal.

#### Scenario: An absent body while the fleet is inside the clearance is refused as absent
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order, and a preview, naming a body id that is not in the system are submitted
- **THEN** each response is `404` with the absent-body reason and not the origin reason

#### Scenario: An origin inside the clearance outranks a destination or a short curve
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order naming a point outside the clearance, an order naming a point inside the clearance, and an order naming a point closer than the minimum arc length, are submitted
- **THEN** each response is `409` with the origin reason

### Requirement: Burn Solve Refusal Reasons Are Pairwise Distinct
The system SHALL serve burn solve refusal reasons whose text is pairwise distinct across the origin-inside-clearance refusal, the destination-inside-clearance refusal, the minimum-arc refusal and the absent-body refusal, so that each is distinguishable by its body and not merely by its status. Each reason SHALL be a fixed string: it SHALL NOT contain the requested body id, the requested point, any coordinate of the fleet, or a route-specific prefix, and it SHALL be identical on every route that can raise it. The origin reason SHALL contain the fragment `origin is at or inside`, the destination reason `destination is at or inside`, the minimum-arc reason `minimum arc length`, and the absent-body reason `target body is not present`; no reason SHALL contain another reason's fragment, and none SHALL contain the text `not found`.

#### Scenario: Four refusals yield four different reason bodies
- **GIVEN** one separately arranged fleet and order for each of the origin-inside, destination-inside, too-short and absent-body conditions
- **WHEN** each is submitted
- **THEN** the four `error` reason texts are pairwise different
- **AND** each differs from the generic bodyless `5xx` shape, which carries no body
- **AND** the absent-body reason is byte-identical for two different absent body ids

#### Scenario: No refusal reason contains another refusal's fragment, nor the generic not-found text
- **GIVEN** the origin, destination, minimum-arc and absent-body reasons
- **WHEN** each is matched by substring against the fragment of every other
- **THEN** each reason contains its own fragment and no other reason's fragment
- **AND** no reason contains the text `not found`

#### Scenario: The same refusal on commit, preview and stop carries the same reason
- **WHEN** the destination-inside refusal is served on a commit, a preview and a stop
- **THEN** the three `error` reasons are byte-identical, with none carrying a route-specific prefix

### Requirement: A Served Burn Solve Refusal Changes Nothing And Is Not An Error
IF a burn solve refusal named by this capability is served, THEN the system SHALL store no burn, create no action, claim no movement or sensor channel slot, debit no fuel for the refused order, and change no fleet attachment or park on account of it, and SHALL NOT write an error-level log entry for it. The system SHALL record each served refusal at a level below error, once per request, carrying the refusal cause (origin-inside-clearance, destination-inside-clearance, minimum-arc, absent-body), the route (order, preview, stop), the fleet id and the system id, such that served refusals are countable per cause and per route and distinguishable from internal faults, which are recorded at error level. The settlement of an already-due arrival, and on a commit the settlement of an elapsed station-keeping hold, which precede every solve, are not effects of the refusal and are unchanged by this requirement.

#### Scenario: Every served refusal leaves state and fuel unchanged
- **GIVEN** four separately arranged fleets, each with no due arrival and no elapsed station-keeping hold, a stored state, an empty action inbox and a known fuel level, set to be served respectively the origin-inside, destination-inside, too-short and absent-body refusals
- **WHEN** each is served its refusal on a commit
- **THEN** after each, that fleet's stored state, its action list, its channel slots and its fuel are identical to before

#### Scenario: A served refusal is recorded once by cause below error level
- **WHEN** each of the four refusals is served on every route that can raise it (origin and destination on commit, preview and stop; minimum-arc and absent-body on commit and preview)
- **THEN** the captured log contains exactly one entry for the request, below error level, naming the cause, route, fleet id and system id
- **AND** it contains no error-level entry for the request
- **AND** a body-table cycle on the same routes produces an error-level entry that names no refusal cause

### Requirement: Internal Faults on the Burn Routes Remain Server Errors
Except where *Burn Solve Refusals Are Decided in a Fixed Order* serves the origin refusal first, the system SHALL continue to serve a `5xx` for a fault on `orders`, `orders/preview` and the stop-in-place route that is not caused by the request or by the player's ordinary action, including an undecodable stored kinematic state, a body-table cycle, a target body that is present in the body table but whose parent chain names a body that is not, and a fleet whose own stored host no longer resolves, and SHALL log such a fault at error level.

#### Scenario: A body-table cycle is still a 5xx with an error log
- **GIVEN** a system whose body table contains a parent cycle
- **WHEN** an order is submitted that must resolve a body in it
- **THEN** the response is `5xx`
- **AND** an error-level log entry is written

#### Scenario: A fleet whose stored host no longer resolves is still a 5xx
- **GIVEN** a fleet whose stored host body id is absent from its system's body table
- **WHEN** an order is submitted for it
- **THEN** the response is `5xx` and not the absent-body `404`
- **AND** an error-level log entry is written

#### Scenario: A present target whose parent is missing is a 5xx, not the absent-body 404
- **GIVEN** a fleet outside the clearance, and a system whose body table holds a body whose stored parent id is not in the table
- **WHEN** an order, and a preview, naming that body are submitted
- **THEN** each response is `5xx` and not the absent-body `404`
- **AND** an error-level log entry is written
