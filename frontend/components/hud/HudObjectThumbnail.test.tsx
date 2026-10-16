import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { HudObjectThumbnail } from './HudObjectThumbnail'

it('keeps known identity when a thumbnail fails, with a distinct unavailable image', () => {
  const { container } = render(
    <>
      <h3>Aurelia Station</h3>
      <p>Station · Orbital</p>
      <HudObjectThumbnail kind="station" alt="Station thumbnail" />
    </>,
  )
  expect(screen.getByRole('img', { name: 'Station thumbnail — loading image' })).toBeInTheDocument()
  fireEvent.error(container.querySelector('img')!)
  expect(screen.getByRole('img', { name: 'Station thumbnail — image unavailable' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Aurelia Station' })).toBeInTheDocument()
  expect(screen.getByText('Station · Orbital')).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
})

it('tries the replacement object image after an earlier object image failed', async () => {
  const { container, rerender } = render(<HudObjectThumbnail kind="station" alt="Object image" />)
  fireEvent.error(container.querySelector('img')!)
  expect(screen.getByRole('img', { name: 'Object image — image unavailable' })).toBeInTheDocument()
  rerender(<HudObjectThumbnail kind="fleet" alt="Object image" />)
  expect(screen.getByRole('img', { name: 'Object image — loading image' })).toBeInTheDocument()
  fireEvent.load(container.querySelector('img')!)
  await waitFor(() => expect(screen.getByRole('img', { name: 'Object image' })).toBeInTheDocument())
})

it('renders an unanalyzed presence without loading a known object image', () => {
  const { container } = render(<HudObjectThumbnail analyzed={false} alt="Unanalyzed object" />)
  expect(screen.getByRole('img', { name: 'Unanalyzed object' })).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByTitle('Image unavailable')).not.toBeInTheDocument()
})
