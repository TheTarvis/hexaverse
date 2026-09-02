// Player-facing copy for the refuel verb's server rejection reasons
// (add-fuel-as-cargo; `fuel-purchase`'s own rejections, task 6.9 "Rejections
// Report a Distinguishable Reason"; board-view "Refuel Commit" — a failed
// refuel toasts player-facing copy, never the raw sentinel string). Same
// seam and precedent as `lib/market-copy.ts` (sell) and `lib/jump-copy.ts`
// (jump).
//
// The server reports a distinguishable reason for every rejection so the
// CLIENT can say something useful. Raw reason strings are diagnostics, not
// UI: they carry a package prefix ("fuel-purchase: ...") and describe
// mechanism rather than what the player should do next. This map is the
// seam between the two.
//
// Unmapped reasons — including a bodyless 404 (fuel-purchase "Refuel
// Requires Fleet Ownership, 404 Before Any Other Precondition" is one of
// this repo's existence-hiding rejections, exactly like the fleet command
// endpoints jump-copy.ts already documents this trap for) — fall back to one
// stable, non-technical generic line rather than leaking the raw string.

export const GENERIC_REFUEL_FAILURE = 'That refuel could not be completed. Please try again.'

// Keyed by a distinctive fragment of the server's reason, so the mapping
// survives small wording changes on either side.
const COPY: ReadonlyArray<readonly [needle: string, copy: string]> = [
  // The existence-hiding rejections (ownership 404, docked-station 404)
  // share one line, same precedent as market-copy's own four-reasons-one-line
  // rule — saying more would undo the hiding.
  ['not found', 'That fleet or station is not available.'],

  ['not docked', 'Dock at the station before refueling.'],
  ['positive finite', 'Enter a tonnage greater than zero.'],
  ['free hold', 'Your hold cannot take that much fuel.'],
  ['available credits', "You can't afford that much fuel."],
  ['available balance', "You can't afford that much fuel."],

  ['non-positive', 'Fuel is not available for purchase right now.'],
  ['misconfigured', 'Fuel is not available for purchase right now.'],
  ['overflow', 'That amount is too large to price. Try a smaller tonnage.'],

  ['busy', 'The station is busy right now. Please try again.'],
  ['already used with different parameters', 'That refuel was already submitted with different details.'],
  ['unresolved ledger divergence', 'Your account is under review and cannot trade right now.'],
  ['operation key', 'Something went wrong submitting that refuel. Please try again.'],
  ['quota', "You've hit your trading limit for now. Try again later."],
]

// refuelErrorCopy maps a server rejection reason to player-facing text.
export function refuelErrorCopy(reason: string | undefined | null): string {
  if (!reason || BODYLESS_FALLBACK_MESSAGE.test(reason)) return GENERIC_REFUEL_FAILURE
  const lower = reason.toLowerCase()
  for (const [needle, copy] of COPY) {
    if (lower.includes(needle)) return copy
  }
  return GENERIC_REFUEL_FAILURE
}

// apiClient's createApiError (lib/api-client.ts) synthesizes this exact
// shape for its Error `message` precisely when the response carried NO body
// at all — the one reliable, documented transport-layer signal that there is
// no real server reason to key on. A genuine server reason never takes this
// shape.
const BODYLESS_FALLBACK_MESSAGE = /^API Error: \d+ /

// refuelErrorReason extracts the server's distinguishable rejection reason
// from a thrown ApiError, preferring the response body (`ApiError.data`)
// over `Error.message` — `message` is apiClient's own synthesized
// transport-layer summary (`API Error: ${status} ${statusText}`) whenever a
// response carries no body, never a real server reason. Falls back to
// `message` for a plain `Error(reason)` test double that carries no `data`
// at all but a real reason string in `message`.
export function refuelErrorReason(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const data = (error as { data?: unknown }).data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const reason = (data as Record<string, unknown>).error
    if (typeof reason === 'string' && reason.trim()) return reason
  }
  const message = (error as { message?: unknown }).message
  if (typeof message === 'string' && message.trim()) return message
  return undefined
}
