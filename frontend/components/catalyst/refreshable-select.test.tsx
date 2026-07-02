import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RefreshableSelect } from './refreshable-select'

describe('RefreshableSelect', () => {
  const mockOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ]

  it('renders select with options', () => {
    const onChange = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        placeholder="Select an option..."
        testId="test"
      />
    )

    const select = screen.getByTestId('test-select')
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('')

    // Check all options are present
    expect(screen.getByText('Select an option...')).toBeInTheDocument()
    expect(screen.getByText('Option 1')).toBeInTheDocument()
    expect(screen.getByText('Option 2')).toBeInTheDocument()
    expect(screen.getByText('Option 3')).toBeInTheDocument()
  })

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        testId="test"
      />
    )

    const select = screen.getByTestId('test-select')
    fireEvent.change(select, { target: { value: 'option1' } })

    expect(onChange).toHaveBeenCalled()
  })

  it('renders refresh button when onRefresh is provided', () => {
    const onChange = vi.fn()
    const onRefresh = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        onRefresh={onRefresh}
        testId="test"
      />
    )

    const refreshButton = screen.getByTestId('test-refresh-button')
    expect(refreshButton).toBeInTheDocument()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    const onChange = vi.fn()
    const onRefresh = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        onRefresh={onRefresh}
        testId="test"
      />
    )

    const refreshButton = screen.getByTestId('test-refresh-button')
    fireEvent.click(refreshButton)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not render refresh button when onRefresh is not provided', () => {
    const onChange = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        testId="test"
      />
    )

    expect(screen.queryByTestId('test-refresh-button')).not.toBeInTheDocument()
  })

  it('shows loading state correctly', () => {
    const onChange = vi.fn()
    const onRefresh = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        isLoading={true}
        onRefresh={onRefresh}
        testId="test"
      />
    )

    const select = screen.getByTestId('test-select')
    expect(select).toBeDisabled()
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    const refreshButton = screen.getByTestId('test-refresh-button')
    expect(refreshButton).toBeDisabled()
  })

  it('shows error state correctly', () => {
    const onChange = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        hasError={true}
        testId="test"
      />
    )

    const select = screen.getByTestId('test-select')
    expect(select).toBeDisabled()
    expect(screen.getByText('Error loading data')).toBeInTheDocument()
  })

  it('handles disabled state', () => {
    const onChange = vi.fn()
    const onRefresh = vi.fn()

    render(
      <RefreshableSelect
        value=""
        onChange={onChange}
        options={mockOptions}
        disabled={true}
        onRefresh={onRefresh}
        testId="test"
      />
    )

    const select = screen.getByTestId('test-select')
    const refreshButton = screen.getByTestId('test-refresh-button')

    expect(select).toBeDisabled()
    expect(refreshButton).toBeDisabled()
  })

  it('renders with selected value', () => {
    const onChange = vi.fn()

    render(
      <RefreshableSelect
        value="option2"
        onChange={onChange}
        options={mockOptions}
        testId="test"
      />
    )

    const select = screen.getByTestId('test-select') as HTMLSelectElement
    expect(select.value).toBe('option2')
  })
})
