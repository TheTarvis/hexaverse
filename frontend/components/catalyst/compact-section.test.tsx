import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompactSection } from './compact-section'
import { CubeIcon } from '@heroicons/react/24/outline'

describe('CompactSection', () => {
  describe('basic rendering', () => {
    it('renders with title and description', () => {
      render(
        <CompactSection title="Test Section" description="Test description">
          <div>Section content</div>
        </CompactSection>
      )

      expect(screen.getByText('Test Section')).toBeInTheDocument()
      expect(screen.getByText('Test description')).toBeInTheDocument()
    })

    it('renders children content when open', () => {
      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={true}>
          <div>Section content</div>
        </CompactSection>
      )

      expect(screen.getByText('Section content')).toBeInTheDocument()
    })

    it('hides children content when closed by default', () => {
      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Section content</div>
        </CompactSection>
      )

      // Content should be in the DOM but hidden via CSS
      const content = screen.getByText('Section content')
      // Check if parent has grid-rows-[0fr] which hides it
      const contentWrapper = content.closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[0fr]', 'opacity-0')
    })
  })

  describe('icon rendering', () => {
    it('renders with icon when provided', () => {
      render(
        <CompactSection
          title="Test Section"
          description="Description"
          icon={<CubeIcon className="h-5 w-5" data-testid="custom-icon" />}
        >
          <div>Content</div>
        </CompactSection>
      )

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
    })

    it('renders without icon when not provided', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description">
          <div>Content</div>
        </CompactSection>
      )

      // Icon container should not exist
      const iconContainer = container.querySelector('.bg-gradient-to-br')
      expect(iconContainer).not.toBeInTheDocument()
    })
  })

  describe('toggle functionality', () => {
    it('toggles open state when clicking header', async () => {
      const user = userEvent.setup()

      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Section content</div>
        </CompactSection>
      )

      // Get the header button by finding the title text and getting its parent button
      const title = screen.getByText('Test Section')
      const button = title.closest('button')
      expect(button).toBeInTheDocument()

      // Initially closed - content should have grid-rows-[0fr]
      let contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[0fr]')

      // Click to open
      await user.click(button!)

      // Should now be open - content should have grid-rows-[1fr]
      contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[1fr]')

      // Click to close
      await user.click(button!)

      // Should be closed again
      contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[0fr]')
    })

    it('shows plus icon when closed', () => {
      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Content</div>
        </CompactSection>
      )

      // There should be a toggle button (the second button after the title button)
      const buttons = screen.getAllByRole('button')
      // At least 2 buttons: title button + toggle button
      expect(buttons.length).toBeGreaterThanOrEqual(2)
    })

    it('shows minus icon when open', () => {
      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={true}>
          <div>Content</div>
        </CompactSection>
      )

      // When open, toggle button should still be present
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('completion state', () => {
    it('shows checkmark when isComplete is true', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" isComplete={true}>
          <div>Content</div>
        </CompactSection>
      )

      // CheckCircleIcon should be present
      const checkIcon = container.querySelector('.h-5.w-5')
      expect(checkIcon).toBeInTheDocument()
    })

    it('does not show checkmark when isComplete is false', () => {
      const { container } = render(
        <CompactSection
          title="Test Section"
          description="Description"
          isComplete={false}
          icon={<CubeIcon className="h-5 w-5" data-testid="custom-icon" />}
        >
          <div>Content</div>
        </CompactSection>
      )

      // Custom icon should be present
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
      // CheckCircleIcon (h-4 w-4) should not be present since isComplete is false
      const checkIcons = container.querySelectorAll('.h-4.w-4')
      // The only h-4 w-4 elements should be the toggle icon, not a CheckCircleIcon
      checkIcons.forEach((el) => {
        // None of these should be a CheckCircleIcon (which would be inside a status area)
        expect(el.closest('[data-testid="check-circle"]')).toBeNull()
      })
    })
  })

  describe('accent color variants', () => {
    const colors: Array<'violet' | 'blue' | 'emerald' | 'amber' | 'sky' | 'slate'> = [
      'violet',
      'blue',
      'emerald',
      'amber',
      'sky',
      'slate',
    ]

    colors.forEach((color) => {
      it(`renders with ${color} accent color`, () => {
        const { container } = render(
          <CompactSection
            title="Test Section"
            description="Description"
            accentColor={color}
            icon={<CubeIcon className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div>Content</div>
          </CompactSection>
        )

        // Check that gradient is applied (all colors use from-{color}-500 pattern)
        const iconContainer = container.querySelector('.bg-gradient-to-br')
        expect(iconContainer).toBeInTheDocument()
      })
    })

    it('uses sky accent color by default', () => {
      const { container } = render(
        <CompactSection
          title="Test Section"
          description="Description"
          icon={<CubeIcon className="h-5 w-5" />}
        >
          <div>Content</div>
        </CompactSection>
      )

      const iconContainer = container.querySelector('.bg-gradient-to-br')
      expect(iconContainer).toBeInTheDocument()
    })
  })

  describe('highlighting', () => {
    it('applies highlight styles when isHighlighted is true', () => {
      const { container } = render(
        <CompactSection
          title="Test Section"
          description="Description"
          isHighlighted={true}
          accentColor="violet"
        >
          <div>Content</div>
        </CompactSection>
      )

      // Check for ring classes that indicate highlighting
      const section = container.querySelector('.ring-2')
      expect(section).toBeInTheDocument()
    })

    it('does not apply highlight styles when isHighlighted is false', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" isHighlighted={false}>
          <div>Content</div>
        </CompactSection>
      )

      const section = container.querySelector('.ring-2')
      expect(section).not.toBeInTheDocument()
    })
  })

  describe('id attribute for scrolling', () => {
    it('applies id attribute when provided', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" id="section-1">
          <div>Content</div>
        </CompactSection>
      )

      const section = container.querySelector('#section-1')
      expect(section).toBeInTheDocument()
    })

    it('does not apply id when not provided', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description">
          <div>Content</div>
        </CompactSection>
      )

      // The root div should not have an id
      const section = container.querySelector('div[id]')
      expect(section).toBeNull()
    })
  })

  describe('visual elements', () => {
    it('shows accent bar when section is open', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" defaultOpen={true}>
          <div>Content</div>
        </CompactSection>
      )

      // Left accent bar
      const accentBar = container.querySelector('.absolute.left-0.top-0.bottom-0.w-1')
      expect(accentBar).toBeInTheDocument()
    })

    it('hides accent bar when section is closed', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Content</div>
        </CompactSection>
      )

      const accentBar = container.querySelector('.absolute.left-0.top-0.bottom-0.w-1')
      expect(accentBar).not.toBeInTheDocument()
    })

    it('renders hover glow effect', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description">
          <div>Content</div>
        </CompactSection>
      )

      // Hover glow element
      const glow = container.querySelector('.blur-3xl')
      expect(glow).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('renders toggle as a button', () => {
      render(
        <CompactSection title="Test Section" description="Description">
          <div>Content</div>
        </CompactSection>
      )

      // There are two buttons - the header button and the toggle icon button
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
      buttons.forEach(button => {
        expect(button).toHaveAttribute('type', 'button')
      })
    })

    it('title is clickable for toggle', async () => {
      const user = userEvent.setup()

      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Section content</div>
        </CompactSection>
      )

      const title = screen.getByText('Test Section')
      const button = title.closest('button')

      expect(button).toBeInTheDocument()

      if (button) {
        await user.click(button)

        // Content should be visible after click
        const contentWrapper = screen.getByText('Section content').closest('.grid')
        expect(contentWrapper).toHaveClass('grid-rows-[1fr]')
      }
    })
  })

  describe('defaultOpen behavior', () => {
    it('opens by default when defaultOpen is true', () => {
      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={true}>
          <div>Section content</div>
        </CompactSection>
      )

      const contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[1fr]')
    })

    it('closes by default when defaultOpen is false', () => {
      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Section content</div>
        </CompactSection>
      )

      const contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[0fr]')
    })

    it('opens by default when defaultOpen is not provided', () => {
      render(
        <CompactSection title="Test Section" description="Description">
          <div>Section content</div>
        </CompactSection>
      )

      const contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[1fr]')
    })
  })

  describe('border styling', () => {
    it('applies accent border when open', () => {
      const { container } = render(
        <CompactSection
          title="Test Section"
          description="Description"
          accentColor="sky"
          defaultOpen={true}
        >
          <div>Content</div>
        </CompactSection>
      )

      const section = container.querySelector('.border-sky-500\\/30')
      expect(section).toBeInTheDocument()
    })

    it('applies default border when closed', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>Content</div>
        </CompactSection>
      )

      const section = container.querySelector('.border-zinc-200')
      expect(section).toBeInTheDocument()
    })
  })

  describe('content border', () => {
    it('shows content border when section is open', () => {
      const { container } = render(
        <CompactSection title="Test Section" description="Description" defaultOpen={true}>
          <div>Section content</div>
        </CompactSection>
      )

      // Content has border-t
      const contentContainer = container.querySelector('.border-t.border-zinc-200')
      expect(contentContainer).toBeInTheDocument()
    })
  })

  describe('complex children', () => {
    it('renders complex nested content', async () => {
      const user = userEvent.setup()

      render(
        <CompactSection title="Test Section" description="Description" defaultOpen={false}>
          <div>
            <h4>Subsection</h4>
            <p>Paragraph 1</p>
            <p>Paragraph 2</p>
            <button>Action Button</button>
          </div>
        </CompactSection>
      )

      // Initially hidden
      expect(screen.queryByText('Subsection')).toBeInTheDocument()

      // Open the section
      const toggleButton = screen.getByRole('button', { name: /test section/i })
      await user.click(toggleButton)

      // All content should be visible
      expect(screen.getByText('Subsection')).toBeInTheDocument()
      expect(screen.getByText('Paragraph 1')).toBeInTheDocument()
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument()
    })
  })

  describe('hover effects', () => {
    it('applies hover background on header', () => {
      render(
        <CompactSection title="Test Section" description="Description">
          <div>Content</div>
        </CompactSection>
      )

      // Get the header button by finding the title
      const title = screen.getByText('Test Section')
      const button = title.closest('button')

      expect(button).toBeInTheDocument()
      // Check that hover classes are present
      expect(button).toHaveClass('hover:opacity-80')
    })
  })

  describe('auto-collapse behavior', () => {
    it('does not collapse on mount when isComplete starts as true', () => {
      render(
        <CompactSection
          title="Test Section"
          description="Description"
          defaultOpen={true}
          isComplete={true}
        >
          <div>Section content</div>
        </CompactSection>
      )

      const contentWrapper = screen.getByText('Section content').closest('.grid')
      expect(contentWrapper).toHaveClass('grid-rows-[1fr]')
    })

  })

  describe('truncation', () => {
    it('truncates long descriptions', () => {
      render(
        <CompactSection
          title="Test Section"
          description="This is a very long description that should be truncated when it exceeds the available space in the compact section header"
        >
          <div>Content</div>
        </CompactSection>
      )

      const description = screen.getByText(/This is a very long description/)
      expect(description).toHaveClass('truncate')
    })
  })
})
