import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { TransitLayer } from './transit-layer'
import type { NodePositions } from './transit-geometry'
import type { Fleet } from '@/lib/types/fleet'

// The glow sprite bakes its texture on a 2D canvas, which jsdom doesn't have —
// and the texture is not what's under test here. Placement is.
vi.mock('./glow-texture', () => ({ glowTexture: () => new THREE.Texture() }))

// Scene-graph only: no renderer, no WebGL — the layer is pure object placement,
// so jsdom can hold it.
const nodes: NodePositions = new Map([
  ['a', { x: 0, y: 0, z: 0 }],
  ['b', { x: 100, y: 0, z: 0 }],
])

function travelling(id: string, arriveTime = 1000): Fleet {
  return {
    id,
    corporationId: 'corp',
    systemId: 'a',
    state: {
      mode: 'laneTransit',
      laneTransit: {
        route: ['a', 'b'],
        legEtas: [0, arriveTime],
        departTime: 0,
        arriveTime,
        entryGate: { ring: 0, slot: 0 },
      },
    },
    position: { ring: 0, slot: 0 },
    own: true,
    worldTime: 0,
  }
}

// The marker sprite of a given fleet, found by walking the layer's group.
function markers(scene: THREE.Scene): THREE.Sprite[] {
  const found: THREE.Sprite[] = []
  scene.traverse((o) => {
    if ((o as THREE.Sprite).isSprite) found.push(o as THREE.Sprite)
  })
  return found
}

describe('TransitLayer', () => {
  // Spec: 0008/S7
  it('slides a marker along its lane as world time advances', () => {
    const scene = new THREE.Scene()
    const layer = new TransitLayer(scene, nodes)
    layer.setFleets([travelling('f1')])

    layer.update(0)
    expect(markers(scene)[0].position.x).toBeCloseTo(0, 5)

    layer.update(500)
    expect(markers(scene)[0].position.x).toBeCloseTo(50, 5)

    layer.update(1000)
    expect(markers(scene)[0].position.x).toBeCloseTo(100, 5)

    layer.dispose()
    expect(markers(scene)).toHaveLength(0)
  })

  it('adds a trail per new trip and drops it when the fleet arrives', () => {
    const scene = new THREE.Scene()
    const layer = new TransitLayer(scene, nodes)

    layer.setFleets([travelling('f1'), travelling('f2', 2000)])
    expect(markers(scene)).toHaveLength(2)

    // f2 arrives and is no longer travelling — its trail goes with it.
    layer.setFleets([travelling('f1')])
    expect(markers(scene)).toHaveLength(1)

    // Nothing in transit at all → an empty scene, not a stuck marker.
    layer.setFleets([])
    expect(markers(scene)).toHaveLength(0)
    layer.dispose()
  })

  it('is pickable: a ray through a marker names its fleet', () => {
    const scene = new THREE.Scene()
    const layer = new TransitLayer(scene, nodes)
    layer.setFleets([travelling('f1')])
    layer.update(500) // halfway down a→b: the marker sits at x=50

    // Cast the way the view does: a camera looking at the lane, and a screen point
    // turned into a ray (a sprite is only pickable relative to a camera).
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000)
    camera.position.set(50, 0, 200)
    camera.lookAt(50, 0, 0)
    camera.updateMatrixWorld(true)
    scene.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster()
    // Screen centre — where the marker projects to under this framing.
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    expect(layer.pick(raycaster)).toBe('f1')

    // A corner of the screen is empty space: clicking the void must not select.
    raycaster.setFromCamera(new THREE.Vector2(-0.95, 0.95), camera)
    expect(layer.pick(raycaster)).toBeNull()
    layer.dispose()
  })

  it('reuses the objects of an unchanged trip across updates', () => {
    const scene = new THREE.Scene()
    const layer = new TransitLayer(scene, nodes)
    layer.setFleets([travelling('f1')])
    const first = markers(scene)[0]

    // The same trip re-read from the server (a poll) must not churn the scene.
    layer.setFleets([travelling('f1')])
    expect(markers(scene)[0]).toBe(first)

    // A redirect (new route + ETA) earns a fresh trail.
    const redirected = travelling('f1', 5000)
    layer.setFleets([redirected])
    expect(markers(scene)[0]).not.toBe(first)
    layer.dispose()
  })
})
