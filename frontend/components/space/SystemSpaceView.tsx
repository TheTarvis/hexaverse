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
// THE STATION'S LATTICE `orbit` IS NEVER READ HERE. It still rides the wire
// (`lib/types/market.ts`), and task 10.11's grep looks for `@/lib/board`
// imports, so reading it would pass every gate silently. Only `systemId` and
// `featureId` are consumed.
//
// THE CLOCK IS PROJECTED AT THE SERVED SCALE, never an assumed 1 — and when
// the interior read has failed, at the FLEET read's served scale, because
// that is then the only clock on screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import { useCorporationOptional } from '@/components/corporation-provider'
import { useRunningMine } from '@/hooks/use-actions'
import { useMyFleets } from '@/hooks/use-fleets'
import { useMarketBoard, useStation } from '@/hooks/use-market'
import { useSystemSpace } from '@/hooks/use-system-space'
import { useWorldTime } from '@/hooks/use-world-time'
import { BOARD_POLL_MS, ETA_CUSHION_MS } from '@/lib/realtime'
import type { Fleet } from '@/lib/types/fleet'
import type { Station, VenueQuotes } from '@/lib/types/market'
import { FleetActionsPanel } from './FleetActionsPanel'
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

  const allFleets = useMemo(() => fleets.data ?? [], [fleets.data])
  const here = useMemo(
    () => allFleets.filter((f) => f.systemId === systemId && !isInTransit(f)),
    [allFleets, systemId],
  )
  const acting =
    allFleets.find((f) => f.id === actingFleetId) ?? here[0] ?? null

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
      }),
    [interior.data, here, worldTime, selection],
  )

  // --- realtime refetch rules ---------------------------------------------

  const resync = useCallback(() => {
    void interior.refetch()
    void fleets.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interior.refetch, fleets.refetch])

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
    const timer = setTimeout(resync, delay)
    return () => clearTimeout(timer)
  }, [candidateKey, resync])

  // Rule 2 — the live channel: resync on reconnect, since events may have
  // landed while it was down. (`EventSource` is absent under test.)
  useEffect(() => {
    if (!systemId) return
    const onReconnect = () => resync()
    window.addEventListener('sse-reconnect', onReconnect)
    return () => window.removeEventListener('sse-reconnect', onReconnect)
  }, [systemId, resync])

  // Rule 3 — a constant baseline poll. Animation between refetches makes no
  // request: the clock is projected, not fetched.
  useEffect(() => {
    if (!systemId) return
    const interval = setInterval(resync, BOARD_POLL_MS)
    return () => clearInterval(interval)
  }, [systemId, resync])

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
            />
          </>
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
