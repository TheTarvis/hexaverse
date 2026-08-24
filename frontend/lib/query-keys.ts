// Query key factory for React Query.
// Pattern: [domain, action, ...params]. Use these for hierarchical cache invalidation.
// Per-domain blocks are added by `/new-domain`.

export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
    details: () => [...queryKeys.accounts.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.accounts.details(), id] as const,
    current: () => [...queryKeys.accounts.all, 'current'] as const,
  },

  corporations: {
    // The caller's living corporation (#0009), GET /v1/corporations/me — the
    // session-bootstrap that decides wake-up-flow vs. play. Spawn invalidates it.
    all: ['corporations'] as const,
    me: () => [...queryKeys.corporations.all, 'me'] as const,
  },

  system: {
    all: ['system'] as const,
    health: () => [...queryKeys.system.all, 'health'] as const,
  },

  galaxy: {
    all: ['galaxy'] as const,
    // The single galaxy graph. `live` = authed GET /v1/galaxy; `startArea` =
    // the frozen static asset served to logged-out visitors.
    live: () => [...queryKeys.galaxy.all, 'live'] as const,
    startArea: () => [...queryKeys.galaxy.all, 'start-area'] as const,
  },

  systemBoard: {
    // The fogged interior read for one system (#0007). Distinct from `system`
    // (the health probe). Verbs invalidate `detail(id)` and self-schedule its
    // ETA refetch (#0005 client rules).
    all: ['systemBoard'] as const,
    detail: (id: string) => [...queryKeys.systemBoard.all, 'detail', id] as const,
  },

  fleets: {
    // The fogged fleet layer (#0004/#0007). `inSystem` backs the board's fleet
    // glyphs; `detail` a single fleet. Move/scan mutations invalidate both plus
    // `systemBoard.detail` (a scan reveals features) and self-schedule the ETA
    // refetch.
    all: ['fleets'] as const,
    inSystem: (systemId: string) => [...queryKeys.fleets.all, 'in-system', systemId] as const,
    detail: (id: string) => [...queryKeys.fleets.all, 'detail', id] as const,
    // The requester's own fleets across systems (transit included) — the galaxy
    // view's fleet layer (#0008).
    mine: () => [...queryKeys.fleets.all, 'mine'] as const,
    // A trip route preview: the fleet's shortest lane route to a destination
    // system + frozen ETAs. Keyed by both ids so switching targets refetches.
    route: (fleetId: string, destSystemId: string) =>
      [...queryKeys.fleets.all, 'route', fleetId, destSystemId] as const,
  },

  actions: {
    // The #0005 inbox reads. `running(actorId)` backs the running-scan
    // indicator (#0006): the committed beam + its eta countdown. The scan
    // mutation invalidates it; past-eta entries hide client-side (worldTime).
    all: ['actions'] as const,
    running: (actorId: string) => [...queryKeys.actions.all, 'running', actorId] as const,
  },

  market: {
    // The #0011 market reads. `board()` is the aggregate price board across
    // every station the requester has charted — polled on the server's stated
    // refresh cadence rather than pushed, since a sale fires no SSE. `station`
    // is one system's station (404 below the visibility tier). A settled sale
    // invalidates both, plus the fleet reads (hold) and the corporation read
    // (balance).
    all: ['market'] as const,
    board: () => [...queryKeys.market.all, 'board'] as const,
    station: (systemId: string) => [...queryKeys.market.all, 'station', systemId] as const,
  },
} as const

export type AccountQueryKey =
  | typeof queryKeys.accounts.all
  | ReturnType<typeof queryKeys.accounts.details>
  | ReturnType<typeof queryKeys.accounts.detail>
  | ReturnType<typeof queryKeys.accounts.current>
