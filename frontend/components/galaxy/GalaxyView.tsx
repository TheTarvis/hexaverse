'use client'

// GalaxyView — the container the home page renders (spec #0002).
//
// Composes the three.js <GalaxyGraph> renderer with two Catalyst overlays:
//  - LEFT  intel panel: galaxy / player summary + stat tiles (system count,
//          region breakdown with colored dots, lane count) and a live-vs-frozen
//          badge (isStartArea).
//  - RIGHT inspector: empty state until a node is selected, then name / region /
//          connections + the major-body skeleton (ALWAYS visible, never gated by
//          `discovered` — spec Decision #7).
//
// The heavy, three-dependent renderer is pulled in via next/dynamic({ssr:false})
// so three.js stays off the SSR/initial-render path entirely.

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Button } from '@/components/catalyst/button'
import { Text, TextLink, Strong } from '@/components/catalyst/text'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useMyFleets, useRoutePreview, useFleetTravel } from '@/hooks/use-fleets'
import { useMarketBoard } from '@/hooks/use-market'
import { MarketBoardPanel } from '@/components/market/MarketBoardPanel'
import type { Quote } from '@/lib/types/market'
import { useWorldTime } from '@/hooks/use-world-time'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { stateAt } from '@/lib/hex'
import { toast } from '@/lib/toast'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'
import type { Galaxy, GalaxyNode, Region } from '@/lib/types/galaxy'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import { fleetStatus } from '@/components/fleet/fleet-status'
// The route preview surfaces its numbers because a 3D view can't be eyeballed for
// distance (#0008 Decision #4); the shared countdown label renders them.
import { formatEta } from '@/lib/eta'
import {
  useRenderGuard,
  CanvasRegionBoundary,
  RendererStateNotice,
  type GuardStatus,
} from '@/components/render-guard'
import { REGION_PALETTE, REGIONS, regionColor } from './region-palette'
import { transitPoint, type NodePositions } from './transit-geometry'
import type { GalaxyGraphController } from './GalaxyGraph'

// A fleet is idle (available to depart) when it isn't mid-order. Judged on the
// EFFECTIVE state (stateAt): a burn whose arrival has passed is already
// coasting/docked — idle — even before a refetch delivers the settled doc.
function isIdle(f: Fleet, worldTime: number): boolean {
  const mode = stateAt(f.state, worldTime).mode
  return mode === 'coast' || mode === 'docked'
}

// isTravelling — out on the lane graph: crossing it, or parked mid-lane after a
// cancel. Either way the fleet is between systems, not in one.
function isTravelling(f: Fleet): boolean {
  return f.state.mode === 'laneTransit' || f.state.mode === 'laneHold'
}

// TravelInfo is the inspector's travel context: the acting fleet, the live route
// preview to the selected system, and the commit handler (#0008).
interface TravelInfo {
  activeFleet: Fleet
  isHere: boolean
  route: UseQueryResult<RoutePreview, Error>
  worldTime: number
  onTravel: () => void
  committing: boolean
  nameById: Map<string, string>
}

// Client-only: GalaxyGraph statically imports `three` (and the camera rig), so
// importing it lazily keeps that weight off the SSR path (spec Design details →
// Library / Bundle). ssr:false because three needs `document`/WebGL.
const GalaxyGraph = dynamic(() => import('./GalaxyGraph').then((m) => m.GalaxyGraph), {
  ssr: false,
  loading: () => <GraphFallback label="Loading renderer…" />,
})

function GraphFallback({ label }: { label: string }) {
  return (
    <div
      data-testid="graph-loading"
      className="absolute inset-0 grid place-items-center text-sm text-white/50"
    >
      {label}
    </div>
  )
}

// add-renderer-availability-states: the 'retrying' status carries no
// presentation of its own — display as whichever of unsupported/interrupted
// the preserved cause implies (the guard machine keeps `cause: 'lost'`
// through a retry started from the interrupted state, and anything else
// through one started from unsupported). Distinct testids from
// `GraphFallback` above (design.md, "two testability notes") — the
// unsupported/interrupted state is independent of, and never confused with,
// the code-split loading fallback or the galaxy data read.
function guardDisplayStatus(status: GuardStatus, cause: string | null): 'unsupported' | 'interrupted' {
  if (status === 'interrupted') return 'interrupted'
  if (status === 'retrying' && cause === 'lost') return 'interrupted'
  return 'unsupported'
}

// A colored region dot — the ONE raw-value colour exception (region-palette).
function RegionDot({ region }: { region: Region }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-white/20"
      style={{ backgroundColor: regionColor(region) }}
    />
  )
}

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export function GalaxyView() {
  const { data: galaxy, isLoading, isError, error, isStartArea } = useGalaxy()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A fleet clicked on its lane (or in the roster) — the inspector's subject when
  // the thing you're looking at is between systems (#0008).
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null)
  const [graphReady, setGraphReady] = useState(false)
  const controllerRef = useRef<GalaxyGraphController | null>(null)
  const router = useRouter()
  const qc = useQueryClient()

  // add-renderer-availability-states — the shared guard (design.md, "the
  // shared guard module's public API"). Mounted unconditionally (hooks
  // can't be conditional), ahead of the galaxy read's own loading/error
  // early returns below — those still take precedence over anything the
  // guard shows (task 3.1's regression pin: a failed data read is checked
  // first). `canvas` stays null until GalaxyGraph's `onReady` hands up a
  // controller exposing the already-mounted FG3D renderer's canvas — the
  // right seam for loss/restore listeners, never for creation-failure
  // detection (design.md).
  const [attempt, setAttempt] = useState(0)
  const [guardCanvas, setGuardCanvas] = useState<HTMLCanvasElement | null>(null)
  const guard = useRenderGuard({
    canvas: guardCanvas,
    surface: 'galaxy',
    // Optional-call degradation, not a cast: `GalaxyGraphController` is a
    // hand-declared interface TypeScript never structurally checks against
    // the library's real type (design.md Risks) — and test doubles for the
    // controller (GalaxyView.test.tsx's mock) legitimately omit these. A
    // missing accessor just means the loop keeps running, never a crash.
    onSuspend: () => controllerRef.current?.pause?.(),
    onResume: () => controllerRef.current?.resume?.(),
  })
  const canvasAvailable = guard.status === 'live'
  // QA MAJOR fix (add-renderer-availability-states): whether the canvas
  // REGION stays mounted, distinct from `canvasAvailable` (which also gates
  // recenter/travel availability). 'unsupported' has no usable context —
  // tearing the region down is correct. 'interrupted' must keep the SAME
  // <GalaxyGraph>/FG3D canvas mounted and attached to the document, because
  // that is what the browser's native context-restore path (and three's own
  // already-registered `webglcontextrestored` re-init) depends on: once a
  // canvas is detached, `webglcontextrestored` never fires for it again.
  // 'retrying' is deliberately excluded — the explicit Retry escape hatch
  // still tears down and remounts fresh (handleGuardRetry nulls the
  // controller/canvas below), which is the one case a full remount is
  // actually wanted.
  const canvasRegionMounted = guard.status === 'live' || guard.status === 'interrupted'

  // Retry remounts <GalaxyGraph> fresh (tasks.md 3.3) — FG3D exposes no
  // recreate-in-place API. The guard's own re-probe (`probeWebgl2`,
  // independent of FG3D) is what settles retrySucceeded/retryFailed; the
  // remount that follows is a consequence of the composition below
  // swapping back to the live branch below, with the boundary as the
  // backstop if THAT construction throws again — converting straight back
  // to the unsupported/interrupted state via `reportRenderError`, which the
  // player observes identically to a `retryFailed` outcome.
  const handleGuardRetry = useCallback(() => {
    controllerRef.current = null
    setGraphReady(false)
    setGuardCanvas(null)
    setAttempt((a) => a + 1)
    guard.retry()
  }, [guard])

  // The canvas region unmounts <GalaxyGraph> only when it leaves
  // live/interrupted (composition snippet below) — nothing should keep
  // referencing its now-torn-down controller once that happens. Keyed on
  // `canvasRegionMounted`, NOT `canvasAvailable`: the controller (and the
  // canvas the guard's listeners are attached to) must survive the
  // 'interrupted' state, since that's exactly what lets a real browser
  // restore call `onResume` (-> `controllerRef.current?.resume?.()`) through
  // a still-valid ref instead of a silently-nulled one.
  useEffect(() => {
    if (!canvasRegionMounted) {
      controllerRef.current = null
    }
  }, [canvasRegionMounted])

  // The requester's own fleets (#0008) — the travel actors. Disabled on the
  // logged-out start area (no auth token, and nothing to command).
  const { data: myFleets } = useMyFleets({ enabled: !isStartArea })
  const ownFleets = useMemo(() => myFleets ?? [], [myFleets])
  // Live clock (for ETA countdowns and effective-state reads) anchored to the
  // fleet read; scale 1 today.
  const worldTime = useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)
  // The fleet a "Travel here" order commands: prefer an idle one, else the first.
  const activeFleet = useMemo(
    () => ownFleets.find((f) => isIdle(f, worldTime)) ?? ownFleets[0] ?? null,
    [ownFleets, worldTime],
  )
  // Systems hosting an own fleet → galaxy-tier presence markers; the fleet's
  // system is the ⌖ recenter / wake-focus home target (#0002 Follow-ups). A fleet
  // out on a lane is NOT on station anywhere — its `systemId` still names the
  // system it left until arrival resolves, so pinning a pip there would show it
  // parked at home while it's actually in flight. The transit layer draws it.
  const fleetSystemIds = useMemo(
    () => ownFleets.filter((f) => !isTravelling(f)).map((f) => f.systemId),
    [ownFleets],
  )

  // The wake-up handoff (#0009): spawn stashes the home system id so the view can
  // select + glide to it on the first mount after waking. Read once, client-only
  // (sessionStorage is unavailable during SSR), then cleared so it fires once.
  const [wakeFocus, setWakeFocus] = useState<string | null>(null)
  useEffect(() => {
    try {
      const w = sessionStorage.getItem('wakeFocus')
      if (w) {
        setWakeFocus(w)
        sessionStorage.removeItem('wakeFocus')
      }
    } catch {
      // sessionStorage may be unavailable (private mode) — non-fatal.
    }
  }, [])
  const homeSystemId = activeFleet?.systemId ?? wakeFocus
  const transitFleets = useMemo(() => ownFleets.filter(isTravelling), [ownFleets])
  useTravelArrivals(transitFleets, worldTime, qc)

  // Route preview for the select→preview gesture: only when an idle-ish active
  // fleet exists and the selected system isn't the one it's already in.
  const previewDest =
    activeFleet && selectedId && selectedId !== activeFleet.systemId ? selectedId : null
  const routeQuery = useRoutePreview(activeFleet?.id ?? null, previewDest)
  const travel = useFleetTravel()

  const onTravel = useCallback(() => {
    if (!activeFleet || !previewDest) return
    travel.mutate(
      { fleetId: activeFleet.id, systemId: previewDest },
      {
        onSuccess: () => {
          toast.success('Fleet departing')
          setSelectedId(null)
        },
        onError: (e) => toast.error(e.message || 'Could not plot a route'),
      },
    )
  }, [activeFleet, previewDest, travel])

  // Per-system lane (connection) counts and region tallies, derived once.
  const { laneCountById, regionCounts } = useMemo(() => {
    const laneCountById = new Map<string, number>()
    const regionCounts = new Map<Region, number>()
    if (galaxy) {
      for (const l of galaxy.links) {
        laneCountById.set(l.source, (laneCountById.get(l.source) ?? 0) + 1)
        laneCountById.set(l.target, (laneCountById.get(l.target) ?? 0) + 1)
      }
      for (const n of galaxy.nodes) {
        regionCounts.set(n.region, (regionCounts.get(n.region) ?? 0) + 1)
      }
    }
    return { laneCountById, regionCounts }
  }, [galaxy])

  const selected = useMemo(
    () => (galaxy && selectedId ? (galaxy.nodes.find((n) => n.id === selectedId) ?? null) : null),
    [galaxy, selectedId],
  )

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of galaxy?.nodes ?? []) m.set(n.id, n.name)
    return m
  }, [galaxy])

  // The market board (#0011): every station this corporation has charted. The
  // panel ranks them; this view decides a row selection focuses that system.
  const marketBoard = useMarketBoard(!isStartArea)
  const selectedStationQuotes = useMemo(() => {
    if (!selectedId) return null
    return marketBoard.data?.venues.find((v) => v.systemId === selectedId)?.quotes ?? null
  }, [marketBoard.data, selectedId])

  // Row selection, delegated from the shared panel: select the system and glide
  // the camera to it — the galaxy view's own meaning for "show me this venue".
  const handleSelectSystemId = useCallback((systemId: string) => {
    setSelectedFleetId(null)
    setSelectedId(systemId)
    controllerRef.current?.focusSystem(systemId)
  }, [])

  const handleRecenter = () => controllerRef.current?.recenter()
  const handleEnterSystem = useCallback(
    (systemId: string) => router.push(`/systems/${systemId}`),
    [router],
  )

  // Star positions, for pointing the camera at a fleet that's out on a lane.
  const nodePositions = useMemo<NodePositions>(
    () => new Map((galaxy?.nodes ?? []).map((n) => [n.id, { x: n.x, y: n.y, z: n.z }])),
    [galaxy],
  )

  // Roster row → "show me this fleet". A fleet in a system selects and glides to
  // its star; one on a lane glides to the point it currently occupies (and opens
  // its card), so the click always lands the camera on the hull itself.
  const handleShowFleet = useCallback(
    (fleet: Fleet) => {
      const lane = transitPoint(fleet, worldTime, nodePositions)
      if (lane) {
        setSelectedId(null)
        setSelectedFleetId(fleet.id)
        controllerRef.current?.focusPoint(lane)
        return
      }
      setSelectedFleetId(null)
      setSelectedId(fleet.systemId)
      controllerRef.current?.focusSystem(fleet.systemId)
    },
    [worldTime, nodePositions],
  )

  // Clicking a fleet's lane marker on the graph opens its card (and drops any
  // system selection — you're inspecting the hull, not a star).
  const handleSelectFleet = useCallback((fleetId: string) => {
    setSelectedId(null)
    setSelectedFleetId(fleetId)
  }, [])

  // The card's subject; it closes itself when the fleet stops travelling (it
  // arrived — the star's own card takes over).
  const selectedFleet = useMemo(
    () => transitFleets.find((f) => f.id === selectedFleetId) ?? null,
    [transitFleets, selectedFleetId],
  )

  // On the first mount after waking (#0009): select home and glide the camera to
  // it once the graph is ready — so the new player lands looking at their system
  // with the inspector (and "Your fleet is here") already open. Runs once.
  const wakeHandledRef = useRef(false)
  useEffect(() => {
    if (wakeHandledRef.current || !graphReady || !wakeFocus || !galaxy) return
    if (galaxy.nodes.some((n) => n.id === wakeFocus)) {
      setSelectedId(wakeFocus)
      controllerRef.current?.focusSystem(wakeFocus)
      wakeHandledRef.current = true
    }
  }, [graphReady, wakeFocus, galaxy])

  if (isLoading) {
    return (
      <div data-testid="galaxy-view" className="relative h-dvh w-full overflow-hidden bg-[#05070d]">
        <GraphFallback label="Charting the galaxy…" />
      </div>
    )
  }

  if (isError || !galaxy) {
    return (
      <div
        data-testid="galaxy-view"
        className="relative grid h-dvh w-full place-items-center overflow-hidden bg-[#05070d] px-6"
      >
        <div className={PANEL}>
          <Subheading className="!text-white">Couldn’t load the galaxy</Subheading>
          <Text className="mt-1 !text-zinc-400">
            {error?.message ?? 'The galaxy read failed. Try again shortly.'}
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="galaxy-view" className="relative h-dvh w-full overflow-hidden bg-[#05070d]">
      {/* add-renderer-availability-states — the graph's canvas region only,
          per design.md's composition snippet: the intel panel, roster,
          inspector, and fleet card below sit OUTSIDE this boundary,
          untouched by whether the renderer is available (A3's canvas-region-
          only scoping).

          QA MAJOR-defect fix: 'unsupported' and 'interrupted' are NOT the
          same arm. 'unsupported' has no usable context, so tearing the
          subtree down (below) is correct and unchanged. 'interrupted' keeps
          <GalaxyGraph> — and the FG3D canvas the guard's loss/restore
          listeners are attached to — mounted and attached to the document;
          the notice renders as an overlay ABOVE it instead of replacing it.
          Unmounting on every non-live status (the prior composition) tore
          the canvas out of the document the instant a loss fired, and a
          detached canvas never receives `webglcontextrestored` again — an
          ordinary tab background/foreground cycle then could never
          self-heal. The unsupported-arm's own notice and the interrupted
          overlay are still mutually exclusive (only one status is active at
          a time), so nothing double-renders. */}
      {guard.status === 'unsupported' ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <RendererStateNotice
            status="unsupported"
            cause={guard.cause}
            surface="galaxy"
            retrying={false}
            onRetry={handleGuardRetry}
          />
        </div>
      ) : guard.status === 'retrying' ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <RendererStateNotice
            status={guardDisplayStatus(guard.status, guard.cause)}
            cause={guard.cause}
            surface="galaxy"
            retrying
            onRetry={handleGuardRetry}
          />
        </div>
      ) : (
        <>
          <CanvasRegionBoundary
            key={attempt}
            onError={guard.reportRenderError}
            fallback={
              <div className="absolute inset-0 grid place-items-center p-6">
                <RendererStateNotice
                  status="unsupported"
                  cause={guard.cause}
                  surface="galaxy"
                  retrying={false}
                  onRetry={handleGuardRetry}
                />
              </div>
            }
          >
            <GalaxyGraph
              key={attempt}
              galaxy={galaxy}
              selectedId={selectedId}
              onSelect={(node) => {
                setSelectedId(node?.id ?? null)
                setSelectedFleetId(null)
              }}
              fleetSystemIds={fleetSystemIds}
              transitFleets={transitFleets}
              onSelectFleet={handleSelectFleet}
              worldTime={worldTime}
              homeSystemId={homeSystemId}
              onReady={(controller) => {
                controllerRef.current = controller
                setGraphReady(true)
                setGuardCanvas(controller.canvas?.() ?? null)
              }}
            />
          </CanvasRegionBoundary>
          {/* guard.status === 'interrupted' here (the only remaining case:
              'live' shows no notice at all) — an overlay above the
              still-mounted canvas region, per the fix above. */}
          {guard.status === 'interrupted' && (
            <div className="absolute inset-0 grid place-items-center p-6">
              <RendererStateNotice
                status="interrupted"
                cause={guard.cause}
                surface="galaxy"
                retrying={false}
                onRetry={handleGuardRetry}
              />
            </div>
          )}
        </>
      )}

      {/* Overlay layer — panels catch pointer events, the gap between lets the
          graph receive orbit/pan/zoom/clicks. */}
      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        <div className="flex flex-col gap-4 self-start">
          <IntelPanel
            galaxy={galaxy}
            isStartArea={isStartArea}
            regionCounts={regionCounts}
            onRecenter={handleRecenter}
            available={canvasAvailable}
          />
          <FleetRoster
            worldTime={worldTime}
            activeFleetId={selectedFleetId ?? activeFleet?.id ?? null}
            onSelect={handleShowFleet}
            enabled={!isStartArea}
          />
          {/* The market board's first mount point (the second is the station
              inspector on the board view). The SAME shared panel: it ranks and
              presents; this view decides that a row selection FOCUSES that
              system on the graph. */}
          {!isStartArea && (
            <div className={PANEL}>
              <MarketBoardPanel
                board={marketBoard.data}
                isLoading={marketBoard.isLoading}
                isError={marketBoard.isError}
                homeSystemId={activeFleet?.systemId ?? null}
                onSelectSystem={handleSelectSystemId}
              />
            </div>
          )}
        </div>
        {selectedFleet ? (
          <FleetCard
            fleet={selectedFleet}
            worldTime={worldTime}
            nameById={nameById}
            onClose={() => setSelectedFleetId(null)}
          />
        ) : (
          <Inspector
            node={selected}
            connections={selected ? (laneCountById.get(selected.id) ?? 0) : 0}
            stationQuotes={selectedStationQuotes}
            onEnter={isStartArea ? null : handleEnterSystem}
            available={canvasAvailable}
            hasOwnFleet={ownFleets.length > 0}
            travel={
              activeFleet
                ? {
                    activeFleet,
                    isHere: !!selected && selected.id === activeFleet.systemId,
                    route: routeQuery,
                    worldTime,
                    onTravel,
                    committing: travel.isPending,
                    nameById,
                  }
                : null
            }
          />
        )}
      </div>

      {/* A trip in flight needs no banner of its own: the roster carries every
          fleet's route + live ETA, the graph draws the hull crawling its lane,
          and clicking that hull opens its card. */}
    </div>
  )
}

// useTravelArrivals self-schedules the arrival for each travelling fleet: at its
// ETA it GETs the fleet (forcing the server's lazy arrival resolution) then
// refreshes the fleet layer and the now-revealed galaxy — so the destination
// lights up without a manual refresh, surviving a reload mid-trip (#0008). The
// worldTime is read through a ref so the per-frame clock tick never resets the timer.
function useTravelArrivals(
  transitFleets: Fleet[],
  worldTime: number,
  qc: ReturnType<typeof useQueryClient>,
): void {
  const worldTimeRef = useRef(worldTime)
  worldTimeRef.current = worldTime

  const arrivals = transitFleets
    .map((f) => ({ id: f.id, eta: f.state.laneTransit?.arriveTime }))
    .filter((a): a is { id: string; eta: number } => a.eta !== undefined)
  const soonest = arrivals.length ? Math.min(...arrivals.map((a) => a.eta)) : undefined
  const key = arrivals.map((a) => `${a.id}:${a.eta}`).join(',')

  useEffect(() => {
    if (soonest === undefined) return
    const delay = Math.max(0, soonest - worldTimeRef.current) + 500
    const timer = setTimeout(() => {
      // GET each transiting fleet to settle its arrival, then refresh.
      void Promise.allSettled(arrivals.map((a) => fleetService.get(a.id))).then(() => {
        void qc.invalidateQueries({ queryKey: queryKeys.fleets.mine() })
        void qc.invalidateQueries({ queryKey: queryKeys.galaxy.live() })
      })
    }, delay)
    return () => clearTimeout(timer)
    // Re-arm only when the set of (fleet, eta) changes, not every clock frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qc])
}

// ---- Left intel panel ----

function IntelPanel({
  galaxy,
  isStartArea,
  regionCounts,
  onRecenter,
  available,
}: {
  galaxy: Galaxy
  isStartArea: boolean
  regionCounts: Map<Region, number>
  onRecenter: () => void
  // add-renderer-availability-states (tasks.md 3.4): recenter is a
  // canvas-only control — with no graph, it is a silent dead control —
  // disabled while the canvas region shows the unsupported/interrupted
  // state, rather than presented as operable.
  available: boolean
}) {
  return (
    <aside
      data-testid="intel-panel"
      className={`${PANEL} flex w-72 max-w-[80vw] flex-col gap-4 self-start`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Heading level={2} className="!text-base !text-white">
            {isStartArea ? 'Start Area' : 'Live Galaxy'}
          </Heading>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
            {isStartArea ? 'Frozen · read-only' : 'Live · your galaxy'}
          </p>
        </div>
        <Button
          plain
          onClick={onRecenter}
          disabled={!available}
          data-testid="galaxy-recenter"
          title="Recenter the view"
          aria-label="Recenter"
          className="!text-lg !text-white"
        >
          ⌖
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Systems" value={galaxy.nodes.length} />
        <StatTile label="Lanes" value={galaxy.links.length} />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-zinc-400 uppercase">Regions</p>
        <ul className="flex flex-col gap-1.5">
          {REGIONS.filter((r) => (regionCounts.get(r) ?? 0) > 0).map((r) => (
            <li key={r} className="flex items-center justify-between text-sm text-white">
              <span className="flex items-center gap-2">
                <RegionDot region={r} />
                {REGION_PALETTE[r].label}
              </span>
              <span className="font-mono text-zinc-400">{regionCounts.get(r) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      {isStartArea && (
        <div
          data-testid="signin-prompt"
          className="rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 dark:border-zinc-800/50 dark:bg-black/30"
        >
          <Text className="!text-xs !text-zinc-300">
            You’re exploring the frozen start area. <Strong className="!text-white">Sign in</Strong>{' '}
            to command a fleet and claim a system.
          </Text>
          <TextLink href="/login" className="mt-1 inline-block text-xs !text-sky-400">
            Sign in →
          </TextLink>
        </div>
      )}
    </aside>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
      <div className="font-mono text-xl leading-none text-white">{value}</div>
      <div className="mt-1 text-[11px] tracking-wide text-zinc-400 uppercase">{label}</div>
    </div>
  )
}

// ---- Right inspector ----

function Inspector({
  node,
  connections,
  travel,
  onEnter,
  available,
  hasOwnFleet,
  stationQuotes = null,
}: {
  node: GalaxyNode | null
  connections: number
  travel: TravelInfo | null
  onEnter: ((systemId: string) => void) | null
  // add-renderer-availability-states (tasks.md 3.4): `available` is the
  // graph canvas region's live status; `hasOwnFleet` is whether the
  // requester has at least one own fleet in the roster — a real,
  // canvas-free path to a system via the roster's own row callback
  // (`handleShowFleet`). Together they pick the empty-selection prompt's
  // three-way copy: the graph's own "select on the canvas" instruction only
  // applies while a canvas exists to select on.
  available: boolean
  hasOwnFleet: boolean
  // This system's station quotes (#0011), or null when it has none visible to
  // the requester. Rendered as demand entries, never a floor/requests split.
  stationQuotes?: Quote[] | null
}) {
  if (!node) {
    return (
      <aside
        data-testid="inspector"
        className={`${PANEL} flex w-72 max-w-[80vw] flex-col self-start`}
      >
        <p className="text-sm text-zinc-400">
          {available
            ? 'Select a system to inspect its star, bodies, and lanes.'
            : hasOwnFleet
              ? 'Select an own fleet in the roster to inspect its system.'
              : 'Select an own fleet in the roster, or wait until the graph is available to pick any other system.'}
        </p>
      </aside>
    )
  }

  return (
    <aside
      data-testid="inspector"
      className={`${PANEL} flex w-72 max-w-[80vw] flex-col gap-3 self-start`}
    >
      <div>
        <Heading level={2} data-testid="inspector-name" className="!text-base !text-white">
          {node.name}
        </Heading>
        <p
          data-testid="inspector-region"
          className="mt-1 flex items-center gap-2 text-sm text-zinc-300"
        >
          <RegionDot region={node.region} />
          {REGION_PALETTE[node.region].label}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
          <dt className="text-[11px] tracking-wide text-zinc-400 uppercase">Lanes</dt>
          <dd className="font-mono text-white">{connections}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
          <dt className="text-[11px] tracking-wide text-zinc-400 uppercase">Star</dt>
          <dd className="font-mono text-white">Class {node.skeleton.starClass}</dd>
        </div>
      </dl>

      {/* Drill-in to the #0007 hex board (#0002 Follow-ups 2026-07-11 —
          un-defers Decision #4). Board detail is arrival-gated (#0003/#0006);
          an unvisited system shows only its free skeleton. */}
      {onEnter && (
        <Button
          color="cyan"
          onClick={() => onEnter(node.id)}
          data-testid="enter-system-button"
          className="w-full"
        >
          Enter system
        </Button>
      )}

      {/* Major-body skeleton — the free astronomical layer, ALWAYS shown
          (spec Decision #7); never gated by `discovered`. */}
      <div>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-zinc-400 uppercase">
          Major bodies
        </p>
        {node.skeleton.bodies.length === 0 ? (
          <p className="text-sm text-zinc-500">No major bodies.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {node.skeleton.bodies.map((b, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-100/50 px-2.5 py-1.5 text-sm text-white dark:border-zinc-800/50 dark:bg-black/20"
              >
                <span className="capitalize">{b.type.replace('_', ' ')}</span>
                <span className="font-mono text-xs text-zinc-400">ring {b.ring}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The station section (#0011) — the free astronomical layer's commercial
          half. Shown only when a station resolves for this system; a station
          below the requester's graph tier reads 404 server-side, so "no station
          visible" and "no station here" look identical, by design. */}
      {stationQuotes && stationQuotes.length > 0 && (
        <div data-testid="inspector-station">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Trading station
          </p>
          <ul className="flex flex-col gap-1">
            {stationQuotes.map((q) => {
              const top = q.entries.find((e) =>
                e.unlimited ? true : (e.remainingQuantity ?? 0) > 0,
              )
              if (!top) return null
              return (
                <li
                  key={q.kind}
                  data-testid={`inspector-quote-${q.kind}`}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-100/50 px-2.5 py-1.5 text-sm text-white dark:border-zinc-800/50 dark:bg-black/20"
                >
                  <span className="flex items-center gap-1.5">
                    {/* Request vs floor carried by a glyph and a word, never by
                        colour alone. */}
                    <span aria-hidden="true" className="text-xs">
                      {top.source === 'request' ? '★' : '·'}
                    </span>
                    <span className="capitalize">{q.kind}</span>
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">
                      {top.source === 'request' ? 'request' : 'floor'}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-zinc-300 tabular-nums">
                    {top.unitPrice} cr/t
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {node.tier === 'starVisible' && (
        <p className="text-xs text-zinc-500 italic">
          Uncharted — survey or travel to chart subspace routes and reveal its worth.
        </p>
      )}

      {travel && <TravelSection node={node} travel={travel} />}
    </aside>
  )
}

// TravelSection is the select→preview→commit gesture on the galaxy tier (#0008):
// with an active fleet, selecting another system previews the shortest lane route
// (per-leg + total ETA) and offers "Travel here". A no-charted-route destination
// says so instead of offering the trip.
function TravelSection({ node, travel }: { node: GalaxyNode; travel: TravelInfo }) {
  const { isHere, route, worldTime, onTravel, committing, nameById } = travel

  if (isHere) {
    return (
      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800/50">
        <p data-testid="travel-here-note" className="text-xs text-zinc-400">
          Your fleet is here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800/50">
      <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Travel</p>

      {route.isLoading && <p className="text-sm text-zinc-400">Plotting a route…</p>}

      {route.isError && (
        <p data-testid="no-route" className="text-sm text-amber-400">
          No charted route to {node.name}. Explore toward it first.
        </p>
      )}

      {route.data && (
        <>
          <RouteLegs preview={route.data} worldTime={worldTime} nameById={nameById} />
          <Button
            color="sky"
            onClick={onTravel}
            disabled={committing}
            data-testid="travel-button"
            className="mt-1 w-full"
          >
            {committing
              ? 'Departing…'
              : `Travel here · ${formatEta(route.data.totalEta - worldTime)}`}
          </Button>
        </>
      )}
    </div>
  )
}

// FleetCard is what a fleet on a lane says when you click its marker (or its
// roster row): who it is, where it's headed, the lane chain still ahead of it,
// and when it lands. The inspector's counterpart for a thing that is *between*
// systems — a star's card can't describe it, because it isn't at one.
function FleetCard({
  fleet,
  worldTime,
  nameById,
  onClose,
}: {
  fleet: Fleet
  worldTime: number
  nameById: Map<string, string>
  onClose: () => void
}) {
  const name = (id: string) => nameById.get(id) ?? id
  const status = fleetStatus(fleet, worldTime, name)
  const lt = fleet.state.laneTransit

  return (
    <aside
      data-testid="fleet-card"
      className={`${PANEL} flex w-72 max-w-[80vw] flex-col gap-3 self-start`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Heading level={2} className="!text-base !text-white">
            Your fleet
          </Heading>
          <p className="mt-0.5 text-sm text-zinc-400">{status.where}</p>
        </div>
        <Button
          plain
          onClick={onClose}
          data-testid="fleet-card-close"
          className="!text-xs !text-zinc-400"
        >
          Close
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800/50">
        <span className="text-white">{status.activity}</span>
        {status.remainingMs !== undefined && (
          <span data-testid="fleet-card-eta" className="font-mono text-xs text-zinc-400">
            arrives {formatEta(status.remainingMs)}
          </span>
        )}
      </div>

      {lt && (
        <RouteLegs
          preview={{
            route: lt.route,
            legEtas: lt.legEtas,
            totalEta: lt.arriveTime,
            departGate: { q: 0, r: 0 },
            worldTime,
          }}
          worldTime={worldTime}
          nameById={nameById}
        />
      )}
    </aside>
  )
}

// RouteLegs lists the lane chain with a per-leg ETA and the total — the numbers a
// 3D view can't be eyeballed for (#0008 Decision #4).
function RouteLegs({
  preview,
  worldTime,
  nameById,
}: {
  preview: RoutePreview
  worldTime: number
  nameById: Map<string, string>
}) {
  const name = (id: string) => nameById.get(id) ?? id
  return (
    <div data-testid="route-preview" className="flex flex-col gap-1">
      <ul className="flex flex-col gap-0.5">
        {preview.route.slice(1).map((sysId, i) => (
          <li
            key={sysId}
            className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-100/50 px-2.5 py-1 text-sm text-white dark:border-zinc-800/50 dark:bg-black/20"
          >
            <span className="truncate">
              <span className="text-zinc-500">{i + 1}.</span> {name(sysId)}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              {formatEta(preview.legEtas[i + 1] - worldTime)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-1 text-xs text-zinc-400">
        <span>
          {preview.route.length - 1} {preview.route.length - 1 === 1 ? 'jump' : 'jumps'}
        </span>
        <span className="font-mono">total {formatEta(preview.totalEta - worldTime)}</span>
      </div>
    </div>
  )
}

export default GalaxyView
