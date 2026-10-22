'use client'

import { useId, useRef, type ReactNode } from 'react'
import { HudButton } from './HudControls'
import styles from './hud-card-tabs.module.css'

type Tab = { id: string; label: string; content: ReactNode }

/** A manually controlled card section: direct tabs, keyboard navigation and horizontal swipe. */
export function HudCardTabs({ tabs, value, onChange, label }: { tabs: readonly Tab[]; value: string; onChange: (id: string) => void; label: string }) {
  const id = useId()
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const gesture = useRef<{ x: number; y: number } | null>(null)
  const suppressClickUntil = useRef(0)
  const index = Math.max(0, tabs.findIndex(tab => tab.id === value))
  return <div className={styles.deck} data-slot="hud-card-tabs">
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {tabs.map((tab, position) => <HudButton key={tab.id} ref={element => { if (element) buttons.current.set(tab.id, element); else buttons.current.delete(tab.id) }} presentation="action" shape="integrated" role="tab" id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`} aria-selected={index === position} tabIndex={index === position ? 0 : -1} className={styles.tab} onClick={() => onChange(tab.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
        if (next === null) return
        event.preventDefault()
        onChange(tabs[next].id)
        buttons.current.get(tabs[next].id)?.focus()
      }}>{tab.label}</HudButton>)}
    </div>
    <div className={styles.pages} onTouchStart={event => {
      const target = event.target as HTMLElement
      gesture.current = event.touches.length === 1 && !target.closest('input, select, textarea, [role="slider"]') ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
    }} onTouchMove={event => { if (event.touches.length !== 1) gesture.current = null }} onTouchCancel={() => { gesture.current = null }} onTouchEnd={event => {
      const start = gesture.current
      gesture.current = null
      if (!start || event.touches.length || event.changedTouches.length !== 1) return
      const dx = event.changedTouches[0].clientX - start.x
      const dy = event.changedTouches[0].clientY - start.y
      if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.5) return
      const next = index + (dx < 0 ? 1 : -1)
      // A swipe must never also activate the command under the finger.
      suppressClickUntil.current = Date.now() + 400
      if (next >= 0 && next < tabs.length) onChange(tabs[next].id)
    }} onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation() } }}>
      {tabs.map((tab, position) => <div key={tab.id} id={`${id}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.id}`} hidden={index !== position} tabIndex={0} className={styles.panel}>{tab.content}</div>)}
    </div>
  </div>
}
