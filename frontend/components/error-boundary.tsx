'use client'

/**
 * Error Boundary Component
 *
 * Catches React errors (including from Suspense-enabled queries) and displays
 * user-friendly error messages with retry functionality.
 *
 * Works with React Query's Suspense mode to catch query errors.
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <Suspense fallback={<LoadingSpinner />}>
 *     <ComponentThatMightError />
 *   </Suspense>
 * </ErrorBoundary>
 * ```
 */

import React, { Component, type ReactNode } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { HudButton } from './hud/HudControls'

interface Props {
  children: ReactNode
  /**
   * Custom fallback UI to display when an error occurs.
   * Receives the error and a reset function.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /**
   * Callback fired when an error is caught
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset)
      }

      // Default error UI
      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />
    }

    return this.props.children
  }
}

/**
 * Default Error Fallback UI
 *
 * Displays a user-friendly error message with retry button.
 */
function DefaultErrorFallback({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-900/50 dark:bg-red-950/20">
      <ExclamationTriangleIcon className="h-12 w-12 text-red-600 dark:text-red-500" />
      <h3 className="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">
        Something went wrong
      </h3>
      <p className="mt-2 max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <div className="mt-6 flex gap-3">
        <HudButton appearance="standard" onClick={reset}>
          Try again
        </HudButton>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-6 max-w-2xl">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300">
            Error details (dev only)
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-zinc-700 p-4 text-xs text-zinc-100">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  )
}

/**
 * Compact Error Fallback UI
 *
 * Smaller error UI for inline use (e.g., within cards or smaller sections).
 */
export function CompactErrorFallback({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
      <ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-500" />
      <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
        {error.message || 'Failed to load data'}
      </p>
      <HudButton appearance="standard" variant="quiet" onClick={reset} className="mt-3">
        Retry
      </HudButton>
    </div>
  )
}

/**
 * Query Error Boundary
 *
 * Specialized error boundary for React Query Suspense errors.
 * Provides better error messages for common API errors.
 */
export function QueryErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        // Extract better error messages from API errors
        let message = error.message

        // Handle common API error patterns
        if (message.includes('404')) {
          message = 'The requested resource was not found.'
        } else if (message.includes('403')) {
          message = "You don't have permission to access this resource."
        } else if (message.includes('401')) {
          message = 'You need to sign in to access this resource.'
        } else if (message.includes('500')) {
          message = 'A server error occurred. Please try again later.'
        } else if (message.includes('Network')) {
          message = 'Network error. Please check your connection and try again.'
        }

        return (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-900/50 dark:bg-red-950/20">
            <ExclamationTriangleIcon className="h-10 w-10 text-red-600 dark:text-red-500" />
            <h3 className="mt-4 text-base font-semibold text-zinc-950 dark:text-white">
              Failed to load data
            </h3>
            <p className="mt-2 max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
              {message}
            </p>
            <HudButton appearance="standard" onClick={reset} className="mt-4">
              Try again
            </HudButton>
          </div>
        )
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
