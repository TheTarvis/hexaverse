'use client'

// SystemBoardView — the container the /systems/[systemId] route renders (#0007).
// It fans in the two fogged reads (the interior + the requester's fleets), runs
// the shared world clock (useWorldTime), and owns the select → preview → commit
// gesture for the slice verbs (move + scan). The heavy lifting lives in leaves:
// HexBoard/BoardScene draw, FactsPanel commands, glyph-geometry/move-preview do
// the math. The three #0005 refetch rules ride useBoardRealtime.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { toast } from '@/lib/toast'
import { useSystemBoard } from '@/hooks/use-system-board'
import { useFleetsInSystem, useFleetOrders, useScan, useRoutePreview, useFleetTravel } from '@/hooks/use-fleets'
import { useWorldTime } from '@/hooks/use-world-time'
import { useBoardRealtime } from '@/hooks/use-board-realtime'
import type { Hex, Target } from '@/lib/hex'
import type { Fleet } from '@/lib/types/fleet'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import { HexBoard } from './HexBoard'
import { BoardScene } from './BoardScene'
import { SelectionPreview } from './SelectionPreview'
import { FactsPanel, type BoardSelection } from './FactsPanel'
import { featureLogicalHex, fleetDockedParentId, fleetLogicalHex, fleetOnBoard } from './glyph-geometry'
import { planToBody, planToHex, type MovePlan } from './move-preview'

const STAGE = 'relative h-dvh w-full overflow-hidden bg-[#05070d]'
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

  const [selection, setSelection] = useState<BoardSelection>(null)
  const [activeFleetId, setActiveFleetId] = useState<string | null>(null)

  const { order, cancel } = useFleetOrders(systemId)
  const scan = useScan(systemId)
  const travel = useFleetTravel()
  const pending = order.isPending || cancel.isPending || scan.isPending || travel.isPending

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
    // A gate previews the in-system burn to its rim tile (leg 0 of the trip); the
    // lanes past it are shown as ETAs in the facts panel, not on the board.
    if (selection.kind === 'gate') return planToHex(fromHex, selection.gate.hex, worldTime)
    return null
  }, [fromHex, selection, worldTime])

  // Own fleets' arrival ETAs feed the self-scheduled refetch (rule 1) — a burn's
  // arrival, and a trip's gate ETA (the moment the fleet leaves this board).
  const etaCandidates = useMemo(
    () =>
      ownFleets.flatMap((f) => {
        if (f.state.mode === 'burn' && f.state.burn) return [f.state.burn.arriveTime]
        const gateEta = f.state.mode === 'laneTransit' ? f.state.laneTransit?.boardLeg?.gateEta : undefined
        return gateEta === undefined ? [] : [gateEta]
      }),
    [ownFleets],
  )
  useBoardRealtime({ systemId, worldTime, etaCandidates, enabled: !!board })

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

  return (
    <div data-testid="system-board-view" className={STAGE}>
      <HexBoard
        radius={board.radius}
        selectedHex={selection?.kind === 'hex' ? selection.hex : null}
        onSelectHex={selectHex}
        onSelectEmpty={() => setSelection(null)}
      >
        <BoardScene
          worldTime={worldTime}
          features={board.features}
          fleets={allFleets}
          gates={board.laneGates}
          selectedId={selectedId}
          selectedGateId={selectedGateId}
          onSelectFeature={selectFeature}
          onSelectFleet={selectFleet}
          onSelectGate={selectGate}
        />
        <SelectionPreview plan={selection?.kind === 'fleet' ? null : plan} />
      </HexBoard>

      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        {/* The roster is the same panel the galaxy shows — where every fleet is,
            whichever canvas you're standing on. A fleet on this board becomes the
            one you're commanding; one elsewhere drills into its system. */}
        <FleetRoster
          worldTime={worldTime}
          activeFleetId={activeFleet?.id ?? null}
          currentSystemId={systemId}
          onSelect={showFleet}
        />
        <FactsPanel
          starClass={board.starClass}
          character={board.character}
          radius={board.radius}
          featureCount={board.features.length}
          selection={selection}
          activeFleet={activeFleet}
          plan={plan}
          worldTime={worldTime}
          pending={pending}
          route={
            selection?.kind === 'gate'
              ? { isLoading: routeQuery.isLoading, isError: routeQuery.isError, data: routeQuery.data }
              : null
          }
          onMove={commitMove}
          onScan={commitScan}
          onCancel={commitCancel}
          onDepart={commitDepart}
        />
      </div>
    </div>
  )
}

// isCore reports whether a hex is the star's core cell (0,0) — never a valid
// move destination.
function isCore(h: Hex): boolean {
  return h.q === 0 && h.r === 0
}

export default SystemBoardView
