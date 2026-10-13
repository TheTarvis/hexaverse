## Why

The refreshed planetary scene still represents own fleets as spheres and stations as faceted placeholders. The approved reference calls for recognizable metallic spacecraft and orbital structures; one model of each establishes that visual language in actual gameplay.

## What Changes

- Render own-fleet marks as an original compact utilitarian ship exemplar and served station bodies as a ring-and-hub station with layered structure.
- Preserve published positions, fleet mode and acting cues, station selection, picking envelopes, contact privacy and the existing camera/HUD.
- Integrate locally hosted ship/station model assets, with immediate fallback during loading or failure, bounded model complexity and explicit resource reuse/disposal.
- Evaluate the connected Meshy workflow for creating the first actual assets; generation-cost approval is handled separately before any billable call.
- Add a selected/inspected ship or station detail preview below its name: a 180–220 CSS-pixel-tall real 3D view of the same local map asset, fixed initial three-quarter pose, dedicated lighting and transparent background.
- Extend the existing fleet chevron menu with an explicit Inspect current fleet action that opens a separate nonmodal inspector without switching fleets or issuing commands.
- Include current-system own fleets in the Objects count, search and Fleets group, opening shared ship previews and served details without making the inspected fleet acting or a burn target.
- Withdraw stale fleet rows/details on unavailable reads, departure or removal while preserving available body/station browsing and the chevron inspection path.
- Support isolated pointer rotation and keyboard-equivalent orientation controls; keep facts and actions usable during loading, failure or GPU unavailability, and release hidden preview resources.
- Verify geometry and integration with scenario-derived tests, plus real browser captures at gameplay and close zoom.
- Complete the authorized archive compatibility repair: use the existing shared tonnage formatter for storyboard free hold and refresh only valid non-player-facing formatter-guard anchors/exceptions. This enforces existing figure-formatting behavior without changing its rules.
- Correct obsolete backend test fixture assumptions after the user-confirmed station-adjacent spawn change, explicitly arranging stationary/unattached/hostless scenarios without weakening behavior assertions. Reconcile the obsolete spawn/reachability contract with station attachment and fix only the independently confirmed concurrent-interior winner projection omission causing bootstrap HTTP 500.
- Make concurrent missing-hull seed attempts converge on one atomically created starter hull, returning the persisted winner without overwriting existing movement or fuel; preserve exactly-once starting grants.
- Defer hull catalogs, weapons, asteroid models, HUD redesign and runtime dependence on a generation service.

## Impact

- Affected specs: `system-space-view` (distinct additive requirements), `system-console` (narrow fleet-inspection menu carveout preserving switching behavior), `corporation-spawn` (user-confirmed station spawn), `system-interior` (concurrent winner projection parity).
- Affected code: `frontend/components/space/webgl/`, selected-object and own-fleet inspection surfaces under `frontend/components/space/`, and focused renderer/browser tests.
- Depends on the present scene-art integration from active `refresh-system-scene-art`; preserve that uncommitted work and its separate archive status.
- Existing normative dependency for archive repair: `figure-formatting` / A Player-Facing Figure Is Produced Only By the Shared Formatter; no delta to that capability.
- No API shape, saved-data migration or simulation-rule change; backend repairs are limited to concurrent interior projection parity and atomic starter-hull creation; no new operational properties inferred from model appearance.
