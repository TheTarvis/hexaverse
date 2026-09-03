// The space view's realtime timing constants — one definition site
// (openspec change `build-production-space-view`, tasks.md 10.2, 4.3).
//
// WHY A PLAIN MODULE, NOT A HOOK. `hooks/use-board-realtime.ts` used to own
// `ETA_CUSHION_MS` and `BOARD_POLL_MS`, and that hook is deleted by this
// change. `add-scan-and-sightings-surface` (8b) schedules its settle
// refetch on the SAME cushion and archives after this change, so the
// constant must survive the deletion in a module 8b can import without
// pulling in a hook — and without React or React Query — which is why this
// file has no imports at all.
//
// `PREVIEW_REFRESH_MS` lives here for the reason the requirement gives: the
// preview endpoint reads the body table, may write an arrival settlement,
// and runs an N-solve stranding scan per acting fleet per player, so the
// cadence is a real server cost and must be priceable in one place rather
// than scattered across call sites (`system-space-view`: *The refresh
// interval is defined in exactly one place*).

/**
 * A small cushion so an ETA-scheduled refetch fires just AFTER the server
 * would have resolved the action. RELOCATED FROM `use-board-realtime.ts`
 * WITH ITS VALUE UNCHANGED — this is not a retuning (tasks.md 10.2).
 */
export const ETA_CUSHION_MS = 400

/** The baseline poll while a system view is open. */
export const BOARD_POLL_MS = 20_000

/**
 * The burn preview's single refresh cadence. PLACEHOLDER: design.md OQ-14
 * leaves the value open for Travis — too slow and the quote drifts against
 * a moving target, too fast and a busy system multiplies a non-trivial
 * server cost by every player with a selection open. 10 s sits between the
 * baseline poll and a per-frame request; change it HERE and nowhere else.
 */
export const PREVIEW_REFRESH_MS = 10_000
