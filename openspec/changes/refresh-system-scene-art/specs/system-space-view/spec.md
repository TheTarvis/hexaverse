## ADDED Requirements

### Requirement: Stellar Emission Presentation

The system space renderer SHALL present each star as a luminous sphere with continuous glow falloff beyond its silhouette, retaining its served spectral-class distinction. The glow SHALL remain centered on the star as the camera moves and SHALL NOT create a selectable entity.

#### Scenario: Warm reference star
- **WHEN** a G-class, K-class or unclassified star is visible
- **THEN** its sphere and surrounding glow show a warm luminous source with a soft falloff rather than opaque concentric discs

#### Scenario: Cool spectral classes remain distinct
- **WHEN** an O-class, B-class or A-class star is served
- **THEN** its cooler stellar tint remains distinct from the warm reference star

#### Scenario: Glow follows camera changes
- **WHEN** the user orbits or zooms around a visible star
- **THEN** the glow remains centered on the star
- **AND** clicking the glow outside existing pick targets does not select an added entity

### Requirement: Type-Preserving Planetary Surface Presentation

The renderer SHALL give served gas giants visible surface bands and served rocky bodies surface variation with a thin decorative atmospheric rim. Both SHALL retain discernible lit and shaded hemispheres. Surface patterns SHALL be deterministic for a body's identifier and served type. This decoration SHALL NOT imply a new gameplay property or change the type or membership of the served scene.

#### Scenario: Gas giant surface
- **WHEN** a served gas giant is visible at a scale where its sphere can be inspected
- **THEN** bands vary across its surface and lit and shaded hemispheres remain discernible

#### Scenario: Rocky surface and rim
- **WHEN** a served rocky body is visible at a scale where its sphere can be inspected
- **THEN** its surface varies instead of showing a uniform color and a thin atmospheric rim follows its silhouette
- **AND** no atmosphere resource, habitability status or other gameplay property is added

#### Scenario: Repeatable and refreshed classification
- **WHEN** a body is remounted with the same identifier and served type
- **THEN** its surface pattern is unchanged
- **AND** a later served type change updates its presentation to the new type rather than retaining a cached presentation of its previous type

#### Scenario: Other body types and missing features
- **WHEN** a scene contains only ice bodies and moons, or an unknown body type
- **THEN** ice bodies and moons retain their existing type distinction and the unknown type retains the existing fallback presentation without an error
- **AND** no rocky or gas-giant showcase body is inserted
- **AND** a feature absent from the served scene is not replaced by a decorative planet

### Requirement: Blue Space Backdrop

The renderer SHALL present a blue-black space backdrop behind the system, preserving visibility of the starfield, body silhouettes, orbit lines, selection and acting reticles, and navigation marks throughout the existing camera range.

#### Scenario: Existing default framing
- **WHEN** a representative system is shown at its existing default framing
- **THEN** blue color is visible in the dark backdrop and the starfield remains visible behind the planets
- **AND** orbit lines, reticles and navigation marks remain distinguishable

#### Scenario: Camera range preserves foreground visibility
- **WHEN** the user pans, orbits or zooms through the existing allowed camera range
- **THEN** the backdrop stays behind the scene without obscuring scene marks or HUD content

### Requirement: Decorative Hex Reference Plane

The renderer SHALL display faint cyan hexagon outlines in the system reference plane, fading with distance. They SHALL be decoration only, defining no movement cells, snapping, occupancy, borders or selectable targets, and SHALL NOT draw over planet surfaces or obscure selection and acting reticles.

#### Scenario: Planar depth reference
- **WHEN** the system is viewed at its existing default camera framing
- **THEN** connected cyan hexagon outlines provide a visible planar reference behind the bodies without covering their surfaces

#### Scenario: Continuous-space picking across hexes
- **WHEN** the user clicks a visible hex edge or center away from existing mark pick targets
- **THEN** existing continuous-space point selection resolves the clicked position without quantizing it to a hex center or edge

#### Scenario: Zoom and angle fade
- **WHEN** camera distance or angle changes through the configured bounds
- **THEN** distant outlines fade rather than forming a dense aliasing pattern
- **AND** the existing selected-object and acting-fleet reticles remain distinguishable from the hex outlines

### Requirement: Scene Art Preserves Interaction and Lifecycle

The art additions SHALL consume the existing published scene and camera without changing served entities, movement or picking geometry, camera state, selection semantics, HUD state or renderer-availability recovery. Newly owned visual resources SHALL be released when replaced or removed, on system changes and on renderer unmount. The additions SHALL NOT require a separate blocking asset load.

#### Scenario: Selection and realtime refresh
- **WHEN** selection changes or a realtime scene refresh occurs
- **THEN** the existing camera, picking, selection and command-panel behavior remain governed by their existing requirements
- **AND** the art uses the same served entities and published positions

#### Scenario: Scene removal and remount
- **WHEN** a visual resource is replaced, a mark disappears, the system changes or the renderer unmounts
- **THEN** resources owned solely by the removed visuals are released
- **AND** remounting the same served scene restores deterministic decoration

#### Scenario: Rendering interruption
- **WHEN** WebGL is unavailable or its rendering context is interrupted
- **THEN** the existing renderer-unavailable and retry behavior remains available without a separate blocking art load or uncaught art-resource error
