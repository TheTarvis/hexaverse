'use client'

// FleetRoster — the fleet roster, and CONDITIONALLY the fleet command
// surface (fleet-roster: "One Row Per Owned Fleet, Derived From Kinematic
// State" / "The Roster Row Is the Fleet Command Surface Where the Mounting
// View Provides None, Jump Gated by Attachment Alone"; docked-fleet-actions:
// "Running Mine Gates the Fleet Panel's Commands").
//
// Mounted on BOTH canvases (the galaxy and a system's space view) so where a
// fleet is and what it's doing never depends on which view you're standing
// in. One row per own fleet: where it is, what it's doing, and a live
// countdown on whatever order is running.
//
// WHO OWNS THE COMMANDS IS DECLARED BY THE MOUNTING VIEW, not assumed here
// (`commandOwner`, openspec build-production-space-view tasks.md 7.18/7.19).
// The galaxy view mounts no command panel, so it declares `roster` and
// supplies a handler for every command a row can then offer. The system
// space view mounts `system-space-view`'s command panel AND the
// `docked-fleet-actions` panel, both of which emit these very verbs, so it
// declares `view` and its rows render selection and status only — otherwise
// one burning fleet renders two live "Cut drive" buttons, which is a defect
// under the player's hand and a hard error under Playwright's strict mode.
//
// The ORDER TARGET (a body id or point) is the mounting view's concern
// (design.md Decision 12: "Targets are named by body id from the interior
// read"); this panel only hands the fleet back on a command click.
//
// It owns its reads (useMyFleets for the fleets, useGalaxy for system names)
// so a view mounts it with one line; the world clock comes in as a prop
// because both views already run one and the roster must tick in step with
// the picture.

import { fleetLabel } from '@/lib/fleet-label'
import { HudButton } from '@/components/hud/HudControls'
import { HudPanel } from '@/components/hud/GameHud'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import { useMyFleets } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCancelAction } from '@/hooks/use-actions'
import { Figure } from '@/components/figure/Figure'
import { formatByUnit } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { rosterRowStatus, type StatusTone } from './roster-status'
import { rosterCommandVisibility, rosterMineGate, type IsChartedGate } from './roster-commands'

const TONE_DOT: Record<StatusTone, string> = {
  idle: 'bg-zinc-400',
  moving: 'bg-sky-400',
  drifting: 'bg-violet-300 animate-pulse',
  transit: 'bg-cyan-300 animate-pulse',
}

/**
 * Who renders the fleet verbs on this mounting view. `'roster'` — the view
 * mounts no command surface of its own, so the rows carry the commands and
 * the view supplies a handler for every one of them. `'view'` — the view
 * owns the commands on its own panels, so the rows carry none at all.
 */
export type RosterCommandOwner = 'roster' | 'view'

export interface FleetRosterProps {
  // The live world clock of the mounting view — the countdown's input.
  worldTime: number
  /** The mounting view's served world-clock scale — see contract §6. */
  scale: number | undefined
  /**
   * The mounting view's declaration of who owns the fleet commands. Defaults
   * to `'roster'` — the historical behaviour, and the galaxy view's.
   */
  commandOwner?: RosterCommandOwner
  // True when the given body id is a lane gate whose lane the corporation
  // has charted — the jump command's gate. Only consulted where the roster
  // owns the commands; a view that owns them itself passes nothing, rather
  // than a `() => false` stub asserting a falsehood the requirement forbids.
  isChartedGate?: IsChartedGate
  // The fleet the view is currently commanding, highlighted in the list.
  activeFleetId?: string | null
  // The system currently open, if any — its fleets read as "here".
  currentSystemId?: string | null
  // Clicked a row (not a command button). The view decides what that means.
  onSelect?: (fleet: Fleet) => void
  selectionDisabled?: boolean
  // Command callbacks — the mounting view composes the order target (body id
  // or point) and the laneId for jump; this panel only hands back the fleet.
  // A view declaring `commandOwner="roster"` supplies all four.
  onBurn?: (fleet: Fleet) => void
  onCutDrive?: (fleet: Fleet) => void
  onStop?: (fleet: Fleet) => void
  onJump?: (fleet: Fleet) => void
  // False on the logged-out start area: no token, and no fleets to manage.
  enabled?: boolean
}

const NEVER_CHARTED: IsChartedGate = () => false

export function FleetRoster({
  worldTime,
  scale,
  commandOwner = 'roster',
  isChartedGate = NEVER_CHARTED,
  activeFleetId,
  currentSystemId,
  onSelect,
  selectionDisabled = false,
  onBurn,
  onCutDrive,
  onStop,
  onJump,
  enabled = true,
}: FleetRosterProps) {
  const { data: fleets, isError } = useMyFleets({ enabled })
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
    for (const [, actions] of qc.getQueriesData<GameAction[]>({ queryKey: queryKeys.actions.runningAll() })) {
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

  const own = useMemo(() => enabled ? fleets ?? [] : [], [enabled, fleets])
  // Nothing to manage until the player has a hull (pre-spawn, or logged out).
  if (own.length === 0) return null

  const nameOf = (id: string) => nameById.get(id) ?? id

  return (
    <HudPanel as="aside" data-testid="fleet-roster" className="flex w-full max-w-full flex-col self-start">
      <HudButton
        type="button"
        presentation="row"
        aria-expanded={open}
        style={{ padding: '12px 16px' }}
        data-testid="fleet-roster-toggle"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="hud-type-body font-medium text-white">
          Command fleet <span className="text-zinc-400">· {own.length} available</span>
        </span>
        <span className="hud-type-value text-zinc-400">{open ? '▾' : '▸'}</span>
      </HudButton>

      {open && (
        <ul className="border-t border-zinc-200 dark:border-zinc-800/50">
          {own.map((f) => {
            const runningMine = minesByActor.get(f.id) ?? null
            const status = rosterRowStatus(f, worldTime, nameOf, runningMine)
            const visibility = rosterCommandVisibility(f, worldTime, isChartedGate)
            const mineGate = rosterMineGate(worldTime, runningMine)
            // The mounting view's declaration, applied at the one place it
            // means anything: a view that owns the verbs renders them on its
            // own surfaces, so this row renders none — not even the
            // cancel-mine control, which its panel owns too.
            const rowOwnsCommands = commandOwner === 'roster'
            const active = f.id === activeFleetId
            const here = !!currentSystemId && f.systemId === currentSystemId && !f.jump

            return (
              <li key={f.id} className="px-4 py-2.5">
                <HudButton
                  type="button"
                  presentation="row"
                  data-testid={`fleet-row-${f.id}`}
                  data-active={active}
                  style={{ minHeight: 64, padding: 12, alignItems: 'stretch' }}
                  aria-pressed={active}
                  disabled={selectionDisabled || isError}
                  onClick={() => onSelect?.(f)}
                  title={f.id}
                  className="flex min-h-16 w-full flex-col gap-1 p-3 text-left"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2 hud-type-body text-white"><span className="hud-type-compact">{fleetLabel(f)}</span>{active && <span className="hud-type-caption text-cyan-200">Selected command fleet</span>}</span>
                  <span className="flex items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[status.tone]}`} />
                    <span className="truncate hud-type-body text-white">{status.where}</span>
                    {here && (
                      <span className="ml-auto hud-type-label text-zinc-500">
                        here
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 pl-3.5 hud-type-caption text-zinc-400">
                    <span className="truncate">{status.activity}</span>
                    {status.remainingMs !== undefined && (
                      <Figure
                        raw={status.remainingMs}
                        unit="world-ms-span-left"
                        text={formatByUnit(status.remainingMs, scale, 'world-ms-span-left')}
                        data-testid={`fleet-row-eta-${f.id}`}
                        className="ml-auto hud-type-value text-zinc-500"
                      />
                    )}
                  </span>
                  {/* add-fuel-as-cargo tasks.md 8.1/8.2 — fleet-roster ADDED
                      "The Roster Row Shows Held Fuel and an Estimated
                      Range" / "... a Persistent Stranded Indication". Both
                      figures are rendered VERBATIM off the served roster —
                      this row derives/computes neither. An unserved roster
                      reads as the absent form, never a lying `0t fuel`
                      (RULING 13). */}
                  <span className="flex items-center gap-2 pl-3.5 hud-type-value text-zinc-500">
                    <span>
                      <Figure
                        raw={f.roster?.cargo?.fuel}
                        unit="tons"
                        text={formatByUnit(f.roster?.cargo?.fuel ?? NaN, scale, 'tons')}
                        data-testid={`fleet-fuel-${f.id}`}
                      />{' '}
                      fuel
                    </span>
                    <span>
                      <Figure
                        raw={f.roster?.estimatedRange}
                        unit="range"
                        text={formatByUnit(f.roster?.estimatedRange ?? NaN, scale, 'range')}
                        data-testid={`fleet-range-${f.id}`}
                      />{' '}
                      range
                    </span>
                    {f.roster?.stranded && (
                      <span
                        data-testid={`fleet-stranded-${f.id}`}
                        className="ml-auto rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-amber-300"
                      >
                        Stranded
                      </span>
                    )}
                  </span>
                </HudButton>

                {rowOwnsCommands && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-3.5">
                    {visibility.burn && (
                      <HudButton
                        type="button"
                        data-testid={`fleet-cmd-burn-${f.id}`}
                        disabled={mineGate.gated}
                        onClick={() => onBurn?.(f)}
                      >
                        Burn
                      </HudButton>
                    )}
                    {visibility.cutDrive && (
                      <HudButton
                        type="button"
                        tone="warning"
                        data-testid={`fleet-cmd-cut-drive-${f.id}`}
                        disabled={mineGate.gated}
                        onClick={() => onCutDrive?.(f)}
                      >
                        Cut drive
                      </HudButton>
                    )}
                    {visibility.stop && (
                      <HudButton
                        type="button"
                        tone="warning"
                        data-testid={`fleet-cmd-stop-${f.id}`}
                        disabled={mineGate.gated}
                        onClick={() => onStop?.(f)}
                      >
                        Stop
                      </HudButton>
                    )}
                    {visibility.jump && (
                      <HudButton
                        type="button"
                        data-testid={`fleet-cmd-jump-${f.id}`}
                        disabled={mineGate.gated}
                        onClick={() => onJump?.(f)}
                      >
                        Jump
                      </HudButton>
                    )}
                    {mineGate.gated && runningMine && (
                      <HudButton
                        type="button"
                        tone="warning"
                        data-testid={`fleet-cmd-cancel-mine-${f.id}`}
                        pending={cancelAction.isPending && cancelAction.variables?.fleetId === f.id}
                        pendingLabel="Cancelling…"
                        onClick={() =>
                          cancelAction.mutate(
                            { actionId: runningMine.id, fleetId: f.id },
                            {
                              onSuccess: () => toast.success('Mining cancelled'),
                              onError: (e) => toast.error(e.message || 'Cancel failed'),
                            },
                          )
                        }
                      >
                        Cancel mine
                      </HudButton>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </HudPanel>
  )
}

export default FleetRoster
