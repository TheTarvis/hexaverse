import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as layout from './console-dock-layout'

// RED-PHASE TEST - openspec change add-console-dock, task 2.12
// (system-console: "The Dock Has One Fixed Height and Nothing Covers It or Is
// Covered by It" - the STRUCTURAL half of both "No floating surface is covered
// by or covers the ... dock" scenarios; the geometry half is the journey's).
// Reads source text with node:fs (precedent: lib/anti-mirror-guard.test.ts).
// RULING 21: the camera cluster's lane is a source-text assertion.
// RULING 22: the no-`bottom-[4.5rem]` assertion reads RAW text, comments included.

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(resolve(FRONTEND, rel), 'utf8')

const LANE_LEFT_CENTER = 'bottom-[calc(var(--console-dock-height,3.5rem)+1rem)]'
const LANE_CAMERA = 'bottom-[calc(var(--console-dock-height,3.5rem)+2.75rem)]'
const LANE_COLUMN = 'bottom-[calc(var(--console-dock-height,3.5rem)+5.25rem)]'

/** Strip block comments, JSX comment braces and line comments (not inside strings of `//` URLs: none in the file's tag). */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

describe('console-dock-layout - task 2.12', () => {
  it('Scenario: No floating surface is covered by or covers the collapsed dock (the module exports the property name, the two values and the three lane literals)', () => {
    expect(layout.CONSOLE_DOCK_HEIGHT_VAR).toBe('--console-dock-height')
    expect(layout.CONSOLE_DOCK_HEIGHT_COLLAPSED).toBe('3.5rem')
    expect(layout.CONSOLE_DOCK_HEIGHT_EXPANDED).toBe('13.75rem')
    expect(layout.CONSOLE_DOCK_LANE_LEFT_CENTER).toBe(LANE_LEFT_CENTER)
    expect(layout.CONSOLE_DOCK_LANE_CAMERA).toBe(LANE_CAMERA)
    expect(layout.CONSOLE_DOCK_LANE_COLUMN).toBe(LANE_COLUMN)
    // exactly six exports: no helper, no default
    expect(Object.keys(layout).sort()).toEqual([
      'CONSOLE_DOCK_HEIGHT_COLLAPSED',
      'CONSOLE_DOCK_HEIGHT_EXPANDED',
      'CONSOLE_DOCK_HEIGHT_VAR',
      'CONSOLE_DOCK_LANE_CAMERA',
      'CONSOLE_DOCK_LANE_COLUMN',
      'CONSOLE_DOCK_LANE_LEFT_CENTER',
    ])
  })

  it('Scenario: No floating surface is covered by or covers the expanded dock (each lane string is one complete quoted literal in the module source, so Tailwind\'s scanner sees it)', () => {
    const src = read('lib/console-dock-layout.ts')
    for (const lane of [LANE_LEFT_CENTER, LANE_CAMERA, LANE_COLUMN]) {
      expect(src, `lane literal ${lane}`).toMatch(new RegExp(`(['"\`])${lane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`))
    }
  })

  it('Scenario: No floating surface is covered by or covers the collapsed dock (RAW text of the three occupant files carries no bottom-[4.5rem], comments included)', () => {
    for (const rel of [
      'components/space/SystemSpaceView.tsx',
      'components/space/SpaceStage.tsx',
      'components/hud/SceneNavigationAction.tsx',
    ]) {
      expect(read(rel).includes('bottom-[4.5rem]'), `${rel} still carries bottom-[4.5rem]`).toBe(false)
    }
  })

  it('keeps the gesture-only keyboard map without reintroducing a floating camera cluster', () => {
    const src = stripComments(read('components/space/SpaceStage.tsx'))
    expect(src).not.toContain('data-testid="space-camera-controls"')
    expect(src).toContain('aria-label="System map. Arrow keys rotate;')
  })
})
