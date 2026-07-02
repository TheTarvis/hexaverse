import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from './toast'
import { toast as sonnerToast } from 'sonner'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn().mockReturnValue('loading-id'),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}))

describe('toast utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('success', () => {
    it('calls sonner toast with success styling', () => {
      toast.success('Operation completed')

      expect(sonnerToast.success).toHaveBeenCalledWith('Operation completed', {
        description: undefined,
        style: {
          background: '#10b981',
          color: 'white',
          border: 'none',
        },
      })
    })

    it('passes description option', () => {
      toast.success('Saved', { description: 'Your changes have been saved' })

      expect(sonnerToast.success).toHaveBeenCalledWith('Saved', {
        description: 'Your changes have been saved',
        style: expect.any(Object),
      })
    })
  })

  describe('error', () => {
    it('calls sonner toast with error styling', () => {
      toast.error('Something went wrong')

      expect(sonnerToast.error).toHaveBeenCalledWith('Something went wrong', {
        description: undefined,
        style: {
          background: '#ef4444',
          color: 'white',
          border: 'none',
        },
      })
    })

    it('passes description option', () => {
      toast.error('Failed', { description: 'Please try again' })

      expect(sonnerToast.error).toHaveBeenCalledWith('Failed', {
        description: 'Please try again',
        style: expect.any(Object),
      })
    })
  })

  describe('warning', () => {
    it('calls sonner toast with warning styling', () => {
      toast.warning('Please review')

      expect(sonnerToast.warning).toHaveBeenCalledWith('Please review', {
        description: undefined,
        style: {
          background: '#f59e0b',
          color: 'white',
          border: 'none',
        },
      })
    })
  })

  describe('info', () => {
    it('calls sonner toast with info styling', () => {
      toast.info('FYI')

      expect(sonnerToast.info).toHaveBeenCalledWith('FYI', {
        description: undefined,
        style: {
          background: '#3b82f6',
          color: 'white',
          border: 'none',
        },
      })
    })
  })

  describe('loading', () => {
    it('calls sonner toast with loading styling and returns id', () => {
      const id = toast.loading('Processing...')

      expect(sonnerToast.loading).toHaveBeenCalledWith('Processing...', {
        description: undefined,
        style: {
          background: '#6366f1',
          color: 'white',
          border: 'none',
        },
      })
      expect(id).toBe('loading-id')
    })
  })

  describe('promise', () => {
    it('calls sonner toast.promise', async () => {
      const promise = Promise.resolve('result')
      const messages = {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed',
      }

      toast.promise(promise, messages)

      expect(sonnerToast.promise).toHaveBeenCalledWith(promise, messages)
    })
  })

  describe('dismiss', () => {
    it('calls sonner toast.dismiss without id', () => {
      toast.dismiss()

      expect(sonnerToast.dismiss).toHaveBeenCalledWith(undefined)
    })

    it('calls sonner toast.dismiss with id', () => {
      toast.dismiss('toast-id')

      expect(sonnerToast.dismiss).toHaveBeenCalledWith('toast-id')
    })

    it('calls sonner toast.dismiss with number id', () => {
      toast.dismiss(123)

      expect(sonnerToast.dismiss).toHaveBeenCalledWith(123)
    })
  })
})
