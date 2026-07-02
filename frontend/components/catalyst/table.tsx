'use client'

import clsx from 'clsx'
import type React from 'react'
import { createContext, useContext, useState } from 'react'
import { Link } from './link'

const TableContext = createContext<{ bleed: boolean; dense: boolean; grid: boolean; striped: boolean; glow: boolean }>({
  bleed: false,
  dense: false,
  grid: false,
  striped: false,
  glow: false,
})

export function Table({
  bleed = false,
  dense = false,
  grid = false,
  striped = false,
  glass = true,
  glow = false,
  className,
  children,
  ...props
}: {
  bleed?: boolean
  dense?: boolean
  grid?: boolean
  striped?: boolean
  glass?: boolean
  glow?: boolean
} & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <TableContext.Provider value={{ bleed, dense, grid, striped, glow } as React.ContextType<typeof TableContext>}>
      <div
        className={clsx(
          className,
          glass && 'overflow-hidden rounded-2xl border border-sky-700/30 bg-zinc-100 dark:bg-zinc-600 backdrop-blur-sm dark:border-sky-700/30'
        )}
      >
        <div className="overflow-x-auto" {...props}>
          <div className={clsx('w-full', !bleed && 'px-(--gutter,--spacing(6))')}>
            <table className="w-full text-left text-sm/6 text-zinc-950 dark:text-zinc-100">{children}</table>
          </div>
        </div>
      </div>
    </TableContext.Provider>
  )
}

export function TableHead({ className, ...props }: React.ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead
      {...props}
      className={clsx(
        className,
        'border-b border-zinc-700/60 text-zinc-500 dark:text-zinc-400'
      )}
    />
  )
}

export function TableBody({ className, ...props }: React.ComponentPropsWithoutRef<'tbody'>) {
  return <tbody {...props} className={clsx(className, 'divide-y divide-zinc-700/40')} />
}

const TableRowContext = createContext<{ href?: string; target?: string; title?: string }>({
  href: undefined,
  target: undefined,
  title: undefined,
})

export function TableRow({
  href,
  target,
  title,
  className,
  children,
  ...props
}: { href?: string; target?: string; title?: string } & React.ComponentPropsWithoutRef<'tr'>) {
  const { striped, glow } = useContext(TableContext)

  return (
    <TableRowContext.Provider value={{ href, target, title } as React.ContextType<typeof TableRowContext>}>
      <tr
        {...props}
        className={clsx(
          className,
          'group relative transition-colors duration-200',
          href &&
            'has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-sky-500 dark:focus-within:bg-sky-500/[0.06]',
          striped && 'even:bg-sky-500/[0.03] dark:even:bg-sky-500/[0.03]',
          href && striped && 'hover:bg-sky-500/[0.10] dark:hover:bg-sky-500/[0.10]',
          href && !striped && 'hover:bg-sky-500/[0.08] dark:hover:bg-sky-500/[0.08]',
          !href && 'hover:bg-sky-500/[0.06]'
        )}
      >
        {children}
        {/* Subtle left accent bar on hover - cleaner than glow */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-0.5 bg-sky-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        {glow && (
          <div className="pointer-events-none absolute -right-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-sky-500 opacity-0 blur-3xl transition-opacity group-hover:opacity-5" />
        )}
      </tr>
    </TableRowContext.Provider>
  )
}

export function TableHeader({
  className,
  sticky = false,
  stickyPosition = 'right',
  width,
  ...props
}: {
  sticky?: boolean
  stickyPosition?: 'left' | 'right'
  width?: string
} & React.ComponentPropsWithoutRef<'th'>) {
  const { bleed, grid } = useContext(TableContext)

  return (
    <th
      {...props}
      className={clsx(
        className,
        'px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider first:pl-(--gutter,--spacing(6)) last:pr-(--gutter,--spacing(6))',
        grid && 'border-l border-l-zinc-700/40 first:border-l-0 dark:border-l-zinc-700/40',
        !bleed && 'sm:first:pl-6 sm:last:pr-6',
        // Fixed width for sticky columns
        width,
        // Sticky header styling - more prominent with sky accent
        sticky && [
          'sticky z-20',
          stickyPosition === 'right' ? 'right-0 !pr-0' : 'left-0 !pl-0',
          // Match table background exactly for seamless look
          'bg-sky-500/[0.08]',
          // Shadow for depth
          stickyPosition === 'right'
            ? 'shadow-[-12px_0_24px_-6px_rgba(0,0,0,0.4)]'
            : 'shadow-[12px_0_24px_-6px_rgba(0,0,0,0.4)]',
          // Subtle sky glow to indicate interactivity
          'text-sky-400'
        ]
      )}
    />
  )
}

export function TableCell({
  className,
  children,
  sticky = false,
  stickyPosition = 'right',
  width,
  ...props
}: {
  sticky?: boolean
  stickyPosition?: 'left' | 'right'
  width?: string
} & React.ComponentPropsWithoutRef<'td'>) {
  const { bleed, dense, grid, striped } = useContext(TableContext)
  const { href, target, title } = useContext(TableRowContext)
  const [cellRef, setCellRef] = useState<HTMLElement | null>(null)

  return (
    <td
      ref={href ? setCellRef : undefined}
      {...props}
      className={clsx(
        className,
        'relative px-6 first:pl-(--gutter,--spacing(6)) last:pr-(--gutter,--spacing(6))',
        !striped && 'border-b border-zinc-700/40 dark:border-zinc-700/40',
        grid && 'border-l border-l-zinc-700/40 first:border-l-0 dark:border-l-zinc-700/40',
        dense ? 'py-3' : 'py-4',
        !bleed && 'sm:first:pl-6 sm:last:pr-6',
        // Fixed width for sticky columns
        width,
        // Sticky cell positioning - more prominent with sky accent
        sticky && [
          'sticky z-10',
          stickyPosition === 'right' ? 'right-0 !pr-0' : 'left-0 !pl-0',
          // Match table background exactly for seamless look
          'bg-sky-500/[0.08]',
          // Sky-blue accent border for clear visual separation
          stickyPosition === 'right'
            ? 'border-l-2 border-sky-500/40 shadow-[-12px_0_24px_-6px_rgba(0,0,0,0.4),_-2px_0_8px_-2px_rgba(14,165,233,0.2)]'
            : 'border-r-2 border-sky-500/40 shadow-[12px_0_24px_-6px_rgba(0,0,0,0.4),_2px_0_8px_-2px_rgba(14,165,233,0.2)]'
        ]
      )}
    >
      {href && (
        <Link
          data-row-link
          href={href}
          target={target}
          aria-label={title}
          tabIndex={cellRef?.previousElementSibling === null ? 0 : -1}
          className="absolute inset-0 focus:outline-hidden"
        />
      )}
      {children}
    </td>
  )
}
