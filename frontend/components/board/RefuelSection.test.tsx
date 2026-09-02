// RED-phase suite for RefuelSection — add-fuel-as-cargo tasks.md 8.4
// (board-view ADDED "Refuel Offer on the Docked Fleet").
//
// `RefuelSection.tsx` DOES NOT EXIST YET. This file is expected to fail at
// module resolution ("Failed to resolve import") until the developer
// creates it — the same accepted red reason this repo's own history uses
// for a wholly new leaf component (SellSection.tsx/SellSection.test.tsx and
// roster-status.ts/roster-status.test.ts both landed test+impl together;
// see this SDET's handoff report for the full reasoning). Once the file
// exists, these assertions are the real, meaningful red/green boundary.
//
// Mirrors SellSection.test.tsx's shape and level: this component owns ONLY
// its own presentational logic (default tonnage, clamping, the live cost
// preview) — the GATING decision ("is this fleet docked at a station at
// all") is FactsPanel's concern (see FactsPanel.test.tsx), and the actual
// commit/mutation/operation-key plumbing is the container's (see
// SystemBoardView.test.tsx and hooks/use-refuel.test.tsx for the
// double-submit mechanism itself).
//
// CONTRACT ASSUMED BY THIS SDET (confirm against the backend SDET's
// fuel-purchase/fleet-movement contracts before implementing):
//
//   export interface RefuelSectionProps {
//     roster: FleetRoster       // for freeHold (roster.freeHold)
//     pricePerTon: number       // the SERVED price (fleet-movement "Fleet
//                               // Read Serves the Configured Fuel Price,
//                               // Never Duplicated Client-Side") — this
//                               // component must multiply by THIS value,
//                               // never a locally-declared constant.
//     balance: number | null    // the requester's current credit balance
//     pending: boolean
//     onRefuel: (tons: number) => void
//   }
//
// testids: refuel-section, refuel-tons-input, refuel-cost-preview,
// refuel-button. If the developer's real shape differs, only these
// literals need updating — the scenarios pinned below are the spec.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefuelSection } from './RefuelSection'
import type { FleetRoster } from '@/lib/types/fleet'

function roster(freeHold: number): FleetRoster {
  return {
    ships: [{ class: 'seed' }],
    cargo: { fuel: 10 },
    cargoCapacity: 200,
    freeHold,
    miningRate: 0,
  } as FleetRoster
}

describe('RefuelSection (board-view ADDED "Refuel Offer on the Docked Fleet")', () => {
  // Scenario: Refuel is offered while docked at a station — this
  // component's own half: given it is mounted at all, it presents a
  // tonnage input and a cost preview (the GATING decision of whether to
  // mount it lives in FactsPanel.test.tsx).
  it('presents a tonnage input and a cost preview', () => {
    render(
      <RefuelSection roster={roster(100)} pricePerTon={10} balance={1000} pending={false} onRefuel={vi.fn()} />,
    )
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
    expect(screen.getByTestId('refuel-tons-input')).toBeInTheDocument()
    expect(screen.getByTestId('refuel-cost-preview')).toBeInTheDocument()
  })

  // Scenario: The default tonnage is capped by affordability, not only by
  // free hold.
  it('defaults the tonnage to what the balance affords when that is less than the free hold', () => {
    // freeHold=100, but balance (500) ÷ price (10) = 50 affordable tons —
    // the default must be the SMALLER, affordable figure, not the hold.
    render(
      <RefuelSection roster={roster(100)} pricePerTon={10} balance={500} pending={false} onRefuel={vi.fn()} />,
    )
    expect(screen.getByTestId('refuel-tons-input')).toHaveValue(50)
  })

  // The inverse case (SDET-added boundary): when the free hold is the
  // SMALLER figure, the default is the hold, not the (larger) affordable
  // amount — proving the default is a genuine min(), not just "always
  // afford", ability.
  it('defaults the tonnage to the free hold when that is less than what the balance affords', () => {
    render(
      <RefuelSection roster={roster(20)} pricePerTon={10} balance={5000} pending={false} onRefuel={vi.fn()} />,
    )
    expect(screen.getByTestId('refuel-tons-input')).toHaveValue(20)
  })

  // Scenario: Tonnage input clamps to the fleet's free hold.
  it('clamps a typed tonnage to the fleet’s current free hold', async () => {
    render(
      <RefuelSection roster={roster(30)} pricePerTon={10} balance={5000} pending={false} onRefuel={vi.fn()} />,
    )
    const input = screen.getByTestId('refuel-tons-input')
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    expect(input).toHaveValue(30)
  })

  // Scenario: The cost preview reflects the server-served fuel price, not a
  // client-maintained constant. 37 is a deliberately "unusual" price — a
  // client accidentally hardcoding a different constant (e.g. a leftover
  // 10 from copy-pasting the mine/sell offers) would fail this exact
  // number.
  it('previews the cost as tonnage × the SERVED price — never a client-maintained constant', async () => {
    render(
      <RefuelSection roster={roster(100)} pricePerTon={37} balance={10_000} pending={false} onRefuel={vi.fn()} />,
    )
    const input = screen.getByTestId('refuel-tons-input')
    await userEvent.clear(input)
    await userEvent.type(input, '10')
    expect(screen.getByTestId('refuel-cost-preview')).toHaveTextContent('370')
  })

  it('updates the preview live as the tonnage input changes', async () => {
    render(
      <RefuelSection roster={roster(100)} pricePerTon={5} balance={10_000} pending={false} onRefuel={vi.fn()} />,
    )
    const input = screen.getByTestId('refuel-tons-input')
    await userEvent.clear(input)
    await userEvent.type(input, '4')
    expect(screen.getByTestId('refuel-cost-preview')).toHaveTextContent('20')
    await userEvent.clear(input)
    await userEvent.type(input, '8')
    expect(screen.getByTestId('refuel-cost-preview')).toHaveTextContent('40')
  })

  // Commit gesture: the panel owns the chosen tonnage; the container owns
  // the mutation/operation key (mirrors SellSection's own "commits the
  // kind, tonnage ... as the guard" precedent).
  it('commits the currently entered tonnage via onRefuel', async () => {
    const onRefuel = vi.fn()
    render(
      <RefuelSection roster={roster(100)} pricePerTon={10} balance={10_000} pending={false} onRefuel={onRefuel} />,
    )
    const input = screen.getByTestId('refuel-tons-input')
    await userEvent.clear(input)
    await userEvent.type(input, '15')
    await userEvent.click(screen.getByTestId('refuel-button'))
    expect(onRefuel).toHaveBeenCalledWith(15)
  })

  // board-view ADDED "Refuel Control Guards Against Double-Submit" — this
  // component's half of the guard: disabled from the moment its container
  // marks it pending. (The mechanism that GENUINELY exercises isPending's
  // synchronous flip under a real double-click lives in
  // hooks/use-refuel.test.tsx — a mocked `pending` boolean here can only
  // prove the control OBEYS the flag, not that the flag flips in time.)
  it('disables the control while a refuel is in flight', () => {
    render(
      <RefuelSection roster={roster(100)} pricePerTon={10} balance={10_000} pending={true} onRefuel={vi.fn()} />,
    )
    expect(screen.getByTestId('refuel-button')).toBeDisabled()
  })

  // SDET-added boundary probe: a zero balance affords zero tons — the
  // default must not go negative or NaN.
  it('defaults to zero tonnage when the balance affords nothing', () => {
    render(
      <RefuelSection roster={roster(100)} pricePerTon={10} balance={0} pending={false} onRefuel={vi.fn()} />,
    )
    expect(screen.getByTestId('refuel-tons-input')).toHaveValue(0)
  })
})
