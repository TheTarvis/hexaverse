import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { commitServedBurn } from './served-movement'

vi.mock('../config/env', () => ({ resolveE2EConfig: () => ({ apiURL: 'http://test.invalid' }) }))

function fixture(body: unknown, ok = true) {
  const post = vi.fn().mockResolvedValue({ ok: () => ok, status: () => ok ? 200 : 409,
    json: async () => body, text: async () => 'refused' })
  return { post, page: { request: { post } } as unknown as Page }
}

describe('real movement setup rejects false preconditions', () => {
  it('preserves the served body identifier and requires a detached active burn', async () => {
    const fleet = { state: { Mode: 0, Burn: { ArriveMs: 42 } }, attachedTo: '' }
    const { page, post } = fixture(fleet)
    await expect(commitServedBurn(page, 'fleet', { bodyId: 'served-Ω' }, 'token')).resolves.toBe(fleet)
    expect(post).toHaveBeenCalledWith('http://test.invalid/v1/fleets/fleet/orders', {
      headers: { Authorization: 'Bearer token' }, data: { bodyId: 'served-Ω' },
    })
  })
  it('fails a refused order rather than polling an already parked fleet to a false pass', async () => {
    const { page } = fixture({}, false)
    await expect(commitServedBurn(page, 'fleet', { bodyId: 'host' }, 'token')).rejects.toThrow('refused')
  })
  it.each([
    { state: { Mode: 1, Burn: null } },
    { state: { Mode: 0, Burn: {} }, attachedTo: 'old-host' },
  ])('rejects a successful response without actual departure: %j', async fleet => {
    const { page } = fixture(fleet)
    await expect(commitServedBurn(page, 'fleet', { bodyId: 'host' }, 'token')).rejects.toThrow('detached, active burn')
  })
})
