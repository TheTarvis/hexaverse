import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SystemIndex } from './SystemIndex'

it('filters objects, handles empty search, and separates selection from focusing', () => {
  const onSelect = vi.fn()
  const onFocus = vi.fn()
  const onOpen = vi.fn()
  render(<SystemIndex objects={[{ name: 'Nereid', kind: 'Ice giant', group: 'Worlds', x: 67, y: 65 }, { name: 'Inner Belt', kind: 'Asteroid belt', group: 'Resource sites', x: 61, y: 53 }]} selected="Nereid" open onOpen={onOpen} onSelect={onSelect} onFocus={onFocus} offscreen={false} onOffscreen={vi.fn()} />)
  fireEvent.change(screen.getByTestId('system-index-search'), { target: { value: 'belt' } })
  expect(screen.queryByTestId('index-Nereid')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('index-Inner Belt'))
  expect(onSelect).toHaveBeenCalledWith('Inner Belt')
  expect(onFocus).not.toHaveBeenCalled()
  fireEvent.change(screen.getByTestId('system-index-search'), { target: { value: 'missing' } })
  expect(screen.getByRole('status')).toHaveTextContent('No known objects match')
  fireEvent.keyDown(screen.getByTestId('system-index-search'), { key: 'Escape' })
  fireEvent.keyDown(screen.getByTestId('system-index-search'), { key: 'Escape' })
  expect(onOpen).toHaveBeenCalledWith(false)
  expect(screen.getByTestId('system-index-toggle')).toHaveFocus()
})


it('expands a connected panel and preserves search and focus when returning', async () => {
  const onSelect = vi.fn()
  const onFocus = vi.fn()
  const onPlot = vi.fn()
  render(<SystemIndex objects={[{ name: 'Nereid', kind: 'Ice giant', group: 'Worlds', x: 67, y: 65 }]} selected="Nereid" open onOpen={vi.fn()} onSelect={onSelect} onFocus={onFocus} offscreen={false} onOffscreen={vi.fn()} canPlot onPlot={onPlot} />)
  fireEvent.change(screen.getByTestId('system-index-search'), { target: { value: 'ice' } })
  fireEvent.click(screen.getByTestId('index-Nereid'))
  expect(screen.getByTestId('details-back')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: 'Details for Nereid' })).toHaveTextContent('Not surveyed')
  expect(screen.getByTestId('index-Nereid')).toHaveAttribute('aria-expanded', 'true')
  expect(onFocus).not.toHaveBeenCalled()
  expect(onPlot).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('index-focus'))
  expect(onFocus).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByTestId('details-plot'))
  expect(onPlot).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByTestId('details-back'))
  expect(screen.getByTestId('system-index-search')).toHaveValue('ice')
  await waitFor(() => expect(screen.getByTestId('index-Nereid')).toHaveFocus())
  expect(screen.queryByTestId('details-plot')).not.toBeInTheDocument()
})
