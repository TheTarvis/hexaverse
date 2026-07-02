'use client'

import { useState, useCallback, useRef } from 'react'
import { Dialog, DialogDescription, DialogTitle } from '@/components/catalyst/dialog'
import { Button } from '@/components/catalyst/button'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface DeleteConfirmationModalProps {
  /**
   * Controls whether the modal is open
   */
  open: boolean

  /**
   * Callback when the modal should close (cancel)
   */
  onClose: () => void

  /**
   * Callback when the user confirms deletion
   */
  onConfirm: () => void | Promise<void>

  /**
   * The name of the item being deleted (shown in the message)
   */
  itemName?: string

  /**
   * Type of item being deleted (e.g., "configuration", "data type", "record")
   * @default "item"
   */
  itemType?: string

  /**
   * Custom title for the modal
   * @default "Delete {itemType}?"
   */
  title?: string

  /**
   * Custom description/warning message
   * @default "Are you sure you want to delete {itemName}? This action cannot be undone."
   */
  description?: string

  /**
   * Optional content rendered below the description (e.g., usage warnings)
   */
  children?: React.ReactNode

  /**
   * Text for the confirm button
   * @default "Delete"
   */
  confirmText?: string

  /**
   * Text for the cancel button
   * @default "Cancel"
   */
  cancelText?: string

  /**
   * Whether the delete operation is in progress
   * @default false
   */
  isDeleting?: boolean
}

/**
 * DeleteConfirmationModal - A refined confirmation dialog for destructive actions
 *
 * Replaces browser confirm() dialogs with a polished, accessible modal that
 * emphasizes the destructive nature of the action while providing clear choices.
 *
 * @example
 * ```tsx
 * const [showDelete, setShowDelete] = useState(false)
 * const [itemToDelete, setItemToDelete] = useState<Item | null>(null)
 *
 * const handleDelete = async () => {
 *   if (itemToDelete) {
 *     await deleteItem(itemToDelete.id)
 *     setShowDelete(false)
 *   }
 * }
 *
 * <DeleteConfirmationModal
 *   open={showDelete}
 *   onClose={() => setShowDelete(false)}
 *   onConfirm={handleDelete}
 *   itemName={itemToDelete?.name}
 *   itemType="configuration"
 *   isDeleting={isDeleting}
 * />
 * ```
 */
export function DeleteConfirmationModal({
  open,
  onClose,
  onConfirm,
  itemName,
  itemType = 'item',
  title,
  description,
  children,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDeleting = false,
}: DeleteConfirmationModalProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  // Ref to prevent double-clicks (state updates are async, so rapid clicks can get through)
  const isProcessingRef = useRef(false)

  const displayTitle = title ?? `Delete ${itemType}?`
  const displayDescription =
    description ??
    (itemName
      ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
      : `Are you sure you want to delete this ${itemType}? This action cannot be undone.`)

  const handleConfirm = useCallback(async () => {
    // Prevent double-submission - check ref immediately (synchronous)
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    setIsConfirming(true)
    try {
      await onConfirm()
    } finally {
      setIsConfirming(false)
      isProcessingRef.current = false
    }
  }, [onConfirm])

  const loading = isDeleting || isConfirming

  return (
    <Dialog open={open} onClose={onClose} size="sm" className="relative z-[60]">
      {/* Warning icon with rose gradient */}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-500 shadow-lg shadow-rose-500/20">
          <ExclamationTriangleIcon className="h-5 w-5 text-white" />
        </div>

        <div className="flex-1 pt-0.5">
          <DialogTitle className="!text-base font-semibold">{displayTitle}</DialogTitle>
          <DialogDescription className="!mt-1.5 text-sm leading-relaxed">
            {displayDescription}
          </DialogDescription>
          {children}
        </div>
      </div>

      {/* Subtle divider */}
      <div className="mt-5 border-t border-zinc-200/60 dark:border-zinc-700/60" />

      {/* Action buttons */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button plain onClick={onClose} disabled={loading} className="text-sm">
          {cancelText}
        </Button>
        <Button
          color="red"
          onClick={handleConfirm}
          disabled={loading}
          className="text-sm"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Deleting...
            </span>
          ) : (
            confirmText
          )}
        </Button>
      </div>
    </Dialog>
  )
}

// ============================================================================
// Hook for managing delete confirmation state
// ============================================================================

interface UseDeleteConfirmationOptions<T> {
  /**
   * Callback to perform the actual deletion
   */
  onDelete: (item: T) => void | Promise<void>

  /**
   * Extract the display name from the item
   */
  getItemName?: (item: T) => string

  /**
   * Type of item being deleted
   */
  itemType?: string
}

interface UseDeleteConfirmationReturn<T> {
  /**
   * Whether the modal is open
   */
  isOpen: boolean

  /**
   * The item currently selected for deletion
   */
  itemToDelete: T | null

  /**
   * Whether deletion is in progress
   */
  isDeleting: boolean

  /**
   * Open the confirmation modal for a specific item
   */
  confirmDelete: (item: T) => void

  /**
   * Close the modal without deleting
   */
  cancelDelete: () => void

  /**
   * Perform the deletion (called by modal's onConfirm)
   */
  executeDelete: () => Promise<void>

  /**
   * Props to spread on DeleteConfirmationModal
   */
  modalProps: {
    open: boolean
    onClose: () => void
    onConfirm: () => Promise<void>
    itemName: string | undefined
    itemType: string
    isDeleting: boolean
  }
}

/**
 * useDeleteConfirmation - Hook for managing delete confirmation state
 *
 * Simplifies the common pattern of showing a confirmation modal before deletion.
 *
 * @example
 * ```tsx
 * const { confirmDelete, modalProps } = useDeleteConfirmation({
 *   onDelete: async (config) => {
 *     await deleteConfig.mutateAsync(config.id)
 *     toast.success('Deleted successfully')
 *   },
 *   getItemName: (config) => config.name,
 *   itemType: 'configuration',
 * })
 *
 * // In your component:
 * <button onClick={() => confirmDelete(config)}>Delete</button>
 * <DeleteConfirmationModal {...modalProps} />
 * ```
 */
export function useDeleteConfirmation<T>({
  onDelete,
  getItemName,
  itemType = 'item',
}: UseDeleteConfirmationOptions<T>): UseDeleteConfirmationReturn<T> {
  const [isOpen, setIsOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<T | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  // Ref to prevent double-execution (additional guard at hook level)
  const isExecutingRef = useRef(false)

  const confirmDelete = useCallback((item: T) => {
    setItemToDelete(item)
    setIsOpen(true)
  }, [])

  const cancelDelete = useCallback(() => {
    setIsOpen(false)
    setItemToDelete(null)
  }, [])

  const executeDelete = useCallback(async () => {
    if (!itemToDelete) return
    // Prevent double-execution
    if (isExecutingRef.current) return
    isExecutingRef.current = true

    setIsDeleting(true)
    try {
      await onDelete(itemToDelete)
      setIsOpen(false)
      setItemToDelete(null)
    } finally {
      setIsDeleting(false)
      isExecutingRef.current = false
    }
  }, [itemToDelete, onDelete])

  return {
    isOpen,
    itemToDelete,
    isDeleting,
    confirmDelete,
    cancelDelete,
    executeDelete,
    modalProps: {
      open: isOpen,
      onClose: cancelDelete,
      onConfirm: executeDelete,
      itemName: itemToDelete && getItemName ? getItemName(itemToDelete) : undefined,
      itemType,
      isDeleting,
    },
  }
}
