// RED-phase tests for openspec change add-scan-and-sightings-surface,
// tasks.md 4.4, 4.5, 4.6 — the wire-call contract for the new client
// services (link8b-impl-contract.md §1.1, §1.2, §1.4):
//
//   sightingService.list({ systemId?, cursor? })  -> GET /v1/sightings?...
//   fleetService.scan(fleetId, hostId)            -> POST /v1/fleets/:id/scan
//   fleetService.scanTargets(fleetId)             -> GET /v1/fleets/:id/scan-targets
//   actionService.listSettled(actorId, { type })  -> GET /v1/actions?actor=&status=done&type=
//   actionService.acknowledge(actionId)           -> POST /v1/actions/:id/acknowledge
//
// A NEW FILE, not an edit to `lib/services/{fleet,action}-service.test.ts`
// (both pre-existing and immutable). Mirrors those files' own established
// pattern (mock `apiClient` at the transport boundary, assert the exact URL
// and body).
//
// EXPECTED RED TODAY: `sightingService` does not exist as a module at all
// (`Cannot find module`); `fleetService.scan`/`scanTargets` and
// `actionService.listSettled`/`acknowledge` are `undefined` on the existing
// modules (calling them throws "is not a function") — both clean, real reds.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '../api-client'

vi.mock('../api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }))
const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

beforeEach(() => vi.clearAllMocks())

describe('sightingService.list — GET /v1/sightings (sighting-records)', () => {
  it('requests the unfiltered pile when no systemId is given (the log’s own read)', async () => {
    const { sightingService } = await import('./sighting-service')
    mockGet.mockResolvedValue({ data: { sightings: [], nextCursor: '' } } as never)
    await sightingService.list({})
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/v1/sightings')
    expect(url).not.toContain('systemId=')
  })

  it('requests the SYSTEM-FILTERED pile when systemId is given (the ghost layer’s own read)', async () => {
    const { sightingService } = await import('./sighting-service')
    mockGet.mockResolvedValue({ data: { sightings: [], nextCursor: '' } } as never)
    await sightingService.list({ systemId: 'sys-7' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('systemId=sys-7')
  })

  it('passes the server’s cursor back VERBATIM, never parsed, rewritten, or re-encoded', async () => {
    const { sightingService } = await import('./sighting-service')
    mockGet.mockResolvedValue({ data: { sightings: [], nextCursor: '' } } as never)
    const opaqueCursor = '1717171717|ae80c6d8304786e06ab71baee15cf787'
    await sightingService.list({ cursor: opaqueCursor })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain(encodeURIComponent(opaqueCursor))
  })

  it('returns the served sightings array and nextCursor', async () => {
    const { sightingService } = await import('./sighting-service')
    const record = {
      id: 'ae80c6d8304786e06ab71baee15cf787',
      systemId: 'sys-7',
      asOf: 1717171717,
      hostId: 'feat-planet-2',
      cleanSweep: false,
      position: { X: 1, Y: 0, Z: 0 },
      velocity: { X: 0, Y: 0, Z: 0 },
      hullCount: 2,
      hullTypes: ['frigate'],
    }
    mockGet.mockResolvedValue({ data: { sightings: [record], nextCursor: 'next-page' } } as never)
    const page = await sightingService.list({})
    expect(page.sightings).toEqual([record])
    expect(page.nextCursor).toBe('next-page')
  })
})

describe('fleetService.scan / scanTargets (focused-scan)', () => {
  it('commits POST /v1/fleets/:id/scan with the selected host id and nothing else', async () => {
    const { fleetService } = await import('./fleet-service')
    mockPost.mockResolvedValue({ data: { id: 'fleet_1' } } as never)
    await fleetService.scan('fleet_1', 'feat-belt-1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/scan', { hostId: 'feat-belt-1' })
  })

  it('reads GET /v1/fleets/:id/scan-targets', async () => {
    const { fleetService } = await import('./fleet-service')
    mockGet.mockResolvedValue({ data: { targets: [] } } as never)
    await fleetService.scanTargets('fleet_1')
    expect(mockGet).toHaveBeenCalledWith('/v1/fleets/fleet_1/scan-targets')
  })

  it('returns the served target list', async () => {
    const { fleetService } = await import('./fleet-service')
    const targets = [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }]
    mockGet.mockResolvedValue({ data: { targets } } as never)
    const result = await fleetService.scanTargets('fleet_1')
    expect(result).toEqual(targets)
  })
})

describe('actionService.listSettled / acknowledge (action-dispatch inbox)', () => {
  it('reads GET /v1/actions?actor=&status=done&type=scan (never the type-agnostic settled read)', async () => {
    const { actionService } = await import('./action-service')
    mockGet.mockResolvedValue({ data: { actions: [], worldTime: 1 } } as never)
    await actionService.listSettled('fleet_1', { type: 'scan' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('actor=fleet_1')
    expect(url).toContain('status=done')
    expect(url).toContain('type=scan')
  })

  it('acknowledges via POST /v1/actions/:id/acknowledge', async () => {
    const { actionService } = await import('./action-service')
    mockPost.mockResolvedValue({ data: { id: 'action_1', status: 'done' } } as never)
    await actionService.acknowledge('action_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/actions/action_1/acknowledge', {})
  })
})
