import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createHitTargetRegistry,
  startSpaceTransformLoop,
  applyHitTransform,
  type SpaceFrame,
  type SpaceFrameSource,
  type SceneFrameInputs,
} from './space-transform-loop'
import { hitTargetTransform } from './space-projection'
import type { SceneModel } from './space-scene'
import { fleetCamera, panBySteps, defaultCamera } from './space-camera'

// RED-PHASE SUITE — tasks 4.2, 4.3, 4.3a, 4.6, 4.8 (design.md Decision 3,
// decided option B). The transform writer, extracted from GL construction,
// runs directly under jsdom with no GL fake needed (impl contract §6). Every
// scenario here is the loop's OWN contract, independent of any React view —
// `SpaceStage.transform-loop.test.tsx` covers it wired into the real stage.

const EXTENT = 100

function host(width = 1200, height = 900): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => height })
  return el
}

function staticScene(): SceneModel {
  return {
    marks: [
      { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5, pickable: false, selected: false },
      { id: 'feat-body-0', kind: 'body', position: { x: 20, y: 0, z: 0 }, radius: 1, pickable: true, selected: false },
    ],
    curves: [],
    beltFields: [],
    orbitRings: [],
    positionTimeMs: 0,
    decorativeTimeMs: 0,
    omissions: [],
  }
}

let rafCallbacks: FrameRequestCallback[] = []
let rafId = 0

beforeEach(() => {
  rafCallbacks = []
  rafId = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    rafCallbacks.push(cb)
    return ++rafId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function fireNextFrame(t = 0) {
  const cb = rafCallbacks.shift()
  cb?.(t)
}

describe('createHitTargetRegistry — refFor is a stable callback per mark id (task 4.3a)', () => {
  it('returns the SAME callback for the same id across calls', () => {
    const registry = createHitTargetRegistry()
    expect(registry.refFor('a')).toBe(registry.refFor('a'))
  })

  it('sets and deletes an element via the callback, and reports size', () => {
    const registry = createHitTargetRegistry()
    const el = document.createElement('div')
    registry.refFor('a')(el)
    expect(registry.get('a')).toBe(el)
    expect(registry.size).toBe(1)
    registry.refFor('a')(null)
    expect(registry.get('a')).toBeUndefined()
    expect(registry.size).toBe(0)
  })

  it('the cached callback is dropped once it receives null — a fresh call after that is free to return a new one', () => {
    const registry = createHitTargetRegistry()
    const el = document.createElement('div')
    const cb1 = registry.refFor('a')
    cb1(el)
    cb1(null)
    const cb2 = registry.refFor('a')
    const el2 = document.createElement('div')
    cb2(el2)
    expect(registry.get('a')).toBe(el2)
  })

  it('calls onAttach(id, el) when an element is set, never when it is cleared', () => {
    const onAttach = vi.fn()
    const registry = createHitTargetRegistry(onAttach)
    const el = document.createElement('div')
    registry.refFor('mark-1')(el)
    expect(onAttach).toHaveBeenCalledWith('mark-1', el)
    onAttach.mockClear()
    registry.refFor('mark-1')(null)
    expect(onAttach).not.toHaveBeenCalled()
  })

  it('a mark present for several renders then absent is removed from the registry within one render (a sighting expiring, a contact leaving range) — asserted via the registry\'s own size, never draw()', () => {
    const registry = createHitTargetRegistry()
    const el = document.createElement('div')
    const ref = registry.refFor('sighting-1')
    ref(el)
    expect(registry.size).toBe(1)
    // React calls the SAME ref callback with null when the element unmounts.
    ref(null)
    expect(registry.size).toBe(0)
  })

  it('entries() iterates every registered [id, element] pair', () => {
    const registry = createHitTargetRegistry()
    const a = document.createElement('div')
    const b = document.createElement('div')
    registry.refFor('a')(a)
    registry.refFor('b')(b)
    expect(new Map(registry.entries())).toEqual(new Map([['a', a], ['b', b]]))
  })
})

describe('applyHitTransform', () => {
  it('writes nothing when there is no frame yet', () => {
    const el = document.createElement('div')
    applyHitTransform(null, 'a', el)
    expect(el.style.transform).toBe('')
  })

  it('writes hitTargetTransform(frame.projected.get(markId)?.screen)', () => {
    const el = document.createElement('div')
    const projected = new Map([
      ['a', { mark: { id: 'a' } as SceneModel['marks'][number], screen: { x: 1, y: 2, depth: 1, onScreen: true } }],
    ])
    const frame = { scene: staticScene(), camera: defaultCamera(EXTENT), basis: { eye: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: 1 }, widthPx: 1, heightPx: 1, tanHalfFov: 1 }, projected } as unknown as SpaceFrame
    applyHitTransform(frame, 'a', el)
    expect(el.style.transform).toBe(hitTargetTransform({ x: 1, y: 2, onScreen: true }))
  })

  it('writes the off-screen sentinel for a markId absent from the frame', () => {
    const el = document.createElement('div')
    const frame = { scene: staticScene(), camera: defaultCamera(EXTENT), basis: {} as SpaceFrame['basis'], projected: new Map() } as SpaceFrame
    applyHitTransform(frame, 'missing', el)
    expect(el.style.transform).toBe(hitTargetTransform(undefined))
  })
})

describe('startSpaceTransformLoop — one frame runs synchronously before the first rAF (§6.2)', () => {
  function options(over: Partial<Parameters<typeof startSpaceTransformLoop>[0]> = {}) {
    const registry = createHitTargetRegistry()
    const frameRef: { current: SpaceFrame | null } = { current: null }
    const cameraRef = { current: defaultCamera(EXTENT) }
    return {
      registry,
      frameRef,
      cameraRef,
      host: host(),
      source: null,
      staticSceneRef: { current: staticScene() },
      ...over,
    }
  }

  it('publishes a frame BEFORE the first requestAnimationFrame is requested', () => {
    const opts = options()
    const handle = startSpaceTransformLoop(opts)
    expect(opts.frameRef.current, 'the synchronous first frame must have published already').not.toBeNull()
    handle.stop()
  })

  it('each rAF callback publishes a fresh frame and re-requests', () => {
    const opts = options()
    const handle = startSpaceTransformLoop(opts)
    const first = opts.frameRef.current
    fireNextFrame(16)
    expect(opts.frameRef.current).not.toBe(first)
    expect(rafCallbacks.length, 'the loop must re-request after each frame').toBeGreaterThan(0)
    handle.stop()
  })

  it('stop() cancels the pending rAF', () => {
    const opts = options()
    const handle = startSpaceTransformLoop(opts)
    const cancelSpy = vi.mocked(window.cancelAnimationFrame)
    handle.stop()
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('with no source, it publishes the static scene as-is, unchanged frame to frame (tests only, per the frameSource contract)', () => {
    const scene = staticScene()
    const opts = options({ staticSceneRef: { current: scene } })
    const handle = startSpaceTransformLoop(opts)
    expect(opts.frameRef.current?.scene).toBe(scene)
    fireNextFrame(16)
    expect(opts.frameRef.current?.scene).toBe(scene)
    handle.stop()
  })

  it('with a source, buildSceneModel runs once per frame at clock.now(), and is skipped while inputsRef.current is null', () => {
    const inputsRef: { current: SceneFrameInputs | null } = { current: null }
    const clockNow = vi.fn().mockReturnValue(0)
    const source: SpaceFrameSource = {
      clock: { now: clockNow, anchor: vi.fn(), hasReading: () => true, reading: () => null },
      inputsRef,
    }
    const opts = options({ source })
    const handle = startSpaceTransformLoop(opts)
    // Nothing to build yet — the first synchronous frame publishes nothing.
    expect(opts.frameRef.current).toBeNull()

    inputsRef.current = { interior: null, fleets: [], reducedMotion: false, selection: null, log: vi.fn() }
    fireNextFrame(16)
    expect(opts.frameRef.current).not.toBeNull()
    expect(clockNow).toHaveBeenCalled()
    handle.stop()
  })

  it('refresh() re-runs steps 2–6 on the LAST BUILT scene and never calls clock.now()/rebuilds the scene', () => {
    const inputsRef: { current: SceneFrameInputs | null } = {
      current: { interior: null, fleets: [], reducedMotion: false, selection: null, log: vi.fn() },
    }
    let calls = 0
    const clockNow = vi.fn(() => {
      calls += 1
      return calls * 10
    })
    const source: SpaceFrameSource = {
      clock: { now: clockNow, anchor: vi.fn(), hasReading: () => true, reading: () => null },
      inputsRef,
    }
    const opts = options({ source })
    const handle = startSpaceTransformLoop(opts)
    const callsAfterFirstFrame = clockNow.mock.calls.length
    const sceneAfterFirstFrame = opts.frameRef.current?.scene
    handle.refresh()
    expect(clockNow.mock.calls.length, 'refresh() must not call clock.now() / rebuild the scene').toBe(
      callsAfterFirstFrame,
    )
    expect(opts.frameRef.current?.scene).toBe(sceneAfterFirstFrame)
    handle.stop()
  })

  it('refresh() runs a full frame() if no scene has been built yet', () => {
    const inputsRef: { current: SceneFrameInputs | null } = { current: null }
    const clockNow = vi.fn().mockReturnValue(0)
    const source: SpaceFrameSource = {
      clock: { now: clockNow, anchor: vi.fn(), hasReading: () => true, reading: () => null },
      inputsRef,
    }
    const opts = options({ source })
    const handle = startSpaceTransformLoop(opts)
    expect(opts.frameRef.current).toBeNull()
    inputsRef.current = { interior: null, fleets: [], reducedMotion: false, selection: null, log: vi.fn() }
    handle.refresh()
    expect(opts.frameRef.current).not.toBeNull()
    handle.stop()
  })

  it('onViewChange fires on the first publish, and again only on a camera change (never merely because a frame passed)', () => {
    const onViewChange = vi.fn()
    const cameraRef = { current: defaultCamera(EXTENT) }
    const opts = options({ onViewChange, cameraRef })
    const handle = startSpaceTransformLoop(opts)
    expect(onViewChange).toHaveBeenCalledTimes(1)

    fireNextFrame(16)
    expect(onViewChange, 'a frame passing alone must not fire onViewChange again').toHaveBeenCalledTimes(1)

    cameraRef.current = defaultCamera(EXTENT * 2)
    fireNextFrame(32)
    expect(onViewChange).toHaveBeenCalledTimes(2)
    handle.stop()
  })

  it('onViewChange fires again on a viewport size change alone, camera unchanged', () => {
    const onViewChange = vi.fn()
    let width = 1200
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 900 })
    const opts = options({ onViewChange, host: el })
    const handle = startSpaceTransformLoop(opts)
    expect(onViewChange).toHaveBeenCalledTimes(1)
    width = 800
    fireNextFrame(16)
    expect(onViewChange).toHaveBeenCalledTimes(2)
    handle.stop()
  })

  it('a thrown frame is contained — console.warn fires ONCE per loop lifetime, and the loop keeps running', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const poisoned: SceneModel = {
      ...staticScene(),
      get marks(): never {
        throw new Error('poisoned scene')
      },
    }
    const opts = options({ staticSceneRef: { current: poisoned } })
    const handle = startSpaceTransformLoop(opts)
    fireNextFrame(16)
    fireNextFrame(32)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]![0])).toMatch(/\[space\] transform frame failed/)
    expect(rafCallbacks.length, 'the loop must keep re-requesting after the throw').toBeGreaterThan(0)
    handle.stop()
    warnSpy.mockRestore()
  })

  it('writes every registered element\'s style.transform from projectMarks each frame', () => {
    const registry = createHitTargetRegistry()
    const el = document.createElement('div')
    registry.refFor('feat-body-0')(el)
    const opts = options({ registry })
    const handle = startSpaceTransformLoop(opts)
    expect(el.style.transform).not.toBe('')
    expect(el.style.transform).not.toContain('-9999')
    handle.stop()
  })

  it('a registered element whose mark is not in this frame goes off-screen', () => {
    const registry = createHitTargetRegistry()
    const el = document.createElement('div')
    registry.refFor('not-a-mark')(el)
    const opts = options({ registry })
    const handle = startSpaceTransformLoop(opts)
    expect(el.style.transform).toContain('-9999px')
    handle.stop()
  })
})


it('follows the live fleet every frame without React updates, preserves orbit/zoom, and releases on pan', () => {
  const fleet = { id: 'fleet', kind: 'fleet' as const, position: { x: 20, y: 0, z: 10 }, radius: 1, pickable: false, selected: false }
  const staticSceneRef = { current: { ...staticScene(), marks: [fleet] } }
  const cameraRef = { current: fleetCamera(EXTENT, fleet.id, fleet.position) }
  const frameRef: { current: SpaceFrame | null } = { current: null }
  const onViewChange = vi.fn()
  const loop = startSpaceTransformLoop({ host: host(), registry: createHitTargetRegistry(), cameraRef, frameRef, source: null, staticSceneRef, onViewChange })
  const moved = { x: 30, y: 2, z: 15 }
  staticSceneRef.current = { ...staticSceneRef.current, marks: [{ ...fleet, position: moved }] }
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(moved)
  expect(onViewChange).toHaveBeenCalledTimes(1)
  cameraRef.current = { ...frameRef.current!.camera, yaw: frameRef.current!.camera.yaw + 0.1, pitch: frameRef.current!.camera.pitch + 0.05, distance: frameRef.current!.camera.distance * 0.9 }
  fireNextFrame()
  expect(frameRef.current?.camera.yaw).toBe(cameraRef.current.yaw)
  expect(frameRef.current?.camera.distance).toBe(cameraRef.current.distance)
  expect(frameRef.current?.camera.target).toEqual(moved)
  cameraRef.current = panBySteps(frameRef.current!.camera, 1, 0, EXTENT)
  const panned = cameraRef.current.target
  staticSceneRef.current = { ...staticSceneRef.current, marks: [{ ...fleet, position: { x: 40, y: 0, z: 20 } }] }
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(panned)
  cameraRef.current = fleetCamera(EXTENT, fleet.id, fleet.position)
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual({ x: 40, y: 0, z: 20 })
  loop.stop()
})


it('frames the parked orbital envelope and blends arrival/departure without changing orientation', () => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const fleet = { id: 'fleet', kind: 'fleet' as const, position: { x: 20, y: 0, z: 10 }, radius: 1, pickable: false, selected: false }
  const staticSceneRef: { current: SceneModel } = { current: { ...staticScene(), marks: [fleet] } }
  const cameraRef = { current: fleetCamera(EXTENT, fleet.id, fleet.position) }
  const frameRef: { current: SpaceFrame | null } = { current: null }
  const loop = startSpaceTransformLoop({ host: host(), registry: createHitTargetRegistry(), cameraRef, frameRef, source: null, staticSceneRef })
  const anchor = { id: 'planet', position: { x: 40, y: 0, z: 10 }, radius: 25 }
  staticSceneRef.current = { ...staticSceneRef.current, marks: [{ ...fleet, followAnchor: anchor }] }
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(fleet.position)
  now = 325
  fireNextFrame()
  expect(frameRef.current?.camera.target.x).toBeCloseTo(30)
  now = 650
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(anchor.position)
  expect(frameRef.current!.camera.distance).toBeGreaterThan(50)
  staticSceneRef.current = { ...staticSceneRef.current, marks: [{ ...fleet, position: { x: 48, y: 0, z: 10 }, followAnchor: anchor }] }
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(anchor.position)
  expect(frameRef.current?.camera.yaw).toBe(cameraRef.current.yaw)
  expect(frameRef.current?.camera.pitch).toBe(cameraRef.current.pitch)
  staticSceneRef.current = { ...staticSceneRef.current, marks: [fleet] }
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(anchor.position)
  now = 1300
  fireNextFrame()
  expect(frameRef.current?.camera.target).toEqual(fleet.position)
  loop.stop()
})

it('sizes hit targets to the projected model, updates with zoom, and keeps distant targets usable', () => {
  const mark = { id: 'gas', kind: 'body', bodyType: 'gas_giant', radius: 2, position: { x: 0, y: 0, z: 0 }, selected: false, pickable: true } as const
  const scene = { ...staticScene(), marks: [mark] }
  const cameraRef = { current: { ...defaultCamera(100), distance: 30 } }
  const frameRef: { current: SpaceFrame | null } = { current: null }
  const el = document.createElement('button')
  const registry = createHitTargetRegistry()
  registry.refFor(mark.id)(el)
  const loop = startSpaceTransformLoop({ extent: 100, host: host(), registry, cameraRef, frameRef, source: null, staticSceneRef: { current: scene } })
  const diameter = parseFloat(el.style.width)
  expect(diameter).toBeGreaterThan(180)
  expect(el.style.height).toBe(el.style.width)
  const late = document.createElement('button')
  applyHitTransform(frameRef.current, mark.id, late)
  expect(late.style.width).toBe(el.style.width)
  cameraRef.current = { ...cameraRef.current, distance: 60 }
  loop.refresh()
  expect(parseFloat(el.style.width)).toBeCloseTo(diameter / 2, -1)
  cameraRef.current = { ...cameraRef.current, distance: 10000 }
  loop.refresh()
  expect(el.style.width).toBe('24px')
  loop.stop()
})
