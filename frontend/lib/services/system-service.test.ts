import { describe, it, expect, vi, beforeEach } from 'vitest'
import { systemService } from './system-service'
import { apiClient } from '../api-client'
import type { SystemBoard } from '../types/system-board'

vi.mock('../api-client', () => ({
  apiClient: { get: vi.fn() },
}))

const mockGet = vi.mocked(apiClient.get)

// apiClient.get resolves an ApiResponse<T> (data + status + headers).
const ok = <T>(data: T) => ({ data, status: 200, headers: new Headers() })

const board: SystemBoard = {
  systemId: 'sys-7',
  radius: 16,
  character: 'star_rich',
  starClass: 'G',
  worldTime: 123456,
  features: [
    { id: 'f-star', type: 'star', fixed: true, footprint: [{ q: 0, r: 0 }], band: 'visible', live: true },
  ],
}

describe('systemService.getSystemBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads GET /v1/systems/:id and returns the fogged interior', async () => {
    mockGet.mockResolvedValue(ok(board))

    const result = await systemService.getSystemBoard('sys-7')

    expect(mockGet).toHaveBeenCalledWith('/v1/systems/sys-7')
    expect(result).toEqual(board)
  })

  it('encodes the system id into the path', async () => {
    mockGet.mockResolvedValue(ok(board))

    await systemService.getSystemBoard('sys-42')

    expect(mockGet).toHaveBeenCalledWith('/v1/systems/sys-42')
  })
})
