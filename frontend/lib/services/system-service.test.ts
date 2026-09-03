import { describe, it, expect, vi, beforeEach } from 'vitest'
import { systemService } from './system-service'
import { apiClient } from '../api-client'
import type { SystemSpace } from '../types/system-space'

// Repointed from `getSystemBoard` to `getSystemSpace` (openspec change
// `build-production-space-view`, tasks.md 10.1/10.3): the lattice interior
// read and the `SystemBoard` shape it returned are both gone. The two cases
// are the ones the deleted file asserted — the path, and the id encoded into
// it — against the surviving continuous read.

vi.mock('../api-client', () => ({
  apiClient: { get: vi.fn() },
}))

const mockGet = vi.mocked(apiClient.get)

// apiClient.get resolves an ApiResponse<T> (data + status + headers).
const ok = <T>(data: T) => ({ data, status: 200, headers: new Headers() })

const space: SystemSpace = {
  systemId: 'sys-7',
  extent: 658.7081316032265,
  character: 'star_rich',
  starClass: 'G',
  worldTime: 123456,
  scale: 1,
  laneGates: [],
  features: [{ id: 'f-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 }],
}

describe('systemService.getSystemSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads GET /v1/systems/:id and returns the fogged continuous interior', async () => {
    mockGet.mockResolvedValue(ok(space))

    const result = await systemService.getSystemSpace('sys-7')

    expect(mockGet).toHaveBeenCalledWith('/v1/systems/sys-7')
    expect(result).toEqual(space)
  })

  it('encodes the system id into the path', async () => {
    mockGet.mockResolvedValue(ok(space))

    await systemService.getSystemSpace('sys-42')

    expect(mockGet).toHaveBeenCalledWith('/v1/systems/sys-42')
  })
})
