import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { foldSale, firstTonPrice } from './fold'
import type { DemandEntry, Fill } from '@/lib/types/market'

// The shared Go/TS golden. The Go settlement fold asserts the SAME file, so the
// number a player is shown before committing and the number that settles cannot
// silently diverge — the cross-stack rule fixtures/board/cases.json already
// establishes for the hex math.
interface FoldCase {
  name: string
  entries: DemandEntry[]
  tons: number
  fills: Fill[]
  totalProceeds: number
}
interface FirstTonCase {
  name: string
  entries: DemandEntry[]
  firstTonPrice: number
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), '..', 'fixtures', 'market', 'cases.json'), 'utf8'),
) as { fold: FoldCase[]; firstTonPrice: FirstTonCase[] }

describe('foldSale — shared fixture', () => {
  it('loads the golden', () => {
    expect(fixture.fold.length).toBeGreaterThan(0)
  })

  for (const c of fixture.fold) {
    it(`matches: ${c.name}`, () => {
      const got = foldSale(c.entries, c.tons)

      expect(got.totalProceeds).toBe(c.totalProceeds)
      expect(got.unfilled).toBe(0)
      expect(got.fills).toHaveLength(c.fills.length)

      c.fills.forEach((want, i) => {
        const fill = got.fills[i]
        expect(fill.source).toBe(want.source)
        expect(fill.unitPrice).toBe(want.unitPrice)
        expect(fill.tons).toBeCloseTo(want.tons, 9)
        expect(fill.proceeds).toBe(want.proceeds)
        expect(fill.requestId ?? undefined).toBe(want.requestId ?? undefined)
      })
    })
  }
})

describe('firstTonPrice — shared fixture', () => {
  for (const c of fixture.firstTonPrice) {
    it(`matches: ${c.name}`, () => {
      expect(firstTonPrice(c.entries)).toBe(c.firstTonPrice)
    })
  }
})

describe('foldSale — rounding granularity', () => {
  it('floors per portion, not on the summed total', () => {
    const entries: DemandEntry[] = [
      { unitPrice: 3, source: 'request', remainingQuantity: 1.5, requestId: 'r' },
      { unitPrice: 3, source: 'floor', unlimited: true },
    ]
    // Per portion: floor(1.5*3)=4 twice ⇒ 8. On the pre-summed total:
    // floor(3.0*3)=9. The two genuinely differ, and 8 is what the server does.
    expect(foldSale(entries, 3).totalProceeds).toBe(8)
  })

  it('reports zero proceeds for a dust sale rather than rounding up', () => {
    const entries: DemandEntry[] = [{ unitPrice: 2, source: 'floor', unlimited: true }]
    // The caller must REJECT this rather than debit cargo for nothing.
    expect(foldSale(entries, 0.4).totalProceeds).toBe(0)
  })
})

describe('foldSale — edge cases', () => {
  it('reports unfilled tonnage when demand is finite and insufficient', () => {
    const entries: DemandEntry[] = [
      { unitPrice: 10, source: 'request', remainingQuantity: 5, requestId: 'r' },
    ]
    const got = foldSale(entries, 20)
    expect(got.unfilled).toBeCloseTo(15, 9)
    expect(got.totalProceeds).toBe(50)
  })

  it('skips an exhausted entry without consuming tonnage', () => {
    const entries: DemandEntry[] = [
      { unitPrice: 999, source: 'request', remainingQuantity: 0, requestId: 'drained' },
      { unitPrice: 10, source: 'floor', unlimited: true },
    ]
    const got = foldSale(entries, 5)
    expect(got.fills).toHaveLength(1)
    expect(got.fills[0].source).toBe('floor')
    expect(got.totalProceeds).toBe(50)
  })

  it('returns nothing for zero tonnage', () => {
    const entries: DemandEntry[] = [{ unitPrice: 10, source: 'floor', unlimited: true }]
    const got = foldSale(entries, 0)
    expect(got.fills).toHaveLength(0)
    expect(got.totalProceeds).toBe(0)
  })

  it('returns zero for an empty demand list', () => {
    expect(foldSale([], 10).totalProceeds).toBe(0)
    expect(firstTonPrice([])).toBe(0)
  })
})
