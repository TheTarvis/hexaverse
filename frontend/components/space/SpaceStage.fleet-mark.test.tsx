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
import { assertFiguresMatchModule } from '@/lib/format/assert-figures'

// MIGRATION NOTE (task 9.4, openspec change `add-figure-formatting`):
// `SpaceStage` gains a required `scale: number | undefined` prop (task 8.2).
// `fleet-facts`'s "Arrives in …" line moves onto the duration formatter with
// the `world-ms-span-in` token, as `fleet-facts-arrival` — the label drops
// its own "in" (RULING 25's MINOR 1), so the rendered line is
// "Arrives" + a figure reading "in 1m 30s", never "Arrives in in 1m 30s".

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
  const { container } = render(
    <SpaceStage
      systemId="sys_1"
      scene={scene as never}
      extent={EXTENT}
      worldTime={T0}
      selection={null}
      onSelect={onSelect}
      actingFleetId="fleet-1"
      onActivateFleet={onActivateFleet}
      scale={1}
      // fix-world-time-render-loop, task 4.7 migration: static-scene mode.
      frameSource={null}
      {...over}
    />,
  )
  return { onSelect, onActivateFleet, container }
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
    const { container } = stage()
    fireEvent.pointerOver(screen.getByTestId('fleet-mark-fleet-1'))
    const facts = await screen.findByTestId('fleet-facts')
    expect(facts).toHaveTextContent('Under way')
    // The label drops its own "in": the module supplies it once.
    expect(facts).toHaveTextContent('Arrives')
    expect(facts).not.toHaveTextContent('Arrives in in')
    const arrival = screen.getByTestId('fleet-facts-arrival')
    expect(arrival).toHaveAttribute('data-unit', 'world-ms-span-in')
    // mark.arriveMs (T0+90_000) - nowMs (T0) = 90_000.
    expect(arrival).toHaveAttribute('data-raw', '90000')
    expect(arrival).toHaveTextContent('in 1m 30s')
    expect(facts).toHaveTextContent('commanding')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('SDET-added: on a scale-less mount the arrival figure renders absent, still carrying its raw span', async () => {
    const { container } = stage({ scale: undefined })
    fireEvent.pointerOver(screen.getByTestId('fleet-mark-fleet-1'))
    const arrival = await screen.findByTestId('fleet-facts-arrival')
    expect(arrival).toHaveAttribute('data-raw', '90000')
    expect(arrival).toHaveTextContent('—')
    assertFiguresMatchModule(container, { scale: undefined })
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

it('hides the acting-fleet selection styling while a body is selected', () => {
  stage({ scene: { ...scene, marks: marks.map(mark => ({ ...mark, selected: mark.id === 'feat-body-0' })) } as never })
  const fleet = screen.getByTestId('fleet-mark-fleet-1')
  expect(fleet).toHaveAttribute('data-acting', 'true')
  expect(fleet).toHaveAttribute('aria-pressed', 'false')
  expect(fleet).not.toHaveClass('ring-2')
  expect(screen.getByTestId('body-hit-feat-body-0')).toHaveAttribute('aria-pressed', 'true')
})
