import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter } from './drawer'
import { Button } from './button'

// Mock the consent modal component
vi.mock('@/components/consent-modal', () => ({
  ConsentModal: ({
    open,
    onConfirm,
    onClose,
    title,
    description,
  }: {
    open: boolean
    onConfirm: () => void
    onClose: () => void
    title: string
    description: string
  }) => {
    if (!open) return null
    return (
      <div data-testid="consent-modal">
        <h2>{title}</h2>
        <p>{description}</p>
        <button onClick={onClose}>Keep Editing</button>
        <button onClick={onConfirm}>Discard Changes</button>
      </div>
    )
  },
}))

describe('Drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic rendering', () => {
    it('renders with title and content when open', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test Drawer">
          <div>Drawer content</div>
        </Drawer>
      )

      expect(screen.getByText('Test Drawer')).toBeInTheDocument()
      expect(screen.getByText('Drawer content')).toBeInTheDocument()
    })

    it('renders with description', () => {
      render(
        <Drawer
          open={true}
          onClose={vi.fn()}
          title="Test Drawer"
          description="This is a test description"
        >
          <div>Content</div>
        </Drawer>
      )

      expect(screen.getByText('This is a test description')).toBeInTheDocument()
    })

    it('renders with React node as title', () => {
      render(
        <Drawer
          open={true}
          onClose={vi.fn()}
          title={<div data-testid="custom-title">Custom Title</div>}
        >
          <div>Content</div>
        </Drawer>
      )

      expect(screen.getByTestId('custom-title')).toBeInTheDocument()
    })

    it('renders footer when provided', () => {
      render(
        <Drawer
          open={true}
          onClose={vi.fn()}
          title="Test"
          footer={
            <>
              <Button plain>Cancel</Button>
              <Button>Save</Button>
            </>
          }
        >
          <div>Content</div>
        </Drawer>
      )

      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    it('does not render footer when not provided', () => {
      const { container } = render(
        <Drawer open={true} onClose={vi.fn()} title="Test">
          <div>Content</div>
        </Drawer>
      )

      // Footer should not exist
      const footer = container.querySelector('.flex-shrink-0.justify-end')
      expect(footer).toBeNull()
    })

    it('does not render when closed', () => {
      render(
        <Drawer open={false} onClose={vi.fn()} title="Test Drawer">
          <div>Drawer content</div>
        </Drawer>
      )

      // Content should not be in document when drawer is closed
      expect(screen.queryByText('Drawer content')).not.toBeInTheDocument()
    })
  })

  describe('size variants', () => {
    it('renders with default size (md)', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test">
          <div>Content</div>
        </Drawer>
      )

      // Verify drawer renders and has content
      expect(screen.getByText('Test')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
    })

    it('renders with sm size', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test" size="sm">
          <div>Content</div>
        </Drawer>
      )

      expect(screen.getByText('Test')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
    })

    it('renders with xl size', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test" size="xl">
          <div>Content</div>
        </Drawer>
      )

      expect(screen.getByText('Test')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
    })

    it('renders with 3xl size', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test" size="3xl">
          <div>Content</div>
        </Drawer>
      )

      expect(screen.getByText('Test')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
    })
  })

  describe('close button behavior', () => {
    it('shows close button by default', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test">
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      expect(closeButton).toBeInTheDocument()
    })

    it('hides close button when showCloseButton is false', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test" showCloseButton={false}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.queryByLabelText('Close drawer')
      expect(closeButton).not.toBeInTheDocument()
    })

    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('disables close button when preventClose is true', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test" preventClose={true}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      expect(closeButton).toBeDisabled()
    })
  })

  describe('dirty state and consent modal', () => {
    it('shows consent modal when closing with isDirty true', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" isDirty={true}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      // Consent modal should appear
      await waitFor(() => {
        expect(screen.getByTestId('consent-modal')).toBeInTheDocument()
      })

      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('closes immediately when isDirty is false', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" isDirty={false}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      expect(onClose).toHaveBeenCalledOnce()
      expect(screen.queryByTestId('consent-modal')).not.toBeInTheDocument()
    })

    it('closes drawer when confirming discard from consent modal', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" isDirty={true}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.getByTestId('consent-modal')).toBeInTheDocument()
      })

      const discardButton = screen.getByText('Discard Changes')
      await user.click(discardButton)

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce()
      })
    })

    it('keeps drawer open when canceling from consent modal', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" isDirty={true}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.getByTestId('consent-modal')).toBeInTheDocument()
      })

      const keepEditingButton = screen.getByText('Keep Editing')
      await user.click(keepEditingButton)

      await waitFor(() => {
        expect(screen.queryByTestId('consent-modal')).not.toBeInTheDocument()
      })

      expect(onClose).not.toHaveBeenCalled()
    })

    it('uses custom confirm handler when provided', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onConfirmClose = vi.fn()

      render(
        <Drawer
          open={true}
          onClose={onClose}
          title="Test"
          isDirty={true}
          onConfirmClose={onConfirmClose}
        >
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      expect(onConfirmClose).toHaveBeenCalledOnce()
      expect(screen.queryByTestId('consent-modal')).not.toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('prevent close behavior', () => {
    it('does not close when preventClose is true', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" preventClose={true}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      expect(onClose).not.toHaveBeenCalled()
    })

    it('does not show consent modal when preventClose is true', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" preventClose={true} isDirty={true}>
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      await user.click(closeButton)

      expect(screen.queryByTestId('consent-modal')).not.toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('click outside behavior', () => {
    it('closes on backdrop click by default', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      const { container } = render(
        <Drawer open={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Drawer>
      )

      // Find the backdrop (DialogBackdrop)
      const backdrop = container.querySelector('.fixed.inset-0.bg-zinc-800\\/80')
      if (backdrop) {
        await user.click(backdrop)
        expect(onClose).toHaveBeenCalled()
      }
    })

    it('does not close on backdrop click when closeOnClickOutside is false', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      const { container } = render(
        <Drawer open={true} onClose={onClose} title="Test" closeOnClickOutside={false}>
          <div>Content</div>
        </Drawer>
      )

      const backdrop = container.querySelector('.fixed.inset-0.bg-zinc-800\\/80')
      if (backdrop) {
        await user.click(backdrop)
        expect(onClose).not.toHaveBeenCalled()
      }
    })
  })

  describe('keyboard interactions', () => {
    it('closes on Escape key press', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Drawer>
      )

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('does not close on Escape when preventClose is true', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" preventClose={true}>
          <div>Content</div>
        </Drawer>
      )

      await user.keyboard('{Escape}')

      // Give time for any handlers to run
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(onClose).not.toHaveBeenCalled()
    })

    it('shows consent modal on Escape when isDirty is true', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(
        <Drawer open={true} onClose={onClose} title="Test" isDirty={true}>
          <div>Content</div>
        </Drawer>
      )

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.getByTestId('consent-modal')).toBeInTheDocument()
      })

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('custom styling', () => {
    it('renders with custom className', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test" className="custom-drawer-class">
          <div>Content</div>
        </Drawer>
      )

      // Verify drawer renders with custom class
      expect(screen.getByText('Test')).toBeInTheDocument()
    })

    it('renders with custom contentClassName', () => {
      render(
        <Drawer
          open={true}
          onClose={vi.fn()}
          title="Test"
          contentClassName="custom-content-class"
        >
          <div>Content</div>
        </Drawer>
      )

      // Verify content renders with custom class
      expect(screen.getByText('Content')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has proper aria-label on close button', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test">
          <div>Content</div>
        </Drawer>
      )

      const closeButton = screen.getByLabelText('Close drawer')
      expect(closeButton).toHaveAttribute('aria-label', 'Close drawer')
    })

    it('renders as a dialog element', () => {
      render(
        <Drawer open={true} onClose={vi.fn()} title="Test">
          <div>Content</div>
        </Drawer>
      )

      // HeadlessUI Dialog renders with role="dialog"
      const dialog = screen.getByRole('dialog', { hidden: true })
      expect(dialog).toBeInTheDocument()
    })
  })
})

describe('DrawerTitle', () => {
  it('renders with text content', () => {
    render(
      <Drawer open={true} onClose={vi.fn()} title={<DrawerTitle>Test Title</DrawerTitle>}>
        <div>Content</div>
      </Drawer>
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(
      <Drawer open={true} onClose={vi.fn()} title={<DrawerTitle className="custom-title">Title</DrawerTitle>}>
        <div>Content</div>
      </Drawer>
    )
    expect(screen.getByText('Title')).toHaveClass('custom-title')
  })

  it('applies default styling classes', () => {
    render(
      <Drawer open={true} onClose={vi.fn()} title={<DrawerTitle>Title</DrawerTitle>}>
        <div>Content</div>
      </Drawer>
    )
    const title = screen.getByText('Title')
    expect(title).toHaveClass('text-lg/6', 'font-semibold', 'text-zinc-950')
  })
})

describe('DrawerDescription', () => {
  it('renders with text content', () => {
    render(
      <Drawer open={true} onClose={vi.fn()} title="Test" description={<DrawerDescription>Test Description</DrawerDescription>}>
        <div>Content</div>
      </Drawer>
    )
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(
      <Drawer open={true} onClose={vi.fn()} title="Test" description={<DrawerDescription className="custom-desc">Description</DrawerDescription>}>
        <div>Content</div>
      </Drawer>
    )
    expect(screen.getByText('Description')).toHaveClass('custom-desc')
  })

  it('applies default styling classes', () => {
    render(
      <Drawer open={true} onClose={vi.fn()} title="Test" description={<DrawerDescription>Description</DrawerDescription>}>
        <div>Content</div>
      </Drawer>
    )
    const desc = screen.getByText('Description')
    expect(desc).toHaveClass('mt-2', 'text-sm', 'text-zinc-600')
  })
})

describe('DrawerBody', () => {
  it('renders children content', () => {
    render(
      <DrawerBody>
        <div>Body content</div>
      </DrawerBody>
    )
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<DrawerBody className="custom-body">Content</DrawerBody>)
    const body = container.querySelector('.custom-body')
    expect(body).toBeInTheDocument()
  })

  it('applies default spacing class', () => {
    const { container } = render(<DrawerBody>Content</DrawerBody>)
    const body = container.querySelector('.space-y-6')
    expect(body).toBeInTheDocument()
  })
})

describe('DrawerFooter', () => {
  it('renders children content', () => {
    render(
      <DrawerFooter>
        <button>Cancel</button>
        <button>Save</button>
      </DrawerFooter>
    )
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<DrawerFooter className="custom-footer">Content</DrawerFooter>)
    const footer = container.querySelector('.custom-footer')
    expect(footer).toBeInTheDocument()
  })

  it('applies default layout classes', () => {
    const { container } = render(<DrawerFooter>Content</DrawerFooter>)
    const footer = container.querySelector('.flex.flex-shrink-0.justify-end.space-x-3')
    expect(footer).toBeInTheDocument()
  })
})
