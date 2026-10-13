'use client'

// ConsoleDock — the shell beneath the vitals strip (openspec changes
// `add-console-dock`, `keep-console-tab-content-mounted`,
// `move-scan-control-to-console-dock`; capability `system-console`). A
// controlled component: the owner holds `{ expanded, openSeq, tab }`; the dock
// renders the strip, the "Console" control, and a region (tab bar + one panel
// per tab) hidden by the `hidden` attribute while collapsed. Every tab's
// content is always mounted; a panel that is not the selected tab's carries
// `hidden` itself. The dock never conditionally renders its own elements and
// never decides what a tab's content is.
//
// Live regions inside a hidden panel are outside the accessibility tree, so
// the dock renders one outlet OUTSIDE the hidden region and `ConsoleLivePortal`
// lets a tab's content put its live region there. Outside any dock the portal
// renders its children in place, so a panel component tested standalone keeps
// its live region where it always was.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  CONSOLE_DOCK_HEIGHT_COLLAPSED,
  CONSOLE_DOCK_HEIGHT_EXPANDED,
  CONSOLE_DOCK_HEIGHT_VAR,
} from '@/lib/console-dock-layout'

/** The closed set of tabs. `openDockOn` and the tab bar accept nothing else. */
export const CONSOLE_TAB_IDS = ['scan', 'log'] as const
export type ConsoleTabId = (typeof CONSOLE_TAB_IDS)[number]

export function isConsoleTabId(value: unknown): value is ConsoleTabId {
  return typeof value === 'string' && (CONSOLE_TAB_IDS as readonly string[]).includes(value)
}

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
  /** The selected tab. The owner remembers it across collapses; it is never cleared. */
  selectedTab: ConsoleTabId
  /** An open request: the "Console" control asks for the remembered tab. */
  onOpen: (tab: ConsoleTabId) => void
  /** A tab selection from the tab bar while expanded. */
  onSelectTab: (tab: ConsoleTabId) => void
  onCollapse: () => void
  /** The vitals strip element. Rendered first, unwrapped in any interactive element. */
  strip: ReactNode
  /** The tabs, in bar order. */
  tabs: readonly ConsoleDockTab[]
}

const CONTROL =
  'min-h-6 min-w-6 rounded-md px-2 font-mono text-[11px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400'

const ConsoleLiveOutletContext = createContext<HTMLElement | null>(null)

/**
 * Renders its children in the dock's live outlet — outside the `hidden`
 * region, so an `aria-live` region inside a hidden tab is still announced.
 * Outside a dock, or before the outlet has mounted, renders them in place.
 */
export function ConsoleLivePortal({ children }: { children: ReactNode }) {
  const outlet = useContext(ConsoleLiveOutletContext)
  return outlet ? createPortal(children, outlet) : <>{children}</>
}

export function ConsolePanelWaiting() {
  return (
    <p data-testid="console-panel-waiting" className="p-2 text-[11px] text-zinc-600 dark:text-zinc-400">
      Waiting for the system read…
    </p>
  )
}

export function ConsoleDock({
  expanded,
  openSeq,
  selectedTab,
  onOpen,
  onSelectTab,
  onCollapse,
  strip,
  tabs,
}: ConsoleDockProps) {
  const regionId = useId()
  const idBase = useId()
  const regionRef = useRef<HTMLDivElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef(new Map<ConsoleTabId, HTMLButtonElement>())
  const seenOpenSeq = useRef(openSeq)
  const focusOpenOnCollapse = useRef(false)
  const [liveOutlet, setLiveOutlet] = useState<HTMLElement | null>(null)

  const tabId = (id: ConsoleTabId) => `${idBase}-tab-${id}`
  const panelId = (id: ConsoleTabId) => `${idBase}-panel-${id}`

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
    tabRefs.current.get(selectedTab)?.focus()
  }, [openSeq, selectedTab])

  // A collapse decided (before the state change) to have focus inside the tab
  // bar or panel hands focus to the "Console" control.
  useEffect(() => {
    if (expanded) return
    if (focusOpenOnCollapse.current) {
      focusOpenOnCollapse.current = false
      openRef.current?.focus()
    }
  }, [expanded])

  const handleCollapse = useCallback(() => {
    focusOpenOnCollapse.current = !!regionRef.current?.contains(document.activeElement)
    onCollapse()
  }, [onCollapse])

  // Escape collapses the dock from anywhere, through the same single collapse
  // path as the collapse control. A `window` listener in the bubble phase, so a
  // handler nearer the target (the fleet menu) that prevents the default wins;
  // present only while expanded.
  useEffect(() => {
    if (!expanded) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return
      handleCollapse()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded, handleCollapse])

  // Arrow keys move through the tab bar and select as they go (automatic
  // activation); Home and End reach the ends. Focus follows selection.
  const selectAndFocus = useCallback(
    (tab: ConsoleTabId) => {
      onSelectTab(tab)
      tabRefs.current.get(tab)?.focus()
    },
    [onSelectTab],
  )
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((t) => t.id === selectedTab)
    if (index < 0 || tabs.length === 0) return
    let next: number | null = null
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length
        break
      case 'ArrowLeft':
        next = (index - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = tabs.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    selectAndFocus(tabs[next].id)
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
        onClick={() => onOpen(selectedTab)}
        className={`${CONTROL} absolute bottom-[calc(100%+0.5rem)] right-4 h-7 border border-zinc-200 bg-zinc-50/95 text-zinc-600 backdrop-blur dark:border-white/[0.12] dark:bg-zinc-700/95 dark:text-zinc-400`}
      >
        Console
      </button>
      {/* The live outlet: outside the hidden region, never hidden itself. */}
      <div ref={setLiveOutlet} data-testid="console-live-outlet" />
      <div
        ref={regionRef}
        id={regionId}
        data-testid="console-dock-region"
        hidden={!expanded}
        className="flex min-h-0 flex-1 flex-col border-t border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-white/[0.12] dark:bg-zinc-700/95"
      >
        <div className="flex h-9 shrink-0 items-center justify-between px-2">
          <div role="tablist" aria-label="Console tabs" className="flex items-center gap-1">
            {tabs.map((tab) => {
              const selected = tab.id === selectedTab
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(tab.id, el)
                    else tabRefs.current.delete(tab.id)
                  }}
                  type="button"
                  role="tab"
                  id={tabId(tab.id)}
                  data-testid={`console-tab-${tab.id}`}
                  aria-selected={selected ? 'true' : 'false'}
                  aria-controls={panelId(tab.id)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectAndFocus(tab.id)}
                  onKeyDown={onTabKeyDown}
                  className={`${CONTROL} ${selected ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
                >
                  {tab.label}
                </button>
              )
            })}
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
        <ConsoleLiveOutletContext.Provider value={liveOutlet}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              id={panelId(tab.id)}
              aria-labelledby={tabId(tab.id)}
              data-testid={`console-panel-${tab.id}`}
              hidden={tab.id !== selectedTab}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {tab.content}
            </div>
          ))}
        </ConsoleLiveOutletContext.Provider>
      </div>
    </div>
  )
}
