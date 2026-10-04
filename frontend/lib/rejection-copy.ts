// Player-facing copy for the command verbs' server rejection reasons —
// burn, mine, station-keeping hold and release — plus the shared reason
// extractor and the quoted-cap predicate the space view branches on
// (openspec change `build-production-space-view`, `docked-fleet-actions`:
// *Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text*).
//
// THIS IS THE SHARED MODULE THREE CAPABILITIES CONSUME (design.md
// Decision 13): `docked-fleet-actions`'s own commands, `system-space-view`'s
// burn and jump commits, and `galaxy-view`'s jump commit. The existing
// per-verb modules — `lib/jump-copy.ts` (jump), `lib/market-copy.ts` (sell),
// `lib/refuel-copy.ts` (refuel) — stay where they are; this module adds the
// verbs that had no mapping at all and the two shared primitives.
//
// A raw reason string is a diagnostic, not UI: it carries a package prefix
// ("fleet: ...", "mine: ...") and describes mechanism rather than what the
// player should do next. An unmapped reason — including a bodyless 404,
// which this repo's existence-hiding rejections deliberately send — falls
// back to ONE stable, non-technical line rather than leaking the raw text.

export const GENERIC_COMMAND_FAILURE = 'That command could not be completed. Please try again.'

// apiClient's createApiError (lib/api-client.ts) synthesizes this exact
// message shape precisely when the response carried NO body — the one
// reliable transport-layer signal that there is no real server reason to key
// on. Surfacing it would re-open the fleet-id enumeration oracle that a
// bodyless 404 exists to close.
const BODYLESS_FALLBACK_MESSAGE = /^API Error: \d+ /

/**
 * The shared rejection-reason extractor: prefers the response body
 * (`ApiError.data`) over `Error.message`, and reports `undefined` for a
 * genuinely bodyless response rather than leaking apiClient's synthesized
 * transport summary. A plain `Error(reason)` carrying a real reason in its
 * message is still extracted, which is what test doubles and rethrown
 * server errors look like.
 */
export function commandErrorReason(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const data = (error as { data?: unknown }).data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const reason = (data as Record<string, unknown>).error
    if (typeof reason === 'string' && reason.trim()) return reason
  }
  const message = (error as { message?: unknown }).message
  if (typeof message === 'string' && message.trim() && !BODYLESS_FALLBACK_MESSAGE.test(message)) {
    return message
  }
  return undefined
}

type CopyMap = ReadonlyArray<readonly [needle: string, copy: string]>

// Keyed by a distinctive fragment of the server's reason, so the mapping
// survives small wording changes on either side.
function mappedCopy(reason: string | undefined | null, map: CopyMap): string {
  if (!reason || BODYLESS_FALLBACK_MESSAGE.test(reason)) return GENERIC_COMMAND_FAILURE
  const lower = reason.toLowerCase()
  for (const [needle, copy] of map) {
    if (lower.includes(needle)) return copy
  }
  return GENERIC_COMMAND_FAILURE
}

const BURN_COPY: CopyMap = [
  // The quoted-cap rejection is handled in flow (a fresh quote for
  // re-confirmation), but it still needs a line for the paths that toast it.
  ['maxfueltons cap', 'The fuel cost came back higher than the quote you agreed to.'],
  ['maxfueltons must be', 'That fuel ceiling is not valid.'],
  ['exceeds available fuel', "That burn needs more fuel than this fleet is carrying."],
  ['lane transit', 'This fleet is crossing a lane and cannot be given a course yet.'],
  ['origin is at or inside', 'This fleet is too close to the star to take a course from here right now.'],
  ['destination is at or inside', 'That destination is too close to the star to fly to.'],
  ['minimum arc length', 'That burn is too short to fly. Choose a target farther away.'],
  ['target body is not present', 'That body is not in this system. Pick another target.'],
  ['commanded acceleration', "That burn is harder than this fleet's drives can push."],
  ['movement channel', 'This fleet is busy with another run. Cancel it first.'],
  ['not found', 'That fleet or destination is not available.'],
]

const MINE_COPY: CopyMap = [
  ['trading station', 'A trading station cannot be mined — dock and trade instead.'],
  ['not docked', 'Dock at the body before mining it.'],
  ['free hold', 'Your hold cannot take that much. Sell or jettison first.'],
  ['remaining tonnage', 'There is nothing left to extract here.'],
  ['does not carry the requested resource', 'This body does not carry that resource.'],
  ['positive finite', 'Enter a tonnage greater than zero.'],
  ['movement channel', 'This fleet is busy with another run. Cancel it first.'],
  ['not found', 'That fleet or body is not available.'],
]

const HOLD_COPY: CopyMap = [
  // The requirement is explicit that this line names the RESERVE as the
  // boundary: `add-stationkeep-hold-verb` rejects at or BELOW
  // `FuelParams.StationKeepReserveTons`, so a fleet holding 0.4 t against a
  // 1 t reserve hits it — copy reading "no fuel" would be false and
  // unactionable.
  ['station-keeping reserve', 'Holding here needs fuel above the station-keeping reserve. Refuel first.'],
  ['orbit park', 'Only a fleet in orbit can hold its station.'],
  ['not found', 'That fleet is not available.'],
]

const RELEASE_COPY: CopyMap = [
  ['currently station-keeping', 'This fleet is not holding station, so there is nothing to release.'],
  ['not found', 'That fleet is not available.'],
]

/** Player-facing copy for a burn-order rejection. */
export function burnErrorCopy(reason: string | undefined | null): string {
  return mappedCopy(reason, BURN_COPY)
}

/** Player-facing copy for a mine-commit rejection. */
export function mineErrorCopy(reason: string | undefined | null): string {
  return mappedCopy(reason, MINE_COPY)
}

/** Player-facing copy for a station-keeping hold rejection. */
export function holdErrorCopy(reason: string | undefined | null): string {
  return mappedCopy(reason, HOLD_COPY)
}

/** Player-facing copy for a station-keeping release rejection. */
export function releaseErrorCopy(reason: string | undefined | null): string {
  return mappedCopy(reason, RELEASE_COPY)
}

/**
 * Whether a rejection is the QUOTED-CAP one — the server's solved fuel cost
 * came in above the `maxFuelTons` the player agreed to. The view branches on
 * this rather than merely toasting it: it re-quotes in flow and presents the
 * new figures for re-confirmation, without committing and without an
 * automatic retry (`system-space-view`: *A cap rejection re-quotes in flow
 * instead of failing the interaction*).
 */
export function isQuotedCapExceeded(reason: string | undefined | null): boolean {
  if (!reason) return false
  const lower = reason.toLowerCase()
  return lower.includes('maxfueltons cap') || lower.includes('exceeds the requested maxfueltons')
}
