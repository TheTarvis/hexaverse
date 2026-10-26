'use client'

import { HudCardBack } from '@/components/hud/HudCardShell'
import { HudButton } from '@/components/hud/HudControls'
import { HudText } from '@/components/hud/HudTypography'
import { ObjectSearchCard } from './ObjectSearchCard'
import { MiningCardContent } from './MiningCard'
import { bodySearchEntry, fleetSearchEntry } from '@/lib/hud-action-targets'
import type { useMiningJourney } from '@/hooks/use-mining-journey'

export function MiningJourney({ journey, systemName, failed, loading, onRetry }: {
  journey: ReturnType<typeof useMiningJourney>
  systemName: string
  failed: boolean
  loading: boolean
  onRetry: () => void
}) {
  if (!journey.active) return null
  if (journey.step === 'review') return journey.card ? <MiningCardContent key={`${journey.card.fleet.id}:${journey.card.target.id}`} {...journey.card} /> : <>
    <HudCardBack destination="fleet status" onClick={journey.back} />
    <HudText role="alert">The selected fleet or resource site is no longer available.</HudText>
    <HudButton presentation="chrome" onClick={onRetry}>Refresh mining readings</HudButton>
  </>
  const choosingFleet = journey.step === 'fleet'
  return <ObjectSearchCard frameHost="workspace" showPresets={false} title={{ search: choosingFleet ? 'command-fleet' : 'mining-target', scope: systemName,
    fleet: choosingFleet ? undefined : journey.fleet?.name, object: choosingFleet ? journey.target?.name : undefined }}
    items={choosingFleet ? journey.eligibleFleets.map(fleetSearchEntry) : journey.eligibleTargets.map(bodySearchEntry)}
    value={journey.queries[choosingFleet ? 'fleet' : 'target']} onChange={value => journey.changeQuery(choosingFleet ? 'fleet' : 'target', value)}
    onSelect={choosingFleet ? journey.selectFleet : journey.selectTarget} status={failed || journey.searchFailed ? 'error' : loading || journey.searchLoading ? 'loading' : 'ready'} onRetry={() => { onRetry(); journey.retryOptions() }}
    onBack={journey.back} backDestination={choosingFleet ? 'resource' : 'fleet status'} onClose={journey.back} />
}
