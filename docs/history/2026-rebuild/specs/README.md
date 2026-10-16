# Numbered specs — complete folder audit

Completed 2026-10-16 after Travis explicitly requested cleanup of **all** of
`docs/specs`, following approval of the canonical domain structure. No gameplay
implementation is authorized by this cleanup. Current sources start at
[documentation](../../../README.md).

## Exact remaining folder and rationale

All **13 remaining tracked files** in `docs/specs` are now navigation/compatibility
records: eleven numbered redirects, one backlog redirect and README. No full
historical spec or accepted/implemented metadata remains active in that folder.
No live unfinished implementation plan was found among these historical records;
old incomplete checkboxes are not current work. Active scratch plans remain untouched.

The table covers each file individually, including the previously archived #0003
and BACKLOG. It distinguishes current code, later accepted design, deferred intent
and obsolete contracts rather than treating all old decisions as current.

| Retained path | Classification | Current owner | Preserved intent / supersession finding | Provenance |
| --- | --- | --- | --- | --- |
| [0001-galaxy-generation.md](../../../specs/0001-galaxy-generation.md) | Historical; finite seed-time galaxy superseded | [world](../../../domains/world.md) | Deterministic field/skeleton/start-area separation, topology-only lane costs and ordinary bridge semantics preserved. Current unbounded field supersedes finite-disk size/cadence claims. | [Full record](0001-galaxy-generation.md) |
| [0002-galaxy-view.md](../../../specs/0002-galaxy-view.md) | Historical view; surviving UX extracted | [world](../../../domains/world.md) | Native-coordinate galaxy layout, free astronomical inspector, own-fleet presence/recenter, wake-focus, Z-up/touch camera and frozen public landing captured. Current charted-lane projection supersedes explored-incidence reveal; no purchased-intel writer assumed. | [Full record](0002-galaxy-view.md) |
| [0003-system-interior.md](../../../specs/0003-system-interior.md) | Already archived; redirect retained | [world](../../../domains/world.md) | Continuous geometry, generation/persistence and first-request versus exclusive-arrival trigger gap preserved. Existing full archive untouched; no second archive of its stub. | [Full record](0003-system-interior.md) |
| [0004-movement-board.md](../../../specs/0004-movement-board.md) | Historical hex/coast mechanics superseded | [travel](../../../domains/travel.md) | Effective live position before new order/cancel preserved, including stale persisted arrival. Existing tests cite S1/S2; scenario reference links retained. Continuous orders/fuel/parking replace old hex/free-burn rules. | [Full record](0004-movement-board.md) |
| [0005-action-timer.md](../../../specs/0005-action-timer.md) | Historical design; implemented contracts extracted | [actions-and-time](../../../domains/actions-and-time.md) | ETA fairness, committed event-time settlement, ownership/inbox/acknowledgment, exactly-once mutation and freshness recovery preserved. Sensor/movement channels replace one slot; focused scan pulse stamp replaces scan-asOf-ETA. | [Full record](0005-action-timer.md) |
| [0006-scan-and-fog.md](../../../specs/0006-scan-and-fog.md) | Explicitly superseded sensor/fog spec | [sensors-and-stealth](../../../domains/sensors-and-stealth.md) | Latest accepted LOS/signature/last-known rules and current anonymous disclosure/report boundary preserved. Old echo-disc/three-band feature memory and acceptance checkboxes are retired, not WIP. | [Full record](0006-scan-and-fog.md) |
| [0007-hex-board-view.md](../../../specs/0007-hex-board-view.md) | Superseded SVG/hex renderer | [hud](../../../hud.md) | Information boundary, noncommitting review/explicit commit, world-time motion and post-action freshness remain across HUD/world/actions owners. SVG/quantized-grid and touch-later rules retired. | [Full record](0007-hex-board-view.md) |
| [0008-movement-galaxy.md](../../../specs/0008-movement-galaxy.md) | Explicitly superseded movement model | [travel](../../../domains/travel.md) | Gate attachment/no-dwell, single-hop transit and no in-system position while jumping captured from current code. Route crawling/hold/reserved-hook checkboxes obsolete; relay/FTL ideas historical future direction only. | [Full record](0008-movement-galaxy.md) |
| [0009-spawn.md](../../../specs/0009-spawn.md) | Historical implemented spawn slice | [discovery-and-identity](../../../domains/discovery-and-identity.md) | Current station/endless-graph spawn, identity/home/healing/naming preserved. Mechanically fresh new-corporation backup restore retained as deferred lore intent, not implemented reset permission. | [Full record](0009-spawn.md) |
| [0010-mine.md](../../../specs/0010-mine.md) | Historical accepted label; mining implemented | [economy](../../../domains/economy.md) | One-kind tonnage-target run and tons/rate ETA, no scan prerequisite, depletion/exploration, shared cargo/composition preserved. Selling/fuel now implemented. Unmanned-drone interpretation deferred against later individual-ship roles. | [Full record](0010-mine.md) |
| [0011-fleet-roster.md](../../../specs/0011-fleet-roster.md) | Historical implemented roster slice | [ships-and-fleets](../../../domains/ships-and-fleets.md) | Own roster on both views, truthful location/activity/countdown/navigation and foreign-data exclusion preserved. Current conditional command ownership supersedes navigation-only restriction; naming/alerts remain future questions. | [Full record](0011-fleet-roster.md) |
| [BACKLOG.md](../../../specs/BACKLOG.md) | Already archived historical coverage table | [Domain index](../../../README.md) | No active backlog retained; original stub/archive unchanged. | [Full record](BACKLOG.md) |
| [README.md](../../../specs/README.md) | Replaced old status index with redirect navigation | [Domain index](../../../README.md) | Every numbered path remains; old accepted/implemented badges and retired /spec index marker removed from active navigation. | [Original index](README.original.md) |

## Code/source verification

The audit read each remaining full spec and compared relevant canonical owners
with current code. [World](../../../domains/world.md) links galaxy field/model,
real-coordinate/camera/query/presence code and charted-lane projection.
[Travel](../../../domains/travel.md) links command/parking/jump and stale-arrival
integration tests. [Actions](../../../domains/actions-and-time.md) links ETA ordering,
raw-handler ownership, inbox/integration tests, resolver timestamps and recovery.
[Sensors](../../../domains/sensors-and-stealth.md) links current disclosure/report/
feature projection. [Discovery](../../../domains/discovery-and-identity.md),
[economy](../../../domains/economy.md) and [ships](../../../domains/ships-and-fleets.md)
link current spawn/healing/survey/name, mining/sale/fuel and roster implementations.
The [earlier source map](../../../documentation-migration.md) retains historical context.

This is a targeted, per-file reconciliation, not a claim every historical sentence
or future proposal has become an accepted rule. Full records preserve unresolved
historical detail for future review. Original code/scenario citations remain valid
through retained file paths; numbered scenario headings are linked from redirects.

## Conflicts and decisions still open

No Travis decision is needed merely to retire obsolete hex/ring, finite-galaxy,
echo-disc, old multi-hop route or navigation-only-roster contracts: later code and
direction already supersede them. Actual unresolved items remain in domain owners:

- Arrival-only detail generation versus current first-request materialization;
  future discovery/hazard behavior, camera tuning/follow/handoff.
- Sensor geometry/range/timing and signature lifecycle/formulas; combat controls.
- Ship-role/escort controls versus old additional-hulls-as-drones wording.
- Future restore/new-corporation contract, intel-market products, queue/chaining,
  notifications and housekeeping. These are deferred, not hidden implementation work.
- Operational discrepancy: scheduler OIDC audience differs from middleware's legacy
  audience. The old checked sweep acceptance does not verify current deployment.

No runtime/security/deployment change was attempted. Current visual/HUD work and
its pending external permissions stay on the project checklist, not this archive.

## Snapshot integrity

Ten remaining full numbered specs (**3,564 lines**) and the original index
(**26 lines**) were archived in this pass. #0003 and BACKLOG were archived in the
previous cleanup and were not archived again. `TEMPLATE.md` was already removed as
retired scaffolding; no untracked or unbacked file was deleted. All snapshots came
from clean tracked Git content. New numbered payloads are byte-identical after
removing the historical notice; only the archived index's navigable links were
rebased. Plain-text paths retain their original context.

| Newly archived spec | Original lines | Original SHA-256 |
| --- | --- | --- |
| [0001-galaxy-generation.md](0001-galaxy-generation.md) | 220 | `cdd6e3ec6b2b462c43e90557676576dcdd91fbca4570c184e2c62208f3a52475` |
| [0002-galaxy-view.md](0002-galaxy-view.md) | 346 | `98d070b05c98532ccce410da9f718218b114e93c24cf204bc60db406e540a68b` |
| [0004-movement-board.md](0004-movement-board.md) | 425 | `60fb757cfbed8e2036ba2702618029a204c2fa392f2f434eda453c64925112cd` |
| [0005-action-timer.md](0005-action-timer.md) | 348 | `7200a27c9f4c39423bdf1f0c256f64c33631e469712445a464429b081abdcadc` |
| [0006-scan-and-fog.md](0006-scan-and-fog.md) | 753 | `74e738a12678b116b02017956fa97d7881a123dd05c18c9435acceed345d4b57` |
| [0007-hex-board-view.md](0007-hex-board-view.md) | 292 | `85a671023dafe24b1b56ce91b1f6927e816be63bf25fca55b9a89468bfbddf58` |
| [0008-movement-galaxy.md](0008-movement-galaxy.md) | 468 | `97eff95e4ee2907dc5153c9e4a907edd68acd7cea7cea3e274cb55fd91aacc87` |
| [0009-spawn.md](0009-spawn.md) | 325 | `15bee23b2327c494539f8377bdf69368a012ff3ff0248c5cf6d9c4e724345892` |
| [0010-mine.md](0010-mine.md) | 233 | `38b2d6425e3f97388f0aa7541e8f4c36d5d955e40c0cd6f1f20cdde56686e296` |
| [0011-fleet-roster.md](0011-fleet-roster.md) | 154 | `42f060668831152f68d3e37b6db8402df72976fbe5ce76e0a1e4dc3732514b5a` |

Original index SHA-256: `45a269752e7c31ae968ddb6310a0618513982bee1d55973f5ce2678aa033f9bf`.
Earlier #0003/BACKLOG hashes are in the [first cleanup manifest](../README.md).
Historical notices explicitly make old commands/statuses inert. Link, incoming
fragment, scenario-target and archived-body checks are performed before handoff.
No scratch/assets/budget/preview/state files were pruned; root review owns the commit.

Verification completed: all ten newly archived numbered payloads are byte-identical
to pre-cleanup tracked Git sources after notice removal; original-index payload
matches after link rebasing. Earlier #0003/BACKLOG archives and stubs are unchanged.
Changed/new local links and fragment targets resolve; all thirteen remaining files
lack active spec frontmatter and authoring markers. Historical scenario labels are
neutral reference links, not repeated obsolete requirements. File validators and
whitespace checks pass. This pass reduces active source-path content from 3,590
to 168 lines (**3,422 lines removed from active paths**, retained in full archive).
