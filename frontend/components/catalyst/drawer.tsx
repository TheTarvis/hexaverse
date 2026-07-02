/**
 * Base Drawer Component
 *
 * TECH DEBT WARNING:
 * We currently have too many drawer variants, each with their own custom logic:
 * - drawer.tsx (base)
 * - drawer-form.tsx (form wrapper)
 * - drawer-multistep.tsx (multi-step wizard)
 * - drawer-with-chat.tsx (form + AI chat)
 * - drawer-multistep-with-chat.tsx (wizard + AI chat)
 *
 * This creates:
 * 1. Code duplication across drawer variants
 * 2. Inconsistent APIs and prop naming
 * 3. Harder maintenance when updating drawer behavior
 * 4. Layout quirks when custom titles interact with built-in close buttons
 *
 * FUTURE REFACTOR:
 * Consider consolidating into a single Drawer component with:
 * - Slot-based composition (header, content, footer)
 * - Built-in form/validation support
 * - Optional step navigation
 * - Optional chat panel toggle
 * - Consistent prop API across all use cases
 *
 * For now, we use `showCloseButton` prop to let chat drawers control their own
 * header layout and avoid the close button appearing in awkward positions.
 */

import * as Headless from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Heading } from './heading'
import { Text } from './text'
import { ConsentModal } from '../consent-modal'

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

export interface DrawerProps {
  // State management
  open: boolean
  onClose: () => void

  // Content
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode

  // Footer (optional slot)
  footer?: React.ReactNode

  // Behavior
  size?: keyof typeof sizes
  closeOnClickOutside?: boolean
  preventClose?: boolean // When loading/submitting
  showCloseButton?: boolean // Show close button in header (default: true, set false if title includes custom close button)

  // Form support
  isDirty?: boolean // Triggers confirm-on-close
  onConfirmClose?: () => void // Custom confirm handler

  // Advanced
  className?: string
  contentClassName?: string
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnClickOutside = true,
  preventClose = false,
  showCloseButton = true,
  isDirty = false,
  onConfirmClose,
  className,
  contentClassName,
}: DrawerProps) {
  const [showConsentModal, setShowConsentModal] = useState(false)

  // Handle close with dirty state and prevent close logic
  const handleClose = useCallback(() => {
    // 1. Check if close is prevented (loading)
    if (preventClose) return

    // 2. Check if form is dirty
    if (isDirty) {
      // Use custom confirm handler if provided
      if (onConfirmClose) {
        onConfirmClose()
        return
      }

      // Show consent modal for unsaved changes
      setShowConsentModal(true)
      return
    }

    // 3. Close
    onClose()
  }, [preventClose, isDirty, onConfirmClose, onClose])

  // Handle confirmed close from ConsentModal
  const handleConfirmClose = () => {
    setShowConsentModal(false)
    onClose()
  }

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open && !preventClose) {
        handleClose()
      }
    }

    if (open) {
      window.addEventListener('keydown', handleEsc)
      return () => window.removeEventListener('keydown', handleEsc)
    }
  }, [open, preventClose, handleClose])

  return (
    <>
      <Headless.Dialog
        open={open}
        onClose={closeOnClickOutside ? handleClose : () => {}}
        className={clsx(className, 'relative z-50')}
      >
        {/* Backdrop - Enhanced blur and darkness */}
        <Headless.DialogBackdrop
          transition
          className="fixed inset-0 bg-zinc-800/80 backdrop-blur-md transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        />

        {/* Drawer Panel Container */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full sm:pl-16">
              <Headless.DialogPanel
                transition
                className={clsx(
                  'pointer-events-auto w-screen',
                  sizes[size],
                  'transform transition-all duration-300 ease-in-out data-closed:translate-x-full sm:duration-700',
                  'motion-reduce:transition-none motion-reduce:data-closed:opacity-0'
                )}
              >
                {/* Drawer Content */}
                <div className="relative flex h-full flex-col divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-700 border-l-2 border-sky-500/30">
                  {/* Header */}
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="bg-zinc-50 px-4 py-4 dark:bg-zinc-700 border-b border-sky-500/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          {typeof title === 'string' ? (
                            <Heading
                              level={2}
                              className="text-lg font-semibold text-zinc-950 dark:text-white"
                            >
                              {title}
                            </Heading>
                          ) : (
                            title
                          )}
                          {description && (
                            <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                              {typeof description === 'string' ? description : description}
                            </Text>
                          )}
                        </div>
                        {showCloseButton && (
                          <button
                            type="button"
                            onClick={handleClose}
                            disabled={preventClose}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100/50 text-zinc-400 transition-all hover:bg-zinc-200/50 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700/50 dark:text-zinc-500 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-300"
                            aria-label="Close drawer"
                          >
                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content - Scrollable */}
                    <div
                      className={clsx(
                        'relative flex-1 overflow-y-auto px-4 py-4',
                        contentClassName
                      )}
                    >
                      {children}
                    </div>
                  </div>

                  {/* Footer */}
                  {footer && (
                    <div className="flex flex-shrink-0 justify-end space-x-3 px-4 py-4 bg-zinc-50 dark:bg-zinc-700 border-t border-sky-500/30">
                      {footer}
                    </div>
                  )}
                </div>
              </Headless.DialogPanel>
            </div>
          </div>
        </div>
      </Headless.Dialog>

      {/* Consent Modal for unsaved changes */}
      <ConsentModal
        open={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConfirm={handleConfirmClose}
        title="Unsaved Changes"
        description="You have unsaved changes. Are you sure you want to close without saving?"
        confirmText="Discard Changes"
        cancelText="Keep Editing"
        variant="warning"
      />
    </>
  )
}

export function DrawerTitle({
  className,
  ...props
}: { className?: string } & Omit<Headless.DialogTitleProps, 'as' | 'className'>) {
  return (
    <Headless.DialogTitle
      {...props}
      className={clsx(
        className,
        'text-lg/6 font-semibold text-zinc-950 sm:text-base/6 dark:text-white'
      )}
    />
  )
}

export function DrawerDescription({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps<typeof Text>, 'as' | 'className'>) {
  return (
    <Headless.Description
      as={Text}
      {...props}
      className={clsx(className, 'mt-2 text-sm text-zinc-600 dark:text-zinc-400')}
    />
  )
}

export function DrawerBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'space-y-6')} />
}

export function DrawerFooter({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'flex flex-shrink-0 justify-end space-x-3 bg-zinc-50 dark:bg-zinc-700 px-4 py-4 border-t border-sky-500/30'
      )}
    />
  )
}
