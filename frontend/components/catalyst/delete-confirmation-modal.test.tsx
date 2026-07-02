import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DeleteConfirmationModal, useDeleteConfirmation } from './delete-confirmation-modal'
import { renderHook, act } from '@testing-library/react'

describe('DeleteConfirmationModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  }

  it('renders when open', () => {
    render(<DeleteConfirmationModal {...defaultProps} />)

    expect(screen.getByText('Delete item?')).toBeInTheDocument()
  })

  it('displays custom title', () => {
    render(<DeleteConfirmationModal {...defaultProps} title="Remove Configuration?" />)

    expect(screen.getByText('Remove Configuration?')).toBeInTheDocument()
  })

  it('displays item name in description', () => {
    render(<DeleteConfirmationModal {...defaultProps} itemName="My Config" />)

    expect(screen.getByText(/Are you sure you want to delete "My Config"/)).toBeInTheDocument()
  })

  it('displays custom description', () => {
    render(
      <DeleteConfirmationModal
        {...defaultProps}
        description="This will permanently remove all associated data."
      />
    )

    expect(
      screen.getByText('This will permanently remove all associated data.')
    ).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<DeleteConfirmationModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onConfirm when Delete is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<DeleteConfirmationModal {...defaultProps} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled()
    })
  })

  it('displays custom button labels', () => {
    render(
      <DeleteConfirmationModal
        {...defaultProps}
        confirmText="Remove"
        cancelText="Keep"
      />
    )

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()
  })

  it('disables buttons when isDeleting is true', () => {
    render(<DeleteConfirmationModal {...defaultProps} isDeleting />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Deleting/i })).toBeDisabled()
  })

  it('shows loading state when isDeleting', () => {
    render(<DeleteConfirmationModal {...defaultProps} isDeleting />)

    expect(screen.getByText('Deleting...')).toBeInTheDocument()
  })

  it('uses itemType in default title', () => {
    render(<DeleteConfirmationModal {...defaultProps} itemType="configuration" />)

    expect(screen.getByText('Delete configuration?')).toBeInTheDocument()
  })
})

describe('useDeleteConfirmation', () => {
  interface TestItem {
    id: string
    name: string
  }

  it('initializes with closed state', () => {
    const { result } = renderHook(() =>
      useDeleteConfirmation<TestItem>({
        onDelete: vi.fn(),
      })
    )

    expect(result.current.isOpen).toBe(false)
    expect(result.current.itemToDelete).toBeNull()
    expect(result.current.isDeleting).toBe(false)
  })

  it('opens modal when confirmDelete is called', () => {
    const { result } = renderHook(() =>
      useDeleteConfirmation<TestItem>({
        onDelete: vi.fn(),
      })
    )

    act(() => {
      result.current.confirmDelete({ id: '1', name: 'Test Item' })
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.itemToDelete).toEqual({ id: '1', name: 'Test Item' })
  })

  it('closes modal when cancelDelete is called', () => {
    const { result } = renderHook(() =>
      useDeleteConfirmation<TestItem>({
        onDelete: vi.fn(),
      })
    )

    act(() => {
      result.current.confirmDelete({ id: '1', name: 'Test Item' })
    })

    act(() => {
      result.current.cancelDelete()
    })

    expect(result.current.isOpen).toBe(false)
    expect(result.current.itemToDelete).toBeNull()
  })

  it('calls onDelete and closes when executeDelete is called', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useDeleteConfirmation<TestItem>({
        onDelete,
      })
    )

    act(() => {
      result.current.confirmDelete({ id: '1', name: 'Test Item' })
    })

    await act(async () => {
      await result.current.executeDelete()
    })

    expect(onDelete).toHaveBeenCalledWith({ id: '1', name: 'Test Item' })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.itemToDelete).toBeNull()
  })

  it('provides correct modalProps', () => {
    const { result } = renderHook(() =>
      useDeleteConfirmation<TestItem>({
        onDelete: vi.fn(),
        getItemName: (item) => item.name,
        itemType: 'configuration',
      })
    )

    act(() => {
      result.current.confirmDelete({ id: '1', name: 'My Config' })
    })

    expect(result.current.modalProps.open).toBe(true)
    expect(result.current.modalProps.itemName).toBe('My Config')
    expect(result.current.modalProps.itemType).toBe('configuration')
    expect(result.current.modalProps.isDeleting).toBe(false)
  })
})
