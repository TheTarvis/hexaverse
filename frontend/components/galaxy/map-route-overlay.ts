import * as THREE from 'three'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'

export const MAP_PALETTES = {
  emerald: { label: 'Default Emerald', route: '#27d568' },
  amber: { label: 'High-contrast Amber', route: '#ffbf3f' },
  ivory: { label: 'High-contrast Ivory', route: '#fff2cc' },
} as const
export type MapPalette = keyof typeof MAP_PALETTES
export interface MapRoute {
  systemIds: readonly string[]
  state: 'proposed' | 'active'
  /** Number of completed lane hops, never interpolated fleet position. */
  completedLegs: number
}
export interface RouteLeg { from: GalaxyNode; to: GalaxyNode; completed: boolean }

/** Reject the whole overlay on any missing system/lane, never draw a shortcut. */
export function resolveRoute(galaxy: Galaxy, route: MapRoute): RouteLeg[] {
  const completedLegs = Number.isFinite(route.completedLegs) ? Math.max(0, Math.floor(route.completedLegs)) : 0
  const nodes = new Map(galaxy.nodes.map(node => [node.id, node]))
  const adjacent = new Map<string, Set<string>>()
  for (const lane of galaxy.links) {
    for (const [a, b] of [[lane.source, lane.target], [lane.target, lane.source]]) {
      if (!adjacent.has(a)) adjacent.set(a, new Set())
      adjacent.get(a)!.add(b)
    }
  }
  const legs: RouteLeg[] = []
  for (let i = 1; i < route.systemIds.length; i++) {
    const from = nodes.get(route.systemIds[i - 1]), to = nodes.get(route.systemIds[i])
    if (!from || !to || !adjacent.get(from.id)?.has(to.id)) return []
    legs.push({ from, to, completed: route.state === 'active' && i <= completedLegs })
  }
  return legs
}

/** Screen-space navigation ink: stable stroke/dash sizes through orbit and zoom. */
export function paintMapRoute(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, legs: RouteLeg[], route: MapRoute | undefined, palette: MapPalette, width: number, height: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx || !width || !height) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (!route || !legs.length) return
  camera.updateMatrixWorld()
  const project = (node: GalaxyNode) => {
    const world = new THREE.Vector3(node.x, node.y, node.z)
    const depth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z
    const radius = 5.2 * height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(depth, 0.01))
    const p = world.project(camera)
    return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, radius, visible: p.z > -1 && p.z < 1 }
  }
  const color = MAP_PALETTES[palette].route
  const casing = '#02060c', completed = '#687784'
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const leg of legs) {
    const a = project(leg.from), b = project(leg.to)
    if (!a.visible || !b.visible) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 20) continue
    const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length
    const startInset = Math.max(8, a.radius + 4), endInset = Math.max(8, b.radius + 4)
    if (startInset + endInset >= length) continue
    const stroke = (ink: string, weight: number, dash: number[]) => {
      ctx.strokeStyle = ink; ctx.lineWidth = weight; ctx.setLineDash(dash)
      ctx.beginPath(); ctx.moveTo(a.x + dx * startInset, a.y + dy * startInset); ctx.lineTo(b.x - dx * endInset, b.y - dy * endInset); ctx.stroke()
    }
    const dash = route.state === 'proposed' ? [9, 7] : []
    stroke(casing, 7, [])
    stroke(leg.completed ? completed : color, leg.completed ? 2 : 3.4, dash)
    ctx.setLineDash([])
    if (!leg.completed && length > 65) {
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2
      ctx.beginPath(); ctx.moveTo(x - dx * 4 - dy * 4, y - dy * 4 + dx * 4)
      ctx.lineTo(x + dx * 3, y + dy * 3); ctx.lineTo(x - dx * 4 + dy * 4, y - dy * 4 - dx * 4)
      ctx.strokeStyle = casing; ctx.lineWidth = 6; ctx.stroke()
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke()
    }
  }
  const marker = (node: GalaxyNode, kind: 'origin' | 'destination' | 'current') => {
    const p = project(node)
    if (!p.visible) return
    const ringRadius = Math.max(11, p.radius + 5)
    ctx.setLineDash([])
    for (const [ink, weight] of [[casing, 6], [color, 2]] as const) {
      ctx.strokeStyle = ink; ctx.lineWidth = weight
      for (const radius of kind === 'destination' ? [ringRadius, ringRadius + 4] : [ringRadius]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke()
      }
    }
    if (kind !== 'origin') {
      const top = p.y - ringRadius
      ctx.beginPath()
      if (kind === 'destination') {
        ctx.moveTo(p.x, top - 17); ctx.lineTo(p.x + 5, top - 12); ctx.lineTo(p.x, top - 7); ctx.lineTo(p.x - 5, top - 12)
      } else {
        ctx.moveTo(p.x - 6, top - 12); ctx.lineTo(p.x + 6, top - 12); ctx.lineTo(p.x, top - 3)
      }
      ctx.closePath(); ctx.strokeStyle = casing; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = color; ctx.fill()
      const label = kind === 'destination' ? 'Destination' : 'Current system'
      ctx.font = '12px system-ui'; const textWidth = ctx.measureText(label).width
      const x = Math.min(Math.max(8, p.x + ringRadius + 10), width - textWidth - 16), y = Math.min(Math.max(20, p.y), height - 12)
      ctx.fillStyle = casing; ctx.fillRect(x - 5, y - 14, textWidth + 10, 21)
      ctx.fillStyle = '#e6edf3'; ctx.fillText(label, x, y)
    }
  }
  marker(legs[0].from, 'origin')
  marker(legs[legs.length - 1].to, 'destination')
  const nextLeg = legs.find(leg => !leg.completed)
  if (route.state === 'active' && nextLeg) marker(nextLeg.from, 'current')
}
