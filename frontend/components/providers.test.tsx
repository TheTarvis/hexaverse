import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Providers } from './providers'

vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-client-provider">{children}</div>
  ),
}))

vi.mock('@/lib/query-client', () => ({
  queryClient: {},
}))

vi.mock('./account-provider', () => ({
  AccountProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="account-provider">{children}</div>
  ),
}))

vi.mock('./corporation-provider', () => ({
  CorporationProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="corporation-provider">{children}</div>
  ),
}))

// This suite checks provider composition; media behavior has focused coverage.
vi.mock('./audio/AppMusicProvider', () => ({
  AppMusicProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./tuning/LocalTuningContext', () => ({
  LocalTuningProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="local-tuning-provider">{children}</div>,
}))

describe('Providers', () => {
  it('renders children', () => {
    render(
      <Providers>
        <div data-testid="test-child">Test Content</div>
      </Providers>
    )

    expect(screen.getByTestId('test-child')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('wraps children with QueryClientProvider and AccountProvider', () => {
    render(
      <Providers>
        <div data-testid="child">Child</div>
      </Providers>
    )

    const queryProvider = screen.getByTestId('query-client-provider')
    const accountProvider = screen.getByTestId('account-provider')
    const corporationProvider = screen.getByTestId('corporation-provider')

    expect(queryProvider).toBeInTheDocument()
    expect(accountProvider).toBeInTheDocument()
    expect(corporationProvider).toBeInTheDocument()
    expect(queryProvider).toContainElement(accountProvider)
    expect(accountProvider).toContainElement(screen.getByTestId('local-tuning-provider'))
    expect(screen.getByTestId('local-tuning-provider')).toContainElement(corporationProvider)
    expect(corporationProvider).toContainElement(screen.getByTestId('child'))
  })
})
