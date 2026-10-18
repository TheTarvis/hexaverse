'use client'

import type { ComponentPropsWithoutRef } from 'react'
import clsx from 'clsx'
import { SystemViewport } from '@/components/space/SystemViewport'
import { HudHeading } from './GameHud'
import { HudWorkspace, type HudWorkspaceProps } from './HudWorkspace'
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
  return <HudWorkspace {...props} className={clsx(styles.workspace, className)} />
}

export function GameViewVitals({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(styles.vitals, className)} />
}
