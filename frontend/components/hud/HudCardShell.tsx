'use client'

import { createContext, lazy, Suspense, useContext, useId, useRef, type Ref, type ReactNode, type ComponentPropsWithoutRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { HudButton } from '@/components/hud/HudControls'
import styles from './hud-card-shell.module.css'

const CardFrameContext = createContext(false)

const HudFrameLighting = lazy(() => import('./HudFrameLighting').then(module => ({ default: module.HudFrameLighting })))

export type HudCardShellProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title?: string
  onClose?: () => void
  closeLabel?: string
  contentClassName?: string
  lighting?: 'signal' | 'none'
  paused?: boolean
  /** Nested content shares its owning card's frame; detached overlays can opt in. */
  framing?: 'auto' | 'frame' | 'section'
  /** Stationary actions outside the scrolling content, against the lower frame. */
  footer?: ReactNode
  toolbar?: ReactNode
  closeTestId?: string
  closeButtonRef?: Ref<HTMLButtonElement>
}

/** An unpositioned HUD surface. Callers own content, dimensions and dismissal state. */
export function HudCardShell({
  title,
  onClose,
  closeLabel = 'Close card',
  contentClassName,
  lighting = 'signal',
  paused = false,
  framing = 'auto',
  toolbar,
  footer,
  closeTestId,
  closeButtonRef,
  className,
  children,
  ...props
}: HudCardShellProps) {
  const insideCard = useContext(CardFrameContext)
  const section = framing === 'section' || framing === 'auto' && insideCard
  const titleId = useId()
  const shellRef = useRef<HTMLElement>(null)

  const chrome = <>
      {title && (
        <h2 id={titleId} data-slot="hud-title" className={styles.title} title={title}>
          <span>{title}</span>
        </h2>
      )}
      {onClose && !section && (
        <HudButton
          presentation="chrome"
          type="button"
          ref={closeButtonRef}
          data-testid={closeTestId}
          data-slot="hud-close"
          data-mobile-close
          aria-label={closeLabel}
          onClick={onClose}
          className={styles.close}
        >
          <XMarkIcon aria-hidden="true" />
        </HudButton>
      )}
  </>

  return (
    <section
      data-slot="hud-card"
      data-hud-framing={section ? 'section' : 'frame'}
      ref={shellRef}
      aria-labelledby={props['aria-label'] ? undefined : title ? titleId : undefined}
      {...props}
      className={clsx(styles.shell, section && styles.section, className)}
    >
      {!section && <><div aria-hidden="true" className={styles.surface} />
      <div aria-hidden="true" data-slot="hud-frame-corners" className={styles.lights}>
        {['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((corner) => (
          <svg key={corner} className={styles[corner]} viewBox="0 0 32 32" fill="none">
            <path d="M8 25 L25 8" />
          </svg>
        ))}
      </div></>}
      {!section && lighting === 'signal' && (
        <Suspense fallback={null}>
          <HudFrameLighting hostRef={shellRef} paused={paused} />
        </Suspense>
      )}
      {chrome}
      {toolbar && <div className={styles.toolbar} data-slot="hud-toolbar">{toolbar}</div>}
      <CardFrameContext.Provider value={true}>
        <div className={styles.body} data-slot="hud-body">
          <div className={footer ? styles.footerLayout : styles.contentLayout} data-slot={footer ? 'hud-footer-layout' : 'hud-content-layout'}>
            <div className={clsx(styles.content, contentClassName)} data-slot="hud-content">{children}</div>
            {footer && <div className={styles.footer} data-slot="hud-footer">{footer}</div>}
          </div>
        </div>
      </CardFrameContext.Provider>
    </section>
  )
}

/** A section inside an owning HUD card, with the existing section heading style. */
export function HudSection({ children, className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section {...props} data-slot="hud-section" className={clsx(styles.contentSection, className)}>{children}</section>
}
