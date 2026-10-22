'use client'

import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { HudButton } from '@/components/hud/HudControls'
import { HudCardShell } from './HudCardShell'
import { HudIcon } from './HudIcon'
import { MagnifyingGlassIcon, RocketLaunchIcon, QueueListIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import styles from './hud-workspace.module.css'
import { usePhoneHud, usePhoneSheet } from '@/hooks/use-phone-sheet'

export type HudPanelId = 'objects' | 'fleets' | 'fleet-status'
const panelIcons = { objects: MagnifyingGlassIcon, fleets: QueueListIcon, 'fleet-status': RocketLaunchIcon }
type Lane = 'left' | 'right' | 'bottom'
type Layout = { id: HudPanelId; lane: Lane; visible: boolean }[]
export interface HudWorkspacePanel { id: HudPanelId; label: string; children: ReactNode; footer?: ReactNode; suspended?: boolean }
export interface HudWorkspaceProps { onPanelDismiss?: (id: HudPanelId) => void; onPanelActivate?: (id: HudPanelId) => void; corporationId: string; panels: HudWorkspacePanel[]; className?: string; request?: { id: HudPanelId; sequence: number }; settingsContent?: ReactNode; navigationAction?: ReactNode }
const defaults: Layout = [
  { id: 'objects', lane: 'left', visible: true },
  { id: 'fleets', lane: 'right', visible: true },
  { id: 'fleet-status', lane: 'right', visible: true },
]

function readLayout(raw: string | null): Layout {
  if (!raw) return defaults
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return defaults
    const seen = new Set<string>()
    const valid: Layout = []
    for (const entry of data) {
      if (!entry || typeof entry !== 'object') continue
      const { id, lane, visible } = entry
      const panelId = id === 'command' ? 'fleets' : id
      if (!defaults.some(panel => panel.id === panelId) || seen.has(panelId) || !['left', 'right', 'bottom'].includes(lane) || typeof visible !== 'boolean') continue
      valid.push({ id: panelId, lane, visible }); seen.add(panelId)
    }
    return [...valid, ...defaults.filter(panel => !seen.has(panel.id))]
  } catch { return defaults }
}

/** Presentation only. Keep navigation outside this overlay, and panel content unpositioned. */
export function HudWorkspace(props: HudWorkspaceProps) {
  return <Workspace key={props.corporationId} {...props} />
}

function NavigationFrame({ children, paused = false }: { children: ReactNode; paused?: boolean }) {
  return <HudCardShell framing="frame" className={styles.navigationShell} paused={paused}>{children}</HudCardShell>
}

function Workspace({ corporationId, panels, className, request, onPanelDismiss, onPanelActivate, settingsContent, navigationAction }: HudWorkspaceProps) {
  const phone = usePhoneHud()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const storageKey = `hexaverse:hud-layout:v1:${corporationId}`
  const [layout, setLayout] = useState<Layout>(defaults)
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState(false)
  const [returnTo, setReturnTo] = useState<HudPanelId | 'arrange'>('objects')
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
  const known = layout.filter(item => panels.some(panel => panel.id === item.id))
  const visible = known.filter(item => item.visible && !panels.find(panel => panel.id === item.id)?.suspended)
  const activeId = (phone && !openedPanel) || active === null ? null : visible.some(item => item.id === active) ? active : visible[0]?.id

  const sheetOpen = phone && (settings || !!activeId)
  usePhoneSheet(sheetOpen, workspaceRef, 'workspace')
  useEffect(() => {
    if (phone && !sheetOpen && restoreMapFocus.current) { restoreMapFocus.current = false; recoveryRef.current?.focus({ preventScroll: true }) }
  }, [phone, sheetOpen])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey), clean = readLayout(raw)
      setLayout(clean)
      const previous: unknown = raw ? JSON.parse(raw) : null
      if (Array.isArray(previous) && previous.some(entry => entry?.id === 'console' || entry?.id === 'command')) window.localStorage.setItem(storageKey, JSON.stringify(clean))
    }
    catch { setAnnouncement('Preferences unavailable on this device. You can still arrange the HUD.') }
    setReady(true)
  }, [storageKey])

  function change(next: Layout, message: string) {
    setLayout(next)
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); setAnnouncement(message) }
    catch { setAnnouncement(`${message} Preferences could not be saved on this device.`) }
  }
  function toggle(id: HudPanelId) {
    const item = layout.find(item => item.id === id)!
    const label = panels.find(panel => panel.id === id)!.label
    change(layout.map(panel => panel.id === id ? { ...panel, visible: !panel.visible } : panel), `${label} ${item.visible ? 'hidden' : 'shown'}.`)
    if (!item.visible) setActive(id)
    else onPanelDismiss?.(id)
  }
  function move(id: HudPanelId, lane: Lane) {
    const item = layout.find(item => item.id === id)!
    if (item.lane === lane) return
    change([...layout.filter(panel => panel.id !== id), { ...item, lane }], `${panels.find(panel => panel.id === id)!.label} moved to ${lane}.`)
  }
  function reorder(id: HudPanelId, direction: -1 | 1) {
    const index = layout.findIndex(item => item.id === id)
    const neighbors = layout.map((item, index) => ({ ...item, index })).filter(item => item.lane === layout[index].lane && panels.some(panel => panel.id === item.id))
    const neighbor = neighbors[neighbors.findIndex(item => item.id === id) + direction]
    if (!neighbor) return
    const next = [...layout]
    ;[next[index], next[neighbor.index]] = [next[neighbor.index], next[index]]
    change(next, `${panels.find(panel => panel.id === id)!.label} moved ${direction === -1 ? 'up' : 'down'}.`)
  }
  // Capture before passive child effects can select their own input or tab.
  // Focus is applied only after the reveal/activation commit below.
  useLayoutEffect(() => {
    pendingFocus.current = ready && requestId
      ? { id: requestId, origin: document.activeElement }
      : null
  }, [ready, requestId, requestSequence])

  useEffect(() => {
    if (!ready || !request || !panels.some(panel => panel.id === request.id)) return
    const item = layout.find(panel => panel.id === request.id)!
    if (!item.visible) change(layout.map(panel => panel.id === request.id ? { ...panel, visible: true } : panel), `${panels.find(panel => panel.id === request.id)!.label} shown.`)
    setReturnTo(request.id)
    setOpenedPanel(true)
    setActive(request.id)
    setSettings(false)
    // Requests are explicit owner events. Ordinary layout edits must not replay one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, request?.id, request?.sequence])

  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const panel = panelRefs.current.get(pending.id)
    // Child focus and any intervening user focus movement always take priority.
    if (!panel || panel.contains(document.activeElement) || document.activeElement !== pending.origin) {
      pendingFocus.current = null
      return
    }
    if (!ready || activeId !== pending.id || !visible.some(item => item.id === pending.id)) return
    pendingFocus.current = null
    panel.focus({ preventScroll: true })
  })

  // Handoffs stay inside one sheet owner. Focus the destination tab, never a
  // hidden input (which would reopen the keyboard), without scrolling the page.
  useLayoutEffect(() => {
    if (!phone || !sheetOpen) return
    const focused = document.activeElement
    if (focused === document.body || focused?.closest('[hidden], [inert]')) {
      workspaceRef.current?.querySelector<HTMLButtonElement>(`[data-workspace-tab="${settings ? 'arrange' : activeId}"][aria-pressed="true"]`)?.focus({ preventScroll: true })
    }
  }, [phone, sheetOpen, settings, activeId])

  function navigation(selected: HudPanelId | 'arrange' | null, floating = false) {
    const controls = <nav className={styles.cardNavigation} aria-label="HUD panels" data-testid="hud-icon-navigation">
      {known.map(entry => {
        const destination = panels.find(panel => panel.id === entry.id)!
        return <HudButton presentation="chrome" selectionIndicator key={entry.id} disabled={!ready} ref={floating && returnTo === entry.id ? recoveryRef : undefined}
          data-workspace-tab={entry.id} aria-label={destination.label} title={destination.label} aria-controls={`${panelPrefix}-${entry.id}`}
          aria-pressed={selected === entry.id} onClick={() => {
            if (floating) setReturnTo(entry.id)
            if (!entry.visible) toggle(entry.id)
            setSettings(false); setOpenedPanel(true); setActive(entry.id)
            onPanelActivate?.(entry.id)
          }}><HudIcon icon={panelIcons[entry.id]} /></HudButton>
      })}
      {navigationAction}
      <HudButton presentation="chrome" selectionIndicator disabled={!ready} ref={floating && returnTo === 'arrange' ? recoveryRef : undefined}
        data-workspace-tab="arrange" aria-label="Arrange HUD" title="Arrange HUD" aria-controls={settingsId}
        aria-pressed={selected === 'arrange'} onClick={() => { if (floating) setReturnTo('arrange'); setSettings(true) }}>
        <HudIcon icon={Cog6ToothIcon} />
      </HudButton>
    </nav>
    return floating ? controls : <NavigationFrame paused={!sheetOpen || (selected === 'arrange' ? !settings : settings || selected !== activeId)}>{controls}</NavigationFrame>
  }

  function closeSettings() { setSettings(false); if (phone) { if (activeId) onPanelDismiss?.(activeId); restoreMapFocus.current = true; setOpenedPanel(false); setActive(null) } else recoveryRef.current?.focus({ preventScroll: true }) }
  function closePanel() { if (activeId) onPanelDismiss?.(activeId); restoreMapFocus.current = true; setOpenedPanel(false); setActive(null) }
  function reset() {
    setLayout(defaults); setActive('objects')
    try { window.localStorage.removeItem(storageKey); setAnnouncement('Default HUD layout restored.') }
    catch { setAnnouncement('Default HUD layout restored. Saved preferences could not be removed on this device.') }
  }

  return <div ref={workspaceRef} className={clsx(styles.workspace, className)} data-testid="hud-workspace" data-mobile-open={sheetOpen} data-phone-sheet={sheetOpen} role={sheetOpen ? 'dialog' : undefined} aria-modal={sheetOpen || undefined} aria-label={sheetOpen ? settings ? 'Arrange HUD' : `${panels.find(panel => panel.id === activeId)?.label} panel` : undefined} tabIndex={sheetOpen ? -1 : undefined} onKeyDown={event => {
    if (event.key === 'Escape' && phone && sheetOpen) { event.stopPropagation(); if (settings) closeSettings(); else closePanel(); return }
    if (event.key === 'Escape' && settings && settingsRef.current?.contains(event.target as Node)) { event.stopPropagation(); closeSettings() }
  }}>
    <div className={styles.recovery} hidden={phone && sheetOpen} inert={phone && sheetOpen}>
      <NavigationFrame paused={phone && sheetOpen}>
      {phone ? navigation(null, true) : <>
      <nav className={clsx(styles.launchers, styles.cardNavigation)} aria-label="HUD panels" data-testid="hud-desktop-navigation">
        {known.map(item => {
          const panel = panels.find(panel => panel.id === item.id)!
          return <HudButton key={item.id} presentation="chrome" selectionIndicator aria-label={`${panel.label}${!item.visible ? ' (hidden)' : ''}`} title={panel.label} disabled={!ready} aria-pressed={item.visible && activeId === item.id} aria-controls={`${panelPrefix}-${item.id}`} onClick={() => { if (!item.visible) toggle(item.id); setOpenedPanel(true); setActive(item.visible && activeId === item.id ? null : item.id); if (!item.visible || activeId !== item.id) onPanelActivate?.(item.id) }}><HudIcon icon={panelIcons[item.id]} /></HudButton>
        })}
        {navigationAction}
        <HudButton presentation="chrome" className={styles.arrangeControl} ref={recoveryRef} aria-expanded={settings} aria-controls={settingsId} aria-label="Arrange HUD" title="Arrange HUD" onClick={() => { setSettings(value => !value) }}><HudIcon icon={Cog6ToothIcon} /></HudButton>
      </nav>
      </>}
      </NavigationFrame>
    </div>
    {settings && <div ref={settingsRef} id={settingsId} className={styles.settings}>
      <HudCardShell title="Arrange HUD" toolbar={phone ? navigation('arrange') : undefined} onClose={closeSettings} closeLabel="Close HUD settings">
        <p className={styles.hint}>Choose what stays on screen. Move panels between docks and change their order.</p>
        {known.map(item => {
          const panel = panels.find(panel => panel.id === item.id)!
          const lanePanels = known.filter(panel => panel.lane === item.lane)
          const index = lanePanels.findIndex(panel => panel.id === item.id)
          return <fieldset key={item.id} disabled={!ready} className={styles.settingRow}>
            <legend>{panel.label}</legend>
            <HudButton aria-label={`Show ${panel.label}`} aria-pressed={item.visible} onClick={() => toggle(item.id)}>{item.visible ? 'Shown' : 'Hidden'}</HudButton>
            <div role="group" aria-label={`${panel.label} dock`} className={styles.moves}>
              {(['left', 'right', 'bottom'] as const).map(lane => <HudButton key={lane} aria-label={`Move ${panel.label} to ${lane}`} aria-pressed={item.lane === lane} onClick={() => move(item.id, lane)}>{lane}</HudButton>)}
            </div>
            <div className={styles.moves}>
              <HudButton aria-label={`Move ${panel.label} up`} disabled={index === 0} onClick={() => reorder(item.id, -1)}>↑</HudButton>
              <HudButton aria-label={`Move ${panel.label} down`} disabled={index === lanePanels.length - 1} onClick={() => reorder(item.id, 1)}>↓</HudButton>
            </div>
          </fieldset>
        })}
        <HudButton disabled={!ready} onClick={reset}>Reset HUD layout</HudButton>
        {settingsContent}
      </HudCardShell>
    </div>}
    <div className={styles.stage} aria-label="HUD workspace">
      {known.map(item => {
        const panel = panels.find(panel => panel.id === item.id)!
        const lanePanels = visible.filter(panel => panel.lane === item.lane)
        const index = lanePanels.findIndex(panel => panel.id === item.id)
        const span = 6 / Math.max(1, lanePanels.length)
        return <section key={item.id} ref={element => { if (element) panelRefs.current.set(item.id, element); else panelRefs.current.delete(item.id) }} tabIndex={-1} id={`${panelPrefix}-${item.id}`} aria-label={`${panel.label} panel`} hidden={!item.visible || panel.suspended || phone && (settings || activeId !== item.id)} inert={phone && (settings || activeId !== item.id)} data-panel={item.id} data-lane={item.lane} data-mobile-active={activeId === item.id} className={styles.panel} style={{ gridColumn: item.lane === 'left' ? '1' : item.lane === 'right' ? '3' : '1 / -1', gridRow: item.lane === 'bottom' ? `${7 + index}` : `${index * span + 1} / span ${span}` }}>
          <HudCardShell title={panel.label} paused={!item.visible || panel.suspended || phone && activeId !== item.id} className={styles.panelCard} contentClassName={styles.panelContent}
            closeLabel={phone ? `Close ${panel.label} panel` : `Hide ${panel.label}`}
            onClose={phone ? closePanel : () => { recoveryRef.current?.focus({ preventScroll: true }); toggle(item.id) }}
            toolbar={phone ? navigation(item.id) : undefined} footer={panel.footer}>
            {panel.children}
          </HudCardShell>
        </section>
      })}
    </div>
    <p role="status" aria-live="polite" className={styles.announcement}>{announcement}</p>
  </div>
}
