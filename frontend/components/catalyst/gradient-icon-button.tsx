'use client'

import clsx from 'clsx'

export interface GradientIconButtonProps {
  /** The icon component to render */
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  /** Gradient classes (e.g., 'from-cyan-500 to-blue-600') */
  gradient: string
  /** Shadow color class (e.g., 'cyan-500/25') */
  shadowColor: string
  /** Optional label displayed below the icon */
  label?: string
  /** Whether this button is active/selected */
  isActive?: boolean
  /** Whether to show activity indicator dot */
  hasActivity?: boolean
  /** Optional badge number */
  badge?: number
  /** Click handler */
  onClick?: () => void
  /** Disabled state */
  disabled?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Optional aria-label for accessibility */
  'aria-label'?: string
  /** Optional title tooltip */
  title?: string
  /** Additional class names */
  className?: string
}

/**
 * GradientIconButton - A reusable icon button with gradient background.
 *
 * Used for navigation items in collapsed sidebars and icon-only buttons.
 * Features gradient background, shadow effects, hover animations, and optional labels.
 */
export function GradientIconButton({
  icon: Icon,
  gradient,
  shadowColor,
  label,
  isActive = false,
  hasActivity = false,
  badge,
  onClick,
  disabled = false,
  size = 'md',
  'aria-label': ariaLabel,
  title,
  className,
}: GradientIconButtonProps) {
  const sizeClasses = {
    sm: {
      button: 'h-9 w-9',
      icon: 'h-4 w-4',
      label: 'text-[9px]',
      badge: 'h-4 w-4 text-[8px]',
      activity: 'h-2.5 w-2.5',
    },
    md: {
      button: 'h-11 w-11',
      icon: 'h-5 w-5',
      label: 'text-[10px]',
      badge: 'h-5 w-5 text-[10px]',
      activity: 'h-3 w-3',
    },
    lg: {
      button: 'h-14 w-14',
      icon: 'h-6 w-6',
      label: 'text-xs',
      badge: 'h-6 w-6 text-xs',
      activity: 'h-3.5 w-3.5',
    },
  }

  const sizes = sizeClasses[size]

  return (
    <div className={clsx('flex flex-col items-center', className)}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || label}
        title={title || label}
        className={clsx(
          'group relative flex items-center justify-center rounded-xl',
          `bg-gradient-to-br ${gradient}`,
          `shadow-lg shadow-${shadowColor}`,
          sizes.button,
          'transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          isActive && 'ring-2 ring-white/50 dark:ring-white/20 scale-105',
          !disabled && !isActive && 'hover:shadow-xl hover:scale-105',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Icon className={clsx('text-white', sizes.icon)} strokeWidth={2} />

        {/* Activity indicator dot */}
        {hasActivity && (
          <span className="absolute -top-0.5 -right-0.5 flex">
            <span
              className={clsx(
                'absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75',
                sizes.activity
              )}
            />
            <span
              className={clsx(
                'relative inline-flex rounded-full bg-emerald-500',
                sizes.activity
              )}
            />
          </span>
        )}

        {/* Badge */}
        {badge !== undefined && badge > 0 && (
          <div
            className={clsx(
              'absolute -right-1 -top-1 flex items-center justify-center rounded-full',
              'bg-gradient-to-br from-rose-500 to-red-500 font-bold text-white shadow-md',
              sizes.badge
            )}
          >
            {badge}
          </div>
        )}
      </button>

      {/* Label below icon */}
      {label && (
        <span
          className={clsx(
            'mt-2 font-medium text-zinc-500 dark:text-zinc-200',
            sizes.label
          )}
        >
          {label}
        </span>
      )}
    </div>
  )
}
