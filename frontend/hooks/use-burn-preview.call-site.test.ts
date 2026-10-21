import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// openspec change `lift-burn-preview-to-view`, tasks.md 1.1; design decision 7;
// impl contract §5.1. A static guard in the `lib/realtime.test.ts` walk idiom:
// the preview hook has exactly ONE call site in production source — the view —
// so the panel and the view cannot each run their own preview query.


const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
// The string literal of an import specifier ending in `use-burn-preview` —
// covers `import … from`, `import()` and `require`, any path form; it does not
// match prose in a comment.
const IMPORT_SPECIFIER = /['"][^'"\n]*\buse-burn-preview(\.tsx?)?['"]/
const VIEW = 'components/space/SystemSpaceView.tsx'

describe('useBurnPreview has exactly one call site', () => {
  const importers = SOURCES.filter((f) => IMPORT_SPECIFIER.test(readFileSync(f, 'utf8'))).map((f) =>
    f.replace(FRONTEND + '/', ''),
  )

  it('Scenario: Selecting a target shows a preview curve and its figures — exactly one production module imports the preview hook (design decision 7)', () => {
    expect(importers, 'one importer of use-burn-preview across app, components, hooks, lib').toHaveLength(1)
  })

  it('Scenario: Selecting a target shows a preview curve and its figures — that importer is the view, not the command panel', () => {
    expect(importers).toEqual([VIEW])
  })

  it('Scenario: Selecting a target shows a preview curve and its figures — the view source holds exactly one useBurnPreview call', () => {
    const src = readFileSync(join(FRONTEND, VIEW), 'utf8')
    expect(src.match(/\buseBurnPreview\s*\(/g) ?? []).toHaveLength(1)
  })
})
