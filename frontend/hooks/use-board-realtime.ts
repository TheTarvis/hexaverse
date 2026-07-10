'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { auth } from '@/lib/firebase'
import { queryKeys } from '@/lib/query-keys'

// useBoardRealtime — the three #0005 client refetch rules for an open board:
//
//  1. ETA self-schedule — when an own action has a known arrival (a burn's
//     arriveTime), schedule one refetch just after it, so a resolved-by-read verb
//     lands without a manual refresh.
//  2. SSE — subscribe to the system channel; refetch on `action.completed`
//     (something resolved) and again on reconnect (we may have missed events).
//  3. Gentle poll — a slow interval backstop while the board is open, covering
//     verbs whose ETA the client can't know precisely (e.g. a scan).
//
// All three converge on one idempotent invalidation of the interior + fleet
// reads; the fog/animation layers pick the fresh state up on the next render.

export const BOARD_POLL_MS = 20_000
// A small cushion so the ETA refetch fires just AFTER the server would resolve.
const ETA_CUSHION_MS = 400

export interface UseBoardRealtimeOptions {
  systemId: string
  // The live world time (for measuring how far off each ETA is). Read via a ref,
  // never depended on, so the per-frame tick can't reset the timers.
  worldTime: number
  // Future world-times to self-schedule a refetch at — own fleets' arrival ETAs.
  etaCandidates?: number[]
  enabled?: boolean
}

function invalidateBoard(qc: QueryClient, systemId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.systemBoard.detail(systemId) })
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(systemId) })
}

export function useBoardRealtime({
  systemId,
  worldTime,
  etaCandidates,
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

  // Rule 3 — gentle poll while open.
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
