'use client'

import { Button } from './button'
import clsx from 'clsx'

interface TableRowActionsProps {
  actions: Array<{
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick: () => void
    disabled?: boolean
    variant?: 'default' | 'danger'
  }>
  align?: 'left' | 'right'
}

export function TableRowActions({ actions, align = 'right' }: TableRowActionsProps) {
  return (
    <div
      className={clsx(
        // Positioning
        'absolute top-1/2 -translate-y-1/2 z-50',
        align === 'right' ? 'right-4' : 'left-4',

        // Visibility - hidden by default, shown on row hover
        'opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0',
        'transition-all duration-200 ease-out',

        // Visual styling with glass aesthetic
        'flex items-center gap-1 px-2 py-1.5 rounded-lg',
        'bg-white/90 dark:bg-zinc-700/90',
        'backdrop-blur-xl',
        'border border-zinc-200/50 dark:border-zinc-700/50',
        'shadow-lg shadow-zinc-900/10 dark:shadow-black/30',

        // Subtle glow effect
        'ring-1 ring-sky-500/10 dark:ring-sky-400/10'
      )}
    >
      {actions.map((action, idx) => {
        const Icon = action.icon
        return (
          <Button
            key={idx}
            plain
            onClick={action.onClick}
            disabled={action.disabled}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              action.variant === 'danger'
                ? 'hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
                : 'hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400'
            )}
            aria-label={action.label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        )
      })}
    </div>
  )
}
