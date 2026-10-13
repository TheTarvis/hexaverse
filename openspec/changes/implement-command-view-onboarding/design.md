## Context
The user approved the full-screen command storyboard, including first-fleet focus, short transmissions, and movement then mining checks. Existing uncommitted console changes must be preserved.

## Goals / Non-Goals
Bring the approved presentation and guide into real gameplay. Retain all existing commands and the current WebGL scene; no engine replacement, invented planetary data, gameplay locks, or rewards.

## Decisions
- The existing service hooks continue to own every gameplay mutation. The guide selects targets and observes accepted commands rather than adding a second command path.
- Start only from a successful spawn response. Store a versioned advisory record keyed by corporation id, including starter fleet/system, chosen target, accepted movement, mining action id and pre-mine resource cargo. No account ids or tokens are stored. Existing players without a record are not enrolled automatically.
- Local storage preserves progress on this browser only. Storage failure falls back to memory for the session and does not block play. Validate parsed records and reject wrong-scope or malformed entries.
- Select a visible non-station resource-bearing body other than the initial attachment. If no known mineable destination exists, direct the player to the existing scan console instead of claiming hidden resources. Re-evaluate on refreshed interior reads. Targets are pinned once picked, never silently changed during flight.
- Movement requires an accepted burn for this fleet and target followed by a fresh parked attachment to that target. ETA alone cannot complete it. Other fleets, interrupted burns, failed reads and navigation cannot complete a check.
- Record the mine action id on accepted mining at the guided destination. Read that exact action through the existing authenticated action endpoint, with a factory query key; confirm only done/non-fizzled mine plus at least one tonne of increased cargo of the chosen kind on the starter fleet. A cancelled/failed mine remains retryable. Suggest an editable ten-tonne sample, capped by served free hold; this is a tutorial suggestion, not a client-side minimum. Live verification caught that a one-tonne suggestion falls below the server's current five-tonne minimum.
- Render guidance only for the starter fleet in its home system. Fleet switching remains available. A close control dismisses the guide permanently for this corporation on this browser.
- Initial camera focus is a one-shot request scoped to the wake record and stage mount; subsequent refetches do not fight player camera input. Manual recenter still returns to the star. Explicitly selecting the tutorial destination also requests a one-shot camera reframe to its currently drawn body position; ordinary selection and refetch retain their existing behavior.
- Scoped command-view styling uses dark space and cyan signals as explicitly approved art direction, while preserving panel controls, live regions, and console layout lanes.

## Risks / Trade-offs
Tutorial completion is advisory and browser-local, not an account achievement. A new device does not resume it. The procedural world may require a scan before a resource-bearing destination is known. Existing server command rejections remain visible and retryable.

Mining reports use `reasonCode: clean` on success (unlike scans). Accept that code or its legacy omission alongside cargo evidence; cancelled, clamped and failed runs return to the mining check. The fleet roster reads only running-action list keys, excluding exact-action detail objects from its cache sweep.

## Migration Plan
No backend migration. New wake responses enroll this browser. Preserve previously uncommitted console behavior and verify its existing tests.

## Open Questions
None blocking this approved implementation. Server-synchronized tutorial history is a later feature.

## Resource-loop extension
Guide version 2 extends extraction completion through return, returning, sell, refuel and done. The existing storage key remains readable; version-1 undismissed done migrates to return, and dismissed remains dismissed. The selected station id is persisted independently of the original mining host. Return burns record departure time, and the existing fleet reconciliation confirms parked attachment from fresh telemetry. Existing sell/refuel controls report authoritative success receipts; matching fleet, station, resource and positive settlement/fuel gain advance the guide. No balance inference, additional gameplay endpoint, or simulated price is used. Missing station telemetry withholds the target and explains the blocked lesson.

## Station-first opening (guide version 3)
New spawns provision the station before creating the starter hull. The fleet service creates a free orbit park attached to the station using the normal insertion geometry; retries return an existing fleet unchanged. Legacy stacks without a station service retain their prior seed method. There is no relocation migration.

The browser guide progresses wake → objects → station → scan → scanning → contacts → target before the existing flight and resource loop. Version-2 target records migrate to objects; active travel and resource work remain unchanged. Both Objects entry points advance the station introduction. The scan receipt exposes the owner's activeScanId, which the guide persists and polls through the existing authenticated action read. Only the exact fleet/system scan finishing without a reason code reaches contacts; failed/cancelled scans return to scan. Contacts refreshes the interior before choosing a disclosed resource-bearing destination.

The storyboard simulates the same station and scan opening before its existing travel snapshots. The legacy live flight cards remain deliberately hidden pending the separately requested control rebuild.
