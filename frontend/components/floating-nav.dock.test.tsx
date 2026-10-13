import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { FloatingNav } from './floating-nav'
import { ConsoleDock } from '@/components/space/ConsoleDock'
import {
  CONSOLE_DOCK_HEIGHT_VAR,
  CONSOLE_DOCK_LANE_LEFT_CENTER,
} from '@/lib/console-dock-layout'

// RED-PHASE TESTS - openspec change add-console-dock, tasks 2.14 and 2.15
// (system-console: "No floating surface is covered by or covers the expanded
// dock" - the nav's structural half; "The floating navigation stays where it
// is on the galaxy route" - the structural half). jsdom resolves no calc() or
// var(), so what the class RESOLVES to is the journey's; here: the imported
// lane class and the published root property.
// floating-nav.test.tsx is not edited.

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(),
}))

import { usePathname } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'

const authed = {
  user: { uid: 'u1', email: 'pilot@hexaverse.test' },
  account: { email: 'pilot@hexaverse.test' },
  signOut: vi.fn(),
}

beforeEach(() => {
  vi.mocked(useAccountContext).mockReturnValue(authed as unknown as ReturnType<typeof useAccountContext>)
})

afterEach(() => {
  // a failed test must not leak the published property into the next
  document.documentElement.style.removeProperty(CONSOLE_DOCK_HEIGHT_VAR)
})

describe('FloatingNav beside the dock', () => {
  it('Scenario: No floating surface is covered by or covers the expanded dock (FloatingNav on the system route carries the left-and-centre lane; the dock publishes 13.75rem)', () => {
    vi.mocked(usePathname).mockReturnValue('/systems/sys-0')
    render(
      <>
        <ConsoleDock
          expanded
          openSeq={1}
          selectedTab="log"
          onOpen={() => {}}
          onSelectTab={() => {}}
          onCollapse={() => {}}
          strip={<div data-testid="vitals-strip" />}
          tabs={[{ id: 'log', label: 'Log', content: null }]}
        />
        <FloatingNav />
      </>,
    )
    expect(screen.getByTestId('floating-nav')).toHaveClass(CONSOLE_DOCK_LANE_LEFT_CENTER)
    expect(document.documentElement.style.getPropertyValue(CONSOLE_DOCK_HEIGHT_VAR)).toBe('13.75rem')
  })

  it('Scenario: The floating navigation stays where it is on the galaxy route (no dock mounted: the property is absent and the nav carries the same lane class)', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<FloatingNav />)
    expect(document.documentElement.style.getPropertyValue(CONSOLE_DOCK_HEIGHT_VAR)).toBe('')
    expect(screen.getByTestId('floating-nav')).toHaveClass(CONSOLE_DOCK_LANE_LEFT_CENTER)
  })
})
