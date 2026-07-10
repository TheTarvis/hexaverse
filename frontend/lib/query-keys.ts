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
} as const

export type AccountQueryKey =
  | typeof queryKeys.accounts.all
  | ReturnType<typeof queryKeys.accounts.details>
  | ReturnType<typeof queryKeys.accounts.detail>
  | ReturnType<typeof queryKeys.accounts.current>
