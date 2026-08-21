// fleet-collection — the pure half of the board's fleet add/remove lifecycle
// (port-board-to-webgl-renderer, "fleet-collection reconciliation is a pure
// diff plus a disposing GL reconciler"). useBoardRealtime/SSE brings fleets
// into and out of the system mid-session, and audience fog is dynamic: a
// foreign fleet drops out of the read the moment it leaves the requester's
// live sensor coverage. A missed removal is therefore both an unbounded
// per-fleet GPU leak AND a stale contact the board has no right to assert —
// which is why removal disposes on the SAME roster update that drops the id,
// not only on unmount or system change.
//
// Everything here is ordinary set arithmetic, vitest-testable with no GL
// context; the GL side supplies the ops (create/dispose) and is exercised in
// its tests through a stub factory asserting dispose counts.

export interface IdDiff {
  added: string[]
  removed: string[]
  kept: string[]
}

// diffIds — previous frame's fleet-id set vs the current one.
export function diffIds(prev: Iterable<string>, next: Iterable<string>): IdDiff {
  const prevSet = new Set(prev)
  const nextSet = new Set(next)
  const added: string[] = []
  const removed: string[] = []
  const kept: string[] = []
  for (const id of nextSet) {
    if (prevSet.has(id)) kept.push(id)
    else added.push(id)
  }
  for (const id of prevSet) {
    if (!nextSet.has(id)) removed.push(id)
  }
  return { added, removed, kept }
}

export interface FleetVisualOps<T> {
  create(id: string): T
  // Must release every GPU resource the visual holds and detach it from the
  // scene — called exactly once per removed id, never for kept ids.
  dispose(visual: T, id: string): void
}

// reconcileFleets — mutates `current` in place to match `nextIds`: disposes
// every removed visual, creates every added one, leaves kept ones untouched.
// Returns the diff so callers can log or re-pack ranges.
export function reconcileFleets<T>(
  current: Map<string, T>,
  nextIds: string[],
  ops: FleetVisualOps<T>,
): IdDiff {
  const diff = diffIds(current.keys(), nextIds)
  for (const id of diff.removed) {
    const visual = current.get(id)
    if (visual !== undefined) ops.dispose(visual, id)
    current.delete(id)
  }
  for (const id of diff.added) {
    current.set(id, ops.create(id))
  }
  return diff
}
