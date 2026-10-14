import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type Kind = 'ship' | 'station'
interface Art {
  createSpacecraftModel(kind: Kind, accent: number, asset?: THREE.Group): THREE.Mesh
  SPACECRAFT_ASSET_URLS: Record<Kind, string>
}
async function art(): Promise<Art> {
  const path = './spacecraft-art'
  const exports = await import(/* @vite-ignore */ path).catch(() => null)
  expect(exports, 'Contracted spacecraft-art module exists').not.toBeNull()
  return exports as Art
}
function vertices(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const points: THREE.Vector3[] = []
  root.traverseVisible(o => {
    if (!(o instanceof THREE.Mesh)) return
    const positions = o.geometry.getAttribute('position')
    if (!positions) return
    const transform = inverse.clone().multiply(o.matrixWorld)
    for (let i = 0; i < positions.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform))
  })
  return points
}
function resources(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  let triangles = 0, draws = 0
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return
    const count = o.geometry.index?.count ?? o.geometry.getAttribute('position')?.count ?? 0
    if (!count) return
    geometry.add(o.geometry); triangles += count / 3
    draws += Array.isArray(o.material) ? o.geometry.groups.length : 1
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m)
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  return { geometry, materials, textures, triangles, draws }
}
function bounded(root: THREE.Mesh) {
  expect(root.position.toArray()).toEqual([0, 0, 0])
  expect(root.scale.toArray()).toEqual([1, 1, 1])
  const points = vertices(root)
  expect(points.length).toBeGreaterThan(20)
  for (const p of points) { expect(Number.isFinite(p.length())).toBe(true); expect(p.length()).toBeLessThanOrEqual(1.0001) }
  const size = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3())
  for (const value of size.toArray()) expect(value).toBeGreaterThan(0.01)
  return size
}
describe('add-ship-station-models real Three geometry', () => {
  it.each(['ship', 'station'] as const)('Scenario: %s hull receives lighting while dedicated running lights retain their texture', async kind => {
    const { createSpacecraftModel } = await art()
    const hullMap = new THREE.DataTexture(new Uint8Array([90, 130, 170, 255]), 1, 1)
    const lightMap = new THREE.DataTexture(new Uint8Array([255, 200, 140, 255]), 1, 1)
    const hull = new THREE.MeshStandardMaterial({ map: hullMap, emissiveMap: hullMap.clone(), emissive: 0xffffff })
    const lights = new THREE.MeshStandardMaterial({ emissiveMap: lightMap, emissive: 0xffffff })
    const source = new THREE.Group()
    source.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 8), hull))
    source.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), lights))
    const model = createSpacecraftModel(kind, 0x4ade80, source)
    const materials = [...resources(model).materials].filter((material): material is THREE.MeshStandardMaterial | MeshStandardNodeMaterial => material instanceof THREE.MeshStandardMaterial || material instanceof MeshStandardNodeMaterial)
    const renderedHull = materials.find(material => material.map?.image === hullMap.image)!
    const renderedLights = materials.find(material => material.emissiveMap?.image === lightMap.image)!
    // The imported diffuse atlas must not light every shadow-facing hull panel.
    // A separately authored light atlas still contributes without incident light.
    expect(renderedHull.emissiveMap).toBeNull()
    expect(renderedHull.emissive.getHex()).toBe(0)
    expect(renderedLights.emissive.getHex()).toBe(lights.emissive.getHex())
    expect(hull.emissiveMap?.image).toBe(hullMap.image)
    bounded(model)
  })
  it.each(['ship', 'station'] as const)('Scenario: %s at gameplay and close zoom — bounded multipart lit fallback', async kind => {
    const { createSpacecraftModel } = await art()
    const model = createSpacecraftModel(kind, 0xffb454)
    expect(model).toBeInstanceOf(THREE.Mesh)
    const size = bounded(model)
    const r = resources(model)
    expect(r.draws).toBeGreaterThan(2)
    expect(r.draws).toBeLessThanOrEqual(12)
    expect(r.triangles).toBeLessThanOrEqual(8000)
    expect(r.materials.size).toBeLessThanOrEqual(6)
    expect(r.textures.size).toBe(0)
    expect([...r.materials].some(m => m instanceof THREE.MeshStandardMaterial && m.metalness > 0)).toBe(true)
    expect([...r.materials].some(m => 'color' in m && (m.color as THREE.Color).getHex() === 0xffb454)).toBe(true)
    if (kind === 'ship') expect(size.z).toBeGreaterThan(size.y * 1.5)
    else expect(size.x).toBeGreaterThan(size.y)
  })
  it.each(['ship', 'station'] as const)('Scenario: Repeated %s marks — imported resources are centered, normalized and independent', async kind => {
    const { createSpacecraftModel, SPACECRAFT_ASSET_URLS } = await art()
    expect(SPACECRAFT_ASSET_URLS).toEqual({ ship: '/models/space/utility-ship.glb', station: '/models/space/orbital-station.glb' })
    const source = new THREE.Group()
    const map = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
    const material = new THREE.MeshStandardMaterial({ map, metalness: 0.7 })
    const geometry = new THREE.BoxGeometry(4, 2, 8)
    const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material)
    a.position.set(12, 8, -20); b.position.set(14, 8, -20); source.add(a, b)
    const before = JSON.stringify(source.toJSON())
    const first = createSpacecraftModel(kind, 0x4ade80, source)
    const second = createSpacecraftModel(kind, 0xc4b5fd, source)
    bounded(first); bounded(second)
    expect(JSON.stringify(source.toJSON())).toBe(before)
    const original = resources(source), one = resources(first), two = resources(second)
    expect(one.textures.size).toBe(1)
    for (const key of ['geometry', 'materials', 'textures'] as const) {
      for (const value of one[key]) { expect(original[key].has(value as never)).toBe(false); expect(two[key].has(value as never)).toBe(false) }
    }
    expect([...one.textures][0]!.image).toBe(map.image)
  })
})
