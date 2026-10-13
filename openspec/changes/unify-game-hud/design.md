## Context
The user requested shared components, not two independently styled HUDs.

## Decisions
Create presentation-only HudRoot, HudPanel, HudHeading and HudColumn components under components/hud. Shared CSS owns panel materials, controls and typography. Existing domain components retain data and actions. Galaxy and system compose those same components with their own content and positioning. Navigation uses the same panel with a navigation variant. Solar onboarding and console-specific layout remain local. Preserve Catalyst controls and existing test IDs.

## Risks / Trade-offs
Columns must scroll without blocking canvas gestures outside panels. On narrow galaxy screens, use two bounded columns; navigation keeps its existing dock clearance. No gameplay or persistence changes.
