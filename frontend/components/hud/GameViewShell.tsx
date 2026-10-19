'use client'

import type { ComponentPropsWithoutRef } from 'react'
import clsx from 'clsx'
import { SystemViewport } from '@/components/space/SystemViewport'
import { HudHeading } from './GameHud'
import { HudWorkspace, type HudWorkspaceProps } from './HudWorkspace'
import { GameAccountSettings } from './GameAccountSettings'
import { GameMusicControls } from '@/components/audio/GameMusicControls'
import { HudHeading as HudContentHeading } from './HudTypography'
import styles from './game-view-shell.module.css'

/** Shared presentation only. Routes retain queries, selection, commands and renderer ownership. */
export function GameViewShell({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <SystemViewport {...props} className={clsx(styles.root, className)} />
}

export function GameViewHeading({ className, ...props }: ComponentPropsWithoutRef<typeof HudHeading>) {
  return <HudHeading {...props} className={clsx(styles.identity, className)} />
}

export function GameViewScene({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(styles.scene, className)} />
}

export function GameViewWorkspace({ className, ...props }: HudWorkspaceProps) {
  return <HudWorkspace settingsContent={<><GameMusicControls /><GameAccountSettings /></>} {...props} className={clsx(styles.workspace, className)} />
}

export function GameViewVitals({ className, placement = 'footer', children, ...props }: ComponentPropsWithoutRef<'div'> & { placement?: 'footer' | 'panel' }) {
  return <div {...props} className={clsx(placement === 'panel' ? styles.telemetry : styles.vitals, className)}>
    {placement === 'panel' && <HudContentHeading variant="section" level={3}>Telemetry</HudContentHeading>}
    {children}
  </div>
}
