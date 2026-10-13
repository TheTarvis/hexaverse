## Why
Galaxy and solar-system HUDs use different panel treatments despite sharing fleet and market components. System-only CSS overrides let their appearance drift.

## What Changes
- Share the HUD theme, panels, headings and scrollable columns across both views.
- Give navigation the same treatment on both routes and remove duplicated panel wrappers.
- Preserve view-specific commands, selection, errors and console behavior.

## Impact
- Affected specs: game-hud
- Affected code: frontend HUD, galaxy, space, fleet, market and navigation components.
