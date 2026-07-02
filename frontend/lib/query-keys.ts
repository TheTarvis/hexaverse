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
} as const

export type AccountQueryKey =
  | typeof queryKeys.accounts.all
  | ReturnType<typeof queryKeys.accounts.details>
  | ReturnType<typeof queryKeys.accounts.detail>
  | ReturnType<typeof queryKeys.accounts.current>
