'use client'

import { Fragment, useState, useEffect } from 'react'
import * as Headless from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose?: () => void
  isVisible: boolean
}

export function Toast({
  message,
  type = 'info',
  duration = 3000,
  onClose,
  isVisible
}: ToastProps) {
  const [show, setShow] = useState(isVisible)

  useEffect(() => {
    setShow(isVisible)
    
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        setShow(false)
        if (onClose) onClose()
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [isVisible, duration, onClose])

  const handleClose = () => {
    setShow(false)
    if (onClose) onClose()
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="h-5 w-5 text-emerald-500" aria-hidden="true" />
      case 'error':
        return <ExclamationCircleIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
      case 'info':
      default:
        return <InformationCircleIcon className="h-5 w-5 text-blue-500" aria-hidden="true" />
    }
  }

  const getBgColor = () => {
    switch (type) {
      case 'success': return 'bg-emerald-50 dark:bg-emerald-950/30'
      case 'error': return 'bg-red-50 dark:bg-red-950/30'
      case 'info': default: return 'bg-blue-50 dark:bg-blue-950/30'
    }
  }

  const getBorderColor = () => {
    switch (type) {
      case 'success': return 'border-emerald-200 dark:border-emerald-800/50'
      case 'error': return 'border-red-200 dark:border-red-800/50'
      case 'info': default: return 'border-blue-200 dark:border-blue-800/50'
    }
  }

  return (
    <Headless.Transition
      show={show}
      as={Fragment}
      enter="transform ease-out duration-300 transition"
      enterFrom="translate-y-2 opacity-0"
      enterTo="translate-y-0 opacity-100"
      leave="transition ease-in duration-200"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="fixed bottom-4 left-1/2 z-50 transform -translate-x-1/2 px-4 sm:px-0">
        <div className={clsx(
          "pointer-events-auto flex items-center w-full max-w-sm rounded-lg border p-4 shadow-lg",
          getBgColor(),
          getBorderColor()
        )}>
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {message}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              type="button"
              className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
              onClick={handleClose}
            >
              <span className="sr-only">Close</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </Headless.Transition>
  )
}

// Create a ToastContainer component to manage multiple toasts
export function ToastContainer() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center space-y-4 p-4">
      {/* Toasts will be rendered here */}
    </div>
  )
} 