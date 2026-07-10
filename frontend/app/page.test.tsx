import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import HomePage from './page'

// The home page is now just a thin wrapper that renders the galaxy view; the
// view itself (three.js) is covered by GalaxyView.test.tsx, so stub it here.
vi.mock('@/components/galaxy/GalaxyView', () => ({
  GalaxyView: () => <div data-testid="galaxy-view" />,
}))

describe('HomePage', () => {
  it('renders the galaxy view as the primary screen', () => {
    render(<HomePage />)
    expect(screen.getByTestId('galaxy-view')).toBeInTheDocument()
  })
})
