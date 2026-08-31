'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { auth } from '@/lib/firebase'
import { queryKeys } from '@/lib/query-keys'

// useBoardRealtime — board-view ADDED "Realtime Refetch Rules While the
// Board Is Open, With No Fleet Layer to Track" (migrate-fleet-to-continuous-
// burns, tasks.md 8.4) — the two remaining client refetch rules for an open
// board, plus a constant baseline poll that nothing tightens any more (the
// scan verb, and the fleet layer it revealed, are both gone):
//
//  1. ETA self-schedule — when a running mine has a known ETA, schedule one
//     refetch just after it, so a resolved-by-read verb lands without a
//     manual refresh. (Never self-scheduled for an own fleet's burn arrival
//     — the board fetches no fleet data to know one from; design.md
//     Decision 12.)
//  2. SSE — subscribe to the system channel; refetch on `action.completed`
//     (something resolved) and again on reconnect (we may have missed events).
//
// Both converge on one idempotent invalidation of the interior + running-
// actions reads, AND `fleets.mine()` — the roster/board's only fleet source
// since the fleet layer left the board (8.1/8.5) — so a resolved mine or
// burn arrival is visible without a manual refresh. `fleets.inSystem` is
// invalidated too, purely as a harmless no-op today — nothing produces a
// query under it any more, but the key SHAPE is still read by
// `use-actions.ts`/`use-market.ts`'s own invalidations, so it stays a live
// query-key factory entry.
//
// SCAN_POLL_MS and the `scanning` tightening have no successor: the `scanning`
// option is still accepted (a caller may still pass it) but has NO effect —
// the poll runs at BOARD_POLL_MS unconditionally.

export const BOARD_POLL_MS = 20_000
// A small cushion so the ETA refetch fires just AFTER the server would resolve.
const ETA_CUSHION_MS = 400

export interface UseBoardRealtimeOptions {
  systemId: string
  // The live world time (for measuring how far off each ETA is). Read via a ref,
  // never depended on, so the per-frame tick can't reset the timers.
  worldTime: number
  // Future world-times to self-schedule a refetch at — a running mine's ETA.
  etaCandidates?: number[]
  // Accepted for API compatibility; has no effect (see module note above).
  scanning?: boolean
  enabled?: boolean
}

function invalidateBoard(qc: QueryClient, systemId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.systemBoard.detail(systemId) })
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(systemId) })
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.mine() })
  void qc.invalidateQueries({ queryKey: queryKeys.actions.all })
}

export function useBoardRealtime({
  systemId,
  worldTime,
  etaCandidates,
  // Accepted, deliberately unused — see the module note above.
  scanning: _scanning = false,
  enabled = true,
}: UseBoardRealtimeOptions): void {
  const qc = useQueryClient()

  // Latest worldTime, without making it a dependency (avoids per-frame resets).
  const worldTimeRef = useRef(worldTime)
  worldTimeRef.current = worldTime

  const active = enabled && !!systemId

  // Stable soonest-future ETA: keyed on the candidate contents, not array identity.
  const candidateKey = (etaCandidates ?? []).join(',')
  const soonest = useMemo(() => {
    const future = (etaCandidates ?? []).filter((e) => e > worldTimeRef.current)
    return future.length ? Math.min(...future) : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey])

  // Rule 1 — self-schedule the ETA refetch. Re-arms only when the ETA changes.
  useEffect(() => {
    if (!active || soonest === undefined) return
    const delay = Math.max(0, soonest - worldTimeRef.current) + ETA_CUSHION_MS
    const timer = setTimeout(() => invalidateBoard(qc, systemId), delay)
    return () => clearTimeout(timer)
  }, [active, soonest, systemId, qc])

  // Rule 3 — gentle poll while open, at a constant baseline interval: nothing
  // tightens it any more (the scan verb had no successor). `scanning` is
  // deliberately NOT a dependency here — it must have zero effect.
  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => invalidateBoard(qc, systemId), BOARD_POLL_MS)
    return () => clearInterval(interval)
  }, [active, systemId, qc])

  // Rule 2 — SSE on the system channel: refetch on completion and on reconnect.
  useEffect(() => {
    if (!active || typeof EventSource === 'undefined') return
    let source: EventSource | null = null
    let cancelled = false
    let sawError = false

    const connect = async () => {
      const token = await auth.currentUser?.getIdToken()
      if (cancelled || !token) return
      const base = process.env.NEXT_PUBLIC_API_URL ?? ''
      source = new EventSource(
        `${base}/v1/channels/${encodeURIComponent(systemId)}/stream?token=${encodeURIComponent(token)}`,
      )
      source.addEventListener('action.completed', () => invalidateBoard(qc, systemId))
      source.onerror = () => {
        sawError = true
      }
      source.onopen = () => {
        // A reopen after a drop means we may have missed events — resync.
        if (sawError) {
          sawError = false
          invalidateBoard(qc, systemId)
        }
      }
    }
    void connect()

    return () => {
      cancelled = true
      source?.close()
    }
  }, [active, systemId, qc])
}
