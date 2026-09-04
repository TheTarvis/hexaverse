## MODIFIED Requirements

### Requirement: Successful Spawn Hands Off to the Home Board
The system SHALL, on a successful wake-up submission, cause the wake gate
to re-evaluate so the newly woken corporation and its first fleet become
visible without a manual reload, record the new home system's id as a
wake-focus hint for `galaxy-view`'s later use, and navigate directly to
that home system's space-view route (`system-space-view`) — never to the
galaxy view first.

#### Scenario: A successful spawn routes to the new home system's board
- **WHEN** the wake-up flow's spawn call succeeds with a home system id
- **THEN** the wake gate re-evaluates so the new corporation and fleet
  appear, and the app navigates to that home system's space-view route

#### Scenario: The wake-focus hint is recorded for the galaxy view
- **WHEN** a successful spawn returns a home system id
- **THEN** that id is recorded as a wake-focus hint (best-effort; its
  absence is non-fatal) for `galaxy-view` to consume if the player later
  opens the galaxy

#### Scenario: A malformed success response does not leave the flow silently stuck
- **WHEN** a wake-up spawn call succeeds but the response omits a home
  system id
- **THEN** the corporation/fleet cache invalidation and the wake-focus-hint
  write are withheld (the wake gate does NOT re-evaluate and does not flip
  away from the wake-up flow on this response), and the flow shows a
  retriable error while remaining mounted and resubmittable

#### Scenario: A resubmission after a transient malformed response succeeds normally
- **WHEN** the player resubmits from the wake-up flow after a malformed
  success response caused by a transient omission (the resubmission's
  response includes the home system id)
- **THEN** the resubmission rides `corporation-spawn`'s idempotent-spawn
  guarantee (the same corporation and home system already created), and —
  being well-formed — the gate re-evaluates, the wake-focus hint is
  recorded, and the player is routed to the home system's space view
  normally

#### Scenario: Resubmitting after a client-side timeout does not mint a second hull
- **WHEN** the wake-up flow's spawn call times out client-side after the
  backend has already created the corporation, and the player resubmits
- **THEN** the resubmission returns the same existing corporation and home
  system (per `corporation-spawn`'s idempotent spawn), not a second hull
