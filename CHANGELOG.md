# Changelog

All notable changes to this project will be documented in this file.

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