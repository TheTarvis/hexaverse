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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Button } from '@/components/catalyst/button'
import { Text, TextLink, Strong } from '@/components/catalyst/text'
import { useAccountContext } from '@/components/account-provider'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useMyFleets, useRoutePreview, useFleetTravel } from '@/hooks/use-fleets'
import { useWorldTime } from '@/hooks/use-world-time'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'
import type { Galaxy, GalaxyNode, Region } from '@/lib/types/galaxy'
import { REGION_PALETTE, REGIONS, regionColor } from './region-palette'
import type { GalaxyGraphController } from './GalaxyGraph'

// formatEta renders a world-ms duration as a compact "3h 20m" / "45s" label — the
// route preview surfaces the numbers because a 3D view can't be eyeballed for
// distance (#0008 Decision #4). worldTime runs at scale 1 today, so ms are real.
function formatEta(ms: number): string {
  if (ms <= 0) return 'now'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

// A fleet is idle (available to depart) when it isn't mid-order.
function isIdle(f: Fleet): boolean {
  return f.state.mode === 'coast' || f.state.mode === 'docked'
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
    <div className="absolute inset-0 grid place-items-center text-sm text-white/50">{label}</div>
  )
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
  const controllerRef = useRef<GalaxyGraphController | null>(null)
  const qc = useQueryClient()

  // The requester's own fleets (#0008) — the travel actors. Disabled on the
  // logged-out start area (no auth token, and nothing to command).
  const { data: myFleets } = useMyFleets({ enabled: !isStartArea })
  const ownFleets = useMemo(() => myFleets ?? [], [myFleets])
  // The fleet a "Travel here" order commands: prefer an idle one, else the first.
  const activeFleet = useMemo(() => ownFleets.find(isIdle) ?? ownFleets[0] ?? null, [ownFleets])
  const transitFleets = useMemo(
    () => ownFleets.filter((f) => f.state.mode === 'laneTransit' || f.state.mode === 'laneHold'),
    [ownFleets],
  )

  // Live clock (for ETA countdowns) anchored to the fleet read; scale 1 today.
  const worldTime = useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)
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

  const handleRecenter = () => controllerRef.current?.recenter()

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
      <GalaxyGraph
        galaxy={galaxy}
        selectedId={selectedId}
        onSelect={(node) => setSelectedId(node?.id ?? null)}
        onReady={(controller) => {
          controllerRef.current = controller
        }}
      />

      {/* Overlay layer — panels catch pointer events, the gap between lets the
          graph receive orbit/pan/zoom/clicks. */}
      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        <IntelPanel
          galaxy={galaxy}
          isStartArea={isStartArea}
          regionCounts={regionCounts}
          onRecenter={handleRecenter}
        />
        <Inspector
          node={selected}
          connections={selected ? (laneCountById.get(selected.id) ?? 0) : 0}
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
      </div>

      {/* In-transit trips — a floating banner per travelling fleet, with its route
          and a live ETA (#0008). */}
      {transitFleets.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
          {transitFleets.map((f) => (
            <TransitBanner key={f.id} fleet={f} worldTime={worldTime} nameById={nameById} />
          ))}
        </div>
      )}

      {/* Floating account affordance — the sidebar's job (email + sign out),
          without the sidebar, so the authed home stays full-bleed. */}
      <AccountChip />
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

// TransitBanner shows a travelling fleet's route + live ETA (or a held state).
function TransitBanner({
  fleet,
  worldTime,
  nameById,
}: {
  fleet: Fleet
  worldTime: number
  nameById: Map<string, string>
}) {
  const name = (id: string) => nameById.get(id) ?? id
  if (fleet.state.mode === 'laneHold' && fleet.state.laneHold) {
    const h = fleet.state.laneHold
    return (
      <div
        data-testid="transit-banner"
        className={`${PANEL} flex items-center gap-3 !py-2 text-sm text-white`}
      >
        <span className="animate-pulse text-amber-400">◈</span>
        Holding mid-lane · {name(h.from)} → {name(h.to)}
      </div>
    )
  }
  const lt = fleet.state.laneTransit
  if (!lt) return null
  const dest = lt.route[lt.route.length - 1]
  const remaining = formatEta(lt.arriveTime - worldTime)
  return (
    <div
      data-testid="transit-banner"
      className={`${PANEL} flex items-center gap-3 !py-2 text-sm text-white`}
    >
      <span className="animate-pulse text-sky-400">➤</span>
      <span>
        In transit → <Strong className="!text-white">{name(dest)}</Strong>
      </span>
      <span className="font-mono text-xs text-zinc-400">arrives {remaining}</span>
    </div>
  )
}

// ---- Floating account chip (authed only) ----

function AccountChip() {
  const { user, account, signOut } = useAccountContext()
  if (!user) return null
  return (
    <div className={`${PANEL} absolute bottom-4 left-4 flex items-center gap-3 !py-2`}>
      <span className="max-w-[12rem] truncate text-xs text-zinc-300">
        {account?.email ?? user.email}
      </span>
      <Button
        plain
        onClick={() => signOut()}
        data-testid="sign-out-button"
        className="!text-xs !text-white"
      >
        Sign out
      </Button>
    </div>
  )
}

// ---- Left intel panel ----

function IntelPanel({
  galaxy,
  isStartArea,
  regionCounts,
  onRecenter,
}: {
  galaxy: Galaxy
  isStartArea: boolean
  regionCounts: Map<Region, number>
  onRecenter: () => void
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
}: {
  node: GalaxyNode | null
  connections: number
  travel: TravelInfo | null
}) {
  if (!node) {
    return (
      <aside
        data-testid="inspector"
        className={`${PANEL} flex w-72 max-w-[80vw] flex-col self-start`}
      >
        <p className="text-sm text-zinc-400">
          Select a system to inspect its star, bodies, and lanes.
        </p>
      </aside>
    )
  }

  return (
    <aside data-testid="inspector" className={`${PANEL} flex w-72 max-w-[80vw] flex-col gap-3 self-start`}>
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

      {node.tier === 'starVisible' && (
        <p className="text-xs text-zinc-500 italic">Uncharted — survey or travel to chart subspace routes and reveal its worth.</p>
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
            {committing ? 'Departing…' : `Travel here · ${formatEta(route.data.totalEta - worldTime)}`}
          </Button>
        </>
      )}
    </div>
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
