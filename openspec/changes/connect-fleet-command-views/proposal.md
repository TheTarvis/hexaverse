## Why
Fleet selection is local to each view and default system selection excludes transit fleets, leaving the command HUD blank during travel. The galaxy needs an actionable selected-fleet surface.

## What Changes
- Share corporation-scoped fleet selection across routes and reloads in this browser session.
- Show selected fleet vitals on the galaxy and a shared route/location panel in both views.
- Offer focus and system/destination navigation while withholding local commands for remote or jumping fleets.

## Impact
- Affected specs: fleet-command-continuity
- Affected code: galaxy/system views, fleet components, shared HUD and selection hook.
