import type React from 'react'
import clsx from 'clsx'
import * as Headless from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Heading } from './heading'
import { Text } from './text'

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

export interface DrawerDetailsProps {
  // State management
  open: boolean
  onClose: () => void

  // Content
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode

  // Optional actions in header (Edit, Delete, etc.)
  actions?: React.ReactNode

  // Behavior
  size?: keyof typeof sizes

  // Advanced
  className?: string
  contentClassName?: string
}

/**
 * DrawerDetails - A specialized drawer component for displaying read-only content
 *
 * Use this component when you need to show details, information, or read-only data.
 * Perfect for viewing connection details, schema information, organization info, etc.
 *
 * Features:
 * - No footer (optimized for viewing)
 * - Optional header actions for Edit, Delete, etc.
 * - Always allows closing (no dirty state handling)
 *
 * @example
 * ```tsx
 * <DrawerDetails
 *   open={open}
 *   onClose={onClose}
 *   title="Connection Details"
 *   description="View BigQuery connection configuration"
 *   size="lg"
 *   actions={
 *     <>
 *       <Button onClick={handleTest}>Test Connection</Button>
 *       <Button onClick={handleEdit}>Edit</Button>
 *     </>
 *   }
 * >
 *   <div className="space-y-6">
 *     <Section title="Configuration">
 *       <DescriptionList>
 *         <DescriptionTerm>Project ID</DescriptionTerm>
 *         <DescriptionDetails>{connection.projectId}</DescriptionDetails>
 *       </DescriptionList>
 *     </Section>
 *   </div>
 * </DrawerDetails>
 * ```
 */
export function DrawerDetails({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  size = 'md',
  className,
  contentClassName,
}: DrawerDetailsProps) {
  return (
    <Headless.Dialog open={open} onClose={onClose} className={clsx(className, 'relative z-50')}>
      {/* Backdrop */}
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-700/30 backdrop-blur-sm transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />

      {/* Drawer Panel Container */}
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <Headless.DialogPanel
              transition
              className={clsx(
                'pointer-events-auto w-screen',
                sizes[size],
                'transform transition duration-300 ease-in-out data-closed:translate-x-full sm:duration-700',
                'motion-reduce:transition-none motion-reduce:data-closed:opacity-0'
              )}
            >
              {/* Drawer Content */}
              <div className="flex h-full flex-col bg-white shadow-xl dark:bg-zinc-700">
                {/* Header */}
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="bg-zinc-50 px-6 py-6 dark:bg-zinc-700/50">
                    <div className="flex items-start justify-between">
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
                        {/* Actions in header */}
                        {actions && (
                          <div className="mt-4 flex items-center gap-3">{actions}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="ml-3 rounded-md bg-zinc-50 text-zinc-400 hover:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-zinc-700/50 dark:text-zinc-500 dark:hover:text-zinc-400"
                      >
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Content - Scrollable */}
                  <div
                    className={clsx(
                      'relative flex-1 overflow-y-auto px-6 py-6',
                      contentClassName
                    )}
                  >
                    {children}
                  </div>
                </div>
                {/* No Footer */}
              </div>
            </Headless.DialogPanel>
          </div>
        </div>
      </div>
    </Headless.Dialog>
  )
}
