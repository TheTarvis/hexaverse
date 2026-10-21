'use client'

import { forwardRef, type ComponentPropsWithoutRef, type ComponentType, type ReactElement, type ReactNode, type Ref, type RefAttributes, type SVGProps } from 'react'
import clsx from 'clsx'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { Button, buttonClassName, TouchTarget } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { HudIcon } from './HudIcon'
import styles from './hud-controls.module.css'
import crystal from './hud-crystal.module.css'

type HudActionStyle = {
  variant?: 'primary' | 'secondary' | 'quiet'
  tone?: 'neutral' | 'warning' | 'danger'
  /** Action is the accepted Lens; other presentations preserve structured targets. */
  presentation?: 'action' | 'row' | 'chrome' | 'map'
  /** Paired cyan markers for selected chrome controls, driven by aria-pressed. */
  selectionIndicator?: boolean
  /** Standard is reserved for comparison stories and account/auth application styling. */
  appearance?: 'standard' | 'crystal'
  /** Existing application primaries: dark auth/gates, cyan first-identity setup. Ignored by Lens. */
  standardColor?: 'dark' | 'cyan'
  shape?: 'standalone' | 'integrated'
  pending?: boolean
  pendingLabel?: string
  disabled?: boolean
  children: ReactNode
}

export type HudButtonProps = HudActionStyle & Omit<ComponentPropsWithoutRef<'button'>, keyof HudActionStyle | 'color'> & { href?: never }
export type HudLinkButtonProps = HudActionStyle & Omit<ComponentPropsWithoutRef<'a'>, keyof HudActionStyle | 'color' | 'href' | 'type'> & { href: string; type?: never }
type HudActionProps = HudButtonProps | HudLinkButtonProps

type HudButtonComponent = {
  (props: HudButtonProps & RefAttributes<HTMLButtonElement>): ReactElement
  (props: HudLinkButtonProps & RefAttributes<HTMLAnchorElement>): ReactElement
}

/** Sole HUD action implementation. Native semantics, material and states live here. */
export const HudButton = forwardRef<HTMLElement, HudActionProps>(function HudButton({
  variant = 'secondary', tone = 'neutral', presentation = 'action', appearance = 'crystal', selectionIndicator = false,
  standardColor = 'cyan', shape = 'standalone', pending = false, pendingLabel = 'Working…', disabled = false,
  children, className, ...props
}, ref) {
  const unavailable = disabled || pending
  const framed = presentation === 'action'
  const isCrystal = framed && appearance === 'crystal'
  const catalystAppearance = !framed || isCrystal || variant === 'quiet' ? { plain: true as const }
    : tone === 'danger' ? { color: 'red' as const } : tone === 'warning' ? { color: 'amber' as const }
      : variant === 'primary' ? { color: standardColor } : { outline: true as const }
  // Standard application controls keep Catalyst's light/dark recipe and metrics.
  const standard = framed && appearance === 'standard'
  const classes = clsx(!standard && [styles.button, framed ? styles[variant] : [styles.unframed, styles[presentation]],
    tone !== 'neutral' && styles[tone], selectionIndicator && presentation === 'chrome' && styles.selectionIndicator], isCrystal && [crystal.surface,
      tone !== 'neutral' && crystal[tone], shape === 'standalone' && crystal.standalone,
      variant === 'primary' && crystal.primary, variant === 'quiet' && crystal.quiet,
      pending && crystal.pending], className)
  const content = <>{pending && isCrystal && <span aria-hidden="true" className={crystal.workingHighlight} />}{pending ? <span className={crystal.pendingContent}>{pendingLabel ? <span>{pendingLabel}</span> : children}</span> : children}</>
  const state = { 'data-hud-button': presentation, 'data-disabled': unavailable ? '' : undefined, 'aria-busy': pending || props['aria-busy'] }

  if (props.href !== undefined) {
    // A disabled link has no destination; modifiers/context menus cannot navigate it.
    if (unavailable) {
      const { href: _href, onClick: _onClick, onClickCapture: _onClickCapture, onAuxClick: _onAuxClick, onAuxClickCapture: _onAuxClickCapture, ...anchorProps } = props
      return <a {...anchorProps} {...state} ref={ref as Ref<HTMLAnchorElement>} role={props.role ?? 'link'} aria-disabled="true" tabIndex={-1} className={buttonClassName({ ...catalystAppearance, className: classes })} onClick={event => { event.preventDefault(); event.stopPropagation() }} onAuxClick={event => { event.preventDefault(); event.stopPropagation() }}><TouchTarget>{content}</TouchTarget></a>
    }
    return <Button {...props} {...state} {...catalystAppearance} ref={ref as Ref<HTMLAnchorElement>} className={classes}>{content}</Button>
  }
  const { href: _href, ...buttonProps } = props
  return <Button {...buttonProps} {...state} {...catalystAppearance} ref={ref as Ref<HTMLButtonElement>} type={buttonProps.type ?? 'button'} disabled={unavailable} className={classes}>{content}</Button>
}) as HudButtonComponent

type IconContent = { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }
export type HudIconButtonProps = Omit<HudButtonProps, 'children'> & IconContent
export type HudIconLinkButtonProps = Omit<HudLinkButtonProps, 'children'> & IconContent
type HudIconButtonComponent = {
  (props: HudIconButtonProps & RefAttributes<HTMLButtonElement>): ReactElement
  (props: HudIconLinkButtonProps & RefAttributes<HTMLAnchorElement>): ReactElement
}

/** Icon actions share the implementation; a label is mandatory for either element. */
export const HudIconButton = forwardRef<HTMLElement, HudIconButtonProps | HudIconLinkButtonProps>(function HudIconButton({ icon, label, className, variant = 'quiet', pending = false, ...props }, ref) {
  const common = { variant, pending, pendingLabel: '', 'aria-label': label, title: pending ? `${label}…` : label, className: clsx(styles.iconButton, className) }
  const iconContent = <HudIcon icon={icon} size={16} />
  return props.href !== undefined
    ? <HudButton {...props} {...common} ref={ref as Ref<HTMLAnchorElement>}>{iconContent}</HudButton>
    : <HudButton {...props} {...common} ref={ref as Ref<HTMLButtonElement>}>{iconContent}</HudButton>
}) as HudIconButtonComponent

export const HudSearchInput = forwardRef<HTMLInputElement, Omit<ComponentPropsWithoutRef<typeof Input>, 'type'>>(function HudSearchInput({ className, ...props }, ref) {
  return <Input {...props} ref={ref} type="search" className={clsx(styles.field, className)} />
})

export const HudSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<typeof Select>>(function HudSelect({ className, ...props }, ref) {
  return <Select {...props} ref={ref} className={clsx(styles.field, className)} />
})


type HudBackButtonProps = Omit<HudButtonProps, 'children' | 'presentation' | 'appearance' | 'shape' | 'variant' | 'tone' | 'className'> & { destination: string }

/** Place first at the top-left of the view being left; Back never occupies an action band. */
export const HudBackButton = forwardRef<HTMLButtonElement, HudBackButtonProps>(function HudBackButton({ destination, ...props }, ref) {
  return <HudButton {...props} ref={ref} presentation="chrome" className={styles.backButton} data-hud-back>
    <HudIcon icon={ArrowLeftIcon} size={20} /><span>Back to {destination}</span>
  </HudButton>
})
