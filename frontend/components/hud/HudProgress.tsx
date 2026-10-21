import type { ComponentPropsWithoutRef } from 'react'
import clsx from 'clsx'
import styles from './hud-progress.module.css'

type HudProgressProps = Omit<ComponentPropsWithoutRef<'progress'>, 'value' | 'max' | 'children'> & {
  value: number
  max?: number
  label: string
}

/** Determinate progress only; callers own time, completion and accompanying figures. */
export function HudProgress({ value, max = 100, label, className, ...props }: HudProgressProps) {
  const ceiling = Number.isFinite(max) && max > 0 ? max : 100
  const completed = Number.isFinite(value) ? Math.max(0, Math.min(ceiling, value)) : 0
  return <progress {...props} aria-label={label} value={completed} max={ceiling} className={clsx(styles.bar, className)} />
}
