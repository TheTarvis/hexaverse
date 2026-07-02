# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

Hexaverse is a monorepo containing three main components:

- **client/** - Next.js web application with React and Three.js
- **server/** - (Currently just contains CHANGELOG.md)
- **websockets/** - Go WebSocket server for real-time communication

## Development Commands

### Initial Setup
```bash
# Install dependencies for client
cd client && npm install
cd functions && npm install
cd ../..

# Install dependencies for websockets
cd websockets && go mod download

# Install Firebase CLI globally
npm install -g firebase-tools
firebase experiments:enable webframeworks
```

### Development Workflow

**Start the full development environment:**
```bash
# From the client directory
cd client
npm run emulators  # Starts Firebase emulators + Next.js dev server
```

**Or run components individually:**
```bash
# Terminal 1: Firebase emulators
cd client
firebase emulators:start

# Terminal 2: Next.js development server
cd client
npm run dev

# Terminal 3: Firebase Functions auto-rebuild
cd client/functions
npm run build:watch

# Terminal 4: WebSocket server (if needed)
cd websockets
go run main.go
```

### Build, Test, and Deploy

```bash
# From client directory
npm run lint                    # Run ESLint
npm run test                   # Run all tests
npm run test:functions         # Run Firebase functions tests only
npm run build                  # Build Next.js application
npm run deploy                 # Deploy frontend + functions to Firebase
npm run deploy:functions       # Deploy only Firebase functions

# WebSocket server deployment (from websockets directory)
gcloud builds submit --config cloudbuild.yaml .
```

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS v4
- **3D Graphics**: Three.js with React Three Fiber for hexagonal grid rendering
- **Backend**: Firebase Functions (TypeScript), Firestore, Firebase Auth
- **Real-time**: Go WebSocket server with Google Cloud Pub/Sub integration
- **State Management**: React Context API with reducers (not Redux despite RTK presence)

### Key Architectural Patterns

**React Context Provider Hierarchy** (nest in exact order):
1. ToastProvider
2. AuthProvider  
3. WebSocketProvider
4. ColonyProvider
5. TileProvider (ColonyTilesContext/DrawingTilesContext)

**WebSocket Architecture**:
- Frontend connects via `src/hooks/useWebSocket.tsx`
- Messages flow: WebSocketContext → useWebSocketSubscription → predicates → handlers
- Add new message types in `src/utils/websocket/predicates.ts` and `handlers.ts`
- WebSocket server (Go) bridges Pub/Sub topics to WebSocket clients

**Hexagonal Grid System**:
- Uses cube coordinates (q, r, s) where q + r + s = 0
- All grid calculations in `src/utils/hexUtils.ts`
- Rendering via `src/components/grid/GridCanvas.tsx`
- Camera controls in `src/hooks/useHexGridCamera.ts`

### Core Services Architecture

**Service Classes** (extend TilesBaseService):
- `ColonyTilesService` - Colony tile management
- `DrawingTilesService` - Drawing mode tile management
- Services handle Firebase callable functions and caching

**Firebase Functions**:
- `colony.ts` - Colony creation and management
- `colonyTiles.ts` - Colony tile operations
- `drawingTiles.ts` - Drawing mode tile operations
- `roadmap.ts` - Product roadmap features
- `support.ts` - Support ticket system

### Database Structure
- Firestore with UID-based collections
- Collections: `colonies`, `colonyTiles`, `drawingTiles`, `roadmap`, `support`
- All user records include Firebase User UID
- Timestamps in UTC
- Optimized for read/write cost efficiency

## Common Development Tasks

### Adding New WebSocket Message Types
1. Define predicate in `src/utils/websocket/predicates.ts`
2. Create handler in `src/utils/websocket/handlers.ts`
3. Register in messageHandlers array in the relevant context

### Working with the Hexagonal Grid
- Use `hexToPixel()` and `pixelToHex()` from `src/utils/hexUtils.ts`
- Tile colors managed by `src/utils/tileColorUtils.ts`
- Grid state managed by ColonyTilesContext or DrawingTilesContext

### Creating New Firebase Functions
1. Add TypeScript file in `client/functions/src/`
2. Export function using `onCall` from firebase-functions
3. Run `npm run build:watch` in functions directory
4. Call from frontend using Firebase callable functions

### State Management Patterns
```typescript
// Context creation pattern
const Context = createContext<ContextType | undefined>(undefined);

export function useContext() {
  const context = useContext(Context);
  if (!context) throw new Error('useContext must be used within Provider');
  return context;
}

// Complex state with reducers
// See src/reducers/tileReducer.ts for example
```

## Performance Considerations
- Use `useTileMessageBuffer` hook for batching WebSocket tile updates
- Implement proper memoization with `useCallback` and `useMemo`
- Cache Firebase function responses using `src/utils/cache.ts`
- Tile rendering optimized with Three.js instanced meshes

## Security Guidelines
- All Firebase functions require authentication (except where explicitly allowed)
- WebSocket connections authenticated via Firebase ID tokens
- Never commit sensitive keys (use environment variables)
- Follow Firebase security rules in `firestore.rules`

## Deployment Notes
- Frontend deploys to Firebase Hosting
- Functions deploy to Firebase Functions
- WebSocket server deploys to Google Cloud Run
- Use GitHub Actions for CI/CD (configuration needed)
- Environment variables managed through Firebase and .env files