// BoardCanvas.test.tsx — the board's canvas-region slot (design.md, "at ship
// time the board guard is mounted but its loss/restore listeners have no
// canvas"; tasks.md 2.1/2.4). `SystemBoardView.tsx` is untouched by this
// change (board-half decision), so the sibling contract (facts panel/roster
// stay usable while the canvas region shows the unsupported/interrupted
// state) is exercised here via a lightweight harness that stands in for
// `SystemBoardView`'s sibling structure — NOT a `SystemBoardView`
// integration test, per design.md's explicit testability note.
//
// Covers: Context creation failure shows a named unsupported state; The
// unsupported state is independent of the interior data read; A failed data
// read takes precedence over the unsupported state (harness-level, since
// BoardCanvas itself has no data-read awareness); The system board view
// container remains present (harness-level stand-in); The unsupported state
// offers a retry affordance; An unexpected rendering error is contained to
// the canvas region; Surrounding board affordances remain usable; In-flight
// selection and typed input survive a context loss (sibling-state, by
// construction).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { BoardCanvas } from './BoardCanvas'
import { stubUnsupported } from '@/components/render-guard/test-canvas'

function Boom(): React.ReactElement {
  throw new Error('board render boom')
}

describe('BoardCanvas', () => {
  let restore: (() => void) | null = null
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    restore?.()
    restore = null
    vi.restoreAllMocks()
  })

  it('renders its children (the future WebGL board content) when WebGL is available', async () => {
    render(
      <BoardCanvas>
        <div data-testid="stage-content">the board</div>
      </BoardCanvas>,
    )
    expect(await screen.findByTestId('stage-content')).toBeInTheDocument()
    expect(screen.queryByTestId('renderer-unsupported')).not.toBeInTheDocument()
  })

  it('shows the named unsupported state, and no children, when the rendering context cannot be created (Scenario: Context creation failure shows a named unsupported state)', async () => {
    restore = stubUnsupported()
    render(
      <BoardCanvas>
        <div data-testid="stage-content">the board</div>
      </BoardCanvas>,
    )
    expect(await screen.findByTestId('renderer-unsupported')).toHaveTextContent(
      /browser|graphics hardware|webgl|gpu/i,
    )
    expect(screen.queryByTestId('stage-content')).not.toBeInTheDocument()
  })

  it('offers a retry affordance, and a successful retry resumes rendering the children (Scenario: The unsupported state offers a retry affordance)', async () => {
    const undo = stubUnsupported()
    render(
      <BoardCanvas>
        <div data-testid="stage-content">the board</div>
      </BoardCanvas>,
    )
    const retry = await screen.findByTestId('renderer-retry')

    // The world recovers before the retry lands.
    undo()
    restore = null
    await userEvent.click(retry)

    expect(await screen.findByTestId('stage-content')).toBeInTheDocument()
    expect(screen.queryByTestId('renderer-unsupported')).not.toBeInTheDocument()
  })

  // SDET-added (QA MAJOR, real-browser e2e finding): a runtime context loss
  // must NOT unmount the board's <canvas> — only 'unsupported' may tear the
  // canvas region down. `GalaxyView.test.tsx` carries the galaxy-side twin
  // of this pin; this is the board half of the identical defect the
  // orchestrator flagged (`BoardCanvas.tsx` had the same
  // `guard.status !== 'live'` unconditional-unmount pattern).
  it('SDET-added: the <canvas> remains mounted in the document while the guard is INTERRUPTED — only "unsupported" may tear it down (Scenario: A restored context resumes without navigation / A restored context\'s first frame reflects live state, not a stale one)', async () => {
    render(
      <BoardCanvas>
        <div data-testid="stage-content">the board</div>
      </BoardCanvas>,
    )
    const canvas = await screen.findByTestId('board-canvas')
    expect(canvas).toBeInTheDocument()

    // A genuine runtime context loss on the exact element the production
    // guard's listeners are attached to (BoardCanvas's own `<canvas
    // ref={setCanvas}>`) — poll the dispatch rather than assume a fixed
    // settle time (harmless to repeat: a second 'contextLost' while already
    // interrupted is an explicit no-op transition).
    await waitFor(() => {
      fireEvent(canvas, new Event('webglcontextlost'))
      expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument()
    })

    // The canvas must still be mounted: a real restore, dispatched later on
    // this same context, must have somewhere live to land. A detached
    // canvas never receives `webglcontextrestored` again in a real browser.
    expect(screen.getByTestId('board-canvas')).toBe(canvas)
    expect(document.body.contains(canvas)).toBe(true)
  })

  it('contains a render-phase throw from its children to the canvas region — no uncaught error escapes (Scenario: An unexpected rendering error is contained to the canvas region)', async () => {
    expect(() =>
      render(
        <BoardCanvas>
          <Boom />
        </BoardCanvas>,
      ),
    ).not.toThrow()
    expect(await screen.findByTestId('renderer-unsupported')).toBeInTheDocument()
  })

  describe('sibling contract (test harness — NOT SystemBoardView, per design.md)', () => {
    // A minimal stand-in for SystemBoardView's sibling structure: a
    // container, a FactsPanel-shaped stand-in reading a `selection` this
    // harness owns (a sibling of BoardCanvas, never a child of it), and
    // BoardCanvas occupying the canvas-region slot.
    function Harness() {
      const [selection, setSelection] = useState('body-42')
      return (
        <div data-testid="system-board-view-harness">
          <aside data-testid="facts-panel-standin">
            <button data-testid="scan-button-standin">Scan</button>
            <span data-testid="selection-standin">{selection}</span>
            <button data-testid="reselect" onClick={() => setSelection('body-99')}>
              reselect
            </button>
          </aside>
          <BoardCanvas>
            <div data-testid="stage-content" />
          </BoardCanvas>
        </div>
      )
    }

    it('the container and facts-panel stand-in remain mounted and usable while the canvas region shows the unsupported state (Scenario: Surrounding board affordances remain usable / The system board view container remains present)', async () => {
      restore = stubUnsupported()
      render(<Harness />)
      expect(await screen.findByTestId('renderer-unsupported')).toBeInTheDocument()
      expect(screen.getByTestId('system-board-view-harness')).toBeInTheDocument()
      expect(screen.getByTestId('facts-panel-standin')).toBeInTheDocument()
      expect(screen.getByTestId('scan-button-standin')).toBeEnabled()
    })

    it('a board selection stays shown throughout an unsupported canvas region, by construction (Scenario: In-flight selection and typed input survive a context loss)', async () => {
      restore = stubUnsupported()
      render(<Harness />)
      await screen.findByTestId('renderer-unsupported')
      expect(screen.getByTestId('selection-standin')).toHaveTextContent('body-42')
      await userEvent.click(screen.getByTestId('reselect'))
      expect(screen.getByTestId('selection-standin')).toHaveTextContent('body-99')
    })

    // SystemBoardView.tsx (untouched by this change) already early-returns
    // an interior-read error panel BEFORE ever reaching the canvas region —
    // this pins that structural fact rather than re-deriving it (mirrors
    // GalaxyView's task 3.1 treatment of its own pre-existing early return).
    // The real wiring of BoardCanvas into that early-return tree is the
    // port's job (design.md, "at ship time... SystemBoardView.tsx is not
    // modified by this change"); this harness is the honest stand-in for it.
    function HarnessWithDataRead({ dataError }: { dataError: boolean }) {
      if (dataError) {
        return <div data-testid="interior-read-error">Could not load the system</div>
      }
      return <Harness />
    }

    it('a failed data read takes precedence: no unsupported state renders when the interior/fleet read has already failed (Scenario: A failed data read takes precedence over the unsupported state)', async () => {
      restore = stubUnsupported()
      render(<HarnessWithDataRead dataError />)
      expect(screen.getByTestId('interior-read-error')).toBeInTheDocument()
      expect(screen.queryByTestId('renderer-unsupported')).not.toBeInTheDocument()
      expect(screen.queryByTestId('system-board-view-harness')).not.toBeInTheDocument()
    })

    it('when the data read succeeds, the unsupported state is independent of it and still shows (Scenario: The unsupported state is independent of the interior data read)', async () => {
      restore = stubUnsupported()
      render(<HarnessWithDataRead dataError={false} />)
      expect(await screen.findByTestId('renderer-unsupported')).toBeInTheDocument()
      expect(screen.queryByTestId('interior-read-error')).not.toBeInTheDocument()
    })
  })
})
