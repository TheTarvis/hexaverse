// The space view's pure selection and picking model (openspec change
// `build-production-space-view`, `system-space-view`: *Toggle-to-Deselect
// Single Selection Among a Body, a Lane Gate, or a Point*, *Space View
// Picking Resolves to the Body, Lane Gate, or Point Under the Pointer*,
// *Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly*).
//
// THERE IS NO `kind` TAG, AND NO 'gate' MEMBER, ON PURPOSE. A lane gate IS
// a body — it is served in the interior read with its own id, position,
// size and orbital elements, exactly like a planet — so it is selected as a
// body whose id happens to be the gate body's id, and the burn command that
// follows is byte-identical in shape to a planet's. A discriminating tag
// here is precisely the kind-specific branch *No kind-specific selection
// branch survives the unification* forbids.
//
// NO FLEET AND NO CONTACT IS EVER A MEMBER OF THIS SET. The view draws no
// selection affordance for either; a fleet is commanded through the roster,
// never by clicking its mark.

import type { DrawVec3 } from '@/lib/space/draw'
import type { OrderRequest, Vec3 } from '@/lib/types/fleet'

/** Exactly one of `bodyId` (a body, including a lane gate) or `point`. */
export interface SpaceSelection {
  bodyId?: string
  /**
   * A bare point in space. Carried in whatever vector shape it was picked
   * in — the scene's own lower-case draw vector, or the wire's capitalized
   * `space.Vec3` when it came back from the server — and converted to the
   * wire shape only at `selectionWireRequest`.
   */
  point?: DrawVec3 | Vec3
}

/** A drawn body's screen-space hit target. */
export interface PickMark {
  bodyId: string
  screenX: number
  screenY: number
  radiusPx: number
  /** Higher is drawn later, i.e. on top. */
  drawOrder: number
}

export interface PickInput {
  screenX: number
  screenY: number
  marks: PickMark[]
  /** Where the pointer ray met the pick plane, or null if it missed. */
  planePoint: DrawVec3 | null
  /** The maximum distance from the system's centre a point pick may name. */
  pickRadius: number
}

// Hit targets are sized GENEROUSLY around each body's drawn radius, with a
// floor so a distant moon or gate stays clickable at any zoom. This is not
// "nearest mark wins": a click outside every padded target is a POINT pick,
// which is the only thing that makes a bare point — and therefore
// `space.ParkPoint` — reachable at all.
const PICK_PADDING_PX = 8
const MIN_PICK_TARGET_PX = 16

function pointComponents(p: DrawVec3 | Vec3): { x: number; y: number; z: number } {
  const lower = p as DrawVec3
  if (typeof lower.x === 'number') return { x: lower.x, y: lower.y, z: lower.z }
  const upper = p as Vec3
  return { x: upper.X, y: upper.Y, z: upper.Z }
}

/** A stable string identity for a selection — usable as a query key. */
export function selectionKey(selection: SpaceSelection | null): string {
  if (!selection) return 'none'
  if (selection.bodyId !== undefined) return `body:${selection.bodyId}`
  if (selection.point) {
    const { x, y, z } = pointComponents(selection.point)
    return `point:${x},${y},${z}`
  }
  return 'none'
}

/** Selection equality, by value. A gate is not special-cased. */
export function sameSelection(a: SpaceSelection | null, b: SpaceSelection | null): boolean {
  return selectionKey(a) === selectionKey(b)
}

/**
 * The single-selection fold: re-picking the current selection deselects it,
 * picking anything else replaces it whatever its kind, and a pick that
 * resolved to nothing clears it.
 */
export function toggleSelection(
  current: SpaceSelection | null,
  picked: SpaceSelection | null,
): SpaceSelection | null {
  if (!picked) return null
  if (sameSelection(current, picked)) return null
  return picked
}

/**
 * The selection as an order request, in the selection's own vector shape —
 * the uniformity assertion's subject: a gate and a planet produce
 * structurally identical requests, and a point produces `point` alone.
 * Never both keys, never neither (`fleet-movement`: *Order Request
 * Validation*).
 */
export function selectionOrderRequest(
  selection: SpaceSelection | null,
): { bodyId?: string; point?: DrawVec3 | Vec3 } | null {
  if (!selection) return null
  if (selection.bodyId !== undefined) return { bodyId: selection.bodyId }
  if (selection.point) return { point: selection.point }
  return null
}

/**
 * The selection as a WIRE order request: the same uniform shape, with a
 * point normalized to `space.Vec3`'s capitalized keys. This is the only
 * place the draw-space vector meets the wire.
 */
export function selectionWireRequest(selection: SpaceSelection | null): OrderRequest | null {
  const request = selectionOrderRequest(selection)
  if (!request) return null
  if (request.bodyId !== undefined) return { bodyId: request.bodyId }
  const { x, y, z } = pointComponents(request.point!)
  return { point: { X: x, Y: y, Z: z } }
}

/**
 * Resolve a pointer position to a selection: the body under it if one of
 * the padded hit targets contains it (the mark drawn LAST wins an overlap,
 * so a moon drawn over its planet is what the player gets), otherwise the
 * point on the pick plane under it — unless the ray missed the plane, or
 * the point lies beyond the maximum pick radius, in which cases the
 * selection is cleared. The radius test is three-dimensional and inclusive
 * at the boundary: the requirement clears a point lying BEYOND the radius,
 * so the boundary itself is still a legal target.
 */
export function resolvePick(input: PickInput): SpaceSelection | null {
  let best: PickMark | null = null
  let bestDistance = 0
  for (const mark of input.marks) {
    const dx = input.screenX - mark.screenX
    const dy = input.screenY - mark.screenY
    const distance = Math.hypot(dx, dy)
    const target = Math.max(mark.radiusPx + PICK_PADDING_PX, MIN_PICK_TARGET_PX)
    if (distance > target) continue
    if (
      !best ||
      mark.drawOrder > best.drawOrder ||
      (mark.drawOrder === best.drawOrder && distance < bestDistance)
    ) {
      best = mark
      bestDistance = distance
    }
  }
  if (best) return { bodyId: best.bodyId }

  const plane = input.planePoint
  if (!plane) return null
  if (Math.hypot(plane.x, plane.y, plane.z) > input.pickRadius) return null
  return { point: plane }
}
