import type React from 'react'
import { Drawer, type DrawerProps } from './drawer'
import { Button } from './button'

export interface DrawerFormProps extends Omit<DrawerProps, 'footer' | 'preventClose'> {
  // Form handling
  onSubmit: (e: React.FormEvent) => void

  // Footer buttons
  submitLabel?: string
  cancelLabel?: string
  isSubmitting?: boolean
  canSubmit?: boolean
  showCancel?: boolean

  // Additional footer actions (optional - for Delete, Archive, etc.)
  footerActions?: React.ReactNode

  // Mode for auto-generating submit label
  mode?: 'create' | 'edit'

  // Dirty state tracking (inherited from DrawerProps but listed here for visibility)
  // isDirty?: boolean - Already in DrawerProps, no need to redeclare
}

/**
 * DrawerForm - A specialized drawer component for single-step forms
 *
 * Use this component for create/edit forms with a single screen of inputs.
 * Perfect for CRUD operations like creating organizations, sources, etc.
 *
 * Features:
 * - Auto-generates Cancel + Submit footer buttons
 * - Handles form submission
 * - Loading states during submission
 * - Disables close during submission
 * - Confirms close if form is dirty
 * - Submit button auto-disabled if !canSubmit
 * - Optional footer actions (like Delete button)
 *
 * @example
 * ```tsx
 * <DrawerForm
 *   open={open}
 *   onClose={onClose}
 *   title="Create New Source"
 *   description="Add a data source to your organization"
 *   onSubmit={handleSubmit}
 *   isDirty={isDirty}
 *   canSubmit={isValid}
 *   isSubmitting={mutation.isPending}
 *   mode="create"
 *   size="md"
 *   footerActions={
 *     mode === 'edit' && (
 *       <Button color="red" onClick={handleDelete}>
 *         Delete
 *       </Button>
 *     )
 *   }
 * >
 *   <Fieldset>
 *     <Field>
 *       <Label>Source Name</Label>
 *       <Input value={name} onChange={setName} />
 *     </Field>
 *   </Fieldset>
 * </DrawerForm>
 * ```
 */
export function DrawerForm({
  onSubmit,
  submitLabel,
  cancelLabel = 'Cancel',
  isSubmitting = false,
  canSubmit = true,
  showCancel = true,
  footerActions,
  mode = 'create',
  children,
  onClose,
  isDirty, // Extract isDirty to pass to Drawer
  ...drawerProps
}: DrawerFormProps) {
  // Auto-generate submit label based on mode if not provided
  const finalSubmitLabel =
    submitLabel || (isSubmitting ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create')

  // Handle form submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSubmitting && canSubmit) {
      onSubmit(e)
    }
  }

  return (
    <Drawer
      {...drawerProps}
      onClose={onClose}
      preventClose={isSubmitting}
      isDirty={isDirty}
      footer={
        <div className="flex w-full justify-between">
          {/* Left side: Additional actions (Delete, etc.) */}
          <div>{footerActions}</div>

          {/* Right side: Cancel + Submit */}
          <div className="flex gap-3">
            {showCancel && (
              <Button plain onClick={onClose} disabled={isSubmitting}>
                {cancelLabel}
              </Button>
            )}
            <Button
              type="submit"
              color="sky"
              onClick={handleFormSubmit}
              disabled={isSubmitting || !canSubmit}
            >
              {finalSubmitLabel}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {children}
      </form>
    </Drawer>
  )
}
