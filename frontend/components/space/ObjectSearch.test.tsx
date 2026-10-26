import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ObjectSearch, emptyObjectSearch, type ObjectSearchEntry, type ObjectSearchProps } from './ObjectSearch'

const items: ObjectSearchEntry[] = [
  { id: 'fleet', name: 'Peregrine', kind: 'fleet', category: 'owned', subtitle: 'Owned fleet' },
  { id: 'burn', name: 'Unanalyzed burn', kind: 'burn', category: 'unknown', subtitle: 'Near Nereid', lastObserved: '8 minutes ago' },
  { id: 'station', name: 'Solace Station', kind: 'station', owned: true, subtitle: 'Trading venue' },
  { id: 'belt', name: 'Amber belt', kind: 'belt', resourceSite: true, resources: ['metals'], subtitle: 'Metals' },
  { id: 'unread', name: 'Farpoint belt', kind: 'belt', resourceSite: true, subtitle: 'Contents unknown' },
]
afterEach(cleanup)
function Example({ entries = items, onSelect = () => {}, ...props }: { entries?: ObjectSearchEntry[] } & Partial<Pick<ObjectSearchProps, 'status' | 'onRetry' | 'onSelect'>>) {
  const [value, onChange] = useState(emptyObjectSearch)
  return <ObjectSearch items={entries} value={value} onChange={onChange} onSelect={onSelect} {...props} />
}
const filter = (name: string) => fireEvent.click(within(screen.getByRole('group', { name: 'Object type' })).getByRole('button', { name }))
const preset = (name: string) => fireEvent.click(within(screen.getByRole('group', { name: 'Secondary presets' })).getByRole('button', { name }))
it('combines presets and disclosed text search, remembering secondary presets when changing type', () => {
  render(<Example />)
  filter('Fleets')
  preset('Unknown')
  fireEvent.change(screen.getByLabelText('Find an object'), { target: { value: '  NEREID  ' } })
  expect(screen.getByRole('button', { name: /Unanalyzed burn/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Peregrine/ })).toBeNull()
  filter('Structures')
  expect(screen.getByLabelText('Find an object')).toHaveValue('  NEREID  ')
  filter('Fleets')
  expect(screen.getByRole('button', { name: 'Unknown' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /Unanalyzed burn/ }).querySelector('img')).toBeNull()
})
it('clearing filters cannot escape the caller candidate set and selection only returns its id', () => {
  const onSelect = vi.fn()
  render(<Example entries={[items[2]]} onSelect={onSelect} />)
  fireEvent.change(screen.getByLabelText('Find an object'), { target: { value: 'absent' } })
  expect(screen.getByText('No matching objects.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  fireEvent.click(screen.getByRole('button', { name: /Solace Station/ }))
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('station')
  expect(screen.queryByRole('button', { name: /Peregrine/ })).toBeNull()
})
it('filters disclosed deposits while keeping unknown deposits under All, with alphabetical results', () => {
  render(<Example />)
  filter('Resources')
  expect(within(screen.getByRole('region', { name: 'Search results' })).getAllByRole('button').map(row => row.dataset.objectId)).toEqual(['belt', 'unread'])
  preset('Metals')
  expect(screen.queryByRole('button', { name: /Farpoint/ })).toBeNull()
  preset('All')
  expect(screen.getByRole('button', { name: /Farpoint/ })).toBeVisible()
})
it('does not report an empty result set or allow stale selection during failed/loading reads', () => {
  const retry = vi.fn()
  const { rerender } = render(<Example status="error" onRetry={retry} />)
  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.queryByText('No matching objects.')).toBeNull()
  expect(screen.queryByRole('button', { name: /Peregrine/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalledOnce()
  rerender(<Example status="loading" />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading objects')
  expect(screen.getByRole('region', { name: 'Search results' })).toHaveAttribute('aria-busy', 'true')
})
it('saves and restores the result viewport scroll offset when re-entering a search', () => {
  const onChange = vi.fn()
  const props = { items, value: { ...emptyObjectSearch, scrollTop: 150 }, onChange, onSelect: vi.fn() }
  const { unmount } = render(<ObjectSearch {...props} />)
  const results = screen.getByRole('region', { name: 'Search results' })
  expect(results.scrollTop).toBe(150)
  fireEvent.scroll(results, { target: { scrollTop: 200 } })
  expect(onChange).toHaveBeenLastCalledWith({ ...props.value, scrollTop: 200 })
  unmount()
  render(<ObjectSearch {...props} value={{ ...props.value, scrollTop: 200 }} />)
  expect(screen.getByRole('region', { name: 'Search results' }).scrollTop).toBe(200)
})

it('lets a resource-bearing moon appear under both its physical type and resource role', () => {
  render(<Example entries={[
    { id: 'moon', name: 'Ione', kind: 'moon', resources: ['water'], subtitle: 'Moon · Water' },
    { id: 'planet', name: 'Caldera', kind: 'rocky', resources: ['metals'], subtitle: 'Planet · Metals' },
    { id: 'asteroid', name: 'Amber rock', kind: 'asteroid', resources: ['metals'], subtitle: 'Asteroid · Metals' },
    { id: 'belt', name: 'Outer belt', kind: 'belt', resourceSite: true, subtitle: 'Belt · Contents unknown' },
    { id: 'dry', name: 'Dry moon', kind: 'moon', resources: [], subtitle: 'Moon · No deposits' },
    { id: 'station', name: 'Aster Station', kind: 'station', subtitle: 'Trading venue' },
  ]} />)
  filter('Bodies')
  preset('Moons')
  expect(screen.getByRole('button', { name: /Ione/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Dry moon/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Caldera/ })).toBeNull()
  filter('Resources')
  preset('Water')
  expect(screen.getByRole('button', { name: /Ione/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Dry moon/ })).toBeNull()
  filter('Bodies')
  expect(screen.getByRole('button', { name: 'Moons' })).toHaveAttribute('aria-pressed', 'true')
  preset('Planets')
  expect(screen.getByRole('button', { name: /Caldera/ })).toBeVisible()
  preset('Asteroids')
  expect(screen.getByRole('button', { name: /Amber rock/ })).toBeVisible()
  preset('Belts')
  expect(screen.getByRole('button', { name: /Outer belt/ })).toBeVisible()
  filter('Resources')
  preset('All')
  expect(screen.getByRole('button', { name: /Outer belt/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Aster Station/ })).toBeNull()
  filter('All')
  expect(screen.getAllByRole('button', { name: /Ione/ })).toHaveLength(1)
})

it('groups stations and gates under Structures, preserving type and owned-station presets', () => {
  render(<Example entries={[
    ...items,
    { id: 'foreign-station', name: 'Aster Anchorage', kind: 'station', subtitle: 'Station' },
    { id: 'gate', name: 'Borealis gate', kind: 'gate', owned: true, subtitle: 'Lane gate' },
  ]} />)
  filter('Structures')
  const rows = () => within(screen.getByRole('region', { name: 'Search results' })).getAllByRole('button').map(row => row.dataset.objectId)
  expect(rows()).toEqual(['foreign-station', 'gate', 'station'])
  preset('Stations')
  expect(rows()).toEqual(['foreign-station', 'station'])
  preset('Owned stations')
  expect(rows()).toEqual(['station'])
  preset('Gates')
  expect(rows()).toEqual(['gate'])
  filter('Fleets')
  filter('Structures')
  expect(screen.getByRole('button', { name: 'Gates' })).toHaveAttribute('aria-pressed', 'true')
  preset('All')
  expect(rows()).toEqual(['foreign-station', 'gate', 'station'])
  expect(within(screen.getByRole('group', { name: 'Object type' })).queryByRole('button', { name: 'Stations' })).toBeNull()
})


it('omits secondary presets for action selection and ignores retained hidden preset state', () => {
  const select = vi.fn()
  const props = { items, onChange: vi.fn(), onSelect: select, showPresets: false }
  const { rerender } = render(<ObjectSearch {...props} value={{ ...emptyObjectSearch, type: 'fleets', presets: { fleets: 'enemy' } }} />)
  expect(screen.queryByRole('group', { name: 'Secondary presets' })).toBeNull()
  expect(screen.getByRole('button', { name: /Peregrine/ })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Peregrine/ }))
  expect(select).toHaveBeenCalledWith('fleet')
  rerender(<ObjectSearch {...props} items={[items[3], items[4]]} value={{ ...emptyObjectSearch, type: 'resource-sites', presets: { 'resource-sites': 'water' } }} />)
  expect(screen.queryByRole('group', { name: 'Secondary presets' })).toBeNull()
  expect(screen.getByRole('button', { name: /Amber belt/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Farpoint belt/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Peregrine/ })).toBeNull()
})
