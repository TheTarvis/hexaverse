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
