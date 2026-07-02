# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Setup and Installation
```bash
# Install dependencies
npm install
cd functions && npm install

# Install Firebase CLI (if not already installed)
npm install -g firebase-tools
firebase experiments:enable webframeworks
```

### Development Workflow
```bash
# Start development environment (emulators + Next.js dev server)
npm run emulators

# Alternative: Individual components
firebase emulators:start          # Firebase emulators only
npm run dev                      # Next.js dev server only
cd functions && npm run build:watch  # Functions with auto-rebuild
```

### Testing and Linting
```bash
npm run lint                     # ESLint for frontend
npm run test                     # All tests
npm run test:functions           # Backend function tests only
npm run test:ui                  # UI tests (not yet configured)
```

### Deployment
```bash
npm run deploy                   # Full deployment (frontend + backend)
npm run deploy:functions         # Functions only
```

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS v4
- **3D Graphics**: Three.js with React Three Fiber for hexagonal grid rendering
- **Backend**: Firebase (Functions, Firestore, Auth, Hosting)
- **Real-time**: WebSocket connections with Google Cloud Pub/Sub
- **State Management**: React Context + reducers, not Redux despite RTK being installed

### Key Architectural Patterns

**Provider Hierarchy** (nest in this exact order):
1. ToastProvider (outermost)
2. AuthProvider
3. WebSocketProvider  
4. ColonyProvider
5. TileProvider (innermost)

**WebSocket Message Processing**:
- Messages flow: WebSocketContext → useWebSocketSubscription → predicates → handlers
- Uses dispatch table pattern with message buffering for performance
- Add new message types by updating `src/utils/websocket/predicates.ts` and `src/utils/websocket/handlers.ts`

**Hexagonal Coordinate System**:
- Uses cube coordinates (q, r, s) where q + r + s = 0
- All grid calculations should use the utilities in `src/utils/hexUtils.ts`

### Database Guidelines
- Firestore database with UID-based records
- All user records include Firebase User UID
- Prioritize cost and speed for reads/writes
- All timestamps in UTC
- Add user's Firebase UID when saving user-specific records

### State Management Patterns

**Context Creation**:
```typescript
// Standard pattern for contexts
const Context = createContext<ContextType | undefined>(undefined);

// Custom hook that throws if used outside provider
export function useContext() {
  const context = useContext(Context);
  if (!context) throw new Error('useContext must be used within Provider');
  return context;
}
```

**Complex State with Reducers**:
- Use reducer pattern for complex state (see `src/reducers/tileReducer.ts`)
- Define action types as discriminated unions
- Implement with switch statements

**Performance Optimization**:
- Use `useTileMessageBuffer` for batching WebSocket updates
- Use `useRef` for stable dispatch and state references in callbacks
- Memoize with `useCallback` to prevent unnecessary re-renders

### Directory Structure

**Frontend (`/src/`):**
- `app/` - Next.js App Router pages
- `contexts/` - React Context providers
- `services/` - API service layer (TilesBaseService, ColonyTilesService, etc.)
- `hooks/` - Custom React hooks
- `utils/` - Utility functions including hex grid calculations
- `types/` - TypeScript definitions
- `components/` - UI components organized by feature

**Backend (`/functions/`):**
- `src/` - TypeScript source files
- `lib/` - Compiled JavaScript output
- Individual function files: `colony.ts`, `drawingTiles.ts`, `colonyTiles.ts`

**Key Entry Points:**
- `src/app/layout.tsx` - Root layout with provider hierarchy
- `src/contexts/ColonyTilesContext.tsx` - Game tiles state management
- `src/contexts/AuthContext.tsx` - Authentication handling
- `src/contexts/WebSocketContext.tsx` - Real-time message handling

### Common Development Tasks

**Adding New WebSocket Message Types:**
1. Add predicate function to `src/utils/websocket/predicates.ts`
2. Add handler function to `src/utils/websocket/handlers.ts`  
3. Update messageHandlers array in relevant context

**Working with Hexagonal Grid:**
- Always use `src/utils/hexUtils.ts` for coordinate calculations
- Grid rendering handled by `src/components/grid/GridCanvas.tsx`
- Camera controls in `src/hooks/useHexGridCamera.ts`

**Adding New API Services:**
- Extend `TilesBaseService` class from `src/services/TilesBaseService.ts`
- Follow patterns in `ColonyTilesService.ts` and `DrawingTilesService.ts`
- Use Firebase callable functions for backend integration

This is a sophisticated real-time collaborative application combining 3D graphics, strategic gameplay, and WebSocket-based multiplayer functionality in a hexagonal grid virtual world.