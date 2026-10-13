## ADDED Requirements

### Requirement: Own-Fleet Ship Model Presentation

The system renderer SHALL represent each published own-fleet mark with one original compact utilitarian ship model, showing a forward hull, paired propulsion structures and layered metallic surfaces instead of a single primitive. The model represents the fleet mark, not a claim about its ship count or class. Existing burn, parked and drift distinctions SHALL remain visible independently of hull surface color.

#### Scenario: Ship at gameplay and close zoom
- **WHEN** an own fleet is visible at default gameplay framing and then inspected at close zoom
- **THEN** it has a recognizable elongated ship silhouette at gameplay framing and distinguishable hull, propulsion and layered metallic structure at close zoom
- **AND** its lit and shaded surfaces remain visible against the system backdrop

#### Scenario: Fleet mode changes
- **WHEN** the same own fleet changes between burning, parked and drifting published modes
- **THEN** its mode cue changes to the existing mode color without losing the ship model
- **AND** its burn path, arrival preview or drift heading retains its existing behavior

### Requirement: Served Station Model Presentation

The renderer SHALL represent a published body whose served type is station with an original orbital station model comprising an outer ring, central hub, radial connections and layered modules. The model SHALL preserve the body's station classification and remain visually distinct from ships and planetary spheres.

#### Scenario: Station at gameplay and close zoom
- **WHEN** a served station is visible at default gameplay framing and inspected at close zoom
- **THEN** a ring-and-hub silhouette distinguishes it from ships and planets at gameplay framing
- **AND** close zoom reveals radial connections, modules and lit metallic surfaces

#### Scenario: Station classification changes
- **WHEN** a mark retains its identifier but its served body type changes from station to rocky or from rocky to station
- **THEN** the rendered appearance matches the current type with no residual prior model
- **AND** other body types, including gates, retain their existing treatment

### Requirement: Model Interaction Envelope Preservation

Ship and station models SHALL use the published mark center and existing drawn radius, selection scale and hit-target semantics. Opaque model geometry SHALL remain within that radius before selection scaling. Model integration SHALL NOT change camera state, continuous motion, HUD state or command targeting. Acting-fleet and selected-target reticles SHALL remain distinguishable from model surfaces and each other.

#### Scenario: Station pointer and keyboard selection
- **WHEN** a player selects a station using its visible hull or keyboard hit target after orbiting and zooming
- **THEN** the same station body becomes selected using the existing selection behavior
- **AND** the selected reticle encloses its model at the published center

#### Scenario: Acting ship and selected station coexist
- **WHEN** an own fleet is acting while a station is the selected target
- **THEN** the green acting ring remains on the ship and the cyan selection ring remains on the station
- **AND** activating the fleet preserves its existing acting-fleet semantics rather than making it a burn target

#### Scenario: Published positions advance
- **WHEN** the published frame changes fleet or station positions with camera and selection held constant
- **THEN** model centers follow those positions exactly with unchanged radii and hit geometry
- **AND** the model renderer computes no movement rule, gameplay quantity or additional world-clock reading

### Requirement: Model Disclosure Boundary

Detailed models SHALL be created only for published own-fleet marks and published station bodies. Contacts, sightings and arrival previews SHALL retain their existing distinct presentations without acquiring an inferred hull identity or station classification from incidental fields. A model SHALL disappear when its published mark disappears.

#### Scenario: Anonymous contact remains abstract
- **WHEN** an own fleet and an anonymous foreign contact are published while world time advances
- **THEN** only the own fleet gains the ship exemplar
- **AND** the contact remains anonymous at its served position with its existing emitting and scanning distinctions
- **AND** sightings and arrival previews retain their separate abstract treatments

#### Scenario: Withdrawal and empty scene
- **WHEN** fleet or station marks are removed, including removal of every such mark
- **THEN** no corresponding model remains or is inserted as showcase decoration
- **AND** no hidden entity is fetched to replace it

### Requirement: Model Asset Loading Resilience

The view SHALL display a nonblocking fallback while a local model asset is loading or unavailable, preserving the mark's position, interaction and mode cues. A successful asset load SHALL replace only currently eligible appearances. Failed asset loads SHALL NOT cause a renderer-unavailable state or a new blocking page state. Runtime rendering SHALL NOT depend on access to a model-generation service.

#### Scenario: Pending asset and successful replacement
- **WHEN** the ship or station asset load is delayed and then succeeds
- **THEN** the mark remains visible and interactive through its fallback until its model replaces that fallback
- **AND** positions, acting state and selected state remain current across replacement

#### Scenario: Missing or invalid asset
- **WHEN** an asset request fails or decoding rejects the model
- **THEN** the affected mark retains a usable fallback and the rest of the scene continues rendering
- **AND** no uncaught load error or page-level blocking state is introduced

#### Scenario: Stale completion cannot restore a model
- **WHEN** an asset completes after its mark was removed, changed to an ineligible kind or type, or its renderer was unmounted
- **THEN** it attaches no obsolete model and creates no duplicate scene mark
- **AND** any result no longer owned by a live cache or renderer is released

### Requirement: Model Resource Ownership and Cost Bounds

Model rendering SHALL reuse asset requests and visual resources across unchanged frames, with bounded authored geometry, materials and texture dimensions documented in the implementation contract before tests are written. Removal, appearance replacement, system changes and renderer teardown SHALL release resources no longer owned by any live appearance or asset cache without disposing resources still used by another mark. Loading or recovery SHALL NOT introduce an additional animation clock or animation loop.

#### Scenario: Repeated frames and multiple marks
- **WHEN** unchanged frames render multiple own fleets and stations using the same model assets
- **THEN** unchanged appearances allocate no new geometry, materials or textures per frame and issue no duplicate in-flight asset requests
- **AND** each model remains within the documented geometry, material and texture budgets

#### Scenario: Replacement removal and remount
- **WHEN** an appearance is replaced, one of two model instances is removed, the system changes and the renderer subsequently unmounts and remounts
- **THEN** resources are released according to ownership without breaking the remaining instance or double disposal
- **AND** the remount restores the same authored appearance without retained obsolete models

#### Scenario: Renderer recovery and reduced motion
- **WHEN** the existing renderer retry creates a new attempt or reduced-motion preference is enabled
- **THEN** prior-attempt model resources are released before the new attempt owns replacements
- **AND** model presentation respects the existing renderer recovery and reduced-motion behavior while published positions continue advancing

### Requirement: Selected Spacecraft Detail Preview

An open detail panel for an explicitly inspected own fleet or selected served station SHALL show one real 3D preview below the object's name, using the same local model asset and eligibility as the map. Its height SHALL be between 180 and 220 CSS pixels, with a transparent background, dedicated lighting and a fixed initial three-quarter pose that frames the complete model. The station preview SHALL replace its existing decorative planet thumbnail. Other object thumbnails SHALL remain unchanged; list rows, anonymous contacts, sightings and arrival previews SHALL NOT gain model previews. The preview SHALL NOT infer a ship class, count or operational capability from model appearance.

#### Scenario: Station detail preview
- **WHEN** the player opens the selected served station's details
- **THEN** its name precedes a 180–220 CSS-pixel-tall real 3D station preview using the map's station asset, with the complete ring and hub visible against the transparent background
- **AND** its existing facts and actions remain available below the preview without the old planet thumbnail

#### Scenario: Own-fleet inspection preview
- **WHEN** the player deliberately opens inspection of an own fleet through a pointer- and keyboard-reachable affordance
- **THEN** a persistent detail panel names that fleet and shows the same ship asset as the map below its name
- **AND** inspection does not make the fleet a burn target or issue a gameplay command

#### Scenario: Ineligible objects retain existing presentation
- **WHEN** a planet, gate, contact, sighting or arrival preview is inspected, or an object list is shown without an eligible detail panel
- **THEN** no ship or station preview is created for it
- **AND** other object thumbnails and existing facts remain unchanged

### Requirement: Isolated Accessible Preview Orientation

Players SHALL be able to rotate the preview by dragging and by keyboard-equivalent controls, and restore its fixed initial pose. Preview input SHALL NOT orbit, pan or zoom the map, change selection or acting fleet, or issue gameplay commands. The preview SHALL expose an accessible name identifying the inspected entity and instructions describing its orientation controls. Preview animation SHALL NOT auto-rotate, including under reduced-motion preference; keyboard focus SHALL be visibly indicated and able to leave the preview through normal navigation.

#### Scenario: Pointer rotation and reset
- **WHEN** the player drags the preview and then invokes its reset control
- **THEN** only preview orientation changes and reset restores its fixed initial three-quarter pose
- **AND** the map camera, selected target, acting fleet and gameplay command state remain unchanged

#### Scenario: Keyboard orientation and focus exit
- **WHEN** a keyboard-only player focuses the preview controls, changes horizontal and vertical orientation, resets the pose and tabs onward
- **THEN** the player can perform the same orientation operations without dragging, receives visible focus and can reach the next panel control
- **AND** accessible naming and instructions identify the entity and operation without inventing hull identity

#### Scenario: No autonomous rotation
- **WHEN** the preview is left open without orientation input with either normal or reduced-motion preference
- **THEN** its orientation stays fixed while the map continues its existing published-position behavior

### Requirement: Preview Availability Does Not Block Details

Preview loading, asset failure, unavailable GPU or interrupted rendering SHALL leave the detail panel's name, facts and existing actions usable and keyboard-reachable. Loading and unavailable states SHALL be identified in player-readable accessible text scoped to the preview. Preview failure SHALL NOT place the map in its renderer-unavailable state. Successful loading SHALL preserve the current inspected entity and any orientation input already accepted during that preview session.

#### Scenario: Delayed preview load
- **WHEN** the preview asset remains pending while the player reads facts or uses existing detail controls
- **THEN** a preview-local loading state is announced without hiding facts or disabling those controls
- **AND** successful loading replaces the loading presentation for the current entity without resetting accepted preview orientation

#### Scenario: Failed asset or unavailable rendering
- **WHEN** preview asset loading fails, model decoding fails, GPU creation is unavailable or the preview context is lost
- **THEN** the preview shows accessible unavailable text without an uncaught error
- **AND** facts, panel close and existing actions remain usable while the map retains its independent renderer state

### Requirement: Selected-Only Preview Resource Lifecycle

Only visible eligible detail panels SHALL own live preview renderers. Closing or hiding a detail panel, removing its entity, changing it to an ineligible type or leaving the system SHALL release preview-owned rendering resources and listeners and cancel pending preview draws. Reopening or inspecting a different entity SHALL start at the fixed initial pose. Late asset completion SHALL NOT resurrect a hidden or obsolete preview. Preview resources SHALL have explicit ownership separate from the map so disposal cannot invalidate map models; previews SHALL reuse the map asset files and existing model cost bounds without creating one renderer per object-list row.

#### Scenario: Closing or hiding a retained panel
- **WHEN** a preview's detail panel is closed or its containing object browser is hidden even though command components remain mounted
- **THEN** no preview renderer or pending preview draw remains active for that hidden panel
- **AND** preview-owned resources and listeners are released while the map models and preserved command state remain intact

#### Scenario: Entity change and late completion
- **WHEN** the inspected entity changes, disappears, becomes ineligible or the system is left before its preview asset finishes loading
- **THEN** late completion attaches no obsolete preview and releases resources without a live owner
- **AND** inspecting a new eligible entity starts at the fixed initial pose with that entity's model

#### Scenario: Reopen and bounded instances
- **WHEN** a detail panel is repeatedly opened and closed while an object list contains many ships or stations
- **THEN** only visible eligible detail panels own previews, each within the existing model cost bounds, with no accumulating renderers or listeners
- **AND** reopening restores the complete model in its fixed initial pose without disposing resources owned by the map

### Requirement: Owned Fleets in the Objects Browser

The Objects browser SHALL include a Fleets group containing exactly the requester's own fleets from the latest successful owned-fleet read that belong to the open system and are not in lane transit. Parked, burning and drifting fleets SHALL all qualify. Eligible fleet rows SHALL contribute to the Objects count and be searchable by served fleet id and fleet kind. Foreign contacts and fleets in other systems or lane transit SHALL NOT appear in this group. An initially loading or latest failed owned-fleet read SHALL withhold fleet rows and fleet details without disabling available body and station rows. A successful read containing no eligible fleets SHALL render no fleet rows or empty Fleets group.

#### Scenario: Local fleets join count and search
- **GIVEN** three eligible own fleets in the open system, one parked, one burning and one drifting, plus a remote own fleet, a lane-transit own fleet and a foreign contact
- **WHEN** Objects is opened and searched by an eligible fleet's served id or fleet kind
- **THEN** the Fleets group contains only the three eligible own fleets, each contributes once to the total Objects count, and search finds the matching fleet rows
- **AND** the remote fleet, lane-transit fleet and foreign contact contribute no fleet rows or count

#### Scenario: Fleet read unavailable or empty
- **WHEN** the owned-fleet read is initially loading, fails after previously returning fleets, or successfully returns no eligible fleets
- **THEN** stale fleet rows and fleet detail previews are absent and the count excludes them
- **AND** available body and station rows remain searchable and inspectable with their existing details
- **AND** an empty Fleets group is not rendered

### Requirement: Objects Fleet Inspection Is Separate From Commanding

Selecting an eligible fleet row SHALL open its served identity and status with the existing shared ship preview below its name, using its current mode accent, without changing the acting fleet or the current body, gate or point command target. Fleet inspection SHALL have an identity distinct from body selection even when raw ids coincide. It SHALL offer camera Focus through the existing fleet-focus behavior when the published scene resolves that fleet's position, and SHALL NOT offer Plot course, body resources or station services as fleet actions. Any additional facts SHALL come from supplied fleet fields or existing status derivation. Existing preview accessibility, loading, input isolation and disposal requirements SHALL apply. Departure, deletion, system change or loss of successful-read membership SHALL withdraw stale fleet details without implicitly inspecting another fleet. The existing chevron inspection path SHALL remain available under its existing eligibility.

#### Scenario: Inspect fleet without changing acting or target
- **GIVEN** fleet A is acting and a station is the command target
- **WHEN** fleet B's Objects row is opened by pointer or keyboard
- **THEN** its served id and status accompany the shared ship preview with fleet B's mode accent
- **AND** fleet A remains acting and the station remains the command target, with no game command or navigation issued
- **AND** no Plot course, body-resource facts or station-service actions are presented as fleet details

#### Scenario: Distinct identity and explicit fleet focus
- **GIVEN** an eligible fleet and body have the same raw id
- **WHEN** the fleet row is inspected and its Focus action is invoked
- **THEN** fleet details remain distinct from body details and the camera focuses that fleet through the existing fleet-focus behavior without activating it
- **AND** if its position is unavailable in the published scene, Focus is disabled while inspection remains usable rather than using the body's position or inventing one

#### Scenario: Eligibility changes withdraw fleet details
- **WHEN** an inspected fleet departs into lane transit, moves to another system, is deleted, or the latest owned-fleet read fails
- **THEN** its Objects row and detail preview are withdrawn and preview resources are released
- **AND** no replacement fleet is automatically inspected and available body/station details remain usable

#### Scenario: Close hide and live status refresh
- **WHEN** an eligible inspected fleet's served mode changes, then its details or Objects panel are closed and reopened
- **THEN** the open preview updates its mode accent and served status without resetting accepted orientation on the same identity
- **AND** closing or hiding releases the preview, reopening restores its fixed initial pose, and the separate chevron inspection path retains its existing behavior
