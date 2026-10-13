import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SystemObjectIndex, type IndexedObject } from './SystemObjectIndex'

const life = vi.hoisted(() => ({ created: [] as string[], disposed: [] as string[] }))
vi.mock('./SpacecraftPreview', () => ({ SpacecraftPreview: ({ objectId, kind, label, starClass }: { objectId: string; kind: string; label: string; starClass?: string }) => {
  React.useEffect(() => { life.created.push(objectId); return () => { life.disposed.push(objectId) } }, [objectId])
  return <div data-testid="test-preview" data-kind={kind} data-class={starClass} data-object={objectId}>3D preview of {label}</div>
} }))
beforeEach(() => { life.created = []; life.disposed = [] })
const station: IndexedObject = { name: 'station-one', kind: 'station', group: 'Stations', x: 0, y: 0, knownFrom: 'System telemetry', resources: 'None' }
const other: IndexedObject = { name: 'planet-one', kind: 'rocky', group: 'Worlds', x: 0, y: 0 }
const props = { objects: [station, other], selected: station.name, open: true, onOpen: vi.fn(), onSelect: vi.fn(), onFocus: vi.fn(), detailContent: <input aria-label="Preserved command" defaultValue="42" />, detailContentFor: station.name }
function openStation() { fireEvent.click(screen.getByTestId('index-station-one')) }

describe('station preview host eligibility', () => {
  it('Scenario: Station detail preview — name before preview, facts after and old portrait removed', () => {
    render(<SystemObjectIndex {...props} />); expect(screen.queryByTestId('test-preview')).toBeNull()
    openStation()
    const preview = screen.getByTestId('test-preview'), heading = screen.getByRole('heading', { name: station.name })
    expect(preview).toHaveAttribute('data-kind', 'station')
    expect(heading.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(preview.compareDocumentPosition(screen.getByText('Known from')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.closest('aside')!.querySelector('[class*="portrait"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Focus station-one/ })).toBeEnabled()
  })
  it('Scenario: Closing or hiding a retained panel — preview unmounts, command state remains', () => {
    const h = render(<SystemObjectIndex {...props} />); openStation()
    expect(screen.getByTestId('test-preview')).toBeInTheDocument()
    const input = screen.getByLabelText('Preserved command'); fireEvent.change(input, { target: { value: '99' } })
    h.rerender(<SystemObjectIndex {...props} open={false} />)
    expect(screen.queryByTestId('test-preview')).toBeNull()
    expect(life.disposed).toEqual([station.name]); expect(input).toHaveValue('99'); expect(input).toBeInTheDocument()
    h.rerender(<SystemObjectIndex {...props} />)
    expect(screen.getByTestId('test-preview')).toBeInTheDocument()
    expect(life.created).toEqual([station.name, station.name])
  })
  it.each(['loading', 'failed', 'withdrawn'] as const)('Scenario: Entity change and late completion — %s releases preview', reason => {
    const h = render(<SystemObjectIndex {...props} />); openStation()
    expect(screen.getByTestId('test-preview')).toBeInTheDocument()
    const changed = reason === 'withdrawn' ? { objects: [other] } : { [reason]: true }
    h.rerender(<SystemObjectIndex {...props} {...changed} />)
    expect(screen.queryByTestId('test-preview')).toBeNull(); expect(life.disposed).toEqual([station.name])
  })
  it.each(['rocky', 'gas giant', 'ice', 'moon'])('renders the shared %s model when changing selection to a world', kind => {
    const h = render(<SystemObjectIndex {...props} />); openStation()
    h.rerender(<SystemObjectIndex {...props} objects={[station, { ...other, kind }]} selected={other.name} />)
    expect(screen.getByTestId('test-preview')).toHaveAttribute('data-kind', kind.replaceAll(' ', '_'))
    expect(screen.getByTestId('test-preview')).toHaveAttribute('data-object', other.name)
    expect(screen.getByRole('heading', { name: other.name }).closest('aside')!.querySelector('[class*="portrait"]')).toBeNull()
    expect(life.disposed).toEqual([station.name])
    h.rerender(<SystemObjectIndex {...props} open={false} />)
    expect(screen.queryByTestId('test-preview')).toBeNull()
  })
  it('Scenario: Ineligible objects retain existing presentation / Reopen and bounded instances', () => {
    const h = render(<SystemObjectIndex {...props} />); openStation()
    expect(screen.getAllByTestId('test-preview')).toHaveLength(1)
    h.rerender(<SystemObjectIndex {...props} objects={[{ ...station, kind: 'gate' }, other]} />)
    expect(screen.queryByTestId('test-preview')).toBeNull() // Group label Stations alone must not qualify.
    expect(screen.getByRole('heading', { name: station.name }).closest('aside')!.querySelector('[class*="portrait"]')).not.toBeNull()
    h.rerender(<SystemObjectIndex {...props} />)
    fireEvent.click(screen.getByTestId('details-back'))
    expect(screen.queryByTestId('test-preview')).toBeNull()
    expect(life.created.length).toBe(life.disposed.length)
  })
})


it('Scenario: Selected stellar model matches the map / Star change and absent data do not retain stale art', () => {
  const warm = { ...other, name: 'served-warm', kind: 'star', group: 'Stars', starClass: 'K' }
  const cool = { ...warm, name: 'served-cool', starClass: 'O' }
  const h = render(<SystemObjectIndex {...props} objects={[warm, cool]} selected={warm.name} />)
  expect(screen.queryByTestId('test-preview')).toBeNull()
  fireEvent.click(screen.getByTestId('index-served-warm'))
  const preview = screen.getByTestId('test-preview')
  expect(preview).toHaveAttribute('data-kind', 'star'); expect(preview).toHaveAttribute('data-class', 'K')
  expect(screen.getByRole('heading', { name: warm.name }).compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('heading', { name: warm.name }).closest('aside')!.querySelector('[class*="portrait"]')).toBeNull()
  expect(screen.getByRole('button', { name: /Focus served-warm/ })).toBeEnabled()
  h.rerender(<SystemObjectIndex {...props} objects={[warm, cool]} selected={cool.name} />)
  expect(screen.getAllByTestId('test-preview')).toHaveLength(1)
  expect(screen.getByTestId('test-preview')).toHaveAttribute('data-class', 'O'); expect(life.disposed).toContain(warm.name)
  h.rerender(<SystemObjectIndex {...props} objects={[]} selected={cool.name} />)
  expect(screen.queryByTestId('test-preview')).toBeNull(); expect(life.disposed).toContain(cool.name)
})
