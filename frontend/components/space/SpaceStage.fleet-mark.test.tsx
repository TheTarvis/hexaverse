import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

// The own-fleet mark's affordance (2026-09-08): clicking it makes that fleet
// the acting one, hovering it shows its facts, and it is NEVER a member of
// the space view's selection — a fleet is not a burn target.

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}))
vi.mock('./SpaceCanvas', () => ({
  SpaceCanvas: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { SpaceStage } from './SpaceStage'

const T0 = 1_000_000
const marks = [
  { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5.2, pickable: false, selected: false },
  { id: 'feat-body-0', kind: 'body', position: { x: 300, y: 0, z: 300 }, radius: 1.7, pickable: true, selected: false },
  {
    id: 'fleet-1',
    kind: 'fleet',
    position: { x: 120, y: 0, z: -40 },
    radius: 0.6,
    pickable: false,
    selected: false,
    fleetMode: 0,
    arriveMs: T0 + 90_000,
  },
  {
    id: 'fleet-2',
    kind: 'fleet',
    position: { x: -80, y: 0, z: 60 },
    radius: 0.6,
    pickable: false,
    selected: false,
    fleetMode: 2,
    velocity: { x: 2.5, y: 0, z: -1 },
  },
]

const scene = {
  marks,
  curves: [],
  beltFields: [],
  orbitRings: [],
  positionTimeMs: T0,
  decorativeTimeMs: T0,
  omissions: [],
}

const W = 1200
const H = 900
const EXTENT = 658.7

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
})

function stage(over: Partial<React.ComponentProps<typeof SpaceStage>> = {}) {
  const onSelect = vi.fn()
  const onActivateFleet = vi.fn()
  render(
    <SpaceStage
      systemId="sys_1"
      scene={scene as never}
      extent={EXTENT}
      worldTime={T0}
      selection={null}
      onSelect={onSelect}
      actingFleetId="fleet-1"
      onActivateFleet={onActivateFleet}
      {...over}
    />,
  )
  return { onSelect, onActivateFleet }
}

describe('SpaceStage — the own-fleet mark is an affordance, never a selection', () => {
  it('renders a hit target per own fleet, ringing the acting one', () => {
    stage()
    expect(screen.getByTestId('fleet-mark-fleet-1')).toHaveAttribute('data-acting', 'true')
    expect(screen.getByTestId('fleet-mark-fleet-2')).toHaveAttribute('data-acting', 'false')
  })

  it('clicking a fleet mark activates that fleet and changes no selection', () => {
    const { onSelect, onActivateFleet } = stage()
    const mark = screen.getByTestId('fleet-mark-fleet-2')
    fireEvent.pointerDown(mark, { clientX: 400, clientY: 400, button: 0 })
    fireEvent.pointerUp(mark, { clientX: 400, clientY: 400 })
    fireEvent.click(mark)
    expect(onActivateFleet).toHaveBeenCalledWith('fleet-2')
    expect(onSelect, 'a fleet press must never become a point or body selection').not.toHaveBeenCalled()
  })

  it('hovering a burning fleet shows its activity and served arrival countdown', async () => {
    stage()
    fireEvent.pointerOver(screen.getByTestId('fleet-mark-fleet-1'))
    const facts = await screen.findByTestId('fleet-facts')
    expect(facts).toHaveTextContent('Under way')
    expect(facts).toHaveTextContent(/Arrives in 2m/)
    expect(facts).toHaveTextContent('commanding')
  })

  it('hovering a drifting fleet shows its served bearing and speed', async () => {
    stage()
    fireEvent.pointerOver(screen.getByTestId('fleet-mark-fleet-2'))
    const facts = await screen.findByTestId('fleet-facts')
    expect(facts).toHaveTextContent('Drifting')
    expect(facts).toHaveTextContent(/2\.6|2\.7/)
    expect(facts).toHaveTextContent('Click to command')
    fireEvent.pointerOut(screen.getByTestId('fleet-mark-fleet-2'))
    expect(screen.queryByTestId('fleet-facts')).toBeNull()
  })
})
