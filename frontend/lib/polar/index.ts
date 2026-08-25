// The polar lattice's production-shaped TypeScript mirror (openspec
// polar-lattice-math). Zero consumers by design — see schedule.ts's header.
export {
  type PolarCell,
  type Schedule,
  bandedSchedule,
  canonCell,
  normalizeSlot,
  slotsForRing,
  validateSchedule,
} from './schedule'
export { arcPath, floorDiv } from './path'
export { type PolarOrbit, cellAt, orbitThrough } from './orbit'
export { isAdjacent } from './adjacency'
export { ringRadius } from './radius'
