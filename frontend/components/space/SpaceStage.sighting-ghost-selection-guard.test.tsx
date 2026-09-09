import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// task 7.6 (`system-space-view`'s ADDED "A Ghost Is Not a Member of the
// Space View's Selection, and a Burn Never Consumes One":
//
//   "A click on a ghost does not become a point selection"
//   GIVEN a ghost mark drawn over no body or lane-gate mark
//   WHEN the player clicks it
//   THEN no point selection is created at that position, and no burn is
//   armed against it
//
// A NEW FILE, distinct from the existing (immutable) `SpaceStage.
// interaction.test.tsx`, which this suite's own contract flags as the
// single most likely silent defect (link8b-impl-contract.md §5.10):
// `SpaceStage.tsx`'s picking rule is EXHAUSTIVE — a click resolving against
// the pick plane over no body or lane-gate mark SELECTS THAT POINT
// (`handlePointerDown` -> `finishGesture` -> `resolvePick`, which only ever
// sees `PickMark`s the caller built from PICKABLE scene marks — bodies and
// gates). A ghost is drawn in that SAME plane, at a position where a sweep
// found something masked, which is exactly where a curious player clicks.
// Without a guard, reading a ghost silently arms a burn to a frozen,
// possibly long-stale coordinate.
//
// THE MECHANISM THIS TEST PINS (contract §1.9, DECIDED HERE): the ghost's
// own DOM mark element carries `data-space-affordance` — the SAME attribute
// `isControl(e.target)` already checks for the off-screen reach buttons
// (`target.closest('[data-camera-control], [data-space-affordance]')`,
// SpaceStage.tsx). That is what makes a pointerdown on the ghost bail out
// of `handlePointerDown` BEFORE it ever reaches pick-plane resolution —
// never the pick radius, never a proximity check, never a mark-kind
// branch inside `resolvePick` itself (which has no notion of a ghost at
// all, by design — see `space-selection.ts`'s own doc comment: "NO FLEET
// AND NO CONTACT IS EVER A MEMBER OF THIS SET").
//
// EXPECTED RED TODAY, in order: (1) `screen.getByTestId('sighting-mark-...')`
// throws "Unable to find an element" — SpaceStage renders nothing for a
// `kind: 'sighting'` mark at all yet (mirrors a Go compile-red: the surface
// this test needs does not exist in production yet). Once a developer adds
// it, redness shifts to (2): a pointerdown+pointerup dispatched ON that
// element bubbling through to the region and creating a point selection —
// the exact defect `data-space-affordance`'s absence produces.

const onSelect = vi.fn()

// A ghost mark, isolated from every other mark's screen footprint: no body
// or gate is drawn anywhere near it, satisfying "drawn over no body or
// lane-gate mark" structurally, not just by omission.
//
// TWO DISTINCT IDS, PER THE CONTRACT'S OWN RULING (test-dispute adjudicated
// 2026-09-03): RECORD_ID is the sighting record's own served `id`
// (space-scene.sightings.test.ts already pins the SCENE-MODEL mark id as
// `sighting-${record.id}`, mirroring `contact-${index}` — that convention
// is unchanged and is NOT what this file asserts). The DOM test id is
// `sighting-mark-${record.id}` — link8b-impl-contract.md §1.9's own pinned
// shape, mirroring `contact-mark-${id}` — so it is built from RECORD_ID
// directly, never from the already-`sighting-`-prefixed scene-mark id
// (that combination previously produced the WRONG expected DOM id,
// `sighting-mark-sighting-<record.id>`). The developer implements this via
// `mark.recordId` (the raw record id carried alongside the scene mark's own
// `id`), so the mark fixture below carries both.
const RECORD_ID = 'sight-1'
const GHOST_MARK_ID = `sighting-${RECORD_ID}`
const marks = [
  { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5.2, pickable: false, selected: false },
  { id: 'feat-body-0', kind: 'body', position: { x: 300, y: 0, z: 300 }, radius: 1.7, pickable: true, selected: false },
  {
    id: GHOST_MARK_ID,
    kind: 'sighting',
    // The raw sighting record id — what `sighting-mark-${mark.recordId}`
    // reads to build the DOM test id (link8b-impl-contract.md §1.9).
    recordId: RECORD_ID,
    position: { x: -120, y: 0, z: 40 },
    radius: 0.6,
    // Per §1.9/§7's own contract: a ghost is never selectable — pickable
    // stays false, exactly like a contact's or a fleet's mark.
    pickable: false,
    selected: false,
    asOf: 42_000,
    velocity: { x: 0.1, y: 0, z: 0 },
  },
]

const scene = {
  marks,
  curves: [],
  beltFields: [],
    orbitRings: [],
  positionTimeMs: 1,
  decorativeTimeMs: 1,
  omissions: [],
}

import { SpaceStage } from './SpaceStage'
import { assertFiguresMatchModule } from '@/lib/format/assert-figures'

// SDET-ADDED MIGRATION (openspec change `add-figure-formatting`, not itself
// a task-9.x-named file, but directly affected): `SpaceStage` gains a
// required `scale` prop, and the ghost mark's sr-only `asOf` label
// (`sighting-mark-asof-{recordId}`) becomes a `world-ms-instant` figure
// (contract §4's `SpaceStage.tsx` table). This fixture already carries
// `asOf: 42_000` unused by the selection-guard scenario above; this file is
// the natural place to close that gap rather than leave it unautomated.

const W = 1200
const H = 900
const EXTENT = 658.7081316032265

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
})

function stage(over: Record<string, unknown> = {}) {
  return render(
    <SpaceStage
      systemId="sys_-7_17"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scene={scene as any}
      extent={EXTENT}
      worldTime={1}
      selection={null}
      onSelect={onSelect}
      scale={1}
      {...over}
    />,
  )
}

describe('SpaceStage — the ghost-selection guard (system-space-view "A Ghost Is Not a Member of the Space View\'s Selection, and a Burn Never Consumes One")', () => {
  // Scenario: A click on a ghost does not become a point selection.
  it('renders the ghost mark with the space-affordance attribute, and a click on it never becomes a point selection', () => {
    stage()

    // (1) The ghost's own DOM element must exist AT ALL — the first, most
    // basic red: nothing renders for a `kind: 'sighting'` mark today.
    const ghost = screen.getByTestId(`sighting-mark-${RECORD_ID}`)

    // (2) It carries the SAME affordance attribute the off-screen reach
    // buttons use, which is the actual mechanism `isControl` bails on.
    expect(
      ghost.hasAttribute('data-space-affordance'),
      'a ghost mark without data-space-affordance lets its pointerdown bubble to the region and arm a burn ' +
        '(link8b-impl-contract.md §1.9/§5.10 — the single most likely silent defect flagged in this change)',
    ).toBe(true)

    // (3) A real pointerdown+pointerup pair dispatched ON the ghost's own
    // element must not resolve to a point selection anywhere — never at
    // the ghost's own drawn position, and never at all.
    const press = { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0 }
    ghost.dispatchEvent(new PointerEvent('pointerdown', { ...press, bubbles: true, cancelable: true }))
    ghost.dispatchEvent(new PointerEvent('pointerup', { ...press, bubbles: true, cancelable: true }))

    expect(
      onSelect,
      'a click on a ghost mark must never create or replace a point/body selection — it may only highlight ' +
        'the ghost, which is separate, additional state this callback has no part in',
    ).not.toHaveBeenCalled()
  })

  // Scenario (SDET-added sanity control): confirms this harness CAN observe
  // a point selection at all — clicking the SAME screen position with no
  // ghost present there creates one, so the negative assertion above is not
  // vacuous (a callback that is simply never wired at all would pass both
  // cases identically).
  it('SDET control: the identical gesture over empty canvas space (no ghost, no body) does create a point selection', () => {
    stage({ scene: { ...scene, marks: marks.filter((m) => m.kind !== 'sighting') } })
    const canvas = screen.getByTestId('space-canvas-region')
    const press = { pointerId: 2, isPrimary: true, button: 0, clientX: 50, clientY: 50 }
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...press, bubbles: true, cancelable: true }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...press, bubbles: true, cancelable: true }))
    expect(
      onSelect,
      'this harness must be ABLE to produce a point selection at all, or the primary test\'s negative ' +
        'assertion (no point selection from a ghost click) would be vacuous rather than meaningful',
    ).toHaveBeenCalled()
  })

  // SDET-added: system-space-view "A ghost's asOf label reads as a formatted
  // stamp, on the mark and on its facts surface" (mark half).
  it('SDET-added: the ghost mark\'s sr-only asOf label is a world-ms-instant figure carrying its raw served value', () => {
    const { container } = stage()
    const label = screen.getByTestId(`sighting-mark-asof-${RECORD_ID}`)
    expect(label).toHaveAttribute('data-unit', 'world-ms-instant')
    expect(label).toHaveAttribute('data-raw', '42000')
    expect(label.textContent).toContain('Observed at ')
    expect(label.textContent).toContain('T+ 0d 00:00 ×1')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('SDET-added: on a scale-less mount the ghost mark\'s asOf still renders its T+ portion, with an absent suffix', () => {
    const { container } = stage({ scale: undefined })
    const label = screen.getByTestId(`sighting-mark-asof-${RECORD_ID}`)
    expect(label).toHaveAttribute('data-raw', '42000')
    expect(label.textContent).toContain('×—')
    assertFiguresMatchModule(container, { scale: undefined })
  })

  // SDET-added: system-space-view "A ghost's asOf label reads as a formatted
  // stamp, on the mark and on its facts surface" (facts-surface half — task
  // 7.3, `SpaceStage.tsx:708`'s on-hover "Observed at" line). No test in
  // this repo asserted `sighting-facts` at all before this change (verified
  // by grep), so this is new coverage, not a migration.
  it('SDET-added: hovering a ghost shows the sighting-facts surface with a world-ms-instant asOf figure', async () => {
    const { container } = stage()
    const ghost = screen.getByTestId(`sighting-mark-${RECORD_ID}`)
    fireEvent.pointerOver(ghost)
    const facts = await screen.findByTestId('sighting-facts')
    const asOf = screen.getByTestId('sighting-facts-asof')
    expect(asOf).toHaveAttribute('data-unit', 'world-ms-instant')
    expect(asOf).toHaveAttribute('data-raw', '42000')
    expect(facts.textContent).toContain('Observed at')
    assertFiguresMatchModule(container, { scale: 1 })
  })
})
