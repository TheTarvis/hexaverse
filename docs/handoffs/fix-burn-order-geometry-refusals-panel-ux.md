# fix-burn-order-geometry-refusals — UX panel findings

Reviewed within RULINGS 3, 4, 6, 7 (text reasons only; no wire fields) and not touching clear-burn-preview-on-commit.
Counts: BLOCKER 0, MAJOR 3, MINOR 2. Verdict: NEEDS SCENARIOS (one requirement-level fix, two task fixes).

## MAJOR 1 - Stop failures are rendered through the MINE copy table, so the new stop refusals never reach player copy
Evidence: frontend/components/space/FleetActionsPanel.tsx:583-585 (`stop.mutate(... reportFailure(mineErrorCopy(...)))`); MINE_COPY at frontend/lib/rejection-copy.ts:80-88 has no star-clearance, arc or absent-body entry, and its `not found` line reads "That fleet or body is not available." The change serves the same 409/404 reasons on stop (fleet-movement delta, stop scenario), but tasks 3.1/3.2 only touch BURN_COPY. Result: a stop refused for origin/lead-point clearance shows the generic failure with no next step; an absent-body reason cannot occur on stop, but any `not found` text would map to "body" wording.
Also: the live requirement (docked-fleet-actions spec.md:558-576) names mine/sell/refuel/hold/release and the burn command, NOT stop, so stop's mapping is unspecified.
Fix (task, plus one requirement scenario because stop is unnamed in the live list):

Tasks (replace 3.1/3.2 wording, no count change):
- [ ] 3.1 SDET: `rejection-copy.test.ts` cases: origin-clearance, minimum-arc and absent-body reasons map to three distinct lines; the destination line is unchanged; an absent-body reason is NOT caught by the generic `not found` line; and a stop failure with the origin or destination clearance reason renders the same line the burn path renders (component test on the stop button in FleetActionsPanel).
- [ ] 3.2 Dev: add the three BURN_COPY lines (wording below), each ABOVE the generic `not found` and above the `star clearance` needles as needed; route the Stop button's `onError` (FleetActionsPanel.tsx:583-585) through `burnErrorCopy`, not `mineErrorCopy`.

Spec (ADDED to fleet-movement delta, or MODIFIED docked-fleet-actions only if the writer prefers; ADDED here avoids touching a shared requirement):
```
### Requirement: A Served Burn Solve Refusal Reads as Player-Facing Copy on Commit, Preview and Stop
The system SHALL display each burn solve refusal named by this capability (origin inside the star clearance, destination inside the star clearance, minimum arc, body absent from the system) as mapped player-facing copy on the burn commit, and on the stop command, with the same line for the same reason on both, never the raw server reason. Each line SHALL say what the player can do next.

#### Scenario: A stop refused for the clearance shows the same line a burn refused for it shows
- **WHEN** stop-in-place is refused with the origin reason, and a burn commit is refused with the origin reason
- **THEN** the displayed text is the same mapped line on both and is not the raw reason string

#### Scenario: Each of the four refusals maps to a different line
- **WHEN** the four refusal reasons are displayed in turn
- **THEN** four pairwise different lines are shown, none of them the generic failure line
```

## MAJOR 2 - A preview that is refused is shown as "could not be solved" with Retry, but these refusals are deterministic
Evidence: frontend/components/space/SpaceCommandPanel.tsx:322-341 (noQuote shows "No quote - the preview could not be solved.", a "Retry quote" button) and :343-349 (burn stays committable, "Uncapped ..."). The delta makes preview return the same 409/404 as commit, so for these causes retrying can never succeed and the commit the player is then invited to press will be refused with the same reason. The player is told to retry something that cannot work and is offered an uncapped commit that must fail. (Rendering of the failed preview is system-space-view territory; I am NOT proposing a change to a requirement that clear-burn-preview-on-commit touches.)
Proportionate fix: task-only, no new requirement, no wire field (RULING 7): the preview error already carries the text in `error`.
Task (add as 3.3, or fold into 3.2 to hold count at 33 by merging; the writer chooses):
- [ ] 3.3 Dev: when the preview fails with one of the four mapped refusal reasons, show that reason's mapped line in the existing `preview-no-quote` slot instead of "the preview could not be solved", and do not offer `preview-retry` for it (transient failures keep Retry); test one refusal and one transient failure.
If the writer judges this to need a requirement, file it as a follow-up change against system-space-view after clear-burn-preview-on-commit archives, and record the Retry-on-deterministic-refusal gap in tasks as an accepted limitation.

## MAJOR 3 - Fragment matching can mis-route the new reasons; the reason texts must be pinned in the spec so the copy keys are stable
Evidence: rejection-copy.ts:56-62 first-match on `includes`; BURN_COPY needles `star-clearance`/`star clearance` (:72-73) and `not found` (:76). Backend precedent text: `space: endpoint at or inside the star-clearance radius` (backend/space/burn.go:178); `fleet: ... body %q not found` (backend/fleet/kinematic_decode.go:124).
Hazards:
1. The origin reason will almost certainly contain "star clearance" - the existing needle returns the DESTINATION line ("That destination is too close") for an origin refusal. Origin line must be matched first, so the origin and destination texts need distinguishing fragments that neither contains the other's.
2. An absent-body reason phrased "body ... not found in system" is swallowed by the generic `not found` line ("That fleet or destination is not available") - exactly the confusion the 404 split was meant to end.
3. The reason must not embed the raw body id into the fragment the copy keys on (ids vary; keep the key fragment constant).
Fix: add to the pairwise-distinct requirement a constraint, and one scenario.
```
#### Scenario: No refusal reason contains another refusal's key fragment, nor the generic not-found text
- **GIVEN** the origin, destination, minimum-arc and absent-body reasons
- **WHEN** each is matched by substring against the key fragment of every other
- **THEN** no reason contains another reason's key fragment
- **AND** the absent-body reason does not contain the text `not found`
```
(Backend design.md should choose fragments, e.g. origin "fleet position ... inside the star clearance", destination "destination ... inside the star clearance", arc "below the minimum curve length", absent "not present in this system". The absent-body wording above is deliberately "not present", matching the delta's own "not present in the system".) Task 3.2 already orders lines "so each matches before the generic line"; add the test in 3.1 asserting the real backend strings (import them or a shared fixture) so drift fails a test.

## MINOR 1 - Copy wording (UX supplies it, per 3.2); intent: what happened + what to do
Origin vs destination wording is the part with a real player difference: origin is the fleet's own situation, destination is a choice the player can change.
- Destination (existing, keep): "That destination is too close to the star to fly to." Suggest append: " Pick a point farther out." (changing existing copy touches shared contract - optional; leave as is if the writer wants zero shared edits.)
- Origin (new): "This fleet is too close to the star to take a course from here." Do NOT tell the player to 'move away' - they cannot (any order fails); say nothing actionable that is false. Safe next step: none beyond "try again from another position" is wrong too; recommend: "This fleet is too close to the star to take a course from here. Contact support if it stays stuck." Product call; with RULING 1 (a fleet may never be inside the clearance) this is a should-not-happen path, so a plain unactionable line is acceptable and honest. Flag the lack of a recovery action as accepted, tied to RULING 8's open items.
- Minimum arc (new): "That burn is too short to fly. Pick a point farther from the fleet." The docked-to-own-host case: "...or a different body." Use one line: "That burn is too short to fly. Choose a target farther away."
- Absent body (new): "That body is no longer in this system. Pick another target." 
Paste for 3.2 acceptance: lines carry a next step except the origin line, which states the situation only.

## MINOR 2 - Dock-to-own-host is an ordinary click; the minimum-arc line is a player-reachable path, not an edge case
Evidence: delta scenario "A burn toward the fleet's own host while docked there". Players will hit this by selecting the body their fleet is docked at. Confirm the minimum-arc line is shown as a normal refusal (it is, via burnErrorCopy), and that the command panel does not log it to the sighting log as an error. No new spec text needed; covered by MAJOR 3's scenarios plus the existing "Rejection Reasons" generic requirement.

## Consistency note
No change needed to docked-fleet-actions *Rejection Reasons Map...*: burn refusals already fall under "system-space-view's burn ... commands" and the generic-fallback scenario. The only spec gap is stop (MAJOR 1), which that requirement does not enumerate. New copy lines themselves need tasks, not requirements, beyond the pairing scenarios above.
