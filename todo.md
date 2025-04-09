# Hexaverse Grid Roadmap

## Authentication & Colony Management

- [ ] **Must Fix Bugs** 
  - [ ] Fix the tile details slide up from capturing all touches on the screen. If I touch away from it just close it unless i've selected another tile.
  - [ ] Multiple attempts to load the colony on 

- [x] **Authentication Flow**
  - [x] Check if user is logged in
  - [x] Show login prompt if not authenticated
  - [x] Create helper functions to manage auth state
  - [ ] Create list of pages and permissions.
    - For example, grid should be visible but not interactable when not logged in.
    - [x] Request login when going to restricted pages.

- [x] **Login Flow**
  - [x] Once Athentication Flow is complete
    - [x] Fetch Users Colony

- [x] **Colony Management**
  - [x] Implement "Fetch User's Colony" API
  - [x] Create "Create New Colony" flow with name input
  - [x] Handle initial colony creation response (start coordinates + 7 tiles)
  - [?] Store colony data in application state

## User Experience & Gameplay

- [ ] **User Settings**
  - [ ] Create API to fetch user settings
  - [ ] Track and persist camera position
  - [ ] Apply user settings when loading grid

- [ ] **Tile Rendering**
  - [ ] Create API to fetch colony tiles
  - [ ] Position camera at last known position (or colony start coordinates)
  - [ ] Render player's tiles on the canvas
  - [ ] Optimize tile rendering for better performance

## Technical Requirements

- [ ] Create API service functions for all new endpoints
- [ ] Update grid component to use new data flow
- [ ] Create secure authentication token handling
- [ ] Implement proper loading states and error handling

## Technical Requirements
= [ ] Fix punycode deprication error
*Note: Items will be implemented one by one, not all at once.* 