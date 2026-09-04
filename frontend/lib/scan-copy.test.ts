// RED-phase tests for openspec change add-scan-and-sightings-surface,
// tasks.md 5.7, 5.8, 5.9, 6.11 — `lib/scan-copy.ts` (NEW FILE, per
// link8b-impl-contract.md §1.6):
//
//   export function scanErrorCopy(reason: string | undefined): string
//   export function isStaleTargetRejection(reason: string | undefined): boolean
//   export function scanFizzleCopy(reasonCode: string | undefined): string
//   export const GENERIC_SWEEP_RESULT = 'The sweep returned nothing.'
//
// The five COMMIT-rejection needles are pinned verbatim in the contract
// (§1.6), against the EXACT server strings already in the tree:
//   scan host does not resolve      -> hostUnresolved-shaped rejection
//   target beyond range             -> outOfRange-shaped rejection
//   occluded by the star            -> occluded-shaped rejection
//   already has an active action    -> a sweep already running
//   lane transit                    -> scanner in lane transit
//
// The six FIZZLE reason CODES (system-space-view "A Settled Sweep Reports
// Its Outcome") are the exact, already-produced spellings
// (link8b-impl-contract.md §1.5) plus 3.13's sixth:
//   outOfRange, occluded, leftSystem, laneTransit, hostUnresolved, alreadySettled
//
// EXPECTED RED TODAY: `Cannot find module './scan-copy'` — the file does
// not exist yet (task 5's whole client half is unbuilt).

import { describe, it, expect } from 'vitest'
import {
  scanErrorCopy,
  isStaleTargetRejection,
  scanFizzleCopy,
  GENERIC_SWEEP_RESULT,
} from './scan-copy'

describe('scanErrorCopy — commit-rejection copy (system-space-view "...Reports Its Rejection in Player Copy")', () => {
  // Scenario: A commit sends the served host id / No raw server text
  // reaches the player — five distinct rejections read as five distinct
  // statements.
  it.each([
    ['fleet: scan host does not resolve to a body or an own fleet in this system'],
    ['disclosure: focused-scan target beyond range'],
    ['disclosure: focused-scan target occluded by the star'],
    ['actor already has an active action'],
    ['fleet is in lane transit'],
  ])('maps the server reason %j to non-blank, non-raw copy', (raw) => {
    const copy = scanErrorCopy(raw)
    expect(copy).toBeTruthy()
    expect(copy).not.toBe(raw)
    expect(copy.toLowerCase()).not.toContain('disclosure:')
    expect(copy.toLowerCase()).not.toContain('fleet:')
  })

  it('gives each of the five reasons its OWN distinct copy', () => {
    const reasons = [
      'fleet: scan host does not resolve to a body or an own fleet in this system',
      'disclosure: focused-scan target beyond range',
      'disclosure: focused-scan target occluded by the star',
      'actor already has an active action',
      'fleet is in lane transit',
    ]
    const copies = new Set(reasons.map((r) => scanErrorCopy(r)))
    expect(copies.size).toBe(reasons.length)
  })

  // Scenario: An unmapped commit rejection reason renders safely.
  it('falls back to a generic, non-technical message for an unrecognized reason', () => {
    const copy = scanErrorCopy('some entirely novel server reason nobody mapped')
    expect(copy).toBeTruthy()
    expect(copy.toLowerCase()).not.toContain('novel')
  })

  it('falls back for undefined (a genuinely bodyless rejection)', () => {
    expect(scanErrorCopy(undefined)).toBeTruthy()
  })

  // SDET-added boundary probe: case-insensitivity, matching the sibling
  // copy modules' own `.toLowerCase()` convention.
  it('matches needles case-insensitively', () => {
    const copy = scanErrorCopy('DISCLOSURE: FOCUSED-SCAN TARGET BEYOND RANGE')
    expect(copy).not.toBe(scanErrorCopy('some entirely novel server reason nobody mapped'))
  })
})

describe('isStaleTargetRejection — the three "target went stale" rejections (task 5.9)', () => {
  it.each([
    ['fleet: scan host does not resolve to a body or an own fleet in this system'],
    ['disclosure: focused-scan target beyond range'],
    ['disclosure: focused-scan target occluded by the star'],
  ])('is true for %j', (raw) => {
    expect(isStaleTargetRejection(raw)).toBe(true)
  })

  it.each([['actor already has an active action'], ['fleet is in lane transit'], [undefined]])(
    'is false for %j (not a stale-target rejection)',
    (raw) => {
      expect(isStaleTargetRejection(raw as string | undefined)).toBe(false)
    },
  )
})

describe('scanFizzleCopy — the six served reason codes, distinct player copy (task 6.11)', () => {
  const codes = ['outOfRange', 'occluded', 'leftSystem', 'laneTransit', 'hostUnresolved', 'alreadySettled']

  it('gives each of the six reason codes its own distinct copy', () => {
    const copies = new Set(codes.map((c) => scanFizzleCopy(c)))
    expect(copies.size).toBe(codes.length)
  })

  it.each(codes.map((c) => [c]))('never displays the raw reason code %j', (code) => {
    const copy = scanFizzleCopy(code)
    expect(copy.toLowerCase()).not.toContain(code.toLowerCase())
  })

  // Scenario: An unrecognized reason code degrades to a generic report.
  it('maps an unrecognized reason code to GENERIC_SWEEP_RESULT', () => {
    expect(scanFizzleCopy('some-future-reason-code')).toBe(GENERIC_SWEEP_RESULT)
  })

  // Scenario: Filed-vs-fizzled is decided by reasonCode presence — an
  // ABSENT reason code is not this function's concern (the caller decides
  // filed-vs-fizzled before calling it), but calling it with undefined must
  // still degrade safely rather than throw or return blank text.
  it('degrades safely (never blank, never throws) for an undefined reason code', () => {
    expect(() => scanFizzleCopy(undefined)).not.toThrow()
    expect(scanFizzleCopy(undefined)).toBeTruthy()
  })
})
