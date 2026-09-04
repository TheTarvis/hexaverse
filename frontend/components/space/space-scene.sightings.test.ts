// RED-phase tests for openspec change add-scan-and-sightings-surface,
// tasks.md 7.1-7.7 (`system-space-view`'s ADDED "A Sighting Ghost Renders at
// Its Frozen Position, Never a Predicted One" / "A Ghost at the Origin Is
// Omitted From the Scene, Not Drawn Atop the Star").
//
// WHY A PURE-FUNCTION TEST, NOT A COMPONENT TEST. `buildSceneModel`
// (space-scene.ts) is this codebase's own established seam for exactly
// this class of requirement (see that file's own doc comment: "A WebGL
// bitmap is not a testable surface... computing [the drawn-state model]
// here... keeps every rule assertable"). Every scenario below is about
// WHICH marks a sighting record produces, at what position, with what
// kind — properties of `buildSceneModel`'s pure output, not of anything a
// browser needs to render.
//
// CONTRACT THIS FILE PINS (link8b-impl-contract.md §1.9 — DECIDED HERE, not
// left to the implementer):
//   - `SceneInput` gains `sightings: Sighting[]` (defaulting to `[]`).
//   - Sighting marks use `SceneMarkKind` **`'sighting'`** — NEVER `'ghost'`,
//     which `space-scene.ts` already declares for a BURN's arrival preview
//     (a completely different mark class; conflating the two is this
//     change's single most likely silent defect per the contract's own
//     traps list).
//   - `SceneMark.id` = `sighting-${record.id}`.
//   - A sighting mark carries the record's stored `velocity` (displayed,
//     never integrated) and some way to read its `asOf` (asserted via a
//     dedicated `asOf` field on the mark — a developer landing a
//     scenario-equivalent shape that carries `asOf` some other way, e.g. a
//     parallel map keyed by mark id, should raise it as a mechanical-rename
//     dispute, not a behavior dispute).
//   - A clean-sweep record (`cleanSweep: true`) produces NO mark at all.
//   - A target-naming record whose stored position is exactly the origin
//     is OMITTED via the same `omitOrigin` sink every other mark class uses
//     (asserted here via the injected `log` callback, exactly as
//     `space-scene.test.ts` already asserts the body/fleet/contact origin
//     rule).
//
// EXPECTED RED TODAY: this file fails to even RESOLVE its own import of
// `@/lib/types/sighting` — that module does not exist yet (task 4.1 is
// unimplemented) — a clean, real "missing production module" red, the
// front-end analogue of a Go compile error against a package that has no
// production files yet. Once that type exists, `buildSceneModel` itself
// still produces no `'sighting'` mark at all (task 7.1 is unimplemented),
// so every positive assertion below fails on an EMPTY marks array, never a
// broken harness.

import { describe, it, expect, vi } from 'vitest'
import { buildSceneModel, type SceneInput } from './space-scene'
import type { SystemSpace } from '@/lib/types/system-space'
import type { Sighting } from '@/lib/types/sighting'

const baseInterior: SystemSpace = {
  systemId: 'sys-1',
  extent: 200,
  features: [{ id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 6 }],
  laneGates: [],
  contacts: [],
} as unknown as SystemSpace

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: 'sight-abc123',
    systemId: 'sys-1',
    asOf: 42_000,
    hostId: 'feat-planet-2',
    cleanSweep: false,
    position: { X: 10, Y: 0, Z: 5 },
    velocity: { X: 0.5, Y: 0, Z: 0 },
    hullCount: 2,
    hullTypes: ['frigate', 'frigate'],
    ...overrides,
  }
}

function build(sightings: Sighting[], extra: Partial<SceneInput> = {}) {
  const log = vi.fn()
  const input: SceneInput = {
    interior: baseInterior,
    fleets: [],
    worldTimeMs: 100_000,
    reducedMotion: false,
    selection: null,
    log,
    sightings,
    ...extra,
  } as unknown as SceneInput
  return { scene: buildSceneModel(input), log }
}

describe('buildSceneModel — sighting ghosts (add-scan-and-sightings-surface §7)', () => {
  // Scenario: A ghost renders at the record's stored position.
  it('draws a mark at the record’s stored position, kind "sighting"', () => {
    const rec = sighting()
    const { scene } = build([rec])
    const mark = scene.marks.find((m) => m.kind === 'sighting')
    expect(mark, 'expected a mark of kind "sighting" for a target-naming record').toBeTruthy()
    expect(mark?.position).toEqual({ x: 10, y: 0, z: 5 })
  })

  // Scenario (§1.9 collision guard): a sighting mark's id is
  // `sighting-${record.id}`, and its kind is NEVER 'ghost' — the burn
  // arrival preview's own mark kind.
  it('never reuses the burn-arrival "ghost" mark kind, and ids the mark by the record id', () => {
    const rec = sighting({ id: 'sight-xyz' })
    const { scene } = build([rec])
    const mark = scene.marks.find((m) => m.id === 'sighting-sight-xyz')
    expect(mark, 'expected SceneMark.id === `sighting-${record.id}`').toBeTruthy()
    expect(mark?.kind).toBe('sighting')
    expect(scene.marks.some((m) => m.kind === 'ghost')).toBe(false)
  })

  // Scenario: A ghost does not move as world time advances.
  it('does not move the mark as world time advances', () => {
    const rec = sighting()
    const { scene: at100 } = build([rec], { worldTimeMs: 100_000 })
    const { scene: at999999 } = build([rec], { worldTimeMs: 999_999 })
    const a = at100.marks.find((m) => m.kind === 'sighting')
    const b = at999999.marks.find((m) => m.kind === 'sighting')
    // Asserted BEFORE the equality check so this test cannot pass vacuously
    // against an implementation that draws no sighting mark at all (lesson
    // two: a test that compares two `undefined`s proves nothing).
    expect(a, 'expected a "sighting" mark to be drawn at all').toBeTruthy()
    expect(a?.position).toEqual(b?.position)
  })

  // Scenario: A ghost's stored velocity is displayed, not integrated — the
  // mark itself carries the served velocity verbatim for a facts surface to
  // read; buildSceneModel performs no integration of it into position (the
  // previous scenario already proves position is frozen).
  it('carries the record’s stored velocity on the mark, unmodified', () => {
    const rec = sighting({ velocity: { X: 1.5, Y: -2, Z: 0.25 } })
    const { scene } = build([rec])
    const mark = scene.marks.find((m) => m.kind === 'sighting')
    expect(mark?.velocity).toEqual({ x: 1.5, y: -2, z: 0.25 })
  })

  // Scenario: A ghost is visually distinct from a live contact / from an
  // own fleet — structural guard: the sighting mark's kind is its own
  // literal, distinct from every other kind buildSceneModel produces.
  it('is visually distinct (a distinct SceneMarkKind) from a contact and a fleet mark', () => {
    const interiorWithContact: SystemSpace = {
      ...baseInterior,
      contacts: [{ position: { X: 50, Y: 0, Z: 0 }, emitting: false }],
    } as unknown as SystemSpace
    const rec = sighting({ position: { X: 60, Y: 0, Z: 0 } })
    const { scene } = build([rec], { interior: interiorWithContact })
    const kinds = new Set(scene.marks.map((m) => m.kind))
    expect(kinds.has('sighting')).toBe(true)
    expect(kinds.has('contact')).toBe(true)
    // Distinct literals, not merely distinct instances.
    expect('sighting').not.toBe('contact')
    expect('sighting').not.toBe('fleet')
  })

  // Scenario: A clean-sweep record draws no ghost.
  it('draws no mark at all for a clean-sweep record', () => {
    const rec = sighting({ cleanSweep: true, position: { X: 0, Y: 0, Z: 0 }, hostId: 'feat-belt-0' })
    const { scene, log } = build([rec])
    expect(scene.marks.some((m) => m.kind === 'sighting')).toBe(false)
    // And specifically NOT via the origin-omission path — a clean sweep is
    // not "a record at the origin", it names no target and has no position
    // to omit in the first place.
    expect(log).not.toHaveBeenCalled()
  })

  // Scenario: A ghost at the origin is omitted from the scene, not drawn
  // atop the star — restated for the fourth mark class (design.md
  // Decision 8), via the SAME omitOrigin sink space-scene.test.ts already
  // asserts for body/fleet/contact.
  it('omits a target-naming record stored at exactly the origin, and logs a diagnostic', () => {
    const rec = sighting({ position: { X: 0, Y: 0, Z: 0 }, cleanSweep: false })
    const { scene, log } = build([rec])
    expect(scene.marks.some((m) => m.kind === 'sighting')).toBe(false)
    expect(scene.omissions.some((o) => o.reason === 'origin')).toBe(true)
    expect(log).toHaveBeenCalled()
  })

  // Scenario: A record for another system draws no ghost here — the pile
  // read is ALREADY filtered server-side by system (sighting-records "The
  // Pile Read Filters To One System On Request"), so buildSceneModel's own
  // contract is simply "draw everything it is handed"; this is asserted as
  // a boundary probe (SDET-added) confirming the function performs no
  // additional systemId filtering of its own that could mask a caller bug.
  it('draws every sighting it is handed, performing no systemId filtering of its own (SDET-added)', () => {
    const rec = sighting({ systemId: 'sys-OTHER' })
    const { scene } = build([rec])
    expect(scene.marks.some((m) => m.kind === 'sighting')).toBe(true)
  })

  // Scenario (SDET-added boundary probe): an empty sightings array produces
  // no sighting marks and no omissions — the default-`[]` contract (§1.9)
  // is not merely tolerated but produces an empty, not undefined, result.
  it('produces no sighting marks for an empty sightings array', () => {
    const { scene } = build([])
    expect(scene.marks.filter((m) => m.kind === 'sighting')).toHaveLength(0)
  })

  // Scenario (SDET-added): two records at the same position/asOf/host
  // still produce two independent marks, addressed by their own ids — the
  // row↔ghost cross-highlight (sighting-log) depends on this.
  it('draws two independent marks for two records with identical contents but different ids', () => {
    const a = sighting({ id: 'sight-a' })
    const b = sighting({ id: 'sight-b' })
    const { scene } = build([a, b])
    const marks = scene.marks.filter((m) => m.kind === 'sighting')
    expect(marks).toHaveLength(2)
    expect(new Set(marks.map((m) => m.id)).size).toBe(2)
  })
})
