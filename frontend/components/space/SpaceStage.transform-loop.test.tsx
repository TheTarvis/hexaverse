import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import { buildSceneModel, type SceneModel } from './space-scene'
import { viewBasisOf, projectMarks, hitTargetTransform } from './space-projection'
import { unprojectToViewPlane, drawOrbitPosition } from '@/lib/space/draw'
import type { Burn } from '@/lib/types/fleet'

// Resolve the real dynamically imported world before fake-clock interaction.
vi.mock('next/dynamic', async () => { const { SpaceWorld } = await import('./webgl/SpaceWorld'); return { default: () => SpaceWorld } })

// RED-PHASE SUITE — tasks 2.4, 4.3a, 4.3b, 4.6, 4.8, 4.9 (design.md Decision
// 3, decided option B; Decision 7). SpaceStage is REAL here — the transform
// loop's wiring into the actual stage, positioning DOM hit targets and
// publishing the point-pick basis, entirely under jsdom (no GL fake needed).

// --- capture every registry the stage creates (task 4.3a), passthrough on
// everything else in the module -------------------------------------------
const registries = vi.hoisted(() => [] as { size: number }[])
vi.mock('./space-transform-loop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./space-transform-loop')>()
  return {
    ...actual,
    createHitTargetRegistry: vi.fn(
      (...args: Parameters<typeof actual.createHitTargetRegistry>) => {
        const r = actual.createHitTargetRegistry(...args)
        registries.push(r)
        return r
      },
    ),
  }
})

import { SpaceStage } from './SpaceStage'
import type { SpaceFrameSource, SceneFrameInputs } from './space-transform-loop'

const T0 = 1_000_000
const EXTENT = 658.7081316032265

let W = 1200
let H = 900

beforeEach(() => {
  registries.length = 0
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
  W = 1200
  H = 900
})

afterEach(() => {
  vi.useRealTimers()
})

async function ready() {
  if (vi.isFakeTimers()) {
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); vi.advanceTimersToNextFrame(); for (let i = 0; i < 20; i++) await Promise.resolve() })
    expect(screen.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true')
  } else await waitFor(() => expect(screen.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true'))
}

function handRolledClock(getNow: () => number) {
  return { now: getNow, anchor: vi.fn(), hasReading: () => true, reading: () => null }
}

function emptySceneModel(worldTimeMs = T0): SceneModel {
  return buildSceneModel({
    interior: null,
    fleets: [],
    worldTimeMs,
    reducedMotion: false,
    selection: null,
    log: vi.fn(),
  })
}

function movingBodyInputs(): SceneFrameInputs {
  return {
    interior: {
      systemId: 'sys_1',
      extent: EXTENT,
      character: 'normal',
      starClass: 'M',
      worldTime: T0,
      scale: 1,
      features: [
        { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5 },
        {
          id: 'feat-body-0',
          type: 'rocky',
          space: { X: 0, Y: 0, Z: 0 },
          size: 1.7,
          orbitElements: { parentId: 'feat-star', radius: 24, periodMs: 18_591, phase: 373_097, inclination: 0, node: 0 },
        },
      ],
      laneGates: [],
      contacts: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    fleets: [],
    reducedMotion: false,
    selection: null,
    log: vi.fn(),
  }
}

const BURN: Burn = {
  Origin: { X: 0, Y: 0, Z: 0 },
  Target: { BodyId: 'feat-body-0', Point: null },
  Intercept: { X: 20, Y: -3, Z: -15 },
  Curve: [
    { X: 0, Y: 0, Z: 0 },
    { X: 5, Y: 0, Z: 0 },
    { X: 10, Y: 0, Z: 2 },
    { X: 15, Y: -1, Z: 4 },
    { X: 18, Y: -2, Z: -8 },
    { X: 20, Y: -3, Z: -15 },
  ] as unknown as Burn['Curve'],
  Length: 30,
  DepartMs: T0 - 1_000,
  ArriveMs: T0 + 120_000,
  Accel: 1,
  InsertionPhase: 0,
}

function burningFleetInputs(): SceneFrameInputs {
  return {
    // D1 (green-phase test dispute, fix-world-time-render-loop-rulings.md):
    // a real interior, as `movingBodyInputs()` has — `space-scene.ts:285`'s
    // `if (!interior) return empty` means a null interior can never emit
    // ANY mark, `fleet-mark-fleet-1` included, regardless of `fleets`. The
    // original `interior: null` was a test defect, not a behaviour question.
    interior: movingBodyInputs().interior,
    fleets: [
      {
        id: 'fleet-1',
        position: { X: 0, Y: 0, Z: 0 },
        state: { Mode: 0, Burn: BURN, Park: null, Drift: null },
      },
    ],
    reducedMotion: false,
    selection: null,
    log: vi.fn(),
  }
}

function frameSourceOf(inputs: SceneFrameInputs, now: () => number): SpaceFrameSource {
  return { clock: handRolledClock(now), inputsRef: { current: inputs } }
}

describe('SpaceStage + the transform loop — task 2.4', () => {
  // Scenario: Focus survives the view's animation frames (restated
  // rAF-driven, task 2.4 — the old rerender-worldTime loop is removed;
  // `SpaceStage.interaction.test.tsx` no longer carries this scenario).
  it("Scenario: Focus survives the view's animation frames", async () => {
    vi.useFakeTimers()
    let simTime = T0
    const inputs = movingBodyInputs()
    const coarseScene = buildSceneModel({ ...inputs, worldTimeMs: T0 })
    render(
      <SpaceStage
        systemId="sys_1"
        scene={coarseScene}
        extent={EXTENT}
        worldTime={T0}
        scale={1}
        selection={null}
        frameSource={frameSourceOf(inputs, () => simTime)}
      />,
    )
    await ready()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    act(() => hit.focus())
    expect(document.activeElement).toBe(hit)
    const before = hit.style.transform
    for (let i = 1; i <= 10; i++) {
      simTime = T0 + i * 16
      act(() => vi.advanceTimersToNextFrame())
    }
    // Vacuity guard: the SAME element must have actually moved across this
    // window, or "focus survives" is true merely because nothing happened.
    expect(hit.style.transform, 'the mark must actually move across these frames').not.toBe(before)
    expect(
      document.activeElement,
      'the per-frame position write must not unfocus the element the player is on',
    ).toBe(hit)
  })
})

describe('SpaceStage + the transform loop — task 4.3a: capturing the registry', () => {
  it('keeps annotation placement separate from the pickable and own-fleet hit targets', async () => {
    const inputs = movingBodyInputs()
    const coarseScene = buildSceneModel({ ...inputs, worldTimeMs: T0 })
    render(
      <SpaceStage
        systemId="sys_1"
        scene={coarseScene}
        extent={EXTENT}
        worldTime={T0}
        scale={1}
        selection={null}
        frameSource={null}
      />,
    )
    await ready()
    expect(registries).toHaveLength(2)
    const registrable = coarseScene.marks.filter((m) => m.pickable || m.kind === 'fleet').length
    expect(registries[0]!.size).toBe(registrable)
    expect(registries[1]!.size).toBe(coarseScene.marks.filter(mark => ['star', 'body', 'belt', 'gate', 'fleet'].includes(mark.kind)).length)
  })
})

describe('SpaceStage + the transform loop — task 4.3b', () => {
  // Scenario: A hit target tracks its mark on every frame
  it('Scenario: A hit target tracks its mark on every frame', async () => {
    vi.useFakeTimers()
    let simTime = T0
    const inputs = burningFleetInputs()
    const coarseScene = buildSceneModel({ ...inputs, worldTimeMs: T0 })
    render(
      <SpaceStage
        systemId="sys_1"
        scene={coarseScene}
        extent={EXTENT}
        worldTime={T0}
        scale={1}
        selection={null}
        frameSource={frameSourceOf(inputs, () => simTime)}
      />,
    )
    await ready()
    const camera = JSON.parse(screen.getByTestId('space-canvas-region').getAttribute('data-camera')!)
    const basis = viewBasisOf(camera, { width: W, height: H })

    const annotation = screen.getByTestId('space-annotation-fleet-1')
    const beforeAnnotation = annotation.style.transform
    for (const t of [T0 + 16, T0 + 32, T0 + 48]) {
      simTime = t
      act(() => vi.advanceTimersToNextFrame())
      const liveScene = buildSceneModel({ ...inputs, worldTimeMs: t })
      const projected = projectMarks(liveScene, basis)
      const expected = hitTargetTransform(
        projected.find((p: { mark: { id: string } }) => p.mark.id === 'fleet-1')?.screen,
      )
      expect(screen.getByTestId('fleet-mark-fleet-1').style.transform).toBe(expected)
    }
    expect(annotation).toBeVisible()
    expect(annotation.style.transform).not.toBe(beforeAnnotation)
  })
})

describe('SpaceStage + the transform loop — task 4.6', () => {
  function sceneWithBodyAt(x: number, worldTimeMs: number): SceneModel {
    return buildSceneModel({
      interior: {
        systemId: 'sys_1',
        extent: EXTENT,
        character: 'normal',
        starClass: 'M',
        worldTime: worldTimeMs,
        scale: 1,
        features: [
          { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5 },
          { id: 'feat-body-0', type: 'rocky', space: { X: x, Y: 0, Z: 0 }, size: 1 },
        ],
        laneGates: [],
        contacts: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      fleets: [],
      worldTimeMs,
      reducedMotion: false,
      selection: null,
      log: vi.fn(),
    })
  }

  // Scenario: A mark crossing the viewport edge gains or loses its
  // off-screen affordance within a second
  it('Scenario: A mark crossing the viewport edge gains or loses its off-screen affordance within a second', async () => {
    const near = sceneWithBodyAt(20, T0)
    const { rerender } = render(
      <SpaceStage systemId="sys_1" scene={near} extent={EXTENT} worldTime={T0} scale={1} selection={null} frameSource={null} />,
    )
    await ready()
    expect(screen.queryByTestId('offscreen-feat-body-0'), 'the body starts on-screen').toBeNull()

    // A coarse tick lands a new scene with the body now far outside the
    // viewport — membership recomputes on the coarse render, no camera
    // change needed.
    const far = sceneWithBodyAt(EXTENT * 200, T0 + 1_000)
    rerender(
      <SpaceStage systemId="sys_1" scene={far} extent={EXTENT} worldTime={T0 + 1_000} scale={1} selection={null} frameSource={null} />,
    )
    expect(screen.getByTestId('offscreen-feat-body-0')).toBeInTheDocument()

    // ...and back the other way.
    rerender(
      <SpaceStage systemId="sys_1" scene={near} extent={EXTENT} worldTime={T0 + 2_000} scale={1} selection={null} frameSource={null} />,
    )
    expect(screen.queryByTestId('offscreen-feat-body-0')).toBeNull()
  })
})

describe('SpaceStage + the transform loop — task 4.8', () => {
  // Scenario (SDET, task 4.8's own test): a point pick after a simulated
  // resize resolves against the post-resize basis, the sole basis authority.
  it('a point pick after a resize resolves against the POST-resize basis', async () => {
    vi.useFakeTimers()
    const onSelect = vi.fn()
    const coarseScene = emptySceneModel()
    render(
      <SpaceStage
        systemId="sys_1"
        scene={coarseScene}
        extent={EXTENT}
        worldTime={T0}
        scale={1}
        selection={null}
        onSelect={onSelect}
        frameSource={null}
      />,
    )
    await ready()
    W = 600
    H = 400
    act(() => vi.advanceTimersToNextFrame())

    const camera = JSON.parse(screen.getByTestId('space-canvas-region').getAttribute('data-camera')!)
    const region = screen.getByTestId('space-canvas-region')
    fireEvent.pointerDown(region, { clientX: 300, clientY: 200, button: 0, pointerId: 1 })
    fireEvent.pointerUp(region, { clientX: 300, clientY: 200, pointerId: 1 })

    const basis = viewBasisOf(camera, { width: W, height: H })
    const expected = unprojectToViewPlane(300, 200, basis, camera.target)
    const sel = onSelect.mock.calls.at(-1)?.[0]
    expect(sel?.point).toEqual(expected)
  })
})

describe('SpaceStage + the transform loop — task 4.9', () => {
  // `onFocusMark`/`reframeOn` and the off-screen chip both read the
  // transform loop's live mark ref, not the coarse-rendered scene.marks.
  it('the off-screen chip reframes to the LIVE mark position published by the loop, not the stale coarse one', async () => {
    vi.useFakeTimers()
    let simTime = T0
    const elements = { parentId: 'feat-star', radius: 5_000, periodMs: 100_000, phase: 0, inclination: 0, node: 0 }
    const inputs: SceneFrameInputs = {
      interior: {
        systemId: 'sys_1',
        extent: EXTENT,
        character: 'normal',
        starClass: 'M',
        worldTime: T0,
        scale: 1,
        features: [
          { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5 },
          { id: 'feat-far', type: 'rocky', space: { X: 0, Y: 0, Z: 0 }, size: 1, orbitElements: elements },
        ],
        laneGates: [],
        contacts: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      fleets: [],
      reducedMotion: false,
      selection: null,
      log: vi.fn(),
    }
    const coarseScene = buildSceneModel({ ...inputs, worldTimeMs: T0 })
    render(
      <SpaceStage
        systemId="sys_1"
        scene={coarseScene}
        extent={EXTENT}
        worldTime={T0}
        scale={1}
        selection={null}
        frameSource={frameSourceOf(inputs, () => simTime)}
      />,
    )
    await ready()
    expect(screen.getByTestId('offscreen-feat-far'), 'a body 5000 units out must start off-screen').toBeInTheDocument()

    simTime = T0 + 25_000
    act(() => vi.advanceTimersToNextFrame())

    fireEvent.click(screen.getByTestId('offscreen-feat-far'))

    const camera = JSON.parse(screen.getByTestId('space-canvas-region').getAttribute('data-camera')!)
    const livePosition = drawOrbitPosition(elements, simTime)
    const stalePosition = drawOrbitPosition(elements, T0)
    // Vacuity guard: the coarse and live positions must actually differ, or
    // this proves nothing about which one the reframe used.
    expect(
      Math.hypot(
        livePosition.x - stalePosition.x,
        livePosition.y - stalePosition.y,
        livePosition.z - stalePosition.z,
      ),
    ).toBeGreaterThan(1)

    // Following centers the live target, including targets beyond manual pan bounds.
    const expectedTarget = livePosition
    expect(camera.target.x).toBeCloseTo(expectedTarget.x, 6)
    expect(camera.target.y).toBeCloseTo(expectedTarget.y, 6)
    expect(camera.target.z).toBeCloseTo(expectedTarget.z, 6)
  })
})
