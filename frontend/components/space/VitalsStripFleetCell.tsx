'use client'

// VitalsStripFleetCell — the strip's leftmost cell: the acting fleet's
// identity, its chevron (a menu of every fleet the requester owns,
// delegating a chosen fleet back through the SAME callback the fleet
// roster's row selection uses), and the state pill mount (openspec change
// `add-vitals-strip`, `system-console`: *The Fleet Cell Names the Acting
// Fleet and Delegates a Switch to the Mounting View*, *...Chevron and Menu
// Are Keyboard-Operable*, impl contract §7.3, RULING 26).
//
// THE CHEVRON DECIDES NOTHING about what choosing a fleet means (RULING 15):
// it calls `onSelectFleet(fleet)` — `SystemSpaceView`'s existing
// `selectFleet` — and nothing else. It never navigates itself.
//
// HAND-ROLLED ARIA MENU BUTTON, NOT A CATALYST PRIMITIVE (RULING 26): jsdom
// implements no native-select popup, so the three keyboard scenarios below
// would be provable only at the archive gate against a Catalyst `<select>`/
// `listbox`. The visual tokens still match the rest of the strip's palette.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { VitalsStripPill } from './VitalsStripPill'
import type { RosterRowStatus } from '@/components/fleet/roster-status'
import { ABSENT_FIGURE } from '@/lib/format'
import type { Fleet } from '@/lib/types/fleet'

export interface VitalsStripFleetCellProps {
  /** The acting fleet, or null when none of the requester's fleets is in
   *  this system. */
  acting: Fleet | null
  /** ALL owned fleets, never filtered to this system. Empty when the
   *  own-fleets read's most recent attempt has failed OR the read has
   *  resolved to an empty list — the two are the same rendering here
   *  (`fleetsFailed` is what a caller inspects to tell them apart). */
  ownedFleets: Fleet[]
  /** The own-fleets read's most recent attempt has failed — empties the
   *  menu rather than freezing a stale membership. */
  fleetsFailed: boolean
  /** SystemSpaceView's existing `selectFleet` — the one code path every
   *  acting-fleet switch runs through. */
  onSelectFleet: (fleet: Fleet) => void
  systemNames: Record<string, string>
  status: RosterRowStatus | null
  stranded: boolean
  scale: number | undefined
  worldTime: number
}

function fleetMenuLabel(fleet: Fleet, systemNames: Record<string, string>): string {
  if (fleet.jump) return `${fleet.id} — under way between systems`
  const systemName = systemNames[fleet.systemId] ?? fleet.systemId
  return `${fleet.id} — ${systemName}`
}

export function VitalsStripFleetCell({
  acting,
  ownedFleets,
  fleetsFailed,
  onSelectFleet,
  systemNames,
  status,
  stranded,
  scale,
  worldTime,
}: VitalsStripFleetCellProps) {
  const [open, setOpen] = useState(false)
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  // A failed refetch empties the menu rather than freezing its last-served
  // membership or destinations (*A Failed Own-Fleets Refetch Empties the
  // Menu Rather Than Freezing It*) — the identical empty menu a requester
  // who owns no fleet at all gets.
  const entries = fleetsFailed ? [] : ownedFleets

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const closeAndReturnFocus = () => {
    setOpen(false)
    chevronRef.current?.focus()
  }

  const choose = (fleet: Fleet) => {
    setJustSelectedId(fleet.id)
    setOpen(false)
    onSelectFleet(fleet)
    chevronRef.current?.focus()
  }

  const onChevronKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      closeAndReturnFocus()
    }
  }

  const onItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, fleet: Fleet) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      itemRefs.current[(index + 1) % entries.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      itemRefs.current[(index - 1 + entries.length) % entries.length]?.focus()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(fleet)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeAndReturnFocus()
    }
  }

  // The chevron's own label names the currently acting fleet, and — right
  // after a same-system choice — the just-chosen one, so a keyboard or
  // screen-reader user is told the switch took effect without a second
  // announcing surface (*Focus and the Chevron's Own Label Confirm a
  // Same-System Switch*).
  const labelledFleetId = justSelectedId ?? acting?.id ?? null
  const chevronLabel = labelledFleetId
    ? `Switch acting fleet — commanding ${labelledFleetId}`
    : 'Switch acting fleet'

  return (
    <div className="flex items-center gap-1.5">
      <span data-testid="vitals-fleet-id" className="font-mono text-[11px] text-zinc-900 dark:text-white">
        {acting ? acting.id : ABSENT_FIGURE}
      </span>
      <div className="relative">
        <button
          type="button"
          ref={chevronRef}
          data-testid="vitals-fleet-chevron"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={chevronLabel}
          className="rounded border border-zinc-300 px-1 py-0.5 font-mono text-[10px] text-zinc-600 hover:bg-zinc-200 dark:border-white/[0.12] dark:text-zinc-400 dark:hover:bg-white/[0.14]"
          onClick={() => setOpen((was) => !was)}
          onKeyDown={onChevronKeyDown}
        >
          ▾
        </button>
        {open && (
          <div
            role="menu"
            data-testid="vitals-fleet-menu"
            className="absolute bottom-full left-0 z-10 mb-1 flex min-w-max flex-col rounded-md border border-zinc-300 bg-zinc-50 py-1 shadow-lg dark:border-white/[0.12] dark:bg-zinc-700"
          >
            {entries.map((fleet, index) => (
              <button
                key={fleet.id}
                type="button"
                role="menuitem"
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                data-testid={`vitals-fleet-menu-item-${fleet.id}`}
                className="whitespace-nowrap px-2 py-1 text-left font-mono text-[11px] text-zinc-900 hover:bg-zinc-200 dark:text-white dark:hover:bg-white/[0.14]"
                onClick={() => choose(fleet)}
                onKeyDown={(event) => onItemKeyDown(event, index, fleet)}
              >
                {fleetMenuLabel(fleet, systemNames)}
              </button>
            ))}
          </div>
        )}
      </div>
      <VitalsStripPill status={status} stranded={stranded} scale={scale} worldTime={worldTime} />
    </div>
  )
}

export default VitalsStripFleetCell
