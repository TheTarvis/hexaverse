'use client'

import { HudCardBack, HudCardShell } from '@/components/hud/HudCardShell'
import type { HudCardTitle } from '@/components/hud/hud-card-title'
import { ObjectSearch, type ObjectSearchProps } from './ObjectSearch'
import styles from './object-search-card.module.css'

export type ObjectSearchCardProps = ObjectSearchProps & {
  frameHost?: 'card' | 'workspace'
  title?: HudCardTitle
  className?: string
  hidden?: boolean
  onClose: () => void
  onBack?: () => void
  backDestination?: string
}

/** Reusable framed host; callers own search state, candidates and selection handoff. */
export function ObjectSearchCard({ title = 'Objects', frameHost = 'card', className, hidden, onClose, onBack, backDestination = 'previous view', ...search }: ObjectSearchCardProps) {
  return <HudCardShell title={frameHost === 'workspace' ? undefined : title} hidden={hidden} paused={hidden} onClose={onClose} closeLabel="Close object search" className={`${styles.card} ${className ?? ''}`} contentClassName={styles.content}>
    {onBack && <HudCardBack destination={backDestination} onClick={onBack} />}
    <ObjectSearch {...search} />
  </HudCardShell>
}
