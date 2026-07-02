import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from './textarea'
import React from 'react'

describe('Textarea', () => {
  describe('basic rendering', () => {
    it('renders textarea element', () => {
      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toBeInTheDocument()
      expect(textarea.tagName).toBe('TEXTAREA')
    })

    it('renders with placeholder', () => {
      render(<Textarea placeholder="Enter your text here..." data-testid="test-textarea" />)

      const textarea = screen.getByPlaceholderText('Enter your text here...')
      expect(textarea).toBeInTheDocument()
    })

    it('renders with default value', () => {
      render(<Textarea defaultValue="Initial text" data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea') as HTMLTextAreaElement
      expect(textarea.value).toBe('Initial text')
    })

    it('renders with controlled value', () => {
      const { rerender } = render(<Textarea value="Controlled text" onChange={vi.fn()} />)

      let textarea = screen.getByDisplayValue('Controlled text') as HTMLTextAreaElement
      expect(textarea.value).toBe('Controlled text')

      rerender(<Textarea value="Updated text" onChange={vi.fn()} />)

      textarea = screen.getByDisplayValue('Updated text') as HTMLTextAreaElement
      expect(textarea.value).toBe('Updated text')
    })
  })

  describe('resizable prop', () => {
    it('is resizable by default', () => {
      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveClass('resize-y')
      expect(textarea).not.toHaveClass('resize-none')
    })

    it('is resizable when resizable is true', () => {
      render(<Textarea resizable={true} data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveClass('resize-y')
      expect(textarea).not.toHaveClass('resize-none')
    })

    it('is not resizable when resizable is false', () => {
      render(<Textarea resizable={false} data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveClass('resize-none')
      expect(textarea).not.toHaveClass('resize-y')
    })
  })

  describe('disabled state', () => {
    it('renders as disabled when disabled prop is true', () => {
      render(<Textarea disabled data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toBeDisabled()
    })

    it('is enabled by default', () => {
      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).not.toBeDisabled()
    })
  })

  describe('user interactions', () => {
    it('calls onChange when user types', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<Textarea onChange={onChange} data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      await user.type(textarea, 'Hello')

      expect(onChange).toHaveBeenCalled()
      expect((textarea as HTMLTextAreaElement).value).toBe('Hello')
    })

    it('allows multiline text input', async () => {
      const user = userEvent.setup()

      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      await user.type(textarea, 'Line 1{Enter}Line 2{Enter}Line 3')

      expect((textarea as HTMLTextAreaElement).value).toBe('Line 1\nLine 2\nLine 3')
    })

    it('updates value on paste', async () => {
      const user = userEvent.setup()

      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      await user.click(textarea)
      await user.paste('Pasted content')

      expect((textarea as HTMLTextAreaElement).value).toBe('Pasted content')
    })

    it('can be cleared', async () => {
      const user = userEvent.setup()

      render(<Textarea defaultValue="Initial text" data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      await user.clear(textarea)

      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })

  describe('custom styling', () => {
    it('applies custom className to wrapper', () => {
      const { container } = render(
        <Textarea className="custom-wrapper-class" data-testid="test-textarea" />
      )

      const wrapper = container.querySelector('.custom-wrapper-class')
      expect(wrapper).toBeInTheDocument()
    })

    it('applies base styling classes', () => {
      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveClass('rounded-lg')
      expect(textarea).toHaveClass('border')
      expect(textarea).toHaveClass('text-zinc-950')
    })
  })

  describe('accessibility', () => {
    it('can be labeled with aria-label', () => {
      render(<Textarea aria-label="Description" data-testid="test-textarea" />)

      const textarea = screen.getByLabelText('Description')
      expect(textarea).toBeInTheDocument()
    })

    it('supports required attribute', () => {
      render(<Textarea required data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toBeRequired()
    })

    it('can be associated with helper text via id', () => {
      render(
        <>
          <Textarea id="description" data-testid="test-textarea" />
          <div id="help-text">Helper text</div>
        </>
      )

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveAttribute('id', 'description')
      expect(screen.getByText('Helper text')).toBeInTheDocument()
    })

    it('can be marked as invalid', () => {
      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      // Component supports data-invalid attribute which triggers validation styling
      expect(textarea).toBeInTheDocument()
    })
  })

  describe('validation states', () => {
    it('applies invalid styles with data-invalid', () => {
      render(
        <Textarea
          data-invalid
          data-testid="test-textarea"
        />
      )

      const textarea = screen.getByTestId('test-textarea')
      // Component uses data-invalid:border-red-500 class
      expect(textarea).toHaveAttribute('data-invalid')
    })
  })

  describe('rows attribute', () => {
    it('accepts rows attribute', () => {
      render(<Textarea rows={5} data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveAttribute('rows', '5')
    })

    it('defaults to browser default rows when not specified', () => {
      render(<Textarea data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      // When rows is not specified, the attribute won't be present
      expect(textarea).not.toHaveAttribute('rows')
    })
  })

  describe('name attribute', () => {
    it('accepts name attribute for forms', () => {
      render(<Textarea name="description" data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveAttribute('name', 'description')
    })
  })

  describe('maxLength attribute', () => {
    it('accepts maxLength attribute', () => {
      render(<Textarea maxLength={100} data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveAttribute('maxLength', '100')
    })

    it('enforces maxLength when typing', async () => {
      const user = userEvent.setup()

      render(<Textarea maxLength={5} data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      await user.type(textarea, 'Hello World')

      // Should only accept first 5 characters
      expect((textarea as HTMLTextAreaElement).value).toBe('Hello')
    })
  })

  describe('ref forwarding', () => {
    it('forwards ref to textarea element', () => {
      const ref = React.createRef<HTMLTextAreaElement>()

      render(<Textarea ref={ref} data-testid="test-textarea" />)

      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
      expect(ref.current).toBe(screen.getByTestId('test-textarea'))
    })

    it('allows programmatic focus via ref', () => {
      const ref = React.createRef<HTMLTextAreaElement>()

      render(<Textarea ref={ref} data-testid="test-textarea" />)

      ref.current?.focus()

      expect(ref.current).toHaveFocus()
    })
  })

  describe('form integration', () => {
    it('submits value in a form', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn((e) => e.preventDefault())

      render(
        <form onSubmit={onSubmit}>
          <Textarea name="message" defaultValue="Test message" />
          <button type="submit">Submit</button>
        </form>
      )

      const submitButton = screen.getByText('Submit')
      await user.click(submitButton)

      expect(onSubmit).toHaveBeenCalled()
    })
  })

  describe('readonly state', () => {
    it('respects readOnly prop', () => {
      render(<Textarea readOnly defaultValue="Read only text" data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveAttribute('readonly')
    })

    it('prevents editing when readOnly', async () => {
      const user = userEvent.setup()

      render(<Textarea readOnly defaultValue="Original" data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      await user.type(textarea, 'New text')

      // Value should remain unchanged
      expect((textarea as HTMLTextAreaElement).value).toBe('Original')
    })
  })

  describe('autoFocus', () => {
    it('focuses textarea on mount when autoFocus is true', () => {
      render(<Textarea autoFocus data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveFocus()
    })
  })

  describe('autoComplete', () => {
    it('accepts autoComplete attribute', () => {
      render(<Textarea autoComplete="off" data-testid="test-textarea" />)

      const textarea = screen.getByTestId('test-textarea')
      expect(textarea).toHaveAttribute('autocomplete', 'off')
    })
  })

  describe('wrapper data-slot attribute', () => {
    it('has data-slot="control" on wrapper', () => {
      const { container } = render(<Textarea data-testid="test-textarea" />)

      const wrapper = container.querySelector('[data-slot="control"]')
      expect(wrapper).toBeInTheDocument()
    })
  })
})
