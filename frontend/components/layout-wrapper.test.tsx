import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    isCreating: false,
    error: null,
    refetchAccount: vi.fn(),
    signOut: vi.fn(),
  })),
}))

vi.mock('@/components/corporation-provider', () => ({
  // Default: a woken player (has a corp) — the wake gate is inert unless a test
  // opts into needsWake.
  useCorporationContext: vi.fn(() => ({
    corporation: { id: 'corp_1' },
    isLoading: false,
    needsWake: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
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
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCorporationContext>)
  })

  it('Scenario: Login renders even for an authenticated user before redirect', () => {
    // A public route must never hold a blank frame waiting on auth — it
    // renders ungated regardless of auth state, including mid-resolution.
    vi.mocked(usePathname).mockReturnValue('/login')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: true,
      account: null,
      isLoading: true,
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="login-content">Login</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('login-content')).toBeInTheDocument()
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
    } as unknown as ReturnType<typeof useAccountContext>)

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
    } as unknown as ReturnType<typeof useAccountContext>)

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
    } as unknown as ReturnType<typeof useAccountContext>)

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
    } as unknown as ReturnType<typeof useAccountContext>)

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
    } as unknown as ReturnType<typeof useAccountContext>)
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: false,
      needsWake: true,
    } as unknown as ReturnType<typeof useCorporationContext>)

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
    } as unknown as ReturnType<typeof useAccountContext>)
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: true,
      needsWake: false,
    } as unknown as ReturnType<typeof useCorporationContext>)

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
    } as unknown as ReturnType<typeof useAccountContext>)

    const { container } = render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(container.firstChild).toBeNull()
  })

  // --- D11: public-route matching is by path segment, not bare string prefix ---

  it('Scenario: A path that merely shares a public-route prefix is still gated (/oauth-admin)', () => {
    vi.mocked(usePathname).mockReturnValue('/oauth-admin')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: false,
      account: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="oauth-admin-content">Admin</div>
      </LayoutWrapper>
    )

    // A route that merely starts with the same characters as a public route
    // ('/oauth-admin' vs. '/oauth') must be gated like any other protected route:
    // a logged-out visitor is redirected, and the content is not rendered bare.
    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(screen.queryByTestId('oauth-admin-content')).not.toBeInTheDocument()
  })

  it('The dev-only emulator sign-in route (/dev/login) renders bare for a logged-out visitor, never redirected', () => {
    vi.mocked(usePathname).mockReturnValue('/dev/login')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: false,
      account: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="dev-login-content">Signing in…</div>
      </LayoutWrapper>
    )

    // The route signs the browser in from a token in its own effect; a redirect
    // to /login from this wrapper would win the race and the effect would never run.
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByTestId('dev-login-content')).toBeInTheDocument()
  })

  // SDET-added: same boundary probe against the other public-route prefix named
  // in the spec ('/spike' vs. '/spike-internal').
  it('SDET-added: /spike-internal is gated, not treated as the public /spike route', () => {
    vi.mocked(usePathname).mockReturnValue('/spike-internal')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: false,
      account: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="spike-internal-content">Internal</div>
      </LayoutWrapper>
    )

    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(screen.queryByTestId('spike-internal-content')).not.toBeInTheDocument()
  })

  it('Scenario: /oauth itself remains public (segment-boundary regression guard)', () => {
    vi.mocked(usePathname).mockReturnValue('/oauth')

    render(
      <LayoutWrapper>
        <div data-testid="oauth-content">OAuth</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('oauth-content')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('Scenario: /oauth/callback remains public as a sub-path (segment-boundary regression guard)', () => {
    vi.mocked(usePathname).mockReturnValue('/oauth/callback')

    render(
      <LayoutWrapper>
        <div data-testid="oauth-callback-content">Callback</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('oauth-callback-content')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  // --- No redirect while auth is still resolving ---

  it('Scenario: No redirect fires while auth is still resolving', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      authLoading: true,
      account: null,
      isLoading: true,
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(mockPush).not.toHaveBeenCalled()
  })

  // --- D2: a signed-in visitor whose backend account is still resolving must not
  // reach the corp gate (no wake-up flow, no app, while stage two is unresolved) ---

  it('Scenario: A signed-in visitor whose backend account is still resolving does not reach the wake gate', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useAccountContext>)
    // Corp lookup hasn't even started yet (account-provider gates `enabled` on
    // having an account) — needsWake/isLoading are both inert here.
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: false,
      needsWake: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCorporationContext>)

    const { container } = render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('wake-up-flow')).not.toBeInTheDocument()
  })

  // --- D6: corp-lookup failure must not be conflated with "no living corporation" ---

  it('Scenario: A network or server error on corp lookup does not trigger the wake-up flow', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as unknown as ReturnType<typeof useAccountContext>)
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: false,
      needsWake: false,
      isError: true,
      error: { status: 500, message: 'boom' },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCorporationContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(screen.queryByTestId('wake-up-flow')).not.toBeInTheDocument()
    // A retriable error state, distinct from the wake-up flow, must render.
    expect(screen.getByTestId('gate-corp-error')).toBeInTheDocument()
    expect(screen.getByTestId('gate-corp-retry')).toBeInTheDocument()
  })

  it('Scenario: Retrying a failed corp lookup resumes the normal gate', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as unknown as ReturnType<typeof useAccountContext>)
    const refetch = vi.fn()
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: null,
      isLoading: false,
      needsWake: false,
      isError: true,
      error: { status: 500, message: 'boom' },
      refetch,
    } as unknown as ReturnType<typeof useCorporationContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    fireEvent.click(screen.getByTestId('gate-corp-retry'))

    // Retrying re-issues GET /v1/corporations/me via the exposed `refetch` — the
    // gate itself only resumes normal resolution once that retried lookup
    // resolves (covered by the corporation-provider + needsWake tests above).
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('Scenario: A background refetch failure does not evict a woken player (B1)', () => {
    // A signed-in user whose corp is already resolved triggers a background
    // refetch (e.g. window refocus) that fails — React Query v5 retains the
    // cached `data` and sets `isError: true` on the failed background refetch.
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: { id: 'a1' },
      isLoading: false,
    } as unknown as ReturnType<typeof useAccountContext>)
    vi.mocked(useCorporationContext).mockReturnValue({
      corporation: { id: 'corp_1' },
      isLoading: false,
      needsWake: false,
      isError: true,
      error: { status: 500, message: 'boom' },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCorporationContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    // The app keeps rendering the last-known corporation — the error state must
    // NOT replace it, because a living corporation is already known.
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByTestId('floating-nav')).toBeInTheDocument()
    expect(screen.queryByTestId('gate-corp-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wake-up-flow')).not.toBeInTheDocument()
  })

  // --- D6: account-lookup failure must not be conflated with "still resolving" ---

  it('Scenario: A failed account lookup shows a retriable error instead of staying blank', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: null,
      isLoading: false,
      isCreating: false,
      error: { status: 500, message: 'boom' },
      refetchAccount: vi.fn(),
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('gate-account-error')).toBeInTheDocument()
    expect(screen.getByTestId('gate-account-retry')).toBeInTheDocument()
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wake-up-flow')).not.toBeInTheDocument()
  })

  it('Scenario: An in-progress account auto-creation is not shown as a lookup failure', () => {
    // hasTriedCreation flips true synchronously before the create mutation
    // settles — a naive `error` truthiness check would flash a false
    // "account lookup failed" error on every first-time signup's happy path.
    // The error branch MUST gate on `!isCreating`.
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: null,
      isLoading: true,
      isCreating: true,
      error: { status: 404, message: 'not found' },
      refetchAccount: vi.fn(),
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAccountContext>)

    const { container } = render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(screen.queryByTestId('gate-account-error')).not.toBeInTheDocument()
    expect(container.firstChild).toBeNull()
  })

  it('Scenario: A stuck account-creation failure does not present retry as certain to succeed', () => {
    // A persisting 404 (a prior auto-creation attempt failed, not a fresh lookup
    // failure on an account known to exist) must offer a distinct sign-out/reload
    // recovery action, not a plain retry that provably repeats the same 404.
    vi.mocked(usePathname).mockReturnValue('/widgets')
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: null,
      isLoading: false,
      isCreating: false,
      error: { status: 404, message: 'not found' },
      refetchAccount: vi.fn(),
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    expect(screen.getByTestId('gate-account-error')).toBeInTheDocument()
    expect(screen.getByTestId('gate-account-signout')).toBeInTheDocument()
    expect(screen.queryByTestId('gate-account-retry')).not.toBeInTheDocument()
  })

  it('Scenario: Retrying a failed account lookup resumes the normal gate', () => {
    vi.mocked(usePathname).mockReturnValue('/widgets')
    const refetchAccount = vi.fn()
    vi.mocked(useAccountContext).mockReturnValue({
      user: { uid: 'u1' },
      authLoading: false,
      account: null,
      isLoading: false,
      isCreating: false,
      error: { status: 500, message: 'boom' },
      refetchAccount,
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAccountContext>)

    render(
      <LayoutWrapper>
        <div data-testid="content">Content</div>
      </LayoutWrapper>
    )

    fireEvent.click(screen.getByTestId('gate-account-retry'))

    expect(refetchAccount).toHaveBeenCalledTimes(1)
  })
})
