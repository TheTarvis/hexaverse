import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrawerForm } from './drawer-form'
import { DrawerMultiStep } from './drawer-multistep'

describe('Drawer ConsentModal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DrawerForm with isDirty', () => {
    it('should show consent modal when closing with unsaved changes', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerForm
          open={true}
          onClose={onClose}
          title="Edit Item"
          onSubmit={onSubmit}
          isDirty={true}
        >
          <div>Form content</div>
        </DrawerForm>
      )

      // Click the X button to close
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      await user.click(closeButton)

      // Consent modal should appear
      await waitFor(() => {
        expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
      })

      expect(screen.getByText('You have unsaved changes. Are you sure you want to close without saving?')).toBeInTheDocument()

      // Drawer should NOT have closed yet
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should close drawer when confirming discard changes', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerForm
          open={true}
          onClose={onClose}
          title="Edit Item"
          onSubmit={onSubmit}
          isDirty={true}
        >
          <div>Form content</div>
        </DrawerForm>
      )

      // Click the X button to close
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      await user.click(closeButton)

      // Wait for consent modal
      await waitFor(() => {
        expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
      })

      // Click "Discard Changes"
      const discardButton = screen.getByRole('button', { name: /discard changes/i })
      await user.click(discardButton)

      // Drawer should close
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce()
      })
    })

    it('should keep drawer open when canceling discard', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerForm
          open={true}
          onClose={onClose}
          title="Edit Item"
          onSubmit={onSubmit}
          isDirty={true}
        >
          <div>Form content</div>
        </DrawerForm>
      )

      // Click the X button to close
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      await user.click(closeButton)

      // Wait for consent modal
      await waitFor(() => {
        expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
      })

      // Click "Keep Editing"
      const keepEditingButton = screen.getByRole('button', { name: /keep editing/i })
      await user.click(keepEditingButton)

      // Drawer should NOT close
      expect(onClose).not.toHaveBeenCalled()

      // Consent modal should disappear
      await waitFor(() => {
        expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument()
      })
    })

    it('should close immediately when isDirty is false', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerForm
          open={true}
          onClose={onClose}
          title="Edit Item"
          onSubmit={onSubmit}
          isDirty={false}
        >
          <div>Form content</div>
        </DrawerForm>
      )

      // Click the X button to close
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      await user.click(closeButton)

      // Should close immediately without consent modal
      expect(onClose).toHaveBeenCalledOnce()
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument()
    })

    it('should not show consent modal when isSubmitting', async () => {
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerForm
          open={true}
          onClose={onClose}
          title="Edit Item"
          onSubmit={onSubmit}
          isDirty={true}
          isSubmitting={true}
        >
          <div>Form content</div>
        </DrawerForm>
      )

      // Click the X button - should be disabled
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      expect(closeButton).toBeDisabled()
    })
  })

  describe('DrawerMultiStep with isDirty', () => {
    const steps = [
      { id: 'step1', label: 'Step 1' },
      { id: 'step2', label: 'Step 2' },
    ]

    it('should show consent modal when closing with unsaved changes', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerMultiStep
          open={true}
          onClose={onClose}
          title="Multi-Step Form"
          steps={steps}
          currentStep={0}
          onSubmit={onSubmit}
          isDirty={true}
        >
          <div>Step content</div>
        </DrawerMultiStep>
      )

      // Click the X button to close
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      await user.click(closeButton)

      // Consent modal should appear
      await waitFor(() => {
        expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
      })

      // Drawer should NOT have closed yet
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should close drawer when confirming discard changes', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSubmit = vi.fn()

      render(
        <DrawerMultiStep
          open={true}
          onClose={onClose}
          title="Multi-Step Form"
          steps={steps}
          currentStep={0}
          onSubmit={onSubmit}
          isDirty={true}
        >
          <div>Step content</div>
        </DrawerMultiStep>
      )

      // Click the X button to close
      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      await user.click(closeButton)

      // Wait for consent modal
      await waitFor(() => {
        expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
      })

      // Click "Discard Changes"
      const discardButton = screen.getByRole('button', { name: /discard changes/i })
      await user.click(discardButton)

      // Drawer should close
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce()
      })
    })
  })
})
