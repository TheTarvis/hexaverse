'use client'

// SpaceCommandPanel — the burn/jump command surface of the space view
// (openspec change `build-production-space-view`, `system-space-view`:
// *Burn Preview Reflects the Server-Solved Order, Without Committing*, *A
// Failed or Stale Preview Is Never Presented as a Current Quote*, *A Burn
// Commit Is Quote-Locked to the Preview the Player Agreed To*, *Burn Commit
// Reports Its Outcome*, *A Commit's Actual Result Is Never Silently Swapped
// for the Previewed One*, *Burn Command Targets Any Selected Body, Lane
// Gate, or Point Uniformly*, *Jump Commit*).
//
// ONE SUBMIT PATH FOR EVERY SELECTION KIND. A body, a lane gate and a bare
// point produce structurally identical requests through
// `selectionWireRequest`; there is no kind-specific branch and no
// kind-specific refusal copy. The only refusal is "nothing is selected".
// A gate-aware LOOKUP used solely to PRESENT the gate's facts is expressly
// not such a branch — the same requirement mandates that presentation.
//
// THE JUMP'S LANE COMES FROM ONE SOURCE: the acting fleet's own read
// (`fleet.laneId`). Never the interior read's gate list, never the galaxy
// graph's links, never the corporation's charted-lane set — which is why
// jump still commits with the interior read failed, and why a fleet
// attached to a gate in ANOTHER system jumps that system's lane.
//
// A RUNNING MINE GATES BOTH VERBS HERE (`docked-fleet-actions`: *Running
// Mine Gates the Fleet Panel's Commands* — "wherever the mounting view
// offers them"). On this view the roster renders no commands at all, so
// this panel is the only surface offering burn and jump: the gate has to
// live here or a mining fleet could burn, or jump, out from under its own
// run. The run itself is resolved by the mounting view and handed down as
// `mineRunning`, so this panel takes no second read of it.

import { useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Figure } from '@/components/figure/Figure'
import { useJump, useOrder } from '@/hooks/use-fleets'
import { useBurnPreview } from '@/hooks/use-burn-preview'
import { useSubmitGuard } from '@/hooks/use-submit-guard'
import { ABSENT_FIGURE, formatByUnit } from '@/lib/format'
import { jumpErrorCopy } from '@/lib/jump-copy'
import { burnErrorCopy, commandErrorReason, isQuotedCapExceeded } from '@/lib/rejection-copy'
import { BURN_FUEL_ALLOWANCE } from '@/lib/space-quote'
import { toast } from '@/lib/toast'
import type { BurnPreview, Fleet } from '@/lib/types/fleet'
import { selectionWireRequest, type SpaceSelection } from './space-selection'

export interface GateFacts {
  bodyId: string
  destSystemId: string
}

export interface SpaceCommandPanelProps {
  /** The acting fleet. */
  fleet: Fleet | null
  selection: SpaceSelection | null
  /** The selected body's gate facts, when it is one. Absent on a failed read. */
  gateFacts?: GateFacts | null
  canvasAvailable: boolean
  /**
   * True while the acting fleet has a mine run whose ETA has not passed.
   * Supplied by the mounting view, which already resolves the run for its
   * own refetch scheduling — this panel neither reads nor re-derives it.
   */
  mineRunning?: boolean
  /**
   * The mounting view's projected world time (add-figure-formatting,
   * contract §10 F1). Every duration this panel renders is a REMAINING
   * SPAN against it — the panel had no clock of its own before this change
   * and must not grow one now (`defect-galaxy-clock-assumes-scale-1.md`).
   */
  worldTime: number
  /** The mounting view's served world-clock scale — see contract §6. */
  scale: number | undefined
}

interface CommitFigures {
  arriveMs?: number
  deltaV?: number
  previewedArriveMs?: number
  previewedDeltaV?: number
}

const PANEL_BASE =
  'pointer-events-auto w-72 max-w-[85vw] self-start rounded-xl border p-3 shadow-lg backdrop-blur'
const PANEL_OK = 'border-zinc-200 bg-zinc-50/90 dark:border-zinc-800/50 dark:bg-white/[0.12]'
const PANEL_UNAFFORDABLE = 'border-amber-500/60 bg-amber-500/10 text-amber-200'
const LABEL = 'font-mono text-[11px] font-medium tracking-wide text-zinc-400 uppercase'

function differs(a: number | undefined, b: number | undefined): boolean {
  if (typeof a !== 'number' || typeof b !== 'number') return true
  return Math.abs(a - b) > 1e-6
}

export function SpaceCommandPanel({
  fleet,
  selection,
  gateFacts = null,
  canvasAvailable,
  mineRunning = false,
  worldTime,
  scale,
}: SpaceCommandPanelProps) {
  const order = useOrder()
  const jump = useJump()
  const burnGuard = useSubmitGuard()
  const jumpGuard = useSubmitGuard()
  const [commit, setCommit] = useState<CommitFigures | null>(null)

  const { preview, stale, noQuote, retry } = useBurnPreview({
    fleetId: fleet?.id ?? null,
    selection,
    // A burning fleet's re-target IS an ordinary commit, so it is previewed
    // too. Only a fleet in lane transit has no position to solve from.
    commitWouldBeAccepted: !!fleet && !fleet.jump,
  })

  // A stale figure NEVER becomes a cap: the ceiling is derived from the
  // CURRENT quote or from nothing at all.
  const currentQuote: BurnPreview | null = preview && !stale ? preview : null
  const ceiling = currentQuote ? currentQuote.fuelCostTons * BURN_FUEL_ALLOWANCE : null

  const commitBurn = () => {
    const request = selectionWireRequest(selection)
    if (!fleet || !request) return
    if (!burnGuard.claim()) return
    const quoted = currentQuote
    order.mutate(
      {
        fleetId: fleet.id,
        request: { ...request, ...(ceiling !== null ? { maxFuelTons: ceiling } : {}) },
      },
      {
        onSuccess: (settled: Fleet) => {
          burnGuard.release()
          const burn = settled?.state?.Burn as
            | { ArriveMs?: number; DeltaV?: number }
            | null
            | undefined
          setCommit({
            ...(typeof burn?.ArriveMs === 'number' ? { arriveMs: burn.ArriveMs } : {}),
            ...(typeof burn?.DeltaV === 'number' ? { deltaV: burn.DeltaV } : {}),
            ...(quoted ? { previewedArriveMs: quoted.arriveMs, previewedDeltaV: quoted.deltaV } : {}),
          })
          const arrivalText =
            typeof burn?.ArriveMs === 'number'
              ? formatByUnit(burn.ArriveMs - worldTime, scale, 'world-ms-span-in')
              : ABSENT_FIGURE
          const successCopy = 'Burn committed — arriving ' + arrivalText + '.'
          toast.success(successCopy)
        },
        onError: (error: unknown) => {
          burnGuard.release()
          const reason = commandErrorReason(error)
          // A cap rejection RE-QUOTES in flow: fresh figures for
          // re-confirmation, with no automatic retry at the higher cost.
          if (isQuotedCapExceeded(reason)) retry()
          toast.error(burnErrorCopy(reason))
        },
        onSettled: () => burnGuard.release(),
      },
    )
  }

  const commitJump = () => {
    if (!fleet?.laneId) return
    if (!jumpGuard.claim()) return
    jump.mutate(
      { fleetId: fleet.id, laneId: fleet.laneId },
      {
        onSuccess: () => {
          jumpGuard.release()
          toast.success('Jump committed.')
        },
        onError: (error: unknown) => {
          jumpGuard.release()
          toast.error(jumpErrorCopy(commandErrorReason(error)))
        },
        onSettled: () => jumpGuard.release(),
      },
    )
  }

  const unaffordable = !!preview && !preview.affordable
  const showGateFacts = !!gateFacts && selection?.bodyId === gateFacts.bodyId
  const driftNotice =
    commit &&
    (differs(commit.arriveMs, commit.previewedArriveMs) ||
      differs(commit.deltaV, commit.previewedDeltaV))

  return (
    <section
      data-testid="preview-panel"
      className={`${PANEL_BASE} ${unaffordable ? PANEL_UNAFFORDABLE : PANEL_OK}`}
    >
      <span className={LABEL}>Course</span>

      {!selection && canvasAvailable && (
        <p data-testid="selection-prompt" className="mt-1 text-[11px] text-zinc-500">
          Select a body, lane gate, or point in space to plot a burn.
        </p>
      )}
      {!canvasAvailable && (
        <p data-testid="canvas-required-notice" className="mt-1 text-[11px] text-zinc-500">
          Plotting a course needs the system view, which is unavailable. The commands below still
          work.
        </p>
      )}

      {selection && (
        <div data-testid="selection-facts" className="mt-1 text-[11px] text-zinc-400">
          {selection.bodyId ? `Target ${selection.bodyId}` : 'Target: a point in space'}
        </div>
      )}
      {showGateFacts && (
        <div data-testid="gate-facts" className="mt-1 text-[11px] text-cyan-300">
          Lane gate to {gateFacts.destSystemId}
        </div>
      )}

      {/* ------------------------------------------------ the quote */}
      {preview && (
        <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-zinc-400">
          <dt>Arrival</dt>
          <dd>
            <Figure
              raw={preview.arriveMs - worldTime}
              unit="world-ms-span-in"
              text={formatByUnit(preview.arriveMs - worldTime, scale, 'world-ms-span-in')}
              data-testid="preview-arrival"
            />
          </dd>
          <dt>Delta-v</dt>
          <dd>
            <Figure
              raw={preview.deltaV}
              unit="delta-v"
              text={formatByUnit(preview.deltaV, scale, 'delta-v')}
              data-testid="preview-deltav"
            />
          </dd>
          <dt>Fuel</dt>
          <dd>
            <Figure
              raw={preview.fuelCostTons}
              unit="tons"
              text={formatByUnit(preview.fuelCostTons, scale, 'tons')}
              data-testid="preview-fuel"
            />
          </dd>
          {ceiling !== null && (
            <>
              <dt>Ceiling</dt>
              {/* The ceiling the player agrees to IS the figure sent. */}
              <dd>
                <Figure
                  raw={ceiling}
                  unit="tons"
                  text={formatByUnit(ceiling, scale, 'tons')}
                  data-testid="preview-fuel-ceiling"
                />
              </dd>
            </>
          )}
        </dl>
      )}
      {preview && (
        <p
          data-testid="preview-affordable"
          data-affordable={preview.affordable ? 'true' : 'false'}
          className="mt-1 text-[11px]"
        >
          {preview.affordable ? 'Affordable' : 'Not affordable with the fuel aboard'}
        </p>
      )}
      {preview?.strandingWarning && (
        <p data-testid="preview-stranding" className="mt-1 text-[11px] text-amber-400">
          This burn would leave the fleet unable to reach a station.
        </p>
      )}

      {noQuote && (
        <p data-testid="preview-no-quote" className="mt-1 text-[11px] text-zinc-500">
          No quote — the preview could not be solved.
        </p>
      )}
      {stale && (
        <p data-testid="preview-stale" className="mt-1 text-[11px] text-amber-400">
          These figures are out of date.
        </p>
      )}
      {(noQuote || stale) && (
        <button
          type="button"
          data-testid="preview-retry"
          className="mt-1 rounded-md border border-zinc-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300"
          onClick={retry}
        >
          Retry quote
        </button>
      )}
      {!currentQuote && (
        // Committable WITHOUT a quote — a transient preview failure must not
        // make the core verb unreachable — but labelled for what it is.
        <p data-testid="burn-uncapped-label" className="mt-1 text-[11px] text-zinc-500">
          Uncapped: this burn will be committed with no fuel ceiling.
        </p>
      )}

      <Button
        type="button"
        data-testid="burn-button"
        color="dark/zinc"
        className="mt-2 w-full"
        disabled={!selection || !canvasAvailable || !fleet || mineRunning}
        onClick={commitBurn}
      >
        Burn
      </Button>

      {driftNotice && (
        <p data-testid="commit-drift-notice" className="mt-2 text-[11px] text-amber-400">
          Committed at delta-v{' '}
          <Figure
            raw={commit.deltaV}
            unit="delta-v"
            text={formatByUnit(commit.deltaV ?? NaN, scale, 'delta-v')}
            data-testid="commit-drift-actual-deltav"
          />{' '}
          arriving{' '}
          <Figure
            raw={commit.arriveMs !== undefined ? commit.arriveMs - worldTime : undefined}
            unit="world-ms-span-in"
            text={formatByUnit(
              commit.arriveMs !== undefined ? commit.arriveMs - worldTime : NaN,
              scale,
              'world-ms-span-in',
            )}
            data-testid="commit-drift-actual-arrival"
          />
          {commit.previewedDeltaV !== undefined ? (
            <>
              {' '}
              — previewed{' '}
              <Figure
                raw={commit.previewedDeltaV}
                unit="delta-v"
                text={formatByUnit(commit.previewedDeltaV, scale, 'delta-v')}
                data-testid="commit-drift-previewed-deltav"
              />{' '}
              arriving{' '}
              <Figure
                raw={
                  commit.previewedArriveMs !== undefined
                    ? commit.previewedArriveMs - worldTime
                    : undefined
                }
                unit="world-ms-span-in"
                text={formatByUnit(
                  commit.previewedArriveMs !== undefined
                    ? commit.previewedArriveMs - worldTime
                    : NaN,
                  scale,
                  'world-ms-span-in',
                )}
                data-testid="commit-drift-previewed-arrival"
              />
            </>
          ) : (
            ' — no quote had been shown'
          )}
        </p>
      )}

      {fleet?.laneId && (
        <Button
          type="button"
          data-testid={`fleet-cmd-jump-${fleet.id}`}
          color="dark/zinc"
          className="mt-2 w-full"
          disabled={mineRunning}
          onClick={commitJump}
        >
          Jump
        </Button>
      )}
    </section>
  )
}

export default SpaceCommandPanel
