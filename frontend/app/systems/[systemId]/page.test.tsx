import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SystemSpacePage from './page'

// The page is a thin wrapper: it reads the route param and mounts the view.
// SystemSpaceView (four reads + a WebGL stage) is covered by its own suite,
// so stub it — what this file pins is the shell, and only the shell.
vi.mock('next/navigation', () => ({
  useParams: () => ({ systemId: 'sys-7' }),
}))

vi.mock('@/components/space/SystemSpaceView', () => ({
  SystemSpaceView: ({ systemId }: { systemId: string }) => (
    <div data-testid="system-space-view" data-system-id={systemId} />
  ),
}))

describe('SystemSpacePage', () => {
  it('mounts the space view for the route systemId', () => {
    render(<SystemSpacePage />)
    expect(screen.getByTestId('system-space-view')).toHaveAttribute('data-system-id', 'sys-7')
  })
})
