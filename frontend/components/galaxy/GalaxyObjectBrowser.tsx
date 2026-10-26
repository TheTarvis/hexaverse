'use client'

import { HudCardBack } from '@/components/hud/HudCardShell'

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ObjectSearch, emptyObjectSearch } from '@/components/space/ObjectSearch'
import type { GalaxyNode } from '@/lib/types/galaxy'
import { REGION_PALETTE } from './region-palette'
import styles from './galaxy-object-browser.module.css'

/** Browsing state stays mounted inside the workspace; inspecting never chooses a command fleet. */
export function GalaxyObjectBrowser({ nodes, selectedId, onSelect, children }: {
  nodes: GalaxyNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  children: ReactNode
}) {
  const [search, setSearch] = useState(emptyObjectSearch)
  const [browsing, setBrowsing] = useState(!selectedId)
  const [previous, setPrevious] = useState(selectedId)
  const rows = useRef(new Map<string, HTMLElement>())
  const searchRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const focusDetails = useRef(false)
  const detailsId = useId()
  if (previous !== selectedId) { setPrevious(selectedId); setBrowsing(!selectedId) }
  const details = !!selectedId && !browsing
  useLayoutEffect(() => {
    if (!details || !focusDetails.current) return
    focusDetails.current = false
    if (!backRef.current?.closest('[hidden], [inert]')) backRef.current?.focus({ preventScroll: true })
  }, [details, selectedId])
  function back() {
    setBrowsing(true)
    requestAnimationFrame(() => (rows.current.get(selectedId ?? '') ?? searchRef.current)?.focus({ preventScroll: true }))
  }
  return <div className={styles.browser} onKeyDown={event => {
    if (event.key === 'Escape' && details) { event.stopPropagation(); back() }
  }}>
    <div hidden={details} className={styles.search}>
      <ObjectSearch items={nodes.map(node => ({ id: node.id, name: node.name, kind: 'system', subtitle: `${REGION_PALETTE[node.region].label} · Class ${node.skeleton.starClass}${node.catalogueRef ? ` · ${node.catalogueRef}` : ''}` }))}
        value={search} onChange={setSearch} inputRef={searchRef}
        onSelect={id => { focusDetails.current = true; setBrowsing(false); onSelect(id) }}
        resultProps={item => ({
          ref: element => { if (element) rows.current.set(item.id, element); else rows.current.delete(item.id) },
          'aria-pressed': selectedId === item.id, 'aria-controls': detailsId, 'aria-expanded': details && selectedId === item.id,
          'data-testid': `galaxy-object-${item.id}`,
        })} />
    </div>
    <div id={detailsId} hidden={!!selectedId && !details}>
      {details && <HudCardBack destination="systems" ref={backRef} onClick={back} aria-label="Back to galaxy systems" />}
      {children}
    </div>
  </div>
}
