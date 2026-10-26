import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import type { GalaxyNode } from '@/lib/types/galaxy'
import { GalaxyObjectBrowser } from './GalaxyObjectBrowser'

const nodes: GalaxyNode[] = [
  { id: 'one', name: 'Axion', region: 'star_rich', tier: 'explored', skeleton: { starClass: 'G', bodies: [] }, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
  { id: 'two', name: 'Borealis', region: 'dead', tier: 'starVisible', skeleton: { starClass: 'M', bodies: [] }, x: 1, y: 0, z: 0, fx: 1, fy: 0, fz: 0 },
]

it('lists disclosed systems without autofocus and filters by name, region and star class', () => {
  const select = vi.fn()
  render(<GalaxyObjectBrowser nodes={nodes} selectedId={null} onSelect={select}>Details</GalaxyObjectBrowser>)
  const search = screen.getByRole('searchbox')
  expect(search).not.toHaveFocus()
  expect(screen.getByRole('button', { name: /Axion/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Borealis/ })).toBeVisible()
  fireEvent.change(search, { target: { value: 'dead zone' } })
  expect(screen.queryByRole('button', { name: /Axion/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Borealis/ })).toBeVisible()
  fireEvent.change(search, { target: { value: 'G' } })
  expect(screen.getByRole('button', { name: /Axion/ })).toBeVisible()
  fireEvent.change(search, { target: { value: 'not disclosed' } })
  expect(screen.getByText('No matching objects.')).toBeVisible()
  expect(select).not.toHaveBeenCalled()
})

it('preserves search and inspected selection through Back and Escape, restoring focus to the result', async () => {
  const inspect = vi.fn()
  function Browser() {
    const [id, setId] = useState<string | null>(null)
    return <GalaxyObjectBrowser nodes={nodes} selectedId={id} onSelect={next => { inspect(next); setId(next) }}>Selected {id}</GalaxyObjectBrowser>
  }
  render(<Browser />)
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'Axion' } })
  fireEvent.click(screen.getByRole('button', { name: /Axion/ }))
  expect(search).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Back to galaxy systems' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Back to galaxy systems' }))
  expect(search).toHaveValue('Axion')
  await waitFor(() => expect(screen.getByRole('button', { name: /Axion/ })).toHaveFocus())
  expect(inspect).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /Axion/ }))
  const back = screen.getByRole('button', { name: 'Back to galaxy systems' })
  fireEvent.keyDown(back, { key: 'Escape' })
  expect(search).toBeVisible()
  expect(search).toHaveValue('Axion')
  expect(inspect).toHaveBeenLastCalledWith('one')
})
