import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppNavigation } from './app-navigation'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={typeof href === 'string' ? href : undefined} {...props}>
      {children}
    </a>
  ),
}))

const mockSignOut = vi.fn()
vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(() => ({
    account: { email: 'travis@example.com' },
    signOut: mockSignOut,
  })),
}))

import { usePathname } from 'next/navigation'

describe('AppNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('renders nav links, account email, and children in main', () => {
    render(
      <AppNavigation>
        <div data-testid="page-content">Content</div>
      </AppNavigation>
    )

    expect(screen.getByTestId('nav-home')).toHaveAttribute('href', '/')
    expect(screen.getByTestId('nav-settings')).toHaveAttribute('href', '/settings')
    expect(screen.getByText('travis@example.com')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('page-content'))
  })

  it('calls signOut when the sign-out button is clicked', () => {
    render(
      <AppNavigation>
        <div>Content</div>
      </AppNavigation>
    )

    fireEvent.click(screen.getByTestId('sign-out-button'))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('highlights the link matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/settings')

    render(
      <AppNavigation>
        <div>Content</div>
      </AppNavigation>
    )

    expect(screen.getByTestId('nav-settings')).toHaveClass('bg-zinc-200')
    expect(screen.getByTestId('nav-home')).not.toHaveClass('bg-zinc-200')
  })

  it('marks a link active for nested routes under its href', () => {
    vi.mocked(usePathname).mockReturnValue('/settings/profile')

    render(
      <AppNavigation>
        <div>Content</div>
      </AppNavigation>
    )

    expect(screen.getByTestId('nav-settings')).toHaveClass('bg-zinc-200')
  })
})
