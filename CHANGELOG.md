# Changelog

All notable changes to this project will be documented in this file.

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