'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { useState, useRef } from 'react'

export function Combobox<T>({
  options,
  displayValue,
  filter,
  anchor = 'bottom',
  className,
  placeholder,
  autoFocus,
  'aria-label': ariaLabel,
  onCustomValueSelect,
  createLabel,
  children,
  openOnFocus = false,
  ...props
}: {
  options: T[]
  displayValue: (value: T | null) => string | undefined
  filter?: (value: T, query: string) => boolean
  className?: string
  placeholder?: string
  autoFocus?: boolean
  'aria-label'?: string
  onCustomValueSelect?: (query: string) => void
  createLabel?: (query: string) => string
  openOnFocus?: boolean
  children: (value: NonNullable<T>) => React.ReactElement
} & Omit<Headless.ComboboxProps<T, false>, 'as' | 'multiple' | 'children'> & { anchor?: 'top' | 'bottom' }) {
  const [query, setQuery] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)

  const filteredOptions =
    query === ''
      ? options
      : options.filter((option) =>
          filter ? filter(option, query) : displayValue(option)?.toLowerCase().includes(query.toLowerCase())
        )

  // Show create option when:
  // - onCustomValueSelect is provided
  // - query is not empty
  // - query doesn't match any existing option exactly
  const showCreateOption =
    onCustomValueSelect &&
    query.trim() !== '' &&
    !filteredOptions.some((option) => displayValue(option)?.toLowerCase() === query.toLowerCase())

  return (
    <Headless.Combobox as="div" {...props} multiple={false} onClose={() => setQuery('')}>
      <span
        data-slot="control"
        className={clsx([
          className,
          // Basic layout
          'relative block w-full',
          // Elevate z-index when dropdown is open to prevent clipping by sibling elements
          'has-data-open:z-50',
          // Glass morphism: Background with transparency and shadow
          'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-zinc-100 before:shadow-sm',
          // Dark mode glass effect
          'dark:before:bg-white/[0.12] dark:before:backdrop-blur-sm',
          // Violet focus ring (brand color for special features)
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-1 sm:focus-within:after:ring-violet-500/50',
          // Disabled state
          'has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-700/5 has-data-disabled:before:shadow-none',
          // Invalid state - red ring
          'has-data-invalid:after:ring-1 has-data-invalid:after:ring-red-500/50',
        ])}
      >
        <Headless.ComboboxInput
          autoFocus={autoFocus}
          data-slot="control"
          aria-label={ariaLabel}
          displayValue={(option: T) => displayValue(option) ?? ''}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={(event) => {
            // Open dropdown on focus if openOnFocus is enabled
            if (openOnFocus) {
              // Trigger ArrowDown key event to open the dropdown
              // This works with Headless UI's keyboard navigation
              const arrowDownEvent = new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                code: 'ArrowDown',
                keyCode: 40,
                bubbles: true,
                cancelable: true,
              })
              event.target.dispatchEvent(arrowDownEvent)
            }
          }}
          onKeyDown={(event) => {
            // Handle Enter key when there's a query that doesn't match any option
            if (
              event.key === 'Enter' &&
              showCreateOption &&
              onCustomValueSelect
            ) {
              event.preventDefault()
              onCustomValueSelect(query)
              setQuery('')
            }
          }}
          placeholder={placeholder}
          className={clsx([
            className,
            // Basic layout
            'relative block w-full appearance-none rounded-lg py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
            // Horizontal padding
            'pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
            // Typography
            'text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white dark:placeholder:text-zinc-400',
            // Refined borders with glass morphism
            'border border-zinc-200 data-hover:border-zinc-300 dark:border-zinc-800/50 dark:data-hover:border-zinc-700',
            // Background color with glass effect
            'bg-transparent dark:bg-sky-500/5 backdrop-blur-sm',
            // Smooth transitions
            'transition-all duration-200',
            // Hide default focus styles
            'focus:outline-hidden',
            // Invalid state
            'data-invalid:border-red-500/50 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-500 dark:data-invalid:data-hover:border-red-500',
            // Disabled state
            'data-disabled:border-zinc-950/20 dark:data-disabled:border-white/15 dark:data-disabled:bg-white/2.5 dark:data-hover:data-disabled:border-white/15',
            // System icons
            'dark:scheme-dark',
          ])}
        />
        <Headless.ComboboxButton ref={buttonRef} className="group absolute inset-y-0 right-0 flex items-center px-2.5 transition-colors">
          <svg
            className={clsx(
              'size-5 sm:size-4',
              'stroke-zinc-500 dark:stroke-zinc-400',
              'group-data-hover:stroke-zinc-700 dark:group-data-hover:stroke-zinc-300',
              'group-data-disabled:stroke-zinc-600 dark:group-data-disabled:stroke-zinc-500',
              'transition-colors duration-200',
              'forced-colors:stroke-[CanvasText]'
            )}
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Headless.ComboboxButton>
      </span>
      <Headless.ComboboxOptions
        transition
        anchor={anchor}
        className={clsx(
          // Anchor positioning
          '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(4)] sm:data-[anchor~=start]:[--anchor-offset:-4px]',
          // Base styles,
          'isolate min-w-[calc(var(--input-width)+8px)] scroll-py-1 rounded-xl p-1 select-none empty:invisible',
          // Z-index for stacking context
          'z-50',
          // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
          'outline outline-transparent focus:outline-hidden',
          // Handle scrolling when menu won't fit in viewport
          'overflow-y-scroll overscroll-contain',
          // Enhanced glass morphism background
          'bg-zinc-50 backdrop-blur-xl dark:bg-zinc-700/75',
          // Shadows
          'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
          // Smooth transitions with scale animation
          'transition-all duration-200 ease-out data-closed:data-leave:opacity-0 data-closed:data-leave:scale-95 data-transition:pointer-events-none'
        )}
      >
        {filteredOptions.map((option) => children(option as NonNullable<T>))}
        {showCreateOption && (
          <div
            className={clsx(
              'group/option grid w-full cursor-pointer grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg py-2.5 pr-3 pl-4 sm:py-1.5 sm:pr-2.5 sm:pl-3.5',
              'text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white',
              'hover:bg-blue-500 hover:text-white hover:shadow-lg hover:shadow-blue-500/20',
              'transition-all duration-200',
              'border-t border-zinc-200 dark:border-zinc-800/50 mt-1 pt-2'
            )}
            onClick={() => {
              onCustomValueSelect?.(query)
              setQuery('')
            }}
            data-testid="combobox-create-option"
          >
            <span className="flex items-center gap-2">
              {/* Vibrant violet/purple gradient icon for "create" action */}
              <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-purple-500 shadow-sm shadow-violet-500/30">
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </span>
              {createLabel ? createLabel(query) : `Use "${query}"`}
            </span>
          </div>
        )}
      </Headless.ComboboxOptions>
    </Headless.Combobox>
  )
}

export function ComboboxOption<T>({
  children,
  className,
  ...props
}: { className?: string; children?: React.ReactNode } & Omit<
  Headless.ComboboxOptionProps<'div', T>,
  'as' | 'className'
>) {
  const sharedClasses = clsx(
    // Base
    'flex min-w-0 items-center',
    // Icons
    '*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-4',
    '*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-zinc-400',
    'forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]',
    // Avatars
    '*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:size-5'
  )

  return (
    <Headless.ComboboxOption
      {...props}
      className={clsx(
        // Basic layout
        'group/option grid w-full cursor-default grid-cols-[1fr_--spacing(5)] items-baseline gap-x-3 rounded-lg py-2.5 pr-3 pl-4 sm:grid-cols-[1fr_--spacing(4)] sm:py-1.5 sm:pr-2.5 sm:pl-3.5',
        // Typography
        'text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
        // Focus with subtle glow
        'outline-hidden data-focus:bg-blue-500 data-focus:text-white data-focus:shadow-lg data-focus:shadow-blue-500/20',
        // Hover state (non-focus)
        'data-hover:bg-white dark:data-hover:bg-white/8',
        // Smooth transitions
        'transition-all duration-200',
        // Forced colors mode
        'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]',
        // Disabled
        'data-disabled:opacity-50'
      )}
    >
      <span className={clsx(className, sharedClasses)}>{children}</span>
      <svg
        className="relative col-start-2 hidden size-5 self-center stroke-current group-data-selected/option:inline sm:size-4"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 8.5l3 3L12 4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Headless.ComboboxOption>
  )
}

export function ComboboxLabel({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'ml-2.5 truncate first:ml-0 sm:ml-2 sm:first:ml-0')} />
}

export function ComboboxDescription({ className, children, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'flex flex-1 overflow-hidden text-zinc-500 group-data-focus/option:text-white before:w-2 before:min-w-0 before:shrink dark:text-zinc-400'
      )}
    >
      <span className="flex-1 truncate">{children}</span>
    </span>
  )
}
