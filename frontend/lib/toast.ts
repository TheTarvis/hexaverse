import { toast as sonnerToast } from 'sonner'

interface ToastOptions {
  description?: string
}

// Custom toast utility with consistent styling and behavior
export const toast = {
  success: (message: string, options?: ToastOptions) => {
    sonnerToast.success(message, {
      description: options?.description,
      style: {
        background: '#10b981',
        color: 'white',
        border: 'none',
      },
    })
  },

  error: (message: string, options?: ToastOptions) => {
    sonnerToast.error(message, {
      description: options?.description,
      style: {
        background: '#ef4444',
        color: 'white',
        border: 'none',
      },
    })
  },

  warning: (message: string, options?: ToastOptions) => {
    sonnerToast.warning(message, {
      description: options?.description,
      style: {
        background: '#f59e0b',
        color: 'white',
        border: 'none',
      },
    })
  },

  info: (message: string, options?: ToastOptions) => {
    sonnerToast.info(message, {
      description: options?.description,
      style: {
        background: '#3b82f6',
        color: 'white',
        border: 'none',
      },
    })
  },

  loading: (message: string, options?: ToastOptions) => {
    return sonnerToast.loading(message, {
      description: options?.description,
      style: {
        background: '#6366f1',
        color: 'white',
        border: 'none',
      },
    })
  },
  
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: unknown) => string)
    }
  ) => {
    return sonnerToast.promise(promise, messages)
  },
  
  dismiss: (id?: string | number) => {
    sonnerToast.dismiss(id)
  },
}