import * as THREE from 'three'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'
import { createHexGrid } from '@/components/space/webgl/scene-art'
import { createStarModel } from '@/components/space/webgl/star-art'
import { createSpaceSky, type SpaceGridMode } from '@/components/graphics/space-sky'
import { disposeObjectResources } from '@/components/graphics/scene-resources'

export function createStellarEnvironment(galaxy: Galaxy, gridMode: SpaceGridMode = 'ground'): THREE.Group {
  const group = new THREE.Group()
  group.name = 'stellar-map-environment'
  const { bounds } = galaxy
  const span = Math.max(bounds.x[1] - bounds.x[0], bounds.y[1] - bounds.y[0], 100)
  const cx = (bounds.x[0] + bounds.x[1]) / 2, cy = (bounds.y[0] + bounds.y[1]) / 2
  group.add(createSpaceSky(span, { up: 'z', hexLattice: gridMode === 'surround' }))
  if (gridMode === 'ground') {
    const grid = createHexGrid(span * 1.3)
    grid.rotation.x = Math.PI / 2
    grid.position.set(cx, cy, bounds.z[0] - span * 0.08)
    grid.renderOrder = -3
    ;(grid.material as THREE.LineBasicMaterial).opacity = 0.08
    group.add(grid)
  }
  return group
}

export function createStellarNode(node: GalaxyNode, selected: boolean): THREE.Group {
  const group = new THREE.Group()
  group.name = `stellar-${node.id}`
  // At map scale, reuse a phase per spectral class to avoid a unique GPU
  // shader program for every system. Local-system stars retain per-ID detail.
  const star = createStarModel({ objectId: `galaxy-${node.skeleton.starClass}`, starClass: node.skeleton.starClass, geometry: new THREE.SphereGeometry(1, 20, 14) })
  star.mesh.scale.setScalar(selected ? 6.2 : 5.2)
  group.add(star.mesh)
  if (selected) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(8, 8.5, 48), new THREE.MeshBasicMaterial({ color: 0xc9e1ec, side: THREE.DoubleSide, depthWrite: false }))
    group.add(ring)
  }
  return group
}

export function disposeStellarArt(group: THREE.Object3D) {
  disposeObjectResources(group)
  group.clear()
}
