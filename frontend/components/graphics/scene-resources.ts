import * as THREE from 'three'

/** The production preview/thumbnail lighting; keep model reviews on this same rig. */
export function addPreviewLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xc7ddff, 2))
  const key = new THREE.DirectionalLight(0xffe2b3, 3)
  key.position.set(-3, 5, -2)
  const fill = new THREE.DirectionalLight(0x79b9ff, 1.5)
  fill.position.set(3, 1, 2)
  scene.add(key, fill)
}

/** Release instance-owned GPU resources once; decoded images may be shared by clones. */
export function disposeObjectResources(root: THREE.Object3D, closeImages = false) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) geometries.add(object.geometry)
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  if (root instanceof THREE.Scene) {
    for (const value of [root.background, root.environment]) if (value instanceof THREE.Texture) textures.add(value)
  }
  const images = new Set<ImageBitmap>()
  textures.forEach(texture => {
    if (closeImages && typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image)
    texture.dispose()
  })
  materials.forEach(material => material.dispose())
  geometries.forEach(geometry => geometry.dispose())
  images.forEach(image => image.close())
}
