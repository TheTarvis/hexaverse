'use client'

import { useState, Children, useEffect } from 'react'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { PlusIcon, MinusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface CompactSectionProps {
  title: string
  description: string
  icon?: React.ReactNode
  accentColor?: 'violet' | 'blue' | 'emerald' | 'amber' | 'sky' | 'slate'
  children: React.ReactNode
  defaultOpen?: boolean
  isComplete?: boolean // Shows checkmark when section is filled out
  id?: string // For scrolling and AI highlighting
  isHighlighted?: boolean // Visual feedback when AI references this section
  onNavigate?: () => void // Navigation callback for wizard steps
  isNavigable?: boolean // Shows cursor-pointer when navigable
  actions?: React.ReactNode // Custom actions to render in the header
  validationError?: string // Card-level validation error to display
  'data-testid'?: string // Test ID for e2e testing
}

function CompactSection({
  title,
  description,
  icon,
  accentColor = 'sky',
  children,
  defaultOpen = true,
  isComplete = false,
  id,
  isHighlighted = false,
  onNavigate,
  isNavigable = false,
  actions,
  validationError,
  'data-testid': testId,
}: CompactSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  // Auto-expand card when there's a validation error
  useEffect(() => {
    if (validationError && !isOpen) {
      setIsOpen(true)
    }
  }, [validationError, isOpen])


  const colorClasses = {
    violet: {
      bg: 'bg-gradient-to-br from-violet-500 to-purple-500',
      shadow: 'shadow-lg shadow-violet-500/20',
      text: 'text-violet-600 dark:text-violet-300',
      border: 'border-violet-500/30 dark:border-violet-500/30',
      glow: 'bg-violet-500',
      highlight: 'ring-2 ring-violet-500/50 shadow-lg shadow-violet-500/20',
      iconText: 'text-white',
      toggleBg: 'bg-violet-500/15 dark:bg-violet-500/15',
      toggleText: 'text-violet-600 dark:text-violet-400',
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-500 to-cyan-500',
      shadow: 'shadow-lg shadow-blue-500/20',
      text: 'text-blue-600 dark:text-blue-300',
      border: 'border-blue-500/30 dark:border-blue-500/30',
      glow: 'bg-blue-500',
      highlight: 'ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/20',
      iconText: 'text-white',
      toggleBg: 'bg-blue-500/15 dark:bg-blue-500/15',
      toggleText: 'text-blue-600 dark:text-blue-400',
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-500 to-green-500',
      shadow: 'shadow-lg shadow-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-300',
      border: 'border-emerald-500/30 dark:border-emerald-500/30',
      glow: 'bg-emerald-500',
      highlight: 'ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20',
      iconText: 'text-white',
      toggleBg: 'bg-emerald-500/15 dark:bg-emerald-500/15',
      toggleText: 'text-emerald-600 dark:text-emerald-400',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-500 to-orange-500',
      shadow: 'shadow-lg shadow-amber-500/20',
      text: 'text-amber-600 dark:text-amber-300',
      border: 'border-amber-500/30 dark:border-amber-500/30',
      glow: 'bg-amber-500',
      highlight: 'ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/20',
      iconText: 'text-white',
      toggleBg: 'bg-amber-500/15 dark:bg-amber-500/15',
      toggleText: 'text-amber-600 dark:text-amber-400',
    },
    sky: {
      bg: 'bg-gradient-to-br from-sky-500 to-blue-500',
      shadow: 'shadow-lg shadow-sky-500/20',
      text: 'text-sky-600 dark:text-sky-400',
      border: 'border-sky-500/30 dark:border-sky-500/40',
      glow: 'bg-sky-500',
      highlight: 'ring-2 ring-sky-500/50 shadow-lg shadow-sky-500/20',
      iconText: 'text-white',
      toggleBg: 'bg-sky-500/15 dark:bg-sky-500/15',
      toggleText: 'text-sky-600 dark:text-sky-400',
    },
    slate: {
      bg: 'bg-gradient-to-br from-slate-500 to-zinc-600',
      shadow: 'shadow-lg shadow-slate-500/20',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-500/30 dark:border-slate-500/40',
      glow: 'bg-slate-500',
      highlight: 'ring-2 ring-slate-500/50 shadow-lg shadow-slate-500/20',
      iconText: 'text-white',
      toggleBg: 'bg-slate-500/15 dark:bg-slate-500/15',
      toggleText: 'text-slate-600 dark:text-slate-400',
    },
  }

  // Red color classes for error state
  const redColors = {
    border: 'border-red-500/30 dark:border-red-500/30',
    glow: 'bg-red-500',
    highlight: 'ring-2 ring-red-500/50 shadow-lg shadow-red-500/20',
  }

  // Use red colors when there's a validation error, otherwise use accent color
  const hasError = !!validationError
  const baseColors = colorClasses[accentColor]
  const colors = hasError
    ? { ...baseColors, ...redColors }
    : baseColors

  // Check if there are actual children to render (not just false/null/undefined)
  const hasContent = Children.toArray(children).length > 0

  return (
    <div
      id={id}
      data-testid={testId}
      className={`group relative overflow-hidden rounded-lg border transition-all duration-300 ${
        isHighlighted || hasError ? colors.highlight : ''
      } ${isOpen ? `${colors.border} bg-zinc-50 dark:bg-white/[0.08]` : 'border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-white/[0.06]'}`}
    >
      {/* Compact Header */}
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        {/* Icon */}
        {icon && (
          <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${colors.bg} ${colors.iconText}`}>
            {icon}
          </div>
        )}

        {/* Title - clickable to expand/collapse */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 min-w-0 text-left transition-colors hover:opacity-80"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">
            {title}
          </h3>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate leading-tight mt-0.5">
            {description}
          </p>
        </button>

        {/* Status & Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Show checkmark only when complete and no error */}
          {isComplete && !hasError && (
            <CheckCircleIcon className={`h-4 w-4 ${baseColors.text}`} />
          )}

          {/* Custom actions */}
          {actions}

          {/* Edit button (only in edit mode) */}
          {isNavigable && onNavigate && (
            <button
              type="button"
              onClick={onNavigate}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${colors.toggleBg} ${colors.toggleText} hover:opacity-80`}
            >
              Edit
            </button>
          )}

          {/* Expand/Collapse toggle - only show if there's content */}
          {hasContent && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`flex h-5 w-5 items-center justify-center rounded ${colors.toggleBg} ${colors.toggleText} hover:opacity-80 transition-opacity`}
            >
              {isOpen ? (
                <MinusIcon className="h-3.5 w-3.5" />
              ) : (
                <PlusIcon className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && isOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-800">
          <ExclamationTriangleIcon className="size-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-700 dark:text-red-300">{validationError}</span>
        </div>
      )}

      {/* Content with slide animation - only render if there's content */}
      {hasContent && (
        <div
          className={`grid transition-all duration-300 ease-in-out ${
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-zinc-200 dark:border-zinc-800/50 px-3 py-2.5">
              {children}
            </div>
          </div>
        </div>
      )}

      {/* Subtle left accent bar when open */}
      {isOpen && (
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.glow} pointer-events-none`} />
      )}

      {/* Hover glow */}
      <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full ${colors.glow} opacity-0 blur-3xl transition-opacity group-hover:opacity-5 pointer-events-none`} />
    </div>
  )
}

export { CompactSection }