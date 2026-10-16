import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createSpacecraftPreviewScene } from './spacecraft-preview'
import { disposeObjectResources } from '@/components/graphics/scene-resources'

const loads = vi.hoisted(() => ({ entries: [] as { url: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }[] }))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  loadAsync(url: string) { return new Promise((resolve, reject) => loads.entries.push({ url, resolve, reject })) }
} }))
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function source() {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 2), new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array([100, 100, 100, 255]), 1, 1) })))
  return group
}
function mount(kind: 'ship' | 'station' | 'gas_giant' | 'rocky' | 'ice' | 'moon' | 'star' = 'ship') {
  const abort = new AbortController(), invalidate = vi.fn(), status = vi.fn()
  const content = createSpacecraftPreviewScene({ element: document.createElement('div'), signal: abort.signal, invalidate }, { kind, objectId: 'served-id', accentColor: 0x4ade80, starClass: 'G', onAssetStatus: status })
  const model = () => content.scene.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh
  const dispose = () => { abort.abort(); content.dispose?.(); disposeObjectResources(content.scene) }
  return { content, model, invalidate, status, dispose }
}
function watch(root: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    resources.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value)
    }
  })
  return [...resources].map(resource => vi.spyOn(resource, 'dispose'))
}
beforeEach(() => { loads.entries = [] })
afterEach(() => { vi.restoreAllMocks() })

describe('production preview scene content', () => {
  it.each(['gas_giant', 'rocky', 'ice', 'moon'] as const)('uses the real %s surface and preserves pose/reset without loading ship art', kind => {
    const h = mount(kind)
    expect(loads.entries).toHaveLength(0)
    expect(h.status).toHaveBeenLastCalledWith('ready')
    expect((h.model().material as THREE.MeshStandardMaterial).map).toBeInstanceOf(THREE.DataTexture)
    h.content.rotate(0.4, 99)
    expect(h.model().rotation.y).toBeCloseTo(0.4)
    expect(h.model().rotation.x).toBeCloseTo(Math.PI / 3)
    h.content.reset()
    expect(h.model().rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
    const resources = watch(h.model())
    h.dispose()
    resources.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
  })

  it.each(['ship', 'station'] as const)('loads canonical %s artwork with the production camera and light rig', kind => {
    const h = mount(kind)
    expect(loads.entries[0].url).toBe(kind === 'ship' ? '/models/space/utility-ship.glb' : '/models/space/orbital-station.glb')
    expect(h.content.scene.background).toBeNull()
    const lights = h.content.scene.children.filter(object => object instanceof THREE.Light)
    expect(lights.map(light => (light as THREE.Light).color.getHex())).toEqual([0xc7ddff, 0xffe2b3, 0x79b9ff])
    for (const [width, height] of [[300, 200], [100, 200]]) {
      h.content.resize!(width, height)
      const camera = h.content.camera as THREE.PerspectiveCamera
      expect(camera.fov).toBe(35)
      expect(camera.position.clone().normalize().distanceTo(new THREE.Vector3(3, 2, -3).normalize())).toBeLessThan(0.00001)
      const angle = Math.min(35 * Math.PI / 360, Math.atan(Math.tan(35 * Math.PI / 360) * width / height))
      expect(camera.position.length() * Math.sin(angle)).toBeGreaterThanOrEqual(1.0999)
    }
    h.dispose()
  })

  it('retains current orientation and latest accent through delayed model replacement, then recolors without another load', async () => {
    const h = mount()
    const fallback = h.model(), releases = watch(fallback)
    h.content.rotate(0.6, 0.2)
    const pose = fallback.quaternion.clone()
    h.content.setAccentColor(0xffb454)
    const loaded = source(), sourceReleases = watch(loaded)
    loads.entries[0].resolve({ scene: loaded })
    await settle()
    expect(h.status).toHaveBeenLastCalledWith('ready')
    expect(h.model()).not.toBe(fallback)
    expect(h.model().quaternion.equals(pose)).toBe(true)
    releases.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
    const camera = h.content.camera.position.clone()
    h.content.setAccentColor(0xc4b5fd)
    let accented = false
    h.model().traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('color' in material && (material.color as THREE.Color).getHex() === 0xc4b5fd) accented = true
      }
    })
    expect(accented).toBe(true)
    expect(h.model().quaternion.equals(pose)).toBe(true)
    expect(h.content.camera.position.equals(camera)).toBe(true)
    expect(loads.entries).toHaveLength(1)
    h.dispose()
    sourceReleases.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
  })

  it.each(['reject', 'empty'] as const)('keeps usable fallback art on %s asset failure', async reason => {
    const h = mount(), fallback = h.model()
    if (reason === 'reject') loads.entries[0].reject(new Error('decode failed'))
    else loads.entries[0].resolve({ scene: new THREE.Group() })
    await settle()
    expect(h.status).toHaveBeenLastCalledWith('fallback')
    expect(h.model()).toBe(fallback)
    expect(() => h.content.rotate(0.2, 0.1)).not.toThrow()
    h.dispose()
  })

  it('releases late asset results and publishes nothing after the canvas aborts', async () => {
    const h = mount()
    h.dispose()
    h.status.mockClear()
    const loaded = source(), releases = watch(loaded)
    loads.entries[0].resolve({ scene: loaded })
    await settle()
    releases.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
    expect(h.status).not.toHaveBeenCalled()
  })

  it('releases star sprite resources through the same helper as mesh resources', () => {
    const h = mount('star')
    const sprite = h.model().children.find(child => child instanceof THREE.Sprite) as THREE.Sprite
    const spriteMaterial = vi.spyOn(sprite.material, 'dispose')
    const surface = vi.spyOn(h.model().material as THREE.Material, 'dispose')
    h.dispose()
    expect(spriteMaterial).toHaveBeenCalledTimes(1)
    expect(surface).toHaveBeenCalledTimes(1)
  })
})
