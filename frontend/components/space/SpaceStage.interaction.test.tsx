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
// data-testid contract (add-vitals-strip, impl contract §10, tasks.md
// 9.1-9.5 — the camera-cluster SHRINK: the twelve-button cluster becomes
// FOUR sibling cells; the four `camera-orbit-*` and four `camera-pan-*`
// buttons are GONE):
//   space-camera-controls          (wrapper, exactly four element children)
//   camera-orbit                   (ONE focusable cell: bare arrows orbit,
//                                   Shift+arrow pans — data-pan-at-limit
//                                   naming blocked directions,
//                                   data-orbit-at-limit min|max, both absent
//                                   away from their own clamp)
//   camera-zoom-in, camera-zoom-out, camera-recenter   (unchanged)
//   camera-limit-status             (unchanged: the single-slot zoom>pan>orbit
//                                    priority-masked live region)
//   select-pan-target-point        (moved OUT of the wrapper; still the
//                                   keyboard point-selection control; still
//                                   carries CAMERA_CONTROL_ATTR itself)
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
      // fix-world-time-render-loop, task 4.7 migration: static-scene mode —
      // this file exercises the DOM interaction surface, not the frame loop.
      frameSource={null}
      onAvailabilityChange={available}
      {...over}
    />,
  )
  await waitFor(() => expect(available).toHaveBeenLastCalledWith(true))
  return mounted
}

const region = () => screen.getByTestId('space-canvas-region')

describe('SpaceStage — keyboard tab order', () => {
  // Scenario: Tab reaches hit targets in the defined order  +
  // Scenario: The space view's keyboard-operable camera controls, together
  // with the recenter control, SHALL occupy the view's tab order BEFORE the
  // body and lane-gate hit targets
  it('Scenario: Tab reaches hit targets in the defined order', async () => {
    await stage()
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
    await stage()
    const control = screen.getByTestId('select-pan-target-point')
    control.focus()
    expect(document.activeElement).toBe(control)
    expect(control.className, 'a visible focus indicator').toMatch(/focus[-:]/)
  })

  // Scenario: A focused body or gate shows a focus indicator
  it('Scenario: A focused body or gate shows a focus indicator', async () => {
    await stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    expect(hit.querySelector('[data-testid="hit-focus-ring"]')).toBeNull()
    hit.focus()
    await waitFor(() => expect(hit.querySelector('[data-testid="hit-focus-ring"]')).not.toBeNull())
    hit.blur()
    await waitFor(() => expect(hit.querySelector('[data-testid="hit-focus-ring"]')).toBeNull())
  })

  // Scenario: Enter/Space selects the focused body or gate
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

  // Scenario: Focus survives the view's animation frames — MOVED (task 4.7,
  // fix-world-time-render-loop): the old rerender-on-worldTime-prop loop is
  // removed here (that mechanism no longer models a frame — worldTime is now
  // the coarse figure). Restated rAF-driven, against the real transform
  // loop, in `SpaceStage.transform-loop.test.tsx` (task 2.4).
})

describe('SpaceStage — the keyboard point-selection control', () => {
  // Scenario: A keyboard control selects the point at the camera's pan
  // target. NEW DRIVER (add-vitals-strip, impl contract §10.4 line 184): the
  // on-screen `camera-pan-right` button is deleted; the pan input is now
  // `Shift`+ArrowRight on the surviving `camera-orbit` cell.
  it('Scenario: A keyboard control selects the point at the camera\'s pan target', async () => {
    await stage()
    // Move the pan target off the star first — at default framing the target
    // IS the star, the one point every burn solve rejects.
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
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

  // Scenario: A keyboard-only player can pan to a point away from the star.
  // NEW DRIVER (impl contract §10.4 line 205): five `Shift`+ArrowRight
  // presses on `camera-orbit`, replacing five clicks on the deleted
  // `camera-pan-right` button.
  it('Scenario: A keyboard-only player can pan to a point away from the star', async () => {
    await stage()
    // Without the keyboard pan this control can only ever name the star,
    // which `space.BuildCurve`'s endpoint-clearance guard always rejects —
    // so the accessibility requirement would be satisfiable while shipping a
    // control whose every activation produces an illegal burn target.
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    for (let i = 0; i < 5; i++) fireEvent.keyDown(orbit, { key: 'ArrowRight', shiftKey: true })
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
    await stage()
    const before = cameraOf()
    screen.getByTestId('space-camera-controls').focus()
    await userEvent.keyboard('{ArrowRight}')
    const after = cameraOf()
    expect(after.yaw).not.toBe(before.yaw)
    expect(after.target, 'orbiting does not translate the pan target').toEqual(before.target)
  })

  // Scenario: Pan keys translate the camera's target. NEW DRIVER (impl
  // contract §10.4 line 236): `Shift`+ArrowRight on `camera-orbit`,
  // replacing a click on the deleted `camera-pan-right` button.
  it('Scenario: Pan keys translate the camera\'s target', async () => {
    await stage()
    const before = cameraOf()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    const after = cameraOf()
    expect(after.target).not.toEqual(before.target)
    expect(after.yaw, 'the viewing angle is unchanged').toBe(before.yaw)
  })

  // REWRITTEN, not merely re-pointed (impl contract §10.4 line 245): the
  // four pan buttons this test used to enumerate no longer exist. The same
  // underlying claim — pan and orbit are two distinct inputs — is now
  // provable only by driving BOTH inputs on the one surviving element and
  // showing each moves exactly one camera property.
  it('SDET-added (rewritten for the camera-cluster shrink): the pan input is a DISTINCT input from the orbit input on the one surviving camera-orbit cell — bare arrow orbits (yaw changes, target unchanged), Shift+arrow pans (target changes, yaw unchanged)', async () => {
    await stage()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    const initial = cameraOf()

    await userEvent.keyboard('{ArrowRight}')
    const afterOrbit = cameraOf()
    expect(afterOrbit.yaw, 'a bare arrow must orbit').not.toBe(initial.yaw)
    expect(afterOrbit.target, 'a bare arrow must NOT pan').toEqual(initial.target)

    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    const afterPan = cameraOf()
    expect(afterPan.target, 'Shift+arrow must pan').not.toEqual(afterOrbit.target)
    expect(afterPan.yaw, 'Shift+arrow must NOT orbit').toBe(afterOrbit.yaw)
  })

  // Scenario: Zoom keys zoom the camera
  it('Scenario: Zoom keys zoom the camera', async () => {
    await stage()
    const before = cameraOf()
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(cameraOf().distance).toBeLessThan(before.distance)
    await userEvent.click(screen.getByTestId('camera-zoom-out'))
    await userEvent.click(screen.getByTestId('camera-zoom-out'))
    expect(cameraOf().distance).toBeGreaterThan(before.distance)
  })

  // Scenario: A focused camera control shows a focus indicator
  it('Scenario: A focused camera control shows a focus indicator', async () => {
    await stage()
    const zoom = screen.getByTestId('camera-zoom-in')
    zoom.focus()
    expect(document.activeElement).toBe(zoom)
    expect(zoom.className).toMatch(/focus[-:]/)
  })

  // Scenario: Keyboard input at a clamp is distinguishable from no input.
  // NEW DRIVER (impl contract §10.4 line 278, §10.3): the pan axis's
  // at-limit state moved OFF the deleted `camera-pan-*` buttons and onto
  // `camera-orbit`'s own `data-pan-at-limit` attribute (a space-separated
  // set of blocked directions), asserted here WHILE the camera is ALSO at
  // its zoom clamp — the regression guard for why pan's at-limit state was
  // deliberately NOT routed through `camera-limit-status` (a single-slot
  // priority chain, zoom > pan > orbit, which would report only zoom and
  // mask pan's own clamp entirely).
  it('Scenario: Keyboard input at a clamp is distinguishable from no input', async () => {
    await stage()
    const orbit = screen.getByTestId('camera-orbit')
    const status = screen.getByTestId('camera-limit-status')
    orbit.focus()
    // Away from any clamp: no at-limit state anywhere.
    await userEvent.keyboard('{ArrowRight}')
    expect(status.textContent?.trim() ?? '').toBe('')
    expect(orbit).not.toHaveAttribute('data-orbit-at-limit')
    expect(orbit).not.toHaveAttribute('data-pan-at-limit')

    // Drive to the zoom clamp (the on-screen zoom buttons are unchanged by
    // the shrink).
    for (let i = 0; i < 200; i++) fireEvent.click(screen.getByTestId('camera-zoom-in'))
    await waitFor(() => expect(status.textContent?.trim() ?? '').not.toBe(''))
    expect(screen.getByTestId('camera-zoom-in')).toHaveAttribute('data-at-limit', 'true')

    // The PAN axis, separately, on camera-orbit's own attribute — driven
    // WHILE the zoom clamp is still engaged.
    for (let i = 0; i < 500; i++) fireEvent.keyDown(orbit, { key: 'ArrowRight', shiftKey: true })
    await waitFor(() => expect(orbit.getAttribute('data-pan-at-limit') ?? '').toMatch(/\bright\b/))
    // ...and the opposite direction is NOT at limit, so a blanket flag fails.
    expect(orbit.getAttribute('data-pan-at-limit') ?? '').not.toMatch(/\bleft\b/)
  })

  // Scenario: A pan limit is still observable while the camera is also at
  // the zoom clamp (system-space-view MODIFIED "Space View Camera Is
  // Keyboard-Operable" — a scenario NEW to this change). Same drive as
  // above; the point of THIS test is asserting `camera-limit-status` still
  // reports only the zoom clamp (the priority chain's own documented
  // behaviour) at the exact moment `data-pan-at-limit` independently proves
  // the pan clamp — the two surfaces disagreeing on purpose is what makes
  // this the regression guard for RULING 23's routing decision.
  it('Scenario: A pan limit is still observable while the camera is also at the zoom clamp', async () => {
    await stage()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    for (let i = 0; i < 200; i++) fireEvent.click(screen.getByTestId('camera-zoom-in'))
    await waitFor(() => expect(screen.getByTestId('camera-zoom-in')).toHaveAttribute('data-at-limit', 'true'))
    // The single-slot priority chain reports ONLY zoom right now.
    expect(screen.getByTestId('camera-limit-status').textContent?.trim() ?? '').not.toBe('')

    for (let i = 0; i < 500; i++) fireEvent.keyDown(orbit, { key: 'ArrowRight', shiftKey: true })
    await waitFor(() => expect(orbit.getAttribute('data-pan-at-limit') ?? '').toMatch(/\bright\b/))
    expect(orbit.getAttribute('data-pan-at-limit') ?? '').not.toMatch(/\bleft\b/)
    // The priority-chain live region is UNCHANGED by this change (RULING
    // 23) — it still names the zoom clamp, not pan. This is what "masked"
    // means, and why data-pan-at-limit exists at all.
    expect(screen.getByTestId('camera-limit-status').textContent?.trim() ?? '').not.toBe('')
  })

  // Scenario: The camera group's accessible description names the pan
  // binding (system-space-view MODIFIED "Space View Camera Is
  // Keyboard-Operable" — NEW: deleting four labelled buttons removes where
  // a screen-reader user learned pan existed at all; RULING 23's UX half).
  it('Scenario: The camera group\'s accessible description names the pan binding', async () => {
    await stage()
    const orbit = screen.getByTestId('camera-orbit')
    const label = orbit.getAttribute('aria-label') ?? ''
    const describedBy = orbit.getAttribute('aria-describedby')
    const description = describedBy ? (document.getElementById(describedBy)?.textContent ?? '') : ''
    const accessibleText = `${label} ${description}`
    expect(accessibleText, 'the binding must name the modifier key').toMatch(/shift/i)
    expect(accessibleText, 'the binding must name what it does (pan/arrow)').toMatch(/pan|arrow/i)
  })

  // Scenario: The on-screen cluster renders exactly four camera cells (impl
  // contract §10.1, done-conditions §16: "space-camera-controls has exactly
  // four element children, and select-pan-target-point is not one of them
  // and carries CAMERA_CONTROL_ATTR itself").
  it('Scenario: The on-screen cluster renders exactly four camera cells', async () => {
    await stage()
    const cluster = screen.getByTestId('space-camera-controls')
    expect(cluster.children).toHaveLength(4)
    expect(screen.getByTestId('camera-orbit')).toBeInTheDocument()
    expect(screen.getByTestId('camera-zoom-in')).toBeInTheDocument()
    expect(screen.getByTestId('camera-zoom-out')).toBeInTheDocument()
    expect(screen.getByTestId('camera-recenter')).toBeInTheDocument()
    for (const id of ['camera-orbit-left', 'camera-orbit-right', 'camera-orbit-up', 'camera-orbit-down', 'camera-pan-left', 'camera-pan-right', 'camera-pan-up', 'camera-pan-down']) {
      expect(screen.queryByTestId(id), `${id} must be deleted`).toBeNull()
    }
    // select-pan-target-point is NOT one of the four cluster cells, and
    // still carries the attribute that keeps it out of canvas-pick
    // suppression's blind spot (SpaceStage.tsx:252).
    expect(cluster.contains(screen.getByTestId('select-pan-target-point'))).toBe(false)
    expect(screen.getByTestId('select-pan-target-point').getAttribute('data-space-camera-control')).not.toBeNull()
  })

  // Scenario: Focus moving to an off-screen glyph brings it into view
  it('Scenario: Focus moving to an off-screen glyph brings it into view', async () => {
    await stage()
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
  // Scenario: Recenter restores default framing on demand. NEW DRIVER
  // (impl contract §10.4 line 316): Shift+arrow on camera-orbit.
  it('Scenario: Recenter restores default framing on demand', async () => {
    await stage()
    expect(region().getAttribute('data-camera')).not.toBeNull()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(JSON.parse(region().getAttribute('data-camera')!)).not.toEqual(before)
    await userEvent.click(screen.getByTestId('camera-recenter'))
    expect(JSON.parse(region().getAttribute('data-camera')!)).toEqual(before)
    expect(region()).toHaveAttribute('data-reframe-animated', 'false')
  })

  // Scenario: Recenter is reachable from the keyboard. NEW DRIVER (impl
  // contract §10.4 line 329): Shift+arrow on camera-orbit.
  it('Scenario: Recenter is reachable from the keyboard', async () => {
    await stage()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    const moved = JSON.parse(region().getAttribute('data-camera')!)
    const recenter = screen.getByTestId('camera-recenter')
    recenter.focus()
    await userEvent.keyboard('{Enter}')
    expect(JSON.parse(region().getAttribute('data-camera')!)).not.toEqual(moved)
  })

  // Scenario: Recentering while already at default framing is a no-op
  it('Scenario: Recentering while already at default framing is a no-op', async () => {
    await stage({ selection: { bodyId: 'feat-body-0' } })
    const before = region().getAttribute('data-camera')
    expect(before).not.toBeNull()
    onSelect.mockClear()
    await userEvent.click(screen.getByTestId('camera-recenter'))
    expect(region().getAttribute('data-camera')).toBe(before)
    expect(region()).toHaveAttribute('data-selection', 'feat-body-0')
    expect(onSelect, 'recentering must not touch the selection').not.toHaveBeenCalled()
  })

  // Scenario: Activating a camera control does not change the selection.
  // NEW DRIVER (impl contract §10.4 line 352): iterate the four SURVIVING
  // cells by click, plus a Shift+arrow press on camera-orbit (the pan input
  // the deleted buttons used to exercise).
  it('Scenario: Activating a camera control does not change the selection', async () => {
    await stage({ selection: { bodyId: 'feat-body-0' } })
    onSelect.mockClear()
    for (const id of ['camera-recenter', 'camera-zoom-in', 'camera-zoom-out', 'camera-orbit']) {
      await userEvent.click(screen.getByTestId(id))
    }
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(region()).toHaveAttribute('data-selection', 'feat-body-0')
  })

  // Scenario: Camera state survives a selection change and a realtime
  // refetch. NEW DRIVER (impl contract §10.4 line 364): Shift+arrow on
  // camera-orbit, replacing the deleted camera-pan-right button.
  it('Scenario: Camera state survives a selection change and a realtime refetch', async () => {
    const { rerender } = await stage()
    const initial = region().getAttribute('data-camera')
    expect(initial, 'the stage must expose its camera state to be asserted on at all').not.toBeNull()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    const moved = region().getAttribute('data-camera')
    expect(moved, 'the camera must actually have moved before "it survives" means anything').not.toBe(
      initial,
    )

    // (a) a selection change
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_-7_17" scene={scene as any} extent={EXTENT} worldTime={1} scale={1} selection={{ bodyId: 'feat-body-1' }} onSelect={onSelect} frameSource={null} />,
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
      <SpaceStage systemId="sys_-7_17" scene={moved2 as any} extent={EXTENT} worldTime={2} scale={1} selection={{ bodyId: 'feat-body-1' }} onSelect={onSelect} frameSource={null} />,
    )
    expect(region().getAttribute('data-camera')).toBe(moved)
  })

  // Scenario: Camera resets when the system changes. NEW DRIVER (impl
  // contract §10.4 line 397): Shift+arrow on camera-orbit.
  it('Scenario: Camera resets when the system changes', async () => {
    const { rerender } = await stage()
    const initial = region().getAttribute('data-camera')
    expect(initial).not.toBeNull()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(region().getAttribute('data-camera')).not.toBe(initial)
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="sys_OTHER" scene={scene as any} extent={EXTENT} worldTime={1} scale={1} selection={null} onSelect={onSelect} frameSource={null} />,
    )
    expect(region().getAttribute('data-camera')).toBe(initial)
    expect(region()).toHaveAttribute('data-reframe-animated', 'false')
  })
})

describe('SpaceStage — off-screen reach', () => {
  // Scenario: An off-screen lane gate is selectable by pointer
  it('Scenario: An off-screen lane gate is selectable by pointer', async () => {
    await stage()
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
    await stage()
    const aff = screen.getByTestId('offscreen-gate-sys_-7_18')
    fireEvent.pointerDown(aff, { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10, button: 0 })
    fireEvent.touchStart(aff, { touches: [{ target: aff, clientX: 10, clientY: 10 }] })
    fireEvent.pointerUp(aff, { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10, button: 0 })
    fireEvent.touchEnd(aff, { touches: [], changedTouches: [{ target: aff, clientX: 10, clientY: 10 }] })
    await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith({ bodyId: 'gate-sys_-7_18' }))
  })

  // Scenario: The affordance covers only off-screen marks
  it('Scenario: The affordance covers only off-screen marks', async () => {
    await stage()
    // The inner planet is inside the default framing.
    expect(screen.queryByTestId('offscreen-feat-body-0')).toBeNull()
    // The far gates are not.
    expect(screen.getByTestId('offscreen-gate-sys_-6_16')).toBeInTheDocument()
    expect(screen.getByTestId('offscreen-gate-sys_-7_18')).toBeInTheDocument()
  })

  // Scenario: An off-screen selection is indistinguishable from a direct one
  it('Scenario: An off-screen selection is indistinguishable from a direct one', async () => {
    await stage()
    await userEvent.click(screen.getByTestId('offscreen-gate-sys_-6_16'))
    const viaAffordance = onSelect.mock.calls.at(-1)![0]

    onSelect.mockClear()
    // Now the same gate through its ordinary hit target.
    screen.getByTestId('body-hit-gate-sys_-6_16').focus()
    await userEvent.keyboard('{Enter}')
    const direct = onSelect.mock.calls.at(-1)![0]

    expect(viaAffordance).toEqual(direct)
  })

  // Scenario: An off-screen body is selectable the same way. NEW DRIVER
  // (impl contract §10.4 line 461): 200 Shift+ArrowRight key presses on
  // camera-orbit, replacing 200 clicks on the deleted camera-pan-right
  // button.
  it('Scenario: An off-screen body is selectable the same way', async () => {
    // Zoom right in and pan away so a normally-visible body goes off screen.
    await stage()
    for (let i = 0; i < 200; i++) fireEvent.click(screen.getByTestId('camera-zoom-in'))
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    for (let i = 0; i < 200; i++) fireEvent.keyDown(orbit, { key: 'ArrowRight', shiftKey: true })
    await waitFor(() => expect(screen.queryByTestId('offscreen-feat-body-1')).not.toBeNull())
    await userEvent.click(screen.getByTestId('offscreen-feat-body-1'))
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-1' })
  })
})

describe('SpaceStage — pointer picking through the DOM', () => {
  // Scenario: A gesture that begins over a mark still moves the camera
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

    // A wheel gesture with the pointer over a mark zooms, too — never
    // dead-zoned merely because it began over a mark.
    const cam = region().getAttribute('data-camera')
    fireEvent.wheel(hit, { deltaY: -100 })
    expect(region().getAttribute('data-camera')).not.toBe(cam)
  })

  // Scenario: A sub-threshold pointer press-release still resolves as a click
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
  // Scenario: Picking survives camera movement. NEW DRIVER (impl contract
  // §10.4 line 513): Shift+arrow pans, a bare arrow orbits — both on the
  // one surviving camera-orbit cell.
  it('Scenario: Picking survives camera movement', async () => {
    await stage()
    // Move the camera well away from the default framing on all three axes.
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await userEvent.click(screen.getByTestId('camera-zoom-in'))
    orbit.focus()
    await userEvent.keyboard('{ArrowRight}')
    onSelect.mockClear()

    // Click the mark at its CURRENTLY DRAWN position — the hit target must
    // have followed the mark, not stayed where it was framed at start.
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, { clientX: 300, clientY: 300, button: 0, pointerId: 9 })
    fireEvent.pointerUp(hit, { clientX: 300, clientY: 300, pointerId: 9 })
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
  })

  // Scenario: A point-in-space click resolves correctly after camera
  // movement. NEW DRIVER (impl contract §10.4 line 530): Shift+ArrowRight
  // pans, bare ArrowUp orbits — both on camera-orbit.
  it('Scenario: A point-in-space click resolves correctly after camera movement', async () => {
    await stage()
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await userEvent.keyboard('{ArrowUp}')
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
  // NEW DRIVER (impl contract §10.4 line 545): Shift+ArrowRight pans, a
  // bare ArrowRight orbits — both on camera-orbit.
  it('Scenario: A click beyond the pick radius still clears the selection after camera movement', async () => {
    await stage({ selection: { bodyId: 'feat-body-0' } })
    const orbit = screen.getByTestId('camera-orbit')
    orbit.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    for (let i = 0; i < 12; i++) await userEvent.click(screen.getByTestId('camera-zoom-out'))
    orbit.focus()
    await userEvent.keyboard('{ArrowRight}')
    onSelect.mockClear()
    // The far corner of a well zoomed-out view lies beyond the maximum pick
    // radius — a configured multiple of the served `extent`.
    fireEvent.pointerDown(region(), { clientX: 2, clientY: 2, button: 0, pointerId: 11 })
    fireEvent.pointerUp(region(), { clientX: 2, clientY: 2, pointerId: 11 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

it('offers discrete phone pan controls without changing selection', async () => {
  const previousMedia = window.matchMedia
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  try {
    await stage()
    fireEvent.click(screen.getByRole('button', { name: 'Pan controls' }))
    const before = JSON.parse(region().getAttribute('data-camera')!)
    fireEvent.click(screen.getByRole('button', { name: 'Pan right' }))
    expect(JSON.parse(region().getAttribute('data-camera')!).target).not.toEqual(before.target)
    expect(onSelect).not.toHaveBeenCalled()
  } finally { window.matchMedia = previousMedia }
})

describe('SpaceStage — touch pointer input', () => {
  const touch = (id: number, x: number, y: number) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y })
  it('pans with one finger, preserves viewing angle and does not select after a drag', async () => {
    await stage()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    fireEvent.pointerDown(region(), touch(1, 400, 400))
    fireEvent.pointerMove(region(), touch(1, 470, 430))
    fireEvent.pointerUp(region(), touch(1, 470, 430))
    const after = JSON.parse(region().getAttribute('data-camera')!)
    expect(after.target).not.toEqual(before.target)
    expect(after.yaw).toBe(before.yaw)
    expect(after.distance).toBe(before.distance)
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('selects a body exactly once on a stationary touch pointer release', async () => {
    await stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, touch(1, 300, 300))
    fireEvent.pointerMove(hit, touch(1, 302, 301))
    fireEvent.pointerUp(hit, touch(1, 302, 301))
    // Browsers also emit legacy touch events; they must not double-process it.
    fireEvent.touchEnd(hit, { changedTouches: [{ clientX: 302, clientY: 301 }] })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ bodyId: 'feat-body-0' })
  })
  it('does not select when a quick drag releases beyond the threshold without an intermediate move', async () => {
    await stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, touch(1, 300, 300))
    fireEvent.pointerUp(region(), touch(1, 340, 300))
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('pinches without orbiting or selecting, including staggered finger release', async () => {
    await stage()
    const before = JSON.parse(region().getAttribute('data-camera')!)
    fireEvent.pointerDown(region(), touch(1, 200, 400))
    fireEvent.pointerDown(region(), touch(2, 300, 400))
    fireEvent.pointerMove(region(), touch(2, 380, 400))
    const after = JSON.parse(region().getAttribute('data-camera')!)
    expect(after.distance).toBeLessThan(before.distance)
    expect(after.yaw).toBe(before.yaw)
    fireEvent.pointerUp(region(), touch(2, 380, 400))
    fireEvent.pointerMove(region(), touch(1, 210, 410))
    fireEvent.pointerUp(region(), touch(1, 210, 410))
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('cancels a contact cleanly and accepts a fresh tap after cancellation or lost capture', async () => {
    await stage()
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.pointerDown(hit, touch(1, 300, 300))
    fireEvent.pointerCancel(region(), touch(1, 300, 300))
    fireEvent.pointerUp(region(), touch(1, 300, 300))
    fireEvent.pointerDown(hit, touch(2, 300, 300))
    fireEvent.lostPointerCapture(region(), touch(2, 300, 300))
    fireEvent.pointerUp(region(), touch(2, 300, 300))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.pointerDown(hit, touch(3, 300, 300))
    fireEvent.pointerUp(region(), touch(3, 300, 300))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ bodyId: 'feat-body-0' })
  })
})

describe('SpaceStage — a contact\'s served velocity is displayed', () => {
  // Scenario: A contact's served velocity is displayed, not integrated
  it('Scenario: A contact\'s served velocity is displayed, not integrated', async () => {
    // The wire's `velocity` would otherwise ship served-and-unread. Its ONE
    // named consumer is a heading-and-speed readout on the hovered (or
    // selected) contact's facts surface — never a client-side integration
    // that would place the contact at a point the server never disclosed.
    await stage()
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
