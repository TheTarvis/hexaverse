import { describe, it, expect } from 'vitest'
import { queryKeys } from './query-keys'

// The factory's contract is stable, hierarchical keys: a domain's `all` prefixes
// every narrower key beneath it, so invalidating `all` cascades. These assert the
// shapes hooks/mutations depend on for cache invalidation.
describe('queryKeys', () => {
  it('builds hierarchical account keys', () => {
    expect(queryKeys.accounts.all).toEqual(['accounts'])
    expect(queryKeys.accounts.detail('u1')).toEqual(['accounts', 'detail', 'u1'])
    expect(queryKeys.accounts.current()).toEqual(['accounts', 'current'])
  })

  it('builds galaxy live vs start-area keys', () => {
    expect(queryKeys.galaxy.live()).toEqual(['galaxy', 'live'])
    expect(queryKeys.galaxy.startArea()).toEqual(['galaxy', 'start-area'])
  })

  it('builds per-system interior detail keys under the systemSpace prefix', () => {
    expect(queryKeys.systemSpace.all).toEqual(['systemSpace'])
    expect(queryKeys.systemSpace.detail('sys-7')).toEqual(['systemSpace', 'detail', 'sys-7'])
    // Distinct id → distinct key, so two open systems cache independently.
    expect(queryKeys.systemSpace.detail('sys-8')).not.toEqual(queryKeys.systemSpace.detail('sys-7'))
    // Nested under `all` so a broad invalidation cascades.
    expect(queryKeys.systemSpace.detail('sys-7').slice(0, 1)).toEqual(queryKeys.systemSpace.all)
  })

  it('keeps the system health probe separate from the systemSpace read', () => {
    expect(queryKeys.system.all).toEqual(['system'])
    expect(queryKeys.system.all).not.toEqual(queryKeys.systemSpace.all)
  })
})
