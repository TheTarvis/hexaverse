## REMOVED Requirements

### Requirement: No Caller-Identity Binding on Action Endpoints
**Reason**: Superseded — design.md Decision 21 closes this authorization
defect in the same change that closes its sibling on `fleet-movement`'s
five movement-command endpoints: closing one side alone would leave a
bypass to the same movement-channel slot reachable through this
capability's own `/actions/:id/cancel`, which reads as fixed while staying
open. Every "any authenticated caller can..." scenario this requirement
recorded is no longer true.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Action Endpoints Are Restricted to the Owning Corporation
The system SHALL, for `GET /v1/actions?actor=<id>`,
`GET /v1/actions/:actionId`, `POST /v1/actions/:actionId/acknowledge`, and
`POST /v1/actions/:actionId/cancel`, resolve the named actor's (for the two
action-id-scoped endpoints, that action's own actor's) owning corporation
and compare it against `common.ActorCorp(c)` before serving or acting,
responding `404 Not Found` — not `403` — when they do not match or when the
requester has no corporation, matching the absence semantics
`fleet-movement`'s own movement-endpoint closure uses for the identical
reason: a foreign actor is indistinguishable from a nonexistent one, and a
`403` would itself confirm the actor exists (design.md Decision 21). This
closes the sibling half of the authorization defect `fleet-movement`'s five
movement-command endpoints close in the same change — closing only those
five would leave a bypass to the same movement-channel slot through this
capability's own cancel endpoint.

#### Scenario: A foreign corp cannot list another actor's inbox
- **WHEN** an authenticated account whose corporation does not own actor F
  calls `GET /v1/actions?actor=F`
- **THEN** the response is `404 Not Found` and no action belonging to F is
  returned

#### Scenario: A foreign corp cannot fetch a single action by id
- **WHEN** an authenticated account whose corporation does not own action
  A's underlying actor calls `GET /v1/actions/A`
- **THEN** the response is `404 Not Found`

#### Scenario: A foreign corp cannot acknowledge another actor's action
- **WHEN** an authenticated account whose corporation does not own action
  A's underlying actor calls `POST /v1/actions/A/acknowledge`
- **THEN** the response is `404 Not Found` and action A's acknowledgment
  state is unchanged

#### Scenario: A foreign corp cannot cancel another actor's action
- **WHEN** an authenticated account whose corporation does not own action
  A's underlying actor calls `POST /v1/actions/A/cancel`
- **THEN** the response is `404 Not Found` and action A continues running,
  unaffected

#### Scenario: A corpless requester is rejected the same way
- **WHEN** an authenticated but corpless account calls any of these four
  endpoints against an existing actor or action
- **THEN** the response is `404 Not Found`

#### Scenario: The owning corporation's own requests still succeed
- **WHEN** an authenticated account whose corporation owns actor F calls
  `GET /v1/actions?actor=F`, or owns action A's underlying actor and calls
  `GET /v1/actions/A`, `POST /v1/actions/A/acknowledge`, or
  `POST /v1/actions/A/cancel`
- **THEN** each call succeeds exactly as it did before this ownership check
  was added
