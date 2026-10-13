## ADDED Requirements

### Requirement: Wake Opens on the Starter Fleet
After a successful wake, the system SHALL select and focus the returned starter fleet in its home system and begin dismissible recovery transmissions. Existing corporations without an enrolled guide SHALL retain normal entry behavior.

#### Scenario: New intelligence comes online
- **WHEN** a wake returns a corporation, fleet and home system
- **THEN** the home system opens with that fleet active and camera-focused
- **AND** the first transmission says “Wakey wakey. You’re online.” without asking the player to find a fleet

#### Scenario: Camera remains under player control
- **WHEN** the player moves the camera after initial focus and fleet data refreshes
- **THEN** the refresh does not recenter the camera

### Requirement: Guide Uses Disclosed Destinations
The guide SHALL identify a visible resource-bearing destination from the current interior read and preserve that target through the first flight. If no such destination is known, it SHALL offer the existing scan console and SHALL NOT invent resources or block ordinary fleet commands.

#### Scenario: Destination is known
- **WHEN** the player starts the motor-function check and a visible mineable body exists apart from the starting attachment
- **THEN** the guide offers that body's actual identity as the movement target
- **AND** plotting uses the existing server preview and commit path

#### Scenario: No destination is known
- **WHEN** no eligible resource-bearing body is disclosed
- **THEN** the guide explains that a scan is needed and provides access to Scan
- **AND** an interior read failure is presented as unavailable data rather than no resources

### Requirement: Completion Requires Gameplay Evidence
The guide SHALL confirm motor function only after an accepted burn of the starter fleet to the pinned destination and a subsequent successful fleet read showing that fleet parked and attached there. It SHALL confirm mining only after the accepted mining action at that destination is reported done without a failure reason and a successful starter-fleet cargo read shows at least one tonne gained in the mined resource relative to commitment.

#### Scenario: Pending work is not success
- **WHEN** a burn or mine is merely accepted or its ETA passes
- **THEN** the corresponding check remains pending until completion evidence arrives

#### Scenario: Wrong fleet and cancellation
- **WHEN** another fleet arrives or mines, or the tutorial fleet's command is cancelled
- **THEN** the event does not complete the tutorial check
- **AND** an incomplete check remains retryable through the existing commands

#### Scenario: Completed extraction
- **WHEN** the recorded mine action is done without a failure reason and the starter fleet has gained at least one tonne of its resource
- **THEN** mining function is confirmed and the guide introduces the return-to-station lesson while remaining dismissible

### Requirement: Advisory Progress Is Scoped and Recoverable
The guide SHALL resume valid browser-local progress for the same corporation and SHALL not use another corporation's progress. Corrupt storage and unavailable browser storage SHALL not prevent ordinary play. Dismissal SHALL stop the guide without restricting gameplay.

#### Scenario: Reload during a check
- **WHEN** the same corporation reloads with a valid stored in-progress record
- **THEN** the guide resumes its recorded fleet, target and accepted action evidence

#### Scenario: Storage is invalid or unavailable
- **WHEN** stored data is malformed or browser storage cannot be accessed
- **THEN** the game remains usable and never treats invalid data as completed checks

### Requirement: Command View Presentation
The live system SHALL present full-screen space, a compact system identity and command-network fleet/ship counts, short recovery transmissions, and contextual fleet controls. Existing fleet switching, scan/log console, quote safety, command errors and keyboard access SHALL remain available. No storyboard review controls or simulated progression SHALL appear in live play.

#### Scenario: More than one fleet
- **WHEN** the player selects another owned fleet
- **THEN** commands address that fleet and the starter-fleet guide does not issue commands to it

#### Scenario: Narrow viewport and reduced motion
- **WHEN** the view is narrow or reduced motion is requested
- **THEN** commands and transmissions remain reachable without horizontal overflow and nonessential camera animation is omitted

### Requirement: First Resource Loop Storyboard
The development storyboard SHALL demonstrate completed mining, cargo delivery to a station, selling cargo, purchasing fuel and readiness for another trip. It SHALL distinguish mined cargo from fuel and label authored quantities, prices and durations as simulated. Mining SHALL use a ten-tonne sample. Cargo, fuel, credits and completion checks SHALL change only at the corresponding simulated completion or accepted instant transaction. Review navigation and reset SHALL restore coherent snapshots.

#### Scenario: Complete the first resource loop
- **WHEN** the player completes the storyboard’s first crossing and extraction
- **THEN** ten tonnes of cargo appear without increasing fuel
- **AND** the player reviews and commits a return burn, arrives at a station, sells the cargo and purchases fuel before completing the lesson

#### Scenario: Review and reset
- **WHEN** a reviewer jumps between scenes or resets the study
- **THEN** the balances and objective checks match the selected snapshot without sending live commands

### Requirement: Live Resource Loop Guidance
After confirmed mining, the guide SHALL direct the enrolled fleet to the local disclosed trading station, confirm its docked arrival, teach selling the mined resource and then purchasing fuel. Sale and fuel checks SHALL advance only from successful matching transaction receipts, never submission or unrelated balance changes. Failed or unavailable station reads SHALL withhold station targeting and explain the blockage. Progress SHALL persist across reloads; existing undismissed mining-only completion SHALL resume at the return lesson, while dismissed guides SHALL remain dismissed.

#### Scenario: Mine to refuel
- **WHEN** the enrolled fleet completes mining, docks at the selected station, successfully sells a positive amount of the mined resource and successfully buys fuel
- **THEN** the guide confirms each step in order and offers completion only after the fuel purchase

#### Scenario: Failed or unrelated commands
- **WHEN** a command fails or another fleet or resource is traded
- **THEN** the current guide check remains pending and existing command errors remain visible

#### Scenario: Missing station
- **WHEN** station telemetry fails or no local station is disclosed
- **THEN** the guide explains why the return destination is unavailable and remains dismissible without inventing a destination

### Requirement: Object Discovery Storyboard Prototype
The storyboard SHALL offer a compact searchable system index with grouped known objects, a world-anchored selection locator, an independent camera-focus action, and a separate course-preview action for the tutorial destination. It SHALL include an explicitly simulated off-screen state whose edge locator restores the object to view. These prototype controls SHALL not issue live commands.

#### Scenario: Find and inspect
- **WHEN** a player opens Objects and selects the tutorial destination
- **THEN** a locator identifies it in the scene without committing a burn
- **AND** Focus moves the camera while Plot course opens the cost preview

#### Scenario: Target outside the view
- **WHEN** a reviewer previews the off-screen state
- **THEN** an edge locator names the target and offers a return to it

#### Scenario: No matching objects
- **WHEN** the search matches no known object
- **THEN** the index explains the empty result and allows editing the search

### Requirement: Connected Object Details Prototype
The shared object index SHALL use one full-width button per object. Clicking anywhere on the row SHALL select the object and open its details; clicking the same expanded row SHALL close those details. Selecting a different row SHALL switch the details to that object. Expanded details SHALL appear beside the list on desktop and replace it on mobile with a return-to-list control. Details SHALL show known object information, fleets and resource disclosure state, with separate focus and course-preview actions. Closing details SHALL retain the search filter. The world locator SHALL use a compact ring and label instead of duplicating command controls.

#### Scenario: Expand and return
- **WHEN** a reviewer expands an object using its row and then closes details
- **THEN** the search remains intact and focus returns to the object row

#### Scenario: Preview a course from details
- **WHEN** the tutorial target’s Plot course control is activated
- **THEN** the storyboard opens the existing burn review without committing movement

### Requirement: Left-Side Storyboard Commands
The storyboard SHALL place object details, course review, flight status and resource-loop command cards in a shared left-side area. Opening the object index SHALL suppress the duplicate contextual card. Object details SHALL retain the planet portrait, name/type, compact facts and prominent course-preview action. Recovery transmissions SHALL remain visible independently of the command cards.

#### Scenario: Inspect then travel
- **WHEN** the player opens object details and plots a course
- **THEN** only the detail drawer shows object controls while it is open
- **AND** the subsequent course review and travel card appear on the left

### Requirement: Centered Recovery Briefing
The live recovery transmission SHALL appear at the center of the system view. During the initial wake briefing, the object index and command stack SHALL be hidden to prioritize the first prompt; starting the checks or dismissing the guide SHALL restore them. The briefing SHALL remain dismissible and fit within narrow viewports.

#### Scenario: Read the initial briefing
- **WHEN** a newly enrolled player enters the wake phase
- **THEN** the centered greeting and Begin systems check action are visible without competing object or command cards
- **AND** beginning the check restores those controls

#### Scenario: Open objects through either entry point
- **WHEN** the destination lesson asks the player to open Objects
- **THEN** a short prompt and modal button accompany a pulsing Objects control (static emphasis under reduced motion)
- **AND** opening Objects through either control closes the centered prompt while retaining the separate tutorial objective card
- **AND** closing the index does not reopen that prompt during the current visit; no movement is committed by opening it

### Requirement: Retire Legacy Flight Cards During Redesign
The live system HUD SHALL hide the legacy Course card and Cut drive / Stop row while replacement flight controls are being designed. A fleet actions card with no remaining visible content SHALL leave no empty panel. The standalone Focus fleet button and Fleets roster card SHALL also be hidden in the live system HUD during this redesign. The bottom fleet selector and resource controls SHALL remain available.

#### Scenario: View the uncluttered flight HUD
- **WHEN** the player views a system during the flight-control redesign
- **THEN** the legacy Course, Cut drive and Stop controls are not visible or keyboard reachable
- **AND** an otherwise empty flight actions card occupies no space
- **AND** the standalone Focus fleet button and Fleets card are hidden

### Requirement: Separate Objective Card
From the initial wake phase through tutorial completion, the live tutorial SHALL show “Complete tutorial” with a 0/1 completion count (1/1 in the completed phase) in its own objective card anchored to the right side of the viewport on desktop, outside the object list and details. The card SHALL avoid covering expanded details and use a separate available region on narrow screens. Opening or closing the browser SHALL not shift its toggle.

#### Scenario: Read the current objective while inspecting objects
- **WHEN** the player begins the tutorial, opens Objects and expands destination details
- **THEN** the Complete tutorial objective remains visible with a 0/1 count in a distinct card on the right side without covering the browser controls
- **AND** reaching the completed tutorial phase changes the count to 1/1

### Requirement: Station First and Scan Before Travel
New corporations SHALL receive their starter fleet docked in a free orbit at their provisioned home station. Retries and existing fleets SHALL retain their current location. Station provisioning or geometry failure SHALL fail the new spawn rather than silently placing it elsewhere.

The live guide SHALL introduce Objects, then the home station's selling and fuel-purchase services, then a focused scan of a server-listed host. A matching successful scan action SHALL be required before the first travel instruction. Failed or cancelled scans SHALL allow retry, and unavailable resource information SHALL not fabricate a destination. The selected resource destination SHALL be drawn from current disclosed data after scan completion. Mining and trading SHALL continue to teach selling cargo then purchasing propellant, not direct refining.

#### Scenario: Station introduction
- **WHEN** a newly spawned player opens Objects from either entry point
- **THEN** the station is selected and a short station introduction appears
- **AND** continuing introduces the scan controls before travel

#### Scenario: Scan evidence
- **WHEN** an accepted tutorial scan completes successfully for the enrolled fleet and system
- **THEN** refreshed disclosed resource data supplies the travel destination
- **AND** cancelled, failed or unrelated scan reports do not confirm the lesson

#### Scenario: Existing fleet
- **WHEN** an existing corporation resumes the guide or retries spawn
- **THEN** its fleet is not teleported to the station

### Requirement: Station Commands Belong to Station Details
Sell, refuel and station-keeping controls for a fleet docked at a station SHALL appear inside that station's object details rather than in a standalone HUD card. Inspecting a different object SHALL not expose those station commands. Closing and reopening the object browser SHALL preserve entered quantities and pending command state.

#### Scenario: Open station services
- **WHEN** the player opens the station row while their fleet is docked there
- **THEN** the station details contain the existing authoritative sell and refuel controls
- **AND** those controls are hidden when the station details close or another object is inspected
