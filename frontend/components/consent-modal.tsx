'use client'

import { Dialog, DialogActions, DialogDescription, DialogTitle } from '@/components/catalyst/dialog'
import { Button } from '@/components/catalyst/button'
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

interface ConsentModalProps {
  /**
   * Controls whether the modal is open
   */
  open: boolean

  /**
   * Callback when the modal should close
   */
  onClose: () => void

  /**
   * Callback when the user confirms the action
   */
  onConfirm: () => void | Promise<void>

  /**
   * Title of the modal
   */
  title: string

  /**
   * Description/message explaining what will happen
   */
  description: string

  /**
   * Text for the confirm button
   * @default "Confirm"
   */
  confirmText?: string

  /**
   * Text for the cancel button
   * @default "Cancel"
   */
  cancelText?: string

  /**
   * Variant of the modal
   * - 'warning': Yellow warning icon (unsaved changes, non-critical)
   * - 'danger': Red warning icon (destructive actions like delete)
   * @default 'warning'
   */
  variant?: 'warning' | 'danger'

  /**
   * Size of the modal dialog
   * @default 'sm'
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'

  /**
   * Whether the confirm action is currently loading
   * @default false
   */
  isLoading?: boolean
}

export function ConsentModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  size = 'sm',
  isLoading = false,
}: ConsentModalProps) {
  const handleConfirm = async () => {
    await onConfirm()
    // Don't auto-close - let parent handle this after successful action
  }

  const iconColorClasses =
    variant === 'danger'
      ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
      : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400'

  const confirmButtonColor = variant === 'danger' ? 'red' : 'yellow'

  return (
    <Dialog open={open} onClose={onClose} size={size} className="relative z-[60]">
      <div className="flex items-start gap-4">
        <div className={clsx('flex-shrink-0 rounded-full p-3', iconColorClasses)}>
          <ExclamationTriangleIcon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
      </div>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isLoading}>
          {cancelText}
        </Button>
        <Button color={confirmButtonColor} onClick={handleConfirm} disabled={isLoading}>
          {isLoading ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}