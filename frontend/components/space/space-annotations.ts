import { hitDiameter } from './space-projection'
import type { HitTargetRegistry, SpaceFrame } from './space-transform-loop'

/** Passive annotations share the drawn frame and never affect hit targets. */
export function placeAnnotations(frame: SpaceFrame | null, registry: HitTargetRegistry): void {
  if (!frame) return
  const occupied: { x: number; y: number; width: number; height: number }[] = []
  // Collision-free text can still blanket a dense system. Reserve most of the
  // viewport for surfaces, and let active inspection bypass the passive budget.
  const passiveBudget = Math.max(8, Math.min(18, Math.floor(frame.basis.widthPx * frame.basis.heightPx / 90_000)))
  let passiveCount = 0
  const rank = ([id, el]: [string, HTMLElement]) => {
    const mark = frame.projected.get(id)?.mark
    const keyObject = mark && (['star', 'fleet', 'gate'].includes(mark.kind) || mark.bodyType === 'station')
    return Number(el.dataset.priority) * 2 + (keyObject ? 1 : 0)
  }
  const entries = [...registry.entries()].sort((a, b) => rank(b) - rank(a))
  for (const [id, el] of entries) {
    el.style.visibility = 'hidden'
    const passive = Number(el.dataset.priority) === 0
    if (passive && passiveCount >= passiveBudget) continue
    const entry = frame.projected.get(id)
    if (!entry?.screen.onScreen) continue
    const width = Math.min(160, el.offsetWidth || Math.max(70, (el.textContent?.length ?? 0) * 6 + 16))
    const height = el.offsetHeight || (Number(el.dataset.priority) > 0 ? 44 : 26)
    const margin = 8
    if (frame.basis.widthPx < width + margin * 2 || frame.basis.heightPx < height + margin * 2) continue
    const gap = hitDiameter(entry, frame.basis, frame.extent) / 2 + 6
    const candidates = [
      { x: entry.screen.x + gap, y: entry.screen.y - height / 2 },
      { x: entry.screen.x - gap - width, y: entry.screen.y - height / 2 },
      { x: entry.screen.x - width / 2, y: entry.screen.y + gap },
      { x: entry.screen.x - width / 2, y: entry.screen.y - gap - height },
    ]
    for (const candidate of candidates) {
      const x = Math.max(margin, Math.min(frame.basis.widthPx - width - margin, candidate.x))
      const y = Math.max(margin, Math.min(frame.basis.heightPx - height - margin, candidate.y))
      if (occupied.some(rect => x < rect.x + rect.width + 4 && x + width + 4 > rect.x && y < rect.y + rect.height + 4 && y + height + 4 > rect.y)) continue
      el.style.transform = `translate3d(${x}px, ${y}px, 0px)`
      el.style.visibility = 'visible'
      occupied.push({ x, y, width, height })
      if (passive) passiveCount++
      break
    }
  }
}
