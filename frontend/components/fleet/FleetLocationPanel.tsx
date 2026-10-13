'use client'

import { Button } from '@/components/catalyst/button'
import { HudPanel } from '@/components/hud/GameHud'
import { Figure } from '@/components/figure/Figure'
import { formatByUnit } from '@/lib/format'
import type { Fleet } from '@/lib/types/fleet'
import { rosterRowStatus } from './roster-status'

export function FleetLocationPanel({ fleet, names, worldTime, scale, failed = false, onFocus, onOpen }: {
  fleet: Fleet
  names: Record<string, string>
  worldTime: number
  scale: number | undefined
  failed?: boolean
  onFocus?: (systemId: string) => void
  onOpen: (systemId: string) => void
}) {
  const status = rosterRowStatus(fleet, worldTime, id => names[id] ?? id)
  const jump = fleet.jump
  const target = jump?.destSystemId ?? fleet.systemId
  const progress = jump ? Math.min(100, Math.max(0, (worldTime - jump.departMs) / Math.max(1, jump.arriveMs - jump.departMs) * 100)) : null
  return <HudPanel aria-label="Selected fleet" data-testid="fleet-location-panel" className="flex flex-col gap-3 p-3">
    <p className="font-mono text-xs uppercase text-zinc-400">Selected fleet · {fleet.roster?.ships.length ?? '—'} ships</p>
    {failed ? <p role="status">Fleet telemetry unavailable. Waiting for a fresh report.</p> : <>
      <p className="text-sm">{status.where}</p>
      <p className="text-xs text-zinc-400">{status.activity}</p>
      {jump && <>
        <progress data-testid="fleet-transit-progress" aria-label="Transit progress" max={100} value={progress ?? 0} className="w-full accent-cyan-400" />
        {worldTime < jump.arriveMs ? <Figure raw={jump.arriveMs - worldTime} unit="world-ms-span-left" text={formatByUnit(jump.arriveMs - worldTime, scale, 'world-ms-span-left')} data-testid="fleet-transit-eta" /> : <p role="status">Awaiting arrival confirmation</p>}
      </>}
      <div className="flex flex-wrap gap-2">
        {onFocus && <Button plain className="!text-cyan-200" data-testid="focus-selected-fleet" onClick={() => onFocus(target)}>{jump ? 'Focus destination' : 'Focus fleet'}</Button>}
        <Button color="cyan" data-testid="open-fleet-system" onClick={() => onOpen(target)}>{jump ? 'View destination' : 'Open fleet system'}</Button>
      </div>
    </>}
  </HudPanel>
}
