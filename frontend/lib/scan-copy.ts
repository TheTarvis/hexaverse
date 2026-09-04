// Player-facing copy for the focused-scan verb (openspec change
// `add-scan-and-sightings-surface`, `system-space-view`: *A Focused Scan
// Commits Against a Listed Target and Reports Its Rejection in Player
// Copy*, *A Settled Sweep Reports Its Outcome, Including Each Fizzle
// Reason, in Player Copy*). Matches the per-verb precedent (`jump-copy.ts`,
// `market-copy.ts`, `refuel-copy.ts`) rather than growing
// `rejection-copy.ts`, which is the SHARED module three capabilities
// consume — this one is scan's alone (link8b-impl-contract.md §1.6).
//
// TWO DISTINCT MAPS, on purpose. A commit REJECTION is a server error
// string (`{"error": "..."}`), matched by a distinctive fragment exactly as
// every sibling copy module does. A settled sweep's FIZZLE is a persisted
// `reasonCode` — one of six exact, already-produced spellings
// (link8b-impl-contract.md §1.5/3.13) — matched by EQUALITY, never by
// substring: a reason code is a stable enum member, not diagnostic prose,
// and pattern-matching one the way a raw error string is matched would be
// solving a problem this surface does not have.

export const GENERIC_SWEEP_RESULT = 'The sweep returned nothing.'

const GENERIC_COMMIT_FAILURE = 'The sweep could not be committed. Please try again.'

// The five commit-rejection needles, pinned verbatim against the exact
// server strings already in the tree (link8b-impl-contract.md §1.6). Order
// matters only in that every needle is distinct enough not to collide.
const COMMIT_REJECTION_COPY: ReadonlyArray<readonly [needle: string, copy: string]> = [
  ['scan host does not resolve', 'That host no longer resolves to a scannable target.'],
  ['target beyond range', 'That host is out of sensor range.'],
  ['occluded by the star', 'The star is blocking the sightline to that host.'],
  ['already has an active action', 'This fleet is already running a sweep.'],
  ['lane transit', 'This fleet is crossing a lane and cannot sweep right now.'],
]

// The three rejections that mean "the listed target went stale between the
// read and the commit" (task 5.9) — presented as the sweep no longer being
// possible, with an in-flow target-list refetch, never as an application
// error.
const STALE_TARGET_NEEDLES = ['scan host does not resolve', 'target beyond range', 'occluded by the star']

/** Player-facing copy for a focused-scan commit rejection. */
export function scanErrorCopy(reason: string | undefined): string {
  if (!reason) return GENERIC_COMMIT_FAILURE
  const lower = reason.toLowerCase()
  for (const [needle, copy] of COMMIT_REJECTION_COPY) {
    if (lower.includes(needle)) return copy
  }
  return GENERIC_COMMIT_FAILURE
}

/**
 * Whether a commit rejection is one of the three "target went stale"
 * rejections — out of range, occluded, or no longer resolving. The scan
 * control refetches the target list in flow for these, rather than
 * presenting an application-error state (task 5.9).
 */
export function isStaleTargetRejection(reason: string | undefined): boolean {
  if (!reason) return false
  const lower = reason.toLowerCase()
  return STALE_TARGET_NEEDLES.some((needle) => lower.includes(needle))
}

// The six served fizzle reason codes (link8b-impl-contract.md §1.5, plus
// 3.13's sixth), matched by EXACT equality — these are enum members off the
// resolver, not prose to pattern-match.
const FIZZLE_COPY: Readonly<Record<string, string>> = {
  outOfRange: 'The scanning fleet was out of range when the pulse reached its target.',
  occluded: 'The star was blocking the sightline when the pulse reached its target.',
  leftSystem: 'The scanning fleet had left the system before the sweep completed.',
  laneTransit: 'The scanning fleet was in lane transit when the sweep completed.',
  hostUnresolved: 'The swept host no longer resolved by the time the sweep completed.',
  alreadySettled: 'A racing read had already settled this sweep.',
}

/**
 * Player-facing copy for a settled sweep's served `reasonCode`. ANY served
 * code is a fizzle (the caller decides filed-vs-fizzled on the code's
 * presence, never here); an unrecognized code — including `undefined`,
 * which this function's caller should not ordinarily pass, but which must
 * still degrade safely — maps to the generic sweep-returned-nothing line,
 * never to blank text or the raw code.
 */
export function scanFizzleCopy(reasonCode: string | undefined): string {
  if (!reasonCode) return GENERIC_SWEEP_RESULT
  // `Object.hasOwn`, never a bare `FIZZLE_COPY[reasonCode] ?? ...` lookup: a
  // server-served string this client does not recognize is untrusted input
  // reaching a plain-object index, and a reason code of e.g. `constructor`
  // or `toString` resolves through Object.prototype to a FUNCTION, which
  // `??` does not catch (a function is neither null nor undefined) — the
  // settled report would then try to render that function as a React child
  // and throw, taking the whole report down instead of degrading to
  // GENERIC_SWEEP_RESULT as *An unrecognized reason code degrades to a
  // generic report* requires.
  return Object.hasOwn(FIZZLE_COPY, reasonCode) ? FIZZLE_COPY[reasonCode] : GENERIC_SWEEP_RESULT
}
