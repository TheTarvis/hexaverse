import { z } from 'zod'
import type { Fleet } from './types/fleet'
import type { SellResult, RefuelResult } from './types/market'
import type { GameAction } from './types/action'

const guideSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  corporationId: z.string().min(1),
  fleetId: z.string().min(1),
  systemId: z.string().min(1),
  phase: z.enum(['wake', 'objects', 'station', 'scan', 'scanning', 'contacts', 'target', 'travel', 'mine', 'extraction', 'return', 'returning', 'sell', 'refuel', 'done', 'dismissed']),
  scanActionId: z.string().min(1).nullable().default(null),
  stationId: z.string().min(1).nullable().default(null),
  targetId: z.string().min(1).nullable(),
  acceptedAt: z.number().finite().nonnegative().nullable(),
  mineActionId: z.string().min(1).nullable(),
  resource: z.enum(['metals', 'volatiles', 'water', 'organics', 'research', 'exotic']).nullable(),
  cargoBefore: z.number().finite().nonnegative(),
}).refine(g => !['scanning', 'contacts'].includes(g.phase) || !!g.scanActionId)
  .refine(g => !['travel', 'mine', 'extraction', 'return', 'returning', 'sell', 'refuel', 'done'].includes(g.phase) || (!!g.targetId && g.acceptedAt !== null))
  .refine(g => !['returning', 'sell', 'refuel'].includes(g.phase) || !!g.stationId)
  .refine(g => g.version === 1 || g.phase !== 'done' || !!g.stationId)
  .refine(g => !['extraction', 'return', 'returning', 'sell', 'refuel', 'done'].includes(g.phase) || (!!g.mineActionId && !!g.resource))

export type CommandGuide = z.infer<typeof guideSchema>

export function newGuide(corporationId: string, fleetId: string, systemId: string): CommandGuide {
  return { version: 3, scanActionId: null, stationId: null, corporationId, fleetId, systemId, phase: 'wake', targetId: null, acceptedAt: null, mineActionId: null, resource: null, cargoBefore: 0 }
}

export function parseGuide(raw: string | null, corporationId: string): CommandGuide | null {
  try {
    const result = guideSchema.safeParse(JSON.parse(raw ?? 'null'))
    if (!result.success || result.data.corporationId !== corporationId) return null
    return { ...result.data, version: 3, phase: result.data.version === 1 && result.data.phase === 'done' ? 'return' : result.data.version < 3 && result.data.phase === 'target' ? 'objects' : result.data.phase }
  } catch { return null }
}

export function reconcileGuide(guide: CommandGuide, fleet: Fleet | null, action: GameAction | null): CommandGuide {
  if (!fleet || !fleet.own || fleet.id !== guide.fleetId || fleet.corporationId !== guide.corporationId || fleet.systemId !== guide.systemId || fleet.jump) return guide
  if (guide.phase === 'scanning' && action?.id === guide.scanActionId && action.actor === guide.fleetId && action.scope === guide.systemId && action.type === 'scan') {
    if (action.status === 'cancelled' || (action.status === 'done' && action.reasonCode)) return { ...guide, phase: 'scan', scanActionId: null }
    if (action.status === 'done') return { ...guide, phase: 'contacts' }
  }
  if (guide.phase === 'travel' && fleet.state.Mode === 1 && fleet.attachedTo === guide.targetId && guide.acceptedAt !== null && fleet.worldTime >= guide.acceptedAt) {
    return { ...guide, phase: 'mine' }
  }
  if (['return', 'returning'].includes(guide.phase) && guide.stationId && fleet.state.Mode === 1 && fleet.attachedTo === guide.stationId && guide.acceptedAt !== null && fleet.worldTime >= guide.acceptedAt) return { ...guide, phase: 'sell' }
  if (guide.phase !== 'extraction' || !action || action.id !== guide.mineActionId || action.actor !== guide.fleetId || action.type !== 'mine') return guide
  // Unlike scans, a successful mine explicitly reports the code "clean".
  if (action.status === 'cancelled' || (action.status === 'done' && action.reasonCode && action.reasonCode !== 'clean')) {
    return { ...guide, phase: 'mine', mineActionId: null }
  }
  if (action.status === 'done' && guide.resource && (fleet.roster?.cargo?.[guide.resource] ?? 0) >= guide.cargoBefore + 1) return { ...guide, phase: 'return' }
  return guide
}

export type GuideSale = { fleetId: string; featureId: string; kind: string; result: SellResult }
export type GuideRefuel = { fleetId: string; featureId: string; fuelBefore: number; result: RefuelResult }

/** Instant market receipts are authoritative; unrelated balance changes are not evidence. */
export function confirmGuideSale(guide: CommandGuide, sale: GuideSale): CommandGuide {
  if (guide.phase !== 'sell' || sale.fleetId !== guide.fleetId || sale.featureId !== guide.stationId || sale.kind !== guide.resource || sale.result.totalProceeds <= 0 || !sale.result.fills.some(fill => fill.tons > 0)) return guide
  return { ...guide, phase: 'refuel' }
}

export function confirmGuideRefuel(guide: CommandGuide, purchase: GuideRefuel): CommandGuide {
  if (guide.phase !== 'refuel' || purchase.fleetId !== guide.fleetId || purchase.featureId !== guide.stationId || (purchase.result.cargo.fuel ?? 0) <= purchase.fuelBefore) return guide
  return { ...guide, phase: 'done' }
}

const memory = new Map<string, string>()
const EVENT = 'hexaverse-command-guide'
const key = (id: string) => `hexaverse:command-guide:v1:${id}`

export function guideSnapshot(corporationId: string | null): string | null {
  if (!corporationId || typeof window === 'undefined') return null
  if (memory.has(corporationId)) return memory.get(corporationId)!
  try { return localStorage.getItem(key(corporationId)) } catch { return null }
}

export function saveGuide(guide: CommandGuide): void {
  const value = JSON.stringify(guide)
  try { localStorage.setItem(key(guide.corporationId), value); memory.delete(guide.corporationId) }
  catch { memory.set(guide.corporationId, value) }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

export function subscribeGuide(notify: () => void): () => void {
  window.addEventListener(EVENT, notify)
  window.addEventListener('storage', notify)
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', notify) }
}
