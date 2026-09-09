import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// `sighting-log`'s "A Log Row and Its Ghost Address the Same Record By Its
// Served Id" — QA RETURN TO DEV: `hasGhost` used to be
// `!record.cleanSweep && record.systemId === systemId`, a "list of
// reasons" that covered only 2 of 5 cases a mark can be absent for. This
// file exercises the `drawnRecordIds` membership contract directly: a
// record's OWN system/cleanSweep fields are irrelevant to whether the log
// reports a mark — only membership in the served set of drawn ids is.
//
// The three cases QA named all reduce, at THIS layer, to the SAME
// assertion: a record absent from `drawnRecordIds` reports "no mark",
// whatever the reason (an origin-omitted record, one beyond the ghost
// layer's single page, or the canvas being unavailable at all — all three
// are `SystemSpaceView`-level reasons the set ends up not containing that
// id, which is exactly why this component takes the set as a prop instead
// of re-deriving any of them).
//
// SDET repair (add-figure-formatting build adjudications, dispute 2):
// `scale` restored to a required key on `SightingLog`. None of this file's
// scenarios are about scale or figure formatting (they pin drawnRecordIds
// membership), so `scale={1}` — matching the sibling `SightingLog.test.tsx`
// default — keeps every render call compiling and realistic.

const pile: {
  data: { pages: { sightings: Record<string, unknown>[]; nextCursor: string }[] } | undefined
  isLoading: boolean
  isError: boolean
  fetchNextPage: ReturnType<typeof vi.fn>
  hasNextPage: boolean
  refetch: ReturnType<typeof vi.fn>
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  refetch: vi.fn(),
}

vi.mock('@/hooks/use-sightings', () => ({
  useSightings: () => pile,
}))

import { SightingLog } from './SightingLog'

function page(sightings: Record<string, unknown>[]) {
  return { pages: [{ sightings, nextCursor: '' }] }
}

function record(over: Record<string, unknown> = {}) {
  return {
    id: 'sight-a1',
    systemId: 'sys-1',
    asOf: 1_000,
    hostId: 'feat-planet-2',
    cleanSweep: false,
    position: { X: 1, Y: 0, Z: 0 },
    velocity: { X: 0, Y: 0, Z: 0 },
    emitting: false,
    hullCount: 2,
    hullTypes: ['frigate', 'frigate'],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  pile.data = undefined
  pile.isLoading = false
  pile.isError = false
  pile.hasNextPage = false
})

describe('SightingLog — drawnRecordIds membership (QA return: no "list of reasons")', () => {
  it('a record present in drawnRecordIds highlights its ghost on selection', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-in-scene', systemId: 'sys-1' })])
    const user = userEvent.setup()
    render(
      <SightingLog
        systemId="sys-1"
        highlightedGhostId={null}
        onHighlightRow={onHighlightRow}
        drawnRecordIds={new Set(['sight-in-scene'])}
        scale={1}
      />,
    )
    await user.click(screen.getByTestId('sighting-row-sight-in-scene'))
    expect(onHighlightRow).toHaveBeenCalledWith('sight-in-scene')
  })

  // Case 1: an origin-omitted record — same system, not a clean sweep, but
  // the scene never drew it (buildSceneModel's own origin-omission rule),
  // so it is absent from drawnRecordIds despite matching every OLD
  // heuristic field.
  it('a same-system, non-clean record absent from drawnRecordIds (e.g. origin-omitted) reports no mark', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-origin', systemId: 'sys-1', cleanSweep: false })])
    const user = userEvent.setup()
    render(
      <SightingLog
        systemId="sys-1"
        highlightedGhostId={null}
        onHighlightRow={onHighlightRow}
        drawnRecordIds={new Set()}
        scale={1}
      />,
    )
    await user.click(screen.getByTestId('sighting-row-sight-origin'))
    expect(onHighlightRow).toHaveBeenCalledWith(null)
    expect(screen.getByTestId('sighting-row-sight-origin').textContent?.toLowerCase()).toMatch(/no mark/)
  })

  // Case 2: a record beyond the ghost layer's single bounded page — same
  // system, not clean, but the ghost layer only ever draws page 0, so a
  // later-page record is likewise absent from drawnRecordIds even though
  // the LOG itself (unfiltered, paged on demand) can still list it.
  it('a same-system, non-clean record beyond the ghost layer\'s one page reports no mark', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-beyond-page', systemId: 'sys-1', cleanSweep: false })])
    const user = userEvent.setup()
    render(
      <SightingLog
        systemId="sys-1"
        highlightedGhostId={null}
        onHighlightRow={onHighlightRow}
        drawnRecordIds={new Set(['some-other-drawn-id'])}
        scale={1}
      />,
    )
    await user.click(screen.getByTestId('sighting-row-sight-beyond-page'))
    expect(onHighlightRow).toHaveBeenCalledWith(null)
    expect(screen.getByTestId('sighting-row-sight-beyond-page').textContent?.toLowerCase()).toMatch(/no mark/)
  })

  // Case 3: canvas unavailable — `SystemSpaceView` passes an EMPTY set
  // regardless of what the pile holds, per its own `!canvasAvailable`
  // guard. From this component's perspective that is indistinguishable
  // from the other two absent-membership cases, which is the whole point.
  it('an empty drawnRecordIds (canvas unavailable) reports no mark for every otherwise-eligible record', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-canvas-down', systemId: 'sys-1', cleanSweep: false })])
    const user = userEvent.setup()
    render(
      <SightingLog
        systemId="sys-1"
        highlightedGhostId={null}
        onHighlightRow={onHighlightRow}
        drawnRecordIds={new Set()}
        scale={1}
      />,
    )
    await user.click(screen.getByTestId('sighting-row-sight-canvas-down'))
    expect(onHighlightRow).toHaveBeenCalledWith(null)
    expect(screen.getByTestId('sighting-row-sight-canvas-down').textContent?.toLowerCase()).toMatch(/no mark/)
  })

  it('a clean-sweep record reports no mark even when its id is present in drawnRecordIds', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-clean', cleanSweep: true })])
    const user = userEvent.setup()
    render(
      <SightingLog
        systemId="sys-1"
        highlightedGhostId={null}
        onHighlightRow={onHighlightRow}
        drawnRecordIds={new Set(['sight-clean'])}
        scale={1}
      />,
    )
    await user.click(screen.getByTestId('sighting-row-sight-clean'))
    expect(onHighlightRow).toHaveBeenCalledWith(null)
  })
})
