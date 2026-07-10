import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LayoutWrapper } from './layout-wrapper'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
}))

vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(() => ({
    user: null,
    authLoading: false,
    account: null,
    isLoading: false,
  })),
}))

vi.mock('@/components/app-navigation', () => ({
  AppNavigation: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-navigation">{children}</div>
  ),
}))

import { usePathname } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'

describe('LayoutWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('renders public route children without app shell', () => {
    vi.mocked(usePathname).mockReturnValue('/login')

    render(
      <LayoutWrapper>
        <div data-testid="login-content">Login</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('login-content')).toBeInTheDocument()
    expect(screen.queryByTestId('app-navigation')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated user from a protected route to /login', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: false,
      account: null,
      isLoading: false,
    } as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('renders the home galaxy view bare for logged-out visitors (no redirect)', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: false,
      account: null,
      isLoading: false,
    } as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="galaxy-content">Galaxy</div>
      </LayoutWrapper>
    )

    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByTestId('galaxy-content')).toBeInTheDocument()
    expect(screen.queryByTestId('app-navigation')).not.toBeInTheDocument()
  })

  it('renders the home galaxy view bare for authenticated users too (no shell)', () => {
    // The immersive home is full-bleed in BOTH auth states — the sidebar shell
    // would push the canvas into a panel and break the "window is the canvas" feel.
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="galaxy-content">Galaxy</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('galaxy-content')).toBeInTheDocument()
    expect(screen.queryByTestId('app-navigation')).not.toBeInTheDocument()
  })

  it('renders app shell for authenticated user with account on a protected route', () => {
    vi.mocked(usePathname).mockReturnValue('/settings')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('app-navigation')).toBeInTheDocument()
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('renders nothing while auth is loading on a protected route', () => {
    vi.mocked(usePathname).mockReturnValue('/settings')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: true,
      account: null,
      isLoading: true,
    } as ReturnType<typeof useAccountContext>)

    const { container } = render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(container.firstChild).toBeNull()
  })
})
