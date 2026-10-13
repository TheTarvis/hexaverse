## ADDED Requirements

### Requirement: Shared Owned Fleet Selection
The game SHALL retain the selected owned fleet across galaxy/system navigation and session reloads, scoped to its corporation. A missing selected fleet SHALL fall back to an available owned fleet, including fleets in transit. Storage failure SHALL not prevent selection.

#### Scenario: Navigate with a selected fleet
- **WHEN** a player selects a fleet and switches between galaxy and system
- **THEN** the same owned fleet remains selected and supplies the fuel and cargo display

#### Scenario: Selection is no longer available
- **WHEN** the stored fleet is absent from a successful owned fleet read
- **THEN** an available owned fleet is selected without using another corporation's stored choice

### Requirement: Actionable Galaxy Fleet Status
The galaxy SHALL display the selected fleet's status and served vitals, and offer focus and navigation to its current system or transit destination. Transit progress SHALL derive from the served departure/arrival instants and world clock; arrival SHALL require a refreshed fleet read.

#### Scenario: Fleet in transit
- **WHEN** the selected fleet has a transit record
- **THEN** its origin, destination, ETA and progress remain visible with a View destination action
- **AND** focusing highlights the destination without marking the fleet physically present there

#### Scenario: Settled arrival
- **WHEN** the owned fleet read clears the transit record at the destination
- **THEN** selection remains on that fleet and the HUD reflects its new location

### Requirement: Context-Safe Fleet Commands
A system SHALL offer local course and extraction controls only for a selected non-transit fleet in that system. Remote and transit selections SHALL show their location and navigation actions instead. Failed telemetry SHALL be identified as unavailable rather than an empty fleet or confirmed arrival.

#### Scenario: Remote selection
- **WHEN** a system is opened while the selected fleet is elsewhere or in transit
- **THEN** the fleet's status and vitals remain available but local command panels are replaced by location guidance

### Requirement: Direct Fleet Camera Focus
Opening the selected fleet's current system SHALL focus a close camera view on that fleet once, without requiring the player to locate its marker. Galaxy Focus fleet SHALL open that system directly. A system Focus fleet control and roster reselection SHALL refocus the selected local fleet at its latest available position. Fleet focus SHALL initially face toward the star with the fleet in the foreground and SHALL continuously follow the fleet as its rendered position moves during travel. When parked at a body, follow SHALL use its outermost non-star parent as the pivot and frame the local orbital envelope. Changes between travel and parked pivots SHALL blend over a short transition without rotating the camera; reduced-motion users SHALL receive an immediate pivot change. Orbit and zoom SHALL retain the fleet pivot. Pan, recenter, and focusing another object SHALL release following; Focus fleet SHALL restore it. Routine data refreshes SHALL preserve subsequent manual camera movement.

#### Scenario: Focus from galaxy
- **WHEN** the player activates Focus fleet for a non-transit fleet
- **THEN** its system opens with the fleet selected and the camera centered closely on it

#### Scenario: Find the fleet again
- **WHEN** the player pans away and activates Focus fleet or reselects the local fleet
- **THEN** the camera returns to the fleet's latest available position

#### Scenario: Follow a moving fleet
- **WHEN** a focused fleet moves between telemetry refreshes
- **THEN** the camera pivot follows its rendered position without resetting user orbit or zoom

#### Scenario: Release and resume following
- **WHEN** the player pans away then activates Focus fleet
- **THEN** following resumes at the fleet’s current position with star-facing framing

#### Scenario: Parked at a moon
- **WHEN** a followed fleet is parked at a moon orbiting a planet
- **THEN** the camera tracks the planet and frames the moon orbit without following the fleet’s or moon’s local revolutions
- **AND** a subsequent burn restores fleet tracking with the existing orientation

### Requirement: Live System Object Browser
The system view SHALL offer a searchable grouped index of disclosed bodies and lane gates with connected details showing resources and known local owned fleets. Selection SHALL highlight an object, Focus SHALL reframe it, and Plot course SHALL open the existing authoritative burn preview without committing movement. The browser SHALL share its presentation with the storyboard. Live command cards SHALL occupy the left side without duplicating the detail card. Mobile details SHALL replace the list with back navigation preserving search. Loading, unavailable and empty interior states SHALL be explicit and failed reads SHALL withhold object actions.

#### Scenario: Find and plot
- **WHEN** the player expands a known object and plots a course
- **THEN** its served id supplies the existing course preview and Burn remains a separate action

#### Scenario: Inspect without movement
- **WHEN** the player selects or focuses an object
- **THEN** no gameplay command is submitted and the active fleet remains unchanged

#### Scenario: Tutorial discovery
- **WHEN** the tutorial asks the player to find its resource target
- **THEN** its target control opens the object index and identifies the tutorial destination
