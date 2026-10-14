# Discovery, corporate claims, and astronomical names

Status: ready-for-agent

## Problem Statement

The galaxy and local system views need names that make places memorable and easy to discuss. Today, systems have generated names, but many local objects appear under internal identifiers such as `feat-body-3` and `feat-moon-0`. These labels make navigation feel unfinished and give players little attachment to the places they explore.

Exploration should let a corporation leave a lasting mark by claiming and naming surveyed places. Telescope visibility should not eliminate that reward: a planet can be astronomically known while still awaiting its first registered close survey. The game currently has no body-survey action, first-discoverer record, or territorial ownership mechanic. Naming therefore needs a small, explicit claim model without pulling combat and sovereignty into this pass.

## Solution

Give every place a readable initial name or catalogue designation, backed by permanent identity. Generate pronounceable star names and evocative, related planet and moon names from the galaxy seed; persist them when their objects are created.

The star supplies the system's name, including on the galaxy map. There is no separately editable system name. A corporation starts owning its home star and station. Its station receives `<Corp Name> Station` automatically at spawn. The home star requires a survey before its owner can choose its name; home planets and moons require individual surveys to claim and name them.

Elsewhere, the first corporation to complete a valid survey claims that star, planet, or moon and earns its naming right. Claims are independent: owning a star does not own its planets, moons, or stations and does not exclude other corporations. A player may choose a name later, from anywhere, after previewing and confirming it. That first confirmed choice locks for this pass. Names are shared public facts, while permanent catalogue references and discovery history preserve recognition and credit.

## User Stories

1. As a player, I want readable names in the object browser, so that I can navigate without interpreting internal identifiers.
2. As a player, I want pronounceable generated star names, so that I can remember and discuss destinations.
3. As a player, I want evocative generated planet names, so that worlds feel like distinct places.
4. As a player, I want related names within a system, so that procedural places have a recognizable local character.
5. As a player, I want moon names to draw from their parent's theme, so that related bodies feel connected.
6. As a player, I want generated names to remain fixed, so that later generator improvements do not change familiar destinations.
7. As a player, I want readable labels for belts, gates, anomalies, and hazards, so that objects outside player-naming scope still feel finished.
8. As a player, I want the galaxy map to show the star's name, so that the same destination has one name at both map scales.
9. As a player, I want permanent catalogue references, so that I can recognize a place even when its displayed name changes.
10. As a player, I want catalogue references to remain searchable, so that an old reference still finds its destination.
11. As a corporation owner, I want my starting star and station assigned to my corporation, so that I have an established home.
12. As a corporation owner, I want my station automatically named after my corporation, so that my home station has an identity immediately.
13. As a corporation owner, I want to survey my home star before choosing its name, so that the home system introduces the exploration loop.
14. As an explorer, I want to survey home planets and moons individually, so that owning my home star does not bypass exploration.
15. As an explorer, I want first arrival in a system recorded, so that the corporation that reached it first receives historical recognition.
16. As an explorer, I want first completed body surveys recorded, so that close exploration earns lasting credit.
17. As an explorer, I want a separate Survey action, so that registering a body is distinct from searching for masked ships.
18. As an explorer, I want survey range and completion time shown before committing, so that I can position my fleet deliberately.
19. As an explorer, I want a visible survey progress state, so that I know when the claim attempt will finish.
20. As an explorer, I want to move while remaining in survey range, so that surveying does not require docking or complete immobility.
21. As an explorer, I want leaving survey range to cancel my attempt clearly, so that failed claims have an understandable cause.
22. As an explorer, I want surveys to share the sensor channel with scans, so that sensor work follows the fleet's existing action model.
23. As an explorer, I want the first successful survey to claim its target, so that finding and examining places creates a meaningful reward.
24. As an explorer, I want competing surveys to award only one claim, so that races have an authoritative result.
25. As an explorer, I want later surveys to preserve an existing claim, so that another corporation cannot overwrite earned ownership.
26. As an explorer, I want to claim planets independently of their star, so that another corporation's star claim does not prevent local exploration.
27. As a claimant, I want to name my surveyed star, planet, or moon, so that I can leave a mark on the galaxy.
28. As a claimant, I want naming rights reserved while I decide, so that I do not need to invent a name during fleet operations.
29. As a claimant, I want to submit the name remotely, so that my fleet can continue exploring after the survey.
30. As a claimant, I want to preview and confirm the permanent choice, so that I can catch a mistake before committing it.
31. As a player, I want everyone to see the same public name, so that navigation and conversations refer to the same place.
32. As a player, I want discovery attribution and naming history preserved, so that future ownership changes cannot erase exploration credit.
33. As a claimant, I want clear name-validation feedback, so that I can correct a rejected name without losing my naming right.
34. As a player, I want conservative automatic checks for obviously abusive names, so that shared labels have basic safeguards without routine LLM calls.
35. As a player, I want star names unique across the galaxy, so that system destinations are distinguishable.
36. As a player, I want body names unique within a system, so that local targets are distinguishable.
37. As a claimant, I want to reuse a body name found in another system, so that naming is not constrained by unrelated places.
38. As a player, I want search results to identify the enclosing star and catalogue reference, so that repeated body names remain unambiguous.
39. As a player, I want names and history to survive retries and reconnects, so that asynchronous resolution cannot lose or duplicate a claim.

## Implementation Decisions

- Keep identity separate from naming. Body IDs are currently local to a system; durable references must include galaxy and system identity as applicable. Names must never become action targets, persistence keys, ownership keys, or route identifiers.
- Use one authoritative star/system display name. Update galaxy and interior projections consistently when the star is named; do not introduce a second independently editable system-name field. Other objects retain their own names.
- Provide permanent readable catalogue references independent of all display names, for example `HX-7K2 III-a`. Derive them from stable identity and stable body relationships rather than a mutable star name or current UI sort order. Retain them through naming and expose them in details and search.
- Extend the existing seeded galaxy and interior generation responsibilities. Combine curated word families and constrained syllable generation; do not use an LLM. Stars receive pronounceable invented names, planets receive evocative names from a system theme, and moons draw from parent themes. Exact dictionaries and theme inventories are implementation choices within this art direction.
- Persist generated names at creation and preserve them as original generated names when players submit replacements. Renaming a star does not regenerate other names. Improvements to the generator affect newly created objects only. Same seed and stable object identity must produce the same initial result independently of materialization order.
- Generated names must obey uniqueness scopes. The galaxy is lazily materialized and effectively unbounded; a finite syllable vocabulary alone cannot guarantee star-name uniqueness. Use stable identity-derived disambiguation where necessary, rather than assigning generated names according to which object was read first. Catalogue labels are an acceptable readable fallback for object kinds outside player naming.
- Player naming and new survey claims cover stars, planets (rocky, gas giant, and ice classifications), and moons. Stations have names too, but their spawn-time names are automatic. Belts, individual belt members, anomalies, ruins, nebulae, gravity wells, debris, radiation features, and lane gates do not receive player naming or new survey-claim mechanics in this pass.
- Preserve established inhabited-place names and treat such places as protected from first-survey naming. Most generated uninhabited planets and moons remain eligible. Protection is explicit server-owned state, not inferred from whether a name looks generated. Do not add new populated-place generation as part of this feature.
- Spawn assigns the corporation its home star/system and station without claiming the home planets or moons. The star's player-naming entitlement remains locked until that corporation completes its star survey. A foreign corporation cannot acquire or name the already-owned home star by surveying it. Spawn retries must preserve ownership and station naming rather than creating competing grants.
- Set the home station name to `<Corp Name> Station` at spawn and keep that assigned name fixed. Do not present a station-name submission flow. The player-submitted 3–40 character rule applies to submitted celestial names, not to a station label constructed from an existing corporation name. Additional station construction and its naming policy are not introduced here.
- Add explicit corporate claim state for eligible bodies, including the star. The star claim represents system ownership for display and naming only. It confers no automatic ownership of contained bodies, no border exclusion, and no extra mining, docking, market, or movement permissions. Independently owned planets and moons may coexist within a star owned by another corporation.
- Record first system arrival separately from the successful survey that establishes a star claim. Arrival earns historical discovery credit but not a naming entitlement. For planets and moons, the first successful close survey records discovery and claims the object. Preserve corporation identity and world-time attribution; never infer discovery merely from opening a map or materializing an interior.
- Add Survey through the existing action commit/resolver infrastructure. It is distinct from the implemented focused Scan, which searches for masked ships. Do not redefine Scan or the existing reserved chart-survey tier to provide body claims.
- Survey occupies the fleet's sensor channel and leaves the movement channel available. Require an owned command fleet, an eligible target in its current system, and valid survey geometry. Initially use the existing focused-scan range, currently 48 continuous-space units, and a configurable duration of 30,000 world milliseconds. Docking and new survey equipment are not required.
- Require the fleet to remain within survey range throughout the committed interval. Movement inside range is allowed; leaving range cancels the attempt without a claim, even if the fleet returns before the ETA. Entering transit, leaving the system, or losing a resolvable target likewise cannot complete a claim. Release the sensor slot on all terminal outcomes. Respect existing collision and star-clearance geometry when approaching a star.
- Enforce survey validity using canonical Go continuous-space positions and action/movement transitions. Do not implement a per-tick accumulation loop or substitute a single midpoint check for the agreed stay-in-range requirement. Reuse existing trajectory/action machinery; any additional trajectory predicate must remain owned by Go.
- Award an unclaimed target to the first successfully completed valid survey, using server world time and authoritative action resolution. Competing completions require one atomic winner, with a stable deterministic ordering for exact ties. Earlier valid completion must not lose merely because a later action was read first after an offline interval. Survey retries and repeated settlement must be idempotent.
- An already-owned object's later surveys cannot transfer ownership, overwrite original discovery attribution, or grant naming rights to another corporation. A successful home-star survey unlocks only its existing owner's naming entitlement. Failed or losing claim attempts must produce an understandable result rather than silently advertising ownership.
- Persist naming entitlement independently of fleet presence. The entitled corporation may submit its initial name later from anywhere; a station or fleet need not stay nearby. The existing generated name remains visible until submission succeeds. No timeout or forfeiture of the earned right is introduced.
- Require a preview and explicit confirmation before committing a player name. After the first successful confirmation, reject further voluntary renames in this pass. Identical request retries may acknowledge the committed result but may not reopen naming. Rejected validation or uniqueness attempts leave the entitlement available.
- Validate names authoritatively on the server: 3–40 characters, Latin letters, numbers, spaces, apostrophes, and hyphens; normalize surrounding/repeated spacing and use case-insensitive uniqueness. Use conservative canonicalization and a curated local prohibited-term list for obvious profanity, slurs, and impersonation of reserved game labels. Avoid broad substring rules that reject innocent names. Unicode normalization and exact list contents are implementation details consistent with these constraints.
- Enforce star-name uniqueness across the live galaxy and body-name uniqueness within a system, including generated and station names. Identical body names are allowed in different systems. Concurrent submissions for the same normalized name must reserve it atomically; one succeeds and others receive a conflict without losing their entitlement. If a generated celestial name conflicts with the automatically assigned home-station name, retain the required station name and disambiguate the generated celestial name before publishing the home state.
- Maintain generated-name, first-arrival/first-survey, and first-player-name provenance separately from current display name and current owner. Preserve historical attribution so future transfer mechanics can change authority without erasing discovery. Administrative correction remains a future operational policy; no correction endpoints or moderation tools are added in this pass.
- Extend existing authenticated API responsibilities with survey commit, confirmed celestial-name submission, and read projections containing names, catalogue references, owner, discovery attribution, and viewer naming eligibility. Exact route and DTO shapes are implementation choices; bind mutations to the authenticated corporation and immutable target identity, use existing conflict/error conventions, and never trust a caller-supplied owner or discoverer.
- Reuse existing handlers, domain services, service-owned DAOs, registered resolvers, and frontend hooks/API client patterns. Corporate claims and naming need one cohesive authority behind the existing service boundaries; avoid a second client-side authority or direct cross-domain DAO access.
- Use shared server names consistently in the galaxy map, system object list, selected-object panel, scene labels, navigation destinations, and available object-search surfaces. Show catalogue references and discovery/ownership details in inspection rather than making raw IDs the primary labels. Search accepts current names and stable catalogue references; body results include their enclosing star for disambiguation.
- Add Survey and naming controls through the existing distinction between command fleet and inspected object. Inspecting a target does not switch the command fleet. Show survey prerequisites, ETA/progress, ownership outcomes, naming entitlement, confirmation, validation errors, and locked state without requiring an immediate naming interruption after survey completion.
- Names are shared public facts for objects available through existing read projections. This feature does not alter celestial visibility, disclose foreign fleets, bypass corporation filtering, or use persistent claim/discovery records to decide live sensor disclosure. Current interiors expose celestial bodies publicly; literal hidden-body discovery is not a prerequisite for naming rewards.
- There are no existing games to preserve. Do not build migration, legacy fallback, or backward-compatibility infrastructure. Add required persistence/index registration and fixture cleanup for new state as ordinary implementation work.

## Testing Decisions

- Primary proposed seam: the existing production-router/Firestore-emulator integration harness. Drive authenticated spawn, arrival, survey commit, action settlement, confirmed name submission, and public reads as one player-visible flow. Prefer this existing high seam to separate mocked tests for each handler, service, and DAO. The seam was presented to the user for confirmation during spec synthesis.
- A good test asserts externally observable behavior: who owns an object, who may name it, what name others see, whether an action finishes or cancels, and whether stable references/history survive. Avoid asserting private collection layout, dictionary contents, exact syllable choices, call counts, or implementation helper structure.
- Prior art includes the router focused-scan journey, router action-ownership tests, system-interior wire tests, fleet move/arrive integration coverage, action idempotency coverage, and existing seeded naming tests. Reuse their authenticated fixtures, production wiring, geometry controls, and scope-resolution entry points.
- Use an injected world clock where supported; reuse established action time-skip fixtures for the router harness where needed. Do not sleep for the 30-second duration. Assert that the committed duration uses world milliseconds and that reads settle due actions correctly after an offline interval.
- Verify home spawn assigns only the star/system and station, fixes the station label, requires a survey before star naming, and leaves planets/moons unclaimed. Verify spawn retry safety and preservation of previously chosen names.
- Exercise first arrival separately from survey ownership: a corporation that arrives first retains its arrival credit even if another corporation subsequently wins the star survey. A planet/moon receives first-survey attribution without pretending that it was previously invisible.
- Exercise sensor-channel contention with Scan and Survey, movement-channel independence, range-boundary acceptance/rejection, movement that stays in range, departure and return before completion, transit/system departure, unresolved targets, sensor-slot release, and star approach outside collision clearance. Test full-interval validity rather than only commit and resolution positions.
- Race surveys from different corporations and resolve overdue actions in differing read orders. Assert one winner, first valid completion ordering, stable equal-time handling, no credit for a cancelled earlier attempt, idempotent settlement, and no overwrite by a later survey. Confirm a star claim never grants its planets or excludes competing planet claims.
- Exercise authorized remote naming, unauthorized submissions, confirmation/lock behavior, rejected-name retry, identical request retry, and racing names for one target or one uniqueness scope. Confirm generated names remain visible while rights are unused and a fleet may depart before naming.
- Read the same renamed star through galaxy and system APIs using different authenticated corporations. Assert one shared name, unchanged identity and catalogue reference, unchanged planet names, and preserved generated/discovery/player-name history. Verify object searches find stable references after naming and disambiguate repeated body names across systems.
- Add small focused behavioral suites at the existing generator and name-validation boundaries for seed/identity reproducibility, materialization-order independence, persistence after generator changes, theme relationships, generated-name disambiguation, character/length rules, normalized uniqueness, reserved terms, obvious prohibited terms, and innocent substring examples. Prefer property/representative tests over snapshots of every generated word.
- Use the existing frontend component/interaction seam only for behavior not observable through the backend: inspection versus command-fleet selection, Survey availability/progress, naming preview and confirmation, error feedback, station names without editing controls, and naming lock presentation. Reuse the existing browser system-view journey for a focused end-to-end naming smoke check if needed; do not create a new testing platform.
- Register and clean up any new emulator state through the existing test-data lifecycle. Run the applicable backend/frontend checks and affected suites during implementation. This spec publication does not claim that feature tests have already run.

## Out of Scope

- Combat, conquest, claim transfers, system-ownership transfers, controller renaming, abandonment, expiry, auctions, and territorial enforcement.
- Granting a star owner exclusive planet/moon claims or new restrictions on movement, docking, mining, stations, or markets.
- Routine LLM moderation, name-reporting workflows, moderation queues, administrative correction tooling, or abuse-handling interfaces.
- Player naming or claim mechanics for belts, gates, anomalies, hazards, ruins, or individual belt members.
- Player-submitted station names, station renaming, and new station-construction/naming mechanics.
- New literal hidden-body discovery, celestial fog, live fleet disclosure rules, or intelligence-tier progression.
- Personal nicknames, additional localization/character-set support beyond the agreed first-pass rules, or a separately editable system name.
- Backward compatibility, migrations, retroactive discovery inference, new populated-place generation, and unrelated HUD or renderer redesign.

## Further Notes

The user confirmed the complete naming and claim design after the grilling session. The later star/system clarification supersedes the earlier suggestion of independent system names. Automatic spawn-time station naming supersedes the earlier suggestion of a player-confirmed station name. Restricting player naming to stars, planets, and moons supersedes the earlier resource-site naming suggestion.

Corporate ownership in this pass is an exploration claim and naming authority. Its future combat and economic meaning deliberately remains undecided. Discovery attribution, ownership, and naming entitlement are distinct facts, particularly for the starting star and for first-arrival credit versus a later survey claim.

The glossary and older architecture notes describe scan/observation behavior that differs from the implemented focused scan. Follow the current code and tests for those existing mechanics. The continuous-space decisions retain the fleet as the unit of motion, bodies as places, canonical Go geometry, and asynchronous commit/resolve behavior; surveys should extend those choices rather than revive a radial scan or per-tick simulation.

The generator's exact word families, technical API shapes, and deterministic tie/disambiguation encoding are implementation choices. They must satisfy the agreed public behavior without opening new game-design questions.
