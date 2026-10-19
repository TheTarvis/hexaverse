'use client'

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { HudText } from '@/components/hud/HudTypography'
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
  const [search, setSearch] = useState('')
  const [browsing, setBrowsing] = useState(!selectedId)
  const [previous, setPrevious] = useState(selectedId)
  const rows = useRef(new Map<string, HTMLElement>())
  const searchRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLElement>(null)
  const focusDetails = useRef(false)
  const detailsId = useId()
  if (previous !== selectedId) { setPrevious(selectedId); setBrowsing(!selectedId) }
  const details = !!selectedId && !browsing
  useLayoutEffect(() => {
    if (!details || !focusDetails.current) return
    focusDetails.current = false
    if (!backRef.current?.closest('[hidden], [inert]')) backRef.current?.focus({ preventScroll: true })
  }, [details, selectedId])
  const matches = nodes.filter(node => `${node.name} ${node.catalogueRef ?? ''} ${REGION_PALETTE[node.region].label} ${node.skeleton.starClass}`.toLowerCase().includes(search.trim().toLowerCase()))
  function back() {
    setBrowsing(true)
    requestAnimationFrame(() => (rows.current.get(selectedId ?? '') ?? searchRef.current)?.focus({ preventScroll: true }))
  }
  return <div className={styles.browser} onKeyDown={event => {
    if (event.key === 'Escape' && details) { event.stopPropagation(); back() }
  }}>
    <div hidden={details}>
      <div className={styles.search} data-testid="galaxy-search-header">
        <HudText variant="label">Known systems</HudText>
        <Input ref={searchRef} type="search" aria-label="Find a galaxy system" placeholder="Find a system, region, or star class…" autoComplete="off" spellCheck={false} enterKeyHint="search" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <div className={styles.rows}>
        {matches.map(node => <Button plain key={node.id} ref={element => { if (element) rows.current.set(node.id, element); else rows.current.delete(node.id) }} aria-controls={detailsId} aria-expanded={details && selectedId === node.id} data-testid={`galaxy-object-${node.id}`} onClick={() => { focusDetails.current = true; setBrowsing(false); onSelect(node.id) }}>
          <span><span className={`hud-type-compact ${styles.name}`}>{node.name}</span><small>{REGION_PALETTE[node.region].label} · Class {node.skeleton.starClass}{node.catalogueRef ? ` · ${node.catalogueRef}` : ''}</small></span><span aria-hidden="true">›</span>
        </Button>)}
        {!matches.length && <HudText role="status">No known systems match. Try a name, region, or star class.</HudText>}
      </div>
    </div>
    <div id={detailsId} hidden={!!selectedId && !details}>
      {details && <Button plain ref={backRef} onClick={back} aria-label="Back to galaxy systems">← Back to systems</Button>}
      {children}
    </div>
  </div>
}
