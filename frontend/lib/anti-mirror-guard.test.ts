import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `cross-stack-determinism`, requirement *Shared Board Math Is
// Pinned By a Cross-Language Golden Fixture* (tasks.md 1.2, 1.3, 11.3).
//
// This is the regression coverage for the anti-mirror check ITSELF. The check
// (`.claude/scripts/check-mirror-map.sh`) is the only guard standing between
// this change and a TypeScript mirror of `backend/space`, and it has three
// holes this change closes:
//
//   1. it compares Go and TS names CASE-SENSITIVELY, so `ArcParam`/`arcParam`
//      never collide;
//   2. its TypeScript scan is `for f in "$TS_DIR"/*.ts` — one directory level,
//      `.tsx` excluded;
//   3. (already correct today, pinned here so it stays correct) its Go side
//      enumerates UNEXPORTED functions too.
//
// Each case below plants a twin, runs the real script, and asserts a NON-ZERO
// exit naming the collision. A hole in the check shows up as exit 0.
//
// VACUITY NOTE: the danger with a shell-out test is that it passes because
// the script failed for an unrelated reason. Every failing case therefore
// asserts BOTH a non-zero exit AND that the output names the specific twin —
// and the first test in the file asserts the script exits ZERO on the
// unmodified tree, so "the script always fails" cannot make the suite green.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = join(REPO_ROOT, '.claude/scripts/check-mirror-map.sh')
const SPACE_DIR = join(REPO_ROOT, 'frontend/lib/space')

interface Run {
  code: number
  output: string
}

function runCheck(): Run {
  try {
    const out = execFileSync('bash', [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, output: out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? -1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const planted: string[] = []

function plant(relPath: string, contents: string): void {
  const full = join(SPACE_DIR, relPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, contents, 'utf8')
  planted.push(full)
}

afterEach(() => {
  for (const p of planted.splice(0)) {
    if (existsSync(p)) rmSync(p)
  }
  const sub = join(SPACE_DIR, '__anti_mirror_probe__')
  if (existsSync(sub)) rmSync(sub, { recursive: true, force: true })
})

describe('check-mirror-map.sh — anti-mirror mode over backend/space <-> frontend/lib/space', () => {
  it('Scenario: A Go-sole-authority capability\'s mirror map runs in anti-mirror mode (the unmodified tree passes)', () => {
    const r = runCheck()
    expect(r.output).toContain('space (anti-mirror)')
    expect(r.code, `expected a clean tree to pass; output:\n${r.output}`).toBe(0)
  })

  it('Scenario: A lower-camel twin of an authoritative Go export fails the check', () => {
    // `ArcParam` is exported from backend/space. Its idiomatic TypeScript
    // spelling differs only by case — the exact mirror this check exists to
    // catch, and the exact pair a case-sensitive `comm -12` reports as clean.
    plant('__anti_mirror_probe__/twin-lower-camel.ts', 'export function arcParam(u: number): number {\n  return u\n}\n')
    const r = runCheck()
    expect(r.code, `expected a non-zero exit for the lower-camel twin; output:\n${r.output}`).not.toBe(0)
    expect(r.output.toLowerCase()).toContain('arcparam')
  })

  it('Scenario: A twin in a subdirectory or a .tsx file fails the check (subdirectory half)', () => {
    plant('__anti_mirror_probe__/nested/deep/twin.ts', 'export function stateAt(t: number): number {\n  return t\n}\n')
    const r = runCheck()
    expect(r.code, `expected a non-zero exit for a twin one directory down; output:\n${r.output}`).not.toBe(0)
    expect(r.output.toLowerCase()).toContain('stateat')
  })

  it('Scenario: A twin in a subdirectory or a .tsx file fails the check (.tsx half)', () => {
    plant(
      '__anti_mirror_probe__/TwinComponent.tsx',
      'export function speed(v: number): number {\n  return v\n}\n',
    )
    const r = runCheck()
    expect(r.code, `expected a non-zero exit for a twin in a .tsx file; output:\n${r.output}`).not.toBe(0)
    expect(r.output.toLowerCase()).toContain('speed')
  })

  it('Scenario: An unexported Go function counts as an authoritative name', () => {
    // `bernsteinPoint` is UNEXPORTED in backend/space. It is also the single
    // most likely name an implementer reaches for when writing the quintic
    // evaluator this change needs — which is precisely why it is reserved.
    plant(
      '__anti_mirror_probe__/twin-unexported.ts',
      'export function bernsteinPoint(u: number): number {\n  return u\n}\n',
    )
    const r = runCheck()
    expect(r.code, `expected a non-zero exit for an unexported-Go twin; output:\n${r.output}`).not.toBe(0)
    expect(r.output.toLowerCase()).toContain('bernsteinpoint')
  })

  it('Scenario: A declaration form the extractor has no rule for fails the check rather than passing', () => {
    // A destructuring export: the extractor cannot tell whether any bound
    // name holds a function, so it must FAIL CLOSED naming file and line
    // rather than counting the line as a plain value export. A check whose
    // extractor silently misses a form reports "pass" for the exact
    // regression it exists to catch.
    plant(
      '__anti_mirror_probe__/unrecognized.ts',
      'export const [alpha, beta] = [1, 2]\n',
    )
    const r = runCheck()
    expect(r.code, `expected a non-zero exit for an unclassifiable form; output:\n${r.output}`).not.toBe(0)
    expect(r.output).toContain('unrecognized.ts')
  })

  it('SDET-added: a genuinely draw-scoped name in a subdirectory does not fail the check', () => {
    // The complement of the four cases above: the recursion must not turn
    // every nested helper into a false positive, or the fix is unusable and
    // gets reverted.
    plant(
      '__anti_mirror_probe__/nested/ok.ts',
      'export function drawOrbitPositionHelper(u: number): number {\n  return u\n}\n',
    )
    const r = runCheck()
    expect(r.code, `a non-colliding nested export must still pass; output:\n${r.output}`).toBe(0)
  })

  it('SDET-added: fixtures/space/mirror-map.json keeps an EMPTY sharedNames allowlist', async () => {
    // tasks.md 1.5 / design.md Decision 1: a collision is resolved by
    // renaming the TypeScript, never by widening the allowlist. This is the
    // door that must stay shut, and it is cheap to watch.
    const { readFileSync } = await import('node:fs')
    const map = JSON.parse(readFileSync(join(REPO_ROOT, 'fixtures/space/mirror-map.json'), 'utf8'))
    expect(map.sharedNames).toEqual([])
  })
})
