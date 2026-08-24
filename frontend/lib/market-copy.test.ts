import { describe, it, expect } from 'vitest'
import { saleErrorCopy, isPriceChanged, GENERIC_SALE_FAILURE } from './market-copy'

describe('saleErrorCopy', () => {
  it('maps each server rejection reason to player-facing text', () => {
    const cases: Array<[string, string]> = [
      ['market: fleet is not docked at that station', 'Dock at the station before selling.'],
      ['market: that resource is not tradable at this station', 'This station does not buy that resource.'],
      ['market: tons must be a positive finite number', 'Enter a tonnage greater than zero.'],
      ['market: proceeds round to zero credits', 'That amount is too small to be worth any credits.'],
      ['market: station is busy, try again', 'The station is busy right now. Please try again.'],
    ]
    for (const [reason, want] of cases) {
      expect(saleErrorCopy(reason)).toBe(want)
    }
  })

  it('never leaks a raw server reason for an unmapped rejection', () => {
    // A new server-side reason must surface as a sane line, not as jargon with a
    // package prefix.
    const copy = saleErrorCopy('market: some brand new internal reason')
    expect(copy).toBe(GENERIC_SALE_FAILURE)
    expect(copy).not.toContain('market:')
  })

  it('falls back for a missing reason', () => {
    expect(saleErrorCopy(undefined)).toBe(GENERIC_SALE_FAILURE)
    expect(saleErrorCopy(null)).toBe(GENERIC_SALE_FAILURE)
    expect(saleErrorCopy('')).toBe(GENERIC_SALE_FAILURE)
  })

  it('gives the four existence-hiding rejections one shared line', () => {
    // The server deliberately returns ONE byte-identical reason for an unknown
    // fleet, a foreign fleet, an unknown station, and a below-gate station.
    // Saying anything more specific here would undo that hiding.
    expect(saleErrorCopy('not found')).toBe('That fleet or station is not available.')
  })

  it('never returns an empty string', () => {
    for (const reason of ['', 'anything', 'market: price changed since your quote']) {
      expect(saleErrorCopy(reason).length).toBeGreaterThan(0)
    }
  })
})

describe('isPriceChanged', () => {
  it('identifies the one rejection the offer UI refreshes on', () => {
    expect(isPriceChanged('market: price changed since your quote')).toBe(true)
  })

  it('does not match other rejections', () => {
    expect(isPriceChanged('market: fleet is not docked at that station')).toBe(false)
    expect(isPriceChanged(undefined)).toBe(false)
  })
})
