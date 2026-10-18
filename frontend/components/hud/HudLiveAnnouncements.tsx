'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const Outlet = createContext<HTMLElement | null>(null)

/** Keep command announcements readable when their owning HUD panel is hidden. */
export function HudAnnouncementScope({ outlet, children }: { outlet: HTMLElement | null; children: ReactNode }) {
  return <Outlet.Provider value={outlet}>{children}</Outlet.Provider>
}

export function HudLivePortal({ children }: { children: ReactNode }) {
  const outlet = useContext(Outlet)
  return outlet ? createPortal(children, outlet) : <>{children}</>
}
