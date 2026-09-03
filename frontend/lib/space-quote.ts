// The burn quote's client-side allowance (openspec change
// `build-production-space-view`, `system-space-view`: *A Burn Commit Is
// Quote-Locked to the Preview the Player Agreed To*).
//
// A commit carries `maxFuelTons` derived from the CURRENT preview's fuel
// cost by this one named factor, and the resulting ceiling is displayed
// alongside the point cost — the ceiling the player agrees to is the one
// the client sends. The slack exists because the world moves between the
// quote and the commit: the target has advanced, the acting fleet has
// advanced, and a solve at commit time legitimately costs a little more
// than the one that was quoted. Too tight and every commit bounces off its
// own cap; too loose and the cap stops being a cap.
//
// PLACEHOLDER VALUE: design.md OQ-13 leaves the number open for Travis.
// Change it HERE and nowhere else — a second allowance at a call site is
// how a displayed ceiling stops matching the one that was sent.

export const BURN_FUEL_ALLOWANCE = 1.1
