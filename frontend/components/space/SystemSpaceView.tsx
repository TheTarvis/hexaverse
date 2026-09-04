'use client'

// SystemSpaceView — the continuous-R³ per-system view (openspec change
// `build-production-space-view`, `system-space-view`: *System Space View
// Route and Data Fan-In*, *Realtime Refetch Rules While the Space View Is
// Open*, *Departure Hand-Off to the Galaxy View*, *Fleet Roster
// Cross-Navigation*, *A Landed Resolution Is Announced to Assistive
// Technology*).
//
// FOUR INDEPENDENTLY-FAILING READS PLUS THE AMBIENT SESSION. The interior
// (`useSystemSpace`) draws the world; the requester's own fleets
// (`useMyFleets` — the CORPORATION-scoped read, filtered to this system on
// the client) drive every command; the open system's station
// (`useStation`) and the market price board (`useMarketBoard`) anchor the
// sell and refuel offers; and the credit balance comes from the ambient
// corporation session (`useCorporationOptional`), NOT a fifth read.
//
// No read's failure disables another's surface: a failed interior read
// leaves every fleet-state-anchored command invokable, a failed fleet read
// leaves the canvas rendering bodies, gates and contacts, a failed station
// read withdraws only the station-anchored offers, a failed board read
// withdraws only sell, and an unresolved balance withdraws only the readout.
//
// A STATION READ THAT RESOLVES TO NO STATION IS NOT A FAILURE. The server
// 404s a system with no visible station — the ordinary answer — so that case
// shows no error and no retry, while any other failure does.
//
// THE STATION READ SUPPLIES ONLY `systemId` AND `featureId`. A station's
// position is never taken from the station document; it comes from the
// interior read's body table, exactly as every other body's does.
//
// THE CLOCK IS PROJECTED AT THE SERVED SCALE, never an assumed 1 — and when
// the interior read has failed, at the FLEET read's served scale, because
// that is then the only clock on screen.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import { useCorporationOptional } from '@/components/corporation-provider'
import { useRunningMine, useRunningScan } from '@/hooks/use-actions'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useMyFleets } from '@/hooks/use-fleets'
import { useMarketBoard, useStation } from '@/hooks/use-market'
import { useScanTargets, useSettledScan } from '@/hooks/use-scan'
import { useSightings } from '@/hooks/use-sightings'
import { useSystemSpace } from '@/hooks/use-system-space'
import { useWorldTime } from '@/hooks/use-world-time'
import { queryKeys } from '@/lib/query-keys'
import { BOARD_POLL_MS, ETA_CUSHION_MS } from '@/lib/realtime'
import type { Fleet } from '@/lib/types/fleet'
import type { Station, VenueQuotes } from '@/lib/types/market'
import type { Sighting } from '@/lib/types/sighting'
import { FleetActionsPanel } from './FleetActionsPanel'
import { ScanControl } from './ScanControl'
import { SightingLog } from './SightingLog'
import { SpaceCommandPanel } from './SpaceCommandPanel'
import { SpaceStage } from './SpaceStage'
import { buildSceneModel } from './space-scene'
import { toggleSelection, type SpaceSelection } from './space-selection'

export interface SystemSpaceViewProps {
  systemId: string
}

/** The default framing scale when no interior read has landed. */
const FALLBACK_EXTENT = 1

function isInTransit(fleet: Fleet): boolean {
  return !!fleet.jump || !fleet.position
}

/**
 * The server's "no visible station here" answer. `useStation` deliberately
 * does not retry it: existence is hidden behind a bodyless 404, which is the
 * ordinary reply for a system that simply has none — never a fault.
 */
function isNoStation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { status?: number }).status === 404
}

/**
 * ScanSweepWatcher — one own fleet's own running-focused-scan channel
 * (openspec change `add-scan-and-sightings-surface`, `system-space-view`:
 * *A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads
 * the Inbox and the Pile*). A CHILD COMPONENT, one per own fleet in the
 * open system, rather than a `.map()` of hook calls inside the parent: the
 * number of own fleets varies over the view's lifetime, and calling a real
 * React Query hook a variable number of times per render inside ONE
 * component is the textbook rules-of-hooks violation. Mounting a fixed-
 * shape component per array item has no such problem — each instance's own
 * hook-call count never varies.
 *
 * THE ORDERING IS THE WHOLE POINT: the pile and the inbox each settle
 * nothing and mint nothing, so they refetch only INSIDE `resyncInterior()`'s
 * OWN promise resolution — never concurrently with it. A past-due sweep
 * that has not yet settled is retried on the view's OWN baseline cadence
 * (`BOARD_POLL_MS`) rather than a second, invented constant, until the
 * fleet's running-scan read itself reports no sweep any more.
 */
function ScanSweepWatcher({
  fleetId,
  worldTimeRef,
  actingIdRef,
  resyncInterior,
  onSettled,
  onAnnounce,
}: {
  fleetId: string
  worldTimeRef: MutableRefObject<number>
  /**
   * A3 (link8b-adversary-r9): the post-settle scan-target follower read is
   * scoped to the ACTING fleet only -- the target list has exactly one
   * consumer (`ScanControl`, always reading the acting fleet's own served
   * set), and a non-acting fleet's list is refetched when IT is selected
   * (F2's re-selection ruling), not while nothing reads it.
   */
  actingIdRef: MutableRefObject<string | null>
  resyncInterior: () => Promise<unknown>
  onSettled: () => void
  onAnnounce: (message: string) => void
}) {
  const runningScan = useRunningScan(fleetId)
  const settledScan = useSettledScan(fleetId)
  const qc = useQueryClient()
  const eta = runningScan.data?.eta ?? null

  useEffect(() => {
    if (eta == null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const attempt = () => {
      void resyncInterior().then(
        () => {
          if (cancelled) return
          onSettled()
          void runningScan.refetch()
          void Promise.resolve(settledScan.refetch()).then((result) => {
            if (cancelled) return
            const settled = result?.data
            if (!settled) return
            onAnnounce(
              settled.reasonCode
                ? `Focused scan settling — the sweep returned nothing.`
                : 'Focused scan complete — records filed.',
            )
          })
          // A settled sweep frees the sensor channel it held (Decision 15
          // definitionally empties the target list while a sweep runs), so
          // the target list this fleet last served is stale the instant
          // the sweep settles — even though nothing about the fleet's OWN
          // kinematic state changed. Without this a docked fleet whose
          // sweep just settled keeps showing "No host is in range to
          // sweep." from the page cached at commit time. A1 (link8b-
          // adversary-r9): issued HERE, strictly inside this `.then()`,
          // never at `resync()`'s own top -- a scan-target read answered
          // while the sensor channel is still claimed serves the empty set
          // by construction, and firing it concurrently with the settling
          // interior read would re-cache that empty set as the fresh one.
          // A3: scoped to the ACTING fleet only -- the list has exactly
          // one consumer, and a non-acting fleet's settlement refetches
          // nothing here (re-selecting it is its own trigger, per F2).
          if (actingIdRef.current === fleetId) {
            void qc.invalidateQueries({ queryKey: queryKeys.fleets.scanTargets(fleetId) })
          }
          // Still unsettled (or the interior read did not resolve the due
          // sweep)? Try again on the view's own baseline cadence — no
          // second cadence constant — until this fleet's running-scan read
          // itself clears (a dependency change on `eta` cancels this loop).
          timer = setTimeout(attempt, BOARD_POLL_MS)
        },
        () => {
          if (cancelled) return
          timer = setTimeout(attempt, BOARD_POLL_MS)
        },
      )
    }

    const delay = Math.max(0, eta - worldTimeRef.current) + ETA_CUSHION_MS
    timer = setTimeout(attempt, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eta, resyncInterior, onSettled, onAnnounce, qc, fleetId])

  return null
}

/**
 * SightingsGhostFeed — the ghost layer's system-filtered pile read,
 * mounted ONLY once the system's own interior read has resolved at least
 * once (`sighting-log`'s own mount-ordering rule, task 8.8, restated here
 * for the ghost layer by the same "likelier race" design.md Decision 7
 * names: a sweep whose ETA passed while the view was closed settles on the
 * very FIRST interior read, and a pile read issued alongside it would
 * return before the records exist). A conditionally MOUNTED component,
 * never a conditionally CALLED hook — see `ScanSweepWatcher`'s own note.
 */
function SightingsGhostFeed({
  systemId,
  onResult,
}: {
  systemId: string
  onResult: (result: { sightings: Sighting[]; isError: boolean; refetch: () => void }) => void
}) {
  const pile = useSightings(systemId)
  const refetchRef = useRef(pile.refetch)
  refetchRef.current = pile.refetch
  const sightings = pile.data?.pages[0]?.sightings ?? []
  const isError = pile.isError
  // Keyed by CONTENT, not by the array's own reference — a query hook (real
  // or mocked) is not obliged to return the identical object across
  // renders for identical data, and gating this effect on reference
  // equality alone would re-fire, and re-render the parent, every render.
  const sightingsKey = JSON.stringify(sightings)

  useEffect(() => {
    onResult({ sightings, isError, refetch: () => void refetchRef.current() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sightingsKey, isError])

  return null
}

export function SystemSpaceView({ systemId }: SystemSpaceViewProps) {
  const router = useRouter()
  const interior = useSystemSpace(systemId)
  const fleets = useMyFleets()
  const stationRead = useStation(systemId || null)
  const boardRead = useMarketBoard()
  // The balance is ambient session data, not a read of this view's own
  // (`docked-fleet-actions`: *Credit Balance Readout*). The OPTIONAL
  // accessor: a missing provider withdraws a readout, never the view.
  const corporation = useCorporationOptional()

  const [selection, setSelection] = useState<SpaceSelection | null>(null)
  const [actingFleetId, setActingFleetId] = useState<string | null>(null)
  const [canvasAvailable, setCanvasAvailable] = useState(true)
  const [firstFrame, setFirstFrame] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  // --- add-scan-and-sightings-surface: the ghost layer's pile, the log
  //     drawer, and the row<->ghost cross-highlight ------------------------
  const [ghostFeed, setGhostFeed] = useState<{
    sightings: Sighting[]
    isError: boolean
    refetch: () => void
  }>({ sightings: [], isError: false, refetch: () => {} })
  // A STABLE wrapper: `ghostFeed` (and therefore `ghostFeed.refetch`)
  // changes identity on every pile update, and a scan-sweep watcher's
  // scheduled timer must not be torn down and rebuilt just because the
  // pile refetched for an unrelated reason.
  const ghostFeedRefetchRef = useRef(ghostFeed.refetch)
  ghostFeedRefetchRef.current = ghostFeed.refetch
  const refetchGhostFeed = useCallback(() => ghostFeedRefetchRef.current(), [])
  const [highlightedGhostId, setHighlightedGhostId] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const galaxy = useGalaxy()
  const systemNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const n of galaxy.data?.nodes ?? []) m[n.id] = n.name
    return m
  }, [galaxy.data])

  const allFleets = useMemo(() => fleets.data ?? [], [fleets.data])
  const here = useMemo(
    () => allFleets.filter((f) => f.systemId === systemId && !isInTransit(f)),
    [allFleets, systemId],
  )
  const acting =
    allFleets.find((f) => f.id === actingFleetId) ?? here[0] ?? null
  // Read inside an effect below without becoming a dependency of it — the
  // same pattern `worldTimeRef` already uses in this file.
  const actingIdRef = useRef(acting?.id ?? null)
  actingIdRef.current = acting?.id ?? null

  // add-scan-and-sightings-surface: mounted here (not only inside
  // `ScanControl`) so the acting fleet's landed-resolution effect below can
  // call ITS OWN `.refetch()` directly. Both mounts share the SAME cache
  // entry (`queryKeys.fleets.scanTargets(fleetId)`), so this costs no extra
  // request beyond what `ScanControl` already issues — refetching from
  // either instance updates both.
  const actingScanTargets = useScanTargets(acting?.id ?? null)
  const actingScanTargetsRefetchRef = useRef(actingScanTargets.refetch)
  actingScanTargetsRefetchRef.current = actingScanTargets.refetch

  // task 5.13 / F11-1 (link8b-adversary-r11): the acting fleet's OWN
  // settled-scan read, mounted here for the same reason `actingScanTargets`
  // is — the early-settle exit below must call its `.refetch()` directly,
  // and it must survive whether or not a `ScanSweepWatcher` happens to be
  // mounted for this fleet. Shares the SAME cache entry
  // (`queryKeys.actions.settled(fleetId)`) `ScanControl`'s own
  // `useSettledScan` and any `ScanSweepWatcher` instance for this fleet
  // already read, so this costs no extra request beyond what they already
  // issue.
  const actingSettledScan = useSettledScan(acting?.id ?? null)
  const actingSettledScanRefetchRef = useRef(actingSettledScan.refetch)
  actingSettledScanRefetchRef.current = actingSettledScan.refetch

  // The commit-time twin of A2 (link8b-adversary-r9, hardened per r10
  // P1/P3) — "committed, awaiting its window". `useScan`'s onSuccess fires
  // two UNORDERED invalidations (the running-status inbox read and the
  // scan-target read), so a held-channel empty scan-target page can land
  // before the running-status read confirms the just-committed sweep.
  // Computed HERE, not inside `ScanControl`, because the marker must
  // survive a REMOUNT of `ScanControl` while the window is open (a fleet-
  // panel collapse/expand is not a re-selection) — a query-cache entry
  // survives that as long as this view's own `QueryClient` does, which a
  // component-local `useState` cannot. `ScanControl` itself calls no
  // React Query hook at all (several suites render it standalone, with no
  // `QueryClientProvider` in the tree), so this owns the read/write both.
  const qc = useQueryClient()
  const actingRunningScan = useRunningScan(acting?.id ?? null)
  const commitPendingMarker = useQuery<number | null>({
    queryKey: queryKeys.fleets.scanCommitPending(acting?.id ?? ''),
    // Never actually fetched — `enabled: false` — this query exists purely
    // as a reactive, cache-backed store `qc.setQueryData` writes into.
    queryFn: () => null,
    enabled: false,
    initialData: null,
  })
  const markScanCommitAccepted = useCallback(() => {
    if (acting?.id) qc.setQueryData(queryKeys.fleets.scanCommitPending(acting.id), Date.now())
  }, [qc, acting?.id])
  // DERIVED, never imperatively cleared: once the running-status read's
  // own `dataUpdatedAt`/`errorUpdatedAt` advances past the marker, a FRESH
  // read has landed — carrying the sweep, carrying nothing (handing off to
  // the settled report, P1b), or failing outright (handing off to the
  // failed-read state, P1a) — and the window is over by construction.
  const committedPending =
    commitPendingMarker.data != null &&
    commitPendingMarker.data > actingRunningScan.dataUpdatedAt &&
    commitPendingMarker.data > actingRunningScan.errorUpdatedAt

  // task 5.13's early-settle exit (F11-1, link8b-adversary-r11): the window
  // above ends one of three ways — a failed read (hands off to the
  // failed-running-read state, no follower reads), a read carrying the
  // sweep as running (hands off to the countdown; `ScanSweepWatcher` arms
  // on the eta it just learned), or a SUCCESSFUL read carrying NOTHING
  // running because the sweep settled inside the commit round trip. Only
  // that third exit has no other trigger for the post-settle follower
  // reads — the client never read a running sweep on this path, so it
  // never learned an eta, so `ScanSweepWatcher`'s own timer never arms.
  // Detected on the pending->not-pending TRANSITION (a ref, not a stored
  // flag) so this fires exactly once per window, reusing the same three
  // follower reads `ScanSweepWatcher` already performs: the pile
  // (`refetchGhostFeed`), the settled-status inbox
  // (`actingSettledScanRefetchRef`), and the scan-target invalidation
  // scoped to the acting fleet.
  const wasCommittedPendingRef = useRef(false)
  // F11-2 (orchestrator ruling 2026-09-03, defect found during the F11-1
  // build): the empty-set copy this transition withholds below must be
  // withheld only for the report THIS transition explains, never for any
  // unacknowledged settled report in general — a blanket
  // `settledScan.data` gate suppresses "No host is in range" forever
  // against a long-unacknowledged report from an ORDINARY, unrelated
  // ETA-path settle. `earlySettleMarkerRef` is set only here, at the
  // instant the window ends this way; once the acting fleet's own
  // settled-status read lands FRESH relative to it (the refetch just
  // below), whatever id it carries (if any) is captured as the report
  // this handoff explains.
  const earlySettleMarkerRef = useRef<number | null>(null)
  const earlySettleExplainedIdRef = useRef<string | null>(null)
  useEffect(() => {
    const was = wasCommittedPendingRef.current
    wasCommittedPendingRef.current = committedPending
    if (!was || committedPending) return
    if (actingRunningScan.isError || actingRunningScan.data) return
    earlySettleMarkerRef.current = Date.now()
    earlySettleExplainedIdRef.current = null
    refetchGhostFeed()
    void actingSettledScanRefetchRef.current()
    if (actingIdRef.current) {
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.scanTargets(actingIdRef.current) })
    }
  }, [committedPending, actingRunningScan.isError, actingRunningScan.data, refetchGhostFeed, qc])

  // Derived every render, never imperatively cleared (mirrors
  // `committedPending`'s own derivation just above): while waiting for the
  // marked transition's own settled-status refetch to land, the handoff is
  // active unconditionally; once it lands, the handoff stays active only
  // while the id it carried is still the unacknowledged report on screen —
  // never for an older or later, unrelated one.
  if (earlySettleMarkerRef.current != null) {
    const landedFresh =
      actingSettledScan.dataUpdatedAt > earlySettleMarkerRef.current ||
      actingSettledScan.errorUpdatedAt > earlySettleMarkerRef.current
    if (landedFresh) {
      earlySettleExplainedIdRef.current = actingSettledScan.data?.id ?? null
      earlySettleMarkerRef.current = null
    }
  }
  const earlySettleHandoff =
    earlySettleMarkerRef.current != null ||
    (earlySettleExplainedIdRef.current != null &&
      actingSettledScan.data?.id === earlySettleExplainedIdRef.current)

  const runningMine = useRunningMine(acting?.id ?? null).data ?? null

  // The clock: the interior read's served scale, falling back to the fleet
  // read's when the interior read has failed.
  const servedScale = interior.data?.scale ?? acting?.scale ?? allFleets[0]?.scale ?? 1
  const serverWorldTime = interior.data?.worldTime ?? acting?.worldTime ?? allFleets[0]?.worldTime
  const worldTime = useWorldTime(serverWorldTime, { scale: servedScale })
  const worldTimeRef = useRef(worldTime)
  worldTimeRef.current = worldTime

  const extent = interior.data?.extent ?? FALLBACK_EXTENT

  const scene = useMemo(
    () =>
      buildSceneModel({
        interior: interior.data ?? null,
        fleets: here,
        worldTimeMs: worldTime,
        reducedMotion: false,
        selection,
        log: (message, detail) => console.warn(`[space] ${message}`, detail),
        sightings: ghostFeed.sightings,
      }),
    [interior.data, here, worldTime, selection, ghostFeed.sightings],
  )

  // QA return (sighting-log "A Log Row and Its Ghost Address the Same
  // Record By Its Served Id"): the log answers "does this row have a mark"
  // by MEMBERSHIP in the set the scene actually drew, never by a list of
  // reasons a mark might be absent -- a list that silently omits the
  // origin-omission rule, the ghost layer's own single-page bound, and
  // canvas unavailability, all three of which this derivation covers for
  // free by reading them off the SAME scene model and the SAME
  // `canvasAvailable` flag the canvas region itself already reports.
  const drawnSightingRecordIds = useMemo(() => {
    const ids = new Set<string>()
    if (!canvasAvailable) return ids
    for (const mark of scene.marks) {
      if (mark.kind === 'sighting' && mark.recordId) ids.add(mark.recordId)
    }
    return ids
  }, [scene, canvasAvailable])

  // --- realtime refetch rules ---------------------------------------------

  // Returns the SAME promise a scan-sweep watcher awaits before issuing its
  // own follower reads (task 6.7/8.8): the pile and the inbox each settle
  // nothing and mint nothing, so a scan settle sequence must never refetch
  // them concurrently with THIS resolving.
  const resync = useCallback(() => {
    return Promise.all([interior.refetch(), fleets.refetch()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interior.refetch, fleets.refetch])

  // F3 (link8b-adversary-r8): the scan-target read rides EVERY refetch rule
  // this view backs for the fleet read — the ETA-scheduled timer (Rule 1,
  // for a running mine's/burn's/jump's arrival), the SSE reconnect resync
  // (Rule 2), and the constant baseline poll (Rule 3) — not only a
  // discrete landed-resolution event. A fleet parked with nothing in
  // range, whose OWN kinematic state never changes, still has an orbiting
  // body drift into range purely from world time advancing; without this
  // the control would say "no host is in range" for the rest of the
  // session. Sequenced strictly AFTER `resync`'s own promise resolves —
  // never baked into `resync` itself, because `ScanSweepWatcher` also
  // calls `resync` (as its own `resyncInterior`) and issues its OWN
  // scan-targets refetch once THAT resolves, scoped to the fleet whose
  // sweep actually settled; folding this in here too would double-fire
  // that path and race the ordering it requires.
  const resyncAndRefreshScanTargets = useCallback(() => {
    return resync().then((results) => {
      if (actingIdRef.current) void actingScanTargetsRefetchRef.current()
      return results
    })
  }, [resync])

  // Rule 1 — self-schedule at the soonest landing: a running mine's ETA, a
  // burn's served arrival, a jump's served arrival.
  const etaCandidates = useMemo(() => {
    const etas: number[] = []
    if (runningMine) etas.push(runningMine.eta)
    for (const fleet of allFleets) {
      if (fleet.state?.Mode === 0 && fleet.state.Burn) etas.push(fleet.state.Burn.ArriveMs)
      if (fleet.jump) etas.push(fleet.jump.arriveMs)
    }
    return etas
  }, [runningMine, allFleets])
  const candidateKey = etaCandidates.join(',')

  useEffect(() => {
    const future = candidateKey
      .split(',')
      .map(Number)
      .filter((e) => Number.isFinite(e) && e > worldTimeRef.current)
    if (future.length === 0) return
    const soonest = Math.min(...future)
    const delay = Math.max(0, soonest - worldTimeRef.current) + ETA_CUSHION_MS
    const timer = setTimeout(resyncAndRefreshScanTargets, delay)
    return () => clearTimeout(timer)
  }, [candidateKey, resyncAndRefreshScanTargets])

  // Rule 2 — the live channel: resync on reconnect, since events may have
  // landed while it was down. (`EventSource` is absent under test.)
  useEffect(() => {
    if (!systemId) return
    const onReconnect = () => resyncAndRefreshScanTargets()
    window.addEventListener('sse-reconnect', onReconnect)
    return () => window.removeEventListener('sse-reconnect', onReconnect)
  }, [systemId, resyncAndRefreshScanTargets])

  // Rule 3 — a constant baseline poll. Animation between refetches makes no
  // request: the clock is projected, not fetched.
  useEffect(() => {
    if (!systemId) return
    const interval = setInterval(resyncAndRefreshScanTargets, BOARD_POLL_MS)
    return () => clearInterval(interval)
  }, [systemId, resyncAndRefreshScanTargets])

  // --- landed resolutions, announced --------------------------------------

  interface FleetPhase {
    burning: boolean
    inTransit: boolean
    attachedTo: string | undefined
  }
  const phaseRef = useRef<Record<string, FleetPhase>>({})
  const mineRunningRef = useRef(false)

  useEffect(() => {
    const previous = phaseRef.current
    const next: Record<string, FleetPhase> = {}
    const landed: string[] = []
    for (const fleet of allFleets) {
      const phase: FleetPhase = {
        burning: fleet.state?.Mode === 0 && !!fleet.state.Burn,
        inTransit: !!fleet.jump,
        attachedTo: fleet.attachedTo,
      }
      next[fleet.id] = phase
      const before = previous[fleet.id]
      if (!before) continue
      if (before.burning && !phase.burning && phase.attachedTo) {
        landed.push(`Burn complete — arrived and attached to ${phase.attachedTo}.`)
      } else if (before.inTransit && !phase.inTransit && fleet.position) {
        landed.push('Jump complete — arrived in the destination system.')
      }

      // add-scan-and-sightings-surface: the served target list is stale the
      // instant the ACTING fleet's own geometry changes — landing a burn or
      // a jump, or attaching to/detaching from a host — even though none of
      // those touch the sensor channel at all (task 4.9 only invalidated
      // scan-targets on a scan commit/cancel, which left a landed fleet
      // showing a target set computed against wherever it used to be; the
      // Playwright non-repro traced the "no scan-targets response" flake to
      // exactly this staleness — a read fired once mid-burn, never
      // re-issued). Hooked into THIS SAME per-fleet landed-resolution
      // detection — the mechanism `Realtime Refetch Rules While the Space
      // View Is Open` already drives the fleet read through — rather than a
      // second, parallel transition tracker. An ACTING-FLEET CHANGE (the
      // player selecting a different fleet) needs no refetch HERE: `use-
      // scan.ts`'s own `staleTime: 0` / `refetchOnMount: 'always'` (F2,
      // link8b-adversary-r8) already forces a genuinely fresh network read
      // on every mount of `useScanTargets` for the newly acting fleet's own
      // (keyed-by-fleetId) cache entry — never a page served from an
      // earlier selection's cache, warm or otherwise.
      if (fleet.id === actingIdRef.current) {
        const landedBurn = before.burning && !phase.burning
        const landedJump = before.inTransit && !phase.inTransit
        const attachmentChanged = before.attachedTo !== phase.attachedTo
        if (landedBurn || landedJump || attachmentChanged) {
          void actingScanTargetsRefetchRef.current()
        }
      }
    }
    phaseRef.current = next

    const mineNow = !!runningMine && runningMine.eta > worldTimeRef.current
    if (mineRunningRef.current && !mineNow) landed.push('Mining run complete.')
    mineRunningRef.current = mineNow

    if (landed.length > 0) setAnnouncement(landed.join(' '))
  }, [allFleets, runningMine])

  // --- departure hand-off, scoped to the ACTING fleet ----------------------

  const actingWasHereRef = useRef(false)
  useEffect(() => {
    const actingFleet = acting
    const present = !!actingFleet && actingFleet.systemId === systemId && !isInTransit(actingFleet)
    if (actingWasHereRef.current && !present) {
      actingWasHereRef.current = false
      router.push('/')
      return
    }
    actingWasHereRef.current = present
  }, [acting, systemId, router])

  // --- roster cross-navigation --------------------------------------------

  const selectFleet = useCallback(
    (fleet: Fleet) => {
      if (isInTransit(fleet)) {
        router.push('/')
        return
      }
      if (fleet.systemId !== systemId) {
        router.push(`/systems/${fleet.systemId}`)
        return
      }
      setActingFleetId(fleet.id)
    },
    [router, systemId],
  )

  // --- derived panel inputs ------------------------------------------------

  const dockedFeature = useMemo(() => {
    if (!interior.data || !acting?.attachedTo) return null
    return interior.data.features.find((f) => f.id === acting.attachedTo) ?? null
  }, [interior.data, acting?.attachedTo])

  const gateFacts = useMemo(() => {
    const gate = (interior.data?.laneGates ?? []).find((g) => g.id === selection?.bodyId)
    return gate ? { bodyId: gate.id, destSystemId: gate.destSystemId } : null
  }, [interior.data, selection?.bodyId])

  // --- the station-anchored inputs ----------------------------------------
  //
  // A 404 is "this system has no visible station" — the ordinary answer, and
  // NOT a failure. Anything else is, and only that shows an error and a
  // retry.
  const noStationHere = stationRead.isError && isNoStation(stationRead.error)
  const stationFailed = stationRead.isError && !noStationHere
  const station: Station | null = stationFailed ? null : (stationRead.data ?? null)

  const boardFailed = boardRead.isError
  // The board carries every visible venue; only the open station's own
  // quotes drive this panel. Keyed on the station's served `systemId` —
  // never on `venue`, which is an opaque scope key no consumer may read as a
  // system id.
  const stationQuotes: VenueQuotes | null = useMemo(() => {
    if (!station || boardFailed) return null
    return boardRead.data?.venues.find((v) => v.systemId === station.systemId) ?? null
  }, [station, boardFailed, boardRead.data])

  // Null — never 0 — when the session has not resolved: the panel renders an
  // explicit unavailable indication for null, and a figure for a number.
  const credits = corporation?.credits ?? null

  const interiorFailed = interior.isError
  const mineRunning = !!runningMine && runningMine.eta > worldTime
  const showLoading = !interiorFailed && canvasAvailable && (interior.isLoading || !firstFrame)

  return (
    <div data-testid="space-view" className="relative flex h-full w-full gap-3">
      {/* The live world clock, exposed so the served scale it runs at is
          observable rather than assumed. */}
      <span
        className="sr-only"
        data-testid="space-world-clock"
        data-scale={String(servedScale)}
        data-world-time={String(Math.round(worldTime))}
      />
      <span className="sr-only" role="status" aria-live="polite" data-testid="space-announcer">
        {announcement}
      </span>

      {/* The ghost layer's own pile read — mounted only once the interior
          read has resolved at least once (task 8.8's mount-ordering rule,
          restated for the ghost layer). Renders nothing itself. */}
      {!interior.isLoading && (
        <SightingsGhostFeed systemId={systemId} onResult={setGhostFeed} />
      )}

      {/* One settle-watcher per own fleet in the open system — not the
          acting fleet alone (`system-space-view`: *A Running Sweep Self-
          Schedules the Refetch That Settles It...*). Each renders nothing. */}
      {here.map((fleet) => (
        <ScanSweepWatcher
          key={fleet.id}
          fleetId={fleet.id}
          worldTimeRef={worldTimeRef}
          actingIdRef={actingIdRef}
          resyncInterior={resync}
          onSettled={refetchGhostFeed}
          onAnnounce={setAnnouncement}
        />
      ))}

      <div className="relative flex-1">
        {interiorFailed ? (
          <div
            data-testid="space-interior-error"
            className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800/50 dark:bg-white/[0.12]"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              The system could not be read. {interior.error?.message ?? ''}
            </p>
            <button
              type="button"
              data-testid="space-interior-retry"
              className="rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300"
              onClick={() => void interior.refetch()}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {showLoading && (
              <div
                data-testid="space-loading"
                className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-zinc-900/60 text-sm text-zinc-300"
              >
                Charting the system…
              </div>
            )}
            <SpaceStage
              systemId={systemId}
              scene={scene}
              extent={extent}
              worldTime={worldTime}
              selection={selection}
              onSelect={(picked) => setSelection((current) => toggleSelection(current, picked))}
              onAvailabilityChange={setCanvasAvailable}
              onFirstFrame={() => setFirstFrame(true)}
              highlightedGhostId={highlightedGhostId}
              onHighlightGhost={setHighlightedGhostId}
            />
          </>
        )}
        {/* The ghost layer's OWN read failed — an absence here is never
            presented as "no sightings in this system"
            (`system-space-view`: *The Sweep Surface's Reads Fail
            Independently...*). */}
        {ghostFeed.isError && (
          <div
            data-testid="sightings-unavailable"
            className="absolute bottom-4 left-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] dark:border-zinc-800/50 dark:bg-white/[0.12]"
          >
            <p className="text-zinc-600 dark:text-zinc-400">
              This system&apos;s sightings could not be read.
            </p>
            <button
              type="button"
              className="mt-1 rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300"
              onClick={ghostFeed.refetch}
            >
              Retry
            </button>
          </div>
        )}
        {logOpen && !interior.isLoading && (
          <div className="absolute right-2 top-2 z-20">
            <SightingLog
              systemId={systemId}
              highlightedGhostId={highlightedGhostId}
              onHighlightRow={setHighlightedGhostId}
              galaxySystemNames={systemNames}
              drawnRecordIds={drawnSightingRecordIds}
            />
          </div>
        )}
      </div>

      <div className="flex w-72 max-w-[85vw] flex-col gap-3">
        {fleets.isError && (
          <div
            data-testid="space-fleets-error"
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] dark:border-zinc-800/50 dark:bg-white/[0.12]"
          >
            <p className="text-zinc-600 dark:text-zinc-400">Your fleets could not be read.</p>
            <button
              type="button"
              data-testid="space-fleets-retry"
              className="mt-1 rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300"
              onClick={() => void fleets.refetch()}
            >
              Retry
            </button>
          </div>
        )}

        <SpaceCommandPanel
          fleet={acting}
          selection={selection}
          gateFacts={gateFacts}
          canvasAvailable={canvasAvailable}
          mineRunning={mineRunning}
        />

        <FleetActionsPanel
          fleet={acting}
          dockedFeature={dockedFeature}
          interiorFailed={interiorFailed}
          station={station}
          stationQuotes={stationQuotes}
          credits={credits}
          canvasAvailable={canvasAvailable}
          worldTime={worldTime}
        />

        {/* A SIBLING of FleetActionsPanel, never nested inside it
            (link8b-impl-contract.md §1.10) — a sweep needs no attachment,
            so `docked-fleet-actions`' own capability boundary stays out of
            it. Remains invokable while the canvas is unavailable, per its
            own component's data anchoring (`fleet`'s own served state and
            the server-served target list, never a canvas selection). */}
        <ScanControl
          fleet={acting}
          worldTime={worldTime}
          onOpenLog={() => setLogOpen(true)}
          committedPending={committedPending}
          onCommitAccepted={markScanCommitAccepted}
          earlySettleHandoff={earlySettleHandoff}
        />

        <button
          type="button"
          data-testid="sighting-log-open"
          className="self-start rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          onClick={() => setLogOpen((open) => !open)}
        >
          {logOpen ? 'Close sighting log' : 'Open sighting log'}
        </button>

        {/* The station read failed — the offers it anchors are withdrawn,
            and their absence is attributed to THAT, never to the system
            having nothing to trade with. A system with no station at all
            (the 404 above) shows nothing here. */}
        {stationFailed && (
          <div
            data-testid="station-unavailable"
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] dark:border-zinc-800/50 dark:bg-white/[0.12]"
          >
            <p className="text-zinc-600 dark:text-zinc-400">
              The station read failed, so trading here is unavailable. Retry the read to sell or
              refuel.
            </p>
            <button
              type="button"
              data-testid="station-retry"
              className="mt-1 rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300"
              onClick={() => void stationRead.refetch()}
            >
              Retry
            </button>
          </div>
        )}

        {/* The board read failed — sell alone is withdrawn. Refuel stays: its
            cost preview comes from the fleet's OWN served fuel price. */}
        {boardFailed && !stationFailed && (
          <div
            data-testid="market-board-unavailable"
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] dark:border-zinc-800/50 dark:bg-white/[0.12]"
          >
            <p className="text-zinc-600 dark:text-zinc-400">
              The price board could not be read, so selling is unavailable. Refuelling still works.
            </p>
            <button
              type="button"
              data-testid="market-board-retry"
              className="mt-1 rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300"
              onClick={() => void boardRead.refetch()}
            >
              Retry
            </button>
          </div>
        )}

        {/* This view owns the fleet commands — they live on the two panels
            above — so the roster here renders selection and status only
            (`fleet-roster`: "The roster renders no commands on a view that
            owns them itself"). No `isChartedGate` stub: withholding jump by
            asserting a falsehood is what the live requirement forbids. */}
        <FleetRoster
          worldTime={worldTime}
          commandOwner="view"
          activeFleetId={acting?.id ?? null}
          currentSystemId={systemId}
          onSelect={selectFleet}
        />
      </div>
    </div>
  )
}

export default SystemSpaceView
