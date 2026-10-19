import * as THREE from 'three'
import { Line2NodeMaterial } from 'three/webgpu'
import { LineSegments2 } from 'three/examples/jsm/lines/webgpu/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

export type HexSkyStyle = 'dark' | 'luminous'
export interface HexSkySettings { distance: number; brightness: number; thickness: number; style: HexSkyStyle }
export const DEFAULT_HEX_SKY: HexSkySettings = { distance: 16, brightness: 0, thickness: 0.5, style: 'dark' }

/** Camera-surrounding lattice: dual icosphere, mostly hexagons with 12 pentagons.
 * No latitude seams/pole pinching, territories, cells or picking semantics. */
function latticeGeometry(detail: number): LineSegmentsGeometry {
  const triangles = new THREE.IcosahedronGeometry(1, detail)
  const positions = triangles.getAttribute('position')
  const vertices = new Map<string, number>()
  const sharedEdges = new Map<string, THREE.Vector3>()
  const lines: number[] = []
  const point = (i: number) => new THREE.Vector3().fromBufferAttribute(positions, i)
  const vertexId = (p: THREE.Vector3) => {
    const key = p.toArray().map(n => Math.round(n * 1e5)).join(',')
    if (!vertices.has(key)) vertices.set(key, vertices.size)
    return vertices.get(key)!
  }
  for (let i = 0; i < positions.count; i += 3) {
    const face = [point(i), point(i + 1), point(i + 2)]
    const center = face[0].clone().add(face[1]).add(face[2]).normalize()
    const ids = face.map(vertexId)
    for (let e = 0; e < 3; e++) {
      const a = ids[e], b = ids[(e + 1) % 3]
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const neighbor = sharedEdges.get(key)
      if (neighbor) lines.push(...neighbor.toArray(), ...center.toArray())
      else sharedEdges.set(key, center)
    }
  }
  triangles.dispose()
  return new LineSegmentsGeometry().setPositions(lines)
}

export function updateHexSky(grid: LineSegments2, extent: number, settings: Partial<HexSkySettings> = {}) {
  const distance = THREE.MathUtils.clamp(settings.distance ?? DEFAULT_HEX_SKY.distance, 6, 36)
  // Fixed-size cells would subtend smaller angles farther away. Model that
  // explicitly; scaling a camera-centered sphere alone has no visual effect.
  const detail = Math.round(distance * 0.8)
  if (grid.userData.detail !== detail) {
    grid.geometry.dispose()
    grid.geometry = latticeGeometry(detail)
    grid.userData.detail = detail
  }
  grid.scale.setScalar(extent * distance)
  const brightness = THREE.MathUtils.clamp(settings.brightness ?? DEFAULT_HEX_SKY.brightness, 0, 0.3)
  grid.material.color.setHex(0x527c8a)
  if ((settings.style ?? DEFAULT_HEX_SKY.style) === 'dark') {
    // Zero brightness deliberately means black seams, not invisible lines.
    grid.material.color.multiplyScalar(brightness / 0.3)
    grid.material.opacity = 1
  } else {
    grid.material.opacity = brightness
  }
  grid.material.linewidth = THREE.MathUtils.clamp(settings.thickness ?? DEFAULT_HEX_SKY.thickness, 0.5, 4)
}

export function createHexSky(extent: number, settings: Partial<HexSkySettings> = {}): LineSegments2 {
  const grid = new LineSegments2(new LineSegmentsGeometry(), new Line2NodeMaterial({
    // Alpha-to-coverage quantizes very faint grids away on some MSAA backends.
    color: 0x527c8a, transparent: true, depthWrite: false, worldUnits: false, alphaToCoverage: false,
  }))
  grid.name = 'surrounding-hex-lattice'
  grid.renderOrder = -900
  grid.raycast = () => {}
  updateHexSky(grid, extent, settings)
  return grid
}
