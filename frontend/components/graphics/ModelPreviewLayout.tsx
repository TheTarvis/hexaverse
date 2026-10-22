'use client'

import type { CSSProperties, ReactNode } from 'react'
import { ViewfinderCircleIcon } from '@heroicons/react/24/outline'
import { HudIconButton } from '@/components/hud/HudControls'
import styles from './model-preview-layout.module.css'

type Props = {
  children: ReactNode
  onReset: () => void
  resetTestId?: string
  className?: string
  style?: CSSProperties
}

/** Shared model/action-preview layout. Keep overlay controls outside orbit input. */
export function ModelPreviewLayout({ children, onReset, resetTestId, className, style }: Props) {
  return <div data-slot="model-preview-layout" className={`${styles.layout} ${className ?? ''}`} style={style}>
    {children}
    <div className={styles.tools}
      onPointerDown={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}>
      <HudIconButton presentation="chrome" icon={ViewfinderCircleIcon} label="Reset view" data-testid={resetTestId}
        onClick={event => { event.stopPropagation(); onReset() }} />
    </div>
  </div>
}
