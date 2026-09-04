// Unit test for `sightingService` (openspec change `add-scan-and-sightings-
// surface`) — the code-quality test-file-coverage validator's own naming
// convention (`<file>.test.ts` beside `<file>.ts`). The wire-contract
// assertions themselves live in `scan-and-sightings-services.test.ts` (the
// SDET's shared red suite for this change's three new services, immutable);
// this file exercises `sightingService` in isolation, matching the
// `fleet-service.test.ts` / `fleet-service.space.test.ts` precedent of more
// than one test file legitimately covering one service module.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '../api-client'
import { sightingService } from './sighting-service'

vi.mock('../api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }))
const mockGet = vi.mocked(apiClient.get)

beforeEach(() => vi.clearAllMocks())

describe('sightingService.list', () => {
  it('requests /v1/sightings with no query string when given no params', async () => {
    mockGet.mockResolvedValue({ data: { sightings: [], nextCursor: '' } } as never)
    await sightingService.list({})
    expect(mockGet).toHaveBeenCalledWith('/v1/sightings')
  })

  it('composes systemId, cursor, and limit together', async () => {
    mockGet.mockResolvedValue({ data: { sightings: [], nextCursor: '' } } as never)
    await sightingService.list({ systemId: 'sys-7', cursor: 'abc', limit: 25 })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('systemId=sys-7')
    expect(url).toContain('cursor=abc')
    expect(url).toContain('limit=25')
  })

  it('omits a limit of 0 (falsy) rather than serializing an empty bound', async () => {
    mockGet.mockResolvedValue({ data: { sightings: [], nextCursor: '' } } as never)
    await sightingService.list({ limit: 0 })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).not.toContain('limit=')
  })
})
