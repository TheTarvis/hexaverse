# Changelog

All notable changes to this project will be documented in this file.

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