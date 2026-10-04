import { describe, it, expect } from 'vitest'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `docked-fleet-actions`, requirement *Rejection Reasons Map to
// Player-Facing Copy, Not Raw Server Text* (tasks.md 7.14, 10.10); consumed
// by `system-space-view`'s *Burn Commit Reports Its Outcome* and *Jump
// Commit*, and by `galaxy-view`'s *Jump Commit*.
//
// THE CONTRACT: `frontend/lib/rejection-copy.ts` is the ONE shared module
// three capabilities consume (design.md Decision 13). It exports:
//
//   commandErrorReason(error: unknown): string | undefined
//     -- the shared extractor: prefers the response body over
//        `Error.message`, so a genuinely bodyless response yields undefined
//        rather than leaking apiClient's synthesized "API Error: 404 ...".
//   burnErrorCopy(reason): string
//   mineErrorCopy(reason): string
//   holdErrorCopy(reason): string
//   releaseErrorCopy(reason): string
//   GENERIC_COMMAND_FAILURE: string
//   isQuotedCapExceeded(reason): boolean
//
// The existing per-verb modules (`lib/jump-copy.ts`, `lib/market-copy.ts`,
// `lib/refuel-copy.ts`) stay as they are; this module adds the three verbs
// that have no mapping today and the shared extractor + cap predicate the
// space view needs. The reason strings below are the REAL sentinel texts
// from `backend/fleet`, `backend/mine` and `backend/space`, read out of the
// source, not invented.
//
// VACUITY NOTES are inline per test. The load-bearing one: every copy
// assertion checks BOTH that the raw reason is absent from the output AND
// that the output is not the generic fallback — a mapping that returned the
// generic line for everything would otherwise pass "never shows raw text".

import {
  commandErrorReason,
  burnErrorCopy,
  mineErrorCopy,
  holdErrorCopy,
  releaseErrorCopy,
  isQuotedCapExceeded,
  GENERIC_COMMAND_FAILURE,
} from '@/lib/rejection-copy'

// The real server reason strings.
const R = {
  insufficientFuel: 'fleet: fuel cost exceeds available fuel',
  inTransit: 'fleet: fleet is in lane transit and has no position in either system',
  // Re-pointed (fix-burn-order-geometry-refusals task 3.1) from the raw `space:`
  // sentinel to the DESTINATION reason the server now serves; the cases below
  // that use it keep their intent (a clearance refusal maps to its own line).
  clearance: 'fleet: burn destination is at or inside the star-clearance radius',
  capExceeded: 'fleet: solved fuel cost exceeds the requested maxFuelTons cap',
  invalidCap: 'fleet: maxFuelTons must be a finite, non-negative number',
  accelCeiling: "fleet: commanded acceleration exceeds the fleet's derived ceiling",
  previewChannelHeld: 'fleet: preview unavailable while the movement channel is held by another run',
  mineNotDocked: 'mine: fleet is not docked to the target feature',
  mineOverHold: 'mine: requested tons exceeds free hold',
  mineDepleted: "mine: lode's remaining tonnage is already at or below zero",
  mineStation: 'mine: a trading station cannot be mined',
  mineUnknownKind: 'mine: feature does not carry the requested resource kind',
  holdReserve: 'fleet: no spendable fuel above the station-keeping reserve to hold on',
  holdNotOrbiting: 'fleet: station-keeping hold requires a fleet in an orbit park',
  releaseNotHolding: 'fleet: release requires a fleet currently station-keeping',
  quota: 'request: per-corporation write quota exceeded',
} as const

function assertMapped(copy: string, rawReason: string, what: string) {
  expect(copy.length, `${what}: copy must be non-empty`).toBeGreaterThan(0)
  expect(copy, `${what}: must not render the raw reason verbatim`).not.toContain(rawReason)
  expect(copy, `${what}: must not leak the package prefix`).not.toMatch(/^(fleet|mine|market|space|request):/)
  expect(copy, `${what}: must not be the generic fallback — this reason is distinguishable`).not.toBe(
    GENERIC_COMMAND_FAILURE,
  )
}

describe('lib/rejection-copy — the shared extractor', () => {
  it('SDET-added: the reason is taken from the response body, never from a bodyless transport message', () => {
    expect(commandErrorReason({ data: { error: R.insufficientFuel } })).toBe(R.insufficientFuel)
    expect(commandErrorReason({ data: R.insufficientFuel })).toBe(R.insufficientFuel)
    // apiClient synthesizes this message shape ONLY when the response had no
    // body. Returning it would re-open the fleet-id enumeration oracle a
    // bodyless 404 exists to close.
    expect(commandErrorReason({ message: 'API Error: 404 Not Found' })).toBeUndefined()
    expect(commandErrorReason({ message: 'API Error: 500 Internal Server Error' })).toBeUndefined()
    expect(commandErrorReason(undefined)).toBeUndefined()
    expect(commandErrorReason(null)).toBeUndefined()
    expect(commandErrorReason({})).toBeUndefined()
  })

  it('SDET-added: a plain Error carrying a real reason in its message is still extracted', () => {
    expect(commandErrorReason(new Error(R.clearance))).toBe(R.clearance)
  })
})

describe('lib/rejection-copy — burn commit', () => {
  // Scenario: A failed burn commit reports the mapped reason
  it('Scenario: A failed burn commit reports the mapped reason', () => {
    for (const [name, reason] of [
      ['insufficient fuel', R.insufficientFuel],
      ['in lane transit', R.inTransit],
      ['inside the star clearance', R.clearance],
      ['commanded acceleration above ceiling', R.accelCeiling],
    ] as const) {
      assertMapped(burnErrorCopy(reason), reason, `burn/${name}`)
    }
  })

  it('SDET-added: the three burn reasons the requirement names are distinguishable from one another', () => {
    const copies = [R.insufficientFuel, R.inTransit, R.clearance].map(burnErrorCopy)
    expect(new Set(copies).size, 'each named reason needs its own line, not one shared line').toBe(3)
  })

  // Scenario: A burn commit failure with no distinguishable reason still
  // reports safely  /  Scenario: An unmapped reason still renders safely
  it('Scenario: An unmapped reason still renders safely', () => {
    expect(burnErrorCopy(undefined)).toBe(GENERIC_COMMAND_FAILURE)
    expect(burnErrorCopy(null)).toBe(GENERIC_COMMAND_FAILURE)
    expect(burnErrorCopy('')).toBe(GENERIC_COMMAND_FAILURE)
    // A reason invented later, with no copy update.
    const future = 'fleet: some reason nobody has written copy for yet'
    expect(burnErrorCopy(future)).toBe(GENERIC_COMMAND_FAILURE)
    expect(burnErrorCopy(future)).not.toContain('some reason nobody')
  })

  it('SDET-added: the generic fallback is non-technical', () => {
    expect(GENERIC_COMMAND_FAILURE).not.toMatch(/[45]\d\d|stack|undefined|null|Error:/)
    expect(GENERIC_COMMAND_FAILURE.length).toBeGreaterThan(10)
  })

  it('SDET-added: the quoted-cap rejection is identifiable as such, not merely as a message', () => {
    // *A cap rejection re-quotes in flow instead of failing the interaction*
    // needs a PREDICATE, not just copy: the view must branch on it.
    expect(isQuotedCapExceeded(R.capExceeded)).toBe(true)
    expect(isQuotedCapExceeded(R.insufficientFuel)).toBe(false)
    expect(isQuotedCapExceeded(R.invalidCap)).toBe(false)
    expect(isQuotedCapExceeded(undefined)).toBe(false)
  })
})

describe('lib/rejection-copy — mine commit', () => {
  // Scenario: A failed mine commit toasts the reason
  it('Scenario: A failed mine commit toasts the reason', () => {
    for (const [name, reason] of [
      ['over free hold', R.mineOverHold],
      ['depleted lode', R.mineDepleted],
      ['not docked', R.mineNotDocked],
      ['unknown kind', R.mineUnknownKind],
    ] as const) {
      assertMapped(mineErrorCopy(reason), reason, `mine/${name}`)
    }
  })

  it('SDET-added: a station is reported as un-mineable in its own words, not as a depleted lode', () => {
    // M11 gave the station its own rejection precisely so this reads
    // differently. Collapsing it into the depleted-lode line would tell a
    // player to try a different tonnage at a body that can never be mined.
    assertMapped(mineErrorCopy(R.mineStation), R.mineStation, 'mine/station')
    expect(mineErrorCopy(R.mineStation)).not.toBe(mineErrorCopy(R.mineDepleted))
  })

  it('Scenario: An unmapped reason still renders safely (mine)', () => {
    expect(mineErrorCopy('mine: a reason with no copy')).toBe(GENERIC_COMMAND_FAILURE)
    expect(mineErrorCopy(undefined)).toBe(GENERIC_COMMAND_FAILURE)
  })
})

describe('lib/rejection-copy — station-keeping hold and release', () => {
  // Scenario: A hold at or below the reserve is rejected and toasted, not
  // silently accepted  (the COPY half; the interaction half is asserted in
  // components/space/FleetActionsPanel.test.tsx)
  it('Scenario: A hold at or below the reserve is rejected and toasted, not silently accepted (copy names the reserve)', () => {
    const copy = holdErrorCopy(R.holdReserve)
    assertMapped(copy, R.holdReserve, 'hold/reserve')

    // The requirement is explicit and this is the sentence it was written to
    // forbid: a fleet holding 0.4 t against a 1 t reserve hits this, so copy
    // reading "no fuel" would be FALSE and unactionable.
    expect(copy.toLowerCase(), 'must name the reserve as the boundary').toMatch(/reserve/)
    expect(copy.toLowerCase(), 'must not claim the fleet has no fuel').not.toMatch(
      /\b(no fuel|out of fuel|empty tank|no remaining fuel)\b/,
    )
    // The player's actual remedy.
    expect(copy.toLowerCase(), 'should point at refuelling, the actual remedy').toMatch(/refuel/)
  })

  it('SDET-added: the not-orbiting hold rejection is distinct from the reserve rejection', () => {
    assertMapped(holdErrorCopy(R.holdNotOrbiting), R.holdNotOrbiting, 'hold/not-orbiting')
    expect(holdErrorCopy(R.holdNotOrbiting)).not.toBe(holdErrorCopy(R.holdReserve))
  })

  it('SDET-added: release maps its own rejection and falls back safely', () => {
    assertMapped(releaseErrorCopy(R.releaseNotHolding), R.releaseNotHolding, 'release/not-holding')
    expect(releaseErrorCopy(undefined)).toBe(GENERIC_COMMAND_FAILURE)
  })
})

describe('lib/rejection-copy — the per-corporation write quota', () => {
  // Scenario: A distinguishable server reason renders as player-facing copy
  // (the 429 the requirement names explicitly, on sell and refuel)
  it('Scenario: A distinguishable server reason renders as player-facing copy (the write-quota 429)', async () => {
    const { saleErrorCopy, GENERIC_SALE_FAILURE } = await import('@/lib/market-copy')
    const { refuelErrorCopy, GENERIC_REFUEL_FAILURE } = await import('@/lib/refuel-copy')
    expect(saleErrorCopy(R.quota)).not.toBe(GENERIC_SALE_FAILURE)
    expect(saleErrorCopy(R.quota)).not.toContain(R.quota)
    expect(refuelErrorCopy(R.quota)).not.toBe(GENERIC_REFUEL_FAILURE)
    expect(refuelErrorCopy(R.quota)).not.toContain(R.quota)
  })
})


// ---------------------------------------------------------------------------
// fix-burn-order-geometry-refusals task 3.1 — docked-fleet-actions, *A Served
// Burn Solve Refusal Reads as Player-Facing Copy on Commit and on Every Stop
// Surface*. The four reason strings are the literals served by backend/fleet
// (design.md Decision 6, impl-contract 3.1), typed out here verbatim; the four
// lines are typed out from the delta. The Go side pins the same four literals
// in its own tests (task 2.7); there is no shared fixture file.
// ---------------------------------------------------------------------------

const SERVED = {
  origin: 'fleet: burn origin is at or inside the star-clearance radius',
  destination: 'fleet: burn destination is at or inside the star-clearance radius',
  minimumArc: 'fleet: burn curve is below the minimum arc length',
  absent: 'fleet: target body is not present in this system',
} as const

const FRAGMENT = {
  origin: 'origin is at or inside',
  destination: 'destination is at or inside',
  minimumArc: 'minimum arc length',
  absent: 'target body is not present',
} as const

const LINE = {
  origin: 'This fleet is too close to the star to take a course from here right now.',
  destination: 'That destination is too close to the star to fly to.',
  minimumArc: 'That burn is too short to fly. Choose a target farther away.',
  absent: 'That body is not in this system. Pick another target.',
} as const

type Refusal = keyof typeof SERVED
const REFUSALS = Object.keys(SERVED) as Refusal[]

describe('lib/rejection-copy — the four served burn solve refusals', () => {
  // Scenario: Each of the four refusals displays its own line
  it('Scenario: Each of the four refusals displays its own line', () => {
    for (const k of REFUSALS) {
      expect(burnErrorCopy(SERVED[k]), `${k}: the pinned line, verbatim`).toBe(LINE[k])
      expect(burnErrorCopy(SERVED[k]), `${k}: must not be the generic failure line`).not.toBe(GENERIC_COMMAND_FAILURE)
      expect(burnErrorCopy(SERVED[k]), `${k}: must not render the raw reason`).not.toContain(SERVED[k])
      expect(burnErrorCopy(SERVED[k]), `${k}: must not leak the package prefix`).not.toContain('fleet:')
    }
    // Pairwise different.
    const lines = REFUSALS.map((k) => burnErrorCopy(SERVED[k]))
    expect(new Set(lines).size).toBe(4)
  })

  it('Scenario: Each of the four refusals displays its own line (not the absent fleet or destination line)', () => {
    // The `not found` line reads "That fleet or destination is not available."
    // The absent-body reason must not be caught by it, and none of the four
    // may display it.
    const notFoundLine = burnErrorCopy('fleet: fleet not found')
    expect(notFoundLine).not.toBe(GENERIC_COMMAND_FAILURE) // the line exists and is distinct
    for (const k of REFUSALS) {
      expect(burnErrorCopy(SERVED[k]), `${k}: must not display the absent fleet-or-destination line`).not.toBe(notFoundLine)
    }
    // The absent-body reason is caught by its own needle, ahead of `not found`.
    expect(burnErrorCopy(SERVED.absent)).toBe(LINE.absent)
  })

  // Scenario: No refusal reason contains another refusal's fragment, nor the generic not-found text
  it('Scenario: No refusal reason contains another refusal\'s fragment, nor the generic not-found text', () => {
    for (const k of REFUSALS) {
      expect(SERVED[k], `${k} contains its own fragment`).toContain(FRAGMENT[k])
      for (const other of REFUSALS) {
        if (other !== k) expect(SERVED[k], `${k} must not contain ${other}'s fragment`).not.toContain(FRAGMENT[other])
      }
      expect(SERVED[k], `${k} must not contain the generic not-found text`).not.toContain('not found')
      // The mapping is keyed by the fragment: the fragment alone selects the
      // refusal's own line, so no refusal can be caught by another's needle.
      expect(burnErrorCopy(FRAGMENT[k]), `${k}: its fragment alone selects its own line`).toBe(LINE[k])
    }
  })

  // The origin and destination reasons share the words "star-clearance
  // radius": a needle on those words (the legacy `star-clearance` needle)
  // would serve one line for both. The two lines must be different.
  it('SDET-added: the origin and destination reasons, which share "star-clearance", still map to different lines', () => {
    expect(burnErrorCopy(SERVED.origin)).not.toBe(burnErrorCopy(SERVED.destination))
    expect(burnErrorCopy(SERVED.origin)).toBe(LINE.origin)
    expect(burnErrorCopy(SERVED.destination)).toBe(LINE.destination)
  })

  // RULING 11: the legacy `star-clearance` / `star clearance` needles are
  // replaced by the origin and destination needles, so the raw `space:`
  // sentinel text (which the server no longer serves) is not mapped to either
  // refusal's line by a leftover needle.
  it('SDET-added (RULING 11): the legacy raw space sentinel text no longer maps to a refusal line', () => {
    const legacy = 'space: endpoint at or inside the star-clearance radius'
    expect(burnErrorCopy(legacy)).toBe(GENERIC_COMMAND_FAILURE)
  })

  it('SDET-added: the reasons are matched case-insensitively and extracted from a response body', () => {
    expect(burnErrorCopy(SERVED.origin.toUpperCase())).toBe(LINE.origin)
    expect(burnErrorCopy(commandErrorReason({ data: { error: SERVED.minimumArc } }))).toBe(LINE.minimumArc)
    expect(burnErrorCopy(commandErrorReason({ data: { error: SERVED.absent } }))).toBe(LINE.absent)
  })

  it('SDET-added: the existing burn lines are unchanged by the new needles', () => {
    expect(burnErrorCopy(R.insufficientFuel)).toBe('That burn needs more fuel than this fleet is carrying.')
    expect(burnErrorCopy(R.inTransit)).toBe('This fleet is crossing a lane and cannot be given a course yet.')
    expect(burnErrorCopy(R.accelCeiling)).toBe("That burn is harder than this fleet's drives can push.")
    expect(burnErrorCopy(R.previewChannelHeld)).toBe('This fleet is busy with another run. Cancel it first.')
  })
})
