import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createStarModel, stellarTint } from './star-art'

function materials(root: THREE.Object3D) {
  const found = new Set<THREE.Material>()
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) found.add(material)
    }
  })
  return [...found]
}
describe('shared stellar artwork', () => {
  it('Scenario: Stellar color follows served class', () => {
    for (const [spectralClass, tint] of Object.entries({ O: 0x9bb0ff, B: 0xaabfff, A: 0xcad7ff, F: 0xf8f3e6, G: 0xffe7b8, K: 0xffc98a, M: 0xff9f6a })) expect(stellarTint(spectralClass)).toBe(tint)
    expect(stellarTint()).toBe(0xffd9a0); expect(stellarTint('unknown')).toBe(0xffd9a0)
  })
  it('Scenario: Fixed-camera plasma evolves — real node material family and stable orientation', () => {
    const star = createStarModel({ objectId: 'served-star', starClass: 'G' })
    expect(star.mesh).toBeInstanceOf(THREE.Mesh)
    expect((star.mesh.material as THREE.Material & { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true)
    expect((star.mesh.material as THREE.Material).transparent).toBe(false)
    expect(star.mesh.children.length).toBeGreaterThan(0)
    const pose = star.mesh.quaternion.clone()
    for (const seconds of [0, -1, NaN, Infinity, 0.016, 2]) expect(() => star.advance(seconds)).not.toThrow()
    expect(star.mesh.quaternion.equals(pose)).toBe(true)
    // Actual spatial/time evolution is asserted with GPU images in the journey;
    // a JS-only surrogate would prove nothing about the rendered node field.
    star.dispose()
  })
  it('Scenario: Corona follows its star without becoming a target', () => {
    const star = createStarModel({ objectId: 'star', starClass: 'O' })
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1))
    const hits: THREE.Intersection[] = []
    for (const child of star.mesh.children) {
      child.traverse(object => { object.raycast(raycaster, hits) })
      expect(child.position.length()).toBe(0)
      for (const material of materials(child)) { expect(material.depthWrite).toBe(false); expect(material.stencilWrite).toBe(false) }
    }
    expect(hits).toEqual([]); star.dispose()
  })
  it('Scenario: Stellar panel closure disposes only its instance', () => {
    const mapGeometry = new THREE.SphereGeometry(1, 12, 8)
    const shared = vi.spyOn(mapGeometry, 'dispose')
    const map = createStarModel({ objectId: 'same', starClass: 'K', geometry: mapGeometry })
    const preview = createStarModel({ objectId: 'same', starClass: 'K' })
    expect(preview.mesh.material).not.toBe(map.mesh.material)
    const mapDisposal = materials(map.mesh).map(material => vi.spyOn(material, 'dispose'))
    const previewDisposal = materials(preview.mesh).map(material => vi.spyOn(material, 'dispose'))
    const ownedGeometry = vi.spyOn(preview.mesh.geometry, 'dispose')
    preview.dispose(); preview.dispose()
    previewDisposal.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); expect(ownedGeometry).toHaveBeenCalledTimes(1)
    mapDisposal.forEach(spy => expect(spy).not.toHaveBeenCalled()); expect(shared).not.toHaveBeenCalled()
    map.dispose(); map.dispose(); mapDisposal.forEach(spy => expect(spy).toHaveBeenCalledTimes(1))
    expect(shared).not.toHaveBeenCalled(); mapGeometry.dispose()
  })
})
