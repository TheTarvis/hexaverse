import { describe, it, expect } from 'vitest'
import {
  BAND_STYLE,
  bandForRing,
  DEFAULT_BAND_BOUNDS,
  FEATURE_STYLE,
  FLEET_ACCENT,
  FOG_TREATMENT,
  rgba,
  tileFill,
  tileStroke,
  type Band,
} from './board-palette'
import type { FeatureType } from '@/lib/types/system-board'

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

describe('glyph + fog treatments', () => {
  it('styles every feature family', () => {
    const types: FeatureType[] = [
      'star', 'rocky', 'gas_giant', 'ice', 'belt', 'moon',
      'anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation',
    ]
    for (const t of types) {
      expect(FEATURE_STYLE[t].color).toMatch(/^#/)
      expect(FEATURE_STYLE[t].shape).toBeTruthy()
    }
  })

  it('dims the fog bands live → remembered → astronomical', () => {
    expect(FOG_TREATMENT.visible.opacity).toBeGreaterThan(FOG_TREATMENT.remembered.opacity)
    expect(FOG_TREATMENT.remembered.opacity).toBeGreaterThan(FOG_TREATMENT.astronomical.opacity)
    // Only live content reads as un-ghosted.
    expect(FOG_TREATMENT.visible.ghost).toBe(false)
    expect(FOG_TREATMENT.remembered.ghost).toBe(true)
    expect(FOG_TREATMENT.astronomical.ghost).toBe(true)
  })

  it('gives each fleet mode a distinct accent', () => {
    const accents = new Set([FLEET_ACCENT.coast, FLEET_ACCENT.burn, FLEET_ACCENT.docked])
    expect(accents.size).toBe(3)
  })
})
