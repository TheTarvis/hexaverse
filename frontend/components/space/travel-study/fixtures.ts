export type SelectionKind = 'fleet' | 'destination'
export type Concept = 'A' | 'B' | 'C'
export type StudyItem = { id: string; name: string; system: string; type: string; fuel?: number; mining?: boolean }
export const systems = ['Solace', 'Borealis', 'Meridian', 'Vesper', 'Kepler', 'Aster', 'Carina', 'Draco', 'Eridan', 'Fornax', 'Gemini', 'Hydra']
const names = ['Nereid', 'Cinder', 'Amber', 'Caldera', 'Orison', 'Haven', 'Tethys', 'Farpoint', 'Selene', 'Ariel']
const fleetNames = ['Peregrine', 'Kestrel', 'Wayfarer', 'Prospector', 'Albatross', 'Heron', 'Osprey', 'Swift']
export const destinations: StudyItem[] = systems.flatMap((system, s) => Array.from({ length: 100 }, (_, i) => ({
  id: `destination-${s}-${i}`, system, type: ['Station', 'Moon', 'Rocky world', 'Lane gate'][i % 4],
  name: s === 0 && i === 0 ? 'Nereid research station' : s === 1 && i === 0 ? 'Cinder ore exchange' : `${names[i % names.length]} ${['station', 'moon', 'world', 'gate'][i % 4]} ${Math.floor(i / names.length) + 1}`,
})))
export const fleets: StudyItem[] = systems.flatMap((system, s) => Array.from({ length: 20 }, (_, i) => ({
  id: `fleet-${s}-${i}`, system, type: 'Fleet', name: `${fleetNames[i % fleetNames.length]}${i < 8 ? '' : ` ${Math.floor(i / 8) + 1}`}`,
  fuel: i === 1 ? 4 : 60 + i * 2, mining: i === 3,
})))
export const conceptNames = { A: 'Filtered browser', B: 'System explorer', C: 'Search-led chooser' }
export const conceptDescriptions = {
  A: 'Explicit scope and filters above one results list.',
  B: 'Browse systems, then narrow their contents.',
  C: 'Search across known systems, or start from this trip.',
}
