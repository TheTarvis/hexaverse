'use client'

import { createContext, forwardRef, lazy, Suspense, useContext, useEffect, useId, useRef, useState, type CSSProperties, type Ref, type ReactNode, type ComponentPropsWithoutRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftIcon, XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { HudIconButton, type HudIconButtonProps } from '@/components/hud/HudControls'
import { formatHudCardTitle, type HudCardTitle } from './hud-card-title'
import styles from './hud-card-shell.module.css'

const CardFrameContext = createContext(false)
const CardBackContext = createContext<HTMLDivElement | null>(null)

/** Back belongs to the owning frame even when the task is composed as a section. */
export const HudCardBack = forwardRef<HTMLButtonElement, Omit<HudIconButtonProps, 'icon' | 'label'> & { destination: string }>(function HudCardBack({ destination, ...props }, ref) {
  const host = useContext(CardBackContext)
  const button = <HudIconButton {...props} ref={ref} presentation="chrome" icon={ArrowLeftIcon} label={props['aria-label'] ?? `Back to ${destination}`} />
  return host ? createPortal(button, host) : button
})

const HudFrameLighting = lazy(() => import('./HudFrameLighting').then(module => ({ default: module.HudFrameLighting })))

function CardTitle({ id, title, scroll, paused }: { id: string; title: string; scroll: boolean; paused: boolean }) {
  const viewport = useRef<HTMLSpanElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)
  useEffect(() => {
    if (!scroll || !viewport.current || !text.current) return
    const measure = () => setDistance(Math.max(0, text.current!.scrollWidth - viewport.current!.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport.current)
    observer.observe(text.current)
    return () => observer.disconnect()
  }, [scroll, title])
  return <h2 id={id} data-slot="hud-title" title={title}
    className={clsx(styles.title, scroll && styles.scrollingTitle)} data-scrolling={scroll && distance > 0} data-paused={paused}
    style={{ '--title-travel': `${-distance}px`, '--title-duration': `${Math.max(10, distance / 22 + 6)}s` } as CSSProperties}>
    {scroll ? <span ref={viewport} className={styles.titleViewport}><span ref={text} className={styles.titleText}>{title}</span></span> : <span>{title}</span>}
  </h2>
}

export type HudCardShellProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title?: HudCardTitle
  onClose?: () => void
  closeLabel?: string
  contentClassName?: string
  lighting?: 'signal' | 'none'
  paused?: boolean
  /** Nested content shares its owning card's frame; detached overlays can opt in. */
  framing?: 'auto' | 'frame' | 'section'
  /** Stationary actions outside the scrolling content, against the lower frame. */
  footer?: ReactNode
  /** Stationary navigation/identity above the scrolling content. */
  header?: ReactNode
  toolbar?: ReactNode
  closeTestId?: string
  closeButtonRef?: Ref<HTMLButtonElement>
}

/** An unpositioned HUD surface. Callers own content, dimensions and dismissal state. */
export function HudCardShell({
  title: titleInput,
  onClose,
  closeLabel = 'Close card',
  contentClassName,
  lighting = 'signal',
  paused = false,
  framing = 'auto',
  toolbar,
  footer,
  header,
  closeTestId,
  closeButtonRef,
  className,
  children,
  ...props
}: HudCardShellProps) {
  const title = titleInput === undefined ? undefined : formatHudCardTitle(titleInput)
  const insideCard = useContext(CardFrameContext)
  const parentBackHost = useContext(CardBackContext)
  const [backHost, setBackHost] = useState<HTMLDivElement | null>(null)
  const section = framing === 'section' || framing === 'auto' && insideCard
  const titleId = useId()
  const shellRef = useRef<HTMLElement>(null)

  const chrome = <>
      {title && (
        <CardTitle id={titleId} title={title} scroll={!section} paused={paused} />
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
      {!section && <div className={styles.navigation} data-slot="hud-card-navigation">
        <div ref={setBackHost} className={styles.backHost} data-slot="hud-card-back" />
        {onClose && <HudIconButton ref={closeButtonRef} data-testid={closeTestId} data-slot="hud-close" data-mobile-close
          presentation="chrome" icon={XMarkIcon} label={closeLabel} onClick={onClose} />}
      </div>}
      {toolbar && <div className={styles.toolbar} data-slot="hud-toolbar">{toolbar}</div>}
      <CardFrameContext.Provider value={true}>
      <CardBackContext.Provider value={section ? parentBackHost : backHost}>
        <div className={styles.body} data-slot="hud-body">
          <div className={header || footer ? styles.footerLayout : styles.contentLayout} data-slot={footer ? 'hud-footer-layout' : 'hud-content-layout'}>
            {header && <div className={styles.header} data-slot="hud-header">{header}</div>}
            <div className={clsx(styles.content, contentClassName)} data-slot="hud-content">{children}</div>
            {footer && <div className={styles.footer} data-slot="hud-footer">{footer}</div>}
          </div>
        </div>
      </CardBackContext.Provider>
      </CardFrameContext.Provider>
    </section>
  )
}

/** A section inside an owning HUD card, with the existing section heading style. */
export function HudSection({ children, className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section {...props} data-slot="hud-section" className={clsx(styles.contentSection, className)}>{children}</section>
}
