'use client'

// FleetRoster — the fleet command surface (fleet-roster ADDED "One Row Per
// Owned Fleet, Derived From Kinematic State" / "The Roster Row Is the Fleet
// Command Surface"; board-view ADDED "Running Mine Gates the Fleet Panel's
// Commands"; migrate-fleet-to-continuous-burns, tasks.md 8.5, 8.8, 8.9).
//
// Mounted on BOTH canvases (the galaxy and a system board) so the answer
// never depends on which view you're standing in. One row per own fleet:
// where it is, what it's doing, a live countdown on whatever order is
// running, and the commands its kinematic state and attachment make valid —
// burn, cut-drive, stop, jump. The ORDER TARGET (a body id or point) is the
// mounting view's concern (design.md Decision 12: "Targets are named by body
// id from the interior read"); this panel only hands the fleet back on a
// command click.
//
// It owns its reads (useMyFleets for the fleets, useGalaxy for system names)
// so a view mounts it with one line; the world clock comes in as a prop
// because both views already run one and the roster must tick in step with
// the picture.

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import { useMyFleets } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCancelAction } from '@/hooks/use-actions'
import { queryKeys } from '@/lib/query-keys'
import { formatEta } from '@/lib/eta'
import { toast } from '@/lib/toast'
import { rosterRowStatus, type StatusTone } from './roster-status'
import { rosterCommandVisibility, rosterMineGate, type IsChartedGate } from './roster-commands'

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

const TONE_DOT: Record<StatusTone, string> = {
  idle: 'bg-zinc-400',
  moving: 'bg-sky-400',
  drifting: 'bg-violet-300 animate-pulse',
  transit: 'bg-cyan-300 animate-pulse',
}

const CMD_BUTTON =
  'rounded-md border border-zinc-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-300 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-700/60 disabled:hover:text-zinc-300'

export interface FleetRosterProps {
  // The live world clock of the mounting view — the countdown's input.
  worldTime: number
  // True when the given body id is a lane gate whose lane the corporation
  // has charted — the jump command's gate (design.md, the SystemBoard wire
  // shape names no gate body id directly; the mounting view resolves this).
  isChartedGate: IsChartedGate
  // The fleet the view is currently commanding, highlighted in the list.
  activeFleetId?: string | null
  // The system whose board is open, if any — its fleets read as "here".
  currentSystemId?: string | null
  // Clicked a row (not a command button). The view decides what that means.
  onSelect?: (fleet: Fleet) => void
  // Command callbacks — the mounting view composes the order target (body id
  // or point) and the laneId for jump; this panel only hands back the fleet.
  onBurn?: (fleet: Fleet) => void
  onCutDrive?: (fleet: Fleet) => void
  onStop?: (fleet: Fleet) => void
  onJump?: (fleet: Fleet) => void
  // False on the logged-out start area: no token, and no fleets to manage.
  enabled?: boolean
}

export function FleetRoster({
  worldTime,
  isChartedGate,
  activeFleetId,
  currentSystemId,
  onSelect,
  onBurn,
  onCutDrive,
  onStop,
  onJump,
  enabled = true,
}: FleetRosterProps) {
  const { data: fleets } = useMyFleets({ enabled })
  const { data: galaxy } = useGalaxy()
  const [open, setOpen] = useState(true)
  const qc = useQueryClient()
  const cancelAction = useCancelAction(currentSystemId ?? '')

  // Running mines by actor: one cache sweep per tick, no per-row fetching, no
  // new endpoint — the running-actions queries already cached by whoever
  // reads them (the board's useRunningMine). worldTime re-arms the sweep
  // every tick, so a label/gate lifts at eta without waiting for a cache event.
  const minesByActor = useMemo(() => {
    const m = new Map<string, GameAction>()
    for (const [, actions] of qc.getQueriesData<GameAction[]>({ queryKey: queryKeys.actions.all })) {
      for (const a of actions ?? []) {
        if (a.type === 'mine' && a.status === 'running') m.set(a.actor, a)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, worldTime])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of galaxy?.nodes ?? []) m.set(n.id, n.name)
    return m
  }, [galaxy])

  const own = useMemo(() => fleets ?? [], [fleets])
  // Nothing to manage until the player has a hull (pre-spawn, or logged out).
  if (own.length === 0) return null

  const nameOf = (id: string) => nameById.get(id) ?? id

  return (
    <aside data-testid="fleet-roster" className={`${PANEL} flex w-72 max-w-[85vw] flex-col self-start`}>
      <button
        type="button"
        data-testid="fleet-roster-toggle"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-white">
          Fleets <span className="text-zinc-400">· {own.length}</span>
        </span>
        <span className="font-mono text-xs text-zinc-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className="max-h-80 overflow-y-auto border-t border-zinc-200 dark:border-zinc-800/50">
          {own.map((f) => {
            const runningMine = minesByActor.get(f.id) ?? null
            const status = rosterRowStatus(f, worldTime, nameOf, runningMine)
            const visibility = rosterCommandVisibility(f, worldTime, isChartedGate)
            const mineGate = rosterMineGate(worldTime, runningMine)
            const active = f.id === activeFleetId
            const here = !!currentSystemId && f.systemId === currentSystemId

            return (
              <li key={f.id} className="px-4 py-2.5">
                <button
                  type="button"
                  data-testid={`fleet-row-${f.id}`}
                  data-active={active}
                  onClick={() => onSelect?.(f)}
                  className={`flex w-full flex-col gap-0.5 text-left ${active ? 'text-white' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[status.tone]}`} />
                    <span className="truncate text-sm text-white">{status.where}</span>
                    {here && (
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                        here
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 pl-3.5 text-xs text-zinc-400">
                    <span className="truncate">{status.activity}</span>
                    {status.remainingMs !== undefined && (
                      <span
                        data-testid={`fleet-row-eta-${f.id}`}
                        className="ml-auto font-mono text-zinc-500"
                      >
                        {formatEta(status.remainingMs)}
                      </span>
                    )}
                  </span>
                </button>

                <div className="mt-1.5 flex flex-wrap gap-1 pl-3.5">
                  {visibility.burn && (
                    <button
                      type="button"
                      data-testid={`fleet-cmd-burn-${f.id}`}
                      disabled={mineGate.gated}
                      onClick={() => onBurn?.(f)}
                      className={CMD_BUTTON}
                    >
                      Burn
                    </button>
                  )}
                  {visibility.cutDrive && (
                    <button
                      type="button"
                      data-testid={`fleet-cmd-cut-drive-${f.id}`}
                      disabled={mineGate.gated}
                      onClick={() => onCutDrive?.(f)}
                      className={CMD_BUTTON}
                    >
                      Cut drive
                    </button>
                  )}
                  {visibility.stop && (
                    <button
                      type="button"
                      data-testid={`fleet-cmd-stop-${f.id}`}
                      disabled={mineGate.gated}
                      onClick={() => onStop?.(f)}
                      className={CMD_BUTTON}
                    >
                      Stop
                    </button>
                  )}
                  {visibility.jump && (
                    <button
                      type="button"
                      data-testid={`fleet-cmd-jump-${f.id}`}
                      disabled={mineGate.gated}
                      onClick={() => onJump?.(f)}
                      className={CMD_BUTTON}
                    >
                      Jump
                    </button>
                  )}
                  {mineGate.gated && runningMine && (
                    <button
                      type="button"
                      data-testid={`fleet-cmd-cancel-mine-${f.id}`}
                      onClick={() =>
                        cancelAction.mutate(
                          { actionId: runningMine.id, fleetId: f.id },
                          {
                            onSuccess: () => toast.success('Mining cancelled'),
                            onError: (e) => toast.error(e.message || 'Cancel failed'),
                          },
                        )
                      }
                      className={CMD_BUTTON}
                    >
                      Cancel mine
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

export default FleetRoster
