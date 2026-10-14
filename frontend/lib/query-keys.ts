// Query key factory for React Query.
// Pattern: [domain, action, ...params]. Use these for hierarchical cache invalidation.
// Per-domain blocks are added by `/new-domain`.

export const queryKeys = {
  discovery: {
    all: ["discovery"] as const,
    survey: (fleetId: string) => [...queryKeys.discovery.all, "survey", fleetId] as const,
  },
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

  systemSpace: {
    // The fogged continuous-space interior read for one system. Distinct
    // from `system` (the health probe). Verbs invalidate `detail(id)` and
    // self-schedule its ETA refetch (#0005 client rules).
    all: ['systemSpace'] as const,
    detail: (id: string) => [...queryKeys.systemSpace.all, 'detail', id] as const,
  },

  fleets: {
    // The requester's own fleets (migrate-fleet-to-continuous-burns: the
    // board draws no fleet layer, so there is no per-system fleet list read
    // any more — only `mine`/`detail`). `inSystem` is kept as a key SHAPE
    // only, for `use-actions.ts`/`use-market.ts`'s existing invalidations
    // against a query nothing currently produces; `mine()` (below) is the
    // key that replaced it as the live fleet read, and the space view's own
    // realtime rules (`components/space/SystemSpaceView.tsx`, over
    // `lib/realtime.ts`'s constants) refetch through it.
    all: ['fleets'] as const,
    inSystem: (systemId: string) => [...queryKeys.fleets.all, 'in-system', systemId] as const,
    detail: (id: string) => [...queryKeys.fleets.all, 'detail', id] as const,
    // The requester's own fleets across systems (transit included) — the
    // roster panel and the galaxy/board views' fleet source.
    mine: () => [...queryKeys.fleets.all, 'mine'] as const,
    // The server-solved burn quote for one acting fleet against one
    // selection (build-production-space-view). Keyed by the SELECTION as
    // well as the fleet, so replacing the target cannot present the
    // previous target's figures as the current quote.
    burnPreview: (fleetId: string, selection: string) =>
      [...queryKeys.fleets.all, 'burn-preview', fleetId, selection] as const,
    // The server-served focused-scan target list for one fleet
    // (add-scan-and-sightings-surface, `focused-scan`). Invalidated on a
    // successful scan commit and on a successful cancel (task 4.9) — the
    // set of eligible hosts changes the instant the sensor slot frees up.
    scanTargets: (fleetId: string) => [...queryKeys.fleets.all, 'scan-targets', fleetId] as const,
    // A CLIENT-ONLY marker, never fetched (add-scan-and-sightings-surface,
    // link8b-adversary-r10 P1/P3): the world-clock instant a scan commit
    // was ACCEPTED, keyed by fleetId, written via `qc.setQueryData` and
    // read reactively via `useQuery({enabled: false})`. Backed by the
    // query cache (not `useState`) specifically so it survives a remount
    // of the control while the pending window is open (P3) — the same
    // `QueryClient` persists across a component remount, `useState` does
    // not. `ScanControl` derives "committed, awaiting its window" by
    // comparing this marker against the running-status read's own
    // `dataUpdatedAt`/`errorUpdatedAt`: once either advances past the
    // marker, a FRESH read has landed and the window is over — no
    // separate imperative clearing step needed.
    scanCommitPending: (fleetId: string) => [...queryKeys.fleets.all, 'scan-commit-pending', fleetId] as const,
  },

  actions: {
    // The #0005 inbox reads. `running(actorId)` backs the running-scan
    // indicator (#0006): the committed beam + its eta countdown. The scan
    // mutation invalidates it; past-eta entries hide client-side (worldTime).
    all: ['actions'] as const,
    detail: (corporationId: string, actionId: string) => [...queryKeys.actions.all, 'detail', corporationId, actionId] as const,
    runningAll: () => [...queryKeys.actions.all, 'running'] as const,
    running: (actorId: string) => [...queryKeys.actions.runningAll(), actorId] as const,
    // The type-filtered settled inbox (add-scan-and-sightings-surface,
    // task 4.7): `GET /v1/actions?actor=&status=done&type=scan`, the settled
    // sweep report's own read. Keyed separately from `running` so the two
    // reads — window-and-cancel vs. outcome-and-acknowledge — never share a
    // cache entry.
    settled: (actorId: string) => [...queryKeys.actions.all, 'settled', actorId] as const,
  },

  sightings: {
    // The corporation's sighting pile (add-scan-and-sightings-surface,
    // `sighting-records`). `pile(systemId)` is keyed by its OPTIONAL
    // systemId filter — `null` for the log's unfiltered read, a system id
    // for the ghost layer's filtered read — so the two NEVER share a cache
    // entry (task 4.7): a system-filtered page and the corp-wide log page
    // are different queries, not the same one read two ways.
    all: ['sightings'] as const,
    pile: (systemId: string | null) => [...queryKeys.sightings.all, 'pile', systemId ?? 'all'] as const,
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
