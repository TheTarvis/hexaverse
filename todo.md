# Hexaverse Grid Roadmap

## Authentication & Colony Management

- [x] **Authentication Flow**
  - [x] Check if user is logged in
  - [x] Show login prompt if not authenticated
  - [x] Create helper functions to manage auth state
  - [ ] Create list of pages and permissions.
    - Home page: /src/app/page.tsx
    - Colony page: /src/app/colony/page.tsx
    - Grid page: /src/app/grid/page.tsx
    - Events list page: /src/app/events/page.tsx
    - Event detail page: /src/app/events/[id]/page.tsx
    - Orders list page: /src/app/orders/page.tsx
    - Order detail page: /src/app/orders/[id]/page.tsx
    - Order refund page: /src/app/orders/[id]/refund.tsx
    - Settings page: /src/app/settings/page.tsx
    - Address settings page: /src/app/settings/address.tsx
    - For example, grid should be visible but not interactable when not logged in.
    - [ ] Request login when going to restricted pages.

- [ ] **Login Flow**
  - [ ] Once Athentication Flow is complete
    - [ ] Fetch Users Colony

- [ ] **Colony Management**
  - [ ] Implement "Fetch User's Colony" API
  - [ ] Create "Create New Colony" flow with name input
  - [ ] Handle initial colony creation response (start coordinates + 7 tiles)
  - [ ] Store colony data in application state

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