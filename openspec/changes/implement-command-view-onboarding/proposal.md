## Why
The approved Coming Online storyboard establishes a fleet-command game presentation and a guided first movement and mining sequence. The live system currently exposes flat utility panels and does not implement that guide.

## What Changes
- Apply the command-view visual hierarchy to the live system while retaining existing controls, fleet switching, quote safety, and console behavior.
- After a successful wake, select and focus the returned starter fleet and offer dismissible recovery transmissions for movement and mining.
- Track advisory tutorial progress per corporation in this browser; confirm movement from a fresh attached fleet read and mining from the accepted action’s completed server record and cargo.
- Use actual visible bodies and resources; never introduce the prototype’s fictional planet or estimates into live gameplay.

## Impact
- Affected specs: command-onboarding (new), system-space-view (camera entry exception).
- Affected code: frontend wake flow, system view, stage camera, fleet action feedback, action read service and onboarding state.
- Backend rules, permissions, and gameplay rewards remain unchanged.
