'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { PREVIEW_REFRESH_MS } from '@/lib/realtime'
import { selectionKey, selectionWireRequest, type SpaceSelection } from '@/components/space/space-selection'
import type { BurnPreview } from '@/lib/types/fleet'

// useBurnPreview — the server-solved burn quote behind the space view's
// target selection (openspec change `build-production-space-view`,
// `system-space-view`: *Burn Preview Reflects the Server-Solved Order,
// Without Committing* and *A Failed or Stale Preview Is Never Presented as
// a Current Quote*).
//
// The client never solves a burn. Every curve, arrival, delta-v and fuel
// cost the view displays comes from this endpoint, which runs the SAME
// solve the commit would run and commits nothing.
//
// THE CADENCE IS ONE NAMED CONSTANT (`PREVIEW_REFRESH_MS`, `lib/realtime`).
// The endpoint reads the body table, may write an arrival settlement, and
// runs an N-solve stranding scan per acting fleet per player, so its rate
// is a real server cost that must be priceable in one place.
//
// A BURNING FLEET IS PREVIEWED. A re-target is an ordinary commit. The
// caller decides when a preview is wanted; the flag is a client
// request-suppression input (a running mine, lane transit, a target that is
// the fleet's own host), not the server's enforcement. A suppressed preview
// is not a failed one.

export interface UseBurnPreviewArgs {
  fleetId: string | null
  selection: SpaceSelection | null
  /** False while the caller does not want a preview requested (suppression, not enforcement). */
  commitWouldBeAccepted: boolean
}

export interface BurnPreviewState {
  /** The current quote, or null while none has succeeded for this selection. */
  preview: BurnPreview | null
  /** A refresh failed over figures that are still shown. */
  stale: boolean
  /** The FIRST request for this selection failed — no figures at all. */
  noQuote: boolean
  retry: () => void
}

export function useBurnPreview({
  fleetId,
  selection,
  commitWouldBeAccepted,
}: UseBurnPreviewArgs): BurnPreviewState {
  const request = selectionWireRequest(selection)
  const enabled = !!fleetId && !!request && commitWouldBeAccepted

  const query = useQuery({
    queryKey: queryKeys.fleets.burnPreview(fleetId ?? '', selectionKey(selection)),
    queryFn: () => fleetService.preview(fleetId as string, request as NonNullable<typeof request>),
    enabled,
    retry: false,
    // Exactly one request per elapsed interval, none between.
    refetchInterval: PREVIEW_REFRESH_MS,
    refetchOnWindowFocus: false,
    // A quote is only ever as good as its moment; nothing is reused across
    // a selection change, so no previous target's figures can be presented
    // as the current one's.
    gcTime: 0,
    staleTime: PREVIEW_REFRESH_MS,
  })

  // Read live: a caller may hold `retry` from before the flag went false.
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const retry = useCallback(() => {
    if (!enabledRef.current) return
    void query.refetch()
  }, [query])

  // Discard on disable: a resumed preview starts empty and fetches at the
  // transition; nothing from before the withholding is presented.
  const qc = useQueryClient()
  const selKey = selectionKey(selection)
  useEffect(() => {
    if (enabled) return
    const queryKey = queryKeys.fleets.burnPreview(fleetId ?? '', selKey)
    void qc.cancelQueries({ queryKey, exact: true })
    qc.removeQueries({ queryKey, exact: true })
  }, [enabled, qc, fleetId, selKey])

  const preview = enabled ? (query.data ?? null) : null
  const failed = enabled && !!query.error

  return {
    preview,
    // Figures are MARKED stale, never withdrawn: withdrawing them would
    // leave the player with nothing at all rather than with a quote they
    // can see is old.
    stale: failed && preview !== null,
    noQuote: failed && preview === null,
    retry,
  }
}
