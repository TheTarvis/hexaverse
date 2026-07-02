import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary, CompactErrorFallback, QueryErrorBoundary } from './error-boundary'

// Suppress console.error for error boundary tests
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalConsoleError
})

// Component that throws an error
function ThrowingComponent({ error }: { error: Error }): never {
  throw error
}

// Component that renders normally
function NormalComponent() {
  return <div data-testid="normal-content">Normal content</div>
}

describe('ErrorBoundary', () => {
  describe('normal rendering', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <NormalComponent />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('normal-content')).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('renders default error UI when child throws', () => {
      const testError = new Error('Test error message')

      render(
        <ErrorBoundary>
          <ThrowingComponent error={testError} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Test error message')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    it('renders fallback error message when error has no message', () => {
      const testError = new Error()

      render(
        <ErrorBoundary>
          <ThrowingComponent error={testError} />
        </ErrorBoundary>
      )

      expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument()
    })

    it('calls onError callback when error is caught', () => {
      const onError = vi.fn()
      const testError = new Error('Test error')

      render(
        <ErrorBoundary onError={onError}>
          <ThrowingComponent error={testError} />
        </ErrorBoundary>
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(testError, expect.objectContaining({
        componentStack: expect.any(String),
      }))
    })

    it('uses custom fallback when provided', () => {
      const testError = new Error('Custom error')
      const customFallback = (error: Error, reset: () => void) => (
        <div>
          <span data-testid="custom-error">{error.message}</span>
          <button onClick={reset} data-testid="custom-reset">Custom Reset</button>
        </div>
      )

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowingComponent error={testError} />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('custom-error')).toHaveTextContent('Custom error')
      expect(screen.getByTestId('custom-reset')).toBeInTheDocument()
    })
  })

  describe('reset functionality', () => {
    it('resets error state when reset button is clicked', () => {
      let shouldThrow = true

      function ConditionalThrow() {
        if (shouldThrow) {
          throw new Error('Test error')
        }
        return <div data-testid="recovered">Recovered!</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      )

      // Error is shown
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Stop throwing and click reset
      shouldThrow = false
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

      // Re-render to trigger recovery
      rerender(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('recovered')).toBeInTheDocument()
    })
  })
})

describe('CompactErrorFallback', () => {
  it('renders compact error message', () => {
    const error = new Error('Compact error message')
    const reset = vi.fn()

    render(<CompactErrorFallback error={error} reset={reset} />)

    expect(screen.getByText('Compact error message')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows fallback message when error has no message', () => {
    const error = new Error()
    const reset = vi.fn()

    render(<CompactErrorFallback error={error} reset={reset} />)

    expect(screen.getByText('Failed to load data')).toBeInTheDocument()
  })

  it('calls reset when retry button is clicked', () => {
    const error = new Error('Test')
    const reset = vi.fn()

    render(<CompactErrorFallback error={error} reset={reset} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })
})

describe('QueryErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <QueryErrorBoundary>
        <NormalComponent />
      </QueryErrorBoundary>
    )

    expect(screen.getByTestId('normal-content')).toBeInTheDocument()
  })

  it('shows user-friendly message for 404 errors', () => {
    const error = new Error('Resource not found - 404')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByText('The requested resource was not found.')).toBeInTheDocument()
  })

  it('shows user-friendly message for 403 errors', () => {
    const error = new Error('Access denied - 403')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByText("You don't have permission to access this resource.")).toBeInTheDocument()
  })

  it('shows user-friendly message for 401 errors', () => {
    const error = new Error('Unauthorized - 401')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByText('You need to sign in to access this resource.')).toBeInTheDocument()
  })

  it('shows user-friendly message for 500 errors', () => {
    const error = new Error('Internal server error - 500')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByText('A server error occurred. Please try again later.')).toBeInTheDocument()
  })

  it('shows user-friendly message for network errors', () => {
    const error = new Error('Network error: Failed to fetch')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument()
  })

  it('shows original message for unknown error types', () => {
    const error = new Error('Some unknown error')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByText('Some unknown error')).toBeInTheDocument()
  })

  it('has a retry button', () => {
    const error = new Error('Test error')

    render(
      <QueryErrorBoundary>
        <ThrowingComponent error={error} />
      </QueryErrorBoundary>
    )

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
