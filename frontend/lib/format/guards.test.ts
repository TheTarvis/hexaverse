import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// RED-PHASE SUITE — openspec change `add-figure-formatting`, capability
// `figure-formatting`: *A Player-Facing Figure Is Produced Only By the
// Shared Formatter* (R12) and *The Formatter Is Pure Presentation and
// Derives No Rule-Bearing Value* (R13). Task 11.1.
//
// A single whole-tree static-analysis vitest suite (design.md's own
// decision, over `frontend/lib/anti-mirror-guard.test.ts`'s shape but
// reading source directly rather than shelling out — there is no companion
// bash script here). NECESSARY BUT NOT SUFFICIENT: this file catches named
// mechanisms (`.toFixed(`, a local `countdown`/`formatEta`, a template
// literal built from a raw number and handed to `<Figure text=...>`,
// `lib/eta.ts`'s existence, `lib/format`'s own import graph and ambient
// sources). It does NOT catch `<Figure raw={x} unit="tons"
// text={String(x)} />`, which uses none of those spellings and still puts
// an unrounded wire number on screen — that structural hole is
// `assert-figures.test.ts`'s job (RULING 17).
//
// This file is compile-red today only insofar as its own assertions FAIL
// against the current, unmigrated tree: `lib/eta.ts` still exists,
// `FleetActionsPanel.tsx`/`ScanControl.tsx` still define local `countdown`,
// and `lib/format/**` does not exist yet at all (so several assertions
// about it are checking an empty result set — see the note on each).

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const FRONTEND = join(REPO_ROOT, 'frontend')

function walk(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, match, out)
    else if (match(entry.name)) out.push(full)
  }
  return out
}

function isSourceFile(f: string): boolean {
  return (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx')
}

function rel(p: string): string {
  return relative(REPO_ROOT, p)
}

/**
 * The reviewed exception list for `.toFixed(` under `components/space/**`
 * and `components/fleet/**` (contract §1, design.md's decision). Each entry
 * is anchored to the specific `lines` its site occupies WITHIN its file —
 * following `fixtures/determinism-register.json`'s own convention ("Line
 * numbers are load-bearing: if a site drifts, the consulting check fails
 * until the entry is updated, which keeps every suppression a reviewable
 * diff"). Matching is by file **and** line, not file alone: a `.toFixed(`
 * anywhere else in an exempted file — including one added later — is an
 * UNREVIEWED violation and fails the guard. A line listed here that no
 * longer calls `.toFixed(` (moved or deleted) also fails the guard, loudly,
 * until the entry is re-located by grep — never by moving the code back to
 * match a stale entry (the anti-vacuity trick `anti-mirror-guard.test.ts`
 * already uses).
 *
 * NEITHER SITE NAMES A QUANTITY THIS CAPABILITY DEFINES. Both are recorded
 * with the ruling/requirement that permits them (R12's own "rounding
 * exception list" scenario).
 */
const KNOWN_TOFIXED_EXCEPTIONS: Array<{ file: string; lines: number[]; ruling: string; note: string }> = [
  {
    // Re-anchored by the SDET per add-vitals-strip RULING 25's scheduled
    // re-anchor, after step F's SpaceStage.tsx camera-cluster shrink
    // landed. Anchors verified by grep against the live file (not taken
    // from the developer's report) and moved from [681, 682, 738, 739,
    // 903] to the lines below. Routine fixture maintenance under the
    // guard's own stated procedure — not a test change requiring a fresh
    // cause adjudication, and not a violation of test immutability.
    file: 'frontend/components/space/SpaceStage.tsx',
    lines: [753, 754, 810, 811, 975],
    ruling: 'RULING 10 / RULING 25',
    note: 'bearing/speed hover-facts toFixed — no covering requirement anywhere; filed as defect-hover-facts-unspecced.md, not fixed here',
  },
  {
    file: 'frontend/components/space/webgl/SpaceWorld.tsx',
    lines: [195],
    ruling: 'not a player-facing figure',
    note: 'toFixed(4) builds a memo key, never rendered to a player',
  },
]

const TOFIXED_SCOPE_DIRS = ['frontend/components/space', 'frontend/components/fleet']

describe('lib/format/guards — R12: no component-local decimal rounding', () => {
  it('Scenario: No component-local decimal rounding — every .toFixed( site under components/space or components/fleet is a reviewed exception naming no quantity this capability defines', () => {
    const violations: string[] = []
    for (const dir of TOFIXED_SCOPE_DIRS) {
      for (const file of walk(join(REPO_ROOT, dir), isSourceFile)) {
        const text = readFileSync(file, 'utf-8')
        if (!text.includes('.toFixed(')) continue
        const relPath = rel(file)
        const exception = KNOWN_TOFIXED_EXCEPTIONS.find((e) => e.file === relPath)
        const lines = text.split('\n')
        lines.forEach((lineText, idx) => {
          if (!lineText.includes('.toFixed(')) return
          const lineNum = idx + 1
          // File-level match is not enough: the line itself must be one of
          // the entry's reviewed anchors, or a new/moved site in an
          // otherwise-exempted file is a silent, unreviewed violation.
          if (!exception || !exception.lines.includes(lineNum)) {
            violations.push(`${relPath}:${lineNum}`)
          }
        })
      }
    }
    expect(
      violations,
      `unreviewed .toFixed( site(s) under ${TOFIXED_SCOPE_DIRS.join(', ')}: ${violations.join(', ')}`,
    ).toEqual([])
  })

  it('Scenario: The rounding exception list holds only quantities this capability does not define — each entry\'s anchored lines still exist and still call .toFixed(, so the list fails loudly when a site moves or is removed', () => {
    for (const entry of KNOWN_TOFIXED_EXCEPTIONS) {
      const full = join(REPO_ROOT, entry.file)
      expect(existsSync(full), `exception file no longer exists: ${entry.file} (${entry.ruling})`).toBe(
        true,
      )
      const lines = readFileSync(full, 'utf-8').split('\n')
      for (const lineNum of entry.lines) {
        const lineText = lines[lineNum - 1] ?? ''
        expect(
          lineText.includes('.toFixed('),
          `exception ${entry.file}:${lineNum} no longer calls .toFixed( at that line — re-locate this entry by grep against the live file, never by moving the code back to match a stale line number (${entry.ruling})`,
        ).toBe(true)
      }
    }
    // The exception's own note must not smuggle in a figure-formatting quantity.
    const FORBIDDEN = /\b(tonnage|duration|range|delta-?v|credit|rate|stamp)\b/i
    for (const entry of KNOWN_TOFIXED_EXCEPTIONS) {
      expect(FORBIDDEN.test(entry.note), `exception note for ${entry.file} names a covered quantity`).toBe(
        false,
      )
    }
  })
})

describe('lib/format/guards — R12: no component-local duration formatter', () => {
  const LOCAL_FORMATTER_RE = /\b(function|const)\s+(countdown|formatEta)\s*[(=]/

  it('Scenario: No component-local duration formatter — no file under components/space or components/fleet defines its own countdown/formatEta', () => {
    const violations: string[] = []
    for (const dir of TOFIXED_SCOPE_DIRS) {
      for (const file of walk(join(REPO_ROOT, dir), isSourceFile)) {
        const text = readFileSync(file, 'utf-8')
        if (LOCAL_FORMATTER_RE.test(text)) violations.push(rel(file))
      }
    }
    expect(
      violations,
      `component-local duration formatter(s) found (should call lib/format instead): ${violations.join(', ')}`,
    ).toEqual([])
  })
})

describe('lib/format/guards — R12: the retired module is gone', () => {
  it('Scenario: The retired module is gone — frontend/lib/eta.ts does not exist and nothing imports it', () => {
    const etaPath = join(FRONTEND, 'lib', 'eta.ts')
    expect(existsSync(etaPath), 'frontend/lib/eta.ts must be deleted').toBe(false)

    const importers: string[] = []
    for (const file of walk(FRONTEND, (f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      const text = readFileSync(file, 'utf-8')
      if (/from\s+['"]@\/lib\/eta['"]/.test(text) || /from\s+['"]\.*\/*lib\/eta['"]/.test(text)) {
        importers.push(rel(file))
      }
    }
    expect(importers, `these files still import lib/eta: ${importers.join(', ')}`).toEqual([])
  })
})

describe('lib/format/guards — R17: no raw number interpolated into a <Figure> text prop', () => {
  // A template literal handed to `text=` whose interpolation contains a bare
  // identifier/member expression rather than a call to a lib/format
  // function is exactly the bypass RULING 17 names: `text={`${raw} t`}`
  // satisfies no banned-function grep and still puts a wire number on
  // screen. This is a DEFENSE-IN-DEPTH static check; the runtime one
  // (assert-figures.test.ts, invoked from every migrated component's own
  // suite) is what actually closes the hole for a case this regex misses.
  const FIGURE_TEXT_TEMPLATE_RE = /text=\{`[^`]*\$\{[^}]*\}[^`]*`\}/g

  it('Scenario: A pre-formatted string handed to the shared element is still non-compliant — no template-literal interpolation into a <Figure>\'s text prop', () => {
    const violations: string[] = []
    for (const dir of TOFIXED_SCOPE_DIRS) {
      for (const file of walk(join(REPO_ROOT, dir), isSourceFile)) {
        const text = readFileSync(file, 'utf-8')
        const matches = text.match(FIGURE_TEXT_TEMPLATE_RE)
        if (matches) violations.push(`${rel(file)}: ${matches.join(' | ')}`)
      }
    }
    expect(
      violations,
      `template-literal interpolation into a <Figure> text prop: ${violations.join('; ')}`,
    ).toEqual([])
  })
})

describe('lib/format/guards — R13: the module is pure presentation, importing no wire-rule module', () => {
  const FORMAT_DIR = join(FRONTEND, 'lib', 'format')

  it('Scenario: The module imports no wire-rule module — lib/format/** imports neither lib/market nor lib/space nor react', () => {
    const violations: string[] = []
    for (const file of walk(FORMAT_DIR, (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && f !== 'assert-figures.ts' && f !== 'guards.test.ts')) {
      const text = readFileSync(file, 'utf-8')
      if (/from\s+['"]@\/lib\/market/.test(text)) violations.push(`${rel(file)}: imports @/lib/market`)
      if (/from\s+['"]@\/lib\/space/.test(text)) violations.push(`${rel(file)}: imports @/lib/space`)
      if (/from\s+['"]react['"]/.test(text)) violations.push(`${rel(file)}: imports react`)
    }
    expect(violations, violations.join('; ')).toEqual([])
    // Not-vacuous: fails today only in the sense that the directory doesn't
    // exist yet, so `walk` returns []. Once figures.ts/index.ts exist this
    // assertion becomes a real, checkable claim.
  })

  it('Scenario: The module names no ambient source — no Date, performance, Math.random, Intl, or toLocaleString', () => {
    const AMBIENT_RE = /\b(Date|performance|Math\.random|Intl|toLocaleString)\b/
    const violations: string[] = []
    for (const file of walk(FORMAT_DIR, (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && f !== 'assert-figures.ts' && f !== 'guards.test.ts')) {
      const text = readFileSync(file, 'utf-8')
      if (AMBIENT_RE.test(text)) violations.push(rel(file))
    }
    expect(violations, `ambient source named in: ${violations.join(', ')}`).toEqual([])
  })
})

describe('lib/format/guards — figureAttrs has exactly one permitted call site (contract §3.1)', () => {
  it('Scenario: no file other than components/figure/Figure.tsx and components/space/ScanControl.tsx imports figureAttrs', () => {
    const violations: string[] = []
    for (const file of walk(FRONTEND, (f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      const relPath = rel(file)
      if (relPath === 'frontend/components/figure/Figure.tsx') continue
      if (relPath === 'frontend/components/space/ScanControl.tsx') continue
      if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')) continue
      const text = readFileSync(file, 'utf-8')
      if (/\bfigureAttrs\b/.test(text)) violations.push(relPath)
    }
    expect(violations, `figureAttrs imported outside its one permitted call site: ${violations.join(', ')}`).toEqual(
      [],
    )
  })
})
