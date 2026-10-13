import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SystemObjectIndex, type IndexedObject } from './SystemObjectIndex'

vi.mock('./SpacecraftPreview', () => ({ SpacecraftPreview: ({ kind, objectId }: { kind: string; objectId: string }) => <div data-testid="test-preview" data-kind={kind} data-object={objectId} /> }))
const station: IndexedObject = { name: 'shared-id', kind: 'station', group: 'Stations', x: 0, y: 0 }
const ship = { name: 'shared-id', kind: 'fleet', group: 'Fleets', x: 0, y: 0, fleet: { id: 'shared-id', mode: 1 as const, activity: 'Parked', systemLabel: 'Here', shipCount: 3 } }

it('Scenario: Distinct identity and explicit fleet focus — raw ID collision cannot expose station services or change body selection', () => {
  const select = vi.fn(), focus = vi.fn(), focusFleet = vi.fn()
  function Host() {
    const [selectedFleetId, onSelectFleet] = React.useState<string | null>(null)
    const extra = { selectedFleetId, onSelectFleet, onFocusFleet: focusFleet }
    return <SystemObjectIndex objects={[station, ship]} selected={station.name} open onOpen={vi.fn()} onSelect={select} onFocus={focus} canPlot detailContent={<button>Station-only command</button>} detailContentFor={station.name} {...extra} />
  }
  render(<Host />)
  fireEvent.click(screen.getByTestId('index-shared-id'))
  expect(screen.getByTestId('test-preview')).toHaveAttribute('data-kind', 'station')
  expect(screen.getByText('Station-only command')).toBeVisible()
  select.mockClear()
  fireEvent.click(screen.getByTestId('index-fleet-shared-id'))
  expect(screen.getByTestId('test-preview')).toHaveAttribute('data-kind', 'ship')
  expect(screen.getByText('Station-only command')).not.toBeVisible()
  expect(screen.queryByTestId('details-plot')).toBeNull()
  expect(select).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('index-focus'))
  expect(focusFleet).toHaveBeenCalledWith('shared-id'); expect(focus).not.toHaveBeenCalled()
  const detail = screen.getByRole('heading', { name: 'shared-id' }).closest('aside')!
  expect(within(detail).getByText('Parked')).toBeVisible()
  expect(within(detail).getByText('Here')).toBeVisible()
  expect(within(detail).getByText('3')).toBeVisible()
})

describe('metadata eligibility', () => {
  it('Scenario: Inspect fleet without changing acting or target — a fleet-looking label alone is not a model source', () => {
    const fake = { ...station, name: 'fake', kind: 'fleet', group: 'Fleets' }
    render(<SystemObjectIndex objects={[fake]} selected="fake" open onOpen={vi.fn()} onSelect={vi.fn()} onFocus={vi.fn()} />)
    fireEvent.click(screen.getByTestId('index-fake'))
    expect(screen.queryByTestId('test-preview')).toBeNull()
  })
})
