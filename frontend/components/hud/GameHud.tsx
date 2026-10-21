import type { HTMLAttributes, ReactNode, ComponentPropsWithRef } from 'react'
import styles from './game-hud.module.css'
import { HudHeading as ContentHeading, HudText } from './HudTypography'

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

export function HudHeading({ eyebrow, title, detail, className = '', ...props }: Omit<Props, 'title'> & {
  eyebrow?: string
  title: ReactNode
  detail?: ReactNode
}) {
  return <header {...props} className={`${styles.heading} ${className}`}>
    {eyebrow && <HudText variant="label">{eyebrow}</HudText>}
    <ContentHeading level={1} size="compact">{title}</ContentHeading>
    {detail && <HudText variant="secondary">{detail}</HudText>}
  </header>
}
