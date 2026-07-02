import React from 'react'

/**
 * Expand the hit area to at least 44×44px on touch devices without causing oversized elements
 */
export function TouchTarget({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute top-1/2 left-1/2 w-[clamp(100%,44px,100%)] h-[clamp(100%,44px,100%)] -translate-x-1/2 -translate-y-1/2 [@media(pointer:fine)]:hidden"
        aria-hidden="true"
      />
      {children}
    </>
  )
} 