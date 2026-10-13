## 1. Contract and red tests

- [x] 1.1 Architect settles asset loading/ownership, normalized bounds, model budgets, fallback and stable SDET seams in design and implementation contract; record Meshy decision and asset provenance.
- [x] 1.2 Independent SDET maps every delta scenario to geometry/integration/browser evidence, writes red tests for structure and budget bounds, and records the red manifest before implementation.
- [x] 1.3 Add integration cases for classification, own-fleet modes, published transforms, selection/acting semantics, abstract contacts/previews, empty scenes and withdrawal.
- [x] 1.4 Add adversarial load/lifecycle cases for delayed success, failed decoding, stale completion, deduplicated requests, unchanged frames, shared instances, removal/replacement, retry and remount.

## 2. Assets and renderer implementation

- [x] 2.1 Acquire or author the original ship and ring/hub station assets through the approved asset workflow; validate local files, provenance, unit bounds and budgets before runtime integration.
- [x] 2.2 Implement model resource loading/cache and immediate usable fallbacks, including invalid-asset handling and stale-completion cleanup.
- [x] 2.3 Integrate ship only for own-fleet marks and station only for served station bodies, preserving abstract contact/preview distinctions and all existing mode/position/selection behavior.
- [x] 2.4 Integrate nested geometry/material/texture cleanup with mark removal, appearance replacement, renderer teardown and retry while retaining still-shared resources.
- [x] 2.5 Run targeted red-to-green verification, independent test-integrity verification and relevant existing renderer tests; validate every changed file.

## 3. Visual acceptance

- [x] 3.1 Capture actual GPU-rendered ship and station at default gameplay and close zoom; QA inspects silhouettes, layered metallic detail, lighting, mode cues and reticle visibility against the approved reference.
- [x] 3.2 Verify station pointer/keyboard selection, own-fleet acting selection, camera movement and loading/failure/recovery behavior; record any unverified scenario honestly in the QA report.
- [x] 3.3 Measure actual asset sizes and renderer geometry/material/texture costs against the contract and record representative multi-mark resource evidence without claiming an unmeasured FPS guarantee.

## 4. Verification

- [x] 4.1 Run strict OpenSpec validation and independent adversarial review; resolve accepted findings before delivery.
- [x] 4.2 Per-commit gate green: `bash harness/check.sh` and `python3 harness/skills/code-quality-checks/check.py --files-only` (tiers 0–1, `docs/testing-tiers.md`); report unrelated failures separately.
- [x] 4.3 Journey spec written after implementation tasks are checked; tier 4 then tier 3 run once each with the tree locked at archive time, never per task. If archive is withheld, record exact unrun gates rather than checking them off.
- [x] 4.4 Write `docs/handoffs/add-ship-station-models-journey.md` with the suite budget line and durable evidence paths; preserve the separate active scene-art change and unrelated working-tree edits.

## 5. Authorized selected-object preview addition

- [x] 5.1 Architect pins the station detail and explicit own-fleet inspection mounts, preview orientation controls, visibility ownership and stable test seams in the design/contract, preserving existing command state.
- [x] 5.2 Independent SDET writes red scenarios for eligible selected-only preview mounting, same-asset use, dimensions/initial pose, retained thumbnails, accessible keyboard controls and isolated pointer input; extend coverage and red manifest without weakening the original suite.
- [x] 5.3 Independent SDET writes delayed-load, failed-asset, unavailable/context-lost, hidden-retained-panel, stale-completion, repeated-open and map-resource independence tests before production edits.
- [x] 5.4 Implement the bounded real 3D preview with local shared asset files, transparent background, dedicated lighting, fixed pose, drag/keyboard rotation and reset, accessible status and explicit resource ownership.
- [x] 5.5 Wire the station preview below its name in the visible object details and add a persistent pointer/keyboard-reachable own-fleet inspection surface through the explicit chevron-menu action, preserving fleet-switch callbacks, successful-read eligibility, inspector focus return, single/held-Escape isolation from the dock, subsequent fresh-Escape dock behavior and failed-read empty menus; preserve other thumbnails, acting/target semantics, facts, controls and panel close/focus behavior.
- [x] 5.6 Pass the added targeted suite and independent integrity check; run changed-file validation, TypeScript and relevant existing inspection/renderer tests.
- [x] 5.7 Independently review and adversarially attack the preview delta, validate OpenSpec strictly, and resolve accepted findings; the earlier checked 4.1 records the original map-only review, not this addition.
- [x] 5.8 Extend the single final GPU journey and QA captures to ship/station menu previews, dimensions, lighting, pointer and keyboard rotation/reset, map-input isolation, failure and hidden-panel cleanup; report any unverified acceptance explicitly before final delivery.

## Historical gate disposition before original journey

Original map/menu implementation tasks complete; the subsequent Objects correction remains tracked below. Tasks3.2/5.8 retain exact partial acceptance gaps in the QA matrix despite the original scoped journey passing;4.4 has its historical record. Task4.2 explicitly BLOCKED: full tier1 passed backend vet/short, frontend types/lint and2115 tests; two formatter guards fail on stale line anchors in preexisting unrelated SpaceStage/Storyboard edits. SDET maintains only the SpaceWorld anchor shifted by this change. Tier0 passed164files. Task4.3 archive gate explicitly BLOCKED by4.2; the scoped tier4 still runs once for feature acceptance, tier3 remains unrun and archive withheld. No unrelated changes are repaired or archived.

## 6. Authorized fleet rows in Objects correction

- [x] 6.1 Finalize typed fleet inspection identity, independent read eligibility, served facts and explicit fleet camera-focus seam in the contract; independently review/adversarially attack the new delta and reconcile before implementation.
- [x] 6.2 Independent SDET writes red tests for local parked/burning/drifting membership, count/search, remote/transit/contact exclusion, failed/loading/empty reads with usable bodies, typed-id collisions, acting/target preservation and focus with unavailable position.
- [x] 6.3 Independent SDET adds preview mode-refresh, close/hide/reopen and departure/deletion/error withdrawal coverage, preserving prior assertions and recording the new red baseline.
- [x] 6.4 Integrate eligible fleet rows and served details with the shared preview in Objects; preserve acting and command-target state, suppress fleet Plot/body services, route explicit fleet focus and retain chevron inspection.
- [x] 6.5 Run independent integrity verification, targeted tests, types/lint and changed-file validation; extend QA evidence and scoped browser verification for the new Objects entry points after review with the tree locked, treating the prior journey as historical rather than rerunning it without a changed scope.
- [x] 6.6 Record the new scope's results and remaining exact QA/archive gaps in status/coverage/journey records without marking earlier unverified gates complete; no new asset spend or unrelated edits.

## Final disposition

All implementation and feature acceptance tasks are complete. User verified the browser. Final amended journey passed2tests (55.5s journey,1.3m total) and closes historical exact browser gaps; independent450tests pass. Only4.2 and4.3 remain unchecked: unrelated existing formatter guards prevent a fully green repository gate, so archive is withheld and tier3 is unrun. No commit, unrelated repair or prior-change archive was performed.


## 7. Authorized archive compatibility repair

- [x] 7.1 Independently spot-check this narrow repair against existing figure-formatting requirement A Player-Facing Figure Is Produced Only By the Shared Formatter and its No component-local decimal rounding, A rendered figure's text is the module's own output for its raw value, and rounding-exception-list scenarios; no normative delta or weakened gate.
- [x] 7.2 Independent SDET amends the two SystemStoryboard free-hold expectations to canonical shared tonnage output (138 t and 128 t), verifies raw/unit pairs and updates only justified non-player-facing SpaceStage guard anchors/SVG-coordinate exception before developer edits.
- [x] 7.3 Keep SystemStoryboard freeHold numeric and render free hold/capacity through existing shared tonnage formatter and Figure; remove its local tonnage toFixed without unrelated storyboard changes.
- [x] 7.4 Verify focused storyboard/formatter tests and independent test-integrity check, validate edited files, rerun required repository/archive gates and record outcomes; retain original feature QA and spend, with no extra feature journey for this isolated repair.

## Archive gate result

Final tiers0/1 passed (168 file checks,2132 frontend tests, backend vet/short, types/lint); formatter compatibility repair independently verified197tests. Required tier3 ran once and FAILED:1981tests,1skipped,19failures;2035.628s suite /2120.83s wall, no timeout. The failures are backend integration assertions outside the model/preview implementation; exact attribution is recorded in archive-tier3 handoff. Task4.3 remains unchecked and archive is blocked. No failure is waived, no backend repair or rerun performed, no specs merged/archive moved.


## 8. Authorized station-spawn test fixture correction

- [x] 8.1 Independently review the 19-row archive-tier3 matrix against current station-attached orbit spawn; verify the full corporation-spawn and system-interior corrective deltas against the user intent and confirmed winner-projection omission, without editing live specs directly.
- [x] 8.2 SDET corrects stationary comparison fixtures for preview/cap/scaling/stranding and funded refund burns with explicit state, attachment, clock/epoch and fixed-target premises; preserve all cost, curve, duration, cap and refund assertions.
- [x] 8.3 SDET explicitly arranges unattached-near-station refuel, hostless hold/upkeep, zero-speed stop and attached-orbit settlement-race fixtures; assert setup and preserve exact rejection, fuel and persistence outcomes.
- [x] 8.4 Update obsolete spawn reachability tests to authorized station-adjacent semantics while preserving configured-grant, attachment, star-clearance and idempotent healing guarantees; no broad geometry-error acceptance.
- [x] 8.5 Independent SDET pins the concurrent-interior winner station projection and continuous-cascade parity in red tests; developer applies only the missing projection operations in the ErrAlreadyExists branch, preserving unreadable-winner errors, current-clock/access behavior and expected bootstrap200/exactly-once assertions.
- [x] 8.6 Validate files and run targeted affected tests plus independent assertion-integrity review; after all repairs, run one final full tier3 gate with tree locked and existing timeout, record budget/results and archive only when required gates pass. No extra UI journey or asset spend.


## 9. Newly confirmed concurrent starter-hull race

- [x] 9.1 Independently review the explicit concurrent corporation-spawn scenarios and atomic stable-id create-if-absent design; settle the narrow DAO seam before SDET red tests, preserving user-authored spawn and movement behavior.
- [x] 9.2 Independent SDET records red coverage for concurrent empty observations producing one persisted id, loser preserving updated winner state/fuel, legacy existing-fleet preservation, create/read failures and exactly-once starting-fuel bootstrap parity; retain the HTTP200 and identical-fleet-id assertions.
- [x] 9.3 Implement only the shared seeding atomic creation primitive and required DAO/mock changes; preserve existing-hull fast path, state encoding, validation, grants and public seed entry points without migration or broad refactor.
- [x] 9.4 Complete the seven remaining redundant-host-burn fixture corrections under task8 with explicit state/attachment/time premises and unchanged behavioral assertions; run focused emulator/unit checks and independent integrity/security review.
- [x] 9.5 Record the distinct race and amended fixture scope, then run one final required tier3 verification after repairs with tree locked and existing timeout; archive only on green required gates, with no additional UI journey or asset spend.

## Completed archive gates (supersedes historical dispositions)

Final authorized atomic-repair scope passes all gates:180filechecks; backendunit/vet; unchanged frontend2132tests/types/lint; featureQA59/59; accepted amended browser journey2PASS. Final full backend2010tests,1intentional fixture-regeneration skip,0failures in1009.636s suite/1021.5s wall. Earlier failed runs and the user-authorized corrections remain recorded, never waived. All tasks complete; only this change is authorized for archive. Prior active scene-art and unrelated work remain untouched; Meshy42/500credits, no commit.
