## ADDED Requirements

### Requirement: Consistent Game HUD
Galaxy and solar-system views SHALL use the same HUD presentation components for panel surfaces, headings and command columns. Fleet, market and navigation surfaces SHALL retain the same visual treatment between views while exposing the commands appropriate to their context.

#### Scenario: Switch between galaxy and local space
- **WHEN** the player switches between galaxy and solar-system views
- **THEN** fleet panels and navigation retain their shared materials, typography and control treatment
- **AND** each view retains its own selection and command behavior

### Requirement: Reachable Overlay Controls
HUD panels SHALL preserve keyboard access, error states and scrolling on narrow viewports. Space outside HUD panels SHALL remain available for camera interaction.

#### Scenario: Narrow viewport
- **WHEN** HUD content exceeds the available column height
- **THEN** its controls remain reachable by scrolling without document horizontal overflow

#### Scenario: Renderer unavailable
- **WHEN** the renderer is unavailable
- **THEN** existing fallback information and permitted HUD actions remain available
