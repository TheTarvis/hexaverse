# Galaxy View — Delta: The Endless Galaxy

## ADDED Requirements

### Requirement: Bridge Lane Rendering
The galaxy view SHALL render lanes carrying the `bridge` marker visually
distinct from ordinary lanes (a fainter/differentiated style), so
void-crossing routes read differently from local roads, while treating them
identically for interaction (selection, route preview, travel commit).

#### Scenario: A bridge lane renders distinctly
- **WHEN** the galaxy view renders a charted lane whose `bridge` flag is set
- **THEN** its visual style differs from ordinary charted lanes

#### Scenario: A bridge lane behaves like any lane for travel
- **WHEN** the user previews and commits a route that rides a bridge lane
- **THEN** the gesture, preview, and commit behave exactly as over an
  ordinary lane
