## ADDED Requirements

### Requirement: A Served Burn Solve Refusal Reads as Player-Facing Copy on Commit and on Every Stop Surface
The system SHALL display each burn solve refusal served by `fleet-movement` as mapped player-facing copy on the burn commit and on every surface that presents a stop-in-place refusal (the fleet actions panel's Stop and the galaxy fleet roster's Stop), never as the raw server reason, with the same line for the same reason on every surface. The lines SHALL be exactly:
- origin inside the star clearance: "This fleet is too close to the star to take a course from here right now."
- destination inside the star clearance: "That destination is too close to the star to fly to." (the existing line, unchanged)
- minimum arc: "That burn is too short to fly. Choose a target farther away."
- target body absent from the system: "That body is not in this system. Pick another target."

Showing a refusal in the burn preview's no-quote state is not covered by this requirement.

#### Scenario: A stop refused for the clearance shows the same line a burn refused for it shows
- **WHEN** stop-in-place is refused with the origin reason from the fleet actions panel, from the galaxy fleet roster, and a burn commit is refused with the origin reason
- **THEN** each displays the origin line above verbatim and none displays the raw reason string

#### Scenario: Each of the four refusals displays its own line
- **WHEN** the four refusal reasons are displayed in turn on a burn commit
- **THEN** the four lines above are shown verbatim, pairwise different, none of them the generic failure line and none the line for an absent fleet or destination

#### Scenario: A stop refused on the galaxy roster does not toast the raw reason
- **WHEN** stop-in-place is refused with the destination reason from the galaxy fleet roster
- **THEN** the toast shows the destination line and does not contain `fleet:` or the raw reason text
