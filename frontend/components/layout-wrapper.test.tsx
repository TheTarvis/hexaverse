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

vi.mock('@/components/corporation-provider', () => ({
  // Default: a woken player (has a corp) — the wake gate is inert unless a test
  // opts into needsWake.
  useCorporationContext: vi.fn(() => ({
    corporation: { id: 'corp_1' },
    isLoading: false,
    needsWake: false,
  })),
}))

vi.mock('@/components/wake-up-flow', () => ({
  WakeUpFlow: () => <div data-testid="wake-up-flow">Wake</div>,
}))

vi.mock('@/components/floating-nav', () => ({
  FloatingNav: () => <div data-testid="floating-nav" />,
}))

import { usePathname } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'
import { useCorporationContext } from '@/components/corporation-provider'

describe('LayoutWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: { id: 'corp_1' },
      isLoading: false,
      needsWake: false,
    } as ReturnType<typeof useCorporationContext>)
  })

  it('renders public route children without app shell', () => {
    vi.mocked(usePathname).mockReturnValue('/login')

    render(
      <LayoutWrapper>
        <div data-testid="login-content">Login</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('login-content')).toBeInTheDocument()
    expect(screen.queryByTestId('floating-nav')).not.toBeInTheDocument()
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
    // Logged-out: no floating chrome (nothing to navigate/sign out of).
    expect(screen.queryByTestId('floating-nav')).not.toBeInTheDocument()
  })

  it('renders the authed home galaxy bare with floating chrome (no shell)', () => {
    // The whole app is full-bleed canvas — the floating nav/account card overlays
    // the canvas instead of a sidebar shell.
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
    expect(screen.getByTestId('floating-nav')).toBeInTheDocument()
  })

  it('renders a protected route full-bleed with floating chrome (no sidebar shell)', () => {
    vi.mocked(usePathname).mockReturnValue('/systems/sys-0')
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

    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByTestId('floating-nav')).toBeInTheDocument()
  })

  it('routes a signed-in but corpless account to the wake-up flow (even on home)', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as ReturnType<typeof useAccountContext>)
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: false,
      needsWake: true,
    } as ReturnType<typeof useCorporationContext>)

    render(
      <LayoutWrapper>
        <div data-testid="galaxy-content">Galaxy</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('wake-up-flow')).toBeInTheDocument()
    expect(screen.queryByTestId('galaxy-content')).not.toBeInTheDocument()
  })

  it('holds a blank frame while the corp is still resolving (no galaxy flash)', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as ReturnType<typeof useAccountContext>)
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: true,
      needsWake: false,
    } as ReturnType<typeof useCorporationContext>)

    const { container } = render(
      <LayoutWrapper>
        <div data-testid="galaxy-content">Galaxy</div>
      </LayoutWrapper>
    )

    expect(container.firstChild).toBeNull()
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
