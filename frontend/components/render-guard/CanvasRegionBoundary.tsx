'use client'

// CanvasRegionBoundary.tsx — components/error-boundary.tsx's `ErrorBoundary`
// scoped to one canvas region (design.md task 1.2), its first production
// consumer. Catches a throw during render/commit (construction thrown
// synchronously inside the guarded subtree's mount effect, or any other
// React-lifecycle-observable throw) and renders `fallback` instead.
//
// `ErrorBoundary.componentDidCatch` only `console.error`s in development
// (components/error-boundary.tsx), so recording must flow through `onError`
// -> record-renderer-failure.ts, not rely on the boundary's own logging —
// `onError` here is the guard's `reportRenderError`.
//
// Retry after a catch is a `key` bump on THIS component from the parent
// (design.md's composition snippet), which remounts it and its subtree in
// one move — not a bare `reset()` call from inside.

import type { ReactNode } from 'react'
import { ErrorBoundary } from '../error-boundary'

export interface CanvasRegionBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  onError: (error: unknown) => void
}

export function CanvasRegionBoundary({ children, fallback, onError }: CanvasRegionBoundaryProps) {
  return (
    <ErrorBoundary fallback={() => fallback} onError={(error) => onError(error)}>
      {children}
    </ErrorBoundary>
  )
}
