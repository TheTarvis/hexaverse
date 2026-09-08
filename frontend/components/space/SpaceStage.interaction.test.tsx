import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`: *Body, Lane-Gate, and Point Selection Is
// Keyboard-Operable*, *Space View Camera Is Keyboard-Operable*, *Space View
// Camera Manual Recenter*, *Off-Screen Bodies and Lane Gates Are Reachable
// by Pointer and Touch*, and the DOM half of *Space View Picking Resolves to
// the Body, Lane Gate, or Point Under the Pointer* and *Space View Camera
// Orbit, Pan, and Zoom* (tasks.md 3.2, 3.3, 3.4, 3.5, 5.2, 5.5, 5.6).
//
// SCOPE. The camera MATHS are pinned in `space-camera.test.ts` as pure
// functions. What is asserted here is the DOM surface: tab order, focus
// indicators, activation, the at-limit state, and the affordances — the
// things a keyboard-only or touch-only player actually touches, and the
// things a pure-function suite cannot see.
//
// data-testid contract:
//   space-camera-controls, camera-orbit-left|right|up|down,
//   camera-pan-left|right|up|down, camera-zoom-in, camera-zoom-out,
//   camera-recenter, camera-limit-status,
//   select-pan-target-point       (the keyboard point-selection control)
//   body-hit-<bodyId>             (a body's or gate's keyboard hit target)
//   offscreen-<bodyId>            (the off-screen reach affordance)
//   space-canvas-region           (carries data-selection / data-camera)
//
// VACUITY NOTE: every "focus lands here" assertion names the SPECIFIC
// element and every "selection becomes X" assertion reads the callback's
// argument, so a component that focused nothing, or selected everything,
// fails.

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

function stage(over: Record<string, unknown> = {}) {
  return render(
     
    <SpaceStage
      systemId="sys_-7_17"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scene={scene as any}
      extent={EXTENT}
      worldTime={1}
      selection={null}
      onSelect={onSelect}
      {...over}
    />,
  )
}

const region = () => screen.getByTestId('space-canvas-region')

describe('SpaceStage — keyboard tab order', () => {
  // Scenario: Tab reaches hit targets in the defined order  +
  // Scenario: The space view's keyboard-operable camera controls, together
  // with the recenter control, SHALL occupy the view's tab order BEFORE the
  // body and lane-gate hit targets
  it('Scenario: Tab reaches hit targets in the defined order', async () => {
    stage()
    const focusables = Array.from(
      region().querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"]), button, [href]'),
    ).map((el) => el.getAttribute('data-testid'))

    const cameraIdx = focusables.findIndex((t) => t?.startsWith('camera-'))
    const firstBody = focusables.indexOf('body-hit-feat-body-0')
    const firstGate = focusables.indexOf('body-hit-gate-sys_-6_16')

    expect(cameraIdx, 'the camera controls must be in the tab order').toBeGreaterThanOrEqual(0)
    expect(firstBody, 'body hit targets must be in the tab order').toBeGreaterThanOrEqual(0)
    expect(firstGate, 'gate hit targets must be in the tab order').toBeGreaterThanOrEqual(0)

    // Camera controls first, then bodies, then gates.
    expect(cameraIdx).toBeLessThan(firstBody)
    expect(firstBody).toBeLessThan(firstGate)

    // Each group in stable id order.
    const bodies = focusables.filter((t) => t === 'body-hit-feat-body-0' || t === 'body-hit-feat-body-1')
    expect(bodies).toEqual(['body-hit-feat-body-0', 'body-hit-feat-body-1'])
    const gates = focusables.filter((t) => t?.startsWith('body-hit-gate-'))
    expect(gates).toEqual(['body-hit-gate-sys_-6_16', 'body-hit-gate-sys_-7_18'])
  })

  // Scenario: The point-selection control is in the tab order and shows focus
  it('Scenario: The point-selection control is in the tab order and shows focus', async () => {
    stage()
    const control = screen.getByTestId('select-pan-target-point')
    control.focus()
    expect(document.activeElement).toBe(control)
    expect(control.className, 'a visible focus indicator').toMatch(/focus[-:]/)
  })

  // Scenario: A focused body or gate shows a focus indicator
  it('Scenario: A focused body or gate shows a focus indicator', async () => {
    stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    expect(hit.querySelector('[data-testid="hit-focus-ring"]')).toBeNull()
    hit.focus()
    await waitFor(() => expect(hit.querySelector('[data-testid="hit-focus-ring"]')).not.toBeNull())
    hit.blur()
    await waitFor(() => expect(hit.querySelector('[data-testid="hit-focus-ring"]')).toBeNull())
  })

  // Scenario: Enter/Space selects the focused body or gate
  it('Scenario: Enter/Space selects the focused body or gate', async () => {
    stage()
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

  // Scenario: Focus survives the view's animation frames
  it('Scenario: Focus survives the view\'s animation frames', async () => {
    const { rerender } = stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    hit.focus()
    for (const t of [2, 3, 4, 5, 6]) {
      rerender(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <SpaceStage systemId="sys_-7_17" scene={scene as any} extent={EXTENT} worldTime={t} selection={null} onSelect={onSelect} />,
      )
    }
    expect(
      document.activeElement,
      'the per-frame world-time update must not unfocus the element the player is on',
    ).toBe(screen.getByTestId('body-hit-feat-body-0'))
  })
})

describe('SpaceStage — the keyboard point-selection control', () => {
  // Scenario: A keyboard control selects the point at the camera's pan target
  it('Scenario: A keyboard control selects the point at the camera\'s pan target', async () => {
    stage()
    // Move the pan target off the star first — at default framing the target
    // IS the star, the one point every burn solve rejects.
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    onSelect.mockClear()
    await userEvent.click(screen.getByTestId('select-pan-target-point'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    const sel = onSelect.mock.calls[0][0]
    // Identical IN KIND to a point selected by clicking: a bare point, with
    // no bodyId.
    expect(sel).toHaveProperty('point')
    expect(sel.bodyId).toBeUndefined()
    expect(
      Math.hypot(sel.point.x, sel.point.y, sel.point.z),
      'the selected point must be the PANNED-TO point, not the star',
    ).toBeGreaterThan(0)
  })

  // Scenario: A keyboard-only player can pan to a point away from the star
  it('Scenario: A keyboard-only player can pan to a point away from the star', async () => {
    stage()
    // Without the keyboard pan this control can only ever name the star,
    // which `space.BuildCurve`'s endpoint-clearance guard always rejects —
    // so the accessibility requirement would be satisfiable while shipping a
    // control whose every activation produces an illegal burn target.
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByTestId('camera-pan-right'))
    await userEvent.click(screen.getByTestId('select-pan-target-point'))
    const sel = onSelect.mock.calls.at(-1)![0]
    const r = Math.hypot(sel.point.x, sel.point.y, sel.point.z)
    // Comfortably clear of the star: the clearance radius is a small
    // multiple of the star's own size, and five pan steps is a real distance.
    expect(r).toBeGreaterThan(EXTENT / 100)
  })
})

describe('SpaceStage — keyboard camera', () => {
  const cameraOf = () => JSON.parse(region().getAttribute('data-camera')!)

  // Scenario: Arrow keys orbit the camera
  it('Scenario: Arrow keys orbit the camera', async () => {
    stage()
    const before = cameraOf()
    screen.getByTestId('space-camera-controls').focus()
    await userEvent.keyboard('{ArrowRight}')
    const after = cameraOf()
    expect(after.yaw).not.toBe(before.yaw)
    expect(after.target, 'orbiting does not translate the pan target').toEqual(before.target)
  })

  // Scenario: Pan keys translate the camera's target
  it('Scenario: Pan keys translate the camera\'s target', async () => {
    stage()
    const before = cameraOf()
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    const after = cameraOf()
    expect(after.target).not.toEqual(before.target)
    expect(after.yaw, 'the viewing angle is unchanged').toBe(before.yaw)
  })

  it('SDET-added: the pan input is a DISTINCT control from the orbit input', () => {
    stage()
    // Two requirements cite a "keyboard-operable orbit/pan/zoom affordance";
    // the point-selection control reads the PAN target. A pan bound to the
    // same arrow keys as orbit would make one of the two unreachable.
    expect(screen.getByTestId('camera-pan-right')).toBeInTheDocument()
    expect(screen.getByTestId('camera-pan-left')).toBeInTheDocument()
    expect(screen.getByTestId('camera-pan-up')).toBeInTheDocument()
    expect(screen.getByTestId('camera-pan-down')).toBeInTheDocument()
    expect(screen.getByTestId('camera-pan-right')).not.toBe(screen.getByTestId('camera-orbit-right'))
  })

  // Scenario: Zoom keys zoom the camera
  it('Scenario: Zoom keys zoom the camera', async () => {
    stage()
    const before = cameraOf()
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(cameraOf().distance).toBeLessThan(before.distance)
    await userEvent.click(screen.getByTestId('camera-zoom-out'))
    await userEvent.click(screen.getByTestId('camera-zoom-out'))
    expect(cameraOf().distance).toBeGreaterThan(before.distance)
  })

  // Scenario: A focused camera control shows a focus indicator
  it('Scenario: A focused camera control shows a focus indicator', () => {
    stage()
    const zoom = screen.getByTestId('camera-zoom-in')
    zoom.focus()
    expect(document.activeElement).toBe(zoom)
    expect(zoom.className).toMatch(/focus[-:]/)
  })

  // Scenario: Keyboard input at a clamp is distinguishable from no input
  it('Scenario: Keyboard input at a clamp is distinguishable from no input', async () => {
    stage()
    const status = screen.getByTestId('camera-limit-status')
    // Away from the clamp: no at-limit state.
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(status.textContent?.trim() ?? '').toBe('')

    // Drive to the zoom clamp.
    for (let i = 0; i < 200; i++) fireEvent.click(screen.getByTestId('camera-zoom-in'))
    await waitFor(() => expect(status.textContent?.trim() ?? '').not.toBe(''))
    expect(screen.getByTestId('camera-zoom-in')).toHaveAttribute('data-at-limit', 'true')

    // The PAN axis, separately — all three axes carry the state.
    for (let i = 0; i < 500; i++) fireEvent.click(screen.getByTestId('camera-pan-right'))
    await waitFor(() =>
      expect(screen.getByTestId('camera-pan-right')).toHaveAttribute('data-at-limit', 'true'),
    )
    // ...and the opposite direction is NOT at limit, so a blanket flag fails.
    expect(screen.getByTestId('camera-pan-left')).not.toHaveAttribute('data-at-limit', 'true')
  })

  // Scenario: Focus moving to an off-screen glyph brings it into view
  it('Scenario: Focus moving to an off-screen glyph brings it into view', async () => {
    stage()
    expect(region().getAttribute('data-camera')).not.toBeNull()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    // The far gate at radius ~725 is outside the default framing.
    screen.getByTestId('body-hit-gate-sys_-7_18').focus()
    await waitFor(() => {
      const after = JSON.parse(region().getAttribute('data-camera')!)
      expect(after, 'the camera must reframe to bring the focused target into view').not.toEqual(before)
    })
    expect(region()).toHaveAttribute('data-reframe-animated', 'false')
  })
})

describe('SpaceStage — recenter', () => {
  // Scenario: Recenter restores default framing on demand
  it('Scenario: Recenter restores default framing on demand', async () => {
    stage()
    expect(region().getAttribute('data-camera')).not.toBeNull()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(JSON.parse(region().getAttribute('data-camera')!)).not.toEqual(before)
    await userEvent.click(screen.getByTestId('camera-recenter'))
    expect(JSON.parse(region().getAttribute('data-camera')!)).toEqual(before)
    expect(region()).toHaveAttribute('data-reframe-animated', 'false')
  })

  // Scenario: Recenter is reachable from the keyboard
  it('Scenario: Recenter is reachable from the keyboard', async () => {
    stage()
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    const moved = JSON.parse(region().getAttribute('data-camera')!)
    const recenter = screen.getByTestId('camera-recenter')
    recenter.focus()
    await userEvent.keyboard('{Enter}')
    expect(JSON.parse(region().getAttribute('data-camera')!)).not.toEqual(moved)
  })

  // Scenario: Recentering while already at default framing is a no-op
  it('Scenario: Recentering while already at default framing is a no-op', async () => {
    stage({ selection: { bodyId: 'feat-body-0' } })
    const before = region().getAttribute('data-camera')
    expect(before).not.toBeNull()
    onSelect.mockClear()
    await userEvent.click(screen.getByTestId('camera-recenter'))
    expect(region().getAttribute('data-camera')).toBe(before)
    expect(region()).toHaveAttribute('data-selection', 'feat-body-0')
    expect(onSelect, 'recentering must not touch the selection').not.toHaveBeenCalled()
  })

  // Scenario: Activating a camera control does not change the selection
  it('Scenario: Activating a camera control does not change the selection', async () => {
    stage({ selection: { bodyId: 'feat-body-0' } })
    onSelect.mockClear()
    for (const id of ['camera-recenter', 'camera-zoom-in', 'camera-pan-right', 'camera-orbit-right']) {
      await userEvent.click(screen.getByTestId(id))
    }
    expect(onSelect).not.toHaveBeenCalled()
    expect(region()).toHaveAttribute('data-selection', 'feat-body-0')
  })

  // Scenario: Camera state survives a selection change and a realtime
  // refetch
  it('Scenario: Camera state survives a selection change and a realtime refetch', async () => {
    const { rerender } = stage()
    const initial = region().getAttribute('data-camera')
    expect(initial, 'the stage must expose its camera state to be asserted on at all').not.toBeNull()
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    const moved = region().getAttribute('data-camera')
    expect(moved, 'the camera must actually have moved before "it survives" means anything').not.toBe(
      initial,
    )

    // (a) a selection change
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_-7_17" scene={scene as any} extent={EXTENT} worldTime={1} selection={{ bodyId: 'feat-body-1' }} onSelect={onSelect} />,
    )
    expect(region().getAttribute('data-camera')).toBe(moved)

    // (b) a realtime refetch landing updated data (a new scene object with
    // moved positions)
    const moved2 = {
      ...scene,
      marks: marks.map((m) => ({ ...m, position: { ...m.position, x: m.position.x + 3 } })),
      positionTimeMs: 2,
    }
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_-7_17" scene={moved2 as any} extent={EXTENT} worldTime={2} selection={{ bodyId: 'feat-body-1' }} onSelect={onSelect} />,
    )
    expect(region().getAttribute('data-camera')).toBe(moved)
  })

  // Scenario: Camera resets when the system changes
  it('Scenario: Camera resets when the system changes', async () => {
    const { rerender } = stage()
    const initial = region().getAttribute('data-camera')
    expect(initial).not.toBeNull()
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    expect(region().getAttribute('data-camera')).not.toBe(initial)
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_OTHER" scene={scene as any} extent={EXTENT} worldTime={1} selection={null} onSelect={onSelect} />,
    )
    expect(region().getAttribute('data-camera')).toBe(initial)
    expect(region()).toHaveAttribute('data-reframe-animated', 'false')
  })
})

describe('SpaceStage — off-screen reach', () => {
  // Scenario: An off-screen lane gate is selectable by pointer
  it('Scenario: An off-screen lane gate is selectable by pointer', async () => {
    stage()
    const aff = screen.getByTestId('offscreen-gate-sys_-7_18')
    const cameraBefore = region().getAttribute('data-camera')
    expect(cameraBefore).not.toBeNull()
    await userEvent.click(aff)
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'gate-sys_-7_18' })
    expect(region().getAttribute('data-camera'), 'the camera must reframe so the mark is visible').not.toBe(
      cameraBefore,
    )
  })

  // Scenario: An off-screen lane gate is selectable by touch
  it('Scenario: An off-screen lane gate is selectable by touch', async () => {
    stage()
    const aff = screen.getByTestId('offscreen-gate-sys_-7_18')
    fireEvent.touchStart(aff, { touches: [{ clientX: 10, clientY: 10 }] })
    fireEvent.touchEnd(aff, { changedTouches: [{ clientX: 10, clientY: 10 }] })
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ bodyId: 'gate-sys_-7_18' }))
  })

  // Scenario: The affordance covers only off-screen marks
  it('Scenario: The affordance covers only off-screen marks', () => {
    stage()
    // The inner planet is inside the default framing.
    expect(screen.queryByTestId('offscreen-feat-body-0')).toBeNull()
    // The far gates are not.
    expect(screen.getByTestId('offscreen-gate-sys_-6_16')).toBeInTheDocument()
    expect(screen.getByTestId('offscreen-gate-sys_-7_18')).toBeInTheDocument()
  })

  // Scenario: An off-screen selection is indistinguishable from a direct one
  it('Scenario: An off-screen selection is indistinguishable from a direct one', async () => {
    stage()
    await userEvent.click(screen.getByTestId('offscreen-gate-sys_-6_16'))
    const viaAffordance = onSelect.mock.calls.at(-1)![0]

    onSelect.mockClear()
    // Now the same gate through its ordinary hit target.
    screen.getByTestId('body-hit-gate-sys_-6_16').focus()
    await userEvent.keyboard('{Enter}')
    const direct = onSelect.mock.calls.at(-1)![0]

    expect(viaAffordance).toEqual(direct)
  })

  // Scenario: An off-screen body is selectable the same way
  it('Scenario: An off-screen body is selectable the same way', async () => {
    // Zoom right in and pan away so a normally-visible body goes off screen.
    stage()
    for (let i = 0; i < 200; i++) fireEvent.click(screen.getByTestId('camera-zoom-in'))
    for (let i = 0; i < 200; i++) fireEvent.click(screen.getByTestId('camera-pan-right'))
    await waitFor(() => expect(screen.queryByTestId('offscreen-feat-body-1')).not.toBeNull())
    await userEvent.click(screen.getByTestId('offscreen-feat-body-1'))
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-1' })
  })
})

describe('SpaceStage — pointer picking through the DOM', () => {
  // Scenario: A gesture that begins over a mark still moves the camera
  it('Scenario: A gesture that begins over a mark still moves the camera', async () => {
    stage({ selection: { bodyId: 'feat-body-0' } })
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

    // A wheel gesture with the pointer over a mark zooms, too — never
    // dead-zoned merely because it began over a mark.
    const cam = region().getAttribute('data-camera')
    fireEvent.wheel(hit, { deltaY: -100 })
    expect(region().getAttribute('data-camera')).not.toBe(cam)
  })

  // Scenario: A sub-threshold pointer press-release still resolves as a click
  it('Scenario: A sub-threshold pointer press-release still resolves as a click', async () => {
    stage()
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
  // Scenario: Picking survives camera movement
  it('Scenario: Picking survives camera movement', async () => {
    stage()
    // Move the camera well away from the default framing on all three axes.
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    await userEvent.click(screen.getByTestId('camera-orbit-right'))
    onSelect.mockClear()

    // Click the mark at its CURRENTLY DRAWN position — the hit target must
    // have followed the mark, not stayed where it was framed at start.
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, { clientX: 300, clientY: 300, button: 0, pointerId: 9 })
    fireEvent.pointerUp(hit, { clientX: 300, clientY: 300, pointerId: 9 })
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
  })

  // Scenario: A point-in-space click resolves correctly after camera movement
  it('Scenario: A point-in-space click resolves correctly after camera movement', async () => {
    stage()
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    await userEvent.click(screen.getByTestId('camera-orbit-up'))
    onSelect.mockClear()
    // A click over empty space, well inside the pick radius.
    fireEvent.pointerDown(region(), { clientX: 610, clientY: 460, button: 0, pointerId: 10 })
    fireEvent.pointerUp(region(), { clientX: 610, clientY: 460, pointerId: 10 })
    const sel = onSelect.mock.calls.at(-1)?.[0]
    expect(sel, 'a point pick must still resolve after the camera has moved').not.toBeNull()
    expect(sel).toHaveProperty('point')
  })

  // Scenario: A click beyond the pick radius still clears the selection after
  // camera movement
  it('Scenario: A click beyond the pick radius still clears the selection after camera movement', async () => {
    stage({ selection: { bodyId: 'feat-body-0' } })
    await userEvent.click(screen.getByTestId('camera-pan-right'))
    for (let i = 0; i < 12; i++) await userEvent.click(screen.getByTestId('camera-zoom-out'))
    await userEvent.click(screen.getByTestId('camera-orbit-right'))
    onSelect.mockClear()
    // The far corner of a well zoomed-out view lies beyond the maximum pick
    // radius — a configured multiple of the served `extent`.
    fireEvent.pointerDown(region(), { clientX: 2, clientY: 2, button: 0, pointerId: 11 })
    fireEvent.pointerUp(region(), { clientX: 2, clientY: 2, pointerId: 11 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

describe('SpaceStage — touch input', () => {
  // Scenario: A single-finger touch drag orbits instead of zooming
  it('Scenario: A single-finger touch drag orbits instead of zooming', () => {
    stage()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    fireEvent.touchStart(region(), { touches: [{ identifier: 1, clientX: 400, clientY: 400 }] })
    fireEvent.touchMove(region(), { touches: [{ identifier: 1, clientX: 470, clientY: 430 }] })
    fireEvent.touchEnd(region(), { changedTouches: [{ identifier: 1, clientX: 470, clientY: 430 }] })
    const after = JSON.parse(region().getAttribute('data-camera')!)
    expect(after.yaw, 'a single-finger drag orbits, exactly as a primary-button drag does').not.toBe(
      before.yaw,
    )
    expect(after.distance, 'and does NOT zoom').toBe(before.distance)
  })

  // Scenario: A stationary single-finger touch selects rather than orbits
  it('Scenario: A stationary single-finger touch selects rather than orbits', () => {
    stage()
    const before = region().getAttribute('data-camera')
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.touchStart(hit, { touches: [{ identifier: 1, clientX: 300, clientY: 300 }] })
    fireEvent.touchMove(hit, { touches: [{ identifier: 1, clientX: 302, clientY: 301 }] })
    fireEvent.touchEnd(hit, { changedTouches: [{ identifier: 1, clientX: 302, clientY: 301 }] })
    // The gesture suppression this view needs to keep native pinch from
    // competing must NOT itself prevent a tap within the threshold from
    // producing a selection.
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
    expect(region().getAttribute('data-camera')).toBe(before)
  })

  // Scenario: A single-finger touch that moves past the tap threshold orbits
  it('Scenario: A single-finger touch that moves past the tap threshold orbits', () => {
    stage()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.touchStart(hit, { touches: [{ identifier: 1, clientX: 300, clientY: 300 }] })
    fireEvent.touchMove(hit, { touches: [{ identifier: 1, clientX: 340, clientY: 300 }] })
    fireEvent.touchEnd(hit, { changedTouches: [{ identifier: 1, clientX: 340, clientY: 300 }] })
    expect(onSelect, 'no selection change on release after a real drag').not.toHaveBeenCalled()
    expect(JSON.parse(region().getAttribute('data-camera')!).yaw).not.toBe(before.yaw)
  })
})

describe('SpaceStage — a contact\'s served velocity is displayed', () => {
  // Scenario: A contact's served velocity is displayed, not integrated
  it('Scenario: A contact\'s served velocity is displayed, not integrated', async () => {
    // The wire's `velocity` would otherwise ship served-and-unread. Its ONE
    // named consumer is a heading-and-speed readout on the hovered (or
    // selected) contact's facts surface — never a client-side integration
    // that would place the contact at a point the server never disclosed.
    stage()
    const mark = screen.getByTestId('contact-mark-contact-0')
    fireEvent.pointerOver(mark)
    const facts = await screen.findByTestId('contact-facts')
    // Speed: |(2.5, 0, -1)| = 2.69...
    expect(facts).toHaveTextContent(/2\.6|2\.7/)
    // A heading is presented too — the field is displayed, not just stored.
    expect(facts.textContent!.length).toBeGreaterThan(3)
    // ...and no identity leaks with it.
    for (const leak of ['corp', 'owner', 'fleet']) {
      expect(facts.textContent!.toLowerCase()).not.toContain(leak)
    }
  })
})
