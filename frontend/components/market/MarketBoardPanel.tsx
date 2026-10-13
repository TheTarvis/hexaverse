'use client'

// MarketBoardPanel (#0011) — the remote price board: every station the requester
// has charted, ranked by what it pays for one resource kind.
//
// A SHARED panel with two mount points (the galaxy view and the station
// inspector), mirroring fleet-roster's shared-panel/delegated-selection shape:
// this component owns ranking and presentation, and the mounting view owns what
// a row selection MEANS. That is why it takes onSelectSystem rather than
// reaching for a router or a selection store.

import { HudPanel } from '@/components/hud/GameHud'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/catalyst/badge'
import { Text } from '@/components/catalyst/text'
import { bestPriceFor } from '@/lib/market/fold'
import type { MarketBoard, VenueQuotes } from '@/lib/types/market'
import type { ResourceKind } from '@/lib/types/system-space'

export interface MarketBoardPanelProps {
  board: MarketBoard | undefined
  isLoading?: boolean
  isError?: boolean
  // The system the player is currently at, if any. Its price is the baseline the
  // spread is measured against — "+40% three lanes over" only means something
  // relative to where you are.
  homeSystemId?: string | null
  // Delegated to the mounting view: the galaxy view focuses the system, the
  // station inspector selects it. This panel never decides.
  onSelectSystem?: (systemId: string) => void
}

interface Row {
  systemId: string
  price: number
  // Whether the top price at this venue comes from a finite premium request or
  // from the floor — the distinction a player is deciding on.
  fromRequest: boolean
  remaining: number | null
  spreadPct: number | null
}

export function MarketBoardPanel({
  board,
  isLoading = false,
  isError = false,
  homeSystemId = null,
  onSelectSystem,
}: MarketBoardPanelProps) {
  const kinds = useMemo(() => kindsOn(board), [board])
  const [kind, setKind] = useState<ResourceKind | null>(null)
  const activeKind = kind && kinds.includes(kind) ? kind : (kinds[0] ?? null)

  const rows = useMemo(() => rank(board, activeKind, homeSystemId), [board, activeKind, homeSystemId])

  if (isLoading) {
    return (
      <HudPanel data-testid="market-board-panel" className="p-3">
        <Header />
        <Text data-testid="market-board-loading" className="!text-zinc-500">
          Reading the market…
        </Text>
      </HudPanel>
    )
  }

  if (isError) {
    return (
      <HudPanel data-testid="market-board-panel" className="p-3">
        <Header />
        <Text data-testid="market-board-error" className="!text-zinc-500">
          Market data is unavailable right now.
        </Text>
      </HudPanel>
    )
  }

  if (!activeKind || rows.length === 0) {
    return (
      <HudPanel data-testid="market-board-panel" className="p-3">
        <Header />
        <Text data-testid="market-board-empty" className="!text-zinc-500">
          No charted stations yet. Scan a neighbouring system to find one.
        </Text>
      </HudPanel>
    )
  }

  return (
    <HudPanel data-testid="market-board-panel" className="p-3">
      <Header />

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Resource kind">
        {kinds.map((k) => {
          const selected = k === activeKind
          return (
            <button
              key={k}
              type="button"
              data-testid={`market-kind-${k}`}
              aria-pressed={selected}
              onClick={() => setKind(k)}
              className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/15 dark:text-zinc-400 dark:hover:border-white/30'
              }`}
            >
              {k}
            </button>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-col gap-1" data-testid="market-board-rows">
        {rows.map((row) => (
          <li key={row.systemId}>
            <button
              type="button"
              data-testid={`market-row-${row.systemId}`}
              onClick={() => onSelectSystem?.(row.systemId)}
              disabled={!onSelectSystem}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-zinc-200 disabled:cursor-default dark:hover:bg-white/[0.14]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-xs text-zinc-900 dark:text-white">
                  {row.systemId}
                </span>
                {row.systemId === homeSystemId && (
                  <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                    here
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                {/* The request-vs-floor distinction is carried by an icon AND a
                    label, never by colour alone — a colour-only cue is invisible
                    to a colourblind player and to a screen reader. */}
                <Badge color={row.fromRequest ? 'amber' : 'zinc'}>
                  <span aria-hidden="true">{row.fromRequest ? '★' : '·'}</span>{' '}
                  {row.fromRequest ? 'request' : 'floor'}
                </Badge>
                <span
                  data-testid={`market-price-${row.systemId}`}
                  className="font-mono text-xs text-zinc-900 tabular-nums dark:text-white"
                >
                  {row.price} cr/t
                </span>
                {row.spreadPct !== null && (
                  // The spread is surfaced as a figure, not left as two numbers
                  // for the player to subtract.
                  <span
                    data-testid={`market-spread-${row.systemId}`}
                    className={`font-mono text-xs tabular-nums ${
                      row.spreadPct > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-500'
                    }`}
                  >
                    {row.spreadPct > 0 ? '+' : ''}
                    {row.spreadPct}%
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </HudPanel>
  )
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11px] font-medium tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
        Market
      </span>
    </div>
  )
}

function kindsOn(board: MarketBoard | undefined): ResourceKind[] {
  const seen = new Set<ResourceKind>()
  for (const venue of board?.venues ?? []) {
    for (const quote of venue.quotes) seen.add(quote.kind)
  }
  return [...seen].sort()
}

// rank orders venues by what they pay for `kind`, best first, and computes each
// one's spread against the player's current location.
function rank(
  board: MarketBoard | undefined,
  kind: ResourceKind | null,
  homeSystemId: string | null,
): Row[] {
  if (!board || !kind) return []

  const priceOf = (venue: VenueQuotes | undefined) => {
    if (!venue) return null
    const quote = venue.quotes.find((q) => q.kind === kind)
    if (!quote) return null
    const price = bestPriceFor(quote.entries)
    const top = quote.entries.find((e) => (e.unlimited ? true : (e.remainingQuantity ?? 0) > 0))
    return {
      price,
      fromRequest: top?.source === 'request',
      remaining: top?.unlimited ? null : (top?.remainingQuantity ?? null),
    }
  }

  const here = homeSystemId
    ? (priceOf(board.venues.find((v) => v.systemId === homeSystemId))?.price ??
      null)
    : null

  const rows: Row[] = []
  for (const venue of board.venues) {
    const p = priceOf(venue)
    if (!p || p.price <= 0) continue
    rows.push({
      systemId: venue.systemId,
      price: p.price,
      fromRequest: p.fromRequest,
      remaining: p.remaining,
      spreadPct: here && here > 0 ? Math.round(((p.price - here) / here) * 100) : null,
    })
  }
  rows.sort((a, b) => b.price - a.price || a.systemId.localeCompare(b.systemId))
  return rows
}
