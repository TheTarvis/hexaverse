## Why

Ordering a burn to a home station answers a bodyless 500 in affected systems (`docs/handoffs/defect-station-order-500.md`), and a burn whose solved curve is below the minimum arc length, which includes some orders to the fleet's own host at some phases, answers 500 too (`docs/handoffs/defect-zero-length-burn-returns-500.md`); both reach the same default arm of the fleet handler, and the first has cost several archive gates. Under USER RULING 1 a fleet may never be inside the star clearance, so the cause is where a station is placed, and the refusal that remains for any other cause must be typed.

## What Changes

- `corporation-spawn`: MODIFIED `Home Site Selection` gains a fourth qualification criterion, (d): a system qualifies as a home only when the lower bound on its station shell's distance from the star is strictly greater than the star-clearance radius. The walk continues past a ring with no qualifier. All 16 live scenarios are carried verbatim; 10 are added, including two that fix which body the criterion is evaluated on. The live requirement enumerates its criteria as the full list, so an ADDED requirement would have contradicted it.
- `fleet-movement`: ADDED requirements serving, on `orders`, `orders/preview` and stop-in-place with the same body on each route that can raise it:
  - the star-clearance refusal as `409`, with a reason that names the origin or the destination (decided from geometry in `backend/fleet`, no identity check, so the star shares the destination reason; when both endpoints are inside, the origin reason is served);
  - the minimum-arc refusal as `409` with its own reason, decided by the solved curve's length alone (an order to the fleet's own host that solves long enough still commits; no target-identity refusal is introduced);
  - a target body id absent from the system as a reason-bearing `404`;
  - a fixed order of refusals (absent body, then origin, then destination, then minimum arc);
  - fixed, pairwise-distinct reason text that is identical on every route and never echoes the request;
  - no stored burn, action, slot or debit for the refused order, no error-level log for a served refusal, and one below-error log entry per served refusal carrying cause, route, fleet id and system id (FULL-AUTO RULING 11);
  - internal faults stay `5xx`, including a present target whose parent chain is broken.
- Reasons are text in the existing `error` body. No new wire field and no machine-readable code.
- `docked-fleet-actions`: one ADDED requirement that a served refusal reads as mapped copy, with the four lines pinned verbatim, on the burn commit and on every stop surface (the fleet panel's Stop currently routes through the mine copy table and the galaxy roster's Stop toasts the raw message).
- Frontend: copy lines for the origin clearance, minimum-arc and absent-body reasons in `frontend/lib/rejection-copy.ts`, the origin and destination key fragments replacing the legacy `star-clearance` needles (RULING 11), and both Stop surfaces (`FleetActionsPanel`, `GalaxyView`) routed through the burn copy table, with tests.
- Test repair: `backend/fuel_spawn_starting_fuel_e2e_test.go` separates unaffordable, geometry refusal and anything else; two stale diagnosis comments are corrected.
- Records: append the refused-preview Retry gap to `docs/handoffs/followup-explain-withheld-burn-command.md`; close `defect-station-order-500.md` and `defect-zero-length-burn-returns-500.md` with evidence, correct its origin claim (`:28-30`) and its "Where to look"; file `defect-fleet-can-rest-inside-star-clearance.md` (with the measured residual rates) and `docs/handoffs/defect-point-target-extent-unvalidated.md`.
- No `space-kinematics` delta, no edit under `backend/space`, no fixture re-record (`fixtures/space/cases.json`, `fixtures/space/turn-table.json` and `fixtures/system/cases.json` untouched; `fixtures/system/mirror-map.json` gains coverage-inventory entries for the new predicate, which is hand-maintained documentation and not recorded output, FULL-AUTO RULING 9), no TypeScript mirror, no migration. The inventory entry obliges the next change that modifies `backend/system` to give the predicate a recorded family.

### Out of scope

- Showing a refusal reason in the burn preview's no-quote state and hiding Retry there (FULL-AUTO RULING 10): appended to `followup-explain-withheld-burn-command.md`.
- The claude-agent's handling of the new 4xx bodies is unverified and not changed here.
- Dipping non-station bodies (5 bodies in 5 of 2,223 systems, measured by the analyst), drift or free-stop inside the clearance, and the stranded false alarm for a fleet inside the clearance: new product calls, not ruled (RULING 8), filed here and left open. `fleet-movement:1145` and `:1228` are not modified.
- `defect-post-dock-burn-cost-drift.md`, `defect-post-sale-departure-burn-409s.md`, `defect-point-burn-serves-empty-bodyid.md`.
- `defect-spawn-system-single-body.md`, `defect-scan-journey-spawn-in-gate-range.md`, `defect-slice-sell-price-changed-409.md`, any change to `wakeNewCorp` or spawn-site pinning, `drift-commit-response-carries-no-delta-v.md`.
- Any refusal keyed on the target being the fleet's own host, and making Burn unavailable toward it, and any stated reason beside a withheld preview (`followup-explain-withheld-burn-command.md`); `defect-burn-cancels-running-mine.md`.
- A generator change so no body's shell reaches the clearance, and a solver change (insertion clamp or relaxed guard).
- Validation of an out-of-extent point target (unverified; filed as a note).
- Commands degrading for a fleet whose stored host no longer resolves (a data fault; stays 500).
- Existing corporations in a failing home (about 8.9% of systems, measured): their docked fleet keeps an intermittent refusal that is a function of park phase and world time, not a standing one (8.2% of departure solves measured). Each is now a typed 409 with a reason, and a re-issue after the park moves on may succeed. During those seconds the fleet also reads as stranded with a full tank, and a stop in place is refused for a fleet already inside. A stop from a fleet docked at a newly selected, qualifying home can also still be destination-refused when its lead point lands inside the clearance (probe: 0.86% of stops in a retrograde system); that is a correct typed refusal under USER RULING 1. Arrangements that dock and then order in such homes can therefore still fail intermittently. Not repaired or migrated (FULL-AUTO RULING 2).

## Impact

- Affected specs: `corporation-spawn` (MODIFIED), `fleet-movement` (ADDED), `docked-fleet-actions` (ADDED). No delta in `system-space-view`, so no overlap with the active `clear-burn-preview-on-commit`.
- Affected code: `backend/system` (one pure predicate), `backend/corporations` (site selection), `backend/fleet` (service, handler, `respond` arms), `frontend/lib/rejection-copy.ts`, `frontend/components/space/FleetActionsPanel.tsx` and `frontend/components/galaxy/GalaxyView.tsx` (Stop error copy), `fixtures/system/mirror-map.json` (inventory only), backend e2e test repairs, `docs/handoffs/`. Not `backend/space`, no recorded fixture file.
- Home eligibility narrows: 203 of 2,102 mineable systems (9.7%, measured) stop qualifying; spawn still always succeeds.
- No schema, migration or backfill; the change is reversible by redeploy, and homes selected under (d) remain valid if reverted. Backend and frontend may deploy in either order: an old frontend shows the generic line.
