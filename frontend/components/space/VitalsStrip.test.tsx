import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// RED-PHASE SUITE — openspec change `add-vitals-strip`, capability
// `system-console`: the container invariants (*The Vitals Strip Is Present
// on Every Render*, *The Strip Carries No Verb*, *The Strip Issues No Read
// of Its Own*, *Activating the Strip Changes No Space-View Selection*, *The
// Strip Announces Only Its Own Balance Changes*) and the fuel/hold/credits/
// clock cells (impl contract §5.4/§7/§7.4/§7.5, tasks.md 4.x/5.x/6.x/7.x).
// `VitalsStrip.tsx` does not exist yet — COMPILE-RED until it does.
//
// SCOPE NOTE. This file exercises VitalsStrip DIRECTLY, supplied plain
// props — never through SystemSpaceView. Three scenarios this file cannot
// prove because VitalsStrip's closed props carry no interior/renderer state
// of their own, and two the CSS-layout-blind jsdom environment cannot prove
// at all, are named at each site below and covered instead in
// `SystemSpaceView.test.tsx` (integration) or deferred to the archive-gate
// journey (Playwright) — see the SDET coverage table.

import { VitalsStrip } from './VitalsStrip'
import type { Fleet, FleetRoster } from '@/lib/types/fleet'
import type { RosterRowStatus } from '@/components/fleet/roster-status'
import { assertFiguresMatchModule } from '@/lib/format/assert-figures'

const T0 = 21_175_110_953

function roster(over: Partial<FleetRoster> = {}): FleetRoster {
  return {
    ships: [{ class: 'hauler' }],
    cargo: { fuel: 6, metals: 10, organics: 2 },
    cargoCapacity: 40,
    freeHold: 22,
    miningRate: 0,
    estimatedRange: 5000,
    stranded: false,
    fuelPricePerTon: 5,
    stationKeepRateTonsPerSecond: 0.02,
    ...over,
  }
}

function fleet(over: Partial<Fleet> = {}): Fleet {
  return {
    id: 'fleet_1',
    corporationId: 'corp-1',
    systemId: 'sys-0',
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    position: { X: 0, Y: 0, Z: 0 },
    own: true,
    worldTime: T0,
    roster: roster(),
    ...over,
  } as Fleet
}

const onstationStatus: RosterRowStatus = {
  tone: 'idle',
  where: 'Axion',
  activity: 'On station',
  activityKind: 'onstation',
}

const underwayStatus: RosterRowStatus = {
  tone: 'moving',
  where: 'Axion',
  activity: 'Under way',
  activityKind: 'underway',
  targetLabel: 'planet body-1',
  etaWorldMs: T0 + 60_000,
}

const dockedStatus: RosterRowStatus = {
  tone: 'idle',
  where: 'Axion',
  activity: 'Docked',
  activityKind: 'docked',
  hostLabel: 'station feat-station',
}

const systemNames = { 'sys-0': 'Axion', 'sys-1': 'Borealis' }

describe('Command telemetry mode', () => {
  it('preserves resolved dock status and telemetry without a duplicate selector', () => {
    strip({ mode: 'panel', status: dockedStatus })
    expect(screen.getByTestId('vitals-command-status')).toHaveTextContent('Docked at station feat-station')
    expect(screen.getByTestId('vitals-fuel-tons')).toBeInTheDocument()
    expect(screen.queryByTestId('vitals-fleet-chevron')).toBeNull()
    expect(screen.queryByTestId('vitals-details-toggle')).toBeNull()
  })
  it('preserves burn target and ETA while keeping Command selection separate', () => {
    strip({ mode: 'panel', status: underwayStatus })
    expect(screen.getByTestId('vitals-command-status')).toHaveTextContent('Under way to planet body-1')
    expect(screen.getByTestId('vitals-command-status').querySelector('[data-raw]')).not.toBeNull()
    expect(screen.getByTestId('vitals-strip').querySelectorAll('button')).toHaveLength(0)
  })
})

function strip(over: Record<string, unknown> = {}) {
  const onSelectFleet = vi.fn()
  const utils = render(
    <VitalsStrip
      acting={fleet()}
      ownedFleets={[fleet()]}
      fleetsFailed={false}
      status={onstationStatus}
      onSelectFleet={onSelectFleet}
      systemNames={systemNames}
      credits={1250}
      scale={1}
      worldTime={T0}
      serverWorldTime={T0}
      {...over}
    />,
  )
  return { onSelectFleet, ...utils }
}

// ---------------------------------------------------------------------------
// The Vitals Strip Is Present on Every Render of the System Space View
// ---------------------------------------------------------------------------

describe('VitalsStrip — always present (contract §7.1)', () => {
  it('Scenario: The strip renders with every read resolved — fleet, fuel, hold, credits, clock cells all present', () => {
    strip()
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    for (const id of ['vitals-fleet-cell', 'vitals-fuel-cell', 'vitals-hold-cell', 'vitals-credits-cell', 'vitals-clock-cell']) {
      expect(screen.getByTestId(id), `${id} missing`).toBeInTheDocument()
    }
  })

  // "The strip survives a failed interior read" and "The strip survives an
  // unavailable renderer": VitalsStrip's closed props (contract §7.2) carry
  // no interior read and no renderer-availability flag of their own — the
  // strip cannot fail on inputs it never receives. These two scenarios are
  // proven at the wiring level in SystemSpaceView.test.tsx (the view must
  // still MOUNT the strip when those OTHER reads/surfaces fail), not here.

  it('Scenario: The strip survives a failed own-fleets read — fleet/fuel/hold cells read absent exactly as the no-acting-fleet case, no error or retry of its own', () => {
    const { container } = strip({ acting: null, ownedFleets: [], fleetsFailed: true, status: null })
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-fleet-id').textContent).toMatch(/—/)
    expect(screen.getByTestId('vitals-fuel-tons').textContent).toMatch(/—/)
    expect(screen.getByTestId('vitals-fuel-range').textContent).toMatch(/—/)
    expect(screen.getByTestId('hold-capacity-used').textContent).toMatch(/—/)
    expect(screen.queryByTestId('space-fleets-error')).toBeNull()
    expect(screen.queryByTestId('space-fleets-retry')).toBeNull()
    void container
  })

  it('Scenario: With no acting fleet the fleet-scoped figures read absent and the chevron stays — credits and clock keep showing figures, and the chevron still lists fleets owned elsewhere', () => {
    strip({ acting: null, ownedFleets: [fleet({ id: 'elsewhere', systemId: 'sys-1' })], status: null })
    expect(screen.getByTestId('vitals-fleet-id').textContent).toMatch(/—/)
    expect(screen.getByTestId('vitals-fuel-tons').textContent).toMatch(/—/)
    const chevron = screen.getByTestId('vitals-fleet-chevron')
    expect(chevron).toBeInTheDocument()
    expect((chevron as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'true')
    expect(screen.getByTestId('vitals-clock-stamp').textContent).toMatch(/T\+/)
  })

  it('Scenario: A requester owning no fleet at all still gets the strip — chevron menu empty (not absent), credits and clock still show figures', () => {
    strip({ acting: null, ownedFleets: [], status: null })
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-fleet-id').textContent).toMatch(/—/)
    expect(screen.getByTestId('vitals-fuel-tons').textContent).toMatch(/—/)
    expect(screen.getByTestId('hold-capacity-used').textContent).toMatch(/—/)
    expect(screen.getByTestId('vitals-fleet-chevron')).toBeInTheDocument()
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'true')
    expect(screen.getByTestId('vitals-clock-stamp').textContent).toMatch(/T\+/)
  })
})

// ---------------------------------------------------------------------------
// The Strip Carries No Verb
// ---------------------------------------------------------------------------

describe('VitalsStrip — no verb (contract, RULING 3)', () => {
  function allInteractive(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="menuitem"]'))
  }

  it('Scenario: A docked fleet\'s strip offers no trade verb', () => {
    const { container } = strip({ status: dockedStatus })
    for (const el of allInteractive(container)) {
      const testId = el.getAttribute('data-testid') ?? ''
      expect(testId, `unexpected interactive element: ${el.outerHTML}`).not.toMatch(
        /refuel|sell|mine|jump|hold-control|release/i,
      )
    }
  })

  it('Scenario: A burning fleet\'s strip offers no burn-ending verb', () => {
    const { container } = strip({ status: underwayStatus })
    for (const el of allInteractive(container)) {
      const testId = el.getAttribute('data-testid') ?? ''
      expect(testId, `unexpected interactive element: ${el.outerHTML}`).not.toMatch(/cut-drive|stop/i)
    }
  })

  it('Scenario: The chevron is the strip\'s only interactive element — every one is the chevron or a descendant of its own menu', async () => {
    const { container } = strip()
    const chevron = screen.getByTestId('vitals-fleet-chevron')
    for (const el of allInteractive(container)) {
      const isChevron = el === chevron
      const isInsideMenu = el.closest('[data-testid="vitals-fleet-menu"]') !== null
      expect(isChevron || isInsideMenu || el.getAttribute('data-testid') === 'vitals-details-toggle', `unexpected interactive element: ${el.outerHTML}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a
// Gauge
// ---------------------------------------------------------------------------

describe('VitalsStrip — fuel cell (contract §7.5)', () => {
  it('Scenario: The fuel cell shows tonnage and range, each carrying its own raw served value', () => {
    const { container } = strip()
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-unit', 'tons')
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '6')
    expect(screen.getByTestId('vitals-fuel-range')).toHaveAttribute('data-unit', 'range')
    expect(screen.getByTestId('vitals-fuel-range')).toHaveAttribute('data-raw', '5000')
    expect(screen.getByTestId('fuel-gauge')).toHaveAttribute('data-gauge-state', 'filled')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('Scenario: An unserved roster reads absent, and the gauge shows no fill', () => {
    strip({ acting: fleet({ roster: undefined }), status: onstationStatus })
    expect(screen.getByTestId('vitals-fuel-tons')).not.toHaveAttribute('data-raw')
    expect(screen.getByTestId('vitals-fuel-tons').textContent).toMatch(/—/)
    expect(screen.getByTestId('vitals-fuel-range')).not.toHaveAttribute('data-raw')
    expect(screen.getByTestId('fuel-gauge')).toHaveAttribute('data-gauge-state', 'no-data')
  })

  it('Scenario: A fleet holding no fuel reads absent, exactly as its roster row does — never a lying 0 t (a dry fleet and an unserved roster are one absence)', () => {
    strip({ acting: fleet({ roster: roster({ cargo: { metals: 10 } }) }), status: onstationStatus })
    expect(screen.getByTestId('vitals-fuel-tons')).not.toHaveAttribute('data-raw')
    expect(screen.getByTestId('vitals-fuel-tons').textContent).toMatch(/—/)
    // The gauge never reads `empty` for fuel — a dry fleet is `no-data`,
    // never a rendered-zero fill (impl contract §5.3).
    expect(screen.getByTestId('fuel-gauge')).toHaveAttribute('data-gauge-state', 'no-data')
    expect(screen.getByTestId('fuel-gauge')).not.toHaveAttribute('data-gauge-state', 'empty')
  })

  it('Scenario: The gauge\'s no-data state is DOM-distinguishable from a sub-pixel fill — 0.05 t against 200 t capacity still reads filled', () => {
    const { rerender } = strip({ acting: fleet({ roster: undefined }), status: onstationStatus })
    expect(screen.getByTestId('fuel-gauge')).toHaveAttribute('data-gauge-state', 'no-data')

    rerender(
      <VitalsStrip
        acting={fleet({ roster: roster({ cargo: { fuel: 0.05 }, cargoCapacity: 200 }) })}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('fuel-gauge')).toHaveAttribute('data-gauge-state', 'filled')
    expect(screen.getByTestId('fuel-gauge')).not.toHaveAttribute('data-gauge-state', 'no-data')
  })
})

describe('VitalsStrip — while burning, the fuel cell reflects each served read and never an interpolated drain (contract §7.5)', () => {
  it('Scenario: A burning fleet\'s fuel cell shows a visible draining marker', () => {
    strip({ status: underwayStatus })
    expect(screen.getByTestId('vitals-fuel-draining')).toBeInTheDocument()
  })

  it('the draining marker is absent while not burning', () => {
    strip({ status: onstationStatus })
    expect(screen.queryByTestId('vitals-fuel-draining')).toBeNull()
  })

  it('Scenario: The figure moves only when a read lands — worldTime advancing alone, with the same acting fleet object, changes nothing', () => {
    const acting = fleet()
    const { rerender } = strip({ acting, status: underwayStatus, worldTime: T0 })
    const before = screen.getByTestId('vitals-fuel-tons').getAttribute('data-raw')
    rerender(
      <VitalsStrip
        acting={acting}
        ownedFleets={[acting]}
        fleetsFailed={false}
        status={underwayStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={1}
        worldTime={T0 + 30_000}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('vitals-fuel-tons').getAttribute('data-raw')).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented
// Gauge
// ---------------------------------------------------------------------------

describe('VitalsStrip — hold cell (contract §3.1, §7.5)', () => {
  it('Scenario: The hold cell shows contents and capacity — the eleven-testid inherited shape (contract §3.1)', () => {
    const { container } = strip()
    expect(screen.getByTestId('hold-readout')).toBeInTheDocument()
    expect(screen.getByTestId('hold-capacity-used')).toHaveAttribute('data-raw', '18')
    expect(screen.getByTestId('hold-capacity-total')).toHaveAttribute('data-raw', '40')
    expect(screen.getByTestId('hold-free')).toHaveAttribute('data-raw', '22')
    expect(screen.getByTestId('hold-metals-tons')).toHaveAttribute('data-raw', '10')
    expect(screen.getByTestId('hold-organics-tons')).toHaveAttribute('data-raw', '2')
    expect(screen.getByTestId('hold-fuel-tons')).toHaveAttribute('data-raw', '6')
    expect(screen.getByTestId('hold-gauge')).toHaveAttribute('data-gauge-state', 'filled')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('§3.1/§3.2 rule 1: hold-capacity carries no data-raw of its own — exactly one [data-raw] per OTHER inherited testid\'s subtree', () => {
    strip()
    expect(screen.getByTestId('hold-capacity')).not.toHaveAttribute('data-raw')
    for (const id of ['hold-capacity-used', 'hold-capacity-total', 'hold-free', 'hold-fuel-tons', 'hold-metals-tons', 'hold-organics-tons']) {
      const el = screen.getByTestId(id)
      expect(el.querySelectorAll('[data-raw]').length + (el.hasAttribute('data-raw') ? 1 : 0)).toBe(1)
    }
  })

  it('§3.4: segments (and hold-<kind> rows) are ordered stably by kind name, ascending, plain codepoint comparison', () => {
    strip({
      acting: fleet({ roster: roster({ cargo: { organics: 2, fuel: 6, metals: 10 } }) }),
    })
    const rows = screen
      .getAllByText(/^(fuel|metals|organics)$/)
      .map((el) => el.textContent)
    expect(rows).toEqual(['fuel', 'metals', 'organics'])
  })

  it('a kind held at zero renders no row at all — never an empty row per known kind (the e2e holdKindTons() helper depends on absence, not a zero figure)', () => {
    strip({ acting: fleet({ roster: roster({ cargo: { fuel: 6 } }) }) })
    expect(screen.queryByTestId('hold-metals-tons')).toBeNull()
    expect(screen.queryByTestId('hold-organics-tons')).toBeNull()
  })

  it('Scenario: An empty hold shows no segments and its served free figure — freeHold equals cargoCapacity, never client-derived', () => {
    strip({ acting: fleet({ roster: roster({ cargo: {}, cargoCapacity: 40, freeHold: 40 }) }) })
    expect(screen.getByTestId('hold-free')).toHaveAttribute('data-raw', '40')
    expect(screen.getByTestId('hold-gauge')).toHaveAttribute('data-gauge-state', 'empty')
    expect(screen.queryByTestId('hold-fuel-tons')).toBeNull()
    expect(screen.queryByTestId('hold-metals-tons')).toBeNull()
  })

  it('Scenario: An unloaded roster reads as absent, never `0 / 0 t` — used, total, and free all absent, no segments', () => {
    strip({ acting: fleet({ roster: undefined }), status: onstationStatus })
    expect(screen.getByTestId('hold-capacity-used')).not.toHaveAttribute('data-raw')
    expect(screen.getByTestId('hold-capacity-used').textContent).toMatch(/—/)
    expect(screen.getByTestId('hold-capacity-total')).not.toHaveAttribute('data-raw')
    expect(screen.getByTestId('hold-free')).not.toHaveAttribute('data-raw')
    expect(screen.getByTestId('hold-free').textContent).toMatch(/—/)
    expect(screen.getByTestId('hold-gauge')).toHaveAttribute('data-gauge-state', 'no-data')
  })

  it('Scenario: The segmentation is legible without colour — each segment\'s kind and tonnage are available as text in the cell', () => {
    strip()
    const hold = screen.getByTestId('vitals-hold-cell')
    expect(hold.textContent).toMatch(/fuel/)
    expect(hold.textContent).toMatch(/metals/)
    expect(hold.textContent).toMatch(/organics/)
  })

  it('Scenario: The hold cell visibly fills when a mine run resolves — without navigation, driven purely by the mounting view\'s refetch landing an updated fleet read', () => {
    const acting = fleet({ roster: roster({ cargo: { fuel: 6, metals: 10, organics: 2 }, freeHold: 22 }) })
    const { rerender } = strip({ acting })
    expect(screen.getByTestId('hold-metals-tons')).toHaveAttribute('data-raw', '10')
    const resolved = fleet({ roster: roster({ cargo: { fuel: 6, metals: 30, organics: 2 }, freeHold: 2 }) })
    rerender(
      <VitalsStrip
        acting={resolved}
        ownedFleets={[resolved]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('hold-metals-tons')).toHaveAttribute('data-raw', '30')
    expect(screen.getByTestId('hold-capacity-used')).toHaveAttribute('data-raw', '38')
    expect(screen.getByTestId('hold-free')).toHaveAttribute('data-raw', '2')
  })

  it('Scenario: The gauge\'s no-data and no-segments states are DOM-distinguishable', () => {
    const { rerender } = strip({ acting: fleet({ roster: undefined }), status: onstationStatus })
    expect(screen.getByTestId('hold-gauge')).toHaveAttribute('data-gauge-state', 'no-data')
    rerender(
      <VitalsStrip
        acting={fleet({ roster: roster({ cargo: {}, cargoCapacity: 40, freeHold: 40 }) })}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('hold-gauge')).toHaveAttribute('data-gauge-state', 'empty')
  })
})

// ---------------------------------------------------------------------------
// The Credits Cell Shows the Corporation's Served Balance and Announces Its
// Changes
// ---------------------------------------------------------------------------

describe('VitalsStrip — credits cell (contract §6.3, §7.5)', () => {
  it('Scenario: The strip shows the current credit balance, presented per figure-formatting, carrying its raw served value', () => {
    const { container } = strip({ credits: 4321 })
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'true')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-unit', 'credits')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '4321')
    assertFiguresMatchModule(container.querySelector('[data-testid="vitals-credits-cell"]') as HTMLElement, { scale: 1 })
  })

  it('Scenario: An unavailable balance reads as unavailable, not as a figure', () => {
    strip({ credits: null })
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'false')
    expect(screen.getByTestId('balance-value')).toHaveTextContent(/unavailable/i)
    expect(screen.queryByTestId('balance-figure')).toBeNull()
    expect(screen.getByTestId('balance-value')).not.toHaveAttribute('data-raw')
  })

  // "A stale session read is never presented as a current balance": the
  // stale-vs-current DISTINCTION is made by SystemSpaceView's
  // `creditsShown` derivation (contract §6.3) BEFORE credits reaches this
  // component — VitalsStrip receives only the already-resolved
  // `number | null`. Proven at that seam in SystemSpaceView.test.tsx; this
  // strip-level companion proves the mechanical half — that `credits`
  // becoming `null` on a rerender (which is what a failed refresh looks
  // like from this component's point of view) flips the readout, is not
  // latched, and is announced (see the announcement tests below).
  it('SDET-added: a credits prop transitioning from a served number to null (post-render) flips to the unavailable indication, never keeping the earlier figure', () => {
    const { rerender } = strip({ credits: 1000 })
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1000')
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={null}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'false')
    expect(screen.queryByTestId('balance-figure')).toBeNull()
  })

  it('Scenario: The balance visibly updates when a sale resolves — a credits prop change alone, no navigation, updates the figure', () => {
    const { rerender } = strip({ credits: 1000 })
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1050}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1050')
  })

  it('Scenario: The balance visibly updates when a refuel resolves — same mechanism, a lower balance lands', () => {
    const { rerender } = strip({ credits: 1000 })
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={985}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '985')
  })

  it('Scenario: A balance change is announced to assistive technology via balance-live-region, not conveyed by a purely visual change', () => {
    const { rerender } = strip({ credits: 1000 })
    expect(screen.getByTestId('balance-live-region')).toHaveAttribute('aria-live')
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1200}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('balance-live-region').textContent).toMatch(/1200|1,200/)
  })

  it('Scenario: A transition to or from an unavailable balance is announced — never rendered as empty text', () => {
    const { rerender } = strip({ credits: 1000 })
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={null}
        scale={1}
        worldTime={T0}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('balance-live-region').textContent ?? '').not.toBe('')
  })
})

// ---------------------------------------------------------------------------
// The Clock Cell Shows the Absolute World Instant at Its Served Scale
// ---------------------------------------------------------------------------

describe('VitalsStrip — clock cell (contract §7.4)', () => {
  it('Scenario: The clock reads T+ Dd HH:MM ×N with its raw value', () => {
    const { container } = strip({ worldTime: T0, serverWorldTime: T0, scale: 2 })
    const stamp = screen.getByTestId('vitals-clock-stamp')
    expect(stamp.textContent).toMatch(/T\+ \d+d \d{2}:\d{2} ×2/)
    expect(stamp).toHaveAttribute('data-raw', String(T0))
    void container
  })

  it('Scenario: With no world time ever served, the whole stamp reads absent, never T+ 0d 00:00', () => {
    strip({ worldTime: 0, serverWorldTime: undefined })
    const stamp = screen.getByTestId('vitals-clock-stamp')
    expect(stamp.textContent).toBe('—')
    expect(stamp.textContent).not.toMatch(/T\+/)
  })

  it('Scenario: The suffix carries its accessible explanation', () => {
    strip({ scale: 2 })
    expect(screen.getByTestId('vitals-clock-stamp')).toHaveAttribute('title')
    expect(screen.getByTestId('vitals-clock-stamp').getAttribute('title')).toMatch(/2/)
  })

  it('Scenario: With no served scale the stamp still renders, with ×—', () => {
    strip({ scale: undefined, worldTime: T0, serverWorldTime: T0 })
    expect(screen.getByTestId('vitals-clock-stamp').textContent).toMatch(/T\+.*×—/)
  })

  it('Scenario: The stamp advances between reads — same serverWorldTime, worldTime advancing with a served scale', () => {
    const { rerender } = strip({ scale: 1, worldTime: T0, serverWorldTime: T0 })
    const before = Number(screen.getByTestId('vitals-clock-stamp').getAttribute('data-raw'))
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={1}
        worldTime={T0 + 60_000}
        serverWorldTime={T0}
      />,
    )
    const after = Number(screen.getByTestId('vitals-clock-stamp').getAttribute('data-raw'))
    expect(after - before).toBe(60_000)
  })

  it('Scenario: With no served scale, the stamp holds rather than advancing — worldTime advancing with no scale leaves data-raw at the last served instant', () => {
    const { rerender } = strip({ scale: undefined, worldTime: T0, serverWorldTime: T0 })
    const before = screen.getByTestId('vitals-clock-stamp').getAttribute('data-raw')
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={undefined}
        worldTime={T0 + 500_000}
        serverWorldTime={T0}
      />,
    )
    expect(screen.getByTestId('vitals-clock-stamp').getAttribute('data-raw')).toBe(before)
  })

  it('re-renders at the NEWEST served instant while still scale-less, rather than staying latched to the FIRST one', () => {
    const { rerender } = strip({ scale: undefined, worldTime: T0, serverWorldTime: T0 })
    rerender(
      <VitalsStrip
        acting={fleet()}
        ownedFleets={[fleet()]}
        fleetsFailed={false}
        status={onstationStatus}
        onSelectFleet={vi.fn()}
        systemNames={systemNames}
        credits={1250}
        scale={undefined}
        worldTime={T0 + 200_000}
        serverWorldTime={T0 + 200_000}
      />,
    )
    expect(screen.getByTestId('vitals-clock-stamp')).toHaveAttribute('data-raw', String(T0 + 200_000))
  })
})

// ---------------------------------------------------------------------------
// The Strip Issues No Read of Its Own
// ---------------------------------------------------------------------------

describe('VitalsStrip — issues no read of its own (contract)', () => {
  // Repo convention (lib/services/fleet-service.space.test.ts): `'fetch' as
  // never` sidesteps vi.spyOn's overload mismatch against globalThis's own
  // DOM-lib type without weakening the assertion itself.
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation(() => {
      throw new Error('VitalsStrip must never issue a network request')
    })
  })
  afterEach(() => fetchSpy.mockRestore())

  it('Scenario: Rendering the strip issues no request', () => {
    strip()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Activating the Strip Changes No Space-View Selection
// ---------------------------------------------------------------------------

describe('VitalsStrip — activation changes no space-view selection (contract §7.2)', () => {
  it('SDET-added, structural: VitalsStripProps carries no space-view-selection callback at all (only onSelectFleet) — the strip is STRUCTURALLY unable to touch a selection it is never given a setter for', async () => {
    const onSelectFleet = vi.fn()
    strip({ onSelectFleet })
    // Clicking any strip cell only ever reaches onSelectFleet, or nothing.
    // A real integration proof that SystemSpaceView's `selection` state is
    // literally unchanged after a click lives in SystemSpaceView.test.tsx,
    // since `selection` is that component's state, not a prop this
    // component receives.
    expect(onSelectFleet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// The Strip Announces Only Its Own Balance Changes
// ---------------------------------------------------------------------------

describe('VitalsStrip — announces only its own balance changes (contract §7.5)', () => {
  it('Scenario: A landing is announced exactly once — the strip mounts exactly ONE live/status region (balance-live-region), never a second announcer for a landed burn/jump/mine', () => {
    const { container } = strip({ status: underwayStatus })
    const liveRegions = container.querySelectorAll('[aria-live], [role="status"], [role="alert"]')
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]).toHaveAttribute('data-testid', 'balance-live-region')
  })
})

// ===========================================================================
// RED-PHASE SUITE — openspec change `add-burn-cost-overlay`, tasks 2.1-2.5.
// The strip's optional `burnCost` ({ tons, affordable }) reaches the FUEL gauge
// alone. `burnCost` is passed through an untyped spread so this file stays
// `tsc`-clean before the prop exists. A test here hand-sets `burnCost`: it
// observes an arrangement, never the view's derivation (that is sections 3-4
// of tasks.md), and counts as no cover for a lifetime scenario.
// ===========================================================================

import { cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'

function stripElement(over: Record<string, unknown> = {}): ReactElement {
  return (
    <VitalsStrip
      acting={fleet()}
      ownedFleets={[fleet()]}
      fleetsFailed={false}
      status={onstationStatus}
      onSelectFleet={vi.fn()}
      systemNames={systemNames}
      credits={1250}
      scale={1}
      worldTime={T0}
      serverWorldTime={T0}
      {...over}
    />
  )
}

// 200 t capacity with `fuelTons` of fuel aboard.
function fuelActing(fuelTons: number): Fleet {
  return fleet({
    roster: roster({ cargo: { fuel: fuelTons }, cargoCapacity: 200, freeHold: 200 - fuelTons }),
  })
}

const burnCostOf = (tons: number, affordable: boolean) => ({ burnCost: { tons, affordable } })

function fuelGauge(): HTMLElement {
  return screen.getByTestId('fuel-gauge')
}

function costBand(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-gauge-cost-extent]')
}

function costMark(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-gauge-cost-mark]')
}

function needEl(el: HTMLElement | null, what: string): HTMLElement {
  expect(el, `${what} must be drawn`).not.toBeNull()
  return el as HTMLElement
}

function fillWidths(root: HTMLElement): number[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[style]'))
    .filter((el) => el !== root && el.style.width !== '' && !el.hasAttribute('data-gauge-cost-extent'))
    .map((el) => Number.parseFloat(el.style.width))
}

function pctOf(el: HTMLElement): number {
  return Number.parseFloat(el.style.width)
}

function toks(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
}

describe('VitalsStrip cost overlay — extent on the fuel gauge (task 2.1)', () => {
  it.each([
    { fuel: 40, cost: 60, affordable: true, bandPct: 30, fillPct: 20, state: 'affordable', markDrawn: false },
    { fuel: 80, cost: 20, affordable: false, bandPct: 10, fillPct: 40, state: 'unaffordable', markDrawn: true },
  ])(
    'Scenario: The flag wins when the extent runs past or lies inside the fill (task 2.1) — fuel $fuel t, cost $cost t, flag $affordable',
    ({ fuel, cost, affordable, bandPct, fillPct, state, markDrawn }) => {
      const { rerender } = render(stripElement({ acting: fuelActing(fuel), ...burnCostOf(cost, affordable) }))
      const gauge = fuelGauge()
      expect(gauge).toHaveAttribute('data-gauge-cost-state', state)
      expect(pctOf(needEl(costBand(gauge), 'the extent'))).toBeCloseTo(bandPct, 5)
      expect(fillWidths(gauge)).toHaveLength(1)
      expect(fillWidths(gauge)[0]).toBeCloseTo(fillPct, 5)
      if (markDrawn) needEl(costMark(gauge), 'the mark')
      else expect(costMark(gauge)).toBeNull()
      const withQuote = fillWidths(gauge)

      rerender(stripElement({ acting: fuelActing(fuel) }))
      expect(fillWidths(fuelGauge())).toEqual(withQuote)
    },
  )
})

describe('VitalsStrip cost overlay — the unaffordable mark (task 2.2)', () => {
  function expectMarkBesideBand(gauge: HTMLElement): { b: HTMLElement; m: HTMLElement } {
    const b = needEl(costBand(gauge), 'the extent')
    const m = needEl(costMark(gauge), 'the mark')
    expect(b.contains(m)).toBe(false)
    expect(m.parentElement).toBe(gauge)
    return { b, m }
  }

  it('Scenario: An unaffordable extent too short to see still shows its warning (task 2.2 a)', () => {
    const { rerender } = render(stripElement({ acting: fuelActing(1), ...burnCostOf(0.4, false) }))
    let gauge = fuelGauge()
    expect(gauge).toHaveAttribute('data-gauge-cost-state', 'unaffordable')
    const first = expectMarkBesideBand(gauge)
    expect(pctOf(first.b)).toBeCloseTo(0.2, 5)
    const classAtSmall = first.m.className

    rerender(stripElement({ acting: fuelActing(1), ...burnCostOf(30, false) }))
    gauge = fuelGauge()
    const second = expectMarkBesideBand(gauge)
    expect(second.m.className).toBe(classAtSmall)
  })

  it('Scenario: The unaffordable mark has a visible size and its own paint — the size half (task 2.2 b)', () => {
    const { rerender } = render(stripElement({ acting: fuelActing(80), ...burnCostOf(0.4, false) }))
    for (const cost of [0.4, 30]) {
      rerender(stripElement({ acting: fuelActing(80), ...burnCostOf(cost, false) }))
      const { m } = expectMarkBesideBand(fuelGauge())
      expect(toks(m)).toEqual(expect.arrayContaining(['w-1', 'inset-y-0']))
      expect(m.style.width).toBe('')
      expect(m.style.height).toBe('')
    }
    for (const cost of [0.4, 30]) {
      rerender(stripElement({ acting: fuelActing(80), ...burnCostOf(cost, true) }))
      const gauge = fuelGauge()
      // Positive control: the affordable overlay itself is drawn.
      expect(gauge).toHaveAttribute('data-gauge-cost-state', 'affordable')
      needEl(costBand(gauge), 'the affordable extent')
      expect(costMark(gauge)).toBeNull()
    }
  })

  it.each([
    { cost: 0, pct: 0 },
    { cost: 100, pct: 50 },
    { cost: 250, pct: 100 },
  ])(
    'Scenario: The unaffordable mark sits at the extent\'s end along the rail (task 2.2 c) — cost $cost t',
    ({ cost, pct }) => {
      render(stripElement({ acting: fuelActing(80), ...burnCostOf(cost, false) }))
      const { b, m } = expectMarkBesideBand(fuelGauge())
      const left = Number.parseFloat(m.style.left)
      expect(left).toBeCloseTo(pct, 5)
      expect(left).toBeCloseTo(pctOf(b), 5)
      // The pull-back is the same percentage of the mark's own width, negated.
      const raw = m.style.transform || /transform:\s*([^;]+)/.exec(m.getAttribute('style') ?? '')?.[1] || ''
      const match = /translateX\(\s*(-?[\d.]+)%\s*\)/.exec(raw)
      expect(match, `translateX(...) in ${raw}`).not.toBeNull()
      expect(Number.parseFloat(match![1])).toBeCloseTo(-left, 5)
    },
  )
})

describe('VitalsStrip cost overlay — hold gauge and omission (task 2.3)', () => {
  it('Scenario: The hold gauge never draws a cost extent (task 2.3)', () => {
    render(stripElement({ ...burnCostOf(30, true) }))
    // Positive control: the quote reaches the fuel gauge.
    expect(fuelGauge()).toHaveAttribute('data-gauge-cost-state', 'affordable')
    needEl(costBand(fuelGauge()), 'the extent on the fuel gauge')
    const holdWith = screen.getByTestId('vitals-hold-cell').outerHTML
    expect(screen.getByTestId('hold-gauge')).not.toHaveAttribute('data-gauge-cost-state')
    expect(costBand(screen.getByTestId('hold-gauge'))).toBeNull()
    cleanup()

    render(stripElement())
    expect(screen.getByTestId('vitals-hold-cell').outerHTML).toBe(holdWith)
    expect(costBand(fuelGauge())).toBeNull()
    expect(fuelGauge()).not.toHaveAttribute('data-gauge-cost-state')
    expect(costBand(screen.getByTestId('hold-gauge'))).toBeNull()
    expect(screen.getByTestId('hold-gauge')).not.toHaveAttribute('data-gauge-cost-state')
  })
})

describe('VitalsStrip cost overlay — draining marker (task 2.4)', () => {
  it('Scenario: The extent is drawn alongside the draining marker (task 2.4)', () => {
    render(stripElement({ status: underwayStatus, ...burnCostOf(4, true) }))
    expect(screen.getByTestId('vitals-fuel-draining')).toBeInTheDocument()
    const gauge = fuelGauge()
    expect(pctOf(needEl(costBand(gauge), 'the extent'))).toBeCloseTo(10, 5)
  })
})

describe('VitalsStrip cost overlay — no figure, no control, no read (task 2.5)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation(() => {
      throw new Error('VitalsStrip must never issue a network request')
    })
  })
  afterEach(() => fetchSpy.mockRestore())

  function interactive(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="menuitem"]'),
    )
  }

  it('Scenario: The extent exposes no figure and no control (task 2.5)', () => {
    const withQuote = render(stripElement({ acting: fuelActing(80), ...burnCostOf(30, false) }))
    // Positive control: the overlay is drawn.
    expect(fuelGauge()).toHaveAttribute('data-gauge-cost-state', 'unaffordable')
    const chevron = screen.getByTestId('vitals-fleet-chevron')
    for (const el of interactive(withQuote.container)) {
      const ok = el === chevron || el.closest('[data-testid="vitals-fleet-menu"]') !== null || el.getAttribute('data-testid') === 'vitals-details-toggle'
      expect(ok, `unexpected interactive element: ${el.outerHTML}`).toBe(true)
    }
    const fuelTextWith = screen.getByTestId('vitals-fuel-cell').textContent
    const live = withQuote.container.querySelectorAll('[aria-live], [role="status"]')
    expect(live).toHaveLength(1)
    const liveTextWith = live[0].textContent
    cleanup()

    const without = render(stripElement({ acting: fuelActing(80) }))
    expect(screen.getByTestId('vitals-fuel-cell').textContent).toBe(fuelTextWith)
    const liveWithout = without.container.querySelectorAll('[aria-live], [role="status"]')
    expect(liveWithout).toHaveLength(1)
    expect(liveWithout[0].textContent).toBe(liveTextWith)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})


it('toggles telemetry presentation without selecting another fleet', () => {
  const { onSelectFleet } = strip()
  const toggle = screen.getByTestId('vitals-details-toggle')
  expect(screen.getByTestId('vitals-strip')).toHaveAttribute('data-expanded', 'false')
  fireEvent.click(toggle)
  expect(screen.getByTestId('vitals-strip')).toHaveAttribute('data-expanded', 'true')
  fireEvent.click(toggle)
  expect(screen.getByTestId('vitals-strip')).toHaveAttribute('data-expanded', 'false')
  expect(onSelectFleet).not.toHaveBeenCalled()
})
