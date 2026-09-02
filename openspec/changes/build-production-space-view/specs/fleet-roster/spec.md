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
