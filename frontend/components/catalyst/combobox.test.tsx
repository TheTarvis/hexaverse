import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Combobox, ComboboxOption, ComboboxLabel, ComboboxDescription } from './combobox'

// Test data
interface TestOption {
  id: string
  name: string
  email?: string
}

const testOptions: TestOption[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
  { id: '3', name: 'Charlie', email: 'charlie@example.com' },
]

const renderCombobox = (props: Partial<React.ComponentProps<typeof Combobox<TestOption>>> = {}) => {
  const defaultProps = {
    options: testOptions,
    value: undefined as TestOption | undefined,
    onChange: vi.fn(),
    displayValue: (option: TestOption | null) => option?.name ?? '',
    children: (option: TestOption) => (
      <ComboboxOption key={option.id} value={option}>
        <ComboboxLabel>{option.name}</ComboboxLabel>
        {option.email && <ComboboxDescription>{option.email}</ComboboxDescription>}
      </ComboboxOption>
    ),
    ...props,
  }

  return render(<Combobox {...defaultProps} />)
}

describe('Combobox', () => {
  describe('basic rendering', () => {
    it('renders with placeholder', () => {
      renderCombobox({ placeholder: 'Select a person...' })

      expect(screen.getByPlaceholderText('Select a person...')).toBeInTheDocument()
    })

    it('renders with aria-label', () => {
      renderCombobox({ 'aria-label': 'Person selector' })

      expect(screen.getByLabelText('Person selector')).toBeInTheDocument()
    })

    it('displays selected value', () => {
      renderCombobox({ value: testOptions[0] })

      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument()
    })
  })

  describe('dropdown interaction', () => {
    it('shows options when input is focused and typed into', async () => {
      const user = userEvent.setup()
      renderCombobox()

      const input = screen.getByRole('combobox')
      await user.click(input)
      await user.type(input, 'a')

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument()
      })
    })

    it('opens dropdown on focus when openOnFocus is true', async () => {
      const user = userEvent.setup()
      renderCombobox({ openOnFocus: true })

      const input = screen.getByRole('combobox')
      await user.click(input)

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument()
        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Charlie')).toBeInTheDocument()
      })
    })
  })

  describe('filtering', () => {
    it('filters options based on input', async () => {
      const user = userEvent.setup()
      renderCombobox()

      const input = screen.getByRole('combobox')
      await user.type(input, 'Ali')

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument()
        expect(screen.queryByText('Bob')).not.toBeInTheDocument()
        expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
      })
    })

    it('uses custom filter function when provided', async () => {
      const user = userEvent.setup()
      const customFilter = (option: TestOption, query: string) => {
        return option.email?.includes(query) ?? false
      }

      renderCombobox({ filter: customFilter })

      const input = screen.getByRole('combobox')
      await user.type(input, 'bob@')

      await waitFor(() => {
        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.queryByText('Alice')).not.toBeInTheDocument()
      })
    })

    it('shows all options when query is empty', async () => {
      const user = userEvent.setup()
      renderCombobox({ openOnFocus: true })

      const input = screen.getByRole('combobox')
      await user.click(input)

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument()
        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Charlie')).toBeInTheDocument()
      })
    })
  })

  describe('selection', () => {
    it('calls onChange when option is selected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderCombobox({ onChange, openOnFocus: true })

      const input = screen.getByRole('combobox')
      await user.click(input)

      await waitFor(() => {
        expect(screen.getByText('Bob')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Bob'))

      expect(onChange).toHaveBeenCalledWith(testOptions[1])
    })
  })

  describe('custom value creation', () => {
    it('shows create option when onCustomValueSelect is provided and query does not match', async () => {
      const user = userEvent.setup()
      const onCustomValueSelect = vi.fn()
      renderCombobox({
        onCustomValueSelect,
        createLabel: (query) => `Add "${query}"`,
      })

      const input = screen.getByRole('combobox')
      await user.type(input, 'newperson@example.com')

      await waitFor(() => {
        expect(screen.getByTestId('combobox-create-option')).toBeInTheDocument()
        expect(screen.getByText('Add "newperson@example.com"')).toBeInTheDocument()
      })
    })

    it('does not show create option when query matches existing option', async () => {
      const user = userEvent.setup()
      const onCustomValueSelect = vi.fn()
      renderCombobox({
        onCustomValueSelect,
        createLabel: (query) => `Add "${query}"`,
      })

      const input = screen.getByRole('combobox')
      await user.type(input, 'Alice')

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('combobox-create-option')).not.toBeInTheDocument()
    })

    it('calls onCustomValueSelect when create option is clicked', async () => {
      const user = userEvent.setup()
      const onCustomValueSelect = vi.fn()
      renderCombobox({
        onCustomValueSelect,
        createLabel: (query) => `Add "${query}"`,
      })

      const input = screen.getByRole('combobox')
      await user.type(input, 'newemail@test.com')

      await waitFor(() => {
        expect(screen.getByTestId('combobox-create-option')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('combobox-create-option'))

      expect(onCustomValueSelect).toHaveBeenCalledWith('newemail@test.com')
    })

    it('calls onCustomValueSelect on Enter key when query does not match', async () => {
      const user = userEvent.setup()
      const onCustomValueSelect = vi.fn()
      renderCombobox({
        onCustomValueSelect,
        createLabel: (query) => `Add "${query}"`,
      })

      const input = screen.getByRole('combobox')
      await user.type(input, 'custom@email.com')

      await waitFor(() => {
        expect(screen.getByTestId('combobox-create-option')).toBeInTheDocument()
      })

      await user.keyboard('{Enter}')

      expect(onCustomValueSelect).toHaveBeenCalledWith('custom@email.com')
    })

    it('uses default createLabel when not provided', async () => {
      const user = userEvent.setup()
      const onCustomValueSelect = vi.fn()
      renderCombobox({ onCustomValueSelect })

      const input = screen.getByRole('combobox')
      await user.type(input, 'custom value')

      await waitFor(() => {
        expect(screen.getByText('Use "custom value"')).toBeInTheDocument()
      })
    })
  })

  describe('disabled state', () => {
    it('respects disabled prop', () => {
      renderCombobox({ disabled: true })

      const input = screen.getByRole('combobox')
      expect(input).toBeDisabled()
    })
  })
})

describe('ComboboxOption', () => {
  it('renders children correctly', async () => {
    const user = userEvent.setup()
    renderCombobox({ openOnFocus: true })

    const input = screen.getByRole('combobox')
    await user.click(input)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    })
  })
})

describe('ComboboxLabel', () => {
  it('renders label text', () => {
    render(<ComboboxLabel>Test Label</ComboboxLabel>)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<ComboboxLabel className="custom-class">Label</ComboboxLabel>)
    expect(screen.getByText('Label')).toHaveClass('custom-class')
  })
})

describe('ComboboxDescription', () => {
  it('renders description text', () => {
    render(<ComboboxDescription>Test Description</ComboboxDescription>)
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('applies custom className to wrapper element', () => {
    render(<ComboboxDescription className="desc-class" data-testid="desc">Description</ComboboxDescription>)
    // The className is applied to the outer wrapper span, not the inner text span
    expect(screen.getByTestId('desc')).toHaveClass('desc-class')
  })
})
