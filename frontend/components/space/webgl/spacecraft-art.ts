import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type SpacecraftKind = 'ship' | 'station'
export const SPACECRAFT_ASSET_URLS: Readonly<Record<SpacecraftKind, string>> = {
  ship: '/models/space/utility-ship.glb',
  station: '/models/space/orbital-station.glb',
}

export async function loadSpacecraftAsset(kind: SpacecraftKind): Promise<THREE.Group> {
  const result = await new GLTFLoader().loadAsync(SPACECRAFT_ASSET_URLS[kind])
  return result.scene
}

/** Clone GPU resources independently; immutable decoded image data stays shared. */
function cloneAsset(source: THREE.Group): THREE.Group {
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()
  const materials = new Map<THREE.Material, THREE.Material>()
  const textures = new Map<THREE.Texture, THREE.Texture>()
  const materialOf = (original: THREE.Material) => {
    let copy = materials.get(original)
    if (copy) return copy
    copy = original.clone()
    materials.set(original, copy)
    // The bundled GLBs use the diffuse atlas as an all-over emissive lift.
    // Restore incident-light shading so panel texture survives on sunlit hulls
    // and the night side has depth. Dedicated light atlases remain emissive.
    const diffuseGlow = original instanceof THREE.MeshStandardMaterial &&
      original.map && original.emissiveMap && original.map.image === original.emissiveMap.image
    if (copy instanceof THREE.MeshStandardMaterial) {
      copy.metalness = Math.min(copy.metalness, 0.42)
      copy.roughness = THREE.MathUtils.clamp(copy.roughness, 0.32, 0.58)
      if (diffuseGlow) {
        copy.emissiveMap = null
        copy.emissive.set(0)
      }
    }
    for (const [key, value] of Object.entries(original)) {
      if (!(value instanceof THREE.Texture)) continue
      if (key === 'emissiveMap' && diffuseGlow) continue
      let texture = textures.get(value)
      if (!texture) { texture = value.clone(); textures.set(value, texture) }
      Object.assign(copy, { [key]: texture })
    }
    return copy
  }
  const group = source.clone(true)
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    let geometry = geometries.get(object.geometry)
    if (!geometry) {
      const original = object.geometry
      geometry = original.clone() as THREE.BufferGeometry
      geometries.set(original, geometry)
    }
    object.geometry = geometry
    object.material = Array.isArray(object.material) ? object.material.map(materialOf) : materialOf(object.material)
  })
  return group
}

/** Center and fit actual transformed vertices, not approximate bounding metadata. */
function normalize(group: THREE.Group, radius: number) {
  group.updateMatrixWorld(true)
  const points: THREE.Vector3[] = []
  group.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return
    const position = object.geometry.getAttribute('position')
    if (!position) return
    for (let i = 0; i < position.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld))
    }
  })
  const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3())
  const extent = points.reduce((maximum, point) => Math.max(maximum, point.distanceTo(center)), 0)
  if (!Number.isFinite(extent) || extent <= 0) {
    // These are exclusively instance-owned clones or native fallback resources.
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material)
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
      }
    })
    textures.forEach(texture => texture.dispose())
    materials.forEach(material => material.dispose())
    geometries.forEach(geometry => geometry.dispose())
    throw new Error('Spacecraft asset has no finite surface')
  }
  const wrapper = new THREE.Group()
  wrapper.add(group)
  wrapper.position.copy(center).multiplyScalar(-radius / extent)
  wrapper.scale.setScalar(radius / extent)
  return wrapper
}

function fallback(kind: SpacecraftKind, accent: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group()
  const plate = new THREE.MeshStandardMaterial({ color: 0xcbdce8, metalness: 0.42, roughness: 0.36 })
  const recess = new THREE.MeshStandardMaterial({ color: 0x1d2a38, metalness: 0.25, roughness: 0.58 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }
  if (kind === 'ship') {
    // Extruded wedge points forward along -Z; the upper deck and inset cockpit
    // stay visually separate from the paired engine housings.
    const outline = new THREE.Shape()
    outline.moveTo(0, -1.4); outline.lineTo(0.5, 0.65); outline.lineTo(-0.5, 0.65); outline.closePath()
    const hull = new THREE.ExtrudeGeometry(outline, { depth: 0.22, bevelEnabled: false })
    hull.rotateX(Math.PI / 2)
    add(hull, plate)
    add(new THREE.BoxGeometry(0.48, 0.23, 0.85), plate, 0, 0.12, 0.1)
    add(new THREE.BoxGeometry(0.28, 0.09, 0.38), recess, 0, 0.27, -0.23)
    for (const x of [-0.65, 0.65]) {
      add(new THREE.BoxGeometry(0.28, 0.31, 1.35), plate, x, -0.05, 0.2)
      add(new THREE.BoxGeometry(0.23, 0.2, 0.1), accent, x, -0.05, 0.9)
    }
    add(new THREE.BoxGeometry(1.4, 0.1, 0.27), recess, 0, -0.12, 0.38)
    add(new THREE.BoxGeometry(0.11, 0.03, 0.75), accent, 0, 0.25, 0.22)
  } else {
    const ring = new THREE.TorusGeometry(1.2, 0.14, 8, 64)
    ring.rotateX(Math.PI / 2)
    add(ring, plate)
    add(new THREE.CylinderGeometry(0.28, 0.35, 0.7, 16), plate)
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16), recess, 0, 0.17)
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), accent, 0, 0.36)
    const spokes = Array.from({ length: 6 }, (_, i) => {
      const angle = i * Math.PI / 3
      const geometry = new THREE.BoxGeometry(0.9, 0.13, 0.13)
      geometry.rotateY(-angle)
      geometry.translate(0.75 * Math.cos(angle), 0, 0.75 * Math.sin(angle))
      return geometry
    })
    add(mergeGeometries(spokes), recess)
    spokes.forEach(geometry => geometry.dispose())
    const band = new THREE.TorusGeometry(1.2, 0.025, 6, 64)
    band.rotateX(Math.PI / 2)
    add(band, accent, 0, 0.14)
    for (const x of [-1.2, 1.2]) add(new THREE.BoxGeometry(0.3, 0.35, 0.4), plate, x)
  }
  return group
}

export function createSpacecraftModel(kind: SpacecraftKind, accentColor: number, asset?: THREE.Group): THREE.Mesh {
  const root = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: accentColor, depthWrite: false }))
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.95, metalness: 0.15, roughness: 0.36 })
  if (asset) {
    try { root.add(normalize(cloneAsset(asset), 0.9)) }
    catch (error) {
      root.geometry.dispose()
      ;(root.material as THREE.Material).dispose()
      accent.dispose()
      throw error
    }
    // Conform mode paint to the imported surface rather than floating a second
    // reticle above it. Raycasts occur only when constructing an appearance.
    root.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    const vertices: number[] = []
    const surface = (x: number, z: number) => {
      ray.set(new THREE.Vector3(x, 1.1, z), new THREE.Vector3(0, -1, 0))
      const hit = ray.intersectObject(root, true)[0]
      return hit ? [x, hit.point.y + 0.008, z] : null
    }
    const strip = (sample: (step: number, edge: number) => [number, number], steps: number) => {
      for (let i = 0; i < steps; i++) {
        // Short gaps turn painted rails into restrained running lights while
        // keeping the same surface fit and object silhouette.
        if (i % 4 === 3) continue
        const points = [[i, -1], [i, 1], [i + 1, -1], [i + 1, 1]].map(([step, edge]) => {
          const [x, z] = sample(step!, edge!)
          return surface(x, z)
        })
        if (points.some(point => !point)) continue
        for (const index of [0, 2, 1, 1, 2, 3]) vertices.push(...points[index]!)
      }
    }
    if (kind === 'ship') {
      const bounds = new THREE.Box3().setFromObject(root)
      const railOffset = Math.min(0.4, Math.min(-bounds.min.x, bounds.max.x) * 0.8)
      for (const side of [-1, 1]) strip((step, edge) => [side * railOffset + edge * 0.022, 0.12 + step * 0.025], 16)
    } else {
      strip((step, edge) => {
        const angle = step * Math.PI * 2 / 64
        const radius = 0.75 + edge * 0.013
        return [Math.cos(angle) * radius, Math.sin(angle) * radius]
      }, 64)
    }
    const paint = new THREE.BufferGeometry()
    paint.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    paint.computeVertexNormals()
    root.add(new THREE.Mesh(paint, accent))
  } else root.add(normalize(fallback(kind, accent), 0.98))
  return root
}
