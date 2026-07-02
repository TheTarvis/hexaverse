'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogDescription, DialogTitle } from '@/components/catalyst/dialog'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Field, Label } from '@/components/catalyst/fieldset'
import { DocumentTextIcon, XMarkIcon } from '@heroicons/react/16/solid'

interface DraftCloseModalProps {
  /**
   * Controls whether the modal is open
   */
  open: boolean

  /**
   * Callback when the modal should close (keep editing)
   */
  onClose: () => void

  /**
   * Callback when the user wants to save as draft and close
   * If showNameInput is true, receives the draft name as argument
   */
  onSaveAsDraft: (draftName?: string) => void

  /**
   * Callback when the user wants to discard the draft and close
   */
  onDiscard: () => void

  /**
   * Title of the modal
   * @default "Save as Draft?"
   */
  title?: string

  /**
   * Description/message explaining the options
   * @default "You have an incomplete configuration. Would you like to save it for later or discard it?"
   */
  description?: string

  /**
   * Text for the save as draft button
   * @default "Save Draft"
   */
  saveAsDraftText?: string

  /**
   * Text for the discard button
   * @default "Discard"
   */
  discardText?: string

  /**
   * Whether any action is currently loading
   * @default false
   */
  isLoading?: boolean

  /**
   * Whether to show a name input field for the draft
   * @default false
   */
  showNameInput?: boolean

  /**
   * Initial value for the name input
   */
  initialName?: string

  /**
   * Placeholder for the name input
   * @default "Enter a name for this draft"
   */
  namePlaceholder?: string
}

/**
 * DraftCloseModal - A lightweight confirmation dialog for closing draft wizards
 *
 * Provides two options:
 * - Save Draft: Keep the draft for later and close
 * - Discard: Delete the draft and close
 *
 * Has an X button in the top right to close and continue editing.
 * Optionally shows a name input field when showNameInput is true.
 */
export function DraftCloseModal({
  open,
  onClose,
  onSaveAsDraft,
  onDiscard,
  title = 'Save as Draft?',
  description = 'You have an incomplete configuration. Would you like to save it for later or discard it?',
  saveAsDraftText = 'Save Draft',
  discardText = 'Discard',
  isLoading = false,
  showNameInput = false,
  initialName = '',
  namePlaceholder = 'Enter a name for this draft',
}: DraftCloseModalProps) {
  const [draftName, setDraftName] = useState(initialName)

  // Reset name when modal opens/closes or initialName changes
  useEffect(() => {
    if (open) {
      setDraftName(initialName)
    }
  }, [open, initialName])

  const handleSaveAsDraft = () => {
    onSaveAsDraft(showNameInput ? draftName : undefined)
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm" className="relative z-[60]">
      {/* Compact header with inline icon and close button */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-blue-500 shadow-sm shadow-sky-500/20">
          <DocumentTextIcon className="h-3.5 w-3.5 text-white" />
        </div>
        <DialogTitle className="!text-base flex-1">{title}</DialogTitle>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Description with tighter spacing */}
      <DialogDescription className="!mt-2.5 text-sm">
        {description}
      </DialogDescription>

      {/* Optional name input */}
      {showNameInput && (
        <Field className="mt-4">
          <Label className="text-sm">Draft Name</Label>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={namePlaceholder}
            autoFocus
          />
        </Field>
      )}

      {/* Action row */}
      <div className="mt-5 flex items-center justify-end gap-3">
        <Button plain onClick={onDiscard} disabled={isLoading} className="whitespace-nowrap text-sm text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400">
          {discardText}
        </Button>
        <Button color="sky" onClick={handleSaveAsDraft} disabled={isLoading} className="whitespace-nowrap text-sm">
          {isLoading ? 'Saving...' : saveAsDraftText}
        </Button>
      </div>
    </Dialog>
  )
}
