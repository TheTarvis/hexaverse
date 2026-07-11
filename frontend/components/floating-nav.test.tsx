import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FloatingNav } from './floating-nav'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

const signOut = vi.fn()
vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(),
}))

import { usePathname } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'

const authed = {
  user: { uid: 'u1', email: 'pilot@hexaverse.test' },
  account: { email: 'pilot@hexaverse.test' },
  signOut,
}

describe('FloatingNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useAccountContext).mockReturnValue(
      authed as unknown as ReturnType<typeof useAccountContext>,
    )
  })

  it('renders nothing when logged out', () => {
    vi.mocked(useAccountContext).mockReturnValue({
      user: null,
      account: null,
      signOut,
    } as unknown as ReturnType<typeof useAccountContext>)
    const { container } = render(<FloatingNav />)
    expect(container.firstChild).toBeNull()
  })

  it('links to the galaxy, shows the email, and signs out', () => {
    vi.mocked(usePathname).mockReturnValue('/systems/sys-0')
    render(<FloatingNav />)

    expect(screen.getByTestId('nav-home')).toHaveAttribute('href', '/')
    expect(screen.getByTestId('floating-nav')).toHaveTextContent('pilot@hexaverse.test')
    fireEvent.click(screen.getByTestId('sign-out-button'))
    expect(signOut).toHaveBeenCalled()
  })

  it('marks the galaxy link current on the home route', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<FloatingNav />)
    expect(screen.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page')
  })
})
