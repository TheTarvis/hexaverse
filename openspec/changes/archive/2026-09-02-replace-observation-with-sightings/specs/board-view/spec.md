## ADDED Requirements

### Requirement: Jump Commit
The system SHALL, when the jump command is invoked for a fleet attached to
a lane-gate body, submit a jump order for that fleet naming that gate's
lane id, resolved from a source that is neither filtered by nor derived
from the corporation's charted-lane set and that is available for a fleet
attached to a gate in any system — the open interior read's own gate body
(`system-interior`: *Lane-Gate Bodies Carry Their Lane Id*) when the fleet
is on the open board, and the fleet's own read (`fleet-movement`: *Fleet
Read Serves the Attached Gate's Lane Id*) otherwise — with no charted-lane
condition and no second read. The server's distinguishable jump-rejection
reasons include, at minimum: not attached to the named gate; already in
lane transit; lane not incident to the fleet's current system; and the
destination's lane horizon could not be materialized (retryable). A jump
against a fleet the requester's corporation does not own is deliberately
NOT among them: it is a bare `404` indistinguishable from a nonexistent
fleet (`fleet-movement`: *Fleet Command Endpoints Are Restricted to the
Owning Corporation*), and therefore falls to the generic fallback copy
rather than to a mapped reason. On success it SHALL show a success toast,
and on failure an error toast whose copy is mapped from the server's
distinguishable rejection reason (`board-view`: *Rejection Reasons Map to
Player-Facing Copy, Not Raw Server Text*), never the raw reason string,
leaving the fleet's row unchanged. The command SHALL NOT be a no-op or a
refusal for any gate the interior read served.

#### Scenario: Invoking jump submits the attached gate's lane
- **GIVEN** a fleet attached to a lane-gate body carrying `laneId` on the
  open interior read
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** a jump order is submitted for that fleet naming that `laneId`

#### Scenario: A gate whose lane the corporation has not charted still commits
- **GIVEN** a corporation with no charted lanes and a fleet attached to a
  lane-gate body
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** the jump order is submitted, not refused client-side

#### Scenario: A fleet attached to a gate in another system still commits
- **GIVEN** the board for system A is open and an own fleet is attached to
  a lane-gate body in system B
- **WHEN** the jump command is invoked on that fleet's roster row
- **THEN** a jump order is submitted naming that fleet's own gate's lane
  id — never system A's like-named gate, and never a client-side refusal

#### Scenario: A failed jump commit toasts the reason
- **WHEN** the jump command fails (for example: not attached, already in
  lane transit)
- **THEN** an error toast surfaces mapped, player-facing copy for the
  server's rejection reason and the fleet's row is unchanged

#### Scenario: A jump against a fleet the requester does not own toasts generically
- **WHEN** the jump command is invoked against a fleet the requester's
  corporation does not own
- **THEN** the generic fallback toast is shown, with no copy that would
  distinguish the fleet from one that does not exist

#### Scenario: A destination-not-ready rejection toasts as retryable, not generically
- **WHEN** the jump command fails with the server's
  destination-lane-horizon-could-not-be-materialized reason
- **THEN** the error toast surfaces that reason's own mapped copy, telling the
  player the jump can be retried — not the generic fallback used for a
  response carrying no distinguishable reason

#### Scenario: A failure with no distinguishable reason still toasts safely
- **WHEN** the jump command fails with a response carrying no mapped
  rejection reason (for example a **bodyless** `5xx`)
- **THEN** a generic, non-technical error toast is shown and the fleet's
  row is unchanged

### Requirement: Burn Command Targets a Selected Lane-Gate Body Like Any Other Body
The system SHALL, when a lane-gate body is the current board selection,
allow the burn command to be invoked and submit an order naming that body
— through the exact same command path used for a planet, belt, or any
other selectable body, with no lane-gate-specific branch and no distinct
refusal copy for a gate target (gates are bodies — `docs/plans/
continous_space/decisions.md`: "you dock at bodies, mine at bodies,
stations and gates ARE bodies"). This requirement is satisfied by unifying
the two into one command path, not by adding a working case alongside an
unremoved gate-specific one. Unifying the selection kinds SHALL NOT
change what a selected lane-gate body presents: the facts panel SHALL
continue to describe a selected gate (its destination system and its
dock-then-jump instruction), and the gate's drawn mark SHALL continue to
show the selected state.

#### Scenario: Commanding a burn toward a selected lane-gate body submits an order
- **GIVEN** a lane-gate body is the current board selection
- **WHEN** the burn command is invoked
- **THEN** a burn order is submitted naming that gate body's body id — the
  same id that fleet's `attachedTo` reports once it arrives — exactly as
  for a selected planet or belt

#### Scenario: Attachment from a gate-targeted burn makes the jump command available
- **GIVEN** a fleet burns toward a selected lane-gate body and arrives
  attached to it
- **WHEN** that fleet's roster row is shown
- **THEN** the jump command becomes available for that fleet (`board-view`:
  *Jump Commit*)

#### Scenario: No gate-specific refusal copy exists
- **WHEN** the burn command is invoked with a lane-gate body selected
- **THEN** no refusal message is shown and an order is submitted — the
  "select a body to target first" refusal is reachable only from an empty
  or bare-cell selection

#### Scenario: A selected gate still shows its facts and its selected mark
- **WHEN** a lane-gate body is the current board selection
- **THEN** the facts panel describes that gate, naming its destination
  system, and the gate's drawn mark shows the selected state

#### Scenario: No gate-specific selection branch survives the unification
- **WHEN** the board's selection model and its burn-command path are
  inspected
- **THEN** no lane-gate-specific selection kind and no gate-aware command
  branch exists — a selected gate reaches the order mutation through the
  identical code path a selected planet does — a gate-aware lookup used
  only to present a selected gate's facts and its drawn mark is not such
  a branch
