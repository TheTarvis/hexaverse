// Orbit rings — the faint hexagonal ring polylines under occupied orbits, with
// the selected body's ring highlighted (the SVG board's ORBIT_RING /
// ORBIT_RING_HILITE layer, ported to the canvas per the layer inventory).
//
// Plumbing only: ring polylines arrive as GL-space point lists and the two
// tints arrive resolved (packRings/packBoardTheme, outside webgl/). The
// selected ring arrives per frame as a PLAIN INDEX — the "which ring is
// selected" decision is computed from selection state outside webgl/ and
// consumed here as a number (task 3.5a).

import * as THREE from 'three'
import { LAYER_Z, RENDER_ORDER } from './layers'
import type { PackedRing } from './contract'

export interface OrbitRings {
  group: THREE.Group
  update(selectedRing: number): void
  dispose(): void
}

export interface RingTheme {
  tint: [number, number, number]
  opacity: number
}

export function createOrbitRings(rings: PackedRing[], base: RingTheme, hilite: RingTheme): OrbitRings {
  const group = new THREE.Group()

  const baseMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(base.tint[0], base.tint[1], base.tint[2]),
    transparent: true,
    opacity: base.opacity,
    depthWrite: false,
    depthTest: true,
  })
  const hiliteMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(hilite.tint[0], hilite.tint[1], hilite.tint[2]),
    transparent: true,
    opacity: hilite.opacity,
    depthWrite: false,
    depthTest: true,
  })

  const loops: { ring: number; line: THREE.LineLoop; geo: THREE.BufferGeometry }[] = []
  for (const r of rings) {
    const positions = new Float32Array((r.points.length / 2) * 3)
    for (let i = 0; i < r.points.length / 2; i++) {
      positions[i * 3] = r.points[i * 2]!
      positions[i * 3 + 1] = r.points[i * 2 + 1]!
      positions[i * 3 + 2] = LAYER_Z.orbitRings
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const line = new THREE.LineLoop(geo, baseMat)
    line.renderOrder = RENDER_ORDER.orbitRings
    line.frustumCulled = false
    group.add(line)
    loops.push({ ring: r.ring, line, geo })
  }

  return {
    group,
    update(selectedRing) {
      for (const l of loops) {
        l.line.material = l.ring === selectedRing ? hiliteMat : baseMat
      }
    },
    dispose() {
      for (const l of loops) l.geo.dispose()
      baseMat.dispose()
      hiliteMat.dispose()
    },
  }
}
