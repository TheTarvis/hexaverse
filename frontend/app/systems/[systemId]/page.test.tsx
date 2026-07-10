import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SystemBoardPage from './page'

// The page is a thin wrapper: it reads the route param and mounts the view.
// SystemBoardView (React Query + SVG) is covered by its own suite, so stub it.
vi.mock('next/navigation', () => ({
  useParams: () => ({ systemId: 'sys-7' }),
}))

vi.mock('@/components/board/SystemBoardView', () => ({
  SystemBoardView: ({ systemId }: { systemId: string }) => (
    <div data-testid="system-board-view" data-system-id={systemId} />
  ),
}))

describe('SystemBoardPage', () => {
  it('mounts the board view for the route systemId', () => {
    render(<SystemBoardPage />)
    expect(screen.getByTestId('system-board-view')).toHaveAttribute('data-system-id', 'sys-7')
  })
})
