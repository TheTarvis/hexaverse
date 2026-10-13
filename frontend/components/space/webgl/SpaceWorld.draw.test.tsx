import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import React from 'react'
import type { SceneModel } from '../space-scene'
import { defaultCamera, type SpaceCamera } from '../space-camera'
import { viewBasisOf, projectMarks } from '../space-projection'
import type { SpaceFrame } from '../space-transform-loop'

// fix-world-time-render-loop, task 4.7 migration: `SpaceWorld` loses its
// `scene`/`camera` props for a single `frameRef` (impl contract §8) — every
// construction site below builds one via `frameOf`, matching what the
// transform loop would publish.
function frameOf(scene: SceneModel, camera: SpaceCamera, width = 1200, height = 900): { current: SpaceFrame } {
  const basis = viewBasisOf(camera, { width, height })
  return {
    current: {
      scene,
      camera,
      basis,
      projected: new Map(projectMarks(scene, basis).map((p) => [p.mark.id, p])),
    },
  }
}

// SDET-AUTHORED, 2026-09-03, as the audit half of Job 5 (openspec change
// `build-production-space-view`).
//
// WHY THIS FILE EXISTS. The implementer-authored `SpaceWorld.test.tsx` is a
// good suite for what it covers — the FAIL-SOFT path — but under jsdom the
// module's context probe returns null on the first line of its effect and
// everything after it is dead code. All three of its cases are therefore
// satisfied by a `SpaceWorld` whose entire body is
// `canvas.getContext('webgl2'); return null`. The component's actual purpose
// — putting one mark per `SceneModel` mark at the served position, at the
// served size, seen from the SAME eye `space-projection` picks with — had no
// test that could fail. That is a tautology, and closing it is the audit's
// whole job.
//
// HOW IT IS TESTED WITHOUT A GPU. `three` is replaced by a recording double.
// This is mocking an EXTERNAL LIBRARY, not the unit: every assertion below
// is about SpaceWorld's own logic (which meshes it creates, where it puts
// them, how it scales them, which it removes, where it places the camera,
// when it announces a first frame, what it releases on unmount). The double
// records; it decides nothing.
//
// WHAT THIS CANNOT CATCH, stated plainly rather than left implied: a wrong
// argument to a three constructor that the double accepts. That risk is
// carried by `renderer-availability.spec.ts` and the e2e journey, which run
// a real context. The risk this file removes is larger and was total.

const recorder = vi.hoisted(() => ({
  renderers: [] as unknown[],
  renderCalls: [] as {
    meshCount: number
    lineCount: number
    // One entry per mesh in the scene graph as handed to the renderer:
    // where SpaceWorld put it and how big it drew it.
    meshes: { position: { x: number; y: number; z: number }; scale: number }[]
  }[],
  disposedRenderers: 0,
  disposedGeometries: 0,
  cameras: [] as {
    fov: number
    near: number
    far: number
    position: { x: number; y: number; z: number }
    up: { x: number; y: number; z: number }
    lookAt: { x: number; y: number; z: number } | null
  }[],
  reset() {
    this.renderers = []
    this.renderCalls = []
    this.disposedRenderers = 0
    this.disposedGeometries = 0
    this.cameras = []
  },
}))

// Real Three objects keep this regression suite compatible with rendering APIs.
// Only the GPU renderer and camera observation are substituted; assertions below
// remain unchanged. Geometry disposal is observed on the actual scene resources.
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>()
  class PerspectiveCamera extends actual.PerspectiveCamera {
    record: (typeof recorder.cameras)[number]
    constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
      super(fov, aspect, near, far)
      this.record = { fov, near, far, position: this.position, up: this.up, lookAt: null }
      recorder.cameras.push(this.record)
    }
    override lookAt(x: number | import('three').Vector3, y?: number, z?: number) {
      if (typeof x === 'number') {
        this.record.lookAt = { x, y: y!, z: z! }
        super.lookAt(x, y!, z!)
      } else {
        this.record.lookAt = { x: x.x, y: x.y, z: x.z }
        super.lookAt(x)
      }
    }
  }
  return { ...actual, PerspectiveCamera }
})

vi.mock('@/components/render-guard/renderer-candidate', async () => {
  const THREE = await import('three')
  class RecordingCandidate {
    observed = new Set<import('three').BufferGeometry>()
    constructor(readonly canvas: HTMLCanvasElement) { recorder.renderers.push(this) }
    init = async () => {}
    backend = () => 'webgpu' as const
    resize() {}
    onLoss = () => () => {}
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    render(scene: import('three').Scene) {
      scene.traverse((object) => {
        const geometry = (object as import('three').Mesh).geometry
        if (geometry && !this.observed.has(geometry)) {
          this.observed.add(geometry)
          geometry.addEventListener('dispose', async () => { recorder.disposedGeometries += 1 })
        }
      })
      const meshes = scene.children.filter((o): o is import('three').Mesh => o instanceof THREE.Mesh)
      recorder.renderCalls.push({
        meshCount: meshes.length,
        lineCount: scene.children.filter((o) => o instanceof THREE.Line).length,
        meshes: meshes.map((m) => ({ position: { x: m.position.x, y: m.position.y, z: m.position.z }, scale: m.scale.x })),
      })
    }
    dispose() { recorder.disposedRenderers += 1 }
  }
  return { createRendererCandidate: ({ canvas }: { canvas: HTMLCanvasElement }) => new RecordingCandidate(canvas) }
})
const settle = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }) }

import { SpaceWorld, BODY_DRAW_SCALE } from './SpaceWorld'

const EXTENT = 658.7081316032265

// A canvas whose context probe answers the calls SpaceWorld makes before it
// will build anything — the gate every assertion in this file sits behind.
function usableCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => 1200 })
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => 900 })
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    createProgram: () => ({}),
  } as unknown as RenderingContext)
  return canvas
}

function sceneOf(over: Partial<SceneModel> = {}): SceneModel {
  return {
    marks: [
      { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5.2, pickable: false, selected: false },
      { id: 'feat-body-0', kind: 'body', position: { x: 18, y: -3, z: -15 }, radius: 1.76, pickable: true, selected: false },
      { id: 'gate-sys_-6_16', kind: 'gate', position: { x: 694, y: 0, z: -207 }, radius: 1.2, pickable: true, selected: false },
    ],
    curves: [],
    beltFields: [],
    orbitRings: [],
    positionTimeMs: 7,
    decorativeTimeMs: 7,
    omissions: [],
    ...over,
  }
}

// rAF is stubbed to a no-op so the draw loop runs EXACTLY once per mount:
// every count below is then a fact about one frame, not a race with the
// scheduler. (jsdom's own rAF would keep firing and make `renderCalls`
// nondeterministic.)
beforeEach(() => {
  recorder.reset()
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as unknown as number)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

describe('SpaceWorld — what it actually draws', async () => {
  it('SDET-added: draws one mesh per scene mark, at the served position', async () => {
    const scene = sceneOf()
    render(<SpaceWorld canvas={usableCanvas()} frameRef={frameOf(scene, defaultCamera(EXTENT))} extent={EXTENT} />)
    await settle()

    expect(recorder.renderers, 'a usable context must produce a renderer').toHaveLength(1)
    expect(recorder.renderCalls, 'one frame must have been drawn').toHaveLength(1)
    expect(recorder.renderCalls[0]!.meshCount).toBe(scene.marks.length)
  })

  it('SDET-added: a mark never renders smaller than the floor its extent sets', async () => {
    // A body of radius 1.2 in a system 658 units across is a sub-pixel dot;
    // the floor is what keeps a distant gate clickable. Both the served
    // radius and the floor are exercised — a scale that ignored either one
    // fails.
    const floor = EXTENT / 400
    const scene = sceneOf({
      marks: [
        { id: 'big', kind: 'body', position: { x: 0, y: 0, z: 0 }, radius: floor * 10, pickable: true, selected: false },
        { id: 'tiny', kind: 'gate', position: { x: 1, y: 0, z: 0 }, radius: floor / 100, pickable: true, selected: false },
      ],
    })
    const { container } = render(
      <SpaceWorld canvas={usableCanvas()} frameRef={frameOf(scene, defaultCamera(EXTENT))} extent={EXTENT} />,
    )
    await settle()
    expect(container.innerHTML, 'the world renders no DOM of its own').toBe('')

    expect(meshAt({ x: 0, y: 0, z: 0 }).scale).toBeCloseTo(floor * 10 * BODY_DRAW_SCALE, 9)
    expect(
      meshAt({ x: 1, y: 0, z: 0 }).scale,
      'a sub-floor mark must clamp UP, not vanish',
    ).toBeCloseTo(floor, 9)
  })

  it('SDET-added: selection preserves the model size', async () => {
    const at = { x: 18, y: -3, z: -15 } // feat-body-0's served position
    const base = sceneOf()
    const first = render(
      <SpaceWorld canvas={usableCanvas()} frameRef={frameOf(base, defaultCamera(EXTENT))} extent={EXTENT} />,
    )
    await settle()
    const unselected = meshAt(at).scale
    first.unmount()

    recorder.reset()
    const selected = sceneOf({
      marks: base.marks.map((m) => (m.id === 'feat-body-0' ? { ...m, selected: true } : m)),
    })
    render(<SpaceWorld canvas={usableCanvas()} frameRef={frameOf(selected, defaultCamera(EXTENT))} extent={EXTENT} />)
    await settle()
    expect(meshAt(at).scale, 'selection uses the reticle without enlarging the model').toBe(unselected)
  })

  it('SDET-added: draws one line per served curve, and none for a degenerate one', async () => {
    const withCurve = sceneOf({
      curves: [
        {
          fleetId: 'fleet_1',
          controlPoints: [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 0, z: 0 },
            { x: 10, y: 0, z: 5 },
          ],
          param: 0.5,
        },
        // A single control point is not a path; drawing it would put a
        // zero-length streak on the canvas.
        { fleetId: 'fleet_degenerate', controlPoints: [{ x: 1, y: 1, z: 1 }], param: 0 },
      ],
    })
    render(<SpaceWorld canvas={usableCanvas()} frameRef={frameOf(withCurve, defaultCamera(EXTENT))} extent={EXTENT} />)
    await settle()
    expect(recorder.renderCalls[0]!.lineCount).toBe(1)
  })

  it('SDET-added: places the eye where space-projection puts it, so a mark and its hit target agree', async () => {
    // THE assertion this whole file exists for. The drawn scene and the DOM
    // hit layer are two independent projections of the same world; they
    // agree only while the renderer's camera is the picking basis's camera.
    // A renderer that quietly used its own eye would put every mark a few
    // pixels off its click target — invisible in a screenshot, maddening in
    // play.
    const camera = defaultCamera(EXTENT)
    render(<SpaceWorld canvas={usableCanvas()} frameRef={frameOf(sceneOf(), camera)} extent={EXTENT} />)
    await settle()

    const basis = viewBasisOf(camera, { width: 1200, height: 900 })
    const drawn = recorder.cameras.at(-1)!
    expect(drawn.position.x).toBeCloseTo(basis.eye.x, 6)
    expect(drawn.position.y).toBeCloseTo(basis.eye.y, 6)
    expect(drawn.position.z).toBeCloseTo(basis.eye.z, 6)
    expect(drawn.up.x).toBeCloseTo(basis.up.x, 6)
    expect(drawn.up.y).toBeCloseTo(basis.up.y, 6)
    expect(drawn.up.z).toBeCloseTo(basis.up.z, 6)
    expect(drawn.lookAt).toEqual({ x: camera.target.x, y: camera.target.y, z: camera.target.z })
    // ...and the same vertical field of view, in the unit three expects.
    expect(drawn.fov).toBeCloseTo((Math.atan(basis.tanHalfFov) * 360) / Math.PI, 9)
    expect(drawn.near).toBeGreaterThan(0)
    expect(drawn.far).toBeGreaterThan(drawn.near)
  })

  it('SDET-added: announces its first frame exactly once', async () => {
    const onFirstFrame = vi.fn()
    render(
      <SpaceWorld
        canvas={usableCanvas()}
        frameRef={frameOf(sceneOf(), defaultCamera(EXTENT))}
        extent={EXTENT}
        onFirstFrame={onFirstFrame}
      />,
    )
    await settle()
    expect(onFirstFrame).toHaveBeenCalledTimes(1)
  })

  it('SDET-added: releases the renderer and its geometry on unmount', async () => {
    // A view the player navigates away from and back to must not leak a
    // context per visit — browsers hand out a small, fixed number.
    const { unmount } = render(
      <SpaceWorld canvas={usableCanvas()} frameRef={frameOf(sceneOf(), defaultCamera(EXTENT))} extent={EXTENT} />,
    )
    await settle()
    expect(recorder.disposedRenderers).toBe(0)
    unmount()
    expect(recorder.disposedRenderers).toBe(1)
    expect(recorder.disposedGeometries, 'the shared sphere geometry must be released too').toBeGreaterThan(0)
  })
})

// meshAt recovers the mesh SpaceWorld drew for a given served position on
// the last frame. Position is the identity here because that is exactly what
// the component is being asked to get right — a mesh at the wrong place is
// no match, which is the point.
function meshAt(position: { x: number; y: number; z: number }) {
  const frame = recorder.renderCalls.at(-1)
  expect(frame, 'no frame was drawn').toBeDefined()
  const hit = frame!.meshes.find(
    (m) =>
      Math.abs(m.position.x - position.x) < 1e-9 &&
      Math.abs(m.position.y - position.y) < 1e-9 &&
      Math.abs(m.position.z - position.z) < 1e-9,
  )
  expect(
    hit,
    `no mesh was drawn at the served position ${JSON.stringify(position)}; drawn: ${JSON.stringify(
      frame!.meshes.map((m) => m.position),
    )}`,
  ).toBeDefined()
  return hit!
}
