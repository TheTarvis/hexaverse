# Sensors and stealth

Purpose: who can observe a presence, distinguish its sources and identify them;
what remains known when visibility ends. Canonical intent, 2026-10-16, from Travis's
weekend conversation and explicit acceptance of the signature recommendation.
New sensing mechanics remain deferred; documenting them is not implementation approval.

## Settled intent

- Gate operation reveals arrival to observers already in-system. Exposure is
  asymmetric: entrants do not automatically discover quiet resident fleets.
- Broad active system discovery finds anomalies/hidden fleets and exposes its
  source. It is line-of-sight limited: stars, planets and moons can occlude ships.
  Hiding behind/around bodies is intended. Docked ships should not automatically
  appear in the broad sweep; Analyze of an individual object may reveal more.
  This does not imply Analyze can penetrate a star.
- Burning exposes drive emissions to passive observation. After cutoff, the old
  observation retains only last-known position, not continued live tracking.
  Fresh observation can reacquire; historical data must never supply live updates
  or silently extrapolate a track.
- Individual ships retain persistent signatures. An unresolved contact may group
  several ships, with grouping specific to each observer rather than a universal
  fleet identity. This was accepted by Travis (“agreed”) on 2026-10-16.
- **Detected → Resolved → Identified** separates known presence/unknown count,
  distinguishable drives, and recognition using learned or traded intelligence.
  Resolution depends on apparent separation, range, viewing geometry, sensor
  quality and emission strength, not a universal kilometer threshold. Tight
  formation may obscure count, but not combined emissions. Recognition grants
  neither perpetual visibility nor a permanent tracking lock.
- Targeted signature analysis alerts its target. An intelligence market is intended
  context; transaction/product rules belong to [economy](economy.md) and remain open.

Use [glossary verbs](../../GLOSSARY.md): Scan is the former umbrella term, Sweep
is discovery, Analyze is targeted examination. Existing API names still use scan;
the terminology does not authorize API renaming or claim a broad sweep is shipped.

## Unknown burns — accepted browser meaning, 2026-10-22

For Objects → Fleets browsing, Travis defined the Unknown category as burns the
player observed but has not analyzed. Show the observation without revealing a
fleet name, owner, allegiance, hull model or ship count. Unknown is an observation
category alongside Owned/Friendly/Enemy in this browser, not a fourth diplomatic
relationship. Observing a burn does not establish whether its source is friendly
or hostile. Keep this vocabulary distinct from a known identity with an undecided
relationship.

This records intended browser behavior, not an implemented Analyze operation or
new contact-selection/identity contract. A past observation must not imply live
tracking; use last-observed information when ongoing coverage is absent. Analysis
outcomes, observation retention and later identified-but-unclassified fleets
remain open. Current live anonymous contacts and their wire contract remain as
recorded below; not every current contact is necessarily an observed burn.

## Current implementation and gaps

Read-only audit, 2026-10-16; code/tests remain authoritative.

| Current behavior | Evidence / gap |
| --- | --- |
| Foreign live contacts are anonymous, without stable ID/owner/hull count | [Contact contract](../../backend/disclosure/contact.go). Per-ship signature identity and resolution stages are future additions; do not expose identifying hull art now. |
| Own in-system fleets supply observer coverage; in-lane fleets do not | [System contacts](../../backend/system/contacts.go). Current arrivals are not an automatic all-system identity broadcast. |
| Range/emission checks and star-only occlusion | [Predicate](../../backend/disclosure/predicate.go), [parameters](../../backend/disclosure/params.go). Burn plume depends on aggregate drive output/acceleration; scan emission on target range. Planet/moon occlusion and accepted resolution formulas remain unimplemented. Numeric defaults are tuning, not newly agreed balance. |
| Quiet attachment chains are masked; burning/scanning breaks masking | [Masking](../../backend/disclosure/mask.go). An unmasked cold fleet may still be within passive detection range; quiet is not globally invisible. |
| Focused scan targets a body or own-fleet host/attachment chain | [Target selection](../../backend/fleet/scan_targets.go), [service](../../backend/fleet/service.go). Excludes self, derived belt members and foreign fleet IDs. Range/occlusion and sensor channel apply; duration scales with target range and occupies sensor time rather than charging fuel. This is not broad discovery or foreign signature analysis. |
| Immutable pulse-time reports, including clean sweeps, are separate from live disclosure | [Sightings](../../backend/disclosure/sighting.go), [reports](../../backend/sightings/model.go), [resolver](../../backend/fleet/resolver.go). Target ID is withheld on wire; historical reports never determine live contacts. [Burn/jump guard](../../backend/fleet/burn_and_jump_never_mint_sightings_test.go) prevents casual minting on arrival/burn. |
| Every interior feature/gate is currently served fully to authenticated readers | [Projection](../../backend/system/fog.go), [handler](../../backend/system/handler.go), [tests](../../backend/system/fog_test.go). Hidden anomaly discovery is future behavior, not something visuals should invent. |

## Open questions and proposals

1. Define signature lifecycle through refits, ownership changes and destruction,
   what learned intel identifies, and numerical resolution formulas/values.
2. Define broad sweep area/range, body occlusion geometry, docking disclosure and
   Analyze's reach/detail. Then settle duration, energy, cooldown/cancellation and
   how Sweep/Analyze map to the accepted sensing stages.
3. Define gate observers, exposure facts/duration and range/occlusion. A resident
   behind a star need not automatically detect a gate event merely by residing there.
4. Reconcile ordinary fresh passive detection with post-burn last-known records;
   define aging/dismissal/reacquisition without continuing stale tracks.
5. Set analysis alert timing/recipient/information and cancellation/departure handling.
   Alerting does not itself settle reciprocal identity disclosure.

**Still proposed, not accepted:** broad Sweep as an active snapshot; targeted
Analyze providing detail/signature information without a permanent lock as its
specific command contract. The accepted sensing model does not settle these timings.

Concrete cases: a cold fleet near an entrant; a gate behind a star; a fleet split
after cutoff (ship signatures persist, report interpretation remains open); a buyer
holding old intel without a contact; analysis completing after a jump. Future HUD
controls show only served information and preserve these privacy boundaries.

## Related sources

[Ships/fleets](ships-and-fleets.md), [travel](travel.md), [combat](combat.md),
[economy](economy.md), [discovery](discovery-and-identity.md), [HUD](../hud.md).
Historical lineage: [scan/fog spec](../history/2026-rebuild/specs/0006-scan-and-fog.md),
[fog plan](../plans/fog-of-war.md), [sensors brainstorm](../plans/sensors-and-stealth.md),
[continuous-space disclosure decisions](../plans/continous_space/decisions.md).
Older hex-era or speculative through-body sensing laws are not current rules.
