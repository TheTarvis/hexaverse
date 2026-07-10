import { describe, it, expect } from 'vitest'
import { BAND_STYLE, bandForRing, DEFAULT_BAND_BOUNDS, rgba, tileFill, tileStroke, type Band } from './board-palette'

describe('bandForRing', () => {
  it('maps rings to bands using the backend default boundaries', () => {
    const { innerMaxRing, midMaxRing } = DEFAULT_BAND_BOUNDS
    expect(bandForRing(0)).toBe('core')
    expect(bandForRing(1)).toBe('inner')
    expect(bandForRing(innerMaxRing)).toBe('inner')
    expect(bandForRing(innerMaxRing + 1)).toBe('mid')
    expect(bandForRing(midMaxRing)).toBe('mid')
    expect(bandForRing(midMaxRing + 1)).toBe('outer')
  })

  it('honours custom boundaries', () => {
    expect(bandForRing(3, { innerMaxRing: 2, midMaxRing: 4 })).toBe('mid')
  })
})

describe('rgba', () => {
  it('expands a #rrggbb tint to an rgba() string', () => {
    expect(rgba('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(rgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)')
    expect(rgba('#6ea0e6', 0.09)).toBe('rgba(110, 160, 230, 0.09)')
  })
})

describe('tile styling', () => {
  it('derives translucent fill and stroke from every band tint', () => {
    for (const band of Object.keys(BAND_STYLE) as Band[]) {
      expect(tileFill(band)).toMatch(/^rgba\(/)
      expect(tileStroke(band)).toMatch(/^rgba\(/)
    }
  })

  it('warms the mid (habitable) band above the others', () => {
    expect(tileFill('mid')).not.toBe(tileFill('inner'))
  })
})
