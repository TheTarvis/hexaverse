// The one source of the console dock's published height and the lane offsets
// every bottom-band floating surface takes from it (openspec change
// `add-console-dock`, design.md D-3). Lane values are complete string
// literals so Tailwind's scanner sees them.

export const CONSOLE_DOCK_HEIGHT_VAR = '--console-dock-height'
export const CONSOLE_DOCK_HEIGHT_COLLAPSED = '3.5rem'
export const CONSOLE_DOCK_HEIGHT_EXPANDED = '13.75rem'

/** FloatingNav and the sightings-unavailable card: 72 px collapsed, 236 px expanded. */
export const CONSOLE_DOCK_LANE_LEFT_CENTER = 'bottom-[calc(var(--console-dock-height,3.5rem)+1rem)]'
/** The camera cluster: 100 px collapsed, 264 px expanded. */
export const CONSOLE_DOCK_LANE_CAMERA = 'bottom-[calc(var(--console-dock-height,3.5rem)+2.75rem)]'
/** The right-hand command column's foot: 140 px collapsed, 304 px expanded. */
export const CONSOLE_DOCK_LANE_COLUMN = 'bottom-[calc(var(--console-dock-height,3.5rem)+5.25rem)]'
