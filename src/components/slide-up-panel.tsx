'use client'

import { Fragment, useState, useEffect, ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import * as Headless from '@headlessui/react'

interface SlideUpPanelProps {
  children: ReactNode
  isOpen: boolean
  onClose: () => void
  title?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  maxHeight?: string
  showOverlay?: boolean
  closeOnOutsideClick?: boolean
}

export function SlideUpPanel({
  children,
  isOpen,
  onClose,
  title,
  maxWidth = 'md',
  maxHeight = '50vh',
  showOverlay = false,
  closeOnOutsideClick = false
}: SlideUpPanelProps) {
  // Map maxWidth to Tailwind classes
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    'full': 'max-w-full'
  }

  return (
    <Headless.Transition show={isOpen} as={Fragment}>
      <Headless.Dialog 
        as="div" 
        className="relative z-50" 
        onClose={closeOnOutsideClick ? onClose : () => {}}
        static
      >
        {/* Background overlay */}
        {showOverlay && (
          <Headless.TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Headless.TransitionChild>
        )}

        {/* Panel */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center max-h-full">
              <Headless.TransitionChild
                as={Fragment}
                enter="transform transition ease-out duration-300"
                enterFrom="translate-y-full"
                enterTo="translate-y-0"
                leave="transform transition ease-in duration-200"
                leaveFrom="translate-y-0"
                leaveTo="translate-y-full"
              >
                <Headless.DialogPanel 
                  className={`pointer-events-auto w-full ${maxWidthClasses[maxWidth]} bg-white dark:bg-zinc-900 lg:dark:bg-zinc-950 rounded-t-xl shadow-xl transform transition-all`}
                  style={{ maxHeight }}
                >
                  {title && (
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/5 px-4 py-3">
                      <Headless.DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                      </Headless.DialogTitle>
                      <button
                        type="button"
                        className="rounded-md bg-white dark:bg-zinc-900 text-gray-400 hover:text-gray-500 dark:text-zinc-400 dark:hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  <div className="overflow-y-auto p-4" style={{ maxHeight: title ? 'calc(100% - 57px)' : '100%' }}>
                    {children}
                  </div>
                </Headless.DialogPanel>
              </Headless.TransitionChild>
            </div>
          </div>
        </div>
      </Headless.Dialog>
    </Headless.Transition>
  )
} 