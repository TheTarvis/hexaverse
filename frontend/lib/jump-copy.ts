// Player-facing copy for the jump command's server rejection reasons
// (replace-observation-with-sightings tasks.md 4.16; board-view "Jump
// Commit" — "on failure an error toast whose copy is mapped from the
// server's distinguishable rejection reason ... never the raw reason
// string"; board-view "Rejection Reasons Map to Player-Facing Copy, Not Raw
// Server Text" — the pre-existing sell-endpoint mapping this extends to the
// jump command). Same seam and precedent as `lib/market-copy.ts`.
//
// The server reports a distinguishable reason for every rejection so the
// CLIENT can say something useful. Raw reason strings are diagnostics, not
// UI: they carry package prefixes ("fleet: ...") and describe mechanism
// rather than what the player should do next. This map is the seam between
// the two.
//
// Unmapped reasons — including a bodyless 5xx, whose apiClient-generated
// message never carries a real server reason at all — fall back to one
// stable, non-technical generic line rather than leaking the raw string.

export const GENERIC_JUMP_FAILURE = 'The jump could not be completed. Please try again.'

// Keyed by a distinctive fragment of the server's reason, so the mapping
// survives small wording changes on either side.
const COPY: ReadonlyArray<readonly [needle: string, copy: string]> = [
  ['attach', 'Dock at a lane gate before jumping.'],
  ['transit', 'The fleet is already crossing a lane.'],
  ['running', "The fleet's engines are already committed to another order."],
  // ErrDestinationNotReady (task 10.13, backend/fleet/service.go), mapped by
  // handler.go's respond() to a 503 — the jump commit failed closed because
  // the destination's lane horizon could not be materialized. Distinct from
  // GENERIC_JUMP_FAILURE (both read as "try again", but this one names the
  // reason and is asserted as a deliberate, dedicated entry by
  // jump-copy.test.ts, not a coincidental fallback match).
  ['materialized', "The destination isn't ready yet. Try again in a moment."],
  // Covers both "not found" (lane lookup) and the deliberately
  // existence-hiding bodyless 404 a foreign-corp jump receives — mirroring
  // market-copy's own four-reasons-one-line precedent. Callers MUST NOT feed
  // this function the bodyless-404 apiClient fallback text
  // (`API Error: 404 Not Found`) for a genuinely bodyless response — that
  // would re-open the fleet-id enumeration oracle (fleet-movement "Fleet
  // Command Endpoints Are Restricted to the Owning Corporation"). Extract
  // the reason from the response body (`ApiError.data`) and pass `undefined`
  // when there is none, so the fallback below fires instead.
  ['not found', 'That lane could not be found.'],
]

// apiClient's createApiError (lib/api-client.ts) synthesizes this exact
// shape for its Error `message` (and, since jumpErrorReason below prefers
// `data` but a plain string `data` is possible too, potentially as a raw
// reason) precisely when the response carried NO body at all — it is the
// one reliable, documented transport-layer signal that there is no real
// server reason to key on. A genuine server reason never takes this shape.
// A bodyless 404 (a foreign-corp jump — fleet-movement "Fleet Command
// Endpoints Are Restricted to the Owning Corporation") MUST fall through to
// GENERIC_JUMP_FAILURE rather than accidentally matching a COPY needle
// (e.g. "Not Found" colliding with the 'not found' entry), or the
// existence-hiding requirement is undone.
const BODYLESS_FALLBACK_MESSAGE = /^API Error: \d+ /

// jumpErrorCopy maps a server rejection reason to player-facing text.
export function jumpErrorCopy(reason: string | undefined | null): string {
  if (!reason || BODYLESS_FALLBACK_MESSAGE.test(reason)) return GENERIC_JUMP_FAILURE
  const lower = reason.toLowerCase()
  for (const [needle, copy] of COPY) {
    if (lower.includes(needle)) return copy
  }
  return GENERIC_JUMP_FAILURE
}

// jumpErrorReason extracts the server's distinguishable rejection reason
// from a thrown ApiError, preferring the response body (`ApiError.data`)
// over `Error.message` — `message` is apiClient's own synthesized
// transport-layer summary (`API Error: ${status} ${statusText}`) whenever a
// response carries no body, never a real server reason. Preferring `data`
// means a genuinely bodyless response yields `undefined` here (and
// `jumpErrorCopy` guards the synthesized shape too, belt and braces, since
// this function still falls back to `message` for a plain `Error(reason)`
// test double that carries no `data` at all but a real reason string in
// `message`).
export function jumpErrorReason(error: unknown): string | undefined {
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
