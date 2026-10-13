import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { stubUnsupported } from '@/components/render-guard/test-canvas'
import { loseContext, restoreContext } from '@/components/render-guard/test-canvas'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`: *Renderer Unavailability Is an Explicit
// State*, *Lost Rendering Context Recovers Without Navigation*, *Renderer
// Unavailability States Are Accessible*, *Camera Controls Are Inert While
// the Space View Is Unavailable* (tasks.md 6.1-6.6, 5.7).
//
// SCOPE NOTE — WHAT THIS FILE DOES AND DOES NOT COVER.
// `components/render-guard/` is an EXISTING, already-tested shared module
// (guard machine, probe, retry, listener lifecycle, failure recording,
// `RendererStateNotice`, `CanvasRegionBoundary`). The space view REUSES it —
// it does not rebuild it. So the guard's own internal guarantees (retry
// releases prior resources, a second loss is a no-op, failures are recorded
// distinguishably by cause, no more than one live context) stay covered by
// `components/render-guard/*.test.*`, which this change does not touch.
//
// What is NEW, and what this file covers, is the SPACE VIEW'S WIRING of it:
// which of this view's surfaces survive, which controls go inert, how it
// interacts with the two data reads, and the a11y transition.
//
// THE CONTRACT:
//   components/space/SpaceCanvas.tsx  -- the guarded canvas region for this
//       view, over `useRenderGuard({ canvas, surface: 'space' })`, emitting
//       data-testid="space-canvas-region" / "space-canvas" and the shared
//       renderer-unsupported / renderer-interrupted / renderer-retry notices.
//   components/space/SpaceStage.tsx   -- mounts SpaceCanvas + the camera
//       controls + the hit-target layer, and reports availability upward.
//
//   export interface SpaceStageProps {
//     systemId: string
//     scene: SceneModel
//     extent: number
//     worldTime: number
//     selection: SpaceSelection | null
//     onSelect?: (s: SpaceSelection | null) => void
//     onAvailabilityChange?: (available: boolean) => void
//     onFirstFrame?: () => void
//   }
//
// VACUITY NOTE: `stubUnsupported()` genuinely makes context creation fail, so
// the unsupported assertions cannot pass in the default (available) world —
// each block also asserts the POSITIVE case, so a component that always
// showed the unsupported notice fails too.

const scene = {
  marks: [
    { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5.2, pickable: false, selected: false },
    { id: 'feat-body-0', kind: 'body', position: { x: 18, y: -3, z: -15 }, radius: 1.7, pickable: true, selected: false },
    { id: 'gate-sys_-6_16', kind: 'gate', position: { x: 694, y: 0, z: -207 }, radius: 1.2, pickable: true, selected: false },
  ],
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

async function readyCanvas() {
  await waitFor(() => expect(screen.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true'))
  return screen.getByTestId('space-canvas') as HTMLCanvasElement
}

function stage(over: Record<string, unknown> = {}) {
  return render(

    <SpaceStage
      systemId="sys_-7_17"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scene={scene as any}
      extent={658.7081316032265}
      worldTime={1}
      selection={null}
      // SDET repair (add-figure-formatting build adjudications, dispute 2):
      // `scale` restored to a required key. This file exercises the render
      // guard, not a figure, so an explicit scale-less mount is the correct
      // choice — no scenario here renders a scale-dependent figure.
      scale={undefined}
      // fix-world-time-render-loop, task 4.7 migration: static-scene mode —
      // this file exercises the render guard, not the frame loop.
      frameSource={null}
      {...over}
    />,
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
})

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  vi.restoreAllMocks()
})

describe('SpaceStage — the unsupported state', () => {
  // Scenario: Context creation failure shows a named unsupported state
  it('Scenario: Context creation failure shows a named unsupported state', async () => {
    restore = stubUnsupported()
    stage()
    const notice = await screen.findByTestId('renderer-unsupported')
    const text = notice.textContent ?? ''
    // Scenario: The displayed cause is a user-actionable category, not raw
    // diagnostic text
    expect(text.toLowerCase()).toMatch(/webgl|graphics|browser/)
    expect(text, 'no raw exception text').not.toMatch(/Error:|at .+\(.+:\d+:\d+\)/)
    expect(text, 'no GPU vendor/model string').not.toMatch(
      /NVIDIA|AMD|Intel\(R\)|Radeon|GeForce|Apple M\d/,
    )
  })

  it('SDET-added: in the default (available) world no unsupported notice is shown', async () => {
    stage()
    await readyCanvas()
    expect(screen.queryByTestId('renderer-unsupported')).toBeNull()
    expect(screen.getByTestId('space-canvas-region')).toBeInTheDocument()
  })

  // Scenario: The system space view container remains present
  it('Scenario: The system space view container remains present', async () => {
    restore = stubUnsupported()
    stage()
    await screen.findByTestId('renderer-unsupported')
    expect(screen.getByTestId('space-canvas-region')).toBeInTheDocument()
  })

  // Scenario: The unsupported state offers a retry affordance
  it('Scenario: The unsupported state offers a retry affordance', async () => {
    restore = stubUnsupported()
    stage()
    const retry = await screen.findByTestId('renderer-retry')
    await userEvent.click(retry)
    // A failed attempt keeps the state, retriable again.
    await waitFor(() => expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument())
    expect(screen.getByTestId('renderer-retry')).toBeInTheDocument()
  })

  // Scenario: The retry affordance prevents duplicate concurrent attempts
  it('Scenario: The retry affordance prevents duplicate concurrent attempts', async () => {
    restore = stubUnsupported()
    stage()
    const retry = await screen.findByTestId('renderer-retry')
    // Fire twice in one synchronous block — no awaited step between them,
    // the same shape the double-submit guards are held to.
    fireEvent.click(retry)
    expect(
      (retry as HTMLButtonElement).disabled || retry.getAttribute('aria-disabled') === 'true',
      'the retry must go disabled and show progress until the attempt resolves',
    ).toBe(true)
  })

  // Scenario: An unexpected rendering error is contained to the canvas region
  it('Scenario: An unexpected rendering error is contained to the canvas region', () => {
    // VACUITY NOTE, and why the throw is planted THIS way. An earlier draft
    // injected a `<Boom/>` child through a cast; the stage has no children
    // prop, so nothing ever threw and the test passed against a component
    // with no boundary at all — a tautology, caught in the scratch-copy
    // verification. Instead the SCENE ITSELF throws the moment its `marks`
    // are read. Every implementation of this stage must read `scene.marks`
    // to draw anything, so the throw is unavoidable for real code, and it
    // happens DURING RENDER, which is what a React error boundary catches.
    const poisoned = {
      ...scene,
      get marks(): never {
        throw new Error('space render boom')
      },
    }
    render(
      <div data-testid="harness">
        <aside data-testid="sibling-panel">still here</aside>
        { }
        <SpaceStage
          systemId="sys_-7_17"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scene={poisoned as any}
          extent={658.7081316032265}
          worldTime={1}
          selection={null}
          scale={undefined}
          frameSource={null}
        />
      </div>,
    )
    // The error is contained: the sibling panel and the container survive,
    // and the canvas region shows its own error presentation rather than
    // taking the tree down.
    expect(screen.getByTestId('sibling-panel')).toBeInTheDocument()
    expect(screen.getByTestId('harness')).toBeInTheDocument()
    expect(
      screen.queryByTestId('renderer-unsupported') ?? screen.queryByTestId('renderer-interrupted'),
      'the canvas region must present the failure rather than rendering nothing',
    ).not.toBeNull()
  })
})

describe('SpaceStage — the interrupted state', () => {
  // Scenario: Context loss shows an interrupted state without an uncaught
  // error
  it('Scenario: Context loss shows an interrupted state without an uncaught error', async () => {
    stage()
    const canvas = await readyCanvas()
    loseContext(canvas as HTMLCanvasElement)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    // ...and the canvas element itself stays mounted, so the restore
    // listener has something to fire on.
    expect(screen.getByTestId('space-canvas')).toBeInTheDocument()
  })

  // Scenario: A restored context resumes without navigation
  it('Scenario: A restored context resumes without navigation', async () => {
    stage()
    const canvas = await readyCanvas()
    loseContext(canvas)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    restoreContext(canvas)
    await waitFor(() => expect(screen.queryByTestId('renderer-interrupted')).toBeNull())
  })

  // Scenario: A restored context's first frame reflects live state, not a
  // stale one
  it('Scenario: A restored context\'s first frame reflects live state, not a stale one', async () => {
    const onFirstFrame = vi.fn()
    const { rerender } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="s" scene={scene as any} extent={1} worldTime={100} selection={null} onFirstFrame={onFirstFrame} scale={undefined} frameSource={null} />,
    )
    const canvas = await readyCanvas()
    loseContext(canvas)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    onFirstFrame.mockClear()
    // World time has moved on while the context was gone.
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SpaceStage systemId="s" scene={scene as any} extent={1} worldTime={999_999} selection={null} onFirstFrame={onFirstFrame} scale={undefined} frameSource={null} />,
    )
    restoreContext(canvas)
    // The redraw after restore is invoked with the POST-restore world time —
    // asserted through the stage's own exposed draw stamp rather than a
    // bitmap.
    await waitFor(() =>
      expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-draw-world-time', '999999'),
    )
  })

  // Scenario: In-flight selection and typed input survive a context loss
  it('Scenario: In-flight selection and typed input survive a context loss', async () => {
    function Harness() {
      const [text, setText] = React.useState('')
      return (
        <div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SpaceStage systemId="s" scene={scene as any} extent={1} worldTime={1} selection={{ bodyId: 'feat-body-0' }} scale={undefined} frameSource={null} />
          <input data-testid="panel-input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )
    }
    render(<Harness />)
    await userEvent.type(screen.getByTestId('panel-input'), '12')
    const canvas = await readyCanvas()
    loseContext(canvas)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    expect((screen.getByTestId('panel-input') as HTMLInputElement).value).toBe('12')
    // The selection is still held by the view — asserted through the stage's
    // own reported selection, which survives the interruption.
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'feat-body-0')
  })
})

describe('SpaceStage — camera controls are inert while unavailable', () => {
  // Scenario: Camera controls are absent while the space view is unavailable
  it('Scenario: Camera controls are absent while the space view is unavailable', async () => {
    // First the positive case, so "never render camera controls" fails.
    stage()
    await readyCanvas()
    expect(screen.getByTestId('space-camera-controls')).toBeInTheDocument()
    expect(screen.getByTestId('camera-recenter')).toBeInTheDocument()

    restore = stubUnsupported()
    const { unmount } = stage()
    await screen.findByTestId('renderer-unsupported')
    expect(screen.queryAllByTestId('space-camera-controls')).toHaveLength(1) // only the first (available) render's
    unmount()
  })

  it('SDET-added: with the canvas unavailable, no camera control is in the tab order', async () => {
    restore = stubUnsupported()
    stage()
    await screen.findByTestId('renderer-unsupported')
    expect(screen.queryByTestId('space-camera-controls')).toBeNull()
    expect(screen.queryByTestId('camera-recenter')).toBeNull()
    expect(screen.queryByTestId('camera-zoom-in')).toBeNull()
    expect(screen.queryByTestId('select-pan-target-point')).toBeNull()
  })

  it('SDET-added: a wheel gesture over the unavailable region is not suppressed', async () => {
    restore = stubUnsupported()
    stage()
    const region = await screen.findByTestId('space-canvas-region')
    const ev = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    region.dispatchEvent(ev)
    expect(ev.defaultPrevented, 'the page must scroll normally over a dead canvas').toBe(false)
  })
})

describe('SpaceStage — the unavailable states are accessible', () => {
  // Scenario: The state change is announced to assistive technology
  it('Scenario: The state change is announced to assistive technology', async () => {
    restore = stubUnsupported()
    stage()
    await screen.findByTestId('renderer-unsupported')
    const live = screen.getByTestId('renderer-live-region')
    expect(live).toHaveAttribute('aria-live')
    expect((live.textContent ?? '').toLowerCase()).toMatch(/webgl|graphics|browser/)
  })

  // Scenario: The retry affordance is keyboard-operable
  it('Scenario: The retry affordance is keyboard-operable', async () => {
    restore = stubUnsupported()
    stage()
    const retry = await screen.findByTestId('renderer-retry')
    retry.focus()
    expect(document.activeElement).toBe(retry)
    // Enter and Space both activate a native button; asserting the element
    // IS a button is the honest, non-tautological check here.
    expect(retry.tagName.toLowerCase()).toBe('button')
    expect(retry.getAttribute('tabindex')).not.toBe('-1')
  })

  // Scenario: Focus does not get lost when the canvas region changes under
  // the player
  it('Scenario: Focus does not get lost when the canvas region changes under the player', async () => {
    stage()
    const canvas = await readyCanvas()
    // Put focus on a focusable element INSIDE the canvas region.
    const hit = screen.getByTestId('body-hit-feat-body-0')
    hit.focus()
    expect(document.activeElement).toBe(hit)

    loseContext(canvas)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    await waitFor(() => {
      expect(document.activeElement, 'focus must never be dropped to the document body').not.toBe(
        document.body,
      )
    })
    expect(document.activeElement).toBe(screen.getByTestId('renderer-retry'))
  })
})

describe('SpaceStage — the shared render guard is actually wired to this view', () => {
  // THE POINT OF THIS BLOCK. `components/render-guard/*.test.*` already
  // covers the guard machine's own behaviour by name — never-restores,
  // retry-releases-resources, retry-fails-again, duplicate-attempt
  // prevention, second-loss no-op, and distinguishable failure recording.
  // Those tests pass whether or not THIS view mounts the guard at all: that
  // is the chain's "built and never called" shape, five times recorded. So
  // the space view's own coverage of those scenarios rests on proving the
  // wiring, which is what these assertions do.

  it('SDET-added: the notice renders under this view\'s OWN surface identity', async () => {
    restore = stubUnsupported()
    stage()
    const notice = await screen.findByTestId('renderer-unsupported')
    // `RendererStateNotice` emits `data-surface`; `useRenderGuard`'s
    // `surface` option is typed `'board' | 'galaxy'` today and must be
    // widened to include `'space'`. A space view that reused `'board'` would
    // mis-attribute every recorded renderer failure to the deleted view.
    expect(notice.closest('[data-surface]')?.getAttribute('data-surface')).toBe('space')
  })

  // Scenario: A context that never restores keeps the interrupted state with
  // a retry affordance
  it('Scenario: A context that never restores keeps the interrupted state with a retry affordance', async () => {
    stage()
    const canvas = await readyCanvas()
    loseContext(canvas)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    // No restore event ever arrives.
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument()
    expect(screen.getByTestId('renderer-retry')).toBeInTheDocument()
  })

  // Scenario: Invoking the retry affordance attempts to re-establish the
  // context  +  Scenario: A successful retry resumes the live space view
  it('Scenario: A successful retry resumes the live space view', async () => {
    restore = stubUnsupported()
    stage()
    const retry = await screen.findByTestId('renderer-retry')
    // The world becomes capable again before the retry lands.
    restore()
    restore = null
    await userEvent.click(retry)
    await waitFor(() => expect(screen.queryByTestId('renderer-unsupported')).toBeNull())
    expect(screen.getByTestId('space-canvas-region')).toBeInTheDocument()
  })

  // Scenario: A retry that fails again keeps the interrupted state retriable
  it('Scenario: A retry that fails again keeps the interrupted state retriable', async () => {
    restore = stubUnsupported()
    stage()
    const retry = await screen.findByTestId('renderer-retry')
    await userEvent.click(retry)
    await waitFor(() => expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument())
    expect(screen.getByTestId('renderer-retry')).toBeInTheDocument()
  })

  // Scenario: A second context loss while already interrupted is a no-op
  // state change
  it('Scenario: A second context loss while already interrupted is a no-op state change', async () => {
    stage()
    const canvas = await readyCanvas()
    loseContext(canvas)
    await waitFor(() => expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument())
    loseContext(canvas)
    await waitFor(() => expect(screen.getAllByTestId('renderer-interrupted')).toHaveLength(1))
    expect(screen.getAllByTestId('renderer-interrupted')).toHaveLength(1)
  })

  // Scenario: Renderer failures are recorded distinguishably by cause
  it('Scenario: Renderer failures are recorded distinguishably by cause', async () => {
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a)
    })
    restore = stubUnsupported()
    stage()
    await screen.findByTestId('renderer-unsupported')
    const dump = JSON.stringify(errors)
    expect(dump, 'the cause must be named').toMatch(/creation|init/)
    expect(dump, 'and attributed to this view').toMatch(/space/)
    spy.mockRestore()
  })

  // Scenario: Retrying releases the prior attempt's resources first
  it('Scenario: Retrying releases the prior attempt\'s resources first', async () => {
    // The release-before-recreate ORDER is asserted mechanically in
    // `components/render-guard/use-render-guard.test.tsx`. What this asserts
    // is the space-view-level consequence the requirement names: no more
    // than one live rendering context is held for this canvas at any time —
    // i.e. exactly one canvas element, never a second stacked behind it.
    restore = stubUnsupported()
    stage()
    const retry = await screen.findByTestId('renderer-retry')
    await userEvent.click(retry)
    await waitFor(() => expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument())
    expect(screen.queryAllByTestId('space-canvas').length).toBeLessThanOrEqual(1)
  })
})
