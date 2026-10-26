import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Camera input uses pointer/touch gestures. Normal button keyboard activation remains.
const onSelect = vi.fn()

const marks = [
  { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5.2, pickable: false, selected: false },
  { id: 'feat-body-0', kind: 'body', position: { x: 18, y: -3, z: -15 }, radius: 1.7, pickable: true, selected: false },
  { id: 'feat-body-1', kind: 'body', position: { x: -34, y: 0, z: -42 }, radius: 2.1, pickable: true, selected: false },
  { id: 'gate-sys_-6_16', kind: 'gate', position: { x: 694, y: 0, z: -207 }, radius: 1.2, pickable: true, selected: false },
  { id: 'gate-sys_-7_18', kind: 'gate', position: { x: 241, y: 0, z: 683 }, radius: 1.2, pickable: true, selected: false },
  {
    id: 'contact-0',
    kind: 'contact',
    position: { x: 120, y: 4, z: -60 },
    radius: 0.6,
    pickable: false,
    selected: false,
    emitting: true,
    scanning: false,
    velocity: { x: 2.5, y: 0, z: -1 },
  },
]

const scene = {
  marks,
  curves: [],
  beltFields: [],
    orbitRings: [],
  positionTimeMs: 1,
  decorativeTimeMs: 1,
  omissions: [],
}

import { SpaceStage } from './SpaceStage'

const W = 1200
const H = 900
const EXTENT = 658.7081316032265

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
})

async function stage(over: Record<string, unknown> = {}) {
  const available = vi.fn()
  const mounted = render(
     
    <SpaceStage
      systemId="sys_-7_17"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scene={scene as any}
      extent={EXTENT}
      worldTime={1}
      scale={1}
      selection={null}
      onSelect={onSelect}
      frameSource={null}
      onAvailabilityChange={available}
      {...over}
    />,
  )
  await waitFor(() => expect(available).toHaveBeenLastCalledWith(true))
  return mounted
}

const region = () => screen.getByTestId('space-canvas-region')
const dragCamera = () => {
  fireEvent.pointerDown(region(), { button: 0, pointerId: 1, clientX: 400, clientY: 400 })
  fireEvent.pointerMove(region(), { pointerId: 1, clientX: 440, clientY: 420 })
  fireEvent.pointerUp(region(), { pointerId: 1, clientX: 440, clientY: 420 })
}
const zoomCamera = (deltaY = -100) => fireEvent.wheel(region(), { deltaY })

describe('SpaceStage — keyboard tab order', () => {
  it('Scenario: Tab reaches hit targets in the defined order', async () => {
    await stage()
    const focusables = [region(), ...Array.from(region().querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"]), button, [href]'))].map((el) => el.getAttribute('data-testid'))

    const cameraIdx = focusables.indexOf('space-canvas-region')
    const firstBody = focusables.indexOf('body-hit-feat-body-0')
    const firstGate = focusables.indexOf('body-hit-gate-sys_-6_16')

    expect(cameraIdx, 'the camera controls must be in the tab order').toBeGreaterThanOrEqual(0)
    expect(firstBody, 'body hit targets must be in the tab order').toBeGreaterThanOrEqual(0)
    expect(firstGate, 'gate hit targets must be in the tab order').toBeGreaterThanOrEqual(0)

    expect(cameraIdx).toBeLessThan(firstBody)
    expect(firstBody).toBeLessThan(firstGate)

    const bodies = focusables.filter((t) => t === 'body-hit-feat-body-0' || t === 'body-hit-feat-body-1')
    expect(bodies).toEqual(['body-hit-feat-body-0', 'body-hit-feat-body-1'])
    const gates = focusables.filter((t) => t?.startsWith('body-hit-gate-'))
    expect(gates).toEqual(['body-hit-gate-sys_-6_16', 'body-hit-gate-sys_-7_18'])
  })

  it('Scenario: The point-selection control is in the tab order and shows focus', async () => {
    await stage()
    const control = region()
    control.focus()
    expect(document.activeElement).toBe(control)
    expect(control.className, 'a visible focus indicator').toMatch(/focus[-:]/)
  })

  it('Scenario: A focused body or gate shows a focus indicator', async () => {
    await stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    expect(hit.querySelector('[data-testid="hit-focus-ring"]')).toBeNull()
    hit.focus()
    await waitFor(() => expect(hit.querySelector('[data-testid="hit-focus-ring"]')).not.toBeNull())
    hit.blur()
    await waitFor(() => expect(hit.querySelector('[data-testid="hit-focus-ring"]')).toBeNull())
  })

  it('Scenario: Enter/Space selects the focused body or gate', async () => {
    await stage()
    const body = screen.getByTestId('body-hit-feat-body-0')
    body.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })

    onSelect.mockClear()
    const gate = screen.getByTestId('body-hit-gate-sys_-6_16')
    gate.focus()
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'gate-sys_-6_16' })
  })

})

describe('SpaceStage — camera input', () => {
  it('ignores retired camera keys without moving or selecting', async () => {
    await stage()
    const before = region().getAttribute('data-camera')
    region().focus()
    for (const key of ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'Home', 'Enter']) fireEvent.keyDown(region(), { key })
    expect(region().getAttribute('data-camera')).toBe(before)
    expect(onSelect).not.toHaveBeenCalled()
    expect(region()).not.toHaveAccessibleName(/WASD|Arrow keys|Home|Enter/)
  })

  it('has no camera button cluster on desktop', async () => {
    await stage()
    for (const id of ['space-camera-controls', 'camera-orbit', 'camera-zoom-in', 'camera-zoom-out', 'camera-recenter', 'select-pan-target-point']) expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    expect(region()).toHaveAttribute('tabindex', '0')
  })

  it('Scenario: Focus moving to an off-screen glyph brings it into view', async () => {
    await stage()
    expect(region().getAttribute('data-camera')).not.toBeNull()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    screen.getByTestId('body-hit-gate-sys_-7_18').focus()
    await waitFor(() => {
      const after = JSON.parse(region().getAttribute('data-camera')!)
      expect(after, 'the camera must reframe to bring the focused target into view').not.toEqual(before)
    })
    expect(region()).toHaveAttribute('data-reframe-animated', 'true')
  })
})

describe('SpaceStage — selection and framing', () => {
  it('Scenario: Selection changes pivot, preserves tilt/orbit/zoom and follows realtime positions', async () => {
    const { rerender } = await stage()
    const initial = region().getAttribute('data-camera')
    expect(initial, 'the stage must expose its camera state to be asserted on at all').not.toBeNull()
    const orbit = region()
    orbit.focus()
    dragCamera()
    zoomCamera()
    const moved = region().getAttribute('data-camera')
    expect(moved, 'the camera must actually have moved before "it survives" means anything').not.toBe(
      initial,
    )

    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_-7_17" scene={scene as any} extent={EXTENT} worldTime={1} scale={1} selection={{ bodyId: 'feat-body-1' }} onSelect={onSelect} frameSource={null} />,
    )
    const focused = JSON.parse(region().getAttribute('data-camera')!)
    expect(focused.distance).toBeCloseTo(JSON.parse(moved!).distance)
    expect(focused.yaw).toBeCloseTo(JSON.parse(moved!).yaw)
    expect(focused.pitch).toBeCloseTo(JSON.parse(moved!).pitch)
    expect(focused.target).toEqual(marks.find(mark => mark.id === 'feat-body-1')!.position)

    const moved2 = {
      ...scene,
      marks: marks.map((m) => ({ ...m, position: { ...m.position, x: m.position.x + 3 } })),
      positionTimeMs: 2,
    }
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_-7_17" scene={moved2 as any} extent={EXTENT} worldTime={2} scale={1} selection={{ bodyId: 'feat-body-1' }} onSelect={onSelect} frameSource={null} />,
    )
    const followed = JSON.parse(region().getAttribute('data-camera')!)
    expect(followed.distance).toBeCloseTo(focused.distance)
    await waitFor(() => expect(JSON.parse(region().getAttribute('data-map-camera')!).target[0]).toBeCloseTo(focused.target.x + 3))
  })

  it('Scenario: Camera resets when the system changes', async () => {
    const { rerender } = await stage()
    const initial = region().getAttribute('data-camera')
    expect(initial).not.toBeNull()
    const orbit = region()
    orbit.focus()
    dragCamera()
    expect(region().getAttribute('data-camera')).not.toBe(initial)
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_OTHER" scene={scene as any} extent={EXTENT} worldTime={1} scale={1} selection={null} onSelect={onSelect} frameSource={null} />,
    )
    expect(region().getAttribute('data-camera')).toBe(initial)
    expect(region()).toHaveAttribute('data-reframe-animated', 'false')
  })
})

describe('SpaceStage — pointer picking through the DOM', () => {
  it('Scenario: A gesture that begins over a mark still moves the camera', async () => {
    await stage({ selection: { bodyId: 'feat-body-0' } })
    const before = region().getAttribute('data-camera')
    expect(before).not.toBeNull()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, { clientX: 100, clientY: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(region(), { clientX: 160, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(region(), { clientX: 160, clientY: 130, pointerId: 1 })
    expect(region().getAttribute('data-camera'), 'a drag beginning over a mark must move the camera').not.toBe(
      before,
    )
    expect(onSelect, 'and must NOT change the selection').not.toHaveBeenCalled()

    const cam = region().getAttribute('data-camera')
    fireEvent.wheel(hit, { deltaY: -100 })
    expect(region().getAttribute('data-camera')).not.toBe(cam)
  })

  it('Scenario: A sub-threshold pointer press-release still resolves as a click', async () => {
    await stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, { clientX: 100, clientY: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(hit, { clientX: 104, clientY: 100, pointerId: 1 }) // 4px
    fireEvent.pointerUp(hit, { clientX: 104, clientY: 100, pointerId: 1 })
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })

    onSelect.mockClear()
    fireEvent.pointerDown(hit, { clientX: 100, clientY: 100, button: 0, pointerId: 2 })
    fireEvent.pointerMove(hit, { clientX: 108, clientY: 100, pointerId: 2 }) // exactly 8px
    fireEvent.pointerUp(hit, { clientX: 108, clientY: 100, pointerId: 2 })
    expect(onSelect, '8 or more CSS pixels is a camera gesture, not a click').not.toHaveBeenCalled()
  })
})

describe('SpaceStage — picking stays correct after the camera moves', () => {
  it('Scenario: Picking survives camera movement', async () => {
    await stage()
    const orbit = region()
    orbit.focus()
    dragCamera()
    zoomCamera()
    orbit.focus()
    dragCamera()
    onSelect.mockClear()

    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, { clientX: 300, clientY: 300, button: 0, pointerId: 9 })
    fireEvent.pointerUp(hit, { clientX: 300, clientY: 300, pointerId: 9 })
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
  })

  it('Scenario: A point-in-space click resolves correctly after camera movement', async () => {
    await stage()
    const orbit = region()
    orbit.focus()
    dragCamera()
    dragCamera()
    onSelect.mockClear()
    fireEvent.pointerDown(region(), { clientX: 610, clientY: 460, button: 0, pointerId: 10 })
    fireEvent.pointerUp(region(), { clientX: 610, clientY: 460, pointerId: 10 })
    const sel = onSelect.mock.calls.at(-1)?.[0]
    expect(sel, 'a point pick must still resolve after the camera has moved').not.toBeNull()
    expect(sel).toHaveProperty('point')
  })

  it('Scenario: A click beyond the pick radius still clears the selection after camera movement', async () => {
    await stage({ selection: { bodyId: 'feat-body-0' } })
    const orbit = region()
    orbit.focus()
    dragCamera()
    for (let i = 0; i < 12; i++) zoomCamera(100)
    orbit.focus()
    dragCamera()
    onSelect.mockClear()
    fireEvent.pointerDown(region(), { clientX: 2, clientY: 2, button: 0, pointerId: 11 })
    fireEvent.pointerUp(region(), { clientX: 2, clientY: 2, pointerId: 11 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

it('has no mobile camera buttons or hidden rotate state', async () => {
  const previousMedia = window.matchMedia
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  try {
    await stage()
    for (const id of ['space-camera-controls', 'space-pan-controls', 'camera-touch-rotate', 'select-pan-target-point']) expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    expect(screen.getByTestId('touch-camera-hint')).toHaveTextContent('One finger orbits. Pinch or swipe two fingers vertically to zoom.')
  } finally { window.matchMedia = previousMedia }
})

describe('SpaceStage — shared Galaxy touch controls', () => {
  const touch = (type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', target: Element, x: number, y: number, id = 1) => fireEvent[type](target, { clientX: x, clientY: y, pointerId: id, pointerType: 'touch', button: 0, isPrimary: id === 1 })
  const read = () => JSON.parse(region().getAttribute('data-camera')!)
  it('one finger orbits without selecting, including after phone layout changes', async () => {
    await stage(); const before = read()
    touch('pointerDown', region(), 300, 300); touch('pointerMove', region(), 360, 330); touch('pointerUp', region(), 360, 330)
    expect(read().yaw).not.toBe(before.yaw); expect(read().target).toEqual(before.target); expect(onSelect).not.toHaveBeenCalled()
  })
  it('two fingers zoom without panning, orbiting or selecting on release', async () => {
    await stage()
    const read = () => JSON.parse(region().getAttribute('data-camera')!)
    const before = read()
    touch('pointerDown', region(), 200, 400); touch('pointerDown', region(), 300, 400, 2)
    touch('pointerMove', region(), 200, 370); touch('pointerMove', region(), 300, 370, 2)
    expect(read().target).toEqual(before.target)
    expect(read().yaw).toBeCloseTo(before.yaw)
    expect(read().distance).toBeLessThan(before.distance)
    touch('pointerUp', region(), 300, 370, 2); touch('pointerUp', region(), 200, 370)
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('touch cancellation cannot select and the next independent tap selects once', async () => {
    await stage(); const hit = screen.getByTestId('body-hit-feat-body-0')
    touch('pointerDown', hit, 300, 300); touch('pointerCancel', region(), 300, 300); touch('pointerUp', region(), 300, 300); expect(onSelect).not.toHaveBeenCalled()
    touch('pointerDown', hit, 300, 300); touch('pointerUp', region(), 300, 300); expect(onSelect).toHaveBeenCalledExactlyOnceWith({ bodyId: 'feat-body-0' })
  })
  it('uses input timestamps for double-tap focus even when handlers run late', async () => {
    await stage(); const hit = screen.getByTestId('body-hit-feat-body-0')
    const release = (at: number) => {
      const event = new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 300 })
      Object.defineProperty(event, 'timeStamp', { value: at }); fireEvent(region(), event)
    }
    touch('pointerDown', hit, 300, 300); release(100)
    const processing = vi.spyOn(performance, 'now').mockReturnValue(10000)
    try {
      touch('pointerDown', hit, 300, 300); release(200)
      expect(read().target).toEqual(marks[1].position)
      expect(onSelect).toHaveBeenCalledExactlyOnceWith({ bodyId: 'feat-body-0' })
    } finally { processing.mockRestore() }
  })
  it('double-tap focuses the selected object without choosing a different command fleet', async () => {
    await stage(); const hit = screen.getByTestId('body-hit-feat-body-0')
    touch('pointerDown', hit, 300, 300); touch('pointerUp', region(), 300, 300)
    const before = read(); touch('pointerDown', hit, 300, 300); touch('pointerUp', region(), 300, 300)
    expect(read().target).toEqual(marks[1].position); expect(read().distance).toBeLessThan(before.distance); expect(read().followBodyId).toBe('feat-body-0'); expect(read().yaw).toBeCloseTo(before.yaw)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ bodyId: 'feat-body-0' })
  })
})

describe('SpaceStage — a contact\'s served velocity is displayed', () => {
  it('Scenario: A contact\'s served velocity is displayed, not integrated', async () => {
    await stage()
    const mark = screen.getByTestId('contact-mark-contact-0')
    fireEvent.pointerOver(mark)
    const facts = await screen.findByTestId('contact-facts')
    expect(facts).toHaveTextContent(/2\.6|2\.7/)
    expect(facts.textContent!.length).toBeGreaterThan(3)
    for (const leak of ['corp', 'owner', 'fleet']) {
      expect(facts.textContent!.toLowerCase()).not.toContain(leak)
    }
  })
})


describe('SpaceStage — compact object annotations', () => {
  it('shows an identifier beside a disclosed body and reveals classification on hover', async () => {
    await stage({ scene: { ...scene, marks: marks.map(mark => mark.id === 'feat-body-0' ? { ...mark, bodyType: 'rocky' } : mark) } })
    const label = screen.getByTestId('space-annotation-feat-body-0')
    expect(label).toHaveTextContent('feat-body-0')
    expect(label).not.toHaveTextContent('rocky')
    fireEvent.pointerOver(screen.getByTestId('body-hit-feat-body-0'))
    expect(label).toHaveTextContent('rocky')
    expect(label).toHaveStyle({ pointerEvents: 'none' })
  })
})





it('keeps long annotations inside the viewport near its right edge', async () => {
  await stage({ scene: { ...scene, marks: [{ ...marks[1], name: 'A very long disclosed world name', position: { x: 220, y: 4, z: -60 } }] } })
  const label = screen.getByTestId('space-annotation-feat-body-0')
  await waitFor(() => expect(label).toBeVisible())
  const coords = label.style.transform.match(/translate3d\(([^p]+)px, ([^p]+)px/)
  expect(coords).not.toBeNull()
  expect(Number(coords![1])).toBeGreaterThanOrEqual(8)
  expect(Number(coords![1]) + 160).toBeLessThanOrEqual(W - 8)
  expect(Number(coords![2])).toBeGreaterThanOrEqual(8)
  expect(Number(coords![2]) + 26).toBeLessThanOrEqual(H - 8)
})


it('can hide ordinary labels while keeping the selected label and body hit targets', async () => {
  await stage({
    selection: { bodyId: 'feat-body-0' },
    labelAppearance: { visible: false, opacity: 0.2, selectedVisible: true, selectedOpacity: 0.8 },
  })
  expect(screen.queryByTestId('space-annotation-feat-body-1')).not.toBeInTheDocument()
  expect(screen.getByTestId('space-annotation-feat-body-0')).toHaveStyle({ opacity: '0.8' })
  expect(screen.getByTestId('body-hit-feat-body-1')).toHaveAccessibleName('feat-body-1')
  fireEvent.keyDown(screen.getByTestId('body-hit-feat-body-1'), { key: 'Enter' })
  expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-1' })
})

it('double-clicking the selected-point reticle glides closer and makes the exact point the orbit pivot', async () => {
  const point = { x: 25, y: 4, z: -10 }
  const pointScene = { ...scene, marks: [...marks, { id: 'point-selection', kind: 'point-selection', position: point, radius: 0.5, pickable: false, selected: true }] }
  await stage({ scene: pointScene, selection: { point } })
  const before = JSON.parse(region().getAttribute('data-camera')!)
  const reticle = screen.getByRole('button', { name: 'Selected location. Double-click to focus.' })
  for (let i = 0; i < 2; i++) {
    fireEvent.pointerDown(reticle, { pointerId: 1, button: 0, clientX: 600, clientY: 450 })
    fireEvent.pointerUp(region(), { pointerId: 1, button: 0, clientX: 600, clientY: 450 })
  }
  const focused = JSON.parse(region().getAttribute('data-camera')!)
  expect(focused.focusPoint).toEqual(point)
  expect(focused.target).toEqual(point)
  expect(focused.distance).toBeLessThan(before.distance)
  expect(onSelect).not.toHaveBeenCalled()
})

it('horizontal scrolling selects the nearest visible body and glides without changing zoom', async () => {
  await stage()
  const before = JSON.parse(region().getAttribute('data-camera')!)
  fireEvent.wheel(region(), { deltaX: 40 })
  expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
  const after = JSON.parse(region().getAttribute('data-camera')!)
  expect(after.followBodyId).toBe('feat-body-0')
  expect(after.distance).toBeCloseTo(before.distance)
  expect(after.yaw).toBeCloseTo(before.yaw)
  expect(after.focusRequest.durationMs).toBe(600)
  fireEvent.wheel(region(), { deltaX: 100 })
  expect(onSelect).toHaveBeenCalledOnce()
})
