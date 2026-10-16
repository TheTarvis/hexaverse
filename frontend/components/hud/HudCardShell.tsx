'use client'

import { lazy, Suspense, useId, useRef, type ComponentPropsWithoutRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { Button } from '@/components/catalyst/button'
import styles from './hud-card-shell.module.css'

const HudFrameLighting = lazy(() => import('./HudFrameLighting').then(module => ({ default: module.HudFrameLighting })))

export type HudCardShellProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title?: string
  onClose?: () => void
  closeLabel?: string
  contentClassName?: string
  lighting?: 'signal' | 'none'
  paused?: boolean
}

/** An unpositioned HUD surface. Callers own content, dimensions and dismissal state. */
export function HudCardShell({
  title,
  onClose,
  closeLabel = 'Close card',
  contentClassName,
  lighting = 'signal',
  paused = false,
  className,
  children,
  ...props
}: HudCardShellProps) {
  const titleId = useId()
  const shellRef = useRef<HTMLElement>(null)

  return (
    <section
      data-slot="hud-card"
      ref={shellRef}
      aria-labelledby={title ? titleId : undefined}
      {...props}
      className={clsx(styles.shell, className)}
    >
      <div aria-hidden="true" className={styles.surface} />
      <div aria-hidden="true" className={styles.lights}>
        {['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((corner) => (
          <svg key={corner} className={styles[corner]} viewBox="0 0 32 32" fill="none">
            <path d="M8 25 L25 8" />
          </svg>
        ))}
      </div>
      {lighting === 'signal' && (
        <Suspense fallback={null}>
          <HudFrameLighting hostRef={shellRef} paused={paused} />
        </Suspense>
      )}
      {title && (
        <h2 id={titleId} data-slot="hud-title" className={styles.title} title={title}>
          <span>{title}</span>
        </h2>
      )}
      {onClose && (
        <Button
          plain
          type="button"
          data-slot="hud-close"
          aria-label={closeLabel}
          onClick={onClose}
          className={styles.close}
        >
          <XMarkIcon aria-hidden="true" />
        </Button>
      )}
      <div className={styles.body}>
        <div className={clsx(styles.content, contentClassName)}>{children}</div>
      </div>
    </section>
  )
}
