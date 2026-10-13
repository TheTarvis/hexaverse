import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import * as THREE from 'three'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'
import { rendererHarness, installPresentationEnvironment, frames } from './renderer-test-harness'
const seam = vi.hoisted(() => ({ factory: vi.fn() }))
vi.mock('@/components/render-guard/renderer-candidate', () => ({ createRendererCandidate: seam.factory }))
vi.mock('react-force-graph-3d', () => ({ default: () => null }))
import { GalaxyGraph } from './GalaxyGraph'

const nodeA: GalaxyNode = { id: 'a', name: 'Axion', region: 'star_rich', tier: 'explored', skeleton: { starClass: 'G', bodies: [] }, x: -40, y: 0, z: 0, fx: -40, fy: 0, fz: 0 }
const nodeB: GalaxyNode = { ...nodeA, id: 'b', name: 'Borealis', tier: 'starVisible', x: 40, fx: 40 }
const galaxy: Galaxy = { id: 'g', seed: 1, bounds: { x: [-60, 60], y: [-60, 60], z: [-10, 10] }, worldTime: 0, nodes: [nodeA, nodeB], links: [{ id: 'l', source: 'a', target: 'b', bridge: true }] }

function laneAppearance(scene: THREE.Scene) {
  const lanes: { opacity: number; width: number; color: number }[] = []
  scene.traverse(object => {
    if (!(object instanceof THREE.Line || object instanceof THREE.Mesh)) return
    if (object instanceof THREE.GridHelper || Array.isArray(object.material)) return
    const material = object.material as THREE.LineBasicMaterial
    if (!material.transparent || material.opacity >= 0.6 || material.opacity <= 0) return
    object.geometry.computeBoundingBox()
    const dimensions = object.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(object.scale).toArray().sort((a: number, b: number) => a - b)
    const width = object instanceof THREE.Line ? material.linewidth : dimensions[0]
    lanes.push({ opacity: material.opacity, width, color: material.color.getHex() })
  })
  return lanes
}

describe('GalaxyGraph lane scene materials', () => {
  let gpu: ReturnType<typeof rendererHarness>
  beforeEach(() => { installPresentationEnvironment(); gpu = rendererHarness(); seam.factory.mockImplementation(gpu.factory) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('Scenario: Galaxy graph preserves visual and input behavior — bridge lane remains fainter and thinner', async () => {
    const view = render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={vi.fn()} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    const bridge = laneAppearance(gpu.candidates[0].render.mock.calls.at(-1)![0])
    view.rerender(<GalaxyGraph galaxy={{ ...galaxy, links: [{ ...galaxy.links[0], bridge: false }] }} selectedId={null} onSelect={vi.fn()} />)
    await frames()
    const ordinary = laneAppearance(gpu.candidates[0].render.mock.calls.at(-1)![0])
    expect(bridge).toHaveLength(1)
    expect(ordinary).toHaveLength(1)
    expect(bridge[0].opacity).toBeLessThan(ordinary[0].opacity)
    expect(bridge[0].width).toBeLessThan(ordinary[0].width)
    expect(ordinary[0].opacity).toBeCloseTo(0.42)
  })

  it('preserves full-strength barrier seam lanes even at star-visible tier', async () => {
    render(<GalaxyGraph galaxy={{ ...galaxy, nodes: [nodeA, { ...nodeB, region: 'barrier' }], links: [{ ...galaxy.links[0], bridge: false }] }} selectedId={null} onSelect={vi.fn()} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    const lanes = laneAppearance(gpu.candidates[0].render.mock.calls.at(-1)![0])
    expect(lanes).toHaveLength(1)
    expect(lanes[0].opacity).toBeCloseTo(0.5)
    expect(lanes[0].color).toBe(new THREE.Color('rgb(244,114,182)').getHex())
  })
})
