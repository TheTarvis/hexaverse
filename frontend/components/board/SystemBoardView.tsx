'use client'

// SystemBoardView — the container the /systems/[systemId] route renders
// (migrate-fleet-to-continuous-burns, design.md Decision 12). It fans in the
// unfogged interior read (system-interior "Interior Read Endpoint Serves
// Unfogged Features", 7.7/7.9), runs the shared world clock (useWorldTime),
// and owns single-selection picking (board-selection.ts) for the mine/sell
// offers and the informational body/cell/gate facts panel. The board draws
// no fleet layer and fetches no fleet data itself (board-view MODIFIED
// "System Board Route and Data Fan-In") — the roster panel (mounted here,
// same as the galaxy view) owns its own `useMyFleets` read, and this
// container reuses that SAME shared query-cache read (never a new,
// system-scoped fleet fetch) only to find the acting fleet and its docked
// body for the mine/sell offers.
//
// Movement (burn/cut-drive/stop/jump) is commanded from the roster panel,
// composed here from the current board selection (a burn's body-id target)
// — design.md Decision 12: "Targets are named by body id from the interior
// read, not by picking a tile." The heavy lifting lives in leaves: BoardStage
// draws (BoardCanvas's WebGL world + BoardOverlay's hit layer), FactsPanel
// shows the fleet/selection facts and commands mine/sell.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { toast } from '@/lib/toast'
import { useSystemBoard } from '@/hooks/use-system-board'
import { useCutDrive, useJump, useMine, useMyFleets, useOrder, useStop } from '@/hooks/use-fleets'
import { useMarketBoard, useSell, useStation } from '@/hooks/use-market'
import { useCorporationOptional } from '@/components/corporation-provider'
import { newOperationKey } from '@/lib/services/market-service'
import { isPriceChanged, saleErrorCopy } from '@/lib/market-copy'
import { MarketBoardPanel } from '@/components/market/MarketBoardPanel'
import { useRunningMine } from '@/hooks/use-actions'
import type { ResourceKind } from '@/lib/types/system-board'
import { useWorldTime } from '@/hooks/use-world-time'
import { useBoardRealtime } from '@/hooks/use-board-realtime'
import type { Fleet } from '@/lib/types/fleet'
import { FleetRoster } from '@/components/fleet/FleetRoster'
import { BoardStage } from './BoardStage'
import { hexToRgb } from './board-pack'
import { BoardTuning, type BoardLook } from './BoardTuning'
import { FactsPanel } from './FactsPanel'
import { toggleSelection, type BoardSelection } from './board-selection'

const STAGE = 'relative h-dvh w-full overflow-hidden bg-[#05070d]'

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export interface SystemBoardViewProps {
  systemId: string
}

export function SystemBoardView({ systemId }: SystemBoardViewProps) {
  const { data: board, isLoading, isError, error } = useSystemBoard(systemId)
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

  // The dev tuning panel's look override (null = the tuned constants).
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
              starTint: look.starTint ? hexToRgb(look.starTint) : null,
              bodyScale: look.bodyScale,
            },
            tiltDeg: look.tiltDeg,
          }
        : {},
    [look],
  )

  // The requester's own fleets — the SAME shared read the roster panel uses
  // (design.md Decision 12: "the board fetches no fleet data"). Filtered to
  // this system for the acting fleet / mine / sell surface only.
  const { data: myFleets } = useMyFleets()
  const ownFleetsHere = useMemo(
    () => (myFleets ?? []).filter((f) => f.systemId === systemId),
    [myFleets, systemId],
  )
  const activeFleet = useMemo<Fleet | null>(
    () => ownFleetsHere.find((f) => f.id === activeFleetId) ?? ownFleetsHere[0] ?? null,
    [ownFleetsHere, activeFleetId],
  )

  // Departure hand-off (board-view "Departure Hand-Off to the Galaxy View",
  // untouched by this change — still in force). `ownFleetsHere` is this
  // board's live "who's present here" read; a fleet id that was in that set
  // on a prior render and has since fallen out of it transited its
  // departure gate while this board was watching it (its systemId flips
  // only at the jump resolver — design.md Decision 10), so we follow it to
  // the galaxy view. A fleet that was ALREADY elsewhere when this board was
  // opened was never in the watched set to begin with, so opening a board
  // like that is correctly a no-op here.
  const watchedFleetIdsRef = useRef<Set<string>>(new Set())
  const watchedSystemIdRef = useRef(systemId)
  useEffect(() => {
    if (watchedSystemIdRef.current !== systemId) {
      watchedSystemIdRef.current = systemId
      watchedFleetIdsRef.current = new Set()
    }
    const currentIds = new Set(ownFleetsHere.map((f) => f.id))
    const departed = [...watchedFleetIdsRef.current].some((id) => !currentIds.has(id))
    watchedFleetIdsRef.current = currentIds
    if (departed) {
      router.push('/')
    }
  }, [ownFleetsHere, systemId, router])

  const order = useOrder()
  const cutDrive = useCutDrive()
  const stop = useStop()
  const jump = useJump()
  const mine = useMine(systemId)

  // The market. The station read is gated server-side by graph tier, so a
  // system whose station the requester cannot see simply resolves to nothing.
  const stationQuery = useStation(systemId)
  const station = stationQuery.data ?? null
  const boardQuery = useMarketBoard(!!station)
  const stationQuotes = useMemo(() => {
    if (!station) return null
    const venue = boardQuery.data?.venues.find((v) => v.systemId === station.systemId)
    return venue?.quotes ?? null
  }, [station, boardQuery.data])
  const sell = useSell(systemId)
  const corporation = useCorporationOptional()
  const [lastSaleProceeds, setLastSaleProceeds] = useState<number | null>(null)
  const [saleFailure, setSaleFailure] = useState<string | null>(null)
  const [sellRepricedFrom, setSellRepricedFrom] = useState<number | null>(null)
  // Cancelling a running mine is a roster-panel command (FleetRoster owns its
  // own `useCancelAction` call, per fleet-roster ADDED "The Roster Row Is the
  // Fleet Command Surface" superseding the removed board-side control) — this
  // container's `pending` guard has no cancel mutation of its own to fold in.
  const pending =
    order.isPending ||
    cutDrive.isPending ||
    stop.isPending ||
    jump.isPending ||
    mine.isPending ||
    // The sell control's double-submit guard: disabled from commit until the
    // sale settles or fails, so a double-click cannot become two sales.
    sell.isPending

  // The RUNNING mine (add-mine-ui): the movement channel's busy signal. Its
  // eta gates the roster panel's commands (fleet-roster/board-view) and joins
  // the refetch candidates so the resolved cargo + freed slot land without
  // user action.
  const runningMine = useRunningMine(activeFleet?.id ?? null).data ?? null

  // isGateBody: the fleet-roster jump command's gate — "is the body this
  // fleet is attached to a lane-gate body at all?" (replace-observation-
  // with-sightings tasks.md 4.10; fleet-roster ADDED "The Roster Row Is the
  // Fleet Command Surface, Jump Gated by Attachment Alone"). No charted-lane
  // precondition — charting is map knowledge, never a permission (design.md
  // Decision 2), and the corporation's charted set arrives on a separately
  // cadenced `GET /v1/galaxy` read that would otherwise impose a client-side
  // dwell the no-dwell ruling forbids. `board.laneGates` ships every gate on
  // this system's rim unfiltered by charted knowledge since §1 dropped the
  // charted-lane tier filter server-side; a gate body id follows
  // `system.gateId`'s own "gate-"+destSystemId convention, so it correlates
  // to `attachedTo` by re-deriving that same id from each entry.
  const isGateBody = (bodyId: string) => board?.laneGates.some((g) => `gate-${g.destSystemId}` === bodyId) ?? false

  const etaCandidates = useMemo(
    () => (runningMine?.status === 'running' ? [runningMine.eta] : []),
    [runningMine],
  )
  useBoardRealtime({ systemId, worldTime, etaCandidates, enabled: !!board })

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

  // --- picking (board-view ADDED "Board Picking Resolves to the Feature,
  // Cell, or Lane Gate Under the Pointer"; MODIFIED "Toggle-to-Deselect
  // Single Selection") — BoardOverlay's own glyph clicks already resolve
  // feature/gate-wins (DOM hit-priority + stopPropagation); these two
  // handlers cover the remaining cases board-selection.ts's `resolvePick`
  // documents (a bare-cell pick, and the outside-the-lattice clear), plus
  // the shared toggle rule for every kind.
  const pick = (picked: BoardSelection) => setSelection((prev) => toggleSelection(prev, picked))
  const selectFeature = (id: string) => pick({ kind: 'feature', id })
  const selectGate = (destSystemId: string) => pick({ kind: 'gate', destSystemId })
  const selectCell = (cell: { ring: number; slot: number }) => pick({ kind: 'cell', cell })
  const selectEmpty = () => pick(null)

  // --- roster commands (fleet-roster "The Roster Row Is the Fleet Command
  // Surface") — burn's target is the current board selection, named by body
  // id. A selected lane-gate body commands a burn through this exact same
  // path (board-view "Burn Command Targets a Selected Lane-Gate Body Like
  // Any Other Body" — gates ARE bodies, `docs/plans/continous_space/
  // decisions.md`): its body id is the same "gate-"+destSystemId convention
  // `attachedTo` reports on arrival (and `isGateBody`/`handleJump` above
  // already correlate against). There is no valid point target from a
  // board-cell selection (a hex has no continuous-space coordinate —
  // design.md Decision 12's "visually unplayable" interim), so only an
  // empty or bare-cell selection — with no body id to name — is refused
  // client-side with a toast rather than sent as a malformed request; no
  // distinct refusal copy exists for a gate target.
  const targetBodyId =
    selection?.kind === 'feature'
      ? selection.id
      : selection?.kind === 'gate'
        ? `gate-${selection.destSystemId}`
        : null
  const handleBurn = (fleet: Fleet) => {
    if (!targetBodyId) {
      toast.error('Select a body to target first')
      return
    }
    order.mutate(
      { fleetId: fleet.id, request: { bodyId: targetBodyId } },
      {
        onSuccess: () => toast.success('Course laid in'),
        onError: (e) => toast.error(e.message || 'Order failed'),
      },
    )
  }
  const handleCutDrive = (fleet: Fleet) => {
    cutDrive.mutate(fleet.id, {
      onSuccess: () => toast.success('Drive cut'),
      onError: (e) => toast.error(e.message || 'Cut drive failed'),
    })
  }
  const handleStop = (fleet: Fleet) => {
    stop.mutate(fleet.id, {
      onSuccess: () => toast.success('Stopping'),
      onError: (e) => toast.error(e.message || 'Stop failed'),
    })
  }
  // handleJump — names the laneId straight off the attached gate on the
  // already-open interior read (`board.laneGates`, correlated to
  // `attachedTo` by the same "gate-"+destSystemId convention `isGateBody`
  // uses above). No second read, no charted-lane precondition (board-view
  // "Jump Commit"; design.md Decision 2: charting is map knowledge, never a
  // permission) — the command is never a no-op or a client-side refusal for
  // any gate the interior read served.
  const handleJump = (fleet: Fleet) => {
    const gate = board.laneGates.find((g) => `gate-${g.destSystemId}` === fleet.attachedTo)
    if (!gate?.laneId) {
      toast.error('Not attached to a lane gate')
      return
    }
    jump.mutate(
      { fleetId: fleet.id, laneId: gate.laneId },
      {
        onSuccess: () => toast.success('Jump underway'),
        onError: (e) => toast.error(e.message || 'Jump failed'),
      },
    )
  }

  // --- mine / sell (kept board-view requirements: Mine Offer/ETA/Commit,
  // Fleet Panel Hold Readout, sell) — anchored on `attachedTo`, never a
  // selection.
  const dockedAtStation = !!station && !!activeFleet && activeFleet.attachedTo === station.featureId

  const commitMine = (kind: ResourceKind, tons: number) => {
    if (!activeFleet || !activeFleet.attachedTo) return
    mine.mutate(
      { fleetId: activeFleet.id, request: { featureId: activeFleet.attachedTo, kind, tons } },
      {
        onSuccess: () => toast.success('Extractors running'),
        onError: (e) => toast.error(e.message || 'Mine failed'),
      },
    )
  }
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
          if (isPriceChanged(e.message)) {
            setSellRepricedFrom(expectedUnitPrice)
            void stationQuery.refetch()
          }
          toast.error(copy)
        },
      },
    )
  }

  const selectedId = selection?.kind === 'feature' ? selection.id : null
  const selectedGateId = selection?.kind === 'gate' ? selection.destSystemId : null

  return (
    <div data-testid="system-board-view" className={STAGE}>
      <BoardStage
        systemId={systemId}
        board={board}
        fleets={[]}
        worldTime={worldTime}
        selectedId={selectedId}
        selectedGateId={selectedGateId}
        selectedCell={selection?.kind === 'cell' ? selection.cell : null}
        onSelectFeature={selectFeature}
        onSelectGate={selectGate}
        onSelectCell={selectCell}
        onSelectEmpty={selectEmpty}
        onAvailabilityChange={setBoardAvailable}
        onFirstFrame={() => setFirstFrame(true)}
        {...lookProps}
      />

      {/* Loading persists through the first rendered frame — but never over an
          unsupported/interrupted notice, which takes precedence. */}
      {!firstFrame && boardAvailable && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#05070d] text-sm text-white/50">
          Charting the system…
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        <div className="flex flex-col gap-4 self-start">
          <FleetRoster
            worldTime={worldTime}
            isChartedGate={isGateBody}
            activeFleetId={activeFleet?.id ?? null}
            currentSystemId={systemId}
            onSelect={(f) => {
              // A mid-jump fleet has no cell on ANY board — its systemId
              // hasn't flipped yet (design.md Decision 10: only the jump
              // resolver flips it, on arrival) — so `jump` set means "no
              // board presence" regardless of which systemId it still
              // reads, same rule as galaxy view's presence.ts.
              if (f.jump) {
                router.push('/')
                return
              }
              if (f.systemId !== systemId) {
                router.push(`/systems/${f.systemId}`)
                return
              }
              setActiveFleetId(f.id)
            }}
            onBurn={handleBurn}
            onCutDrive={handleCutDrive}
            onStop={handleStop}
            onJump={handleJump}
          />
          {/* The market board's second mount point (the first is the galaxy view). */}
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
          features={board.features}
          selection={selection}
          activeFleet={activeFleet}
          worldTime={worldTime}
          pending={pending}
          mineEta={runningMine?.status === 'running' ? runningMine.eta : null}
          onMine={commitMine}
          stationQuotes={dockedAtStation ? stationQuotes : null}
          onSell={commitSell}
          sellRepricedFrom={sellRepricedFrom}
          credits={corporation?.credits ?? null}
          lastSaleProceeds={lastSaleProceeds}
          saleFailure={saleFailure}
          available={boardAvailable}
        />
      </div>

      {/* Look tuning (the bench's knobs on live content) — always on in dev
          builds, admin-claim-gated everywhere else. */}
      {(isAdmin || process.env.NODE_ENV === 'development') && (
        <div className="pointer-events-none absolute bottom-4 right-4">
          <BoardTuning onChange={setLook} />
        </div>
      )}
    </div>
  )
}

export default SystemBoardView
