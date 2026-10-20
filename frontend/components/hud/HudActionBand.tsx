'use client'

import type { MouseEventHandler } from 'react'
import clsx from 'clsx'
import { HudButton } from './HudControls'
import styles from './hud-action-band.module.css'

export type HudBandAction = {
  id: string
  label: string
  onClick: MouseEventHandler<HTMLButtonElement>
  tone?: 'neutral' | 'warning' | 'danger'
  disabled?: boolean
  pending?: boolean
  pendingLabel?: string
}

type HudActionBandProps = {
  actions: readonly [HudBandAction, HudBandAction] | readonly [HudBandAction, HudBandAction, HudBandAction]
  label?: string
  className?: string
}

/** Integrated footer: two equal cells, or a wider center primary among three. */
export function HudActionBand({ actions, label = 'Card actions', className }: HudActionBandProps) {
  const busy = actions.some(action => action.pending)
  return <div role="group" aria-label={label} aria-busy={busy} data-slot="hud-action-band" data-count={actions.length} className={clsx(styles.band, className)}>
    {actions.map((action, index) => <HudButton key={action.id} appearance="crystal" shape="integrated" tone={action.tone} variant={index === 1 ? 'primary' : 'secondary'} data-primary={index === 1} pending={action.pending} pendingLabel={action.pendingLabel ?? `${action.label}…`} disabled={busy || action.disabled} onClick={action.onClick} className={styles.cell}>
      {action.label}
    </HudButton>)}
  </div>
}
