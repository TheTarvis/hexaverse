// Tests for lib/refuel-copy.ts (add-fuel-as-cargo, section 8 client surface)
// — not part of either SDET's pre-written red suite (no test file in this
// repo pins the refuel copy module's own name or shape), so written test-
// first per this repo's discipline for units the red suite doesn't reach.
// Mirrors lib/jump-copy.test.ts's own shape and level.

import { describe, it, expect } from 'vitest'
import { GENERIC_REFUEL_FAILURE, refuelErrorCopy, refuelErrorReason } from './refuel-copy'

describe('refuelErrorCopy', () => {
  it('maps a not-found rejection (the existence-hiding ownership/docked-station 404)', () => {
    expect(refuelErrorCopy('fuel-purchase: fleet not found')).toBe(
      'That fleet or station is not available.',
    )
  })

  it('maps "not docked" to a dock-first instruction', () => {
    expect(refuelErrorCopy('fuel-purchase: fleet is not docked to a station')).toBe(
      'Dock at the station before refueling.',
    )
  })

  it('maps a non-positive tonnage rejection', () => {
    expect(refuelErrorCopy('fuel-purchase: tonnage must be positive finite')).toBe(
      'Enter a tonnage greater than zero.',
    )
  })

  it('maps a free-hold rejection', () => {
    expect(refuelErrorCopy('fuel-purchase: requested tonnage exceeds free hold')).toBe(
      'Your hold cannot take that much fuel.',
    )
  })

  it('maps an unaffordable-in-full rejection', () => {
    expect(refuelErrorCopy('fuel-purchase: requested tonnage costs more than available credits')).toBe(
      "You can't afford that much fuel.",
    )
  })

  it('maps a misconfigured/non-positive price rejection to the same "not for sale" copy', () => {
    expect(refuelErrorCopy('fuel-purchase: misconfigured price')).toBe(
      'Fuel is not available for purchase right now.',
    )
    expect(refuelErrorCopy('fuel-purchase: non-positive price configured')).toBe(
      'Fuel is not available for purchase right now.',
    )
  })

  it('maps an idempotency replay conflict', () => {
    expect(
      refuelErrorCopy('fuel-purchase: operation key already used with different parameters'),
    ).toBe('That refuel was already submitted with different details.')
  })

  it('maps an unresolved ledger divergence', () => {
    expect(refuelErrorCopy('fuel-purchase: unresolved ledger divergence')).toBe(
      'Your account is under review and cannot trade right now.',
    )
  })

  it('maps a per-corporation write-quota rejection', () => {
    expect(refuelErrorCopy('fuel-purchase: write quota exceeded')).toBe(
      "You've hit your trading limit for now. Try again later.",
    )
  })

  it('never leaks a raw server reason for an unmapped rejection', () => {
    const copy = refuelErrorCopy('fuel-purchase: requester does not own this fleet')
    expect(copy).toBe(GENERIC_REFUEL_FAILURE)
    expect(copy.toLowerCase()).not.toContain('fuel-purchase:')
  })

  it('falls back safely for a response carrying no distinguishable reason at all', () => {
    expect(refuelErrorCopy(undefined)).toBe(GENERIC_REFUEL_FAILURE)
    expect(refuelErrorCopy(null)).toBe(GENERIC_REFUEL_FAILURE)
    expect(refuelErrorCopy('')).toBe(GENERIC_REFUEL_FAILURE)
  })

  // apiClient's synthesized transport-layer summary for a bodyless response
  // — never a real server reason (lib/jump-copy.ts's own documented trap;
  // the fleet-ownership 404 this verb shares with jump/sell is exactly this
  // shape).
  it('a bodyless response (apiClient\'s synthesized fallback text) falls through to the generic copy, never a mapped one', () => {
    expect(refuelErrorCopy('API Error: 404 Not Found')).toBe(GENERIC_REFUEL_FAILURE)
    expect(refuelErrorCopy('API Error: 500 Internal Server Error')).toBe(GENERIC_REFUEL_FAILURE)
  })

  it('never returns an empty string', () => {
    for (const reason of ['', 'anything', 'fuel-purchase: tonnage must be positive finite']) {
      expect(refuelErrorCopy(reason).length).toBeGreaterThan(0)
    }
  })
})

describe('refuelErrorReason', () => {
  it('prefers the response body\'s `data.error` field over the transport message', () => {
    const error = {
      message: 'API Error: 400 Bad Request',
      data: { error: 'fuel-purchase: tonnage must be positive finite' },
    }
    expect(refuelErrorReason(error)).toBe('fuel-purchase: tonnage must be positive finite')
  })

  it('prefers a plain-string `data` over the transport message', () => {
    const error = { message: 'API Error: 400 Bad Request', data: 'fuel-purchase: some reason' }
    expect(refuelErrorReason(error)).toBe('fuel-purchase: some reason')
  })

  it('falls back to `message` for a plain Error carrying no `data` at all', () => {
    expect(refuelErrorReason(new Error('fuel-purchase: requested tonnage costs more than available credits'))).toBe(
      'fuel-purchase: requested tonnage costs more than available credits',
    )
  })

  it('returns undefined for a genuinely bodyless error, never the synthesized transport text', () => {
    expect(refuelErrorReason(undefined)).toBeUndefined()
    expect(refuelErrorReason(null)).toBeUndefined()
    expect(refuelErrorReason('just a string')).toBeUndefined()
  })
})
