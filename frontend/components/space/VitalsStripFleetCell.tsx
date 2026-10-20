'use client'

import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { HudButton, HudIconButton } from '@/components/hud/HudControls'

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

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { usePhoneHud, usePhoneSheet } from '@/hooks/use-phone-sheet'
import sheetStyles from './fleet-inspector.module.css'
import { createPortal } from 'react-dom'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { HudHeading as HudContentHeading } from '@/components/hud/HudTypography'
import { HudPanel } from '@/components/hud/GameHud'
import { SpacecraftPreview } from './SpacecraftPreview'
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
  const phone = usePhoneHud()
  const inspectorPage = useRef<HTMLDivElement>(null)
  const restoreChevronFocus = useRef(false)
  const [open, setOpen] = useState(false)
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const inspectorClose = useRef<HTMLButtonElement>(null)
  const inspecting = !fleetsFailed && acting?.id === inspectedId && ownedFleets.some(fleet => fleet.id === inspectedId)
  const inspectable = !fleetsFailed && acting && ownedFleets.some(fleet => fleet.id === acting.id) ? acting : null
  usePhoneSheet(phone && inspecting, inspectorPage, inspectedId)
  useEffect(() => {
    if (!inspecting && restoreChevronFocus.current) { restoreChevronFocus.current = false; chevronRef.current?.focus() }
  }, [inspecting])
  useEffect(() => {
    if (!inspecting) setInspectedId(null)
    else inspectorClose.current?.focus()
  }, [inspecting])
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [menuPosition, setMenuPosition] = useState({ left: 12, bottom: 56, width: 440, maxHeight: 320 })

  // Escape scroll-container clipping while staying anchored to the chevron.
  useLayoutEffect(() => {
    if (!open && !inspecting) return
    const place = () => {
      const rect = chevronRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(440, window.innerWidth - 24)
      setMenuPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        bottom: window.innerHeight - rect.top + 4,
        width,
        maxHeight: Math.max(40, Math.min(320, rect.top - 16)),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, inspecting])

  // A failed refetch empties the menu rather than freezing its last-served
  // membership or destinations (*A Failed Own-Fleets Refetch Empties the
  // Menu Rather Than Freezing It*) — the identical empty menu a requester
  // who owns no fleet at all gets.
  const entries = fleetsFailed ? [] : ownedFleets

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const inspect = () => {
    if (!inspectable) return
    setOpen(false)
    setInspectedId(inspectable.id)
  }
  const closeInspector = () => { restoreChevronFocus.current = true; setInspectedId(null); if (!phone) chevronRef.current?.focus() }
  const openMenu = () => { setInspectedId(null); setOpen(true) }
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
      openMenu()
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      closeAndReturnFocus()
    }
  }

  const onItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, fleet?: Fleet) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      itemRefs.current[(index + 1) % (entries.length + (inspectable ? 1 : 0))]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      itemRefs.current[(index - 1 + entries.length + (inspectable ? 1 : 0)) % (entries.length + (inspectable ? 1 : 0))]?.focus()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (fleet) choose(fleet)
      else inspect()
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
      <span data-testid="vitals-fleet-id" className="hud-type-value text-zinc-900 dark:text-white">
        {acting ? acting.id : ABSENT_FIGURE}
      </span>
      <div className="relative">
        <HudIconButton
          icon={ChevronDownIcon}
          label={chevronLabel}
          type="button"
          ref={chevronRef}
          data-testid="vitals-fleet-chevron"
          aria-haspopup="menu"
          aria-expanded={open}
          variant="quiet"
          onClick={() => { if (open) setOpen(false); else openMenu() }}
          onKeyDown={onChevronKeyDown}
        />
        {open && createPortal(
          <HudPanel as="div"
            role="menu"
            data-testid="vitals-fleet-menu"
            className="fixed z-[60] flex flex-col overflow-y-auto py-1"
            style={menuPosition}
          >
            {entries.map((fleet, index) => (
              <HudButton
                key={fleet.id}
                type="button"
                presentation="row"
                role="menuitem"
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                data-testid={`vitals-fleet-menu-item-${fleet.id}`}
                className="break-words"
              style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                onClick={() => choose(fleet)}
                onKeyDown={(event) => onItemKeyDown(event, index, fleet)}
              >
                {fleetMenuLabel(fleet, systemNames)}
              </HudButton>
            ))}
            {inspectable && <HudButton type="button" presentation="row" role="menuitem" data-testid="vitals-fleet-inspect"
              ref={element => { itemRefs.current[entries.length] = element }}
              className="break-words"
              style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
              onClick={inspect} onKeyDown={event => onItemKeyDown(event, entries.length)}>
              Inspect current fleet {inspectable.id}
            </HudButton>}
          </HudPanel>, document.body
        )}
      </div>
      {inspecting && acting && createPortal(
        <div ref={inspectorPage} role={phone ? 'dialog' : undefined} aria-modal={phone || undefined} aria-label={phone ? `Fleet ${acting.id} details` : undefined} tabIndex={phone ? -1 : undefined} data-phone-sheet={phone} className={phone ? sheetStyles.page : undefined}>
        <HudCardShell title="Fleet details" lighting="none" framing="frame" role="region" aria-label={`Fleet ${acting.id} details`} onClose={closeInspector} closeLabel="Close fleet details" closeTestId="fleet-inspector-close" closeButtonRef={inspectorClose}
          data-testid="fleet-inspector" className={`fixed z-[60] w-72 max-w-[calc(100vw-24px)] ${phone ? sheetStyles.panel : ''}`} style={phone ? undefined : { ...menuPosition, maxHeight: Math.max(menuPosition.maxHeight, 200) }}
          onKeyDown={event => {
            if (event.key !== 'Escape') return
            event.preventDefault(); event.stopPropagation(); closeInspector()
          }}>
<HudContentHeading size="compact" level={3}>{acting.id}</HudContentHeading>
          <div className={sheetStyles.body}>
          <SpacecraftPreview key={`ship:${acting.id}`} kind="ship" objectId={acting.id} label={acting.id}
            accentColor={acting.state.Mode === 0 ? 0xffb454 : acting.state.Mode === 2 ? 0xc4b5fd : 0x4ade80} />
          <VitalsStripPill status={status} stranded={stranded} scale={scale} worldTime={worldTime} />
          </div>
        </HudCardShell></div>, document.body
      )}
      <VitalsStripPill status={status} stranded={stranded} scale={scale} worldTime={worldTime} />
    </div>
  )
}

export default VitalsStripFleetCell
