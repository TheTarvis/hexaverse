import * as THREE from 'three'
import { createBackdropMaterial } from '@/components/space/webgl/scene-art'
import { createHexSky, updateHexSky, type HexSkySettings } from './hex-sky'
import type { LineSegments2 } from 'three/examples/jsm/lines/webgpu/LineSegments2.js'
export { DEFAULT_HEX_SKY, type HexSkySettings, type HexSkyStyle } from './hex-sky'

export type SpaceGridMode = 'ground' | 'surround' | 'none'

/** One sky for Galaxy and System. Caller centers it on its camera each frame.
 * Camera rotation reveals the shell; panning/dollying never reaches its edge. */
export function createSpaceSky(extent: number, options: { up?: 'y' | 'z'; hexLattice?: boolean } = {}): THREE.Group {
  const sky = new THREE.Group()
  sky.name = 'space-sky'
  if (options.up === 'z') sky.rotation.x = Math.PI / 2
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), createBackdropMaterial())
  backdrop.name = 'surrounding-sky-backdrop'
  backdrop.scale.setScalar(extent * 40)
  backdrop.renderOrder = -1000
  sky.add(backdrop)

  let seed = 0x5eed
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223; return (seed >>> 0) / 4294967296 }
  const positions = new Float32Array(1400 * 3)
  for (let i = 0; i < 1400; i++) {
    const u = random() * 2 - 1, phi = random() * Math.PI * 2
    const r = extent * (24 + random() * 12), s = Math.sqrt(1 - u * u)
    positions.set([r * s * Math.cos(phi), r * u, r * s * Math.sin(phi)], i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x9aa3c0, size: 1.1, sizeAttenuation: false, transparent: true,
    opacity: 0.5, depthWrite: false,
  }))
  stars.name = 'surrounding-distant-stars'
  stars.raycast = () => {}
  sky.add(stars)
  if (options.hexLattice) sky.add(createHexSky(extent))
  return sky
}

export function updateSpaceSky(sky: THREE.Group, camera: THREE.Camera, extent: number, settings: Partial<HexSkySettings> = {}) {
  sky.position.copy(camera.position)
  const lattice = sky.getObjectByName('surrounding-hex-lattice') as LineSegments2 | undefined
  if (lattice) updateHexSky(lattice, extent, settings)
}
