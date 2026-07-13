import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// The spec↔test seam (spec-driven development).
//
// Every Given/When/Then scenario in docs/specs/ — a `### S<n> — <title>` heading
// under `## Scenarios`, globally identified as `NNNN/S<n>` — must be covered by
// at least one test that cites its ID in a comment:
//
//     // Spec: 0009/S1
//     func TestSpawn_CreatesCorpFleetAndFog(t *testing.T) { ... }
//
// This gives us a machine-checked spec-to-test link with no BDD runner and no
// step definitions: tests stay idiomatic Go / vitest / Playwright and just carry
// the marker. See docs/specs/README.md.
//
// It lives in the frontend unit suite (not a bespoke harness) because it's a pure
// static filesystem assertion — no emulator, no stack. It deliberately scans ALL
// four suites, including the Go ones: most scenarios are covered by backend tests.
//
// Enforcement is scoped to specs with status `accepted` or `implemented`. `draft`
// scenarios may be aspirational, so they don't fail — write them before the code
// exists and they arm the moment the spec is accepted.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SPECS_DIR = join(REPO_ROOT, 'docs', 'specs')

// The four suites. Any test in any of them may claim a scenario.
const TEST_TREES: Array<{ dir: string; match: (f: string) => boolean }> = [
  { dir: 'backend', match: (f) => f.endsWith('_test.go') }, // BE unit + BE e2e
  { dir: 'frontend/lib', match: (f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx') },
  { dir: 'frontend/components', match: (f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx') },
  { dir: 'frontend/hooks', match: (f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx') },
  { dir: 'frontend/e2e', match: (f) => f.endsWith('.spec.ts') }, // FE e2e
  { dir: 'claude-agent', match: (f) => f.startsWith('test_') && f.endsWith('.py') },
]

const ENFORCED_STATUSES = new Set(['accepted', 'implemented'])

const SCENARIO_HEADING = /^###\s+(S\d+)\b/gm
const SCENARIOS_SECTION = /^##\s+Scenarios\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m
const STATUS_FM = /^status:\s*(\w+)/m
const MARKER = /Spec:\s*(\d{4})\/(S\d+)/g

interface Scenario {
  id: string // e.g. "0009/S1"
  spec: string // e.g. "0009-spawn.md"
  status: string
}

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

function parseScenarios(): Scenario[] {
  if (!existsSync(SPECS_DIR)) return []
  const scenarios: Scenario[] = []

  for (const file of readdirSync(SPECS_DIR).filter((f) => /^\d{4}-.*\.md$/.test(f))) {
    const number = file.slice(0, 4)
    const text = readFileSync(join(SPECS_DIR, file), 'utf-8')
    const status = (STATUS_FM.exec(text)?.[1] ?? 'draft').toLowerCase()

    const section = SCENARIOS_SECTION.exec(text)?.[1]
    if (!section) continue

    for (const m of section.matchAll(SCENARIO_HEADING)) {
      scenarios.push({ id: `${number}/${m[1]}`, spec: file, status })
    }
  }
  return scenarios
}

/** Map of scenario ID → the test files citing it. */
function collectMarkers(): Map<string, string[]> {
  const covered = new Map<string, string[]>()
  for (const { dir, match } of TEST_TREES) {
    for (const path of walk(join(REPO_ROOT, dir), match)) {
      const text = readFileSync(path, 'utf-8')
      for (const [, number, sid] of text.matchAll(MARKER)) {
        const id = `${number}/${sid}`
        covered.set(id, [...(covered.get(id) ?? []), relative(REPO_ROOT, path)])
      }
    }
  }
  return covered
}

describe('spec scenario coverage', () => {
  const scenarios = parseScenarios()
  const covered = collectMarkers()
  const enforced = scenarios.filter((s) => ENFORCED_STATUSES.has(s.status))

  it('finds the specs directory', () => {
    expect(existsSync(SPECS_DIR), `expected specs at ${SPECS_DIR}`).toBe(true)
  })

  // One test case per scenario — a failure names the scenario that lost its test.
  if (enforced.length > 0) {
    it.each(enforced)('$id ($spec) is covered by a test', ({ id }) => {
      expect(
        covered.get(id) ?? [],
        `No test cites scenario ${id}. Add a \`Spec: ${id}\` comment to the test ` +
          `that covers it (see docs/specs/README.md).`
      ).not.toHaveLength(0)
    })
  }

  it('has no markers citing an unknown scenario', () => {
    const known = new Set(scenarios.map((s) => s.id))
    const orphans = [...covered.entries()]
      .filter(([id]) => !known.has(id))
      .map(([id, files]) => `${id} (cited in ${files.join(', ')})`)

    expect(
      orphans,
      'These tests cite a scenario no spec declares — a typo, or the scenario was removed.'
    ).toEqual([])
  })
})
