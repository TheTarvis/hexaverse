import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// RED-PHASE SUITE — openspec change `build-production-space-view`, tasks.md
// 10.2 and 4.3; capability `system-space-view`, requirements *Realtime
// Refetch Rules While the Space View Is Open* and *Burn Preview Reflects the
// Server-Solved Order, Without Committing*.
//
// THE CONTRACT: `frontend/lib/realtime.ts` is the single definition site for
// the view's timing constants, so `hooks/use-board-realtime.ts` can be
// deleted without erasing them.
//
//   export const ETA_CUSHION_MS = 400        // UNCHANGED VALUE — relocation,
//                                            // not retuning (tasks.md 10.2)
//   export const BOARD_POLL_MS: number       // the baseline poll interval
//   export const PREVIEW_REFRESH_MS: number  // the ONE preview cadence
//                                            // constant (OQ-14: value open)
//
// `add-scan-and-sightings-surface` (8b) schedules its own settle refetch on
// ETA_CUSHION_MS and archives after this change, so this module is a
// cross-change contract, not an internal detail.
//
// VACUITY NOTE: the value assertions cannot pass against a stub with a
// different number, and the single-definition-site assertions scan the real
// source tree rather than the module's own exports — a second literal
// elsewhere is exactly what they exist to catch, and a stub cannot satisfy
// them by re-exporting.

import { ETA_CUSHION_MS, BOARD_POLL_MS, PREVIEW_REFRESH_MS } from '@/lib/realtime'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FRONTEND = join(REPO_ROOT, 'frontend')

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const SOURCES = ['app', 'components', 'hooks', 'lib'].flatMap((d) => walk(join(FRONTEND, d)))

describe('lib/realtime — the view timing constants live in exactly one module', () => {
  it('SDET-added: ETA_CUSHION_MS relocates with its value unchanged at 400', () => {
    // tasks.md 10.2: "The value stays 400; this is a relocation, not a
    // retuning — do not change it in passing."
    expect(ETA_CUSHION_MS).toBe(400)
  })

  it('SDET-added: the baseline poll interval is a positive finite number', () => {
    expect(Number.isFinite(BOARD_POLL_MS)).toBe(true)
    expect(BOARD_POLL_MS).toBeGreaterThan(0)
  })

  // Scenario: The refresh interval is defined in exactly one place
  it('Scenario: The refresh interval is defined in exactly one place', () => {
    expect(Number.isFinite(PREVIEW_REFRESH_MS)).toBe(true)
    expect(PREVIEW_REFRESH_MS).toBeGreaterThan(0)

    // No other production module may DECLARE a preview-refresh constant. A
    // second declaration is the failure mode the requirement names ("a
    // refresh rate scattered across call sites is one no reviewer can
    // price"); importing it is fine, re-declaring it is not.
    const declarers = SOURCES.filter((f) => {
      if (f === join(FRONTEND, 'lib/realtime.ts')) return false
      const src = readFileSync(f, 'utf8')
      return /\b(const|let|var)\s+PREVIEW_REFRESH_MS\b/.test(src)
    }).map((f) => f.replace(FRONTEND + '/', ''))
    expect(declarers, 'PREVIEW_REFRESH_MS must be declared only in lib/realtime.ts').toEqual([])
  })

  it('SDET-added: ETA_CUSHION_MS and BOARD_POLL_MS are likewise declared only in lib/realtime.ts', () => {
    for (const name of ['ETA_CUSHION_MS', 'BOARD_POLL_MS']) {
      const declarers = SOURCES.filter((f) => {
        if (f === join(FRONTEND, 'lib/realtime.ts')) return false
        const src = readFileSync(f, 'utf8')
        return new RegExp(`\\b(const|let|var)\\s+${name}\\b`).test(src)
      }).map((f) => f.replace(FRONTEND + '/', ''))
      expect(declarers, `${name} must be declared only in lib/realtime.ts`).toEqual([])
    }
  })

  it('SDET-added: lib/realtime.ts is not a hook module and imports no React', () => {
    // tasks.md 10.2: 8b "must not have to import through a hook it otherwise
    // does not use".
    const src = readFileSync(join(FRONTEND, 'lib/realtime.ts'), 'utf8')
    expect(/from ['"]react['"]/.test(src), 'lib/realtime.ts must not import React').toBe(false)
    expect(/@tanstack\/react-query/.test(src), 'lib/realtime.ts must not import React Query').toBe(false)
  })
})
