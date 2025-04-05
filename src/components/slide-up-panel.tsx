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
}

export function SlideUpPanel({
  children,
  isOpen,
  onClose,
  title,
  maxWidth = 'md',
  maxHeight = '50vh',
  showOverlay = false
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
        onClose={onClose}
      >
        {/* Background overlay */}
        {showOverlay && (
          <Headless.Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Headless.Transition.Child>
        )}

        {/* Panel */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center max-h-full">
              <Headless.Transition.Child
                as={Fragment}
                enter="transform transition ease-out duration-300"
                enterFrom="translate-y-full"
                enterTo="translate-y-0"
                leave="transform transition ease-in duration-200"
                leaveFrom="translate-y-0"
                leaveTo="translate-y-full"
              >
                <Headless.Dialog.Panel 
                  className={`pointer-events-auto w-full ${maxWidthClasses[maxWidth]} bg-white rounded-t-xl shadow-xl transform transition-all`}
                  style={{ maxHeight }}
                >
                  {title && (
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                      <Headless.Dialog.Title className="text-lg font-semibold text-gray-900">
                        {title}
                      </Headless.Dialog.Title>
                      <button
                        type="button"
                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                </Headless.Dialog.Panel>
              </Headless.Transition.Child>
            </div>
          </div>
        </div>
      </Headless.Dialog>
    </Headless.Transition>
  )
} 