import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createLaneGatePortal } from '@/components/graphics/lane-gate-portal'
import { disposeObjectResources } from '@/components/graphics/scene-resources'

const portals = new WeakMap<THREE.Mesh, ReturnType<typeof createLaneGatePortal>>()

export async function loadLaneGateAsset(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync('/models/space/lane-gate.glb')
  gltf.scene.animations = gltf.animations ?? []
  return gltf.scene
}

/** Instance-owned hardware and field, fitted to the existing mark/picking radius. */
export function createLaneGateModel(asset?: THREE.Group): THREE.Mesh {
  const root = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
  if (!asset) {
    root.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshStandardMaterial({
      color: 0x67e8f9, emissive: 0x67e8f9, emissiveIntensity: 0.35,
    })))
    return root
  }
  const hardware = asset.clone(true)
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()
  const materials = new Map<THREE.Material, THREE.Material>()
  const textures = new Map<THREE.Texture, THREE.Texture>()
  const materialOf = (original: THREE.Material) => {
    let copy = materials.get(original)
    if (!copy) {
      copy = original.clone()
      materials.set(original, copy)
      for (const [key, value] of Object.entries(original)) {
        if (!(value instanceof THREE.Texture)) continue
        let texture = textures.get(value)
        if (!texture) { texture = value.clone(); textures.set(value, texture) }
        Object.assign(copy, { [key]: texture })
      }
    }
    return copy
  }
  hardware.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    let geometry = geometries.get(object.geometry)
    if (!geometry) { geometry = object.geometry.clone() as THREE.BufferGeometry; geometries.set(object.geometry, geometry) }
    object.geometry = geometry
    object.material = Array.isArray(object.material) ? object.material.map(materialOf) : materialOf(object.material)
  })
  root.add(hardware)
  const closedBounds = new THREE.Box3().setFromObject(hardware)
  const height = closedBounds.max.y - closedBounds.min.y
  if (!Number.isFinite(height) || height <= 0) {
    disposeObjectResources(root)
    throw new Error('Lane gate asset has no finite surface')
  }
  // Gates have no served opening state yet: pose once, fully open. The mixer
  // is local and has no running animation loop or external registrations.
  const clip = THREE.AnimationClip.findByName(asset.animations, 'Open')
  if (clip) {
    const mixer = new THREE.AnimationMixer(hardware)
    const action = mixer.clipAction(clip)
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    mixer.setTime(clip.duration)
  }
  const center = closedBounds.getCenter(new THREE.Vector3())
  hardware.position.sub(center)
  const portal = createLaneGatePortal({ bounds: closedBounds })
  portal.update(1, 0)
  const assembly = new THREE.Group()
  root.remove(hardware)
  assembly.add(hardware, portal.object)
  const radius = new THREE.Box3().setFromObject(assembly).getBoundingSphere(new THREE.Sphere()).radius
  if (!Number.isFinite(radius) || radius <= 0) {
    disposeObjectResources(assembly)
    disposeObjectResources(root)
    throw new Error('Lane gate asset has no finite bounds')
  }
  assembly.scale.setScalar(0.95 / radius)
  // Present the aperture toward the overhead system camera, like the station.
  // This is illustrative orientation, not a simulated lane traversal plane.
  assembly.rotation.x = -Math.PI / 2
  root.add(assembly)
  portals.set(root, portal)
  return root
}

export function advanceLaneGatePortal(mesh: THREE.Mesh, decorativeTimeMs: number) {
  portals.get(mesh)?.update(1, decorativeTimeMs / 1000)
}
