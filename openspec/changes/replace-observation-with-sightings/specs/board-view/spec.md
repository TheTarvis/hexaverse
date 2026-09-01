## ADDED Requirements

### Requirement: Jump Commit
The system SHALL, when the jump command is invoked for a fleet attached to
a lane-gate body, submit a jump order for that fleet naming the `laneId`
the open interior read carries on that gate body (`system-interior`:
*Lane-Gate Bodies Carry Their Lane Id*), with no charted-lane condition and
no second read to resolve the id; on success it SHALL show a success
toast, and on failure an error toast carrying the server's rejection
reason, leaving the fleet's row unchanged. The command SHALL NOT be a
no-op or a refusal for any gate the interior read served.

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

#### Scenario: A failed jump commit toasts the reason
- **WHEN** the jump command fails (for example: not attached, already in
  lane transit)
- **THEN** an error toast surfaces the server's rejection reason and the
  fleet's row is unchanged

### Requirement: Burn Command Targets a Selected Lane-Gate Body Like Any Other Body
The system SHALL, when a lane-gate body is the current board selection,
allow the burn command to be invoked and submit an order naming that body
— through the exact same command path used for a planet, belt, or any
other selectable body, with no lane-gate-specific branch and no distinct
refusal copy for a gate target. This requirement is satisfied by
unifying the two into one command path, not by adding a working case
alongside an unremoved gate-specific one (gates are bodies — `docs/plans/
continous_space/decisions.md`: "you dock at bodies, mine at bodies,
stations and gates ARE bodies"). Unifying the selection kinds SHALL NOT
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
