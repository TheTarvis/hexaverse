import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { HudObjectThumbnail, resolveHudObjectKind } from './HudObjectThumbnail'

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


it.each(['gate', 'anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation'])(
  'loads the disclosed %s category without mounting a renderer', async kind => {
    const { container } = render(<HudObjectThumbnail kind={kind} alt={`${kind} category`} />)
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(`${kind}.png`))
    expect(container.querySelector('canvas')).toBeNull()
    fireEvent.load(container.querySelector('img')!)
    await waitFor(() => expect(screen.getByRole('img', { name: `${kind} category` })).toBeInTheDocument())
  },
)

it.each([
  ['asteroid', 'resource-site'], ['belt', 'resource-site'], ['Asteroid belt', 'resource-site'],
  ['gas giant', 'gas_giant'], ['gravity well', 'gravity_well'], ['Lane gate', 'gate'],
  ['ice', 'ice'], ['resource-site', 'resource-site'],
])('resolves disclosed caller category %s to %s', (input, expected) => {
  expect(resolveHudObjectKind(input)).toBe(expected)
})

it.each(['unknown', 'resource host', 'contact', 'toString', '__proto__', 'constructor'])('fails safely for unsupported category %s', kind => {
  const { container } = render(<HudObjectThumbnail kind={kind} alt="Known object" />)
  expect(resolveHudObjectKind(kind)).toBeNull()
  expect(screen.getByRole('img', { name: 'Known object — no category image' })).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByTitle('Image unavailable')).toBeNull()
})

it('keeps undisclosed analysis state authoritative even if a caller passes a kind at runtime', () => {
  // Runtime data can bypass the TypeScript union; no known art may be requested.
  const props = { analyzed: false as const, kind: 'fleet' }
  const { container } = render(<HudObjectThumbnail {...props as { analyzed: false }} alt="Unresolved contact" />)
  expect(screen.getByRole('img', { name: 'Unresolved contact' })).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByTitle('No category image')).toBeNull()
})
