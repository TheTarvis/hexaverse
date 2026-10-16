import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VitalsStripFleetCell, type VitalsStripFleetCellProps } from './VitalsStripFleetCell'
import { ConsoleDock } from './ConsoleDock'
import type { Fleet } from '@/lib/types/fleet'

vi.mock('./SpacecraftPreview', () => ({ SpacecraftPreview: ({ objectId, kind }: { objectId: string; kind: string }) => <div tabIndex={0} aria-label={`3D preview of ${objectId}`} data-testid="test-preview" data-kind={kind} /> }))
const first: Fleet = { id: 'fleet-one', corporationId: 'corp-one', systemId: 'system-one', own: true, worldTime: 0, position: { X: 0, Y: 0, Z: 0 }, state: { Mode: 2, Park: null, Burn: null, Drift: { Anchor: { X: 0, Y: 0, Z: 0 }, Velocity: { X: 1, Y: 0, Z: 0 }, EpochMs: 0 } } }
const second: Fleet = { ...first, id: 'fleet-two' }
function props(over: Partial<VitalsStripFleetCellProps> = {}): VitalsStripFleetCellProps {
  return { acting: first, ownedFleets: [first, second], fleetsFailed: false, status: { tone: 'drifting', where: 'system-one', activity: 'Drifting', activityKind: 'drifting' } as VitalsStripFleetCellProps['status'], stranded: false, scale: 0, worldTime: 0, systemNames: {}, onSelectFleet: vi.fn(), ...over }
}
function Hosted({ cell }: { cell: VitalsStripFleetCellProps }) {
  const [expanded, setExpanded] = useState(true)
  return <><button>Outside camera</button><ConsoleDock expanded={expanded} openSeq={0} selectedTab="scan" onOpen={() => setExpanded(true)} onSelectTab={vi.fn()} onCollapse={() => setExpanded(false)} strip={<div data-testid="strip"><VitalsStripFleetCell {...cell} /></div>} tabs={[{ id: 'scan', label: 'Scan', content: <input aria-label="Unchanged input" defaultValue="cargo" /> }]} /></>
}
const chevron = () => screen.getByTestId('vitals-fleet-chevron')
const inspector = () => screen.getByRole('region', { name: 'Fleet fleet-one details' })
async function inspect() {
  await userEvent.click(chevron())
  await userEvent.click(screen.getByRole('menuitem', { name: 'Inspect current fleet fleet-one' }))
}

describe('own fleet persistent inspection and dock compatibility', () => {
  it('Scenario: Inspect current fleet opens details without switching / Own-fleet inspection preview', async () => {
    const cell = props(); render(<Hosted cell={cell} />)
    await inspect()
    expect(screen.queryByRole('menu')).toBeNull()
    const panel = inspector()
    expect(panel).not.toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('strip')).not.toContainElement(panel)
    expect(within(panel).getByTestId('test-preview')).toHaveAttribute('data-kind', 'ship')
    const close = within(panel).getByRole('button', { name: /close/i })
    expect(close).toHaveFocus()
    expect(cell.onSelectFleet).not.toHaveBeenCalled()
    expect(screen.getByTestId('vitals-fleet-id')).toHaveTextContent('fleet-one')
    expect(within(panel).getByText('Drifting', { exact: false })).toBeInTheDocument()
    await userEvent.click(close)
    expect(screen.queryByRole('region', { name: 'Fleet fleet-one details' })).toBeNull()
    expect(chevron()).toHaveFocus()
  })
  it('Scenario: Inspect current fleet opens details without switching — keyboard roving menu entry', async () => {
    const cell = props(); render(<Hosted cell={cell} />)
    chevron().focus(); await userEvent.keyboard('{Enter}')
    const entry = screen.getByRole('menuitem', { name: 'Inspect current fleet fleet-one' })
    for (let i = 0; i < 4 && document.activeElement !== entry; i++) await userEvent.keyboard('{ArrowDown}')
    expect(entry).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(inspector()).toBeVisible()
    expect(cell.onSelectFleet).not.toHaveBeenCalled()
  })
  it.each(['changed', 'removed', 'absent', 'failed'] as const)('Scenario: Inspection follows current served ownership — %s closes inspector', async reason => {
    const cell = props(), h = render(<Hosted cell={cell} />)
    await inspect(); expect(inspector()).toBeVisible()
    const changed = props(reason === 'changed' ? { acting: second } : reason === 'removed' ? { ownedFleets: [second] } : reason === 'absent' ? { acting: null } : { fleetsFailed: true })
    h.rerender(<Hosted cell={changed} />)
    expect(screen.queryByRole('region', { name: 'Fleet fleet-one details' })).toBeNull()
    expect(screen.queryByTestId('test-preview')).toBeNull()
    await userEvent.click(chevron())
    expect(screen.queryByRole('menuitem', { name: 'Inspect current fleet fleet-one' })).toBeNull()
    if (reason === 'changed') expect(screen.getByRole('menuitem', { name: 'Inspect current fleet fleet-two' })).toBeInTheDocument()
    if (reason === 'failed') expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })
  it('Scenario: Escape closes the fleet inspector without collapsing the dock', async () => {
    const cell = props(); render(<Hosted cell={cell} />); await inspect()
    const region = screen.getByTestId('console-dock-region')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Fleet fleet-one details' })).toBeNull()
    expect(region).not.toHaveAttribute('hidden'); expect(chevron()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(region).toHaveAttribute('hidden'); expect(chevron()).toHaveFocus()
    expect(cell.onSelectFleet).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Unchanged input')).toHaveValue('cargo')
  })
  it('Scenario: Held Escape closes only the fleet inspector', async () => {
    render(<Hosted cell={props()} />); await inspect()
    const close = within(inspector()).getByRole('button', { name: /close/i })
    fireEvent.keyDown(close, { key: 'Escape', repeat: false })
    expect(screen.queryByRole('region', { name: 'Fleet fleet-one details' })).toBeNull()
    for (let i = 0; i < 3; i++) fireEvent.keyDown(chevron(), { key: 'Escape', repeat: true })
    expect(screen.getByTestId('console-dock-region')).not.toHaveAttribute('hidden')
    fireEvent.keyUp(chevron(), { key: 'Escape' })
    fireEvent.keyDown(chevron(), { key: 'Escape', repeat: false })
    expect(screen.getByTestId('console-dock-region')).toHaveAttribute('hidden')
  })
  it('SDET-added: inspector with outside focus does not claim Escape; reopening menu closes inspector', async () => {
    render(<Hosted cell={props()} />); await inspect()
    screen.getByRole('button', { name: 'Outside camera' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('console-dock-region')).toHaveAttribute('hidden')
    expect(inspector()).toBeVisible()
    await userEvent.click(chevron())
    expect(screen.queryByRole('region', { name: 'Fleet fleet-one details' })).toBeNull()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})


it('uses a full phone page for fleet details and restores fleet-picker focus on close', async () => {
  const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  try {
    render(<Hosted cell={props()} />)
    await inspect()
    expect(screen.getByRole('dialog', { name: 'Fleet fleet-one details' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Outside camera').closest('[inert]')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Close fleet details' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chevron()).toHaveFocus()
  } finally { media.mockRestore() }
})
