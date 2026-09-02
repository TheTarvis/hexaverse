'use client'

// RefuelSection (add-fuel-as-cargo tasks.md 8.4; board-view ADDED "Refuel
// Offer on the Docked Fleet") — the fuel-purchase offer on a fleet docked at
// a trading station, mirroring SellSection's own shape and level: this
// component owns ONLY its own presentational logic (default tonnage,
// clamping, the live cost preview). The GATING decision ("is this fleet
// docked at a station at all") is FactsPanel's concern, and the actual
// commit/mutation/operation-key plumbing is the container's.

import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import type { FleetRoster } from '@/lib/types/fleet'

export interface RefuelSectionProps {
  roster: FleetRoster
  // The SERVED price (fleet-movement "Fleet Read Serves the Configured Fuel
  // Price, Never Duplicated Client-Side") — this component multiplies by
  // THIS value, never a locally-declared constant.
  pricePerTon: number
  // The requester's current credit balance.
  balance: number | null
  pending: boolean
  // Commit. The panel owns the chosen tonnage; the container owns the
  // mutation and its operation key.
  onRefuel: (tons: number) => void
}

export function RefuelSection({ roster, pricePerTon, balance, pending, onRefuel }: RefuelSectionProps) {
  const freeHold = Math.max(0, roster.freeHold)
  // The default tonnage is capped by affordability, not only by free hold —
  // whichever figure is smaller. Floored: a fractional default tonnage
  // reads oddly and could itself round up to something the balance no
  // longer affords. A `null` balance (not yet loaded) is UNKNOWN, not
  // known-zero — it defaults to the free hold rather than affording
  // nothing, so the offer is still usable before the balance read resolves.
  const affordable =
    balance === null ? freeHold : pricePerTon > 0 ? Math.max(0, Math.floor(balance / pricePerTon)) : 0
  const defaultTons = Math.max(0, Math.min(freeHold, affordable))

  const [tons, setTons] = useState<number>(defaultTons)
  const lastDefaultRef = useRef(defaultTons)
  useEffect(() => {
    if (lastDefaultRef.current !== defaultTons) {
      lastDefaultRef.current = defaultTons
      setTons(defaultTons)
    } else if (tons > freeHold) {
      setTons(freeHold)
    }
  }, [defaultTons, freeHold, tons])

  const clampTons = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), freeHold)

  // Rounded up, mirroring the server's own "rounds against the buyer" rule
  // (fuel-purchase "Cost Arithmetic Rounds Against the Buyer") — the preview
  // must never promise a cheaper price than what settles.
  const preview = Math.ceil(tons * pricePerTon)

  const committable = tons > 0 && !pending

  return (
    <div data-testid="refuel-section" className="mt-3 border-t border-dashed border-white/15 pt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
          Refuel
        </span>
        <Badge color="cyan">DOCKED</Badge>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="relative flex-1">
          <Input
            data-testid="refuel-tons-input"
            type="number"
            min={0}
            max={freeHold}
            value={tons}
            onChange={(e) => setTons(clampTons(Number(e.target.value)))}
            aria-label="Tons of fuel to buy"
            className="[&_input]:pr-7 [&_input]:text-right [&_input]:font-mono"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center font-mono text-xs text-zinc-500">
            t
          </span>
        </span>
        <Button
          plain
          data-testid="refuel-fill-hold"
          disabled={pending}
          onClick={() => setTons(defaultTons)}
          className="!px-1.5 !text-xs !text-zinc-400 hover:!text-cyan-300"
        >
          Fill
        </Button>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span data-testid="refuel-cost-preview" className="font-mono text-sm text-zinc-200 tabular-nums">
          {preview} cr
        </span>
        <span className="font-mono text-[11px] text-zinc-500">{pricePerTon} cr/t</span>
      </div>

      <div className="mt-2">
        <Button
          data-testid="refuel-button"
          color="cyan"
          disabled={!committable}
          onClick={() => onRefuel(tons)}
        >
          {pending ? 'Refueling…' : 'Refuel'}
        </Button>
      </div>
    </div>
  )
}
