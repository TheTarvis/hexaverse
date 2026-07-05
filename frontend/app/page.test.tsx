import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomePage from './page'
import { useAccountContext } from '@/components/account-provider'

vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(() => ({
    account: null,
  })),
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('greets the account by name when available', () => {
    vi.mocked(useAccountContext).mockReturnValue({
      account: { id: 'a1', name: 'Travis' },
    } as ReturnType<typeof useAccountContext>)

    render(<HomePage />)

    expect(screen.getByRole('heading')).toHaveTextContent('Welcome, Travis.')
  })

  it('falls back to a plain greeting without an account name', () => {
    vi.mocked(useAccountContext).mockReturnValue({
      account: null,
    } as ReturnType<typeof useAccountContext>)

    render(<HomePage />)

    expect(screen.getByRole('heading')).toHaveTextContent('Welcome.')
  })
})
