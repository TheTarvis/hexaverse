import clsx from 'clsx'

export type StatusVariant = 'success' | 'processing' | 'pending' | 'error' | 'warning' | 'info'

export interface StatusBadgeProps {
  variant: StatusVariant
  label: string
  animated?: boolean
  className?: string
}

const variantStyles: Record<StatusVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pending: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  info: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

const dotStyles: Record<StatusVariant, string> = {
  success: 'bg-emerald-500',
  processing: 'bg-blue-500',
  pending: 'bg-zinc-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-cyan-500',
}

/**
 * StatusBadge - A glass morphism status badge aligned with Dark Luxury Tech aesthetic
 *
 * @example
 * // Success state
 * <StatusBadge variant="success" label="Completed" />
 *
 * @example
 * // Processing with animated dot
 * <StatusBadge variant="processing" label="Running" animated />
 *
 * @example
 * // Error state
 * <StatusBadge variant="error" label="Failed" />
 */
export function StatusBadge({ variant, label, animated = false, className }: StatusBadgeProps) {
  const showDot = animated || variant === 'processing'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {showDot && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={clsx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              dotStyles[variant]
            )}
          ></span>
          <span
            className={clsx(
              'relative inline-flex h-1.5 w-1.5 rounded-full',
              dotStyles[variant]
            )}
          ></span>
        </span>
      )}
      {label}
    </span>
  )
}

/**
 * Helper function to map common status strings to StatusBadge variants
 */
export function getStatusVariant(status: string): StatusVariant {
  const statusLower = status.toLowerCase()

  if (statusLower === 'completed' || statusLower === 'active' || statusLower === 'success') {
    return 'success'
  }

  if (statusLower === 'processing' || statusLower === 'running' || statusLower === 'syncing') {
    return 'processing'
  }

  if (statusLower === 'pending' || statusLower === 'queued' || statusLower === 'waiting') {
    return 'pending'
  }

  if (statusLower === 'failed' || statusLower === 'error') {
    return 'error'
  }

  if (statusLower === 'warning' || statusLower === 'paused') {
    return 'warning'
  }

  return 'info'
}
