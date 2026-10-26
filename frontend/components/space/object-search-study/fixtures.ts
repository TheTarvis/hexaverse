import type { ObjectSearchEntry } from '../ObjectSearch'

/** Fictional disclosed objects; relationships and observation identities are review fixtures. */
export const objects: ObjectSearchEntry[] = [
  { id: 'peregrine', name: 'Peregrine', kind: 'fleet', category: 'owned', subtitle: 'Owned · Ready at Nereid' },
  { id: 'kestrel', name: 'Kestrel', kind: 'fleet', category: 'owned', subtitle: 'Owned · Idle near Solace' },
  { id: 'courier', name: 'Wayfarer', kind: 'fleet', category: 'friendly', subtitle: 'Friendly · Aster Cooperative' },
  { id: 'raider', name: 'Red Wake', kind: 'fleet', category: 'enemy', subtitle: 'Enemy · Cinder Collective' },
  { id: 'burn', name: 'Unanalyzed burn', kind: 'burn', category: 'unknown', subtitle: 'Unknown · Near the outer belt', lastObserved: '8 minutes ago; current position unknown' },
  { id: 'station', name: 'Solace Station', kind: 'station', owned: true, subtitle: 'Owned · Trade and fuel' },
  { id: 'anchorage', name: 'Aster Anchorage', kind: 'station', subtitle: 'Station · Trade and fuel' },
  { id: 'belt', name: 'Nereid outer belt', kind: 'belt', resourceSite: true, resources: ['metals', 'water'], subtitle: 'Metals · Water' },
  { id: 'ice', name: 'Caldera ice field', kind: 'belt', resourceSite: true, resources: ['volatiles', 'water'], subtitle: 'Volatiles · Water' },
  { id: 'unknown-site', name: 'Farpoint belt', kind: 'belt', resourceSite: true, subtitle: 'Resource contents unknown', lastObserved: '2 hours ago' },
  { id: 'world', name: 'Nereid', kind: 'rocky', resources: ['metals'], subtitle: 'Rocky planet · Metals' },
  { id: 'moon', name: 'Nereid moon', kind: 'moon', resources: ['water'], subtitle: 'Moon · Water' },
  { id: 'asteroid', name: 'Nereid asteroid', kind: 'asteroid', resources: ['metals'], subtitle: 'Asteroid · Metals' },
  { id: 'gate', name: 'Borealis gate', kind: 'gate', subtitle: 'Lane gate · Solace' },
]
