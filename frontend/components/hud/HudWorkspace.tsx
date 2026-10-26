'use client'

import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { HudButton } from '@/components/hud/HudControls'
import { TunableHudCard } from '@/components/tuning/TunableHudCard'
import { TuningCard } from '@/components/tuning/TuningCard'
import { useLocalTuning } from '@/components/tuning/LocalTuningContext'
import { HudCardShell } from './HudCardShell'
import type { HudCardTitle } from './hud-card-title'
import { HudIcon } from './HudIcon'
import { MagnifyingGlassIcon, RocketLaunchIcon, QueueListIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import styles from './hud-workspace.module.css'
import { usePhoneHud, usePhoneSheet } from '@/hooks/use-phone-sheet'

export type HudPanelId = 'objects' | 'fleets' | 'fleet-status'
const panelIcons = { objects: MagnifyingGlassIcon, fleets: QueueListIcon, 'fleet-status': RocketLaunchIcon }
export interface HudWorkspacePanel { id: HudPanelId; label: string; children: ReactNode; title?: HudCardTitle; header?: ReactNode; footer?: ReactNode; tuningGroups?: string[]; suspended?: boolean }
export interface HudWorkspaceProps { onPanelDismiss?: (id: HudPanelId) => void; onPanelActivate?: (id: HudPanelId) => void; corporationId: string; panels: HudWorkspacePanel[]; className?: string; request?: { id: HudPanelId; sequence: number }; settingsTabs?: { audio: ReactNode; account: ReactNode }; navigationAction?: ReactNode }
/** Presentation only. Keep navigation outside this overlay, and panel content unpositioned. */
export function HudWorkspace(props: HudWorkspaceProps) {
  return <Workspace key={props.corporationId} {...props} />
}

function NavigationFrame({ children, paused = false }: { children: ReactNode; paused?: boolean }) {
  return <HudCardShell framing="frame" className={styles.navigationShell} paused={paused}>{children}</HudCardShell>
}

function Workspace({ panels, className, request, onPanelDismiss, onPanelActivate, settingsTabs, navigationAction }: HudWorkspaceProps) {
  const phone = usePhoneHud()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [closed, setClosed] = useState<Set<HudPanelId>>(() => new Set())
  const [settingsTab, setSettingsTab] = useState<'Audio' | 'Account' | 'Tuning'>('Audio')
  const tuning = useLocalTuning()
  const [settings, setSettings] = useState(false)
  const [returnTo, setReturnTo] = useState<HudPanelId | 'settings'>('objects')
  const [openedPanel, setOpenedPanel] = useState(false)
  const [active, setActive] = useState<HudPanelId | null>('objects')
  const [announcement, setAnnouncement] = useState('')
  const restoreMapFocus = useRef(false)
  const recoveryRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef(new Map<HudPanelId, HTMLElement>())
  const pendingFocus = useRef<{ id: HudPanelId; origin: Element | null } | null>(null)
  const settingsId = useId()
  const panelPrefix = useId()
  const requestId = request?.id
  const requestSequence = request?.sequence
  const known = panels.map(panel => ({ id: panel.id, visible: !closed.has(panel.id), lane: panel.id === 'objects' ? 'left' : 'right' }))
  const visible = known.filter(item => item.visible && !panels.find(panel => panel.id === item.id)?.suspended)
  const activeId = (phone && !openedPanel) || active === null ? null : visible.some(item => item.id === active) ? active : visible[0]?.id

  const sheetOpen = phone && (settings || !!activeId)
  usePhoneSheet(sheetOpen, workspaceRef, 'workspace')
  useEffect(() => {
    if (phone && !sheetOpen && restoreMapFocus.current) { restoreMapFocus.current = false; recoveryRef.current?.focus({ preventScroll: true }) }
  }, [phone, sheetOpen])

  function toggle(id: HudPanelId) {
    const hidden = closed.has(id)
    setClosed(previous => { const next = new Set(previous); if (hidden) next.delete(id); else next.add(id); return next })
    const label = panels.find(panel => panel.id === id)!.label
    setAnnouncement(`${label} ${hidden ? 'shown' : 'hidden'}.`)
    if (hidden) setActive(id)
    else onPanelDismiss?.(id)
  }
  // Capture before passive child effects can select their own input or tab.
  // Focus is applied only after the reveal/activation commit below.
  useLayoutEffect(() => {
    pendingFocus.current = requestId
      ? { id: requestId, origin: document.activeElement }
      : null
  }, [requestId, requestSequence])

  useEffect(() => {
    if (!request || !panels.some(panel => panel.id === request.id)) return
    const item = known.find(panel => panel.id === request.id)!
    if (!item.visible) setClosed(previous => { const next = new Set(previous); next.delete(request.id); return next })
    setReturnTo(request.id)
    setOpenedPanel(true)
    setActive(request.id)
    setSettings(false)
    // Requests are explicit owner events. Ordinary card toggles must not replay one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id, request?.sequence])

  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const panel = panelRefs.current.get(pending.id)
    // Child focus and any intervening user focus movement always take priority.
    if (!panel || panel.contains(document.activeElement) || document.activeElement !== pending.origin) {
      pendingFocus.current = null
      return
    }
    if (activeId !== pending.id || !visible.some(item => item.id === pending.id)) return
    pendingFocus.current = null
    panel.focus({ preventScroll: true })
  })

  // Handoffs stay inside one sheet owner. Focus the destination tab, never a
  // hidden input (which would reopen the keyboard), without scrolling the page.
  useLayoutEffect(() => {
    if (!phone || !sheetOpen) return
    const focused = document.activeElement
    if (focused === document.body || focused?.closest('[hidden], [inert]')) {
      workspaceRef.current?.querySelector<HTMLButtonElement>(`[data-workspace-tab="${settings ? 'settings' : activeId}"][aria-pressed="true"]`)?.focus({ preventScroll: true })
    }
  }, [phone, sheetOpen, settings, activeId])

  function navigation(selected: HudPanelId | 'settings' | null, floating = false) {
    const controls = <nav className={styles.cardNavigation} aria-label="HUD panels" data-testid="hud-icon-navigation">
      {known.map(entry => {
        const destination = panels.find(panel => panel.id === entry.id)!
        return <HudButton presentation="chrome" selectionIndicator key={entry.id} ref={floating && returnTo === entry.id ? recoveryRef : undefined}
          data-workspace-tab={entry.id} aria-label={destination.label} title={destination.label} aria-controls={`${panelPrefix}-${entry.id}`}
          aria-pressed={selected === entry.id} onClick={() => {
            if (floating) setReturnTo(entry.id)
            if (!entry.visible) toggle(entry.id)
            setSettings(false); setOpenedPanel(true); setActive(entry.id)
            onPanelActivate?.(entry.id)
          }}><HudIcon icon={panelIcons[entry.id]} /></HudButton>
      })}
      {navigationAction}
      <HudButton presentation="chrome" selectionIndicator ref={floating && returnTo === 'settings' ? recoveryRef : undefined}
        data-workspace-tab="settings" aria-label="Settings" title="Settings" aria-controls={settingsId}
        aria-pressed={selected === 'settings'} onClick={() => { if (floating) setReturnTo('settings'); setSettings(true) }}>
        <HudIcon icon={Cog6ToothIcon} />
      </HudButton>
    </nav>
    return floating ? controls : <NavigationFrame paused={!sheetOpen || (selected === 'settings' ? !settings : settings || selected !== activeId)}>{controls}</NavigationFrame>
  }

  function hidePanel(id: HudPanelId) {
    toggle(id)
    workspaceRef.current?.querySelector<HTMLButtonElement>(`[data-workspace-tab="${id}"]`)?.focus({ preventScroll: true })
  }
  function closeSettings() { setSettings(false); if (phone) { if (activeId) onPanelDismiss?.(activeId); restoreMapFocus.current = true; setOpenedPanel(false); setActive(null) } else recoveryRef.current?.focus({ preventScroll: true }) }
  function closePanel() { if (activeId) onPanelDismiss?.(activeId); restoreMapFocus.current = true; setOpenedPanel(false); setActive(null) }

  const settingsNavigation = <div role="tablist" aria-label="Settings categories" className={styles.settingsTabs}>
    {(['Audio', 'Account', ...(tuning?.snapshot ? ['Tuning'] : [])] as const).map(tab => <HudButton key={tab} presentation="chrome" role="tab" aria-selected={settingsTab === tab} onClick={() => setSettingsTab(tab as typeof settingsTab)}>{tab}</HudButton>)}
  </div>
  const tuningOpen = settingsTab === 'Tuning' && !!tuning?.snapshot
  return <div ref={workspaceRef} className={clsx(styles.workspace, className)} data-testid="hud-workspace" data-mobile-open={sheetOpen} data-phone-sheet={sheetOpen} role={sheetOpen ? 'dialog' : undefined} aria-modal={sheetOpen || undefined} aria-label={sheetOpen ? settings ? 'Settings' : `${panels.find(panel => panel.id === activeId)?.label} panel` : undefined} tabIndex={sheetOpen ? -1 : undefined} onKeyDown={event => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || !workspaceRef.current?.contains(event.target as Node)) return
    if (event.key === 'Escape' && phone && sheetOpen) { event.stopPropagation(); if (settings) closeSettings(); else closePanel(); return }
    if (event.key === 'Escape' && settings && (settingsRef.current?.contains(event.target as Node) || (event.target as HTMLElement).closest(`[aria-controls="${settingsId}"]`))) { event.stopPropagation(); closeSettings(); return }
    if (!phone) {
      const target = event.target as HTMLElement
      const id = target.closest<HTMLElement>('[data-panel]')?.dataset.panel ?? target.closest<HTMLElement>('[data-workspace-tab]')?.dataset.workspaceTab
      if (visible.some(item => item.id === id)) { event.stopPropagation(); hidePanel(id as HudPanelId) }
    }
  }}>
    <div className={styles.recovery} hidden={phone && sheetOpen} inert={phone && sheetOpen}>
      <NavigationFrame paused={phone && sheetOpen}>
      {phone ? navigation(null, true) : <>
      <nav className={clsx(styles.launchers, styles.cardNavigation)} aria-label="HUD panels" data-testid="hud-desktop-navigation">
        {known.map(item => {
          const panel = panels.find(panel => panel.id === item.id)!
          return <HudButton key={item.id} presentation="chrome" selectionIndicator aria-label={`${panel.label}${!item.visible ? ' (hidden)' : ''}`} title={panel.label} data-workspace-tab={item.id} aria-pressed={item.visible} aria-controls={`${panelPrefix}-${item.id}`} onClick={() => { if (item.visible) hidePanel(item.id); else { toggle(item.id); setOpenedPanel(true); setActive(item.id); onPanelActivate?.(item.id) } }}><HudIcon icon={panelIcons[item.id]} /></HudButton>
        })}
        {navigationAction}
        <HudButton presentation="chrome" className={styles.settingsControl} ref={recoveryRef} aria-expanded={settings} aria-controls={settingsId} aria-label="Settings" title="Settings" onClick={() => { setSettings(value => !value) }}><HudIcon icon={Cog6ToothIcon} /></HudButton>
      </nav>
      </>}
      </NavigationFrame>
    </div>
    {settings && <div ref={settingsRef} id={settingsId} className={styles.settings}>
      <HudCardShell title="Settings" onClose={closeSettings} closeLabel={phone ? 'Return to map' : 'Close Settings'} header={settingsNavigation} hidden={tuningOpen} style={tuningOpen ? {display:'none'} : undefined}>
        <div role="tabpanel" aria-label="Audio" hidden={settingsTab !== 'Audio'}>{settingsTabs?.audio}</div>
        <div role="tabpanel" aria-label="Account" hidden={settingsTab !== 'Account'}>{settingsTabs?.account}</div>
      </HudCardShell>
      {tuningOpen && <TuningCard title="Settings" onClose={closeSettings} closeLabel={phone ? 'Return to map' : 'Close Settings'} header={settingsNavigation} />}

    </div>}
    <div className={styles.stage} aria-label="HUD workspace">
      {known.map(item => {
        const panel = panels.find(panel => panel.id === item.id)!
        const lanePanels = visible.filter(panel => panel.lane === item.lane)
        const index = lanePanels.findIndex(panel => panel.id === item.id)
        const span = 6 / Math.max(1, lanePanels.length)
        return <section key={item.id} ref={element => { if (element) panelRefs.current.set(item.id, element); else panelRefs.current.delete(item.id) }} tabIndex={-1} id={`${panelPrefix}-${item.id}`} aria-label={`${panel.label} panel`} hidden={!item.visible || panel.suspended || phone && (settings || activeId !== item.id)} inert={phone && (settings || activeId !== item.id)} data-panel={item.id} data-lane={item.lane} data-mobile-active={activeId === item.id} className={styles.panel} style={{ gridColumn: item.lane === 'left' ? '1' : '3', gridRow: `${index * span + 1} / span ${span}` }}>
          <TunableHudCard groups={panel.tuningGroups} title={panel.title ?? panel.label} paused={!item.visible || panel.suspended || phone && activeId !== item.id} className={styles.panelCard} contentClassName={styles.panelContent}
            onClose={phone ? closePanel : () => hidePanel(item.id)} closeLabel={phone ? 'Return to map' : `Close ${panel.label}`} header={panel.header} footer={panel.footer}>
            {panel.children}
          </TunableHudCard>
        </section>
      })}
    </div>
    <p role="status" aria-live="polite" className={styles.announcement}>{announcement}</p>
  </div>
}
