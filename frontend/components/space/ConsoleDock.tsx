'use client'

// ConsoleDock — the shell beneath the vitals strip (openspec change
// `add-console-dock`, capability `system-console`). A controlled component:
// the owner holds `{ expanded, openSeq }`; the dock renders the strip, the
// "Console" control, and a region (tab bar + panel) hidden by the `hidden`
// attribute while collapsed. It never conditionally renders its own elements
// and never decides what a tab's content is.

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  CONSOLE_DOCK_HEIGHT_COLLAPSED,
  CONSOLE_DOCK_HEIGHT_EXPANDED,
  CONSOLE_DOCK_HEIGHT_VAR,
} from '@/lib/console-dock-layout'

export type ConsoleTabId = 'log'

export interface ConsoleDockTab {
  id: ConsoleTabId
  /** The tab's visible label and accessible name. */
  label: string
  /** Rendered inside the tab's panel exactly as given, in both states. */
  content: ReactNode
}

export interface ConsoleDockProps {
  expanded: boolean
  /** Incremented by the owner on every open request, including one made while already expanded. */
  openSeq: number
  onOpen: (tab: ConsoleTabId) => void
  onCollapse: () => void
  /** The vitals strip element. Rendered first, unwrapped in any interactive element. */
  strip: ReactNode
  /** Exactly one entry in this change. tabs[0] is the selected tab. */
  tabs: readonly ConsoleDockTab[]
}

const CONTROL =
  'min-h-6 min-w-6 rounded-md px-2 font-mono text-[11px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400'

export function ConsolePanelWaiting() {
  return (
    <p data-testid="console-panel-waiting" className="p-2 text-[11px] text-zinc-600 dark:text-zinc-400">
      Waiting for the system read…
    </p>
  )
}

export function ConsoleDock({ expanded, openSeq, onOpen, onCollapse, strip, tabs }: ConsoleDockProps) {
  const tab = tabs[0]
  const regionId = useId()
  const tabId = useId()
  const panelId = useId()
  const regionRef = useRef<HTMLDivElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const tabRef = useRef<HTMLButtonElement>(null)
  const seenOpenSeq = useRef(openSeq)
  const focusOpenOnCollapse = useRef(false)

  // The one published height; absent whenever no dock is mounted.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      CONSOLE_DOCK_HEIGHT_VAR,
      expanded ? CONSOLE_DOCK_HEIGHT_EXPANDED : CONSOLE_DOCK_HEIGHT_COLLAPSED,
    )
    return () => {
      document.documentElement.style.removeProperty(CONSOLE_DOCK_HEIGHT_VAR)
    }
  }, [expanded])

  // Every open request moves focus to the selected tab, after the commit that
  // un-hides the region, including when the dock was already expanded.
  useEffect(() => {
    if (openSeq === seenOpenSeq.current) return
    seenOpenSeq.current = openSeq
    tabRef.current?.focus()
  }, [openSeq])

  // A collapse decided (before the state change) to have focus inside the tab
  // bar or panel hands focus to the "Console" control.
  useEffect(() => {
    if (expanded) return
    if (focusOpenOnCollapse.current) {
      focusOpenOnCollapse.current = false
      openRef.current?.focus()
    }
  }, [expanded])

  function handleCollapse() {
    focusOpenOnCollapse.current = !!regionRef.current?.contains(document.activeElement)
    onCollapse()
  }

  return (
    <div
      data-testid="console-dock"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col"
      style={expanded ? { height: CONSOLE_DOCK_HEIGHT_EXPANDED } : undefined}
    >
      {strip}
      <button
        ref={openRef}
        type="button"
        data-testid="console-dock-open"
        aria-expanded="false"
        aria-controls={regionId}
        hidden={expanded}
        onClick={() => onOpen(tab.id)}
        className={`${CONTROL} absolute bottom-[calc(100%+0.5rem)] right-4 h-7 border border-zinc-200 bg-zinc-50/95 text-zinc-600 backdrop-blur dark:border-white/[0.12] dark:bg-zinc-700/95 dark:text-zinc-400`}
      >
        Console
      </button>
      <div
        ref={regionRef}
        id={regionId}
        data-testid="console-dock-region"
        hidden={!expanded}
        className="flex min-h-0 flex-1 flex-col border-t border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-white/[0.12] dark:bg-zinc-700/95"
      >
        <div className="flex h-9 shrink-0 items-center justify-between px-2">
          <div role="tablist" aria-label="Console tabs" className="flex items-center gap-1">
            <button
              ref={tabRef}
              type="button"
              role="tab"
              id={tabId}
              data-testid={`console-tab-${tab.id}`}
              aria-selected="true"
              aria-controls={panelId}
              className={`${CONTROL} text-zinc-900 dark:text-white`}
            >
              {tab.label}
            </button>
          </div>
          <button
            type="button"
            data-testid="console-dock-collapse"
            aria-expanded="true"
            aria-controls={regionId}
            aria-label="Collapse console"
            onClick={handleCollapse}
            className={`${CONTROL} text-zinc-600 dark:text-zinc-400`}
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId}
          data-testid={`console-panel-${tab.id}`}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {tab.content}
        </div>
      </div>
    </div>
  )
}
