'use client'

// ScanControl — the focused-scan surface: the served target list, commit,
// guard, countdown, cancel, and the settled outcome report (openspec change
// `add-scan-and-sightings-surface`, `system-space-view`: *The Focused-Scan
// Target List Comes From the Server, Never From a Client Predicate*, *A
// Sweep's Cost Is Presented as Time and Exposure, Not Time Alone*, *A
// Focused Scan Commits Against a Listed Target and Reports Its Rejection in
// Player Copy*, *The Scan Commit Control Guards Against Double-Submit*, *A
// Running Sweep's Window and Cancel Come From the Action Inbox*, *A Settled
// Sweep Reports Its Outcome, Including Each Fizzle Reason, in Player
// Copy*).
//
// A SIBLING OF `FleetActionsPanel`, NOT A CHILD OF IT (link8b-impl-
// contract.md §1.10). `FleetActionsPanel` is the `docked-fleet-actions`
// capability's own component; a sweep needs no attachment at all, so
// keeping the capability boundary and the file boundary aligned is the
// whole point of the split.
//
// EVERY TARGET, DURATION AND REASON CODE IS SERVED. No range or occlusion
// predicate is computed here — a body absent from the served set is simply
// never offered, whatever the interior read shows.

import { useEffect, useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { useCancelAction, useRunningScan, useAcknowledgeAction } from '@/hooks/use-actions'
import { useScan, useScanTargets, useSettledScan } from '@/hooks/use-scan'
import { useSubmitGuard } from '@/hooks/use-submit-guard'
import { commandErrorReason } from '@/lib/rejection-copy'
import { isStaleTargetRejection, scanErrorCopy, scanFizzleCopy } from '@/lib/scan-copy'
import { toast } from '@/lib/toast'
import type { Fleet } from '@/lib/types/fleet'

export interface ScanControlProps {
  /** The acting fleet. Null withdraws the control. */
  fleet: Fleet | null
  /** This view's own scale-correct projected world time. */
  worldTime: number
  /** Opens the sighting log — offered from a filed-records report. */
  onOpenLog?: () => void
  /**
   * The commit-time twin of A2 (link8b-adversary-r9, hardened per r10
   * P1/P3) — "committed, awaiting its window": `useScan`'s onSuccess fires
   * two UNORDERED invalidations (the running-status inbox read and the
   * scan-target read), so a held-channel empty scan-target page can land
   * before the running-status read confirms the just-committed sweep.
   * COMPUTED BY THE CALLER (`SystemSpaceView`), not here: the marker this
   * derives from must survive a remount of THIS component while the
   * window is open (P3), which needs a store outside any one component
   * instance — the query cache `SystemSpaceView` already has reactive
   * access to. Defaults to `false` so this component needs no query
   * client of its own (several suites render it standalone, with no
   * `QueryClientProvider` in the tree at all).
   */
  committedPending?: boolean
  /** Marks the moment a commit was accepted, for the caller's own marker. */
  onCommitAccepted?: () => void
  /**
   * F11-1's early-settle exit (link8b-adversary-r11), scoped per the F11-2
   * post-repair ruling (2026-09-03): true only while an empty target set
   * at THIS instant is explained by the just-ended committed-and-awaiting
   * window handing off to a settled report, never by "some unacknowledged
   * settled report exists" in general — that blanket reading is the defect
   * this prop replaces, since it would suppress "No host is in range" for
   * a later, wholly unrelated empty read against an old, still-undismissed
   * report from an ordinary ETA-path settle. COMPUTED BY THE CALLER
   * (`SystemSpaceView`), same reasoning as `committedPending` above.
   * Defaults to `false` so this component needs no query client of its
   * own.
   */
  earlySettleHandoff?: boolean
}

/** A sweep countdown wants second-level precision, matching the mine countdown's own convention. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function ScanControl({
  fleet,
  worldTime,
  onOpenLog,
  committedPending = false,
  onCommitAccepted,
  earlySettleHandoff = false,
}: ScanControlProps) {
  const fleetId = fleet?.id ?? null
  const systemId = fleet?.systemId ?? ''

  const scanTargets = useScanTargets(fleetId)
  const scan = useScan(fleetId)
  const runningScan = useRunningScan(fleetId)
  const settledScan = useSettledScan(fleetId)
  const cancelAction = useCancelAction(systemId)
  const acknowledge = useAcknowledgeAction()
  const guard = useSubmitGuard()

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [errorAnnouncement, setErrorAnnouncement] = useState('')
  const [staleNotice, setStaleNotice] = useState(false)

  const reportFailure = (message: string) => {
    toast.error(message)
    setErrorAnnouncement(message)
  }

  const targets = scanTargets.data?.targets ?? []
  const activeHostId =
    selectedHostId && targets.some((t) => t.hostId === selectedHostId)
      ? selectedHostId
      : (targets[0]?.hostId ?? null)

  const inTransit = !!fleet?.jump

  const commit = () => {
    if (!fleet || !activeHostId) return
    // Synchronously, within THIS invocation — never a state flip that
    // reaches `disabled` a render later (`system-space-view`: *The Scan
    // Commit Control Guards Against Double-Submit*).
    if (!guard.claim()) return
    setStaleNotice(false)
    scan.mutate(
      { hostId: activeHostId },
      {
        onSuccess: () => {
          guard.release()
          onCommitAccepted?.()
        },
        onError: (error: unknown) => {
          guard.release()
          const reason = commandErrorReason(error)
          if (isStaleTargetRejection(reason)) {
            setStaleNotice(true)
            void scanTargets.refetch()
          }
          reportFailure(scanErrorCopy(reason))
        },
        onSettled: () => guard.release(),
      },
    )
  }

  const commitCancel = () => {
    if (!fleet || !runningScan.data) return
    cancelAction.mutate(
      { actionId: runningScan.data.id, fleetId: fleet.id },
      { onError: (error: unknown) => reportFailure(scanErrorCopy(commandErrorReason(error))) },
    )
  }

  const dismissReport = () => {
    if (!fleet || !settledScan.data) return
    acknowledge.mutate(
      { actionId: settledScan.data.id, fleetId: fleet.id },
      { onError: (error: unknown) => reportFailure(scanErrorCopy(commandErrorReason(error))) },
    )
  }

  // A stale-target notice clears itself once a fresh target list lands.
  useEffect(() => {
    if (staleNotice && !scanTargets.isLoading) setStaleNotice(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTargets.data])

  if (!fleet) {
    return (
      <aside data-testid="scan-control" className="flex w-72 max-w-[85vw] flex-col">
        <p className="text-[11px] text-zinc-500">No fleet selected.</p>
      </aside>
    )
  }

  const running = runningScan.data
  const runningEta = running?.eta ?? null
  const settling = runningEta !== null && runningEta <= worldTime

  return (
    <aside
      data-testid="scan-control"
      className="pointer-events-auto flex w-72 max-w-[85vw] flex-col self-start rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]"
    >
      <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        Focused Scan
      </span>
      <span
        className="sr-only"
        role="status"
        aria-live="assertive"
        data-testid="scan-error-live-region"
      >
        {errorAnnouncement}
      </span>

      {runningScan.isError ? (
        <div className="mt-2 text-[11px] text-zinc-500">
          <p>This sweep&apos;s state could not be read.</p>
          <Button type="button" plain onClick={() => void runningScan.refetch()}>
            Retry
          </Button>
        </div>
      ) : running ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[11px] text-zinc-500">
            This fleet is detectable for the remainder of the sweep.
          </p>
          <div className="flex items-center justify-between">
            <span data-testid="scan-countdown" className="font-mono text-[11px] text-sky-400">
              {settling ? 'Settling…' : countdown(runningEta! - worldTime)}
            </span>
            <button
              type="button"
              data-testid="scan-cancel"
              className="rounded-md border border-zinc-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              onClick={commitCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : committedPending ? (
        // The commit-time twin of A2: an accepted commit whose confirming
        // running-status read has not landed yet. Never the empty-set
        // copy, never a commit control, never the target list — only that
        // the commit was accepted and its window is still being confirmed.
        // The countdown itself appears once `running` above goes true.
        <p data-testid="scan-commit-pending" className="mt-2 text-[11px] text-zinc-500">
          Sweep committed — confirming its window…
        </p>
      ) : scanTargets.isError ? (
        <div className="mt-2 text-[11px] text-zinc-500">
          <p>The available scan targets could not be read.</p>
          <Button type="button" plain onClick={() => void scanTargets.refetch()}>
            Retry
          </Button>
        </div>
      ) : scanTargets.isLoading ? (
        <p data-testid="scan-targets-loading" className="mt-2 text-[11px] text-zinc-500">
          Reading scan targets…
        </p>
      ) : targets.length === 0 && scanTargets.isFetching ? (
        // A2 (link8b-adversary-r9): a TRIGGERED refetch in flight over an
        // empty cached page (the Decision 15 held-channel set) presents as
        // being re-read, never as "no host is in range" -- the settled-
        // sweep instant this exists for is precisely when the running-
        // status inbox read can land first and flip "already sweeping" to
        // false while this read is still catching up over the stale empty
        // page.
        <p data-testid="scan-targets-rereading" className="mt-2 text-[11px] text-zinc-500">
          Re-reading targets…
        </p>
      ) : targets.length === 0 && earlySettleHandoff ? null : targets.length === 0 ? (
        // task 5.13 / F11-1 (link8b-adversary-r11), scoped per the F11-2
        // post-repair ruling (2026-09-03): a settled report ABOVE (below in
        // the DOM) THAT THIS SAME COMMITTED-AND-AWAITING WINDOW HANDED OFF
        // TO is what explains this fleet's sensor channel right now -- an
        // empty target set at this exact instant is indistinguishable from
        // the held-channel set the just-settled sweep left behind, so this
        // states nothing rather than risk re-offering that stale claim as a
        // fact about the world. This is NEVER gated on "some unacknowledged
        // report exists" -- an old, unrelated, still-undismissed report from
        // an ordinary ETA-path settle must not suppress "No host is in
        // range" for a later, unrelated empty read. The report block owns
        // communicating the outcome; once the player dismisses it (or it
        // was never the report this window explains), an empty set again
        // reads as "no host is in range" on its own authority.
        <p className="mt-2 text-[11px] text-zinc-500">
          {inTransit
            ? 'This fleet is in lane transit and cannot sweep right now.'
            : 'No host is in range to sweep.'}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {staleNotice && (
            <p className="text-[11px] text-amber-500">
              That sweep is no longer possible against that host. The target list has been refreshed.
            </p>
          )}
          <select
            data-testid="scan-target-select"
            aria-label="Scan target"
            className="rounded-md border border-zinc-700/60 bg-transparent px-1 py-0.5 font-mono text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            value={activeHostId ?? ''}
            onChange={(e) => setSelectedHostId(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t.hostId} value={t.hostId}>
                {t.kind} · {t.hostId} · {countdown(t.durationMs)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-zinc-500">
            Committing this sweep makes the fleet detectable for its whole duration.
            {fleet.attachedTo &&
              ' It also breaks this fleet’s masking at the attached host for that time.'}
          </p>
          <button
            type="button"
            data-testid="scan-commit-button"
            className="rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            disabled={!activeHostId}
            onClick={commit}
          >
            Sweep
          </button>
        </div>
      )}

      {settledScan.isError ? (
        <div className="mt-2 text-[11px] text-zinc-500">
          <p>This sweep&apos;s outcome could not be read.</p>
          <Button type="button" plain onClick={() => void settledScan.refetch()}>
            Retry
          </Button>
        </div>
      ) : settledScan.data ? (
        <div
          data-testid="scan-report"
          className="mt-2 flex flex-col gap-1 border-t border-dashed border-white/15 pt-2 text-[11px] text-zinc-300"
        >
          <p>
            {settledScan.data.reasonCode
              ? scanFizzleCopy(settledScan.data.reasonCode)
              : 'The sweep filed records.'}
          </p>
          {!settledScan.data.reasonCode && onOpenLog && (
            <button
              type="button"
              className="self-start font-mono text-[10px] uppercase text-sky-400 underline"
              onClick={onOpenLog}
            >
              Open the sighting log
            </button>
          )}
          <button
            type="button"
            data-testid="scan-report-dismiss"
            className="self-start rounded-md border border-zinc-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            onClick={dismissReport}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </aside>
  )
}

export default ScanControl
