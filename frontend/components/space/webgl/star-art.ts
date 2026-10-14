import * as THREE from 'three'
import { MeshBasicNodeMaterial, SpriteNodeMaterial } from 'three/webgpu'
import { uniform, positionLocal, sin, vec3, uv, length, smoothstep, atan, cos, mix } from 'three/tsl'
export interface StarModel { mesh: THREE.Mesh; advance(seconds: number): void; dispose(): void }
const PALETTE: Record<string, number> = { O: 0x9bb0ff, B: 0xaabfff, A: 0xcad7ff, F: 0xf8f3e6, G: 0xffe7b8, K: 0xffc98a, M: 0xff9f6a }
export function stellarTint(starClass?: string): number { return PALETTE[(starClass ?? '').charAt(0).toUpperCase()] ?? 0xffd9a0 }
/** Independent presentation clock; all field evaluation happens on the GPU. */
export function createStarModel(options: { objectId: string; starClass?: string; geometry?: THREE.SphereGeometry }): StarModel {
  let seed = 2166136261
  for (const char of options.objectId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  const phase = (seed >>> 0) / 4294967296 * Math.PI * 2
  const time = uniform(0)
  const p = positionLocal.normalize()
  const drift = time.mul(0.35).add(phase)
  const warp = vec3(sin(p.y.mul(7).add(drift)), sin(p.z.mul(9).sub(drift.mul(0.7))), sin(p.x.mul(8).add(drift.mul(0.8)))).mul(0.16)
  const q = p.add(warp)
  const broad = sin(q.x.mul(16).add(sin(q.y.mul(13)))).mul(sin(q.z.mul(18).add(drift)))
  const grain = sin(q.x.mul(67).add(sin(q.z.mul(49)).mul(2))).mul(sin(q.y.mul(59).sub(drift.mul(1.3))))
  const tint = new THREE.Color(stellarTint(options.starClass))
  const surface = new MeshBasicNodeMaterial({ color: tint })
  // Dark convection cells and bright filaments stay legible under tone mapping.
  const cells = smoothstep(-0.55, 0.65, broad)
  const filaments = grain.abs().oneMinus().pow(6)
  const plasma = mix(vec3(tint.r, tint.g, tint.b), vec3(1, 0.98, 0.94), filaments.mul(0.35))
  surface.colorNode = plasma.mul(cells.mul(0.65).add(grain.mul(0.14)).add(filaments.mul(0.2)).add(0.68))
  const geometry = options.geometry ?? new THREE.SphereGeometry(1, 48, 32)
  const mesh = new THREE.Mesh(geometry, surface)
  const coronaMaterial = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: tint, opacity: 0.22 })
  const v = uv().sub(0.5).mul(2)
  const radius = length(v)
  const angle = atan(v.y, v.x)
  const tendrils = sin(angle.mul(11).add(drift)).mul(cos(angle.mul(7).sub(drift.mul(0.6)))).mul(0.035).add(1)
  // Keep a bright limb close to the photosphere, then fade quickly. The
  // compact, faint outer glow leaves nearby spacecraft silhouettes readable.
  coronaMaterial.opacityNode = smoothstep(0.5, 1, radius.mul(tendrils)).oneMinus().pow(3).mul(0.22)
  coronaMaterial.colorNode = vec3(tint.r, tint.g, tint.b)
  const corona = new THREE.Sprite(coronaMaterial)
  corona.scale.set(3.6, 3.6, 1)
  corona.raycast = () => {}
  mesh.add(corona)
  let disposed = false
  return { mesh,
    advance(seconds) { if (!disposed && Number.isFinite(seconds) && seconds > 0) time.value += Math.min(seconds, 0.1) },
    dispose() { if (disposed) return; disposed = true; surface.dispose(); coronaMaterial.dispose(); if (!options.geometry) geometry.dispose() },
  }
}
