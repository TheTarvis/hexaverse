'use client'

// FleetRoster — the "where is everything?" panel, mounted on BOTH canvases (the
// galaxy and a system board) so the answer never depends on which view you're
// standing in. One row per own fleet: where it is (system, or the lane it's on),
// what it's doing, and a live countdown on whatever order is running.
//
// It owns its reads (useMyFleets for the fleets, useGalaxy for system names) so a
// view mounts it with one line; the world clock comes in as a prop because both
// views already run one and the roster must tick in step with the picture.
// Clicking a row is the view's business — it hands the fleet back up.

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import { useMyFleets } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { queryKeys } from '@/lib/query-keys'
import { formatEta } from '@/lib/eta'
import { fleetStatus, type StatusTone } from './fleet-status'

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

// Row accents by tone — cyan for a live order, amber for a fleet that's stopped
// mid-lane and wants a decision, zinc for one just sitting there.
const TONE_DOT: Record<StatusTone, string> = {
  idle: 'bg-zinc-400',
  moving: 'bg-sky-400',
  transit: 'bg-cyan-300 animate-pulse',
  held: 'bg-amber-400 animate-pulse',
}

export interface FleetRosterProps {
  // The live world clock of the mounting view — the countdown's input.
  worldTime: number
  // The fleet the view is currently commanding, highlighted in the list.
  activeFleetId?: string | null
  // The system whose board is open, if any — its fleets read as "here".
  currentSystemId?: string | null
  // Clicked a row. The view decides what that means (select it, focus the camera,
  // drill into its system).
  onSelect?: (fleet: Fleet) => void
  // False on the logged-out start area: no token, and no fleets to manage.
  enabled?: boolean
}

export function FleetRoster({
  worldTime,
  activeFleetId,
  currentSystemId,
  onSelect,
  enabled = true,
}: FleetRosterProps) {
  const { data: fleets } = useMyFleets({ enabled })
  const { data: galaxy } = useGalaxy()
  const [open, setOpen] = useState(true)
  const qc = useQueryClient()

  // Running mines by actor (add-mine-ui, design Decision 5): read from the
  // running-actions queries ALREADY cached by whoever commands fleets (the
  // board's useRunningMine) — one cache sweep per tick, no per-row fetching,
  // no new endpoint. A fleet whose inbox nobody fetched simply falls back to
  // its movement-state label. worldTime re-arms the sweep every tick, so a
  // label lifts at eta without waiting for a cache event.
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
    <aside data-testid="fleet-roster" className={`${PANEL} flex w-64 max-w-[80vw] flex-col self-start`}>
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
        <ul className="max-h-64 overflow-y-auto border-t border-zinc-200 dark:border-zinc-800/50">
          {own.map((f) => {
            const status = fleetStatus(f, worldTime, nameOf, minesByActor.get(f.id) ?? null)
            const active = f.id === activeFleetId
            const here = !!currentSystemId && status.goToSystemId === currentSystemId
            return (
              <li key={f.id}>
                <button
                  type="button"
                  data-testid={`fleet-row-${f.id}`}
                  data-active={active}
                  onClick={() => onSelect?.(f)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-white/[0.06] ${
                    active ? 'bg-white/[0.08]' : ''
                  }`}
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
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

export default FleetRoster
