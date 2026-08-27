'use client'

// BoardCameraControls — the board's on-screen camera affordances: zoom in,
// zoom out, and recenter, as one bottom-left stack.
//
// They are decided and placed TOGETHER (design.md, the recenter Decision):
// "reachable via the board's normal tab order" with "a visible focus
// indicator" already presumes a focusable camera surface exists, and landing
// the recenter control and the keyboard controls' widget as two independently
// designed pieces of board UI is how two controls end up competing for the
// same corner. Bottom-left is the free corner — the roster/market column
// stacks top-left (`self-start`), FactsPanel owns the right, and the dev
// BoardTuning panel owns bottom-right.
//
// Tab order: these carry tabIndex 1..CAMERA_CONTROL_COUNT so they precede the
// overlay's feature/fleet/lane-gate hit targets, which BoardOverlay offsets by
// exactly that count. The port's glyph tab order (features → fleets → gates)
// is left intact, with the camera group ahead of it.
//
// Every handler stops propagation: activating a control is not a board click,
// even though the control sits inside the region the stage's picking listener
// covers, so it must never reach the selection model.

import {
  isDefaultCamera,
  zoomByNotches,
  ZOOM_MAX,
  ZOOM_MIN,
  type BoardCamera,
} from './board-camera'
import { CAMERA_CONTROL_ATTR } from './use-board-gestures'

// How many tab stops this group occupies — BoardOverlay offsets its glyph tab
// indices by exactly this, so the two stay in step from one constant.
export const CAMERA_CONTROL_COUNT = 3

export interface BoardCameraControlsProps {
  camera: BoardCamera
  setCamera(next: (prev: BoardCamera) => BoardCamera): void
  resetCamera(): void
}

const BUTTON =
  'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/15' +
  ' bg-black/60 font-mono text-sm text-zinc-300 backdrop-blur transition-colors' +
  ' hover:bg-white/[0.16] hover:text-white' +
  ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'

export function BoardCameraControls({ camera, setCamera, resetCamera }: BoardCameraControlsProps) {
  // Activation must not reach the stage's click-to-pick path (task 7.7). The
  // capture-phase gesture listeners skip anything inside CAMERA_CONTROL_ATTR;
  // this closes the React-side half of the same hole.
  const contain = (e: { stopPropagation(): void }) => e.stopPropagation()

  return (
    <div
      {...{ [CAMERA_CONTROL_ATTR]: '' }}
      data-testid="board-camera-controls"
      role="group"
      aria-label="Board camera"
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1"
      onPointerDown={contain}
      onClick={contain}
    >
      <button
        type="button"
        data-testid="camera-zoom-in"
        tabIndex={1}
        aria-label="Zoom in"
        aria-disabled={camera.zoom >= ZOOM_MAX}
        className={BUTTON}
        onClick={() => setCamera((prev) => zoomByNotches(prev, -1))}
      >
        +
      </button>
      <button
        type="button"
        data-testid="camera-zoom-out"
        tabIndex={2}
        aria-label="Zoom out"
        aria-disabled={camera.zoom <= ZOOM_MIN}
        className={BUTTON}
        onClick={() => setCamera((prev) => zoomByNotches(prev, 1))}
      >
        −
      </button>
      {/* Recenter resets to the default framing — fit-to-lattice at 1x with
          the pan target on the core cell — immediately, with no eased
          transition, and leaves the selection alone. Already-at-default is a
          genuine no-op (the hook writes the same DEFAULT_CAMERA reference and
          React bails), not a disabled button: disabling would drop it out of
          the tab order and change the order under the player's hands. */}
      <button
        type="button"
        data-testid="camera-recenter"
        tabIndex={3}
        aria-label="Recenter board"
        data-at-default={isDefaultCamera(camera) ? 'true' : 'false'}
        className={BUTTON}
        onClick={resetCamera}
      >
        ⌖
      </button>
    </div>
  )
}

export default BoardCameraControls
