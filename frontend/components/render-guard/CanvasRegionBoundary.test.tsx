// CanvasRegionBoundary.test.tsx — components/error-boundary.tsx's
// `ErrorBoundary` scoped to one canvas region (design.md, task 1.2): catches
// a throw during render/commit (construction thrown synchronously inside the
// guarded subtree's mount effect, or any other React-lifecycle-observable
// throw), renders `fallback` instead, and reports the caught error via
// `onError` — the guard's `reportRenderError`. Retry is a `key` bump on this
// component from the PARENT (design.md composition snippet); bumping `key`
// simply remounts it, which is exercised here via `rerender` with a new key.
//
// Covers (both capabilities): An unexpected rendering error is contained to
// the canvas region.
//
// React logs caught errors to console.error in dev regardless
// (components/error-boundary.tsx's componentDidCatch) — suppressed here
// in-test, per the architect's watch-out; vitest.setup.ts's filter is not
// touched.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CanvasRegionBoundary } from './CanvasRegionBoundary'

function Boom(): React.ReactElement {
  throw new Error('render boom')
}

describe('CanvasRegionBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(
      <CanvasRegionBoundary onError={vi.fn()} fallback={<div data-testid="fallback" />}>
        <div data-testid="ok-child" />
      </CanvasRegionBoundary>,
    )
    expect(screen.getByTestId('ok-child')).toBeInTheDocument()
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
  })

  it('renders the given fallback, not the children, when a child throws during render (Scenario: An unexpected rendering error is contained to the canvas region)', () => {
    render(
      <CanvasRegionBoundary onError={vi.fn()} fallback={<div data-testid="fallback">down</div>}>
        <Boom />
      </CanvasRegionBoundary>,
    )
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('ok-child')).not.toBeInTheDocument()
  })

  it('calls onError with the caught error', () => {
    const onError = vi.fn()
    render(
      <CanvasRegionBoundary onError={onError} fallback={<div data-testid="fallback" />}>
        <Boom />
      </CanvasRegionBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    const [error] = onError.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('render boom')
  })

  it('does not throw out of render — the surrounding tree stays mounted (SDET-added: siblings survive)', () => {
    render(
      <div data-testid="surrounding">
        <div data-testid="sibling">still here</div>
        <CanvasRegionBoundary onError={vi.fn()} fallback={<div data-testid="fallback" />}>
          <Boom />
        </CanvasRegionBoundary>
      </div>,
    )
    expect(screen.getByTestId('surrounding')).toBeInTheDocument()
    expect(screen.getByTestId('sibling')).toBeInTheDocument()
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
  })

  it('a key bump (the parent\'s retry mechanism) remounts fresh, showing children again with no leftover error state', () => {
    const onError = vi.fn()
    let throwing = true
    function MaybeBoom() {
      if (throwing) throw new Error('render boom')
      return <div data-testid="ok-child" />
    }
    const { rerender } = render(
      <CanvasRegionBoundary key={0} onError={onError} fallback={<div data-testid="fallback" />}>
        <MaybeBoom />
      </CanvasRegionBoundary>,
    )
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    // The parent's retry flips the underlying condition AND bumps `key`,
    // remounting the boundary — the composition contract in design.md
    // ("Composition at each surface is identical…").
    throwing = false
    rerender(
      <CanvasRegionBoundary key={1} onError={onError} fallback={<div data-testid="fallback" />}>
        <MaybeBoom />
      </CanvasRegionBoundary>,
    )
    expect(screen.getByTestId('ok-child')).toBeInTheDocument()
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
  })
})
