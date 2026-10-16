import type { ComponentPropsWithoutRef } from 'react'
import clsx from 'clsx'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import styles from './hud-typography.module.css'

type HudHeadingProps = ComponentPropsWithoutRef<typeof Heading> & {
  variant?: 'identity' | 'section'
  size?: 'default' | 'compact'
}

/** Visual hierarchy is independent of the document's semantic heading level. */
export function HudHeading({ variant = 'identity', size = 'default', level = 3, className, ...props }: HudHeadingProps) {
  return <Heading {...props} level={level} className={clsx(styles.heading, styles[variant], size === 'compact' && styles.compact, className)} />
}

type HudTextProps = ComponentPropsWithoutRef<typeof Text> & {
  variant?: 'body' | 'secondary' | 'label' | 'caption'
}

export function HudText({ variant = 'body', className, ...props }: HudTextProps) {
  return <Text {...props} className={clsx(styles.text, styles[variant], className)} />
}

/** Tabular figures with caller-supplied units; long values can wrap. */
export function HudValue({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(styles.value, className)} />
}
