'use client'

import { clsx } from 'clsx'
import React from 'react'

export interface CardProps {
  icon?: React.ComponentType<{ className?: string }>
  iconClassName?: string
  iconBackgroundClassName?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  badges?: React.ReactNode
  description?: React.ReactNode
  metadata?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function Card({
  icon: Icon,
  iconClassName = 'text-indigo-600 dark:text-indigo-400',
  iconBackgroundClassName = 'bg-indigo-100 dark:bg-indigo-900/50',
  title,
  subtitle,
  badges,
  description,
  metadata,
  actions,
  children,
  className,
}: CardProps) {
  return (
    <div
      className={clsx(
        'group relative rounded-lg border p-6 transition-all hover:shadow-lg',
        'bg-zinc-50/50 dark:bg-zinc-700/30', // Subtle background differentiation
        'border-zinc-200 dark:border-zinc-800/50',
        'flex flex-col h-full',
        className
      )}
    >
      {/* Header */}
      {(Icon || title || subtitle || badges) && (
        <div className="mb-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <div className={clsx('rounded-lg p-2', iconBackgroundClassName)}>
                <Icon className={clsx('h-5 w-5', iconClassName)} />
              </div>
            )}
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                  {subtitle}
                </p>
              )}
              {badges && (
                <div className="flex items-center gap-2 flex-wrap">
                  {badges}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {description && (
        <div className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </div>
      )}

      {/* Metadata */}
      {metadata && (
        <div className="mb-4">
          {metadata}
        </div>
      )}

      {/* Custom children content */}
      {children && (
        <div className="mb-4">
          {children}
        </div>
      )}

      {/* Spacer to push actions to bottom */}
      <div className="flex-grow" />

      {/* Actions */}
      {actions && (
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800/50">
          {actions}
        </div>
      )}
    </div>
  )
}

// Convenience component for card metadata items
export function CardMetadata({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-2 gap-4 text-sm', className)}>
      {children}
    </div>
  )
}

// Convenience component for card metadata item
export function CardMetadataItem({ 
  icon: Icon, 
  children 
}: { 
  icon?: React.ComponentType<{ className?: string }>; 
  children: React.ReactNode 
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-zinc-400" />}
      <span className="text-zinc-600 dark:text-zinc-400">
        {children}
      </span>
    </div>
  )
}