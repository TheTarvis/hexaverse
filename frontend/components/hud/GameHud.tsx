import type { HTMLAttributes, ReactNode, ComponentPropsWithRef } from 'react'
import { CONSOLE_DOCK_LANE_COLUMN } from '@/lib/console-dock-layout'
import styles from './game-hud.module.css'

type Props = HTMLAttributes<HTMLElement>

/** Presentation only: callers retain selection, queries and command ownership. */
export function HudRoot({ className = '', ...props }: ComponentPropsWithRef<'div'>) {
  return <div {...props} className={`${styles.theme} ${styles.root} ${className}`} />
}

export function HudPanel({ as: Element = 'section', tone = 'default', className = '', ...props }: Props & {
  as?: 'section' | 'aside' | 'div' | 'nav' | 'li'
  tone?: 'default' | 'warning' | 'navigation' | 'inset'
}) {
  return <Element {...props} className={`${styles.theme} ${styles.panel} ${tone === 'default' ? '' : styles[tone]} ${className}`} />
}

export function HudColumn({ side = 'right', paired = false, dockAware = false, className = '', ...props }: HTMLAttributes<HTMLDivElement> & {
  side?: 'left' | 'right'
  paired?: boolean
  dockAware?: boolean
}) {
  return <div {...props} className={`${styles.column} ${styles[side]} ${dockAware ? CONSOLE_DOCK_LANE_COLUMN : side === 'left' ? 'bottom-[200px]' : 'bottom-20'} ${paired ? styles.paired : ''} ${className}`} />
}

export function HudHeading({ eyebrow, title, detail, className = '', ...props }: Omit<Props, 'title'> & {
  eyebrow?: string
  title: ReactNode
  detail?: ReactNode
}) {
  return <header {...props} className={`${styles.heading} ${className}`}>
    {eyebrow && <p>{eyebrow}</p>}
    <h1>{title}</h1>
    {detail && <p>{detail}</p>}
  </header>
}
