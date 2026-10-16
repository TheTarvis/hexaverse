// Counts Unicode code points, matching the server rather than HTML maxLength's
// UTF-16 units. Callers normalize their draft before counting/submitting it.
export const MAX_PLAYER_NAME_LENGTH = 40

export function playerNameLength(name: string): number {
  return Array.from(name).length
}
