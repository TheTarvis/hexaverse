import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// RED-PHASE SUITE — openspec change `add-vitals-strip`, capability
// `system-console`: *The Fleet Cell Names the Acting Fleet and Delegates a
// Switch to the Mounting View*, *The Fleet Cell's Chevron and Menu Are
// Keyboard-Operable* (impl contract §7.3, tasks.md 2.1-2.5).
// `VitalsStripFleetCell.tsx` does not exist yet — COMPILE-RED until it does.
//
// PINNED SHAPE (contract §7.3, RULING 26): a hand-rolled
// <button aria-haspopup="menu" aria-expanded> plus a role="menu" of
// role="menuitem" buttons — never a Catalyst `<select>`/listbox (jsdom has
// no native-select popup, which would push three keyboard scenarios to
// tier 4 blind — the exact failure mode `docs/testing-tiers.md` names).
//
// This file supplies its own minimal props (no SystemSpaceView, no
// FleetRoster) — the fleet cell is a leaf that receives `acting`,
// `ownedFleets`, `fleetsFailed`, `onSelectFleet`, `systemNames`, `status`,
// `stranded`, `scale`, `worldTime` and renders identity + chevron + pill.

import { VitalsStripFleetCell } from './VitalsStripFleetCell'
import type { Fleet } from '@/lib/types/fleet'

const T0 = 21_175_110_953

function fleet(over: Partial<Fleet> = {}): Fleet {
  return {
    id: 'fleet_1',
    corporationId: 'corp-1',
    systemId: 'sys-0',
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    position: { X: 0, Y: 0, Z: 0 },
    own: true,
    worldTime: T0,
    ...over,
  } as Fleet
}

const systemNames = { 'sys-0': 'Axion', 'sys-1': 'Borealis' }

function cell(over: Record<string, unknown> = {}) {
  const onSelectFleet = vi.fn()
  const utils = render(
    <VitalsStripFleetCell
      acting={fleet()}
      ownedFleets={[fleet()]}
      fleetsFailed={false}
      status={null}
      stranded={false}
      scale={1}
      worldTime={T0}
      systemNames={systemNames}
      onSelectFleet={onSelectFleet}
      {...over}
    />,
  )
  return { onSelectFleet, ...utils }
}

describe('VitalsStripFleetCell — identity (contract §7.1)', () => {
  it('Scenario: shows the acting fleet\'s served id, verbatim, no synthesised name', () => {
    cell({ acting: fleet({ id: 'fleet_42' }) })
    expect(screen.getByTestId('vitals-fleet-id').textContent).toMatch(/fleet_42/)
    expect(screen.getByTestId('vitals-fleet-id')).not.toHaveAttribute('data-raw')
  })

  it('Scenario: The chevron survives the no-acting-fleet state — identity reads absent, chevron stays present and interactive', () => {
    cell({ acting: null })
    expect(screen.getByTestId('vitals-fleet-id').textContent).toMatch(/—/)
    const chevron = screen.getByTestId('vitals-fleet-chevron')
    expect(chevron).toBeInTheDocument()
    expect((chevron as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('VitalsStripFleetCell — chevron menu membership (contract, RULING 19)', () => {
  it('Scenario: The chevron\'s menu lists every fleet the requester owns, regardless of system or lane', async () => {
    cell({
      ownedFleets: [fleet({ id: 'a', systemId: 'sys-0' }), fleet({ id: 'b', systemId: 'sys-1' }), fleet({ id: 'c', jump: { laneId: 'l1', destSystemId: 'sys-1', departMs: 0, arriveMs: 1 } })],
    })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    expect(screen.getByTestId('vitals-fleet-menu-item-a')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-fleet-menu-item-b')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-fleet-menu-item-c')).toBeInTheDocument()
  })

  it('Scenario: A sole owned fleet leaves the chevron\'s menu with one entry', async () => {
    cell({ ownedFleets: [fleet({ id: 'solo' })] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })

  it('Scenario: A requester owning no fleet at all still gets the strip — the menu is empty, not absent', async () => {
    cell({ acting: null, ownedFleets: [] })
    expect(screen.getByTestId('vitals-fleet-chevron')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    expect(screen.getByTestId('vitals-fleet-menu')).toBeInTheDocument()
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('Scenario: A failed own-fleets refetch empties the menu rather than freezing it', async () => {
    cell({ fleetsFailed: true, ownedFleets: [fleet({ id: 'stale-a' })] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    expect(screen.queryByTestId('vitals-fleet-menu-item-stale-a')).toBeNull()
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('Scenario: A menu entry names its fleet\'s system before it navigates, falling back to the raw system id when the galaxy read has not resolved', async () => {
    cell({
      ownedFleets: [fleet({ id: 'elsewhere', systemId: 'sys-1' }), fleet({ id: 'unnamed-sys', systemId: 'sys-unknown' })],
      systemNames: { 'sys-1': 'Borealis' },
    })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    expect(screen.getByTestId('vitals-fleet-menu-item-elsewhere').textContent).toMatch(/elsewhere/)
    expect(screen.getByTestId('vitals-fleet-menu-item-elsewhere').textContent).toMatch(/Borealis/)
    expect(screen.getByTestId('vitals-fleet-menu-item-unnamed-sys').textContent).toMatch(/sys-unknown/)
  })

  it('Scenario: a fleet in lane transit is named as under way between systems in its menu entry', async () => {
    cell({ ownedFleets: [fleet({ id: 'onlane', jump: { laneId: 'l1', destSystemId: 'sys-1', departMs: 0, arriveMs: 1 } })] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    expect(screen.getByTestId('vitals-fleet-menu-item-onlane').textContent?.toLowerCase()).toMatch(/way|transit|between/)
  })
})

describe('VitalsStripFleetCell — choosing an entry delegates through the callback, never decides itself (contract)', () => {
  it('Scenario: Choosing a fleet in this system sets it acting and no navigation occurs — the SAME callback the roster row uses', async () => {
    const { onSelectFleet } = cell({ ownedFleets: [fleet({ id: 'here', systemId: 'sys-0' })] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    await userEvent.click(screen.getByTestId('vitals-fleet-menu-item-here'))
    expect(onSelectFleet).toHaveBeenCalledTimes(1)
    expect(onSelectFleet.mock.calls[0][0]).toMatchObject({ id: 'here' })
  })

  it('Scenario: Choosing a fleet in another system navigates there — delegated through the SAME callback the roster row uses, never a second decision path', async () => {
    const { onSelectFleet } = cell({ ownedFleets: [fleet({ id: 'elsewhere', systemId: 'sys-1' })] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    await userEvent.click(screen.getByTestId('vitals-fleet-menu-item-elsewhere'))
    expect(onSelectFleet).toHaveBeenCalledTimes(1)
    expect(onSelectFleet.mock.calls[0][0]).toMatchObject({ id: 'elsewhere', systemId: 'sys-1' })
  })

  it('Scenario: Choosing a fleet out on a lane navigates to the galaxy view — delegated through the same callback, the fleet cell decides nothing about what it means', async () => {
    const onLane = fleet({ id: 'onlane', jump: { laneId: 'l1', destSystemId: 'sys-1', departMs: 0, arriveMs: 1 } })
    const { onSelectFleet } = cell({ ownedFleets: [onLane] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    await userEvent.click(screen.getByTestId('vitals-fleet-menu-item-onlane'))
    expect(onSelectFleet).toHaveBeenCalledTimes(1)
    expect(onSelectFleet.mock.calls[0][0]).toMatchObject({ id: 'onlane' })
  })

  it('Scenario: Focus and the chevron\'s own label confirm a same-system switch', async () => {
    cell({ acting: fleet({ id: 'fleet_1' }), ownedFleets: [fleet({ id: 'fleet_1' }), fleet({ id: 'fleet_2' })] })
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    await userEvent.click(screen.getByTestId('vitals-fleet-menu-item-fleet_2'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('vitals-fleet-chevron')))
    expect(screen.getByTestId('vitals-fleet-chevron').getAttribute('aria-label') ?? '').toMatch(/fleet_2/)
  })

  it('Scenario: The chevron is the strip\'s only interactive element — every interactive element is the chevron or a descendant of its own menu', async () => {
    const { container } = cell()
    await userEvent.click(screen.getByTestId('vitals-fleet-chevron'))
    const interactive = Array.from(container.querySelectorAll('button, a[href], [role="menuitem"]'))
    for (const el of interactive) {
      const isChevron = el === screen.getByTestId('vitals-fleet-chevron')
      const isInsideMenu = screen.getByTestId('vitals-fleet-menu').contains(el)
      expect(isChevron || isInsideMenu, `unexpected interactive element: ${el.outerHTML}`).toBe(true)
    }
  })
})

describe('VitalsStripFleetCell — keyboard operability (contract, *The Fleet Cell\'s Chevron and Menu Are Keyboard-Operable*)', () => {
  it('Scenario: The chevron opens from the keyboard (Enter or Space)', async () => {
    cell()
    screen.getByTestId('vitals-fleet-chevron').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('vitals-fleet-menu')).toBeInTheDocument()
  })

  it('Scenario: Menu entries are reachable and selectable from the keyboard — arrow-key navigation, Enter chooses, identically to a pointer click', async () => {
    const { onSelectFleet } = cell({
      ownedFleets: [fleet({ id: 'first' }), fleet({ id: 'second' })],
    })
    screen.getByTestId('vitals-fleet-chevron').focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(onSelectFleet).toHaveBeenCalledTimes(1)
    expect(onSelectFleet.mock.calls[0][0]).toMatchObject({ id: 'second' })
  })

  it('Scenario: Escape closes the menu without choosing and returns focus to the chevron', async () => {
    const { onSelectFleet } = cell({ ownedFleets: [fleet({ id: 'a' }), fleet({ id: 'b' })] })
    screen.getByTestId('vitals-fleet-chevron').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('vitals-fleet-menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('vitals-fleet-menu')).toBeNull()
    expect(onSelectFleet).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByTestId('vitals-fleet-chevron'))
  })

  it('Scenario: The chevron is reachable via the strip\'s normal tab order', () => {
    cell()
    const chevron = screen.getByTestId('vitals-fleet-chevron')
    expect(chevron.getAttribute('tabindex')).not.toBe('-1')
  })
})

describe('VitalsStripFleetCell — the pill mounts, driven only by status/stranded/scale/worldTime (contract §7.1)', () => {
  it('Scenario: mounts vitals-state-pill and vitals-stranded, reflecting the props passed straight through', () => {
    cell({
      status: { tone: 'idle', where: 'Axion', activity: 'On station', activityKind: 'onstation' },
      stranded: true,
    })
    expect(screen.getByTestId('vitals-state-pill')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-stranded')).toBeInTheDocument()
  })
})
