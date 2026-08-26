'use client'

// SystemBoardView — the container the /systems/[systemId] route renders (#0007).
// It fans in the two fogged reads (the interior + the requester's fleets), runs
// the shared world clock (useWorldTime), and owns the select → preview → commit
// gesture for the slice verbs (move + scan). The heavy lifting lives in leaves:
// BoardStage draws (BoardCanvas's WebGL world + BoardOverlay's hit layer),
// FactsPanel commands, glyph-geometry/move-preview do the math. The three
// #0005 refetch rules ride useBoardRealtime.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { toast } from '@/lib/toast'
import { useSystemBoard } from '@/hooks/use-system-board'
import { useFleetsInSystem, useFleetOrders, useMine, useScan, useRoutePreview, useFleetTravel } from '@/hooks/use-fleets'
import { useMarketBoard, useSell, useStation } from '@/hooks/use-market'
import { useCorporationOptional } from '@/components/corporation-provider'
import { newOperationKey } from '@/lib/services/market-service'
import { isPriceChanged, saleErrorCopy } from '@/lib/market-copy'
import { MarketBoardPanel } from '@/components/market/MarketBoardPanel'
import { useCancelAction, useRunningMine, useRunningScan } from '@/hooks/use-actions'
import type { ResourceKind } from '@/lib/types/system-board'
import { useWorldTime } from '@/hooks/use-world-time'
import { useBoardRealtime } from '@/hooks/use-board-realtime'
import type { Hex, Target } from '@/lib/hex'
import type { Fleet } from '@/lib/types/fleet'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import { BoardStage } from './BoardStage'
import { hexToRgb } from './board-pack'
import { BoardTuning, type BoardLook } from './BoardTuning'
import type { ScanFxInput } from './BoardOverlay'
import { FactsPanel, type BoardSelection } from './FactsPanel'
import {
  featureLogicalHex,
  fleetDockedParentId,
  fleetLogicalHex,
  fleetOnBoard,
} from './glyph-geometry'
import { planToBody, planToHex, type MovePlan } from './move-preview'
import { planSweep, type ScanPlan } from './scan-preview'

const STAGE = 'relative h-dvh w-full overflow-hidden bg-[#05070d]'

// The persisted playtest FX preference: which effect a running scan renders.
// 'ping' is the slice mechanic's honest picture (radial echo); 'arc' is the
// rotating-beam look kept alive as a future variant (ArcScan).
const SCAN_FX_KEY = 'hexaverse.scanFx'
type ScanFx = 'ping' | 'arc'
const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export interface SystemBoardViewProps {
  systemId: string
}

export function SystemBoardView({ systemId }: SystemBoardViewProps) {
  const { data: board, isLoading, isError, error } = useSystemBoard(systemId)
  const { data: fleets } = useFleetsInSystem(systemId)
  const worldTime = useWorldTime(board?.worldTime)
  const router = useRouter()
  // The admin custom claim (set via scripts/dev/admin/set-admin-claims.js;
  // requires a fresh sign-in to appear in the token) — unlocks the tuning
  // panel in ANY environment. Dev builds get it unconditionally.
  const { isAdmin } = useAccountContext()

  const [selection, setSelection] = useState<BoardSelection>(null)
  const [activeFleetId, setActiveFleetId] = useState<string | null>(null)
  // The renderer's availability (BoardCanvas's guard) and first-frame signal —
  // together they decide how long the loading placeholder persists (the
  // MODIFIED `System Board Route and Data Fan-In`): loading holds until the
  // canvas has produced a frame, but an unsupported/interrupted state takes
  // precedence and replaces it.
  const [boardAvailable, setBoardAvailable] = useState(true)
  const [firstFrame, setFirstFrame] = useState(false)
  // True while the player hovers/focuses the Scan verb — the only moment the
  // aim corridor draws (selecting things to plan a burn stays quiet).
  const [scanPreview, setScanPreview] = useState(false)
  // The scan-FX toggle, read from storage after mount (not in the initializer,
  // so server and first client render agree) and persisted on change.
  const [scanFx, setScanFx] = useState<ScanFx>('ping')
  useEffect(() => {
    const stored = window.localStorage.getItem(SCAN_FX_KEY)
    if (stored === 'arc' || stored === 'ping') setScanFx(stored)
  }, [])
  const toggleScanFx = () =>
    setScanFx((fx) => {
      const next: ScanFx = fx === 'ping' ? 'arc' : 'ping'
      window.localStorage.setItem(SCAN_FX_KEY, next)
      return next
    })

  // The dev tuning panel's look override (null = the tuned constants). The
  // panel itself mounts only in development builds; in production this stays
  // null and BoardStage receives no override props at all.
  const [look, setLook] = useState<BoardLook | null>(null)
  const lookProps = useMemo(
    () =>
      look
        ? {
            settings: {
              bloom: look.bloom,
              instrument: look.instrument,
              starfield: look.starfield,
              starScale: look.starScale,
              // The panel stores an sRGB hex; the GL contract speaks linear
              // triples — hexToRgb is the same linearisation every packed
              // colour goes through.
              starTint: look.starTint ? hexToRgb(look.starTint) : null,
              bodyScale: look.bodyScale,
            },
            tiltDeg: look.tiltDeg,
          }
        : {},
    [look],
  )

  const { order, cancel } = useFleetOrders(systemId)
  const scan = useScan(systemId)
  const mine = useMine(systemId)

  // The market (#0011). The station read is gated server-side by graph tier, so
  // a system whose station the requester cannot see simply resolves to nothing.
  const stationQuery = useStation(systemId)
  const station = stationQuery.data ?? null
  const boardQuery = useMarketBoard(!!station)
  const sell = useSell(systemId)
  // Optional: the balance is supplementary here, and the board must not go
  // blank because the readout could not find its provider.
  const corporation = useCorporationOptional()
  // Sale feedback the panel announces: the last settled proceeds, the last
  // failure's player-facing copy, and the price a re-priced offer moved FROM.
  const [lastSaleProceeds, setLastSaleProceeds] = useState<number | null>(null)
  const [saleFailure, setSaleFailure] = useState<string | null>(null)
  const [sellRepricedFrom, setSellRepricedFrom] = useState<number | null>(null)
  const cancelAction = useCancelAction(systemId)
  const travel = useFleetTravel()
  const pending =
    order.isPending ||
    cancel.isPending ||
    scan.isPending ||
    mine.isPending ||
    cancelAction.isPending ||
    travel.isPending ||
    // The sell control's double-submit guard: disabled from commit until the
    // sale settles or fails, so a double-click cannot become two sales.
    sell.isPending

  const allFleets = useMemo(() => fleets ?? [], [fleets])
  const ownFleets = useMemo(() => allFleets.filter((f) => f.own), [allFleets])
  const activeFleet = useMemo<Fleet | null>(
    () => ownFleets.find((f) => f.id === activeFleetId) ?? ownFleets[0] ?? null,
    [ownFleets, activeFleetId],
  )

  // A selected rim gate previews the charted route from the acting fleet to that
  // neighbour (#0008) — disabled until both a fleet and a gate are in hand; a
  // no-charted-route destination surfaces as the query's 422 error.
  const selectedGateDest = selection?.kind === 'gate' ? selection.gate.destSystemId : null
  const routeQuery = useRoutePreview(activeFleet?.id ?? null, selectedGateDest)

  // The acting fleet's live hex — the origin of every previewed order. The
  // docked parent comes off the EFFECTIVE state (a finished dock-on-arrive burn
  // rides its body from the arrival instant, not from the next refetch).
  const fromHex = useMemo<Hex | null>(() => {
    if (!activeFleet || !board) return null
    const parentId = fleetDockedParentId(activeFleet, worldTime)
    const parent = parentId ? board.features.find((f) => f.id === parentId) : undefined
    const parentHex = parent ? featureLogicalHex(parent, worldTime) : undefined
    return fleetLogicalHex(activeFleet, worldTime, parentHex)
  }, [activeFleet, board, worldTime])

  // The feature the acting fleet is docked to, if any — the mine offer's
  // anchor (add-mine-ui "Mine Offer on the Docked Fleet"): the verb needs no
  // selection, just the docked state and the body's visible resources.
  const dockedFeature = useMemo(() => {
    if (!activeFleet || !board) return null
    const parentId = fleetDockedParentId(activeFleet, worldTime)
    return parentId ? (board.features.find((f) => f.id === parentId) ?? null) : null
  }, [activeFleet, board, worldTime])

  // Docked at THIS system's station — the sell offer's anchor, the same
  // docked-state test the mine offer uses. A station is dockable but never
  // mineable, so the two offers are mutually exclusive by construction.
  const dockedAtStation = !!station && !!activeFleet &&
    fleetDockedParentId(activeFleet, worldTime) === station.featureId

  // This station's live quotes, pulled out of the aggregate board read rather
  // than fetched separately — the board already carries every visible venue.
  const stationQuotes = useMemo(() => {
    if (!station) return null
    const venue = boardQuery.data?.venues.find((v) => v.systemId === station.systemId)
    return venue?.quotes ?? null
  }, [station, boardQuery.data])

  // The sweep preview: what a scan from HERE would leave in shadow (#0006
  // Decision #21 — the sweep is 360°, so the shadow is the signal). Only
  // computed while the Scan verb is being considered (hover/focus).
  const sweepPreview = useMemo<ScanPlan | null>(() => {
    if (!scanPreview || !board || !fromHex) return null
    return planSweep(fromHex, board.features, board.radius, worldTime)
  }, [scanPreview, board, fromHex, worldTime])

  // The RUNNING scan's committed sweep: the origin is the EMISSION HEX pinned
  // in the action's params at commit (#0006 Decision #26 — the pulse stays
  // where it was fired; the durable sweep mints from the same hex), occluders
  // evaluated at the frozen eta — exactly what resolution will cover — drawn
  // until the eta passes and the reveal lands via the board refetch. A scan
  // committed before the origin was pinned falls back to the fleet at eta.
  const runningScan = useRunningScan(activeFleet?.id ?? null).data ?? null
  // The RUNNING mine (#0010, add-mine-ui): the movement channel's busy signal.
  // Its eta gates move/mine in the panel and joins the refetch candidates so
  // the resolved cargo + freed slot land without user action.
  const runningMine = useRunningMine(activeFleet?.id ?? null).data ?? null
  const activeSweep = useMemo<ScanPlan | null>(() => {
    if (!board || !activeFleet || !runningScan) return null
    if (runningScan.status !== 'running' || worldTime >= runningScan.eta) return null
    const eta = runningScan.eta
    let origin = runningScan.params?.origin ?? null
    if (!origin) {
      const parentId = fleetDockedParentId(activeFleet, eta)
      const parent = parentId ? board.features.find((f) => f.id === parentId) : undefined
      const parentHex = parent ? featureLogicalHex(parent, eta) : undefined
      origin = fleetLogicalHex(activeFleet, eta, parentHex)
    }
    if (!origin) return null
    return planSweep(origin, board.features, board.radius, eta)
  }, [board, activeFleet, runningScan, worldTime])

  // The live preview plan for the current selection — recomputed each frame so a
  // led intercept tracks the moving target. The star at the core (0,0) is a body,
  // not a destination (you can't fly onto it or dock it), so it yields no plan.
  const plan = useMemo<MovePlan | null>(() => {
    if (!fromHex || !selection) return null
    if (selection.kind === 'feature') {
      const f = selection.feature
      if (f.fixed || isCore(featureLogicalHex(f, worldTime))) return null
      if (f.orbit) return planToBody(fromHex, f.orbit, worldTime)
      return planToHex(fromHex, featureLogicalHex(f, worldTime), worldTime)
    }
    if (selection.kind === 'hex') return isCore(selection.hex) ? null : planToHex(fromHex, selection.hex, worldTime)
    // A gate previews the in-system burn to its gate tile (leg 0 of the trip); the
    // lanes past it are shown as ETAs in the facts panel, not on the board.
    if (selection.kind === 'gate') return planToHex(fromHex, selection.gate.hex, worldTime)
    return null
  }, [fromHex, selection, worldTime])

  // Own fleets' arrival ETAs feed the self-scheduled refetch (rule 1) — a burn's
  // arrival, a trip's gate ETA (the moment the fleet leaves this board), and a
  // running scan's eta (the refetched board read runs the #0005 fold, so this is
  // what makes the reveal land the moment the sweep finishes).
  const etaCandidates = useMemo(
    () => [
      ...ownFleets.flatMap((f) => {
        if (f.state.mode === 'burn' && f.state.burn) return [f.state.burn.arriveTime]
        const gateEta = f.state.mode === 'laneTransit' ? f.state.laneTransit?.boardLeg?.gateEta : undefined
        return gateEta === undefined ? [] : [gateEta]
      }),
      ...(runningScan?.status === 'running' ? [runningScan.eta] : []),
      ...(runningMine?.status === 'running' ? [runningMine.eta] : []),
    ],
    [ownFleets, runningScan, runningMine],
  )
  useBoardRealtime({ systemId, worldTime, etaCandidates, scanning: !!activeSweep, enabled: !!board })

  // Departure hand-off (#0008): a fleet that transits its gate is out on a lane —
  // it has no hex on this board any more, and the crawl it's now doing is the
  // galaxy view's picture. Follow it there, but only for a departure we actually
  // watched happen (a ref, so revisiting the board mid-trip doesn't bounce you).
  const watchedDeparture = useRef(false)
  useEffect(() => {
    const inTransit = ownFleets.filter((f) => f.state.mode === 'laneTransit')
    if (inTransit.length === 0) return
    if (inTransit.some((f) => fleetOnBoard(f, worldTime))) {
      watchedDeparture.current = true
      return
    }
    if (watchedDeparture.current) {
      watchedDeparture.current = false
      router.push('/')
    }
  }, [ownFleets, worldTime, router])

  if (isLoading) {
    return (
      <div data-testid="system-board-view" className={STAGE}>
        <div className="absolute inset-0 grid place-items-center text-sm text-white/50">
          Charting the system…
        </div>
      </div>
    )
  }

  if (isError || !board) {
    return (
      <div data-testid="system-board-view" className={`${STAGE} grid place-items-center px-6`}>
        <div className={PANEL}>
          <Subheading className="!text-white">Couldn’t load the system</Subheading>
          <Text className="mt-1 !text-zinc-400">
            {error?.message ?? 'The interior read failed. Try again shortly.'}
          </Text>
        </div>
      </div>
    )
  }

  // --- selection (toggle-to-deselect) ---------------------------------------
  const selectFeature = (id: string) => {
    const feature = board.features.find((f) => f.id === id)
    if (!feature) return
    setSelection((prev) =>
      prev?.kind === 'feature' && prev.feature.id === id ? null : { kind: 'feature', feature },
    )
  }
  const selectFleet = (id: string) => {
    const f = allFleets.find((fl) => fl.id === id)
    if (!f) return
    if (f.own) setActiveFleetId(id)
    setSelection((prev) => (prev?.kind === 'fleet' && prev.fleet.id === id ? null : { kind: 'fleet', fleet: f }))
  }
  const selectHex = (hex: Hex) =>
    setSelection((prev) =>
      prev?.kind === 'hex' && prev.hex.q === hex.q && prev.hex.r === hex.r ? null : { kind: 'hex', hex },
    )
  const selectGate = (destSystemId: string) => {
    const gate = board.laneGates.find((g) => g.destSystemId === destSystemId)
    if (!gate) return
    setSelection((prev) =>
      prev?.kind === 'gate' && prev.gate.destSystemId === destSystemId ? null : { kind: 'gate', gate },
    )
  }

  // A roster row: a fleet on this board becomes the acting one (and gets
  // selected); a fleet in another system opens that board; one out on a lane has
  // no board at all — the galaxy is where it's visible.
  const showFleet = (f: Fleet) => {
    if (f.state.mode === 'laneTransit' || f.state.mode === 'laneHold') {
      if (!fleetOnBoard(f, worldTime)) {
        router.push('/')
        return
      }
    }
    if (f.systemId !== systemId) {
      router.push(`/systems/${f.systemId}`)
      return
    }
    setActiveFleetId(f.id)
    setSelection({ kind: 'fleet', fleet: f })
  }

  // --- verbs -----------------------------------------------------------------
  const commitMove = () => {
    if (!activeFleet || !selection) return
    let target: Target | null = null
    if (selection.kind === 'feature') target = { featureId: selection.feature.id }
    else if (selection.kind === 'hex') target = { hex: selection.hex }
    if (!target) return
    order.mutate(
      { fleetId: activeFleet.id, target },
      {
        onSuccess: () => {
          toast.success('Course laid in')
          setSelection(null)
        },
        onError: (e) => toast.error(e.message || 'Order failed'),
      },
    )
  }
  // The scan is a 360° sweep (#0006 Decision #21): one manual trigger, no aim.
  const commitScan = () => {
    if (!activeFleet) return
    scan.mutate(activeFleet.id, {
      onSuccess: () => toast.success('Scanning…'),
      onError: (e) => toast.error(e.message || 'Scan failed'),
    })
  }
  const commitCancel = () => {
    if (!activeFleet) return
    cancel.mutate(activeFleet.id, {
      onSuccess: () => toast.success('Burn cancelled'),
      onError: (e) => toast.error(e.message || 'Cancel failed'),
    })
  }
  // Mine (#0010, add-mine-ui): the panel picked kind + tons; the featureId is
  // the fleet's dock parent — no selection involved. The countdown + refetch
  // arming ride the invalidated inbox.
  const commitMine = (kind: ResourceKind, tons: number) => {
    if (!activeFleet || !dockedFeature) return
    mine.mutate(
      { fleetId: activeFleet.id, request: { featureId: dockedFeature.id, kind, tons } },
      {
        onSuccess: () => toast.success('Extractors running'),
        onError: (e) => toast.error(e.message || 'Mine failed'),
      },
    )
  }
  // Sell (#0011): the panel picked kind + tons and quoted a first-ton price; the
  // featureId is the fleet's dock parent, exactly as mine's is.
  //
  // ONE operation key per user-initiated attempt — the key is the entire guard
  // against a lost response becoming a double sale, since a sale claims no
  // action slot and so inherits none of the spine's retry safety. A re-priced
  // re-commit mints a fresh key; reusing the old one would be answered as a
  // replay of the previous sale.
  const commitSell = (kind: ResourceKind, tons: number, expectedUnitPrice: number) => {
    if (!activeFleet || !station) return
    setSaleFailure(null)
    sell.mutate(
      {
        fleetId: activeFleet.id,
        request: {
          featureId: station.featureId,
          kind,
          tons,
          operationKey: newOperationKey(),
          expectedUnitPrice,
        },
      },
      {
        onSuccess: (res) => {
          setLastSaleProceeds(res.totalProceeds)
          setSellRepricedFrom(null)
          toast.success(`Sold for ${res.totalProceeds} cr`)
        },
        onError: (e) => {
          const copy = saleErrorCopy(e.message)
          setSaleFailure(copy)
          // A price-changed rejection after a multi-minute haul must not leave a
          // stale, un-committable offer on screen: re-price it and say what
          // moved. The invalidated board read supplies the new price.
          if (isPriceChanged(e.message)) {
            setSellRepricedFrom(expectedUnitPrice)
            void stationQuery.refetch()
          }
          toast.error(copy)
        },
      },
    )
  }
  const commitCancelMine = () => {
    if (!activeFleet || !runningMine) return
    cancelAction.mutate(
      { actionId: runningMine.id, fleetId: activeFleet.id },
      {
        onSuccess: () => toast.success('Mining cancelled'),
        onError: (e) => toast.error(e.message || 'Cancel failed'),
      },
    )
  }
  const commitDepart = () => {
    if (!activeFleet || selection?.kind !== 'gate') return
    travel.mutate(
      { fleetId: activeFleet.id, systemId: selection.gate.destSystemId },
      {
        onSuccess: () => {
          toast.success('Fleet departing')
          setSelection(null)
          // Arm the hand-off here too: a fleet already sitting on the gate has a
          // zero-length board leg, so it's off-board before any frame renders it.
          watchedDeparture.current = true
        },
        onError: (e) => toast.error(e.message || 'Departure failed'),
      },
    )
  }

  const selectedId =
    selection?.kind === 'feature'
      ? selection.feature.id
      : selection?.kind === 'fleet'
        ? selection.fleet.id
        : null
  const selectedGateId = selection?.kind === 'gate' ? selection.gate.destSystemId : null

  // The running scan's effect, pinned at the emission hex (#0006 Decision #26
  // — the pulse stays where it was fired; the ship moves on). The FX toggle
  // (playtest) swaps in the arc-scan look. Prop-driven onto the overlay.
  const scanFxInput: ScanFxInput | null =
    activeSweep && runningScan && activeFleet
      ? {
          originHex: activeSweep.origin,
          features: board.features,
          rimRing: board.radius,
          committedAt: runningScan.committedAt,
          eta: runningScan.eta,
          fx: scanFx,
        }
      : null

  return (
    <div data-testid="system-board-view" className={STAGE}>
      <BoardStage
        board={board}
        fleets={allFleets}
        worldTime={worldTime}
        selectedId={selectedId}
        selectedGateId={selectedGateId}
        selectedHex={selection?.kind === 'hex' ? selection.hex : null}
        onSelectFeature={selectFeature}
        onSelectFleet={selectFleet}
        onSelectGate={selectGate}
        onSelectHex={selectHex}
        onSelectEmpty={() => setSelection(null)}
        plan={selection?.kind === 'fleet' ? null : plan}
        activeSweep={activeSweep}
        sweepPreview={sweepPreview}
        scanFx={scanFxInput}
        onAvailabilityChange={setBoardAvailable}
        onFirstFrame={() => setFirstFrame(true)}
        {...lookProps}
      />

      {/* Loading persists through the first rendered frame (task 6.1a) — but
          never over an unsupported/interrupted notice, which takes precedence
          (the placeholder MUST NOT persist when no frame can ever come). */}
      {!firstFrame && boardAvailable && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#05070d] text-sm text-white/50">
          Charting the system…
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        {/* The roster is the same panel the galaxy shows — where every fleet is,
            whichever canvas you're standing on. A fleet on this board becomes the
            one you're commanding; one elsewhere drills into its system. */}
        {/* Left column, mirroring GalaxyView's overlay: panels stack at the
            edge so the board's centre stays clickable — a loose third flex
            child under justify-between would float over the middle of an
            unpannable board and swallow glyph clicks (pointer-events-auto). */}
        <div className="flex flex-col gap-4 self-start">
          <FleetRoster
            worldTime={worldTime}
            activeFleetId={activeFleet?.id ?? null}
            currentSystemId={systemId}
            onSelect={showFleet}
          />
          {/* The market board's second mount point (the first is the galaxy view).
              The SAME shared panel: it ranks and presents, and this view decides
              what a row selection means — here, drilling into that system's board.
              Shown only where there is a station to trade at. */}
          {station && (
            <div className={PANEL}>
              <MarketBoardPanel
                board={boardQuery.data}
                isLoading={boardQuery.isLoading}
                isError={boardQuery.isError}
                homeSystemId={systemId}
                onSelectSystem={(id) => router.push(`/systems/${encodeURIComponent(id)}`)}
              />
            </div>
          )}
        </div>
        <FactsPanel
          starClass={board.starClass}
          character={board.character}
          radius={board.radius}
          featureCount={board.features.length}
          selection={selection}
          activeFleet={activeFleet}
          dockedFeature={dockedFeature}
          plan={plan}
          worldTime={worldTime}
          pending={pending}
          scanEta={runningScan?.status === 'running' ? runningScan.eta : null}
          mineEta={runningMine?.status === 'running' ? runningMine.eta : null}
          route={
            selection?.kind === 'gate'
              ? { isLoading: routeQuery.isLoading, isError: routeQuery.isError, data: routeQuery.data }
              : null
          }
          onMove={commitMove}
          onScan={commitScan}
          onMine={commitMine}
          onCancelMine={commitCancelMine}
          stationQuotes={dockedAtStation ? stationQuotes : null}
          onSell={commitSell}
          sellRepricedFrom={sellRepricedFrom}
          credits={corporation?.credits ?? null}
          lastSaleProceeds={lastSaleProceeds}
          saleFailure={saleFailure}
          onScanPreview={setScanPreview}
          scanFx={scanFx}
          onToggleScanFx={toggleScanFx}
          available={boardAvailable}
          onCancel={commitCancel}
          onDepart={commitDepart}
        />
      </div>

      {/* Look tuning (the bench's knobs on live content) — always on in dev
          builds, admin-claim-gated everywhere else. The claim is a Firebase
          custom claim; the gate is cosmetic-only (no privileged reads ride
          it), so client-side gating is enough. */}
      {(isAdmin || process.env.NODE_ENV === 'development') && (
        <div className="pointer-events-none absolute bottom-4 right-4">
          <BoardTuning onChange={setLook} />
        </div>
      )}
    </div>
  )
}

// isCore reports whether a hex is the star's core cell (0,0) — never a valid
// move destination.
function isCore(h: Hex): boolean {
  return h.q === 0 && h.r === 0
}

export default SystemBoardView
