'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { LayoutGroup, motion } from 'framer-motion'
import React, { createContext, forwardRef, useContext, useId } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

// Context to track collapsed state
const SidebarContext = createContext<{ isCollapsed?: boolean }>({})

export function Sidebar({
  className,
  isCollapsed,
  ...props
}: React.ComponentPropsWithoutRef<'nav'> & { isCollapsed?: boolean }) {
  return (
    <SidebarContext.Provider value={{ isCollapsed }}>
      <nav {...props} className={clsx(className, 'flex h-full min-h-0 flex-col')} />
    </SidebarContext.Provider>
  )
}

export function SidebarHeader({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const { isCollapsed } = useContext(SidebarContext)

  return (
    <div
      {...props}
      className={clsx(
        className,
        'relative flex flex-col border-b border-sky-500/20 backdrop-blur-sm',
        '[&>[data-slot=section]+[data-slot=section]]:mt-2.5',
        // Adaptive padding - no horizontal padding when collapsed
        isCollapsed ? 'py-4' : 'p-4',
        // Sky blue glow effect
        'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-sky-400/50 after:to-transparent'
      )}
    />
  )
}

export function SidebarBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const { isCollapsed } = useContext(SidebarContext)

  return (
    <div
      {...props}
      className={clsx(
        className,
        'flex flex-1 flex-col overflow-y-auto [&>[data-slot=section]+[data-slot=section]]:mt-8',
        // Adaptive padding
        isCollapsed ? 'px-4 py-4' : 'p-4',
        // Custom scrollbar
        'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700 hover:scrollbar-thumb-zinc-600'
      )}
    />
  )
}

export function SidebarFooter({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const { isCollapsed } = useContext(SidebarContext)

  return (
    <div
      {...props}
      className={clsx(
        className,
        'relative flex flex-col border-t border-sky-500/20 backdrop-blur-sm',
        '[&>[data-slot=section]+[data-slot=section]]:mt-2.5',
        // Adaptive padding
        isCollapsed ? 'px-2 py-4' : 'p-4',
        // Sky blue glow effect
        'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sky-400/50 before:to-transparent'
      )}
    />
  )
}

export function SidebarSection({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const id = useId()

  return (
    <LayoutGroup id={id}>
      <div {...props} data-slot="section" className={clsx(className, 'flex flex-col gap-0.5')} />
    </LayoutGroup>
  )
}

export function SidebarDivider({ className, ...props }: React.ComponentPropsWithoutRef<'hr'>) {
  return (
    <hr
      {...props}
      className={clsx(
        className,
        'my-4 border-t border-sky-500/10 lg:-mx-4',
        // Subtle glow
        'shadow-[0_1px_3px_0_rgba(56,189,248,0.1)]'
      )}
    />
  )
}

export function SidebarSpacer({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div aria-hidden="true" {...props} className={clsx(className, 'mt-8 flex-1')} />
}

export function SidebarHeading({ className, ...props }: React.ComponentPropsWithoutRef<'h3'>) {
  const { isCollapsed } = useContext(SidebarContext)

  if (isCollapsed) {
    return null
  }

  return (
    <h3
      {...props}
      className={clsx(
        className,
        'mb-1 px-2 text-xs/6 font-semibold uppercase tracking-wider text-sky-400/70'
      )}
    />
  )
}

export const SidebarItem = forwardRef(function SidebarItem(
  {
    current,
    className,
    children,
    ...props
  }: { current?: boolean; className?: string; children: React.ReactNode } & (
    | Omit<Headless.ButtonProps, 'as' | 'className'>
    | Omit<Headless.ButtonProps<typeof Link>, 'as' | 'className'>
  ),
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>
) {
  const { isCollapsed } = useContext(SidebarContext)

  const classes = clsx(
    // Base
    'group relative flex w-full items-center rounded-lg px-2 py-2.5 text-left text-base/6 font-medium text-zinc-100 sm:py-2 sm:text-sm/5',
    'transition-all duration-200',
    // Gap only when not collapsed (has label)
    !isCollapsed && 'gap-3',
    // Leading icon/icon-only
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:transition-all *:data-[slot=icon]:duration-200',
    current
      ? '*:data-[slot=icon]:fill-sky-400 *:data-[slot=icon]:drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]'
      : '*:data-[slot=icon]:fill-zinc-400',
    // Trailing icon (down chevron or similar)
    '*:last:data-[slot=icon]:ml-auto *:last:data-[slot=icon]:size-5 sm:*:last:data-[slot=icon]:size-4',
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 sm:*:data-[slot=avatar]:size-6',
    // Hover
    'data-hover:bg-white/[0.08] data-hover:*:data-[slot=icon]:fill-sky-300',
    // Active
    'data-active:bg-white/[0.12] data-active:*:data-[slot=icon]:fill-sky-300',
    // Current
    current && 'bg-gradient-to-r from-sky-500/20 via-sky-500/10 to-transparent',
    current && 'shadow-[inset_0_0_12px_rgba(56,189,248,0.15)]',
    // Collapsed state - center icons
    isCollapsed && 'justify-center px-0',
    // Disabled state
    'disabled:opacity-50 disabled:cursor-not-allowed'
  )

  return (
    <span className={clsx(className, 'relative')}>
      {current && !isCollapsed && (
        <motion.span
          layoutId="current-indicator"
          className="absolute inset-y-2 -left-4 w-1 rounded-full bg-gradient-to-b from-sky-400 to-sky-600 shadow-[0_0_8px_rgba(56,189,248,0.6)]"
        />
      )}
      {current && isCollapsed && (
        <motion.span
          layoutId="current-indicator-collapsed"
          className="absolute -left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-sky-400 to-sky-600 shadow-[0_0_8px_rgba(56,189,248,0.6)]"
        />
      )}
      {'href' in props ? (
        <Headless.CloseButton
          as={Link}
          {...props}
          className={classes}
          data-current={current ? 'true' : undefined}
          ref={ref}
          title={isCollapsed ? extractLabel(children) : undefined}
        >
          <TouchTarget>{children}</TouchTarget>
        </Headless.CloseButton>
      ) : (
        <Headless.Button
          {...props}
          className={clsx('cursor-default', classes)}
          data-current={current ? 'true' : undefined}
          ref={ref}
          title={isCollapsed ? extractLabel(children) : undefined}
        >
          <TouchTarget>{children}</TouchTarget>
        </Headless.Button>
      )}
    </span>
  )
})

export function SidebarLabel({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  const { isCollapsed } = useContext(SidebarContext)

  if (isCollapsed) {
    return null
  }

  return <span {...props} className={clsx(className, 'truncate')} />
}

// Helper function to extract label text for tooltip
function extractLabel(children: React.ReactNode): string {
  if (!children) return ''
  if (typeof children === 'string') return children

  const childArray = React.Children.toArray(children)
  const labelChild = childArray.find((child) => {
    if (React.isValidElement(child)) {
      const props = child.props as Record<string, unknown>
      return (
        (typeof props.className === 'string' && props.className.includes('truncate')) ||
        typeof props.children === 'string'
      )
    }
    return false
  })

  if (React.isValidElement(labelChild)) {
    const props = labelChild.props as Record<string, unknown>
    if (typeof props.children === 'string') {
      return props.children
    }
  }

  return ''
}