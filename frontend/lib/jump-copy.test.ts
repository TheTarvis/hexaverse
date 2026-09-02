// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 4.18's test half: "Create frontend/lib/jump-copy.test.ts, which
// does not exist today despite its precedent frontend/lib/market-copy.test.ts
// existing, covering each mapped reason plus the unmapped-reason fallback to
// GENERIC_JUMP_FAILURE."
// (board-view "Jump Commit" / galaxy-view "Jump Commit" — "A failed jump
// commit toasts the reason"; "A failure with no distinguishable reason
// still toasts safely"; fleet-movement "Jump Arrival Parks Near the
// Destination Gate, Unmasked" — "A jump toward a destination whose horizon
// cannot be materialized is rejected".)
//
// Shape mirrors market-copy.test.ts: real server reason text (pulled from
// backend/fleet/service.go's actual sentinel .Error() strings and
// backend/fleet/handler.go's actual literal wire bodies, not invented
// prose) mapped to player-facing copy.
//
// OF THE FIVE REASON CONCEPTS THIS CHANGE NAMES, ONE IS DELIBERATELY NEVER
// MAPPED (ownership — folds to the generic fallback by spec, adversary MAJOR
// F's ruling below) AND ONE HAS NO PINNABLE EXACT SERVER TEXT YET
// (lane-incidence — a server-side gap, reported separately) — both flagged
// here and in this SDET's handoff report, not silently guessed around:
//
//   - "fleet not owned by the requester": fleet/handler.go's
//     commandedFleetId (backend/fleet/handler.go) responds through the
//     EXACT SAME sentinel and bodyless 404 as "fleet does not exist"
//     (`h.respond(c, nil, ErrNotFound)` in both places) — a DELIBERATE
//     existence-hiding design, the same shape market's own four
//     existence-hiding rejections already share one line for
//     (market-copy.ts's own comment: "Saying more would undo the hiding").
//     REVISED 2026-09-01 (SDET, cause: adversary MAJOR F ruling —
//     board-view/galaxy-view's own ADDED scenario "A jump against a fleet
//     the requester does not own toasts generically" requires "the generic
//     fallback toast ... with no copy that would distinguish the fleet
//     from one that does not exist"; Jump Commit's own requirement text
//     now states this reason is "deliberately NOT among" the mapped ones
//     and "falls to the generic fallback copy rather than to a mapped
//     reason"). This SDET's original assertion here treated apiClient's
//     synthesized `API Error: 404 Not Found` text as correctly matching
//     the EXISTING 'not found' COPY entry ("That lane could not be
//     found.") — that is exactly the defect the ruling names: a bodyless
//     404 must fall through to GENERIC_JUMP_FAILURE, never to copy that
//     names a lane when the actual problem is an unowned/nonexistent
//     fleet. The corrected design (task 4.18, amended) has
//     `jumpErrorCopy` keyed on the response BODY's reason, never on
//     apiClient's synthesized transport string — a bodyless 404 carries no
//     body reason to pass in, so it falls to the fallback by construction.
//     Test revised below to pin the CORRECT behavior; it is RED until the
//     developer lands 4.18's amended production half, which is expected
//     and correct at this handoff.
//
//   - "lane not incident to the fleet's current system": THE CLIENT SIDE
//     TURNS OUT TO ALREADY BE COVERED, but ONLY because
//     galaxy.ErrLaneNotFound's own message happens to end "...lane not
//     found for this system", which the EXISTING 'not found' COPY entry
//     already matches (confirmed below — that test is GREEN, not red). The
//     REAL, GENUINE production gap is entirely server-side, reported to the
//     orchestrator/developer rather than silently worked around:
//     fleet.Service.Jump wraps galaxy.ErrLaneNotFound as
//     `fmt.Errorf("fleet: resolving lane crossing: %w", err)` when a laneId
//     is not incident to the fleet's system, but fleet/handler.go's
//     respond() switch has NO case for it — it falls through to the
//     generic `err != nil` branch, a BODYLESS 500. A bodyless 500 never
//     reaches jump-copy.ts with any distinguishable text at all (apiClient's
//     fallback is `API Error: 500 Internal Server Error`, matching nothing),
//     so despite the CLIENT mapping already being adequate, this reason is
//     NOT YET distinguishable end-to-end. Closing it needs a new respond()
//     case (e.g. mapping errors.Is(err, galaxy.ErrLaneNotFound) to a 4xx
//     with an error body) — production code, out of this SDET's scope,
//     reported separately rather than fixed here.
//
// The other three reasons DO have exact, pinnable real server text and are
// tested against it directly: "not attached" (ErrJumpNotAttached.Error()),
// "already in lane transit" (the handler's own literal wire string, distinct
// from ErrFleetInTransit.Error()'s longer internal-signal text), and
// "destination not ready" (ErrDestinationNotReady.Error(), task 10.13 — the
// retryable 503 reason).

import { describe, it, expect } from 'vitest'
import { jumpErrorCopy, GENERIC_JUMP_FAILURE } from './jump-copy'

describe('jumpErrorCopy', () => {
  it('maps "not attached to the named gate" using the real server sentinel text', () => {
    // backend/fleet/service.go: ErrJumpNotAttached.Error(), wired verbatim
    // into the response body by handler.go's respond().
    const reason = "fleet: jump requires attachment to the lane's own gate body"
    expect(jumpErrorCopy(reason)).toBe('Dock at a lane gate before jumping.')
  })

  it('maps "already in lane transit" using the real handler wire text', () => {
    // backend/fleet/handler.go's respond(): the literal string the handler
    // writes for ErrFleetInTransit — NOT ErrFleetInTransit.Error() itself
    // (a longer, internal-signal message never sent on the wire).
    const reason = 'fleet is in lane transit'
    expect(jumpErrorCopy(reason)).toBe('The fleet is already crossing a lane.')
  })

  it('maps "the destination\'s lane horizon could not be materialized" (task 10.13, retryable) to distinguishable, retry-oriented copy', () => {
    // backend/fleet/service.go: ErrDestinationNotReady.Error(), mapped to
    // 503 by handler.go's respond().
    const reason = "fleet: destination's lane horizon could not be materialized"
    const copy = jumpErrorCopy(reason)
    expect(copy.length).toBeGreaterThan(0)
    // Must be a DELIBERATE, dedicated entry — not merely a coincidence of
    // GENERIC_JUMP_FAILURE's own "Please try again." already satisfying a
    // loose retry-wording regex. Ruling this out is what makes the next
    // assertion non-vacuous.
    expect(copy).not.toBe(GENERIC_JUMP_FAILURE)
    // "with copy that reads as retryable" (tasks.md 4.18's own wording).
    expect(copy.toLowerCase()).toMatch(/try again|retry|shortly|moment/)
  })

  it('maps every wording of the destination-not-ready reason to the SAME copy (a genuine substring rule, not a coincidental one-string match)', () => {
    const exact = "fleet: destination's lane horizon could not be materialized"
    const wrappedDifferently = 'fleet: jump rejected: destination lane horizon could not be materialized right now'
    const mapped = jumpErrorCopy(exact)
    expect(mapped).not.toBe(GENERIC_JUMP_FAILURE)
    expect(jumpErrorCopy(wrappedDifferently)).toBe(mapped)
  })

  // REVISED 2026-09-01 (SDET) — cause: adversary MAJOR F ruling. board-view/
  // galaxy-view "A jump against a fleet the requester does not own toasts
  // generically": a bare, bodyless 404 (the exact shape a foreign-corp jump
  // gets — indistinguishable from a nonexistent fleet, deliberately) MUST
  // fall through to GENERIC_JUMP_FAILURE, never to copy that names a lane.
  // apiClient's synthesized `API Error: 404 Not Found` transport string is
  // NOT a server reason and must never be treated as one — the previous
  // version of this test asserted the opposite (that it correctly matched
  // the existing 'not found' entry), which is the defect the ruling found.
  // Kept RED until the developer's amended 4.18 lands (jumpErrorCopy keyed
  // on the response body's reason, not e.message, so a bodyless 404 has no
  // reason to pass in at all and falls to the fallback by construction).
  it('a bodyless 404 (a foreign-corp jump, indistinguishable from a nonexistent fleet) falls through to the GENERIC fallback, never to lane-specific copy', () => {
    // lib/api-client.ts's createApiError fallback for a response with no
    // JSON body: `API Error: ${status} ${statusText}`. MAJOR F's ruling
    // requires this exact literal be covered.
    const bodylessNotFound = 'API Error: 404 Not Found'
    expect(jumpErrorCopy(bodylessNotFound)).toBe(GENERIC_JUMP_FAILURE)
  })

  it('CLIENT SIDE ALREADY COVERED (see file header): "lane not incident to the fleet\'s current system" — once the underlying galaxy.ErrLaneNotFound text reaches the client — is already caught by the EXISTING "not found" entry (its own wrapped message literally ends "...lane not found for this system"). The remaining gap is server-side only: fleet/handler.go\'s respond() has no case for this error today, so it never reaches the client at all (falls to a bodyless 500) — reported separately, not fixed here', () => {
    // Verbatim substring from fleet.Service.Jump's own wrapped error:
    // fmt.Errorf("galaxy: lane %q not incident to system %q: %w", laneId, fromSystemId, ErrLaneNotFound)
    const reason = 'fleet: resolving lane crossing: galaxy: lane "lane_1_1_1_2" not incident to system "sys_1_1": galaxy: lane not found for this system'
    const copy = jumpErrorCopy(reason)
    expect(copy).not.toBe(GENERIC_JUMP_FAILURE)
    expect(copy.length).toBeGreaterThan(0)
    // Distinguishable from the OTHER named reasons — a lazy implementation
    // must not alias this to "not attached" or "already in transit" just
    // because it happens to also 4xx.
    expect(copy).not.toBe(jumpErrorCopy("fleet: jump requires attachment to the lane's own gate body"))
    expect(copy).not.toBe(jumpErrorCopy('fleet is in lane transit'))
  })

  it('never leaks a raw server reason for an unmapped rejection', () => {
    const copy = jumpErrorCopy('fleet: some brand new internal reason nobody mapped yet')
    expect(copy).toBe(GENERIC_JUMP_FAILURE)
    expect(copy).not.toContain('fleet:')
  })

  it('falls back safely for a response carrying no distinguishable reason at all (e.g. a bodyless 5xx)', () => {
    expect(jumpErrorCopy(undefined)).toBe(GENERIC_JUMP_FAILURE)
    expect(jumpErrorCopy(null)).toBe(GENERIC_JUMP_FAILURE)
    expect(jumpErrorCopy('')).toBe(GENERIC_JUMP_FAILURE)
    expect(jumpErrorCopy('API Error: 500 Internal Server Error')).toBe(GENERIC_JUMP_FAILURE)
  })

  it('never returns an empty string', () => {
    for (const reason of ['', 'anything', "fleet: jump requires attachment to the lane's own gate body"]) {
      expect(jumpErrorCopy(reason).length).toBeGreaterThan(0)
    }
  })
})
