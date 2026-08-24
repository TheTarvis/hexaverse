// Player-facing copy for the market's server rejection reasons (#0011).
//
// The server reports a distinguishable reason for every rejection so the CLIENT
// can say something useful. Raw reason strings are diagnostics, not UI: they
// carry package prefixes ("market: ...") and describe mechanism rather than what
// the player should do next. This map is the seam between the two.
//
// Unmapped reasons fall back to a generic line rather than leaking the raw
// string — a new server-side reason must never surface as jargon in a toast.

export const GENERIC_SALE_FAILURE = 'That sale could not be completed. Please try again.'

// Keyed by a distinctive fragment of the server's reason, so the mapping
// survives small wording changes on either side.
const COPY: ReadonlyArray<readonly [needle: string, copy: string]> = [
  // The four existence-hiding rejections all share ONE server reason, so they
  // share one line here too. Saying more would undo the hiding.
  ['not found', 'That fleet or station is not available.'],

  ['not docked', 'Dock at the station before selling.'],
  ['not tradable', 'This station does not buy that resource.'],
  ['positive finite', 'Enter a tonnage greater than zero.'],
  ['does not hold that much', 'Your hold does not carry that much of this resource.'],
  ['insufficient cargo', 'Your hold does not carry that much of this resource.'],

  // The price moved between the quote and the commit. The UI treats this one
  // specially — it refreshes the offer rather than just toasting.
  ['price changed', 'The price changed while you were deciding. The offer has been updated.'],
  ['slippage guard value', 'That price limit is not valid.'],

  ['round to zero', 'That amount is too small to be worth any credits.'],
  ['out of range', 'That sale is too large to settle.'],

  ['budget exhausted', 'This station has spent its budget for now. Try again later.'],
  ['absorption exhausted', 'This station cannot take on more cargo right now.'],

  ['busy', 'The station is busy right now. Please try again.'],
  ['already used with different parameters', 'That sale was already submitted with different details.'],
  ['unresolved ledger divergence', 'Your account is under review and cannot trade right now.'],
  ['operation key', 'Something went wrong submitting that sale. Please try again.'],
]

// saleErrorCopy maps a server rejection reason to player-facing text.
export function saleErrorCopy(reason: string | undefined | null): string {
  if (!reason) return GENERIC_SALE_FAILURE
  const lower = reason.toLowerCase()
  for (const [needle, copy] of COPY) {
    if (lower.includes(needle)) return copy
  }
  return GENERIC_SALE_FAILURE
}

// isPriceChanged distinguishes the one rejection the offer UI must handle
// specially: rather than leaving a stale, un-committable offer on screen after a
// multi-minute haul, it refreshes to the server's current price and total.
export function isPriceChanged(reason: string | undefined | null): boolean {
  return !!reason && reason.toLowerCase().includes('price changed')
}
