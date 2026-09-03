import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BURN_FUEL_ALLOWANCE } from './space-quote'

// Implementer-authored (openspec build-production-space-view, tasks.md 4.6).
// The allowance is a CONTRACT, not a magic number at a call site: the
// ceiling the player is shown must be the ceiling the client sends, which is
// only true while one factor exists in one place.

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('lib/space-quote — the burn cap allowance', () => {
  it('leaves real slack above the quoted point cost', () => {
    expect(Number.isFinite(BURN_FUEL_ALLOWANCE)).toBe(true)
    expect(BURN_FUEL_ALLOWANCE, 'a factor at or below 1 makes every commit bounce off its own cap').toBeGreaterThan(1)
    expect(BURN_FUEL_ALLOWANCE, 'a factor this loose stops being a cap').toBeLessThan(2)
  })

  it('is declared in exactly one module', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full, out)
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
      }
      return out
    }
    const declarers = ['app', 'components', 'hooks', 'lib']
      .flatMap((d) => walk(join(FRONTEND, d)))
      .filter((f) => f !== join(FRONTEND, 'lib/space-quote.ts'))
      .filter((f) => /\b(const|let|var)\s+BURN_FUEL_ALLOWANCE\b/.test(readFileSync(f, 'utf8')))
    expect(declarers).toEqual([])
  })
})
