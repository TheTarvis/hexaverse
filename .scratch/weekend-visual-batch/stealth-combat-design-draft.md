# Stealth and combat — design draft

Status: discussion capture, 2026-10-16. No runtime implementation authorized by this draft.
Source of intent: Travis's confirmations relayed by parent during the weekend visual batch.
Method: grill-with-docs, applying its grilling and domain-modeling children; canonical terms
remain in root GLOSSARY.md. Existing glossary table format is preserved. No ADR is warranted
while the consequential choices below remain open.

## Confirmed intent

- Operating a lane gate reveals the arrival to existing in-system observers. This is
  asymmetric: entrants do not automatically see quiet resident fleets.
- An active system scan finds anomalies and hidden fleets, and exposes the scanner.
  Existing glossary definitions remain unchanged: Scan is the former umbrella term, Sweep
  searches an area, and Analyze examines a target for category/details. Reconcile the user's
  open implementation questions with those established definitions; do not replace them with
  speculation. Existing API/code names still say scan; no renaming is authorized.
- Burning exposes a drive signature to passive observation.
- When a burn stops, only the last-known position remains; there is no continued live tracking
  from that stale observation. Stale-contact privacy is explicit: stale data must never produce
  new live position updates. A fresh observation is distinct from continuing a stale track.
- Arbitrary-position parking for undocked fleets is now a confirmed design goal, including
  parking far out. Travis recalls a related removed concept from an earlier version. This
  confirms the goal, not an instruction to restore archived code or implement it in this
  visual/HUD pass. Gravity is intentionally simplified; orbits remain part of the game.
- Ships and/or fleets should have unique signatures, potentially supporting player intelligence
  trading. Unique signatures are intended; their ship/fleet scope and identification rules
  are not settled. A potential intelligence market is not an implemented sale contract.
- Targeted signature analysis alerts the target.
- Initial weapon families are lasers constrained by range and power, longer-range missiles,
  and defensive point-defense cannons (PDCs).
- Different hull capabilities can follow later. Engagement control and combat resolution are
  undecided. No new combat mechanics, damage model or hull statistics are established here.

## Open decision tree

These are decisions for Travis; their facts should be investigated rather than asked of him.
Parent owns the active interview. This draft supplies the frontier and dependent branches.

1. **Signature subject and meaning:** Is a signature unique to a ship, a fleet, or both?
   What persists through splitting, merging, refits, destruction or ownership transfer?
   What does a match establish: same source, hull class, named fleet, corporation, or something
   less? Those downstream identity and intel-sale rules depend on choosing the subject first.
2. **Observation lifetime:** Post-burn live tracking from the old observation is now ruled out;
   only last-known position remains. How fresh reacquisition works, how a record is aged or
   dismissed, and what remains after a scan ends are still open. Do not extrapolate stale
   positions or present historical data as a live feed.
3. **Gate observers:** Which in-system assets count, at what range/occlusion, and what arrival
   facts and duration are disclosed? Does quiet residency itself guarantee an observer's
   detection of a gate event? Arrival exposure does not by itself settle identity, hull count,
   persistent tracking or automatic notification to every corporation.
4. **Scan/Analyze semantics and scan limits:** Their division of responsibilities remains
   under discussion against the established glossary. Does active system scan reveal every fleet or a range-limited
   volume, or a chosen area? Determine hidden-fleet discovery and anomaly disclosure before
   duration, energy, cooldown and information detail. Do not silently reuse today's focused
   host sweep as this new capability.
5. **Signature analysis alert:** At commitment, pulse reach or completion? Which recipient
   receives it, how much analyzer information is exposed, and what happens after cancellation,
   target departure or simultaneous analyses? Alerting a target does not establish reciprocal
   identity disclosure.
6. **Engagement control:** Manual fire orders, standing rules or automatic exchange? What is
   the targeting prerequisite and how does loss of contact affect fire? Resolution cadence,
   aiming, hit/miss, damage, power allocation, missile flight/guidance, PDC targeting, ammunition,
   retreat and destruction consequences depend on those decisions and remain open.

The parent's suggestions have NOT been accepted: contact detection versus identity knowledge;
a broad active-scan snapshot; targeted Analyze supplying detail/signature without a permanent
lock. Arbitrary-position parking is separately confirmed by the latest user instruction.
Existing code separates some live and historical information, but that fact is not approval
of the remaining proposals. Parking still needs rules for upkeep, drift/orbits and concealment;
the user's recollection is not a requirement to recover archived implementation.

## Implemented facts that constrain future work

Code is the source of current behavior. No tests were run for this documentation-only pass.

| Area | Current evidence | Implication for a future design |
| --- | --- | --- |
| Anonymous contacts | `backend/disclosure/contact.go`, `contact_test.go`: position, velocity, emitting, scanning; deliberately no stable ID, owner or hull composition. | Stable signature handles would change a deliberately constrained disclosure contract. Do not add recognizable hull art/identity to current contacts. |
| Observer coverage | `backend/system/contacts.go`: union over own fleets present in system; in-lane fleets contribute no observer; masked own fleets can observe. | Arrival exposure needs a deliberate observer rule; it is not currently an automatic all-system broadcast. |
| Passive/burn/scan visibility | `backend/disclosure/params.go`, `predicate.go`, `contact.go`: passive range 12; burn plume scales with aggregate drive output and commanded acceleration, with floor 20; scan emission scales with target range. Star occlusion applies. | Current burn visibility is range/occlusion bounded, not universal. Numeric values are tuning defaults, not newly approved stealth balance. |
| Concealment | `backend/disclosure/mask.go`: attachment chains mask quiet ships; active burn breaks masking, as does active scanning in `contact.go`. | Quiet does not currently mean invisible: unmasked cold fleets can be detected within passive range. Whether intent changes that is open. |
| Visibility after burn | `backend/disclosure/predicate.go`: emitting ends at arrival; `Disclose` recomputes without persisted live tracking. | Existing behavior after cutoff follows current range/masking state. New confirmed intent allows last-known position only after burn exposure ends; stale observation must not create live updates. Reconcile ordinary fresh passive detection deliberately before implementation. |
| Host sweep | `backend/fleet/scan_targets.go`, `service.go:scanHostPosition`: body or same-owner fleet host, excluding self, derived belt members and foreign fleet IDs; range/occlusion checked, sensor channel occupied. | Targeted foreign signature analysis is not an existing supported command. Today's scan target selector cannot be reused unchanged. |
| Scan results | `backend/disclosure/sighting.go`, `backend/fleet/resolver.go:ScanResolver`, `backend/sightings/model.go`: immutable pulse-time composition/kinematic reports, including clean-sweep records; stored target ID is withheld on wire. | Useful precedent for stamped intel, but not a unique signature, analysis warning or tradable player product. |
| Historical vs live | Sightings never determine live contacts; enforced by disclosure/system package import guards. Burn/jump resolvers are tested not to mint sightings (`backend/fleet/burn_and_jump_never_mint_sightings_test.go`). | Gate exposure needs explicit design; do not casually mint historical sightings on arrival or feed bought reports into live visibility. |
| Anomalies | `backend/system/fog.go:projectUnfogged`: all generated features are served fully typed with resources/effects to authenticated readers. | Hidden anomaly discovery is future behavior, not something current visuals or HUD may infer. Preserve current disclosure. |
| Arbitrary point travel/parking | `frontend/components/space/space-selection.ts:23,120,129` supports point selection, wire conversion and bounded pick-plane selection; `backend/fleet/model.go:173` accepts `OrderRequest.Point`; `service.go:652` selects body or point; `backend/space/state.go:58` settles point burns into `ParkPoint`; `park.go:20,89` holds fixed coordinates without upkeep. | The core capability exists. Smallest gap is usable HUD review/commit for point targets while legacy Course controls are hidden. Far-out selection limits, non-planar coordinate input and stealth policy remain separate design questions; no new parking physics is implied. |
| Combat | No weapon/combat implementation found in current backend file inventory. Historical movement specs defer engagement resolution. | Lasers, missiles and PDCs are confirmed design vocabulary, not implemented capabilities. |

## Concrete cases to use in the next interview

- A quiet resident behind a star observes an arrival: does gate exposure ignore occlusion?
- An entrant arrives beside a quiet resident: is ordinary close-range passive detection still
  allowed, despite no automatic whole-system reveal?
- A burning fleet splits immediately after drive cutoff: which signature(s) and historical
  records remain? The old observation cannot continue as live tracking.
- An undocked fleet parks far out: what is its supported motion/holding state, cost and
  observability under simplified gravity with retained orbits? No answer is assumed.
- A buyer knows an old signature's owner but receives no live contact: what can be displayed or
  targeted? This is an open scenario, not acceptance of identity/detection separation.
- A signature is analyzed while its target jumps out: when does the alert occur and what is sold?
- A missile is already in flight when contact is lost: does it pursue, coast or fail? Decide
  targeting/control first; no answer is implied by existing continuous movement physics.

## Boundaries for the current weekend work

Keep fog, scans, contacts, travel and weapon behavior unchanged. Anomaly art is an unexplained
phenomenon, not identifiable ship/artifact art or proof of analysis. A HUD arrangement preference
must not create or reveal absent entities. Never update a live position from stale contact
data. This acceptance criterion does not authorize implementing the new tracking rules during
the visual/HUD phase. Record subsequent user decisions here or in the
parent's shared brief; only resolved domain terms belong in GLOSSARY.md. Do not create a
combat ADR, implementation backlog or authority to spend credits from this discussion alone.

## Confirmed update — visibility and occlusion (2026-10-16)

Travis confirmed the intended broad system scan is visibility/line-of-sight limited.
Stars, planets and moons may occlude hidden ships; hiding behind or around bodies is
intended. Docked ships should not automatically appear in a broad sweep; examining
individual objects with Analyze may reveal more. Exact occlusion geometry, numerical
ranges, docking disclosure and timing remain open. Analyze penetrating a star is NOT
confirmed. These are design intentions, not changes to the current fog implementation.

Research recommendation reported before canonical reorganization: maintain settled
vocabulary in GLOSSARY.md, one dated confirmed/proposed/open/current-implementation
concept record at docs/stealth-combat.md, and a conditional root CLAUDE.md pointer.
That concept-document path and status headings are recommendations, not skill mandates.
No canonical document move or broad rewrite has been performed.
