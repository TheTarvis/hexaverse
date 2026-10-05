import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// RED-PHASE SUITE — openspec change add-scan-and-sightings-surface,
// tasks.md §8 (`sighting-log`'s ADDED requirements: "The Sighting Log Lists
// the Corporation's Own Pile in Served Order", "A Log Row Names No Owner",
// "An Unknown System Name Falls Back to Its Id", "The Log Pages Through the
// Pile With the Server's Own Cursor", "The Log's Empty, Loading, and Failed
// States Are Each Explicit", "A Log Row and Its Ghost Address the Same
// Record By Its Served Id").
//
// CONTRACT — `frontend/components/space/SightingLog.tsx` (link8b-impl-
// contract.md §1.10 pins the test ids; props are an SDET judgment call):
//
//   export interface SightingLogProps {
//     systemId: string | null          // for the cross-highlight's ghost lookup only
//     highlightedGhostId: string | null
//     onHighlightRow: (recordId: string | null) => void
//     galaxySystemNames?: Record<string, string>  // fleet-roster's own fallback precedent
//   }
//
// The component reads its OWN pile via `useSightings()` (unfiltered, per
// task 4.4/4.7's key split) rather than receiving records as a prop.
//
// data-testid contract (pinned): sighting-log,
// sighting-row-${id}, sighting-log-load-more, sighting-log-empty,
// sighting-log-error.
//
// EXPECTED RED TODAY: `Cannot find module './SightingLog'` — the component
// does not exist yet.

const pile: {
  data:
    | {
        pages: { sightings: Record<string, unknown>[]; nextCursor: string }[]
      }
    | undefined
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
import { assertFiguresMatchModule } from '@/lib/format/assert-figures'

// MIGRATION NOTE (task 9.3, openspec change `add-figure-formatting`):
// `SightingLog` gains a required `scale: number | undefined` prop (task 7.4,
// its own `asOf` stamps need it for their `×N` suffix — the log itself never
// renders a span, so it needs no `worldTime`). The row's `asOf` (case c) gets
// a new derived testid, `sighting-asof-{id}`, carrying `world-ms-instant` and
// the record's raw `asOf` — coverage this file did not have before (task
// 9.3's own note).

function page(sightings: Record<string, unknown>[], nextCursor = '') {
  return { pages: [{ sightings, nextCursor }] }
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
    hullCount: 2,
    hullTypes: ['frigate', 'frigate'],
    ...over,
  }
}

function log(over: Record<string, unknown> = {}) {
  return render(
    <SightingLog
      systemId="sys-1"
      highlightedGhostId={null}
      onHighlightRow={vi.fn()}
      scale={1}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(over as any)}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  pile.data = undefined
  pile.isLoading = false
  pile.isError = false
  pile.hasNextPage = false
})

describe('SightingLog — served order, composition, and no owner (sighting-log)', () => {
  // Scenario: Rows render in the served order.
  it('Scenario: Rows render in the served order, with no client-side re-sorting', () => {
    pile.data = page([record({ id: 'sight-2', asOf: 500 }), record({ id: 'sight-1', asOf: 900 })])
    log()
    const rows = screen.getAllByTestId(/^sighting-row-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['sighting-row-sight-2', 'sighting-row-sight-1'])
  })

  // Scenario: A composition row shows hulls.
  it('Scenario: A composition row shows hull count and hull types', () => {
    pile.data = page([record({ hullCount: 3, hullTypes: ['frigate', 'frigate', 'scout'] })])
    log()
    const row = screen.getByTestId('sighting-row-sight-a1')
    expect(row.textContent).toContain('3')
    expect(row.textContent?.toLowerCase()).toContain('frigate')
  })

  // Scenario: A clean-sweep row shows the clean-sweep marker.
  it('Scenario: A clean-sweep row shows a clean-sweep marker and no composition', () => {
    pile.data = page([record({ cleanSweep: true, hullCount: 0, hullTypes: null })])
    log()
    const row = screen.getByTestId('sighting-row-sight-a1')
    expect(row.textContent?.toLowerCase()).toMatch(/clean|nothing/)
  })

  // Scenario: The swept host is shown as its raw id, whatever the host is.
  it.each(['feat-planet-2', 'feat-moon-1', 'feat-belt-0', 'gate-sys-9', 'feat-station', 'flt-9x2'])(
    'Scenario: host %s renders as its raw id with no placeholder styling',
    (hostId) => {
      pile.data = page([record({ hostId })])
      log()
      expect(screen.getByTestId('sighting-row-sight-a1').textContent).toContain(hostId)
    },
  )

  // Scenario: A row shows composition but no identity (A Log Row Names No
  // Owner).
  it('Scenario: A row displays no owner, corporation, or fleet identity for the target', () => {
    pile.data = page([record({ hostId: 'flt-9x2' })])
    log()
    const text = screen.getByTestId('sighting-row-sight-a1').textContent?.toLowerCase() ?? ''
    expect(text).not.toContain('corp-')
    expect(text).not.toContain('owner')
  })
})

describe('SightingLog — system-name fallback (An Unknown System Name Falls Back to Its Id)', () => {
  it('Scenario: A record in an unnamed system still renders, showing the raw system id', () => {
    pile.data = page([record({ systemId: 'sys-unnamed-42' })])
    log({ galaxySystemNames: {} })
    expect(screen.getByTestId('sighting-row-sight-a1').textContent).toContain('sys-unnamed-42')
  })

  it('Scenario: A named system shows its name, not its raw id', () => {
    pile.data = page([record({ systemId: 'sys-1' })])
    log({ galaxySystemNames: { 'sys-1': 'Kepler Reach' } })
    expect(screen.getByTestId('sighting-row-sight-a1').textContent).toContain('Kepler Reach')
  })
})

describe('SightingLog — cursor paging (The Log Pages Through the Pile With the Server\'s Own Cursor)', () => {
  it('Scenario: Load-more sends the served cursor verbatim / a non-empty cursor offers load-more', async () => {
    pile.data = page([record()], 'opaque-cursor-abc')
    pile.hasNextPage = true
    const user = userEvent.setup()
    log()
    await user.click(screen.getByTestId('sighting-log-load-more'))
    expect(pile.fetchNextPage).toHaveBeenCalled()
  })

  it('Scenario: An empty cursor ends the pile — no load-more affordance', () => {
    pile.data = page([record()], '')
    pile.hasNextPage = false
    log()
    expect(screen.queryByTestId('sighting-log-load-more')).not.toBeInTheDocument()
  })
})

describe('SightingLog — explicit loading, empty, and failed states', () => {
  it('Scenario: An empty pile is stated, naming the focused scan as the way to fill it', () => {
    pile.data = page([])
    log()
    const empty = screen.getByTestId('sighting-log-empty')
    expect(empty.textContent?.toLowerCase()).toContain('scan')
  })

  it('Scenario: A failed pile read is retriable and never reads as empty', () => {
    pile.isError = true
    log()
    expect(screen.getByTestId('sighting-log-error')).toBeInTheDocument()
    expect(screen.queryByTestId('sighting-log-empty')).not.toBeInTheDocument()
  })
})

describe('SightingLog — row/ghost cross-highlight (A Log Row and Its Ghost Address the Same Record By Its Served Id)', () => {
  it('Scenario: Selecting a row highlights its ghost — calls onHighlightRow with the record id', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-xyz' })])
    const user = userEvent.setup()
    log({ onHighlightRow })
    await user.click(screen.getByTestId('sighting-row-sight-xyz'))
    expect(onHighlightRow).toHaveBeenCalledWith('sight-xyz')
  })

  // Scenario: A row with no ghost says so (a clean sweep has no mark to
  // highlight in the open system).
  it('Scenario: A clean-sweep row states it has no mark in the open system', async () => {
    const onHighlightRow = vi.fn()
    pile.data = page([record({ id: 'sight-clean', cleanSweep: true })])
    const user = userEvent.setup()
    log({ onHighlightRow, highlightedGhostId: null })
    await user.click(screen.getByTestId('sighting-row-sight-clean'))
    expect(screen.getByTestId('sighting-row-sight-clean').textContent?.toLowerCase()).toMatch(/no mark/)
  })
})

describe('SightingLog — the asOf stamp, presented per figure-formatting (new coverage, task 9.3)', () => {
  it("Scenario: A composition row shows hulls (asOf half) — the row's asOf is a formatted T+ stamp carrying its raw served value", () => {
    pile.data = page([record({ asOf: 187_980_000 })])
    const { container } = log()
    const figure = screen.getByTestId('sighting-asof-sight-a1')
    expect(figure).toHaveAttribute('data-unit', 'world-ms-instant')
    expect(figure).toHaveAttribute('data-raw', '187980000')
    expect(figure.textContent).toContain('T+ 2d 04:13')
    // R4's accessible-label scenario (RULING 22): every T+ figure carries
    // `title={instantScaleLabel(scale)}`.
    expect(figure).toHaveAttribute('title', 'The world clock is running at 1 times real time.')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('Scenario: Two records within the same minute render identical stamps, distinguished only by row order', () => {
    pile.data = page([
      record({ id: 'sight-2', asOf: 1_000 }),
      record({ id: 'sight-1', asOf: 40_000 }),
    ])
    log()
    const first = screen.getByTestId('sighting-asof-sight-2')
    const second = screen.getByTestId('sighting-asof-sight-1')
    // Identical rendered stamps...
    expect(first.textContent).toBe(second.textContent)
    // ...but distinct raw values, so served ordering stays assertable.
    expect(first).toHaveAttribute('data-raw', '1000')
    expect(second).toHaveAttribute('data-raw', '40000')
    // Row order — not the stamps — is what shows which was observed first.
    const rows = screen.getAllByTestId(/^sighting-row-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['sighting-row-sight-2', 'sighting-row-sight-1'])
  })

  it('SDET-added: on a scale-less mount the T+ portion still renders, with an absent suffix', () => {
    pile.data = page([record({ asOf: 187_980_000 })])
    const { container } = log({ scale: undefined })
    const figure = screen.getByTestId('sighting-asof-sight-a1')
    expect(figure).toHaveAttribute('data-raw', '187980000')
    expect(figure.textContent).toContain('T+ 2d 04:13')
    expect(figure.textContent).toContain('×—')
    assertFiguresMatchModule(container, { scale: undefined })
  })
})
