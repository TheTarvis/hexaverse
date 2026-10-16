// RendererStateNotice.test.tsx — the unsupported/interrupted presentation,
// retry control, live region, and focus move (design.md, pinned testids:
// `renderer-unsupported`, `renderer-interrupted`, `renderer-retry`, plus
// `data-surface="board"|"galaxy"`).
//
// Prop contract (not pinned verbatim by design.md beyond testids/behaviour —
// fixed here, as the SDET, from the requirement text):
//   status: 'unsupported' | 'interrupted'
//   cause: FailureCause | null
//   surface: 'board' | 'galaxy'
//   retrying: boolean
//   onRetry?: () => void            // absent -> no retry control offered
//   claimFocus?: boolean            // true iff focus was inside the canvas
//                                   // region at the moment this notice
//                                   // replaced it (1.8c) — drives the
//                                   // mount-time focus move.
//
// Covers (both capabilities): The displayed cause is a user-actionable
// category, not raw diagnostic text; The unsupported state offers a retry
// affordance; A retry that fails again keeps the interrupted state
// retriable; The retry affordance prevents duplicate concurrent attempts
// (the `retrying` prop's disabled+in-progress rendering); The state change
// is announced to assistive technology; The retry affordance is
// keyboard-operable; Focus does not get lost when the canvas region changes
// under the player.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RendererStateNotice } from './RendererStateNotice'

describe('RendererStateNotice', () => {
  it('names the preview surface with the same pinned renderer notice and retry affordance', () => {
    render(<RendererStateNotice status="unsupported" cause="creation" surface="preview" retrying={false} onRetry={vi.fn()} />)
    expect(screen.getByTestId('renderer-unsupported')).toHaveAttribute('data-surface', 'preview')
    expect(screen.getByTestId('renderer-live-region')).toHaveTextContent('3D preview renderer')
    expect(screen.getByTestId('renderer-retry')).toBeEnabled()
  })

  it('renders the unsupported state with its testid and surface, naming a browser/GPU-capability cause (Scenario: Context creation failure shows a named unsupported state)', () => {
    render(
      <RendererStateNotice
        status="unsupported"
        cause="creation"
        surface="board"
        retrying={false}
      />,
    )
    const notice = screen.getByTestId('renderer-unsupported')
    expect(notice).toHaveAttribute('data-surface', 'board')
    expect(notice).toHaveTextContent(/browser|graphics hardware|webgl|gpu/i)
  })

  it('renders the interrupted state with its own distinct testid', () => {
    render(
      <RendererStateNotice status="interrupted" cause="lost" surface="galaxy" retrying={false} />,
    )
    expect(screen.getByTestId('renderer-interrupted')).toHaveAttribute('data-surface', 'galaxy')
    expect(screen.queryByTestId('renderer-unsupported')).not.toBeInTheDocument()
  })

  it('never displays raw diagnostic text — only the fixed, user-actionable category (Scenario: The displayed cause is a user-actionable category, not raw diagnostic text)', () => {
    render(
      <RendererStateNotice status="unsupported" cause="creation" surface="board" retrying={false} />,
    )
    const text = screen.getByTestId('renderer-unsupported').textContent ?? ''
    // The component receives no raw diagnostic prop at all in this contract
    // (by design — the probe's `detail` is recorded, never displayed), so
    // this also guards against a future prop threading a raw string in.
    expect(text).not.toMatch(/stack|at Object\.|WEBGL_debug_renderer_info|0x[0-9a-f]{4,}/i)
  })

  it('offers a retry affordance as a real button when onRetry is given (Scenario: The unsupported state offers a retry affordance)', async () => {
    const onRetry = vi.fn()
    render(
      <RendererStateNotice
        status="unsupported"
        cause="creation"
        surface="board"
        retrying={false}
        onRetry={onRetry}
      />,
    )
    const retry = screen.getByTestId('renderer-retry')
    expect(retry.tagName).toBe('BUTTON')
    expect(retry).toBeEnabled()
    await userEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry control when onRetry is absent', () => {
    render(<RendererStateNotice status="unsupported" cause="creation" surface="board" retrying={false} />)
    expect(screen.queryByTestId('renderer-retry')).not.toBeInTheDocument()
  })

  it('is disabled and shows an in-progress indication while retrying (Scenario: The retry affordance prevents duplicate concurrent attempts)', () => {
    render(
      <RendererStateNotice
        status="interrupted"
        cause="lost"
        surface="board"
        retrying={true}
        onRetry={vi.fn()}
      />,
    )
    const retry = screen.getByTestId('renderer-retry')
    expect(retry).toBeDisabled()
    expect(retry).toHaveTextContent(/retrying|in progress|…/i)
  })

  it('remains retriable (an enabled button) after a failed attempt (Scenario: A retry that fails again keeps the interrupted state retriable)', () => {
    render(
      <RendererStateNotice
        status="unsupported"
        cause="creation"
        surface="board"
        retrying={false}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByTestId('renderer-retry')).toBeEnabled()
  })

  it('the retry control is keyboard-reachable via Tab and activatable via Enter/Space (Scenario: The retry affordance is keyboard-operable)', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <RendererStateNotice
        status="unsupported"
        cause="creation"
        surface="board"
        retrying={false}
        onRetry={onRetry}
      />,
    )
    await user.tab()
    expect(screen.getByTestId('renderer-retry')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onRetry).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('conveys the state and named cause through a live region, without requiring navigation to find it (Scenario: The state change is announced to assistive technology)', () => {
    const { container } = render(
      <RendererStateNotice status="interrupted" cause="lost" surface="galaxy" retrying={false} />,
    )
    const live = container.querySelector('[aria-live]')
    expect(live).not.toBeNull()
    expect(live).toHaveTextContent(/interrupt|lost|unavailable/i)
  })

  it('moves focus to the retry control when focus was in the canvas region at the moment of transition (Scenario: Focus does not get lost when the canvas region changes under the player)', () => {
    render(
      <RendererStateNotice
        status="unsupported"
        cause="creation"
        surface="board"
        retrying={false}
        onRetry={vi.fn()}
        claimFocus
      />,
    )
    expect(screen.getByTestId('renderer-retry')).toHaveFocus()
  })

  it('moves focus to the explanatory text when no retry control is offered (Scenario: Focus does not get lost when the canvas region changes under the player)', () => {
    render(
      <RendererStateNotice status="unsupported" cause="creation" surface="board" retrying={false} claimFocus />,
    )
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByTestId('renderer-unsupported')).toContainElement(
      document.activeElement as HTMLElement,
    )
  })

  it('does NOT move focus when claimFocus is false — nothing was focused in the canvas region at transition', () => {
    render(
      <RendererStateNotice
        status="unsupported"
        cause="creation"
        surface="board"
        retrying={false}
        onRetry={vi.fn()}
        claimFocus={false}
      />,
    )
    expect(screen.getByTestId('renderer-retry')).not.toHaveFocus()
  })
})
