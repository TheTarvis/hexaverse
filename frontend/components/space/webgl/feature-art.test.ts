import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeObjectResources } from '@/components/graphics/scene-resources'
import { advanceFeatureModel, createFeatureModel, featureArtKind, type FeatureArtKind } from './feature-art'

const kinds: FeatureArtKind[] = ['anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation']

function resources(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) geometry.add(object.geometry)
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  return { geometry, materials, textures }
}

/** Ignore UUIDs; compare actual art and time-controlled visual state. */
function appearance(root: THREE.Object3D) {
  const entries: unknown[] = []
  root.traverse(object => {
    const entry: unknown[] = [object.type, object.position.toArray(), object.rotation.toArray(), object.scale.toArray()]
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) entry.push(Array.from(object.geometry.getAttribute('position')?.array ?? []))
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        entry.push(material.opacity, (material as THREE.MeshBasicMaterial).color?.getHex())
      }
    }
    entries.push(entry)
  })
  return entries
}

describe('disclosed feature art', () => {
  it('maps only canonical supported feature types, never contacts or resource-bearing worlds', () => {
    for (const kind of kinds) expect(featureArtKind(kind)).toBe(kind)
    for (const other of ['contact', 'fleet', 'belt', 'resource-site', 'rocky', 'gate', 'gravity well', 'future-type', '']) expect(featureArtKind(other)).toBeNull()
  })

  it.each(kinds)('%s has bounded finite geometry and preserves mark transforms', kind => {
    const model = createFeatureModel(kind, 'sample')
    expect(model).toBeInstanceOf(THREE.Mesh)
    expect(model.userData.featureArtKind).toBe(kind)
    model.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(model)
    expect(bounds.isEmpty()).toBe(false)
    expect(bounds.getBoundingSphere(new THREE.Sphere()).radius).toBeCloseTo(0.95, 3)
    expect(model.position.toArray()).toEqual([0, 0, 0])
    expect(model.scale.toArray()).toEqual([1, 1, 1])
    model.position.set(4, 5, 6)
    model.scale.setScalar(3)
    advanceFeatureModel(model, 5000)
    expect(model.position.toArray()).toEqual([4, 5, 6])
    expect(model.scale.toArray()).toEqual([3, 3, 3])
    disposeObjectResources(model)
  })

  it.each(kinds)('%s is deterministic by ID and all GPU resources belong to its instance', kind => {
    const a = createFeatureModel(kind, 'same')
    const b = createFeatureModel(kind, 'same')
    expect(appearance(a)).toEqual(appearance(b))
    const own = resources(a), other = resources(b)
    for (const item of own.geometry) expect(other.geometry.has(item)).toBe(false)
    for (const item of own.materials) expect(other.materials.has(item)).toBe(false)
    for (const item of own.textures) expect(other.textures.has(item)).toBe(false)
    const spies = [...own.geometry, ...own.materials, ...own.textures].map(item => vi.spyOn(item, 'dispose'))
    disposeObjectResources(a)
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1)
    const fresh = createFeatureModel(kind, 'same')
    expect(appearance(b)).toEqual(appearance(fresh))
    disposeObjectResources(fresh)
    disposeObjectResources(b)
  })

  it.each(['ruin', 'debris', 'nebula'] as const)('%s changes cosmetic arrangement across IDs', kind => {
    const a = createFeatureModel(kind, 'first'), b = createFeatureModel(kind, 'second')
    expect(appearance(a)).not.toEqual(appearance(b))
    disposeObjectResources(a)
    disposeObjectResources(b)
  })

  it.each(['anomaly', 'nebula', 'gravity_well', 'radiation'] as const)('%s freezes at repeated decorative time and scrubs without accumulated drift', kind => {
    const model = createFeatureModel(kind, 'motion')
    const initial = appearance(model)
    advanceFeatureModel(model, 12000)
    const later = appearance(model)
    expect(later).not.toEqual(initial)
    advanceFeatureModel(model, 12000)
    expect(appearance(model)).toEqual(later)
    advanceFeatureModel(model, 0)
    expect(appearance(model)).toEqual(initial)
    advanceFeatureModel(model, Number.NaN)
    expect(appearance(model)).toEqual(initial)
    for (const material of resources(model).materials) {
      if (material.transparent) expect(material.depthWrite).toBe(false)
    }
    disposeObjectResources(model)
  })
})
