import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '../api-client'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// tasks.md 4.1 (preview seam), 4.6 (`maxFuelTons`), 7.9 (hold/release
// seams); design.md Decision 14.
//
// WHY THIS FILE EXISTS AT ALL. `replace-observation-with-sightings` shipped
// `POST /v1/fleets/:fleetId/scan` with NO `fleet-service` method and no
// hook, and that omission is the entire reason `add-scan-and-sightings-
// surface` (8b) is a separate change today. `add-stationkeep-hold-verb`
// shipped `/hold` and `/release` server-side with no client at all. This
// change is the only thing that can give either a client, and
// `frontend/CLAUDE.md` fixes component -> hook -> service -> apiClient, so a
// component calling the route directly fails `/check`'s raw-fetch validator.
// This suite pins the SEAM, at the layer the layering rule names.
//
// THE CONTRACT — three new methods on `fleetService`:
//   preview(fleetId, request: OrderRequest): Promise<BurnPreview>
//   hold(fleetId): Promise<Fleet>
//   release(fleetId): Promise<Fleet>
// plus `order()` widening to carry an optional `maxFuelTons`.
//
//   export interface BurnPreview {
//     controlPoints: Vec3[]      // exactly six
//     departMs: number
//     arriveMs: number
//     deltaV: number
//     fuelCostTons: number
//     affordable: boolean
//     strandingWarning: boolean
//   }
//
// The response shape is typed against the RECORDED wire sample
// (`backend/testdata/serve-orbital-elements-and-burn-preview/
// preview-response.json`), not against a reading of the spec.
//
// VACUITY NOTE: each test asserts the exact URL AND the exact request body.
// A method that posted to the wrong path, or dropped `maxFuelTons`, or
// serialized `point` alongside `bodyId`, fails. A method that merely existed
// and returned undefined fails the response-shape assertions.

vi.mock('../api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

import { fleetService } from './fleet-service'
import type { BurnPreview } from '../types/fleet'

const mockPost = vi.mocked(apiClient.post)
const ok = <T>(data: T) => ({ data, status: 200, headers: new Headers() })

// The recorded wire sample, verbatim.
const PREVIEW: BurnPreview = {
  controlPoints: [
    { X: 26.29659701699857, Y: 0, Z: 724.1016062542494 },
    { X: 100021.0372776136, Y: 100000, Z: 100579.28128500341 },
    { X: 200015.77795821018, Y: 200000, Z: 200434.4609637526 },
    { X: 300010.51863880677, Y: 300000, Z: 300289.64064250176 },
    { X: 400005.2593194033, Y: 400000, Z: 400144.8203212508 },
    { X: 500000, Y: 500000, Z: 500000 },
  ],
  departMs: 21175111881,
  arriveMs: 21176042254,
  deltaV: 3721.492,
  fuelCostTons: 744.2984,
  affordable: true,
  strandingWarning: false,
}

describe('fleetService.preview — the burn-preview seam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('SDET-added: posts to /v1/fleets/:id/orders/preview with a body target', async () => {
    mockPost.mockResolvedValue(ok(PREVIEW))
    const result = await fleetService.preview('fleet_1', { bodyId: 'feat-body-3' })
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/orders/preview', { bodyId: 'feat-body-3' })
    expect(result).toEqual(PREVIEW)
  })

  it('SDET-added: posts a point target unchanged, with no bodyId alongside it', async () => {
    // `fleet-movement`'s *Order Request Validation* rejects a request naming
    // both. A service that always spread `{bodyId: undefined, point}` would
    // be fine over JSON but a service that sent `bodyId: ''` would not.
    mockPost.mockResolvedValue(ok(PREVIEW))
    await fleetService.preview('fleet_1', { point: { X: 10, Y: 0, Z: -20 } })
    const [, body] = mockPost.mock.calls[0]
    expect(body).toEqual({ point: { X: 10, Y: 0, Z: -20 } })
    expect((body as Record<string, unknown>).bodyId).toBeUndefined()
  })

  it('SDET-added: the returned preview carries exactly the six control points and all six figures', async () => {
    mockPost.mockResolvedValue(ok(PREVIEW))
    const p = await fleetService.preview('fleet_1', { bodyId: 'feat-body-3' })
    expect(p.controlPoints).toHaveLength(6)
    expect(p.departMs).toBe(21175111881)
    expect(p.arriveMs).toBe(21176042254)
    expect(p.deltaV).toBe(3721.492)
    expect(p.fuelCostTons).toBe(744.2984)
    expect(p.affordable).toBe(true)
    expect(p.strandingWarning).toBe(false)
  })

  it('SDET-added: a rejected preview propagates the server error rather than resolving', async () => {
    mockPost.mockRejectedValue(
      Object.assign(new Error('preview refused'), {
        data: { error: 'fleet: preview unavailable while the movement channel is held by another run' },
      }),
    )
    await expect(fleetService.preview('fleet_1', { bodyId: 'x' })).rejects.toThrow()
  })
})

describe('fleetService.order — the quoted fuel cap rides the existing request', () => {
  beforeEach(() => vi.clearAllMocks())

  // Scenario: A commit with a current preview carries a cap
  it('Scenario: A commit with a current preview carries a cap (the request shape)', async () => {
    mockPost.mockResolvedValue(ok({ id: 'fleet_1' }))
    await fleetService.order('fleet_1', { bodyId: 'feat-body-3', maxFuelTons: 818.72824 })
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/orders', {
      bodyId: 'feat-body-3',
      maxFuelTons: 818.72824,
    })
  })

  // Scenario: The burn stays committable without a quote, labelled as
  // uncapped  (the request-shape half)
  it('Scenario: The burn stays committable without a quote, labelled as uncapped (no maxFuelTons key is sent)', async () => {
    // `fleet-movement`'s cap requirement distinguishes ABSENT from ZERO: a
    // `maxFuelTons` of 0 is a present cap that rejects any positive cost.
    // Serializing an omitted cap as `0` would turn "no cap" into "the
    // strictest possible cap" and make the uncapped commit unreachable.
    mockPost.mockResolvedValue(ok({ id: 'fleet_1' }))
    await fleetService.order('fleet_1', { bodyId: 'feat-body-3' })
    const [, body] = mockPost.mock.calls[0]
    expect(Object.prototype.hasOwnProperty.call(body, 'maxFuelTons')).toBe(false)
  })

  it('SDET-added: an explicit zero cap IS sent, because zero is a present cap', async () => {
    mockPost.mockResolvedValue(ok({ id: 'fleet_1' }))
    await fleetService.order('fleet_1', { bodyId: 'x', maxFuelTons: 0 })
    const [, body] = mockPost.mock.calls[0]
    expect((body as Record<string, unknown>).maxFuelTons).toBe(0)
  })
})

describe('fleetService.hold / release — the station-keeping seams', () => {
  beforeEach(() => vi.clearAllMocks())

  // Scenario: Holding an orbiting fleet submits hold and the panel reflects
  // station-keep  (the seam half)
  it('Scenario: Holding an orbiting fleet submits hold and the panel reflects station-keep (the seam)', async () => {
    mockPost.mockResolvedValue(ok({ id: 'fleet_1' }))
    await fleetService.hold('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/hold', {})
  })

  // Scenario: Releasing a station-keeping fleet submits release and the
  // panel reflects orbit  (the seam half)
  it('Scenario: Releasing a station-keeping fleet submits release and the panel reflects orbit (the seam)', async () => {
    mockPost.mockResolvedValue(ok({ id: 'fleet_1' }))
    await fleetService.release('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/release', {})
  })

  it('SDET-added: both settle synchronously — the response is the fleet, not an action with an eta', async () => {
    // `docked-fleet-actions`: "Both submissions SHALL settle synchronously
    // (no action, no ETA)". A resolver-shaped response would mean the verb
    // rode the action spine, which it must not.
    mockPost.mockResolvedValue(ok({ id: 'fleet_1', state: { Mode: 1 }, worldTime: 1 }))
    const f = await fleetService.hold('fleet_1')
    expect(f).not.toHaveProperty('actionId')
    expect(f).not.toHaveProperty('eta')
    expect(f.id).toBe('fleet_1')
  })

  it('SDET-added: a rejected hold propagates its distinguishable reason', async () => {
    mockPost.mockRejectedValue(
      Object.assign(new Error('rejected'), {
        data: { error: 'fleet: no spendable fuel above the station-keeping reserve to hold on' },
      }),
    )
    await expect(fleetService.hold('fleet_1')).rejects.toThrow()
  })
})

describe('fleetService — no raw fetch', () => {
  it('SDET-added: every new method routes through apiClient, never global fetch', async () => {
    // `/check`'s raw-fetch validator enforces this too; asserting it here
    // means the failure names the method rather than a lint rule.
    const spy = vi.spyOn(globalThis, 'fetch' as never)
    mockPost.mockResolvedValue(ok(PREVIEW))
    await fleetService.preview('f', { bodyId: 'b' })
    await fleetService.hold('f')
    await fleetService.release('f')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
