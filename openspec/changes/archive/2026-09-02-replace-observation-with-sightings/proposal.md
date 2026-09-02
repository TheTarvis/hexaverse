## Why

After link 4, no fleet can ever jump. Spawn charts zero lanes
(`observation.RevealArrival` mints home `explored` only), the scan verb that
used to chart lanes is deleted, and travel-arrival charting only charts the
lane a jump already crossed — which requires already having a charted lane
to jump on in the first place. That circularity is fatal, and it is only the
first of five blockers, three of them in code and two of them silent because
every unit test injects a fake for the thing production forgot to wire, plus
a fifth discovered only once this change went to build the loop it depends
on:

1. **The charting circularity itself** — dissolved by dropping the
   charted-lane precondition on `Jump` entirely. Gates are bodies now, so
   *reaching* one physically is the constraint; charting demotes to map
   knowledge and a sellable intel product, never a permission.
2. **`system/handler.go`'s `chartedGates` hides every gate from a fresh
   corporation**, so there is nothing to fly to even once charting stops
   gating the jump itself.
3. **`fleet.GraphSource` has no production implementation, and `router.go`
   never calls `WithGraph`/`WithTierSource`** — `POST /v1/fleets/:id/jump`
   returns `500` for every real caller, before any game rule runs. CI has
   never seen this: `jump_verb_test.go` injects a `fakeGraph`.
4. **`galaxy.EnsureLaneHorizon` has no production caller at all** — the
   endless galaxy silently stops growing at the currently materialized
   frontier the moment a fleet reaches it.
5. **The spliced trading station has no continuous position or size** —
   `system.StationContinuousOrbit` and the station's configured `Size` are
   unit-tested against their own determinism and never called by
   `spliceStation`, so the home station is silently absent from every
   `GET /v1/systems/:systemId` response, for every requester including its
   owner. The board is the only playable view, so M11's dock-then-sell loop
   is unreachable through the UI until this is fixed (design.md Decision 29).

Underneath the traversability crisis is the second half of this link's job:
`backend/disclosure` shipped at an earlier link as a pure mechanism with
zero consumers, and `system-interior`'s interior read still serves a stated,
temporary, fully-disclosed interim that names this change as its successor.
Wiring `disclosure` into the reads that decide what a corporation perceives,
giving its focused scan a verb and a price (time on the sensor channel,
scaling with range — the scan itself emits, and fuel is explicitly rejected
as its currency per the settled 2026-08-29 ruling), and persisting what it
mints as the one deliberate exception to "live disclosure persists
nothing" — the sighting pile, readable and inert, sellable in a later
change, and never itself consulted to decide live disclosure — is what
finally gives the model shipped in `proximity-disclosure` something to run
on. Masking also widens in the same pass from "a ship docked to a host" to
any attached object, so a future body-attached mine is masked by the rule
that already exists rather than needing a second implementation invented
for it.

`observation` dies as a capability, but not as behaviour: its four
graph-tier requirements (the knowledge ladder, the charted-lane projection,
and its two arrival writers) are still exercised by `market`, `stations`,
`corporations`, and `galaxy-generation` today, so they are **moved** intact
to a new capability, `galaxy-knowledge`, in a renamed Go package
(`backend/charts`) — not deleted and not reinvented under another name once
this link needs them again.

## What Changes

- **Restore traversability end to end**: drop `Jump`'s charted-lane
  precondition (jump-eligibility becomes "attached to the lane's own gate
  body, no dwell"); delete `chartedGates`, `BoardFog`'s tier lookup, and
  `system-interior`'s *Charted Lane Gate Filtering* requirement so every
  gate body ships unfiltered; implement a production `fleet.GraphSource`
  and construct `fleet.Service` with it as a **required positional
  constructor parameter** (there is no `WithGraph` to wire — Decision 22
  deletes that optional-wiring shape outright, along with
  `WithTierSource`/`TierSource`, since Decision 2 removes what they gated),
  so the dependency cannot be silently omitted in `router.go` again; call
  `galaxy.EnsureLaneHorizon` at jump **commit** — before the order is
  committed and therefore before transit begins — failing the jump order
  closed with a distinguishable, retryable reason if materialization fails,
  with a redundant idempotent confirmation retained at the arrival site
  (design.md Decision 28), so an arriving fleet is never stranded with a
  truncated gate set.
- **Rehome `observation`'s four surviving graph-knowledge requirements** to
  a new capability, `galaxy-knowledge`, in Go package `backend/charts`
  (`charts.Tier`, `charts.TierExplored`, `charts.ChartedLanes`,
  `charts.ArrivalWrites`), across the eleven production files that consume
  `observation.Tier` today. **BREAKING**: the stored collections rename
  (`corporations/{cid}/observations/*` → `.../charts/*`,
  `corporations/{cid}/lanes/*` → `.../chartedLanes/*`) with no data carried
  — dev data is regenerated by `make seed` plus a re-spawn, and prod is
  unused. `FeatureObservation` and its DAO paths (no successor) are deleted
  with the rest of the package.
- **Add three cheap charting writers**: jump arrival (`via: traveled`,
  unchanged), attaching to a gate body (`via: gate`, computed purely from
  the destination system id with no read), and purchased intel (schema
  room only — no writer in this change).
- **Delete `backend/observation` and the `observation-fog-and-scan` spec
  outright**, once its four surviving requirements have moved.
- **Make bodies public, permanently**: every body in a materialized
  system's interior — geometry, composition, threat detail, a gate's
  destination — ships in full to every authenticated requester,
  unconditionally. This replaces `system-interior`'s stated interim with a
  principled rule: the intel economy this change builds is about ships,
  never body composition. Two unmodified specs otherwise contradict that
  rule and take deltas of their own: `trading-station`'s tier gate on "the
  board read" narrows to the **direct** station-read endpoint only (the
  station is in fact dropped from every interior read today —
  `applyContinuousCascade` fails to decode its missing orbital elements and
  omits it; task 10.7's splice-seam fix is what makes this narrowing true
  rather than aspirational), and `system-body-table`'s "only through a
  disclosure filter" exception
  narrows to ship presence alone — bodies are served unfiltered.
- **Wire `disclosure` into the interior read**: a top-level `contacts`
  array, deduplicated by target across the requester's own fleets in the
  system, alongside the pre-existing `features`/`laneGates`. **Additive on
  the wire** — `footprint`, `band` (constant `"visible"`), `live` (constant
  `true`), and `laneGates[].cell` all continue to ship unchanged; continuous
  `space`/`size` and `contacts` ship alongside them, not in place of them.
  The live board stays the only playable view until a later link deletes
  the lattice fields.
- **Make fleet read endpoints own-fleets-only, permanently** (no longer a
  temporary interim): a foreign fleet has no addressable identity and 404s
  on direct fetch; its disclosed presence reaches a requester only through
  the interior read's contact projection.
- **Add the focused-scan verb**: `POST /v1/fleets/:fleetId/scan {hostId}`
  commits on the action spine's sensor channel (`activeScanId`,
  `action.KindMutating`), owned exclusively by the naming fleet's own
  corporation (see the authorization defects below), priced as a round trip
  scaling with commit-time range (frozen at commit, immune to the
  scanner's later motion), rejected at commit against live range/occlusion,
  unmasking the scanning fleet for the sweep's duration exactly as a drive
  plume does, and cancellable through `POST /v1/actions/:actionId/cancel`
  (releasing the slot, ending the sweep flag immediately, minting nothing —
  the fleet-scoped `POST /v1/fleets/:fleetId/cancel` never touches a
  running sweep). `hostId` names either a body, or a fleet owned by the
  scanning fleet's own corporation — never a foreign fleet, which would
  itself disclose that fleet's presence and range, and which no client
  surface ever hands out an id for anyway; a foreign-fleet `hostId` is
  rejected identically to an unresolvable one. The sweep also emits at a
  range-scaled floored radius on its own `Contact.Scanning` flag, distinct
  from `Contact.Emitting`.
- **Resolve a sweep into sightings via `ResolveResult.Writes`, minted from
  inside the resolve transaction** (not a post-resolve service-layer write):
  a sighting per ship masked at the host (including down an attachment
  chain), or a clean-sweep record when nothing is masked, at a
  deterministic document path so a retried resolve converges rather than
  double-minting. Geometry is re-checked at pulse-reach (the depart/arrive
  midpoint) as well as at commit, and a failed re-check fizzles — mints
  nothing, records a reason code — rather than minting stale data.
- **Add the `sighting-records` capability**: new package `backend/sightings`
  storing at `corporations/{cid}/sightings/{id}`, serving
  `GET /v1/sightings` for the requester's own corporation only, paginated
  newest-first. `sightings` may import `disclosure`; `disclosure` may never
  import `sightings` — an import-direction rule enforced at compile time by
  the existing purity allow-list test, making "no stored record decides
  live disclosure" unbreakable rather than a review obligation. A sighting
  is immutable, never expires, and stores its target id without ever
  serializing it to the client. `fleet` also imports `sightings` — it is
  where the focused-scan resolver that mints records lives, alongside
  `BurnResolver` — while `system`, which assembles the interior's
  `contacts` response, is compile-time forbidden from importing it, so the
  narrow rule is "no package that assembles a live-disclosure response
  imports the pile," not "no package downstream of a scan does."
- **Widen masking** from "a ship docked to a host" to any attached object,
  so a body-attached mine is masked by the same rule the instant a mine
  entity exists, with no second masking implementation needed for it.
- **Close two authorization defects together, not separately**: the six
  fleet command endpoints — the five movement-command endpoints plus the
  focused-scan endpoint this change introduces — and the four
  action-dispatch endpoints (`/actions?actor=`, `/actions/:id`,
  `/acknowledge`, `/cancel`) both gain an owning-corporation check,
  responding `404` (not `403`) on mismatch or no corporation. Closing only
  the fleet side would leave a bypass to the same movement-channel slot
  through `/actions/:id/cancel`; omitting `scan` from the fleet side would
  let a foreign corporation claim a victim fleet's sensor-channel slot and
  strip its masking on demand. `request-authorization`'s own "Corporation
  Resolution Seam" carried a scenario asserting the pre-closure behavior as
  current fact; it takes a delta here too, retiring that scenario rather
  than shipping a stale acceptance test, and `mine-extraction`'s citation
  of the closed `fleet-movement` baseline is corrected in the same pass.
- **Make the jump-wiring defect impossible to repeat**: `GraphSource`
  becomes a required constructor parameter (no more optional `WithGraph`
  that can be silently omitted), and `fleet/service.go`'s `NewService()`
  landmine — a hand-copy of `RegisterResolvers`'s first line that has
  historically dropped `jumpType` — is fixed by deleting resolver
  registration from the constructor entirely, backed by a test asserting
  `RegisterResolvers` is the package's sole registration call site.
- **Housekeeping**: delete `common.Tuning().AmbientRadius`/`.ScanDuration`
  (superseded by `disclosure.PassiveRange` and the range-scaled sweep
  price); resync `check.py`'s `DETERMINISM_GO_PACKAGES` against
  `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES` (out of sync by
  three packages — `polar`, `space`, `disclosure` — closed together, plus
  an equality assertion so the drift can't recur); add
  `fixtures/disclosure/mirror-map.json` in anti-mirror mode (`disclosure`
  is Go-sole-authority — no TypeScript mirror, now or ever); correct
  `chain.md`'s link 5 "Touches" list (it omits `action-dispatch` and
  `galaxy-generation`, states the four rehomed requirements as simply
  REMOVED rather than moved to `galaxy-knowledge`, and names only the
  charting circularity when three further blockers exist); and record
  `CleanupFirestoreTestData()` as a sixth instance of the hand-maintained
  list species this change's own `check.py` fix is the fifth of.

## Impact

- Affected specs: `galaxy-knowledge` (new), `sighting-records` (new),
  `focused-scan` (new), `proximity-disclosure`, `fleet-movement`,
  `fleet-roster`, `board-view`, `galaxy-view`, `trading-station`,
  `observation-fog-and-scan` (deleted), `system-interior`,
  `system-body-table`, `galaxy-generation`, `action-dispatch`,
  `corporation-spawn`, `request-authorization`, `mine-extraction`.
- Affected code: `backend/observation` (deleted), new `backend/charts`,
  new `backend/sightings`, `backend/disclosure` (widened masking, `Scanning`
  contact flag, `Sighting.SystemId`), `backend/fleet` (jump precondition,
  `GraphSource`/`ScanWindow`, ownership checks, constructor fix, plus a new
  `galaxy` dependency threaded into `fleet.Service`'s constructor for the
  commit-time `EnsureLaneHorizon` call and its fail-closed
  `ErrDestinationNotReady` sentinel, and a redundant idempotent
  confirmation call at the arrival site),
  `backend/system` (gate filtering removed, `contacts` array, bodies-public
  rule, `addGates`'s `EnsureLaneHorizon` call removed entirely, `spliceStation`
  completed with the station's continuous position and size),
  `backend/galaxy` (exported lane-id helper — `EnsureLaneHorizon` itself is
  now called from `backend/fleet`, not from `backend/galaxy`),
  `backend/corporations`, `backend/stations` (drop the
  `observation.InteriorSource` exclusion, which no longer has anything to
  exclude from, and delete the orphaned `continuous_orbit.go`/
  `continuous_orbit_test.go` delegate that `spliceStation`'s completion
  supersedes), `backend/market` (rename `observation.Tier` → `charts.Tier`),
  `backend/action` (ownership check, `ActorOwner`), `router.go`, `cmd/seed`,
  `common/tuning.go`, `common/firestore_test_helpers.go`, and **the
  frontend's roster jump-command gate, gate-selection unification, and the
  jump command's lane-id wiring end to end** (`fleet-roster`'s
  command-surface logic drops its client-side charted-lane check, since
  jump-eligibility is now attachment alone and the client's charted set
  arrives on a differently cadenced read than attachment does;
  `lib/types/system-board.ts`'s `LaneGate` gains `laneId` (later made
  required once its three pre-existing test fixtures carry it) and the
  board view's `handleJump` wires it through to the jump commit;
  `SystemBoardView.tsx`'s burn command drops its `'gate'`-selection special
  case so a selected lane-gate body commands a burn through the same path
  as any other body; and `GalaxyView.tsx`'s own `handleJump` resolves the
  attached gate's lane id from the **fleet DTO's own `laneId` field**
  (`fleet-movement`: *Fleet Read Serves the Attached Gate's Lane Id*) and
  submits a real jump order in place of its placeholder toast — never from
  `GET /v1/galaxy`'s `links[]`, which is charted-filtered and therefore
  empty for exactly the just-attached fleet this command exists to serve;
  a new cross-stack fixture pins the galaxy-link-id/lane-id equality
  separately, as a general regression guard rather than as this command's
  source — these are this link's concrete frontend changes; contact/
  space rendering itself stays link 8's), `.claude/scripts/check-mirror-map.sh`,
  `.claude/skills/code-quality-checks/check.py`, `docs/plans/continous_space/chain.md`.
- `observation-fog-and-scan` is deleted with **no `specs/observation-fog-
  and-scan/` delta in this change** — see "Retiring
  `observation-fog-and-scan`" above for why (the archiver rejects a rebuilt
  spec left with zero requirements) and task 7.6 for the manual follow-up
  that removes `openspec/specs/observation-fog-and-scan/` after archiving.

**Out of scope, deliberately**: market integration for sightings and the
listing-fee sink (link 6); fuel as the scan's currency (link 7);
`disclosure.ScanMints` and a radial-scan verb, left knowingly orphaned like
`board.BeamCells` — no verb is invented to give it a consumer; mines as
entities and the combat they belong to (deferred); contact rendering on the
client (link 8); **the focused scan's entire player-facing surface**
(link 8) — this change ships the verb with no affordance whatsoever: no
scan command anywhere in the UI, no `scan` method on
`frontend/lib/services/fleet-service.ts` and no `useScan` hook behind one,
no testid, and no view for `GET /v1/sightings` either, so both the sweep
and the pile it mints are reachable through the API only. A scan button
whose results cannot be seen is half a feature shipped twice, and link 8
(`build-production-space-view`) already owns contact rendering, so the
command surface and the sightings display belong in the same change and
land there together; `board`/`polar` deletion and the lattice wire fields
(link 9); `fleet.Service.Get`'s fold-through-`space.StateAt` retrofit
(verified not forced here — `disclosure` already folds through
`space.StateAt` internally on every position it takes, so an unsettled but
due burn yields the same disclosure answer as a settled one; carried to
link 6, where mine/sell/dock start reading stored state in ways disclosure
does not); and the general hand-maintained-registry-derivation fix (its own
change — this link only enrolls the one list it is about to make
load-bearing; a wiring-obligation checker (a `// WIRE-BY: <change-id>` marker
plus a Go AST check that fails when a marked function has no non-test caller)
is the structural answer to the blocker-3/4/5 species and is deferred to its
own change, because it is a CI mechanism no requirement here demands).

## Retiring `observation-fog-and-scan`

This change retires the `observation-fog-and-scan` capability entirely, but
none of its four requirements are deleted in substance — each is rehomed to
the new `galaxy-knowledge` capability (design.md Decision 1), restated over
the renamed `backend/charts` package and the renamed
`corporations/{cid}/charts/*` collection (from
`corporations/{cid}/observations/*`, no data carried across — dev data is
regenerated by `make seed` plus a re-spawn, and prod is unused; per
docs/plans/continous_space/README.md's no-backcompat ground rules).

- **Monotonic Graph-Tier Knowledge Ladder** → `galaxy-knowledge`'s
  "Monotonic System-Knowledge Ladder". This requirement never described the
  live sensor-coverage model the continuous-space pivot deleted; it answers
  a different, still-live question ("what does this corporation know about
  the galaxy graph") that four other capabilities' current behaviour still
  depends on.
- **Travel Arrival Reveal** → `galaxy-knowledge`'s "Travel Arrival Knowledge
  Write". This graph-knowledge writer survives unchanged in substance.
- **Spawn Arrival Reveal** → `galaxy-knowledge`'s "Spawn Arrival Knowledge
  Write". This non-action reveal writer survives unchanged in substance.
- **Charted-Lane Set Projection** → `galaxy-knowledge`'s "Charted-Lane Set
  Projection". The charted-lane set answers the same graph-knowledge
  question the ladder does and survives unchanged in substance. The package
  this capability lived in (`backend/observation`), its spec, and the
  `FeatureObservation` per-feature memory it also held (no successor —
  design.md Decision 1) are deleted in the same change.

**Why this change carries no `specs/observation-fog-and-scan/` delta**: a
capability cannot be retired through `REMOVED` deltas alone. The archiver
validates the *rebuilt* spec before writing anything, and rejects one left
with zero requirements ("Spec must have at least one requirement"), aborting
the archive for the entire change — not just this file. This holds even if
`openspec/specs/observation-fog-and-scan/` is deleted ahead of time (the
archiver then treats it as a *new* spec and applies the same
≥1-requirement rule). The only working mechanism is to omit the delta
directory entirely and delete the spec folder by hand after archiving (task
7.6) — the same path `polar-lattice-math` took in commit `4b7f0a2`. This is
a repo-wide OpenSpec mechanic, not specific to this change.

## Known Carried Debris

Two more capabilities carry prose that goes stale the instant this change
archives, beyond the two citations corrected above
(`fleet-movement`'s and `request-authorization`'s). Neither is fixed in
this change — fixing either means opening a brand-new delta directory for a
capability this change otherwise leaves untouched, for a prose-only
citation, and one of the two capabilities is itself scheduled for deletion
before that fix would matter:

- **`market-price-board`**'s requirement "Live Quotes, Never Frozen At An
  Observation's asOf" (and its purpose-section prose) frames its live-vs-
  frozen distinction in terms of "observation's `asOf`" — a concept this
  change retires along with the `observation-fog-and-scan` capability.
  `market-price-board` carries no delta in this change and is left with a
  stale conceptual reference; the requirement's own behavior (quotes are
  live, never frozen) is unaffected.
- **`board-view`**'s "System Board Route and Data Fan-In" cites
  `system-interior`'s unfogged-interim framing ("design.md Decision 11:
  every feature is served live... until link 5 replaces this with a
  `disclosure` projection") — the interim this very change replaces. This
  stale citation is not fixed here: it is prose-only, and `board-view` dies
  outright at links 8–9 of `docs/plans/continous_space/chain.md` (the
  lattice-board deletion), so a delta correcting it now would itself be
  dead weight within two links.

Both of the above are prose-only staleness, not behavioral drift, and both
are left for whichever future change next touches their capability for a
substantive reason. **This does not extend to `board-view`'s *Jump
Commit* requirement added in this change**: that requirement is not a
stale citation but the behavior that makes this link's traversability fix
reach the player at all (`system-interior`'s *Lane-Gate Bodies Carry Their
Lane Id* closes the wire gap; nothing closed the player-facing one before
it). A `board-view` delta was warranted here specifically because the gap
was behavioral, not prose — the same distinction that keeps the
`market-price-board` and route-citation items above out of scope.
