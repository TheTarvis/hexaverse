## MODIFIED Requirements

### Requirement: Active and Here Highlighting
The system SHALL visually mark the row for the fleet the mounting view is
currently commanding (the active fleet), and SHALL mark a row as "here"
when its status resolves to the system currently open on the system space
view, if any.

#### Scenario: The active fleet's row is marked
- **WHEN** a fleet is the view's active/commanding fleet
- **THEN** its row is visually distinguished from the others

#### Scenario: A fleet in the currently open board is marked "here"
- **WHEN** the roster is mounted with a current system id and a fleet's
  status resolves to that same system
- **THEN** its row shows a "here" indicator

### Requirement: The Roster Row Is the Fleet Command Surface Where the Mounting View Provides None, Jump Gated by Attachment Alone
The system SHALL render fleet command controls on a roster row only when the
mounting view declares that the roster owns the fleet command surface, and
SHALL render none when the mounting view declares that it owns those commands
itself. Within any one view, each fleet verb SHALL resolve to exactly one
control per fleet, so a player is never offered two live controls for one verb
on one fleet and an automated selector never resolves a verb ambiguously. The
galaxy view mounts no command panel of its own and SHALL declare that the
roster owns the commands (`galaxy-view`'s *Jump Commit* remaining its own
surface's concern); the system space view mounts `system-space-view`'s command
panel and the `docked-fleet-actions` panel and SHALL declare that it owns the
commands, its roster rows rendering selection and status only.

WHERE the roster owns the command surface, the system SHALL offer on each
owned fleet's row the commands that kinematic state and attachment make valid:
burn SHALL be offered regardless of the fleet's current kinematic state; cut
drive SHALL be offered only while the fleet's effective kinematic state is a
burn; stop in place SHALL be offered only while the fleet's effective
kinematic state is a burn or a drift; and jump SHALL be offered whenever the
fleet is attached to a lane-gate body, with no charted-lane condition —
charting is map knowledge and a sellable intel product, never a permission
(`replace-observation-with-sightings` design.md Decision 2), and the server
grants jump-eligibility on attachment alone. A command not made valid by the
fleet's current state or attachment SHALL NOT be offered.

A mounting view that declares the roster owns the command surface SHALL supply
the means to commit every command the row then offers, and the roster SHALL
NOT render a command control it has no means to commit. No rendered command
control is inert under the player's hand.

#### Scenario: Burn is always available

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a roster row is shown for a fleet in any kinematic state (burn,
  park, or drift)
- **THEN** the burn command is offered on that row

#### Scenario: Cut drive is offered only while burning

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a fleet's effective kinematic state is a burn
- **THEN** the cut-drive command is offered on its row

#### Scenario: Cut drive is withheld outside a burn

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a fleet's effective kinematic state is a park or a drift
- **THEN** the cut-drive command is not offered on its row

#### Scenario: Stop in place is offered while burning or drifting

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a fleet's effective kinematic state is a burn or a drift
- **THEN** the stop-in-place command is offered on its row

#### Scenario: Stop in place is withheld while parked

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a fleet's effective kinematic state is a park
- **THEN** the stop-in-place command is not offered on its row, the fleet
  already having nothing to stop

#### Scenario: Jump is offered while attached to any lane-gate body

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a fleet is attached to a lane-gate body
- **THEN** the jump command is offered on its row, regardless of whether
  the corporation has charted that gate's lane

#### Scenario: Jump is withheld when not attached to a gate

- **GIVEN** a mounting view that declares the roster owns the fleet command
  surface
- **WHEN** a fleet has no `attachedTo` set, or is attached to a body that
  is not a lane gate
- **THEN** the jump command is not offered on its row

#### Scenario: The roster renders no commands on a view that owns them itself

- **GIVEN** a mounting view that declares it owns the fleet command surface
- **WHEN** a roster row is shown for a fleet in any kinematic state and with
  any attachment
- **THEN** no burn, cut-drive, stop, jump, or mine-cancel control is rendered
  on that row, and the row still renders its selection target and its status

#### Scenario: A verb offered by the mounting view is not also offered by the roster

- **GIVEN** the system space view, which declares it owns the fleet command
  surface, open with a burning own fleet
- **WHEN** the cut-drive and stop commands are located on screen
- **THEN** each resolves to exactly one control for that fleet, rendered by
  the mounting view's own command surface and not duplicated on the roster row

#### Scenario: No command control is rendered without a means to commit it

- **GIVEN** a mounting view that has not supplied the means to commit a
  command
- **WHEN** a roster row is shown for a fleet whose state would otherwise make
  that command valid
- **THEN** that command's control is not rendered, rather than rendered as a
  control whose activation does nothing

## RENAMED Requirements

- FROM: `### Requirement: The Roster Row Is the Fleet Command Surface, Jump Gated by Attachment Alone`
- TO: `### Requirement: The Roster Row Is the Fleet Command Surface Where the Mounting View Provides None, Jump Gated by Attachment Alone`
