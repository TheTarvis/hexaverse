'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Toast, ToastType } from '@/components/toast'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastContextProps {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  hideToast: (id: string) => void
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast = { id, message, type, duration }
    
    setToasts((prevToasts) => [...prevToasts, newToast])
    
    if (duration > 0) {
      setTimeout(() => {
        hideToast(id)
      }, duration)
    }
    
    return id
  }, [])

  const hideToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      
      {/* Render all active toasts */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center space-y-4 p-4 pointer-events-none">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            isVisible={true}
            onClose={() => hideToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  
  return context
} 