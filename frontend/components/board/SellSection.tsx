'use client'

// SellSection (#0011) — the sell offer on a fleet docked at a trading station.
//
// Anchored to the DOCKED state, never a selection, exactly as the mine offer is:
// you can only sell where the goods physically are. Mass moves in a hold; the
// credits it converts to move instantly.

import { useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { foldSale, firstTonPrice } from '@/lib/market/fold'
import type { Quote } from '@/lib/types/market'
import type { FleetRoster } from '@/lib/types/fleet'
import type { ResourceKind } from '@/lib/types/system-board'

export interface SellSectionProps {
  // The station's live quotes, one per tradable kind.
  quotes: Quote[]
  roster: FleetRoster
  pending: boolean
  // Commit. The panel owns the gesture; the parent owns the mutation and its
  // operation key.
  onSell: (kind: ResourceKind, tons: number, expectedUnitPrice: number) => void
  // A "price changed" rejection re-prices the offer rather than freezing a
  // stale, un-committable one on screen after a multi-minute haul. Carries the
  // price the player HAD expected, so the change is legible.
  repricedFrom?: number | null
}

export function SellSection({
  quotes,
  roster,
  pending,
  onSell,
  repricedFrom = null,
}: SellSectionProps) {
  // Memoised: `roster.cargo ?? {}` would mint a fresh object on every render,
  // so every memo downstream of it would recompute every time.
  const held = useMemo(() => roster.cargo ?? {}, [roster.cargo])

  // Only kinds the fleet actually holds AND this station buys. A kind with no
  // configured floor here is not tradable at all, so offering it would set the
  // player up for a rejection.
  const sellable = useMemo(
    () =>
      quotes
        .filter((q) => (held[q.kind] ?? 0) > 0 && firstTonPrice(q.entries) > 0)
        .sort((a, b) => (held[b.kind] ?? 0) - (held[a.kind] ?? 0)),
    [quotes, held],
  )

  // Default to the greatest tonnage among eligible kinds — the one the player
  // most likely came to sell.
  const [kind, setKind] = useState<ResourceKind | null>(null)
  const activeKind = kind && sellable.some((q) => q.kind === kind) ? kind : (sellable[0]?.kind ?? null)

  const heldTons = activeKind ? (held[activeKind] ?? 0) : 0
  const [tons, setTons] = useState<number>(heldTons)

  // Re-default the tonnage when the kind (or what's aboard) changes, so the
  // input never proposes more than the hold carries.
  const lastKind = useRef<ResourceKind | null>(activeKind)
  useEffect(() => {
    if (lastKind.current !== activeKind) {
      lastKind.current = activeKind
      setTons(heldTons)
    } else if (tons > heldTons) {
      setTons(heldTons)
    }
  }, [activeKind, heldTons, tons])

  const clampTons = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), heldTons)

  const entries = useMemo(
    () => quotes.find((q) => q.kind === activeKind)?.entries ?? [],
    [quotes, activeKind],
  )

  // The live proceeds preview, folded across the station's demand exactly as the
  // server will fold it — the two are pinned to one shared fixture, so this
  // number IS what settles.
  const preview = useMemo(() => foldSale(entries, tons), [entries, tons])
  const quotedFirstTon = firstTonPrice(entries)

  // A sale whose proceeds round to zero is refused server-side, so the control
  // must not offer it.
  const committable = tons > 0 && preview.totalProceeds > 0 && !pending && !!activeKind

  if (!activeKind) {
    return (
      <div data-testid="sell-section-empty" className="mt-3 border-t border-dashed border-white/15 pt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
            Sell cargo
          </span>
          <Badge color="cyan">DOCKED</Badge>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          {Object.keys(held).length === 0
            ? 'Your hold is empty — mine something to sell.'
            : 'This station does not buy anything in your hold.'}
        </p>
      </div>
    )
  }

  return (
    <div data-testid="sell-section" className="mt-3 border-t border-dashed border-white/15 pt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
          Sell cargo
        </span>
        <Badge color="cyan">DOCKED</Badge>
      </div>

      {repricedFrom !== null && (
        // Both figures, so a re-priced offer explains itself rather than just
        // silently changing under the player.
        <p data-testid="sell-repriced" role="status" className="mt-2 text-[11px] text-amber-300/90">
          Price moved: {repricedFrom} → {quotedFirstTon} cr/t. Review and commit again.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {sellable.map((q) => {
          const selected = q.kind === activeKind
          return (
            <button
              key={q.kind}
              type="button"
              data-testid={`sell-kind-${q.kind}`}
              aria-pressed={selected}
              onClick={() => setKind(q.kind)}
              className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300'
                  : 'border-white/15 text-zinc-400 hover:border-white/30 hover:text-zinc-200'
              }`}
            >
              {q.kind}{' '}
              <span className={selected ? 'text-cyan-400/80' : 'text-zinc-500'}>
                {(held[q.kind] ?? 0).toFixed(1)}t
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="relative flex-1">
          <Input
            data-testid="sell-tons-input"
            type="number"
            min={0}
            max={heldTons}
            value={tons}
            onChange={(e) => setTons(clampTons(Number(e.target.value)))}
            aria-label="Tons to sell"
            className="[&_input]:pr-7 [&_input]:text-right [&_input]:font-mono"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center font-mono text-xs text-zinc-500">
            t
          </span>
        </span>
        <Button
          plain
          data-testid="sell-all"
          disabled={pending}
          onClick={() => setTons(heldTons)}
          className="!font-mono !text-[10px] tracking-wide !text-zinc-500 uppercase hover:!text-cyan-300"
        >
          all
        </Button>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span data-testid="sell-proceeds" className="font-mono text-sm text-zinc-200 tabular-nums">
          {preview.totalProceeds} cr
        </span>
        <span className="font-mono text-[11px] text-zinc-500">
          {quotedFirstTon} cr/t
        </span>
      </div>

      {preview.fills.length > 1 && (
        // A split fill is shown per portion rather than blended, so the player
        // can see the premium running out mid-sale.
        <ul data-testid="sell-fill-breakdown" className="mt-1 flex flex-col gap-0.5">
          {preview.fills.map((f, i) => (
            <li key={i} className="flex justify-between font-mono text-[10px] text-zinc-500">
              <span>
                {f.source === 'request' ? '★ request' : '· floor'} {f.tons.toFixed(1)}t @{' '}
                {f.unitPrice}
              </span>
              <span className="tabular-nums">{f.proceeds} cr</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        <Button
          data-testid="sell-button"
          color="cyan"
          disabled={!committable}
          onClick={() => onSell(activeKind, tons, quotedFirstTon)}
        >
          {pending ? 'Selling…' : 'Sell'}
        </Button>
      </div>

      {tons > 0 && preview.totalProceeds === 0 && (
        <p data-testid="sell-dust-warning" className="mt-1 text-[11px] text-zinc-500">
          That amount is worth less than one credit here.
        </p>
      )}
    </div>
  )
}
