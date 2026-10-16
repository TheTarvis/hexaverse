# Stealth and combat

Status: canonical concept record, updated 2026-10-16. No stealth/combat implementation authorized.
Travis authorized this focused documentation set on 2026-10-16. Consolidated from the
weekend working draft; earlier wording remains in Git history.
Source of intent: Travis's confirmations relayed by parent during the weekend visual batch.
Method: grill-with-docs, applying its grilling and domain-modeling children; canonical terms
remain in [GLOSSARY.md](../GLOSSARY.md). No ADR is warranted while the consequential
choices below remain open.

## Confirmed intent

- Operating a lane gate reveals the arrival to existing in-system observers. This is
  asymmetric: entrants do not automatically see quiet resident fleets.
- An active system scan finds anomalies and hidden fleets, and exposes the scanner.
  Existing glossary definitions remain unchanged: Scan is the former umbrella term, Sweep
  searches an area, and Analyze examines a target for category/details. Reconcile the user's
  open implementation questions with those established definitions; do not replace them with
  speculation. Existing API/code names still say scan; no renaming is authorized.
- Broad system discovery is visibility/line-of-sight limited: stars, planets and moons
  may occlude hidden ships; hiding behind or around bodies is intended. Docked ships
  should not automatically appear in a broad sweep; examining individual objects with
  Analyze may reveal more. Exact geometry, ranges, docking disclosure and timing remain
  open. Analyze seeing through a star is not established.
- Burning exposes a drive signature to passive observation.
- When a burn stops, only the last-known position remains; there is no continued live tracking
  from that stale observation. Stale-contact privacy is explicit: stale data must never produce
  new live position updates. A fresh observation is distinct from continuing a stale track.
- Arbitrary-position parking for undocked fleets is now a confirmed design goal, including
  parking far out. Travis recalls a related removed concept from an earlier version. This
  confirms the goal, not an instruction to restore archived code or add new parking
  mechanics in this visual/HUD pass. The HUD may expose existing point travel. Gravity is intentionally simplified; orbits remain part of the game.
- Signature model accepted by Travis (“agreed”), relayed on 2026-10-16: signatures
  belong persistently to individual ships. An observer's unresolved contact may group
  multiple ships; contact grouping is observer-specific, not a universal fleet identity.
- Accepted stages are **Detected → Resolved → Identified**: detected presence has unknown
  ship count; resolution distinguishes individual drives; identification associates a
  signature with learned or traded intelligence. Presence, distinguishable sources and
  known identity are separate knowledge levels, not an automatic permanent tracking lock.
- Resolution depends on apparent separation, range, viewing geometry, sensor quality and
  emission strength, rather than a universal kilometer threshold. Tight formation can
  obscure ship count but does not hide the group's combined emissions.
- Learned/traded signature intelligence supports identification. Intelligence product,
  sale and disclosure contracts remain open; this is not an implemented market.
- Targeted signature analysis alerts the target.
- Initial weapon families are lasers constrained by range and power, longer-range missiles,
  and defensive point-defense cannons (PDCs).
- Different hull capabilities can follow later. Engagement control and combat resolution are
  undecided. No new combat mechanics, damage model or hull statistics are established here.
- Later context from Travis, 2026-10-16: envisioned ship roles include hauler, miner,
  explorer and military classes. Piracy and hauling with escorts grouped as a fleet
  are intended gameplay contexts. Ship/fleet interactions and class capabilities
  remain undecided; individual signature ownership is settled above. This context
  establishes no additional fleet-formation or combat rules.

## Open

These are decisions for Travis; their facts should be investigated rather than asked of him.
The parent conversation owns the active interview. This record supplies its frontier
and dependent branches.

1. **Signature lifecycle and intelligence:** Persistent individual ship signatures are
   settled. Define their handling through refits, destruction and ownership transfer,
   what learned intelligence can establish (same ship, class, corporation or other detail),
   and what can be traded. Numerical resolution formulas/values remain open. How should
   a hauler and escorts act together while retaining individual roles? The accepted
   observer-specific grouping model does not establish movement or formation controls.
2. **Observation lifetime:** Post-burn live tracking from the old observation is now ruled out;
   only last-known position remains. How fresh reacquisition works, how a record is aged or
   dismissed, and what remains after a scan ends are still open. Do not extrapolate stale
   positions or present historical data as a live feed.
3. **Gate observers:** Which in-system assets count, at what range/occlusion, and what arrival
   facts and duration are disclosed? Does quiet residency itself guarantee an observer's
   detection of a gate event? Arrival exposure does not by itself settle identity, hull count,
   persistent tracking or automatic notification to every corporation.
4. **Sensing contract:** Reconcile the agreed glossary with existing scan command names.
   The broad discovery scan is confirmed line-of-sight limited, not an all-fleet reveal.
   Define area/range, body occlusion geometry, docking disclosure and Analyze reach/detail
   before duration, energy, cooldown and cancellation. Do not silently reuse today's focused
   host scan as the new broad sweep.
5. **Signature analysis alert:** At commitment, pulse reach or completion? Which recipient
   receives it, how much analyzer information is exposed, and what happens after cancellation,
   target departure or simultaneous analyses? Alerting a target does not establish reciprocal
   identity disclosure.
6. **Engagement control:** Manual fire orders, standing rules or automatic exchange? What is
   the targeting prerequisite and how does loss of contact affect fire? Resolution cadence,
   aiming, hit/miss, damage, power allocation, missile flight/guidance, PDC targeting, ammunition,
   retreat and destruction consequences depend on those decisions and remain open.

## Proposed

Parent suggestions still awaiting Travis's decision: treat the broad sweep as an
active snapshot; targeted Analyze supplies detail/signature information without a
permanent lock. The roles of Sweep/Analyze in transitions between the accepted stages
remain open. Existing live/historical separation is precedent, not acceptance of
these remaining details. The signature/grouping/stage recommendation previously listed
here was accepted on 2026-10-16 and is now recorded under Confirmed intent.

Arbitrary-position quiet parking is separately confirmed. Far-out/non-planar destination
selection, holding/upkeep and concealment policy still need decisions; archived code is
historical reference, not a required implementation.

## Current implementation

Read-only audit snapshot, 2026-10-16. Code is the source of current behavior. No tests were run for this documentation-only pass.

| Area | Current evidence | Implication for a future design |
| --- | --- | --- |
| Anonymous contacts | [backend/disclosure/contact.go](../backend/disclosure/contact.go), `contact_test.go`: position, velocity, emitting, scanning; deliberately no stable ID, owner or hull composition. | Stable signature handles would change a deliberately constrained disclosure contract. Do not add recognizable hull art/identity to current contacts. |
| Observer coverage | [backend/system/contacts.go](../backend/system/contacts.go): union over own fleets present in system; in-lane fleets contribute no observer; masked own fleets can observe. | Arrival exposure needs a deliberate observer rule; it is not currently an automatic all-system broadcast. |
| Passive/burn/scan visibility | [backend/disclosure/params.go](../backend/disclosure/params.go), `predicate.go`, `contact.go`: passive range 12; burn plume scales with aggregate drive output and commanded acceleration, with floor 20; scan emission scales with target range. **Only star occlusion currently applies**; planet/moon occlusion is future work. | Current burn visibility is range/occlusion bounded, not universal. Numeric values are tuning defaults, not newly approved stealth balance. |
| Concealment | [backend/disclosure/mask.go](../backend/disclosure/mask.go): attachment chains mask quiet ships; active burn breaks masking, as does active scanning in `contact.go`. | Quiet does not currently mean invisible: unmasked cold fleets can be detected within passive range. Whether intent changes that is open. |
| Visibility after burn | [backend/disclosure/predicate.go](../backend/disclosure/predicate.go): emitting ends at arrival; `Disclose` recomputes without persisted live tracking. | Existing behavior after cutoff follows current range/masking state. New confirmed intent allows last-known position only after burn exposure ends; stale observation must not create live updates. Reconcile ordinary fresh passive detection deliberately before implementation. |
| Focused host scan | [backend/fleet/scan_targets.go](../backend/fleet/scan_targets.go), `service.go:scanHostPosition`: body or same-owner fleet host, excluding self, derived belt members and foreign fleet IDs; range/occlusion checked, sensor channel occupied. | Targeted foreign signature analysis is not an existing supported command. Today's scan target selector cannot be reused unchanged. |
| Scan results | [backend/disclosure/sighting.go](../backend/disclosure/sighting.go), [backend/fleet/resolver.go](../backend/fleet/resolver.go), [backend/sightings/model.go](../backend/sightings/model.go): immutable pulse-time composition/kinematic reports, including clean-sweep records; stored target ID is withheld on wire. | Useful precedent for stamped intel, but not a unique signature, analysis warning or tradable player product. |
| Historical vs live | Sightings never determine live contacts; enforced by disclosure/system package import guards. Burn/jump resolvers are tested not to mint sightings ([backend/fleet/burn_and_jump_never_mint_sightings_test.go](../backend/fleet/burn_and_jump_never_mint_sightings_test.go)). | Gate exposure needs explicit design; do not casually mint historical sightings on arrival or feed bought reports into live visibility. |
| Anomalies | [backend/system/fog.go](../backend/system/fog.go): all generated features are served fully typed with resources/effects to authenticated readers. | Hidden anomaly discovery is future behavior, not something current visuals or HUD may infer. Preserve current disclosure. |
| Arbitrary point travel/parking | [frontend/components/space/space-selection.ts](../frontend/components/space/space-selection.ts) supports point selection, wire conversion and bounded pick-plane selection; [backend/fleet/model.go](../backend/fleet/model.go) accepts `OrderRequest.Point`; [backend/fleet/service.go](../backend/fleet/service.go) selects body or point; [backend/space/state.go](../backend/space/state.go) settles point burns into `ParkPoint`; [backend/space/park.go](../backend/space/park.go) holds fixed coordinates without upkeep. | The core capability exists. Smallest gap is usable HUD review/commit for point targets while legacy Course controls are hidden. Far-out selection limits, non-planar coordinate input and stealth policy remain separate design questions; no new parking physics is implied. |
| Combat | No weapon/combat implementation found in current backend file inventory. Historical movement specs defer engagement resolution. | Lasers, missiles and PDCs are confirmed design vocabulary, not implemented capabilities. |

## Concrete cases to use in the next interview

- A quiet resident behind a star observes an arrival: does gate exposure ignore occlusion?
- An entrant arrives beside a quiet resident: is ordinary close-range passive detection still
  allowed, despite no automatic whole-system reveal?
- A burning fleet splits immediately after drive cutoff: each ship retains its signature,
  but what can observers infer from their historical reports? The old observation cannot
  continue as live tracking.
- An undocked fleet parks far out: what is its supported motion/holding state, cost and
  observability under simplified gravity with retained orbits? No answer is assumed.
- A buyer knows an old signature's owner but receives no live contact: what can be displayed or
  targeted? Detection/identity separation is accepted; display and targeting rights remain open.
- A signature is analyzed while its target jumps out: when does the alert occur and what is sold?
- A missile is already in flight when contact is lost: does it pursue, coast or fail? Decide
  targeting/control first; no answer is implied by existing continuous movement physics.

## Integration boundary

Keep fog, scans, contacts, travel and weapon behavior unchanged. Anomaly art is an unexplained
phenomenon, not identifiable ship/artifact art or proof of analysis. A HUD arrangement preference
must not create or reveal absent entities. Never update a live position from stale contact
data. This acceptance criterion does not authorize implementing the new tracking rules during
the visual/HUD phase. Record subsequent user decisions here; only resolved domain terms belong in GLOSSARY.md.
The [project checklist](../.scratch/weekend-visual-batch/status.md) owns implementation progress.
Scope future gameplay work separately after resolving its prerequisites.

## Related sources

[Design sources](design-index.md) explains authority and document discovery.
[HUD](hud.md) owns the authorized interaction work; [art direction](art-direction.md)
owns object appearance. The [architecture reference](game-architecture.md) helps locate domains.
[Older sensors brainstorm](plans/sensors-and-stealth.md) and
[scan/fog spec](specs/0006-scan-and-fog.md) retain hex-era ideas and historical claims;
they do not override current continuous-space code or the later confirmed intent above.
