// roster-status — the roster row's status derivation (fleet-roster ADDED "One
// Row Per Owned Fleet, Derived From Kinematic State"; migrate-fleet-to-
// continuous-burns, tasks.md 8.5). Replaces the deleted `fleet-status.ts`
// (design.md Decision 12): status now derives from `space.ShipState`'s three
// shapes (burn/park/drift) plus the fleet-owned `attachedTo`/`jump` fields,
// never from the deleted board package's `MovementState`.
//
// Pure (no clock, no fetch): the caller passes the live world time in.
//
// No TypeScript mirror of `backend/space`'s curve/orbit math exists, or ever
// will (design.md Decision 1) — so this derivation uses ONLY a trivial
// integer comparison against the stored `ArriveMs` to tell whether a burn has
// already settled (t >= ArriveMs), never re-deriving the settled park's
// geometry. That is sufficient for a status LABEL (idle/docked vs moving);
// once a burn folds past its own arrival, "docked" is read off the fleet's
// own `attachedTo` field, exactly as an ordinary park is.
//
// ADDITIVE EXTENSION (add-vitals-strip, impl contract §2). Every field this
// module returned before this change keeps returning byte-identical values
// for every input it accepted before — see `roster-status.test.ts`'s
// original nine cases, unedited. Everything below is new and optional: the
// pill's `activityKind` discriminant, its absolute-instant ETA anchor, the
// resolved park mode, and the resolved host/target labels. The roster row
// (`FleetRoster.tsx`) ignores all of it.

import type { Fleet, ParkKind } from '@/lib/types/fleet'
import {
  PARK_KIND_POINT,
  PARK_KIND_STATIONKEEP,
  SHIP_MODE_BURN,
  SHIP_MODE_DRIFT,
} from '@/lib/types/fleet'

// tone drives the row's accent: idle (nothing to watch), moving (a burn is
// running), drifting (coasting free, unpowered), transit (crossing a lane).
export type StatusTone = 'idle' | 'moving' | 'drifting' | 'transit'

// ParkMode — Park.Kind resolved to a name. Present for all three park kinds,
// unlike `activityKind`, which collapses `orbit` and `point` into `onstation`.
export type ParkMode = 'orbit' | 'stationkeep' | 'point'

// ActivityKind — the discriminant the pill switches on. Never player-facing
// copy (that's `activity`, which stays byte-identical) — a wire enum's worth
// of resolved labels, one per existing branch, no branch added or reordered.
export type ActivityKind =
  | 'docked'
  | 'underway'
  | 'holding'
  | 'mining'
  | 'drifting'
  | 'transit'
  | 'onstation'

// A resolved body reference, or null when neither collection matched.
export type ResolvedBody =
  | { kind: 'feature'; type: string; id: string; name?: string }
  | { kind: 'gate'; destSystemId: string }

// Supplied by the mounting view; checks BOTH interior collections.
export type ResolveBody = (bodyId: string) => ResolvedBody | null

export interface RosterRowStatus {
  // --- unchanged, byte-identical for every input they accept today ---
  tone: StatusTone
  // Where the fleet is: a system name, or "Origin → Destination" mid-jump.
  where: string
  // What it's doing, in the player's words.
  activity: string
  // World-ms remaining on the current order, when there's a known ETA.
  remainingMs?: number

  // --- ADDITIVE. The roster row ignores all of these. ---

  /** The discriminant the pill switches on. Never player-facing copy. */
  activityKind: ActivityKind

  /** The absolute world-ms ETA the span was measured from — an anchor that
   *  never moves between renders, so a consumer can re-express the
   *  countdown against a later projected world time without re-deriving. */
  etaWorldMs?: number

  /** Park.Kind resolved to a name. Present only for a parked fleet. */
  parkMode?: ParkMode

  /** Docked host, already resolved to display text. */
  hostLabel?: string

  /** Burn target, already resolved to display text. */
  targetLabel?: string

  /** Served verbatim from `roster.stationKeepRateTonsPerSecond`. */
  stationKeepRateTonsPerSecond?: number
}

// nameOf resolves a systemId to its display name; falls back to the raw id
// when the caller has no name for it, so an unknown system still renders.
export type NameOf = (systemId: string) => string

export interface RunningMine {
  eta: number
  status?: string
}

function parkKindToMode(kind: ParkKind): ParkMode {
  if (kind === PARK_KIND_STATIONKEEP) return 'stationkeep'
  if (kind === PARK_KIND_POINT) return 'point'
  return 'orbit'
}

// The one resolution function, used for both a docked host (keyed by
// `attachedTo`) and a burn target (keyed by `Target.BodyId`) — contract §2.3.
// `resolveBody` undefined (no interior read wired), or a miss against both
// collections, or a failed interior read (which makes every lookup return
// null) all degrade to the same thing: the raw served id. Nothing here
// invents a display name for a feature, and nothing here composes a raw
// coordinate into a label.
function resolveLabel(id: string, nameOf: NameOf, resolveBody?: ResolveBody): string {
  const hit = resolveBody ? resolveBody(id) : null
  if (!hit) return id
  if (hit.kind === 'feature') return hit.name ?? `${hit.type} ${hit.id}`
  return `Gate ${nameOf(hit.destSystemId)}`
}

export function rosterRowStatus(
  fleet: Fleet,
  worldTime: number,
  nameOf: NameOf,
  runningMine?: RunningMine | null,
  resolveBody?: ResolveBody,
): RosterRowStatus {
  const here = nameOf(fleet.systemId)
  const stationKeepRateTonsPerSecond = fleet.roster?.stationKeepRateTonsPerSecond

  // Mid-jump: a fleet-owned field, independent of `state` — a fleet in lane
  // transit has no position in either system (design.md Decision 4).
  if (fleet.jump) {
    return {
      tone: 'transit',
      where: `${here} → ${nameOf(fleet.jump.destSystemId)}`,
      activity: 'In transit',
      remainingMs: Math.max(0, fleet.jump.arriveMs - worldTime),
      activityKind: 'transit',
      etaWorldMs: fleet.jump.arriveMs,
      stationKeepRateTonsPerSecond,
    }
  }

  const state = fleet.state
  const stillBurning =
    state?.Mode === SHIP_MODE_BURN && !!state.Burn && worldTime < state.Burn.ArriveMs
  if (stillBurning) {
    const target = state.Burn!.Target
    const targetLabel =
      target.BodyId == null ? 'a point in space' : resolveLabel(target.BodyId, nameOf, resolveBody)
    return {
      tone: 'moving',
      where: here,
      activity: 'Under way',
      remainingMs: state.Burn!.ArriveMs - worldTime,
      activityKind: 'underway',
      etaWorldMs: state.Burn!.ArriveMs,
      targetLabel,
      stationKeepRateTonsPerSecond,
    }
  }

  if (state?.Mode === SHIP_MODE_DRIFT) {
    return {
      tone: 'drifting',
      where: here,
      activity: 'Drifting',
      activityKind: 'drifting',
      stationKeepRateTonsPerSecond,
    }
  }

  // Parked, or a burn folded past its own arrival — idle either way. Docked
  // reads off the fleet's own `attachedTo`, which the backend clears at burn
  // commit and sets only at resolve (design.md Decision 4, Decision 13).
  const parkMode = state?.Park ? parkKindToMode(state.Park.Kind as ParkKind) : undefined
  const docked = !!fleet.attachedTo

  if (docked && runningMine && runningMine.eta > worldTime) {
    return {
      tone: 'idle',
      where: here,
      activity: 'Mining',
      remainingMs: runningMine.eta - worldTime,
      activityKind: 'mining',
      etaWorldMs: runningMine.eta,
      parkMode,
      hostLabel: resolveLabel(fleet.attachedTo!, nameOf, resolveBody),
      stationKeepRateTonsPerSecond,
    }
  }

  if (docked) {
    return {
      tone: 'idle',
      where: here,
      activity: 'Docked',
      activityKind: 'docked',
      parkMode,
      hostLabel: resolveLabel(fleet.attachedTo!, nameOf, resolveBody),
      stationKeepRateTonsPerSecond,
    }
  }

  return {
    tone: 'idle',
    where: here,
    activity: 'On station',
    activityKind: parkMode === 'stationkeep' ? 'holding' : 'onstation',
    parkMode,
    stationKeepRateTonsPerSecond,
  }
}
