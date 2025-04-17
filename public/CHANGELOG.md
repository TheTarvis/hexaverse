## [v0.9.19] - 2025-04-17
### Changed
- Improved WebSocket connection management to prevent multiple simultaneous connection attempts
- Enhanced WebSocket authentication handling with better auth state awareness
- Added connection attempt throttling with 5-second cooldown
- Improved connection state management with better logging
- Optimized reconnection logic to prevent unnecessary attempts
- Added safeguards against multiple connection attempts during auth loading

## [v0.9.18] - 2025-04-17
### Changed
- Refactored ColonyStatus management to ColonyContext
- Moved colony status tracking from GridManager to ColonyContext for better centralization
- Enhanced colony state management with more reactive grid updates
- Optimized GridManager to consume colonyStatus from context instead of managing it locally
- Reduced duplicate code and improved maintainability
- Added websocket connection indicator to sidebar/navbar

## [v0.9.17] - 2025-04-16
### Changed
- Updated README.md
- Added default values for firestore config env variables (for local running without .env file)
- Removed firestore-debug.log

## [v0.9.16] - 2025-04-16
### Changed
- Fog Tiles are now viewable Tiles.
- Moved some of the coloring logic into its own helper util.

## [v0.9.15] - 2025-04-30
### Changed
- Refactored WebSocket implementation for improved efficiency
- Removed redundant WebSocketContext in favor of direct hook usage
- Updated WebSocket connection to use AuthContext token directly
- Improved WebSocket message handling with better component integration
- Simplified the WebSocket architecture to reduce code duplication

## [v0.9.14] - 2025-04-29
### Changed
- Updated WebSocket service to properly handle both local and dev environments
- Added protocol detection to automatically use ws:// for localhost and wss:// for deployed environments
- Enhanced health check endpoint to use appropriate HTTP/HTTPS protocol
- Improved WebSocket URL logging for better debugging

## [v0.9.13] - 2025-04-28
### Changed
- Updated Roadmap Admin page to follow the same Tailwind CSS styling as Events page
- Redesigned RoadmapAdminControls component with improved layout and UI components
- Added search functionality to filter roadmap items
- Enhanced roadmap item display with modern styling and dropdown menus
- Improved form layout and input fields with consistent component usage
- Converted progress input to an interactive slider for better user experience

## [v0.9.12] - 2025-04-27
### Fixed
- Fixed performance issue in GridManager component causing excessive re-renders
- Optimized useEffect dependencies by separating grid data loading from error handling
- Improved grid rendering performance by only triggering loadGridData when colony status or ID changes
- Reduced unnecessary calls to handleColonyWithTiles function

## [v0.9.11] - 2025-04-26
### Changed
- Renamed fetchTilesForColony to fetchTiles and moved it to src/services/tiles
- Created a dedicated TileContext for better separation of concerns
- Improved code organization with cleaner API for loading tiles
- Decoupled tile loading logic from colony management
- Renamed HexGridCanvas to GridCanvas

## [v0.9.10] - 2025-04-25
### Changed
- Refactored tile type definitions by moving ColonyTile to its own file as Tile
- Improved code organization with better separation of tile-related types
- Updated all imports and references throughout the codebase

## [v0.9.9] - 2025-04-24
### Added
- Added visual animation feedback when adding new tiles to the colony
- Implemented pulsing hexagon effect on clicked fog tiles for better user experience
- Created a more prominent loading indicator when tiles are being added
- Improved overall tile addition UX with visual cues and animations

## [v0.9.8] - 2025-04-23
### Changed
- Optimized tile adjacency checking to dramatically reduce database reads
- Created new tileHelpers utility functions for hexagon grid operations
- Refactored addTile function to use the new adjacency checking method
- Removed unnecessary Firebase queries for improved performance
- Reduced overall function execution time by eliminating redundant tile fetching

## [v0.9.7] - 2025-04-22
### Changed
- Fixed duplicate colony creation dialog appearing on different pages
- Updated ColonyCheck to check current route and skip modal on colony page
- Enhanced user experience by preventing redundant colony creation prompts
- Improved grid loading state with animated spinner for better visual feedback
- Standardized loading UI across the application

## [v0.9.6] - 2025-04-21
### Changed
- Improved user experience during colony creation flow
- Modified ColonyCheck component to show colony creation form in-place instead of redirecting to /colony page
- Added success message and feedback when colony is created
- Enhanced modal transitions for a smoother onboarding experience

## [v0.9.5] - 2025-04-20
### Fixed
- Optimized colony data fetching to prevent redundant API calls
- Added debounce mechanism to the ColonyContext to avoid multiple fetches
- Fixed issue where navigating to the colony page triggered unnecessary refreshes
- Improved manual refresh by explicitly using forceRefresh option
- Enhanced performance by skipping fetches within a 5-second window
- Reduced Firestore reads for improved quota efficiency

## [v0.9.4] - 2025-04-19
### Fixed
- Fixed critical bug where tiles would disappear after being added to the colony
- Improved tile persistence in the grid with optimized local state management
- Removed problematic background refresh that was causing tiles to disappear
- Enhanced colony context to better preserve locally added tiles
- Implemented smarter tile merging logic during colony refreshes
- Added safeguards to prevent tiles from being lost during state updates
- Improved performance by reducing unnecessary re-renders in grid components

## [v0.9.3] - 2025-04-18
### Changed
- Enhanced fog of war visualization with distance-based darkness for better depth perception
- Added dynamic version display using package.json version information
- Created version utility functions for consistent version display across the app
- Fixed TypeScript warnings in grid components
- Improved fog tile coloring algorithm with enhanced visual gradient
- Added support for dynamic opacity based on fog tile distance

## [v0.9.2] - 2025-04-17
### Changed
- Enhanced fog of war visualization to make fog tiles darker based on distance from colony
- Updated findFogTiles utility to return distance information for each fog tile
- Implemented distance-based coloring algorithm for better visual depth perception
- Improved fog tile visibility with dynamic opacity based on distance
- Enhanced visual cues for exploration boundaries with color gradient

## [v0.9.1] - 2025-04-16
### Added
- Added colony color selection feature during colony creation
- Implemented color picker with 15 color options
- Enhanced colony visual identification with custom colors
- Updated interfaces to include color property for colonies

## [v0.9.0] - 2025-04-15
### Changed
- Swapped single and double click actions for better usability
- Single click now adds a new tile
- Double click now shows tile details (if enabled)
- Replaced fullscreen errors with non-intrusive toast notifications
- Added toast notification system for success and error messages
- Fixed error handling for tile addition operations
- Improved error visibility with toast notifications
- Removed success notifications for better UX when adding tiles

## [v0.8.9] - 2025-04-14
### Changed
- Disabled tile details slide-up panel by default for improved user experience
- Added new Debug Menu option to toggle tile details panel visibility
- Fixed potential issues with tile selection when panel is disabled

## [v0.8.8] - 2025-04-13
### Changed
- Optimized tile addition process to prevent full canvas redrawing
- Implemented silent colony refresh to update metadata without UI reload
- Replaced intrusive full-screen overlay with a small unobtrusive indicator
- Improved performance by updating state locally before background synchronization
- Enhanced fog tile calculation to only recalculate when tileMap changes

## [v0.8.7] - 2025-04-12
### Added
- Implemented tile addition functionality allowing players to expand their colony
- Added tile capture mechanic to take control of tiles from other colonies
- Created cloud functions using Firebase callable functions for colony expansion
- Added double-click interaction to add or capture tiles
- Implemented adjacency verification to ensure colony continuity
- Enhanced the fog of war system to show available expansion tiles

## [v0.8.6] - 2025-04-11
### Added
- Implemented fog of war system around colony tiles
- Added adjustable fog depth control in Debug Menu
- Created utility functions for hexagonal grid operations
- Enhanced tile display with semi-transparent fog tiles
- Improved performance with optimized fog calculation

## [v0.8.5] - 2025-04-10
### Added
- Created a dedicated Changelog page to display version history
- Added route and sidebar navigation for the Changelog
- Implemented markdown parsing to render the changelog content

## [v0.8.4] - 2025-04-09
### Changed
- Refactored grid system into modular components for better maintainability
- Created DebugMenu component to separate debug UI from grid logic
- Created HexGridCanvas component to encapsulate canvas rendering logic
- Created GridManager component to handle state and coordinate child components
- Moved grid content to main page for better user experience
- Improved code organization with clear separation of concerns

## [v0.8.3] - 2025-04-08
### Update
- Commented out template stuff from sidebar.
- Copied grid page to main page.tsx to make it the landing page.

## [v0.8.2] - 2025-04-08
### Added
- Logs for colony creation.

### Updated
- Trying to improve commit rules.

### Removed
- Api.ts as it was an old PoC file.
- Sample Grid JSON as we no longer need it.


## [v0.8.1] - 2025-04-23
### Fixed
- Updated Firestore security rules to allow client-side querying for user colonies
- Added proper "list" permissions for colonies by uid and tiles by id
- Configured Firebase project to properly deploy Firestore rules
- Fixed permission issues when accessing colony data in production environment
- Improved Firestore security model while maintaining client-side access

## [v0.8.0] - 2025-04-22
### Added
- Initial colony creation and management functionality
- Colony information display with tile count and coordinates
- Fixed TypeScript type safety for colony tiles
- Enhanced error handling and loading states for colony data
- Improved dark mode support for colony interface components

## [v0.7.4]
### Changed
- Updated camera positioning to center on specific tile coordinates
- Improved grid navigation by aligning camera position with target tile

## [0.7.3] - 2025-04-21

### Added
- Enhanced grid visualization to display colony tiles
- Added type-based coloring to represent different terrain types
- Implemented resource density visualization mode
- Extended tile information panel to show tile type and resource details
- Added multiple color schemes for different visualization needs

## [0.7.2] - 2025-04-21

### Security
- Implemented Firestore security rules to restrict write access to Cloud Functions only
- Removed client-side Firestore write operations from colony service
- Enhanced security model by enforcing proper separation between client and server responsibilities
- Added ownership-based read restrictions for user data

## [0.7.1] - 2025-04-21

### Fixed
- Fixed bug where full tile data was being stored in Firestore colony documents
- Removed tiles array from Firestore colony documents to reduce document size
- Optimized client-side code to properly handle tile data in memory only

## [0.7.0] - 2025-04-21

### Changed
- Refactored Firestore data model to separate tiles into their own collection
- Updated Colony model to store tile IDs instead of embedding tile data
- Created dedicated tiles module for tile generation and management
- Improved database efficiency by reducing document size and preventing duplication
- Enhanced code organization with better separation of concerns

## [0.6.10] - 2025-04-20

### Fixed
- Fixed Firebase Functions server timestamp error in emulator environment
- Modified colony creation to use Date objects instead of serverTimestamp() for compatibility
- Resolved 500 server error when creating a new colony in the emulator

## [0.6.9] - 2025-04-20

### Fixed
- Enabled Firebase Auth emulator connection in development environment
- Fixed authentication token issues when running with Firebase emulators
- Removed dependency on NEXT_PUBLIC_USE_FIREBASE_EMULATOR environment variable

## [0.6.8] - 2025-04-20

### Fixed
- Updated API endpoint URLs to match Firebase Functions v2 naming convention
- Changed `/colony?id=` to `/getColony?id=` and `/colony/create` to `/createColony`
- Fixed 404 errors when calling Firebase Functions endpoints from client

## [0.6.7] - 2025-04-20

### Fixed
- Fixed colony creation API URL in Firebase emulator environment
- Updated API_BASE_URL to include project ID and region for proper endpoint routing
- Resolved CORS preflight issues when creating a new colony

## [0.6.6] - 2025-04-19

### Fixed
- Added 'use client' directive to AuthContext.tsx and ColonyContext.tsx
- Fixed Next.js Server Component errors related to React hooks usage
- Resolved build issues with client-side components

## [0.6.5] - 2025-04-18

### Added
- Implemented colony check on user login
- Added notification to create colony if user doesn't have one
- Integrated colony creation flow in main navigation
- Enhanced user experience with personalized avatar and name display
- Added sign out functionality

## [0.6.4] - 2025-04-17

### Added
- Implemented noise-based colony spawn location system
- Added procedural generation for galactic terrain with different tile types
- Implemented resource density calculation based on tile type
- Enhanced colony creation with proper tile types and resource allocation
- Added custom tile IDs for improved game mechanics

## [0.6.3] - 2025-04-16

### Added
- Added combined test command in package.json to run both UI and Functions tests
- Created placeholder for UI tests
- Improved developer workflow with unified testing commands

## [0.6.2] - 2025-04-15

### Added
- Added unit tests for colony.ts Firebase Cloud Functions
- Created test structure with Jest and mock implementations
- Added proper error handling and validation testing

## [0.6.1] - 2025-04-14

### Changed
- Performed minor code cleanup
- Improved code organization and readability

## [0.6.0] - 2025-04-13

### Fixed
- Fixed massive CSS issue affecting entire application
- Resolved styling inconsistencies across all components
- Improved overall UI rendering and appearance

## [0.5.16] - 2025-04-12

### Fixed
- Applied high-specificity inline styles to all Heroicons for Firebase emulator
- Fixed SVG sizing by adding explicit width/height styles and aria-hidden attributes
- Implemented direct styling with !important rules to override any conflicting CSS
- Enhanced icon presentation consistency across all components

## [0.5.14] - 2025-04-12

### Fixed
- Added specialized fixes for Heroicons SVG sizing in Firebase emulator
- Created IconWrapper component for consistent sizing of Heroicon components
- Added CSS rules targeting specific Heroicons patterns
- Fixed Cog8ToothIcon and other Heroicons components appearing too large

## [0.5.13] - 2025-04-12

### Fixed
- Enhanced SVG sizing fixes for Firebase emulator with dedicated CSS file
- Added explicit width/height attributes to SVGs to prevent sizing issues
- Created comprehensive firebase-fixes.css with targeted rules for different SVG types
- Fixed navigation icon SVG display in the grid component

## [0.5.12] - 2025-04-11

### Fixed
- Fixed SVG sizing issues in Firebase emulator environment
- Added explicit size constraints for icon SVGs to ensure consistent display across all environments

## [0.5.11] - 2025-04-11

### Fixed
- Added `generateStaticParams` function to the orders/[id] page to make it compatible with static export
- Fixed additional dynamic route for Firebase emulator build

## [0.5.10] - 2025-04-11

### Fixed
- Added `generateStaticParams` function to the events/[id] page to make it compatible with static export
- Fixed Firebase emulator build error when using `output: export` with dynamic routes

## [0.5.9] - 2025-04-10

### Fixed
- Fixed TypeScript type error in Firebase configuration
- Added proper type definitions for Firebase objects
- Improved type safety for Auth, Firestore, and FirebaseApp

## [0.5.8] - 2025-04-10

### Fixed
- Fixed Next.js configuration for Firebase emulator by removing invalid distDir
- Restored source directive in Firebase configuration
- Corrected build:firebase script to use proper Next.js static export

## [0.5.7] - 2025-04-10

### Fixed
- Fixed styling issues in Firebase emulator environment
- Updated Firebase hosting configuration to correctly serve static assets
- Added specialized build command for Firebase emulator
- Configured Next.js to output static files for Firebase deployment

## [0.5.6] - 2025-04-10

### Fixed
- Fixed duplicate TouchTarget component definition causing build errors
- Added proper CSS variable definitions in Tailwind v4 configuration
- Configured theme variables for styling components correctly

## [0.5.5] - 2025-04-10

### Changed
- Upgraded to Tailwind CSS v4
- Replaced custom CSS variable implementation with native Tailwind v4 support
- Added @tailwindcss/postcss plugin
- Simplified configuration files for better compatibility

## [0.5.4] - 2025-04-10

### Fixed
- Fixed button and dropdown CSS styling issues by updating Tailwind configuration
- Added CSS variable support through postcss-functions plugin
- Updated tailwind.css to use the import syntax for better compatibility
- Added proper CSS variable definitions in Tailwind configuration

## [0.5.3] - 2025-04-09

### Added
- Implemented secure Firebase Authentication between frontend and cloud functions
- Added authentication middleware for cloud functions to verify Firebase tokens
- Enhanced colony APIs to use authenticated users instead of passing UIDs in request body
- Created secure API endpoints that validate user permissions
- Added helper utilities for obtaining and using auth tokens in frontend API calls

### Changed
- Refactored cloud functions to break circular dependencies between files
- Improved error handling for authentication failures
- Enhanced security by preventing users from accessing other users' colonies

## [0.5.2] - 2025-04-08

### Added
- Added shared type definitions between web app and Firebase functions
- Created colony management API functions (getColony and createColony)
- Set up proper TypeScript configuration for shared types

### Fixed
- Fixed Firebase emulator configuration for proper function discovery
- Resolved punycode deprecation warning in development environment
- Improved functions compilation process for more reliable builds

## [0.5.1] - 2025-04-07

### Changed
- Removed hello world function as it's no longer needed
- Refactored user functions into a dedicated file (user.ts)
- Improved code organization with better separation of concerns

## [0.5.0] - 2025-04-06

### Added
- Implemented complete Firebase Cloud Functions infrastructure with TypeScript
- Created HTTP endpoints (helloWorld, countUsers, createTestUser)
- Added Firestore document trigger for text transformation (makeUppercase)
- Configured Firebase emulators for local development including Functions and Firestore
- Set up robust error handling and graceful fallbacks in Cloud Functions
- Added test user creation utility for local development

## [0.4.9] - 2025-04-06

### Added
- Implemented Node.js TypeScript Cloud Functions
- Added HTTP function example (helloWorld)
- Added Firestore trigger function (makeUppercase)
- Added user count function example
- Updated Firebase configuration to support TypeScript functions
- Added proper TypeScript configuration for functions
- Configured Firestore emulator for local development
- Added test user creation function for development

### Fixed
- Improved countUsers function to handle empty collections gracefully
- Enhanced error handling in cloud functions

## [0.4.8] - 2025-04-28

### Fixed
- Removed .firebase directory from Git tracking
- Ensured .firebase directory is properly ignored in .gitignore
- Reduced repository size by removing build artifacts
- Improved Git history hygiene

## [0.4.7] - 2025-04-28

### Added
- Configured Firebase emulators for local development
- Set up hosting emulator on port 5000
- Set up functions emulator on port 5001
- Enabled emulator UI for easier testing and debugging
- Fixed Go runtime configuration for proper local function emulation

## [0.4.6] - 2025-04-27

### Added
- Implemented Go-based Firebase Cloud Functions structure
- Added example HTTP function for simple API endpoints
- Created example Firestore trigger function for document change monitoring
- Added example Pub/Sub function for handling message queue events
- Updated firebase.json to support Go functions deployment
- Added deployment and emulator scripts to package.json

## [0.4.5] - 2025-04-26

### Added
- Implemented colony management functionality
- Created Firestore integration for storing user colony data
- Added colony creation flow with name input
- Created colony information display component
- Added Colony page in the navigation
- Implemented proper error handling for colony operations

## [0.4.4] - 2025-04-25

### Fixed
- Enhanced Firebase authentication callback handling
- Added OAuth redirect result processing to handle authentication callbacks
- Improved Google sign-in error handling with specific error messages
- Added additional logging for debugging authentication flow
- Enhanced Firebase initialization with better app instance management
- Added optional Firebase emulator support for local development

## [0.4.3] - 2025-04-24

### Fixed
- Fixed Firebase authentication configuration issues
- Added validation for Firebase configuration parameters
- Improved error handling for Google sign-in popup
- Updated sign-in flow to gracefully handle popup-closed-by-user errors
- Enhanced Google authentication with better UX parameters

## [0.4.0] - 2025-04-23

### Added
- Successfully deployed application to Firebase
- Added Firebase configuration for Next.js with webframeworks support
- Configured Firebase Hosting and Cloud Functions for dynamic routes

### Fixed
- Resolved Tailwind CSS configuration issues
- Fixed TypeScript JSX type errors in grid component
- Improved dark mode support with consistent background colors

## [0.3.14] - 2025-04-22

### Fixed
- Fixed TypeScript JSX type errors in grid component by adding proper type declarations
- Resolved "JSX element implicitly has type 'any'" errors with correct React imports
- Added dark:lg:bg-zinc-950 background color to SlideUpPanel for better dark mode consistency
- Added missing TypeScript event handler types for ThreeJS interactions

## [0.3.8] - 2025-04-21

### Changed
- Enhanced SlideUpPanel to prevent automatic closing when clicking outside
- Added closeOnOutsideClick prop with default false for better control
- Updated tile information panel to use static dialog behavior
- Improved user experience by allowing interaction with grid while panel is open

## [0.3.7] - 2025-04-20

### Fixed
- Updated SlideUpPanel component to fix deprecated `Dialog.Panel` and `Dialog.Title` usage
- Replaced with `DialogPanel` and `DialogTitle` components from Headlessui v2 API

## [0.3.6] - 2025-04-19

### Fixed
- Updated SlideUpPanel component to fix deprecated `Transition.Child` usage
- Replaced with `TransitionChild` component from Headlessui v2 API

## [0.3.5] - 2025-04-17

### Added
- Added dark mode background and text colors to tile information panel
- Enhanced readability in dark mode for Cube Coordinates and Color sections

## [0.3.4] - 2025-04-16

### Fixed
- Fixed issue with tile coordinates not displaying in the SlideUpPanel
- Added optional chaining to prevent potential null reference errors
- Improved debugging with additional console logs

## [0.3.2] - 2025-04-15

### Changed
- Updated SlideUpPanel component to use the same background colors as the sidebar
- Added dark mode support with zinc-900 background color
- Improved text and border color contrast in dark mode

## [0.3.1] - 2025-04-14

### Changed
- Made background overlay optional in SlideUpPanel component
- Updated grid tile information panel to show without darkening the background
- Improved user experience by maintaining visibility of the grid while viewing tile details
- Fixed pointer event handling to prevent accidental click-through

## [0.3.0] - 2025-04-13

### Added
- Created reusable SlideUpPanel component for consistent bottom sheet UI
- Implemented smooth animations and transitions for the panel
- Added customization options for width, height, and title
- Added semi-transparent overlay background
- Refactored tile information panel to use the new reusable component

## [0.2.9] - 2025-04-12

### Changed
- Improved tile information panel with responsive width constraints
- Added maximum width limits that adapt to different screen sizes
- Centered panel for better visual balance on larger displays
- Enhanced layout consistency across device sizes

## [0.2.8] - 2025-04-11

### Added
- Added tile information panel that slides up when a tile is clicked
- Implemented panel to display cube coordinates and tile color
- Added close button to dismiss the panel
- Enhanced UI with responsive grid layout for tile details

## [0.2.7] - 2025-04-10

### Fixed
- Fixed touch controls for mobile devices 
- Improved pinch-to-zoom and one-finger panning on touchscreens
- Added responsive navigation helper text that changes based on device type
- Disabled page touch actions to prevent conflicts with canvas interactions

## [0.2.6] - 2025-04-09

### Added
- Added click interaction to individual hexagon tiles
- Implemented mouse hover cursor change to indicate clickable tiles  
- Added console logging of clicked tile's cube coordinates (q,r,s)

## [0.2.5] - 2025-04-08

### Changed
- Expanded grid visualization to fill the entire viewport 
- Removed width constraints to maximize available screen space
- Improved responsive layout for better viewing on different devices

## [0.2.4] - 2025-04-07

### Added
- Enabled grid panning with mouse click and drag
- Added support for two-finger pan gestures on mobile devices
- Added visual helper for navigation controls
- Optimized camera controls for better user experience

## [0.2.3] - 2025-04-06

### Added
- Added "Add New Shard" debug menu option to request and append a new shard to the grid
- Created API function to request a new shard without using cache
- Added loading state for shard addition process

## [0.2.2] - 2025-04-05

### Fixed
- Implemented request caching to prevent duplicate API calls to the server
- Fixed React strict mode causing double data fetching in development

## [0.2.1] - 2025-04-05

### Added
- Environment variable configuration for server API base URL
- API service with fetch function for grid data
- Loading and error states for grid data fetching

### Changed
- Updated Grid page to fetch data from API with fallback to sample data
- Improved error handling for API requests

## [0.2.0] - 2025-04-04

### Added
- New Grid page with hexagonal grid visualization
- React Three Fiber integration for 3D rendering
- Hexagon rendering with cube coordinate system
- Debug dropdown menu with the following options:
  - Toggle wireframe rendering
  - Adjust hexagon size
  - Change color schemes (default, rainbow, monochrome)
- Added zoom functionality using mouse wheel and pinch gestures
- Support for loading and displaying grid data from JSON file
- Cube coordinate system implementation matching server-side Go code

### Changed
- Updated side navigation to include Grid page
- Enhanced camera controls with proper constraints

### Technical
- Implemented TypeScript interfaces for grid data structures
- Added coordinate conversion utilities
- Optimized rendering with useMemo hooks
- Fixed compatibility issues with React 18 