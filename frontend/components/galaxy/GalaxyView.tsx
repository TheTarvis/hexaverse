'use client'

// GalaxyView — the container the home page renders (spec #0002).
//
// Uses the same viewport, heading, vitals and configurable workspace as System.
// Objects supplies the galaxy browser/inspector; Command retains fleet controls;
// This route owns its reads,
// inspection, commands and renderer; changing panel visibility never issues a command.
//
// migrate-fleet-to-continuous-burns (design.md Decision 12): the galaxy view's
// select→preview→commit travel gesture and its transit-fleet card have no
// successor here (galaxy-view REMOVED "Select-Preview-Commit Travel Gesture",
// "Transit Fleet Selection and Card") — a lane crossing is a single-hop
// `jump`, commanded from the roster panel (attached to a charted gate), not
// previewed on this graph. Own-fleet presence/recenter now skip a mid-jump
// fleet (components/galaxy/presence.ts; galaxy-view MODIFIED "Own-Fleet
// Presence and Recenter Target").
//
// The heavy, three-dependent renderer is pulled in via next/dynamic({ssr:false})
// so three.js stays off the SSR/initial-render path entirely.

import { SceneNavigationAction } from '@/components/hud/SceneNavigationAction'
import { useSelectedFleet } from '@/hooks/use-selected-fleet'
import { useSubmitGuard } from '@/hooks/use-submit-guard'
import { FleetLocationPanel } from '@/components/fleet/FleetLocationPanel'
import { VitalsStrip } from '@/components/space/VitalsStrip'
import { rosterRowStatus } from '@/components/fleet/roster-status'
import { useCorporationSessionOptional } from '@/components/corporation-provider'
import { BOARD_POLL_MS } from '@/lib/realtime'

import { HudCardShell } from '@/components/hud/HudCardShell'
import { GameViewShell, GameViewHeading, GameViewScene, GameViewWorkspace, GameViewVitals } from '@/components/hud/GameViewShell'
import { GalaxyObjectBrowser } from './GalaxyObjectBrowser'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HudHeading } from '@/components/hud/HudTypography'
import { HudButton } from '@/components/hud/HudControls'
import { Text } from '@/components/catalyst/text'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCutDrive, useJump, useMyFleets, useStop } from '@/hooks/use-fleets'
import { useMarketBoard } from '@/hooks/use-market'
import type { Quote } from '@/lib/types/market'
import { useCoarseWorldTime, useWorldClock } from '@/lib/client-clock'
import { toast } from '@/lib/toast'
import { burnErrorCopy, commandErrorReason } from '@/lib/rejection-copy'
import { jumpErrorCopy, jumpErrorReason } from '@/lib/jump-copy'
import type { Fleet } from '@/lib/types/fleet'
import type { GalaxyNode, Region } from '@/lib/types/galaxy'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import {
  CanvasRegionBoundary,
  RendererStateNotice,
} from '@/components/render-guard'
import type { RendererSnapshot } from '@/components/render-guard/renderer-owner'
import { REGION_PALETTE, regionColor } from './region-palette'
import { ownFleetPresenceSystemIds, recenterTargetSystemId } from './presence'
import type { GalaxyGraphController } from './GalaxyGraph'

// Client-only: GalaxyGraph statically imports `three` (and the camera rig), so
// importing it lazily keeps that weight off the SSR path (spec Design details →
// Library / Bundle). ssr:false keeps GPU initialization on the client.
const GalaxyGraph = dynamic(() => import('./GalaxyGraph').then((m) => m.GalaxyGraph), {
  ssr: false,
  loading: () => <GraphFallback label="Loading renderer…" />,
})

function GraphFallback({ label }: { label: string }) {
  return (
    <div
      data-testid="graph-loading"
      className="absolute inset-0 grid place-items-center hud-type-body text-white/50"
    >
      {label}
    </div>
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

export function GalaxyView() {
  const { data: galaxy, isLoading, isError, error, isStartArea } = useGalaxy()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [graphReady, setGraphReady] = useState(false)
  const controllerRef = useRef<GalaxyGraphController | null>(null)
  const router = useRouter()

  const [attempt, setAttempt] = useState(0)
  const [rendererState, setRendererState] = useState<RendererSnapshot>({ phase: 'pending', backend: null, retrying: false })
  const [boundaryFailed, setBoundaryFailed] = useState(false)
  const canvasAvailable = rendererState.phase === 'ready' && !boundaryFailed
  const handleRendererState = useCallback((state: RendererSnapshot) => {
    setRendererState(state)
  }, [])
  const handleController = useCallback((controller: GalaxyGraphController | null) => {
    controllerRef.current = controller
  }, [])
  const handleGuardRetry = useCallback(() => {
    if (boundaryFailed) {
      setBoundaryFailed(false)
      setGraphReady(false)
      setRendererState({ phase: 'pending', backend: null, retrying: false })
      setAttempt(value => value + 1)
    } else controllerRef.current?.retry()
  }, [boundaryFailed])
  const handleGraphReady = useCallback((controller: GalaxyGraphController) => {
    controllerRef.current = controller
    setGraphReady(true)
  }, [])
  const reportRenderError = useCallback(() => setBoundaryFailed(true), [])

  // The requester's own fleets — the roster's fleet source AND this view's
  // presence-marker/recenter source (components/galaxy/presence.ts).
  // Disabled on the logged-out start area (no auth token, and nothing to
  // command).
  const { data: myFleets, scale: envelopeScale, worldTime: envelopeWorldTime, isError: fleetsFailed } = useMyFleets({
    enabled: !isStartArea,
    refetchInterval: BOARD_POLL_MS,
  })
  const ownFleets = useMemo(() => myFleets ?? [], [myFleets])
  const { fleet: activeFleet, select: setActiveFleetId } = useSelectedFleet(ownFleets, null, fleetsFailed)
  const activeFleetId = activeFleet?.id ?? null
  const session = useCorporationSessionOptional()
  const systemNames = useMemo(() => Object.fromEntries((galaxy?.nodes ?? []).map(n => [n.id, n.name])), [galaxy])
  // Live clock (for the roster's countdowns) anchored to the fleet read's
  // served scale (openspec change `fix-world-time-render-loop`, task 3.4;
  // `defect-galaxy-view-clock-ignores-served-scale.md`, USER RULING 4). The
  // envelope's `worldTime`/`scale` come first — the SAME response, so the
  // world time and the scale the clock anchors to never disagree
  // (kickoff finding F6) — falling back to a fleet's own served values, and
  // finally the galaxy read's world time (which carries no scale).
  const servedScale = envelopeScale ?? myFleets?.[0]?.scale
  const servedWorldTime = envelopeWorldTime ?? myFleets?.[0]?.worldTime ?? galaxy?.worldTime
  const clock = useWorldClock(servedWorldTime, servedScale)
  const coarseWorldTime = useCoarseWorldTime(clock)
  // The hold (design.md Decision 1, m18; galaxy-view's unserved-scale hold,
  // B5): while no scale has been served, the clock never anchors, and this
  // view renders the raw served world time it already holds directly —
  // never projecting forward at an assumed rate of 1.
  const worldTime = clock.hasReading() ? coarseWorldTime : (servedWorldTime ?? 0)

  // Systems hosting an own, non-jumping fleet → galaxy-tier presence markers;
  // the recenter/wake-focus home target skips a mid-jump fleet the same way
  // (galaxy-view MODIFIED "Own-Fleet Presence and Recenter Target" — a jump
  // is atomic and single-hop, so there is no held-mid-lane state to occupy).
  const fleetSystemIds = useMemo(() => ownFleetPresenceSystemIds(ownFleets), [ownFleets])

  // Leaving local space carries its system in the URL. Otherwise preserve the
  // one-shot wake-up handoff. Read client-only so SSR keeps its neutral selection.
  const [entryFocus, setEntryFocus] = useState<string | null>(null)
  useEffect(() => {
    const systemId = new URLSearchParams(window.location.search).get('system')
    if (systemId) setEntryFocus(systemId)
    try {
      const w = sessionStorage.getItem('wakeFocus')
      if (w) {
        if (!systemId) setEntryFocus(w)
        sessionStorage.removeItem('wakeFocus')
      }
    } catch {
      // sessionStorage may be unavailable (private mode) — non-fatal.
    }
  }, [])
  const homeSystemId = recenterTargetSystemId(ownFleets) ?? entryFocus

  // Per-system lane (connection) counts and region tallies, derived once.
  const { laneCountById } = useMemo(() => {
    const laneCountById = new Map<string, number>()
    if (galaxy) {
      for (const l of galaxy.links) {
        laneCountById.set(l.source, (laneCountById.get(l.source) ?? 0) + 1)
        laneCountById.set(l.target, (laneCountById.get(l.target) ?? 0) + 1)
      }
    }
    return { laneCountById }
  }, [galaxy])

  const selected = useMemo(
    () => (galaxy && selectedId ? (galaxy.nodes.find((n) => n.id === selectedId) ?? null) : null),
    [galaxy, selectedId],
  )

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
    setSelectedId(systemId)
    controllerRef.current?.focusSystem(systemId)
  }, [])

  const handleEnterSystem = useCallback(
    (systemId: string) => router.push(`/systems/${systemId}`),
    [router],
  )

  // Roster row → "show me this fleet": select and glide to its (origin)
  // system — a jump is atomic and single-hop, so a mid-jump fleet has no
  // other point on this graph to show (design.md Decision 10).
  const handleShowFleet = useCallback((fleet: Fleet) => {
    const target = fleet.jump?.destSystemId ?? fleet.systemId
    setSelectedId(target)
    controllerRef.current?.focusSystem(target)
  }, [])

  // Select and focus the entry system once data and the renderer are ready.
  // Only disclosed nodes may become the initial selection; later reads must
  // preserve any selection the player makes after this handoff.
  const entryHandledRef = useRef(false)
  useEffect(() => {
    if (entryHandledRef.current || !graphReady || !entryFocus || !galaxy) return
    if (galaxy.nodes.some((n) => n.id === entryFocus)) {
      setSelectedId(entryFocus)
      controllerRef.current?.focusSystem(entryFocus)
      entryHandledRef.current = true
    }
  }, [graphReady, entryFocus, galaxy])

  // Roster commands that need no in-system selection — cut-drive/stop act on
  // the fleet's current state alone. Burn needs a target named by body id
  // "from the interior read" (design.md Decision 12), which only exists once
  // a system's space view is open; from the galaxy tier there is nothing to
  // target, so it sends the player there instead of guessing. Jump is
  // withheld by `isChartedGate` below.
  const cutDrive = useCutDrive()
  const stop = useStop()
  const handleBurn = useCallback(
    (fleet: Fleet) => {
      setActiveFleetId(fleet.id)
      toast.error('Open the system view to choose a target')
      router.push(`/systems/${fleet.systemId}`)
    },
    [router, setActiveFleetId],
  )
  const handleCutDrive = useCallback(
    (fleet: Fleet) => {
      cutDrive.mutate(fleet.id, {
        onSuccess: () => toast.success('Drive cut'),
        onError: (e) => toast.error(e.message || 'Cut drive failed'),
      })
    },
    [cutDrive],
  )
  const handleStop = useCallback(
    (fleet: Fleet) => {
      stop.mutate(fleet.id, {
        onSuccess: () => toast.success('Stopping'),
        onError: (e) => toast.error(burnErrorCopy(commandErrorReason(e))),
      })
    },
    [stop],
  )
  const jump = useJump()
  const jumpGuard = useSubmitGuard()
  // handleJump — names the laneId straight off the attached gate's OWN fleet
  // DTO field (fleet-movement "Fleet Read Serves the Attached Gate's Lane
  // Id"), never `galaxy.links[]` — that read is charted-filtered
  // (galaxy-generation "Lanes are filtered to the corp's charted set") and
  // is empty for exactly the fresh-spawn/just-attached case this command
  // exists to serve (replace-observation-with-sightings tasks.md 4.13, 4.16;
  // galaxy-view "Jump Commit"). No second read, no charted-lane
  // precondition — the same success toast shape SystemBoardView.tsx's
  // `handleJump` already uses; on failure the toast copy is mapped from the
  // server's rejection reason (board-view "Rejection Reasons Map to
  // Player-Facing Copy, Not Raw Server Text"), never the raw sentinel
  // string.
  const handleJump = useCallback(
    (fleet: Fleet) => {
      if (!fleet.laneId) {
        toast.error('Not attached to a lane gate')
        return
      }
      // Claim synchronously: React Query pending state updates after this task.
      if (!jumpGuard.claim()) return
      jump.mutate(
        { fleetId: fleet.id, laneId: fleet.laneId },
        {
          onSuccess: () => toast.success('Jump underway'),
          onError: (e) => toast.error(jumpErrorCopy(jumpErrorReason(e))),
          onSettled: () => jumpGuard.release(),
        },
      )
    },
    [jump, jumpGuard],
  )
  // isGateBody: "is the body this fleet is attached to a lane-gate body at
  // all?" (replace-observation-with-sightings tasks.md 4.10, 4.13;
  // fleet-roster ADDED "The Roster Row Is the Fleet Command Surface, Jump
  // Gated by Attachment Alone"). No charted-lane precondition — charting is
  // map knowledge, never a permission (design.md Decision 2) — so this
  // consults no `galaxy.links` read (charted-filtered, and empty for
  // exactly the fresh-spawn/just-attached case this predicate exists to
  // serve). A gate body id follows `system.gateId`'s own
  // "gate-"+destSystemId convention; the prefix alone is sufficient to
  // identify one, with no cross-reference against any charted set.
  const isGateBody = (bodyId: string) => bodyId.startsWith('gate-')

  if (isLoading) {
    return (
      <GameViewShell data-testid="galaxy-view" data-guest={isStartArea}>
        <GraphFallback label="Charting the galaxy…" />
      </GameViewShell>
    )
  }

  if (isError || !galaxy) {
    return (
      <GameViewShell
        data-testid="galaxy-view"
        className="grid place-items-center px-6"
      >
        <HudCardShell className="p-4">
          <HudHeading size="compact" level={2}>Couldn’t load the galaxy</HudHeading>
          <Text className="mt-1 !text-zinc-400">
            {error?.message ?? 'The galaxy read failed. Try again shortly.'}
          </Text>
        </HudCardShell>
      </GameViewShell>
    )
  }

  return (
    <GameViewShell data-testid="galaxy-view" data-guest={isStartArea}>
      <GameViewHeading eyebrow="Command network" title={isStartArea ? 'Start Area' : 'Live Galaxy'} detail={isStartArea ? 'Frozen · read-only' : 'Live · your galaxy'} />
      <GameViewScene>
      <CanvasRegionBoundary
        key={attempt}
        onError={reportRenderError}
        fallback={<div className="absolute inset-0 grid place-items-center p-6">
          <RendererStateNotice status="unsupported" cause="creation" surface="galaxy" retrying={false} onRetry={handleGuardRetry} />
        </div>}
      >
        <GalaxyGraph galaxy={galaxy} selectedId={selectedId}
          artStyle="stellar" gridMode="surround"
          onSelect={(node) => setSelectedId(node?.id ?? null)}
          fleetSystemIds={fleetSystemIds} homeSystemId={homeSystemId}
          onReady={handleGraphReady} onController={handleController} onRendererState={handleRendererState}
        />
      </CanvasRegionBoundary>
      {!boundaryFailed && rendererState.phase === 'pending' && <GraphFallback label="Preparing renderer…" />}
      {!boundaryFailed && (rendererState.phase === 'unavailable' || rendererState.phase === 'interrupted') && <div className="absolute inset-0 grid place-items-center p-6">
        <RendererStateNotice
          status={rendererState.phase === 'interrupted' ? 'interrupted' : 'unsupported'}
          cause={rendererState.phase === 'interrupted' ? 'lost' : 'creation'} surface="galaxy"
          retrying={rendererState.retrying} onRetry={handleGuardRetry}
        />
      </div>}

      </GameViewScene>
      <GameViewWorkspace navigationAction={!isStartArea && selected ? <SceneNavigationAction destination="system" systemName={selected.name} onEnter={() => handleEnterSystem(selected.id)} /> : undefined} corporationId={isStartArea ? 'guest' : session.corporation?.id ?? 'unavailable'} panels={[
        { id: 'objects', label: 'Objects', children: <GalaxyObjectBrowser nodes={galaxy.nodes} selectedId={selectedId} onSelect={handleSelectSystemId}>
          <Inspector
            node={selected}
            connections={selected ? (laneCountById.get(selected.id) ?? 0) : 0}
            stationQuotes={selectedStationQuotes}
            available={canvasAvailable}
            hasOwnFleet={ownFleets.length > 0}
          />
        </GalaxyObjectBrowser> },
        { id: 'command', label: 'Command', children: <div className="flex min-w-0 flex-col gap-4" data-testid="galaxy-command-column">
          <FleetRoster
            worldTime={worldTime}
            scale={servedScale}
            commandOwner="roster"
            isChartedGate={isGateBody}
            activeFleetId={activeFleetId}
            onSelect={(f) => {
              setActiveFleetId(f.id)
              handleShowFleet(f)
            }}
            onBurn={handleBurn}
            onCutDrive={handleCutDrive}
            onStop={handleStop}
            onJump={handleJump}
            enabled={!isStartArea}
          />
      {!isStartArea && <GameViewVitals placement="panel" aria-label="Command fleet telemetry" data-testid="galaxy-vitals">
        <VitalsStrip mode="panel" acting={activeFleet} ownedFleets={ownFleets} fleetsFailed={!!fleetsFailed}
          status={!fleetsFailed && activeFleet ? rosterRowStatus(activeFleet, worldTime, id => systemNames[id] ?? id) : null}
          onSelectFleet={f => { setActiveFleetId(f.id); handleShowFleet(f) }} systemNames={systemNames}
          credits={session.isError ? null : session.corporation?.credits ?? null} scale={servedScale}
          worldTime={worldTime} serverWorldTime={servedWorldTime} />
      </GameViewVitals>}
          {activeFleet && <FleetLocationPanel fleet={activeFleet} names={systemNames} worldTime={worldTime} scale={servedScale} failed={fleetsFailed} onFocus={handleSelectSystemId} />}
          {/* This view mounts no command panel of its own, so the roster
              rows ARE the fleet command surface here — declared explicitly
              (fleet-roster: "The Roster Row Is the Fleet Command Surface
              Where the Mounting View Provides None"), and every command a
              row can offer is supplied below. */}

          {isStartArea && <Text>Sign in to command a fleet.</Text>}
        </div> },
      ]} />
      {isStartArea && <GameViewVitals><div data-testid="signin-prompt" className="flex min-h-16 items-center justify-center gap-4 bg-[#08121d] px-4 pb-[env(safe-area-inset-bottom)]"><Text>Explore the frozen start area</Text><HudButton href="/login" variant="primary">Sign in</HudButton></div></GameViewVitals>}

    </GameViewShell>
  )
}

// ---- Right inspector ----

function Inspector({
  node,
  connections,
  available,
  hasOwnFleet,
  stationQuotes = null,
}: {
  node: GalaxyNode | null
  connections: number
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
      <HudCardShell
        data-testid="inspector"
        className="flex flex-col p-4"
      >
        <p className="hud-type-body text-zinc-400">
          {available
            ? 'Select a system to inspect its star, bodies, and lanes.'
            : hasOwnFleet
              ? 'Select an own fleet in the roster to inspect its system.'
              : 'Select an own fleet in the roster, or wait until the graph is available to pick any other system.'}
        </p>
      </HudCardShell>
    )
  }

  return (
    <HudCardShell
      data-testid="inspector"
      className="flex flex-col gap-3 p-4"
    >
      <div>
        <HudHeading size="compact" level={2} data-testid="inspector-name">
          {node.name}
        </HudHeading>
        {node.catalogueRef && <p className="hud-type-caption text-zinc-600 dark:text-zinc-400">{node.catalogueRef}</p>}
        {node.discovery?.firstArrival && <p className="hud-type-caption">First arrival: {node.discovery.firstArrival.corporationId}</p>}
        {node.discovery?.ownerCorpId && <p className="hud-type-caption">Owner: {node.discovery.ownerCorpId}</p>}
        <p
          data-testid="inspector-region"
          className="mt-1 flex items-center gap-2 hud-type-body text-zinc-300"
        >
          <RegionDot region={node.region} />
          {REGION_PALETTE[node.region].label}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 hud-type-body">
        <HudCardShell className="min-w-0 px-3 py-2">
          <dt className="hud-type-label text-zinc-400">Lanes</dt>
          <dd className="hud-type-value text-white">{connections}</dd>
        </HudCardShell>
        <HudCardShell className="min-w-0 px-3 py-2">
          <dt className="hud-type-label text-zinc-400">Star</dt>
          <dd className="hud-type-value text-white">Class {node.skeleton.starClass}</dd>
        </HudCardShell>
      </dl>

      {/* Major-body skeleton — the free astronomical layer, ALWAYS shown
          (spec Decision #7); never gated by `discovered`. */}
      <div>
        <p className="mb-1.5 hud-type-label text-zinc-400">
          Major bodies
        </p>
        {node.skeleton.bodies.length === 0 ? (
          <p className="hud-type-body text-zinc-500">No major bodies.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {node.skeleton.bodies.map((b, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 hud-type-body"
              >
                <span className="capitalize">{b.type.replace('_', ' ')}</span>
                <span className="hud-type-value text-zinc-400">ring {b.ring}</span>
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
          <p className="mb-1.5 hud-type-label text-zinc-400">
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
                  className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 hud-type-body"
                >
                  <span className="flex items-center gap-1.5">
                    {/* Request vs floor carried by a glyph and a word, never by
                        colour alone. */}
                    <span aria-hidden="true" className="hud-type-caption">
                      {top.source === 'request' ? '★' : '·'}
                    </span>
                    <span className="capitalize">{q.kind}</span>
                    <span className="hud-type-label text-zinc-500">
                      {top.source === 'request' ? 'request' : 'floor'}
                    </span>
                  </span>
                  <span className="hud-type-value text-zinc-300 tabular-nums">
                    {top.unitPrice} cr/t
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {node.tier === 'starVisible' && (
        <p className="hud-type-caption text-zinc-500 italic">
          Uncharted — survey or travel to chart subspace routes and reveal its worth.
        </p>
      )}
    </HudCardShell>
  )
}

export default GalaxyView
