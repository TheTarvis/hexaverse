'use client'

import * as Headless from '@headlessui/react'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function TabGroup({
  className,
  children,
  ...props
}: {
  className?: string
  children: ReactNode
} & Omit<Headless.TabGroupProps, 'className' | 'children'>) {
  return (
    <Headless.TabGroup className={clsx(className)} {...props}>
      {children}
    </Headless.TabGroup>
  )
}

export function TabList({
  className,
  children,
  ...props
}: {
  className?: string
  children: ReactNode
} & Omit<Headless.TabListProps, 'className' | 'children'>) {
  return (
    <Headless.TabList
      className={clsx(
        'flex gap-2 border-b border-zinc-950/10 dark:border-white/10',
        className
      )}
      {...props}
    >
      {children}
    </Headless.TabList>
  )
}

export function Tab({
  className,
  children,
  ...props
}: {
  className?: string
  children: ReactNode
} & Omit<Headless.TabProps, 'className' | 'children'>) {
  return (
    <Headless.Tab
      className={({ selected }) =>
        clsx(
          'px-4 py-2 text-sm font-medium transition-colors focus:outline-none',
          selected
            ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
          className
        )
      }
      {...props}
    >
      {children}
    </Headless.Tab>
  )
}

export function TabPanels({
  className,
  children,
  ...props
}: {
  className?: string
  children: ReactNode
} & Omit<Headless.TabPanelsProps, 'className' | 'children'>) {
  return (
    <Headless.TabPanels className={clsx('mt-2', className)} {...props}>
      {children}
    </Headless.TabPanels>
  )
}

export function TabPanel({
  className,
  children,
  ...props
}: {
  className?: string
  children: ReactNode
} & Omit<Headless.TabPanelProps, 'className' | 'children'>) {
  return (
    <Headless.TabPanel
      className={clsx(
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-zinc-900',
        className
      )}
      {...props}
    >
      {children}
    </Headless.TabPanel>
  )
}