import { describe, expect, it } from 'vitest'
import { BAND_STYLE, FEATURE_STYLE } from '@/components/board/board-palette'
import { BAND_TINT, BODY_COLOR, bandForRing, FOG } from './spike-palette'

// The spike's central claim is that the WebGL board looks different because of
// LIGHTING, not because the colours were quietly improved. These tests hold that
// claim honest: every hue here must still match the production board palette.

describe('palette parity with components/board', () => {
  it('uses the production band tints unchanged', () => {
    expect(BAND_TINT.core).toBe(BAND_STYLE.core.tint)
    expect(BAND_TINT.inner).toBe(BAND_STYLE.inner.tint)
    expect(BAND_TINT.mid).toBe(BAND_STYLE.mid.tint)
    expect(BAND_TINT.outer).toBe(BAND_STYLE.outer.tint)
  })

  it('uses the production body colours unchanged', () => {
    for (const [type, color] of Object.entries(BODY_COLOR)) {
      expect(color).toBe(FEATURE_STYLE[type as keyof typeof FEATURE_STYLE].color)
    }
  })
})

describe('bandForRing', () => {
  it('puts the star alone in the core band', () => {
    expect(bandForRing(0)).toBe('core')
    expect(bandForRing(1)).toBe('inner')
  })

  it('honours the inner/mid boundaries inclusively', () => {
    expect(bandForRing(5, 5, 11)).toBe('inner')
    expect(bandForRing(6, 5, 11)).toBe('mid')
    expect(bandForRing(11, 5, 11)).toBe('mid')
    expect(bandForRing(12, 5, 11)).toBe('outer')
  })
})

describe('FOG treatments', () => {
  it('dims monotonically as the observation gets colder', () => {
    expect(FOG.visible.dim).toBeGreaterThan(FOG.remembered.dim)
    expect(FOG.remembered.dim).toBeGreaterThan(FOG.astronomical.dim)
  })

  it('degrades the signal only on the remembered band', () => {
    expect(FOG.visible.chroma).toBe(0)
    expect(FOG.visible.breakUp).toBe(0)
    expect(FOG.remembered.chroma).toBeGreaterThan(0)
    expect(FOG.remembered.breakUp).toBeGreaterThan(0)
  })

  it('drops the lit surface only on the astronomical band', () => {
    expect(FOG.visible.wireOnly).toBe(false)
    expect(FOG.remembered.wireOnly).toBe(false)
    expect(FOG.astronomical.wireOnly).toBe(true)
  })
})
