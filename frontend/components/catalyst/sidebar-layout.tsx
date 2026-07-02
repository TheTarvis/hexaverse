'use client'

import * as Headless from '@headlessui/react'
import React, { cloneElement, isValidElement, useState } from 'react'
import { NavbarItem } from './navbar'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

function OpenMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
    </svg>
  )
}

function CloseMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

function CollapseToggleButton({ isCollapsed, onClick }: { isCollapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sky-500/30 bg-zinc-700 shadow-lg shadow-sky-500/20 backdrop-blur-sm transition-all hover:border-sky-400/50 hover:bg-zinc-700/95 hover:shadow-sky-400/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 dark:bg-zinc-900/95 dark:hover:bg-zinc-700/95"
      aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {isCollapsed ? (
        <ChevronRightIcon className="h-3.5 w-3.5 text-sky-400 transition-colors group-hover:text-sky-300" />
      ) : (
        <ChevronLeftIcon className="h-3.5 w-3.5 text-sky-400 transition-colors group-hover:text-sky-300" />
      )}
    </button>
  )
}

function MobileSidebar({ open, close, children }: React.PropsWithChildren<{ open: boolean; close: () => void }>) {
  return (
    <Headless.Dialog open={open} onClose={close} className="lg:hidden">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-700/30 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <Headless.DialogPanel
        transition
        className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-closed:-translate-x-full"
      >
        <div className="flex h-full flex-col rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 shadow-2xl ring-1 ring-sky-500/20 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:ring-sky-500/20">
          <div className="-mb-3 px-4 pt-3">
            <Headless.CloseButton as={NavbarItem} aria-label="Close navigation">
              <CloseMenuIcon />
            </Headless.CloseButton>
          </div>
          {children}
        </div>
      </Headless.DialogPanel>
    </Headless.Dialog>
  )
}

export function SidebarLayout({
  navbar,
  sidebar,
  children,
}: React.PropsWithChildren<{ navbar: React.ReactNode; sidebar: React.ReactNode }>) {
  const [showSidebar, setShowSidebar] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Clone sidebar element to inject isCollapsed prop
  const sidebarWithCollapsedState = isValidElement(sidebar)
    ? cloneElement(sidebar, { isCollapsed } as { isCollapsed: boolean })
    : sidebar

  return (
    <div className="relative isolate flex h-svh w-full bg-zinc-50 max-lg:flex-col lg:bg-zinc-100 dark:bg-zinc-700">
      {/* Sidebar on desktop */}
      <div
        className={`fixed inset-y-0 left-0 max-lg:hidden transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="relative h-full">
          {/* Refined background with depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 dark:from-zinc-950 dark:via-zinc-900 dark:to-black" />

          {/* Subtle texture overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent opacity-50" />

          {/* Border accent */}
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-sky-500/30 to-transparent" />

          {/* Content */}
          <div className="relative h-full">{sidebarWithCollapsedState}</div>

          {/* Collapse toggle button */}
          <CollapseToggleButton isCollapsed={isCollapsed} onClick={() => setIsCollapsed(!isCollapsed)} />
        </div>
      </div>

      {/* Sidebar on mobile */}
      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
        {sidebar}
      </MobileSidebar>

      {/* Navbar on mobile */}
      <header className="flex items-center px-4 lg:hidden">
        <div className="py-2.5">
          <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
            <OpenMenuIcon />
          </NavbarItem>
        </div>
        <div className="min-w-0 flex-1">{navbar}</div>
      </header>

      {/* Content */}
      <main
        className={`flex flex-1 flex-col pb-2 lg:min-w-0 lg:pt-2 lg:pr-2 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <div className="grow p-6 lg:rounded-lg bg-zinc-100 dark:bg-zinc-700">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  )
}