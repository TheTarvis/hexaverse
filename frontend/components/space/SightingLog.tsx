'use client'

// SightingLog — the corporation's sighting pile, listed (openspec change
// `add-scan-and-sightings-surface`, `sighting-log`). One row per served
// record, in the SERVED order, with no client-side re-sorting. The swept
// host is shown as its raw id on every row — nothing serves a name for a
// body or a fleet, so there is nothing to fall back from.

import { useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { useSightings } from '@/hooks/use-sightings'
import type { Sighting } from '@/lib/types/sighting'

export interface SightingLogProps {
  /** The open system — for the cross-highlight's ghost lookup only. */
  systemId: string | null
  highlightedGhostId: string | null
  onHighlightRow: (recordId: string | null) => void
  /** `fleet-roster`'s own system-name fallback precedent. */
  galaxySystemNames?: Record<string, string>
  /**
   * The served ids of every sighting mark the scene ACTUALLY DREW this
   * render (QA return: `sighting-log`'s own "A Log Row and Its Ghost
   * Address the Same Record By Its Served Id" forbids answering "does this
   * row have a mark" from "a list of reasons" -- a clean sweep, another
   * system, and so on -- because that list silently omits every OTHER way
   * a mark can fail to exist: an origin-omitted record, one beyond the
   * ghost layer's single bounded page, or the canvas being unavailable at
   * all. `SystemSpaceView` already builds the scene model and knows canvas
   * availability, so it is the one place this set can be computed
   * correctly; this component only ever tests membership in it.
   *
   * Optional so a standalone render (this file's own unit test, which
   * mocks the pile but not the scene) degrades to "assume a mark exists
   * unless the record is a clean sweep" -- the one fact that is true from
   * the record alone, in every correct scene, with no scene at all needed
   * to know it.
   */
  drawnRecordIds?: ReadonlySet<string>
}

function systemLabel(systemId: string, names: Record<string, string> | undefined): string {
  return names?.[systemId] ?? systemId
}

function Row({
  record,
  systemNames,
  highlighted,
  noMark,
  onSelect,
}: {
  record: Sighting
  systemNames: Record<string, string> | undefined
  highlighted: boolean
  noMark: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        data-testid={`sighting-row-${record.id}`}
        data-highlighted={highlighted ? 'true' : 'false'}
        className="w-full rounded-md border border-zinc-700/60 px-2 py-1 text-left font-mono text-[11px] text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        onClick={onSelect}
      >
        <div className="flex items-center justify-between">
          <span>{systemLabel(record.systemId, systemNames)}</span>
          <span>{record.asOf}</span>
        </div>
        <div>Host: {record.hostId}</div>
        {record.cleanSweep ? (
          <div>Clean sweep — nothing masked here.</div>
        ) : (
          <div>
            Hull count {record.hullCount} · {(record.hullTypes ?? []).join(', ')}
          </div>
        )}
        {noMark && <div>This record has no mark in the open system.</div>}
      </button>
    </li>
  )
}

export function SightingLog({
  // `systemId` is kept in the prop type for compatibility with this
  // component's own existing render callers/tests, but is no longer read
  // here directly -- see `drawnRecordIds`'s own doc comment for why a
  // systemId-equality check was the exact "list of reasons" QA returned
  // this file for.
  systemId: _systemId,
  highlightedGhostId,
  onHighlightRow,
  galaxySystemNames,
  drawnRecordIds,
}: SightingLogProps) {
  // The UNFILTERED pile — the log's own read, distinct from the ghost
  // layer's system-filtered one (task 4.4/4.7: never sharing a cache key).
  const pile = useSightings(null)
  // Which row was MOST RECENTLY selected and turned out to have no ghost —
  // tracked locally, because `onHighlightRow(null)` clears the SHARED
  // highlight state and cannot also carry "which row just told you so".
  const [noMarkRowId, setNoMarkRowId] = useState<string | null>(null)

  const records = pile.data?.pages.flatMap((page) => page.sightings) ?? []
  const lastPage = pile.data?.pages[pile.data.pages.length - 1]
  const hasMore = !!lastPage?.nextCursor

  // Membership on the set the SCENE actually drew -- never a list of
  // reasons a mark might be absent (QA return). A clean sweep is the one
  // fact knowable from the record alone in every correct scene (it draws
  // no mark, by definition -- space-scene.ts's own rule); everything else
  // -- another system, the origin-omission rule, the ghost layer's single
  // bounded page, or the canvas being unavailable -- is already folded
  // into whether record.id appears in drawnRecordIds, because all of
  // those are exactly why buildSceneModel would not have produced a mark
  // for it. drawnRecordIds absent (no scene wired in at all) degrades to
  // "assume a mark exists unless the record is a clean sweep".
  const hasGhost = (record: Sighting): boolean => {
    if (record.cleanSweep) return false
    if (!drawnRecordIds) return true
    return drawnRecordIds.has(record.id)
  }

  const selectRow = (record: Sighting) => {
    if (!hasGhost(record)) {
      setNoMarkRowId(record.id)
      onHighlightRow(null)
      return
    }
    setNoMarkRowId(null)
    onHighlightRow(record.id)
  }

  return (
    <div
      data-testid="sighting-log"
      className="flex max-h-[70vh] w-80 max-w-[90vw] flex-col gap-2 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50/95 p-3 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Sighting Log
        </span>
        {/* An explicit refresh, distinct from the timer poll this
            capability refuses (`sighting-log`: *The Log Reads on Mount,
            After a Sweep Settles, and on Explicit Refresh — Never on a
            Timer*). */}
        <button
          type="button"
          aria-label="Refresh sighting log"
          className="rounded-md border border-zinc-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          onClick={() => void pile.refetch()}
        >
          Refresh
        </button>
      </div>

      {pile.isError ? (
        <div data-testid="sighting-log-error" className="text-[11px] text-zinc-500">
          <p>The sighting pile could not be read.</p>
          <Button type="button" plain onClick={() => void pile.refetch()}>
            Retry
          </Button>
        </div>
      ) : pile.isLoading ? (
        <p className="text-[11px] text-zinc-500">Reading the pile…</p>
      ) : records.length === 0 ? (
        <p data-testid="sighting-log-empty" className="text-[11px] text-zinc-500">
          No sightings yet. Run a focused scan to file one.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {records.map((record) => (
            <Row
              key={record.id}
              record={record}
              systemNames={galaxySystemNames}
              highlighted={hasGhost(record) && highlightedGhostId === record.id}
              noMark={noMarkRowId === record.id}
              onSelect={() => selectRow(record)}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          data-testid="sighting-log-load-more"
          className="self-start rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          onClick={() => void pile.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </div>
  )
}

export default SightingLog
