## Context

The system renderer currently represents fleets as glowing spheres and stations
as octahedra. The reference calls for readable metallic volumetric ships and a
ring/hub station. The active scene-art change supplies lighting, planets and a
hex plane; its working-tree changes must remain intact. The user subsequently
confirmed Meshy is connected. Asset generation requires the root agent's
explicit credit confirmation before execution; this design does not authorize
spending by itself.

## Goals / Non-Goals

Deliver one original ship and one original ring/hub station as locally versioned
Meshy-derived GLBs, integrated into the existing renderer with immediate native
fallbacks. Preserve identity, picking, mode cues, positions and resource cleanup.
Add a selected station / inspected own-fleet panel preview using the same model.
No hull catalog, backend/API change, new simulation rules, remote runtime asset
service, map camera redesign, independent animation clock or broader HUD redesign.

## Decisions

### Keep the published scene as the authority

Only `kind: fleet` receives the ship exemplar. Only `kind: body` with served
`bodyType: station` receives the station. Contacts, sightings, ghosts and other
ambiguous marks retain their existing abstract rendering even if they carry a
misleading bodyType. No fetching undisclosed objects, generated placements or
inference of operational classification from an asset or ID. Native and imported
models share the same published coordinates, radius and current selected scale.

### Use generated assets, with an immediate deliberate fallback

Use Meshy to author the requested original hard-surface assets after credit
approval. Export GLB, inspect actual geometry/materials, optimize offline and
commit local files under `frontend/public/models/space/`. Runtime uses Three's
existing GLTFLoader addon against these fixed same-origin paths, never a Meshy
URL or API credential. Generation jobs, prompts, original/download provenance
and optimization measurements belong in the change handoff. No claims about
external generation capability or pricing are prerequisites for this design.

During loading or failure, show a native multi-part wedge-hull ship or ring/hub
station immediately. A failed load keeps that fallback and the ordinary scene
interactive. No spinner, full-canvas blocker or gameplay data fetch. Assets may
replace fallbacks only while the corresponding entry remains current. Removed,
retyped or unmounted entries cannot be resurrected by an old completion.

### Art direction and coordinate convention

Ship: forward tapered wedge hull along local negative Z, paired swept engine
nacelles, layered light silver armor, dark structural recesses and cockpit inset,
and restrained cyan engines. Station: outer inhabited ring in XZ, substantial
central stacked hub along Y, six or eight spokes with visible negative space, docking
collars and sparse cyan window bands. Geometry must remain recognizable from
oblique default gameplay view and close zoom. No copied insignia or reference
ship geometry. Neutral metal has moderate roughness and modest metalness so it
reads without an environment map under existing ambient/star lighting.

Normalize the entire model including accents to a sphere centered on its mark
with radius at most one. Preserve `drawRadiusOf`, existing draw scales and the
frame loop's root scale assignment. Do not enlarge only a child to compensate
for the loop overwriting the root scale. Existing markers can be tiny in a wide
system view: readable distinctive silhouette at the existing scale is the goal;
close zoom reveals plating. If visual review shows this insufficient, report the
constraint and propose a separate tested size/picking change instead of quietly
magnifying ships.

A substantial visible ship accent retains existing burn orange, parked green
and drift violet colors, independent of imported texture color. Cyan selection
and green acting rings remain unchanged. Imported mesh contents never determine
mode or ownership. Static orientation in this first slice does not claim an
unserved attitude; existing drift heading streak remains authoritative.

### Resource and complexity bounds

Each optimized imported model: at most 5 MiB GLB, 40,000 rendered triangles,
12 mesh material draw groups, eight distinct materials and four distinct decoded
image sources no larger than 1024 by 1024. Shared references count once for image
memory; rendered geometry counts every instance. Native fallback: at most 8,000
triangles, 12 mesh material draw groups, six materials and no textures. Prefer
merging static pieces by material to meet these limits. These are asset bounds,
not a promised frame rate. Capture renderer counters with one ship and station.

Models allocate on appearance creation and asset completion, never on unchanged
frames. A renderer-local two-kind cache owns decoded source scenes and one promise
per kind; concurrent marks share the request, and failure is negatively cached
until renderer remount. Instance creation deeply clones source hierarchy,
geometry, materials and textures with identity deduplication inside the instance.
Each appearance owns its clone; removing one never disposes another or the source.
Late subscribers attach only while their entry identity is current, even across
same-ID remove/reinsert. Teardown disposes attached clones and cached sources
separately exactly once; late source completion disposes itself. No mutable
process-wide cache, per-frame loads or retry storm on mode changes. Removal skips
only renderer-shared sphere/octahedron geometry, not newly owned model geometry.
All opaque nested materials participate in existing stencil silhouette masking
so the hex plane cannot draw across hull surfaces.

### Test seams and sequencing

The implementation contract fixes exports for real Three geometry tests and a
mockable asynchronous loader. SDET covers real bounds, material attachment,
triangles, resource events and lifecycle races before implementation. Existing
SpaceWorld and projection tests protect scale and interactions. Browser evidence
must show actual assets on the system canvas at gameplay and close zoom, both
reticles, and no shader errors. Mock renderer tests cannot prove visual quality.

### Selected-object preview uses its own demand-rendered context

Authorized follow-up adds a 200px high transparent preview immediately below the
object name, fixed initial three-quarter camera, dedicated neutral lighting and
drag rotation. Reuse the exact local URLs and createSpacecraftModel helper, with
independent preview-owned source/model GPU resources. No second asset family and
no attempt to share mutable WebGL resources with the system map. Render only on
mount, resize, asset completion or orientation input; never idle spin or a second
continuous animation loop. Device pixel ratio is capped at two. Hidden previews
unmount and dispose, even when their parent preserves command DOM with display:none.

Station placement: SystemObjectIndex details only for an exact served station
kind, between its name/type and facts; preserve non-station portraits. Its open
and details state determine actual mounting. Never add canvases to index rows.
Ship placement: VitalsStripFleetCell adds an explicit Inspect current fleet
menuitem inside its existing chevron menu, opening a persistent anchored nonmodal
detail region outside the strip. The identity itself stays noninteractive. It contains that owned fleet's name, preview and served status, with a
close button. Existing fleet-switch entries keep their original role;
transient SpaceStage hover facts remain unchanged. Closing, acting-fleet identity
change, failed own-fleets read or loss of eligibility unmounts this region. This
adds a deliberate inspection surface where no persistent ship detail currently
exists, without changing fleet-as-actor versus body-as-target semantics.

Canvas pointer capture isolates dragging from map controls. Focusable orientation
surface supports arrow keys and Home reset, with an accessible label and visible
instructions/reset control; Escape closes the owning panel and restores focus to the panel opener (the fleet chevron for ship inspection).
Preview failures, missing asset and context loss affect only its bounded visual
region, leaving facts/actions operable. Loading uses the existing native model;
failed asset keeps it with a concise status; unavailable GL shows descriptive
text and no trapping control. Reopening creates a fresh attempt and initial pose.

### Objects list includes current-system own fleets

The Objects source currently includes bodies and gates only. Add a separate
Fleets group from the already-owned fleet read: successful data filtered to the
open system and excluding lane transit, including sublight burn and drift. Do
not consume contacts, remote-fleet rows or a client visibility inference. Include
eligible fleets in count and search. A loading or failed own-fleets read removes
fleet rows/details without changing the availability of body/station rows.
Background refetch with previously successful data is not initial loading; a
failed latest attempt withholds those rows rather than freezing stale membership.

Use typed fleet inspection identity distinct from body identity so identical
served strings cannot alias a body and fleet. Objects fleet inspection changes
only a separate inspected-fleet identity, never the acting-fleet callback or
bodyId command-target state. Preserve the current body/gate/point target while
fleet details are open; do not repurpose body selection to store a fleet. Suppress Plot
course, mining and station-service content for fleet details. Show served id,
existing served-state status and shared SpacecraftPreview below the name with
the same mode accent as other ship previews. Any additional facts use existing
served fields/status derivation, never geometry or invented gameplay values.
Focus dispatches the existing fleet camera request, without activating it; if
the current published scene cannot resolve a position, keep inspection usable
but disable Focus rather than inventing a location.

Condition preview mounting on the Objects panel being visible, selected fleet
remaining eligible and its details being open. Removal, lane departure, system
change and read failure withdraw the detail and dispose its preview; do not
replace it with another fleet implicitly. Existing panel close and keyboard
focus return remain available. Keep the separate chevron inspector and its
established switching semantics unchanged. Reuse current model files and preview
helpers; no asset generation or backend change. Add focused TDD and independent
review; earlier map/menu journey remains historical evidence, not acceptance of
these new Objects entry points.

### Narrow archive compatibility repair enforces existing formatting

Archive gate inspection found storyboard freeHold locally rounded with
`toFixed(1)`. Keep its existing numeric calculation, pass the raw numeric free
hold and capacity through `formatTons` (or `formatByUnit` with tons) and render
each with `Figure`, retaining raw/unit attributes. The shared formatter's existing
precision renders 138.3 as 138 t and 128.3 as 128 t; do not preserve the incorrect
one-decimal display by preformatting text or adding a tonnage guard exception.

This implements the existing `figure-formatting` requirement **A Player-Facing
Figure Is Produced Only By the Shared Formatter** and its **No component-local
decimal rounding**, **A rendered figure's text is the module's own output for its
raw value**, and **The rounding exception list holds only quantities this
capability does not define** scenarios. No normative rule changes. The SDET owns
the two existing storyboard expectation amendments and any guard-anchor maintenance
before developer edits. Refresh only drifted non-player-facing SpaceStage anchors
and the SVG-coordinate exception with its explicit non-quantity rationale. Do not
broaden exceptions or modify unrelated storyboard behavior. Verify targeted
storyboard/formatter assertions and required repository gates; no new browser
journey for this isolated presentation repair.

### Station-spawn fixture correction preserves behavioral assertions

User-confirmed station-adjacent spawn is already implemented by the unchanged
production SeedFleetAtStation path: ModeParked/ParkOrbit, station BodyId,
InsertionStandoff/InsertionPeriod, clock epoch and AttachedTo station. It is not
a stationary point or an unattached fleet. The archive tier3 report's 19 rows
remain the repair checklist; one bootstrap unknown-body 500 is separate.

For sequential preview/commit, quoted caps, scaling and exact-funded stranding
comparisons, explicitly arrange the same nonzero safe point park, clear
attachment and action slots, use a fixed point target and identical roster/fuel
premises; compare request-relative duration when absolute clock time advances.
If a scenario requires a moving host/target, inject one controlled clock/epoch
across its solves instead of tolerating numeric drift. A saved state restored
at a later wall time is not an identical moving-origin fixture.

For unattached-near-station refuel, explicitly place a safe nearby point park
with empty attachment. Hold rejection and hostless-upkeep cases explicitly use
hostless point parks. Zero-speed stop explicitly uses zero velocity/point park
with no preexisting action; do not change the expected free-stop behavior to
accept a new burn. The settlement/refuel race explicitly establishes its intended
attached orbit and settlement timing rather than issuing a redundant burn from
the fresh station orbit back to the same station. Refund fixtures establish a
funded burn from a valid distinct origin, preserving exact refund assertions.
Keep fixture state and attachment consistent and assert those premises before
invoking the HTTP operation. Use scoped test setup/cleanup, not production edits
or global time changes leaking across tests.

Trace unchanged behavioral assertions to fleet-movement's burn-cost/cap/preview,
refund, stop and stationkeeping requirements and fuel-purchase's **Refuel Requires
the Fleet Docked To the Selling Station**. Spawn-specific tests follow the adjudicated corporation-spawn delta: verify
station attachment/free orbit, configured grant, clearance across generated accounts,
and retries preserving existing hull state. Do not issue a redundant home-host
burn or accept arbitrary geometry errors as successful reachability.

The separate bootstrap failure is independently confirmed: GetOrCreateInterior's
ErrAlreadyExists branch returns its readable winner before spliceStation and
applyContinuousCascade. Apply those same two operations in the same order as the
other successful paths, preserving unreadable-winner errors and all existing
clock/audience response behavior. Independent SDET red tests cover station
presence and cascade parity; expected bootstrap200/exactly-once assertions remain.
No broader station-seeding refactor is authorized. Run targeted fixture tests,
then one final tier3 run after accepted repairs with the tree locked, without
raising timeouts. This backend-test scope requires no new UI journey or assets.

### Atomic starter hull creation closes the second bootstrap race

The repaired tier3 run reached successful concurrent bootstrap responses but
returned different fleet ids. Current shared seedFleet performs ListByCorporation
then random-id Save; two empty observations permit two documents. A process-local
mutex cannot protect multiple service instances and is rejected. Retrying the
HTTP test or weakening its identical-id/exactly-once assertions is also rejected.

Keep ListByCorporation's existing-hull fast path: existing random-id fleets,
including fleets moved since spawn, are returned unchanged. For a genuinely new
candidate use `fleet_seed_` plus the full SHA-256 hex digest of corporationID as
its document id. This is a stable corporation-scoped starter identity, not a new
collection or ownership rule. Add `Dao.CreateIfAbsent(ctx context.Context, candidate Fleet) (*Fleet, error)`
returning the created candidate only after successful atomic persistence or the
persisted winner on AlreadyExists. Encode StateDoc as Save does and use the existing
common Firestore Create operation (atomic exists=false precondition). On
AlreadyExists read/hydrate the stored winner through the existing decode path;
verify its corporation matches and propagate unreadable/mismatch/other errors.
Never call Set on this branch and never return the losing candidate. No grant,
movement or attachment updates happen inside this primitive. All successful
healing callers then target the same returned id through the existing
exactly-once starting-fuel grant path.

Use this shared seedFleet primitive for both station and legacy point entry
points so competing seed calls cannot bypass the atomic guard. This is the only
necessary shared-path alteration: retain each caller's validation and park
construction, public signatures and existing-fleet preservation. Do not migrate
old hull ids, delete existing duplicate data, add a new collection, or refactor
movement. The SDET uses this fixed DAO signature for red
handoff; regenerate mocks and prove real emulator atomic contention, winner state
preservation, create/read errors and concurrent bootstrap identity/grant parity.
Seven residual redundant host-burn fixtures remain assertion-preserving test
repairs under task8, not a change to minimum-arc gameplay rules.

The previous tier3 run (1998 tests, 1 skipped, 8 failures) is recorded as failed,
not waived. These new production-race and fixture amendments justify targeted
checks followed by one final tier3 run with unchanged timeout after a tree lock.
Archive remains blocked until all required gates pass; no extra UI journey or
asset generation is required by this backend-only increment.

## Risks / Trade-offs

Generated meshes may have fused ring gaps, excess topology, baked illumination
or weak silhouettes. Inspect downloads before integration; optimization must not
collapse key negative spaces. Generation failure or unavailable approved credits
is a reported delivery blocker for the Meshy assets, even if native fallbacks
work. Keep the native fallback stable for runtime failure without treating it as
silent completion of the requested generated-art path. Concurrent uncommitted
scene/HUD work requires tightly scoped edits and preservation tests.

## Migration Plan

No data migration. Approve generation, acquire and inspect assets while the SDET
writes red tests; integrate helpers and renderer lifecycle after red handoff;
validate assets and code; then capture real browser evidence and run the final
journey with the tree locked. Rollback removes local assets and restores the
prior marker branch without changing game state. Do not commit or archive the
prior active change as part of this delivery.

## Open Questions

Credit approval and generated asset quality are execution gates owned by the
root agent. A generation failure requires reporting rather than substituting a
native-only completion claim. Exact surface details remain visual tuning within
the bounds above.
