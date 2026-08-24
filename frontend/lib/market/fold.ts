// The settlement fold, client side (#0011 Decision 22).
//
// This is duplicated cross-stack math: the Go settlement in backend/market and
// this preview must produce the SAME number, or the figure a player is shown
// before committing differs from the one that settles. Both assert against
// fixtures/market/cases.json — the same discipline fixtures/board/cases.json
// already enforces for the hex math.
//
// Do not "simplify" the rounding here without changing the fixture and the Go
// side together.

import type { DemandEntry, Fill } from '@/lib/types/market'

export interface FoldResult {
  fills: Fill[]
  totalProceeds: number
  // Tonnage that found no demand. Always 0 in practice — the floor entry is
  // unlimited — but reported rather than silently dropped.
  unfilled: number
}

function capacity(entry: DemandEntry): number {
  return entry.unlimited ? Number.POSITIVE_INFINITY : (entry.remainingQuantity ?? 0)
}

// foldSale folds tonnage across a venue's ordered demand entries, filling each to
// its remaining quantity before moving to the next.
//
// "Fill the request first, then the floor" is not a branch here — it is simply
// what this one rule produces given the entry list the server sends.
//
// Rounding is PER PORTION, floored, then summed — never round the pre-summed
// fractional total once. Rounding down is the direction that never adds to the
// faucet (this milestone ships no credit sink), and per-portion granularity is
// what the Go settlement uses, so the two must match exactly.
export function foldSale(entries: DemandEntry[], tons: number): FoldResult {
  const fills: Fill[] = []
  let total = 0
  let remaining = tons

  for (const entry of entries) {
    if (remaining <= 0) break
    const take = Math.min(remaining, capacity(entry))
    if (take <= 0) continue

    const proceeds = Math.floor(take * entry.unitPrice)
    const fill: Fill = {
      source: entry.source,
      unitPrice: entry.unitPrice,
      tons: take,
      proceeds,
    }
    if (entry.requestId) fill.requestId = entry.requestId
    fills.push(fill)

    total += proceeds
    remaining -= take
  }

  return { fills, totalProceeds: total, unfilled: remaining > 1e-9 ? remaining : 0 }
}

// firstTonPrice is the price the server would apply to the FIRST ton — the
// figure shown on the board, and what the optional slippage guard compares
// against. 0 when there is no demand at all.
export function firstTonPrice(entries: DemandEntry[]): number {
  for (const entry of entries) {
    if (capacity(entry) > 0) return entry.unitPrice
  }
  return 0
}

// bestPriceFor picks the top standing price across a venue's quotes for one
// kind — what the board ranks stations by.
export function bestPriceFor(entries: DemandEntry[] | undefined): number {
  if (!entries || entries.length === 0) return 0
  return firstTonPrice(entries)
}
