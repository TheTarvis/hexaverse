import { describe, expect, it } from 'vitest'
import { mineableBodyId, stationFeatureId } from './space-view'

describe('served world identifiers', () => {
  it('keeps arbitrary server identifiers rather than rebuilding station or resource names', () => {
    const interior = { systemId: 's', laneGates: [], features: [
      { id: 'server-station-Ω', type: 'station', resources: [{ kind: 'fuel', richness: 2 }] },
      { id: 'server-star', type: 'star', resources: [{ kind: 'fuel', richness: 2 }] },
      { id: 'server-rock', type: 'rocky', resources: [{ kind: 'water', richness: 3 }] },
    ] }
    expect(stationFeatureId(interior)).toBe('server-station-Ω')
    expect(mineableBodyId(interior, stationFeatureId(interior)!)).toBe('server-rock')
  })
  it('does not invent disclosed resources or a station when neither was served', () => {
    const interior = { systemId: 's', laneGates: [], features: [{ id: 'unscanned', type: 'rocky' }] }
    expect(stationFeatureId(interior)).toBeNull()
    expect(mineableBodyId(interior)).toBeNull()
  })
})
