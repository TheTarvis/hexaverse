'use client'

import { useId, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { Input } from '@/components/catalyst/input'
import { HudActionBand } from '@/components/hud/HudActionBand'
import { HudCardBack, HudSection } from '@/components/hud/HudCardShell'
import { HudButton, HudSelect } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import { formatByUnit } from '@/lib/format'
import { fleetLabel } from '@/lib/fleet-label'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import type { ResourceKind, SpaceBody } from '@/lib/types/system-space'
import type { HudTaskTitle } from '@/components/hud/hud-card-title'
import { SpacecraftPreview } from './SpacecraftPreview'
import styles from './mining-card.module.css'

export interface MiningCardProps {
  fleet: Fleet
  target: SpaceBody
  kind: ResourceKind
  quantity: string
  minQuantity?: number
  onKind: (kind: ResourceKind) => void
  onQuantity: (quantity: string) => void
  onStart: () => void
  onRetry: () => void
  onCancel?: () => void
  cancelPending?: boolean
  onBack: () => void
  backDestination: string
  worldTime: number
  scale: number | undefined
  pending: boolean
  blocker?: string | null
  error?: string | null
  action?: GameAction | null
  checking?: boolean
  connectionUncertain?: boolean
}

export function miningCardTitle({ fleet, target }: Pick<MiningCardProps, 'fleet' | 'target'>): HudTaskTitle {
  return { fleet: fleetLabel(fleet), action: 'mining', object: target.name ?? target.catalogueRef ?? target.id }
}

export function MiningCardActions(props: MiningCardProps) {
  const tons = Number(props.quantity)
  if (props.action) {
    if (props.action.status !== 'running') return null
    const cancel = props.onCancel ? { id: 'cancel', label: 'Cancel mining', tone: 'warning' as const, pending: props.cancelPending, pendingLabel: 'Cancelling…', onClick: props.onCancel } : null
    const retry = { id: 'retry', label: 'Check mining status', onClick: props.onRetry, pending: props.checking, pendingLabel: 'Checking…' }
    return props.connectionUncertain ? <HudActionBand actions={cancel ? [cancel, retry] : [retry]} /> : cancel ? <HudActionBand actions={[cancel]} /> : null
  }
  return <HudActionBand actions={[{ id: 'mine', testId: 'mining-start', label: 'Start mining', pending: props.pending, pendingLabel: 'Starting mining…',
    disabled: !!props.blocker || !Number.isFinite(tons) || tons <= 0 || tons < (props.minQuantity ?? 0) || tons > (props.fleet.roster?.freeHold ?? 0), onClick: props.onStart }]} />
}

/** Shared review/status presentation. Only confirmed action reads end the working state. */
export function MiningCardContent(props: MiningCardProps) {
  const { fleet, target, kind, quantity, action, pending, scale, worldTime } = props
  const quantityId = useId()
  const [shipsOpen, setShipsOpen] = useState(false)
  const freeHold = fleet.roster?.freeHold ?? 0
  const rate = fleet.roster?.miningRate ?? 0
  const tons = Number(quantity)
  const valid = Number.isFinite(tons) && tons > 0 && tons >= (props.minQuantity ?? 0) && tons <= freeHold
  const running = action?.status === 'running'
  const duration = action ? Math.max(0, action.eta - worldTime) : valid && rate > 0 ? tons / rate : NaN
  const counts = new Map<string, number>()
  for (const ship of fleet.roster?.ships ?? []) counts.set(ship.class, (counts.get(ship.class) ?? 0) + 1)
  const result = action?.status === 'cancelled' ? 'Mining cancelled.' : action?.reasonCode === 'lodeDry' ? 'The deposit ran dry.'
    : action?.reasonCode === 'holdFull' ? 'The fleet’s hold is full.' : action?.status === 'done' ? 'Mining completed.' : null
  return <HudSection aria-label={action ? 'Mining status' : 'Mining setup'}>
    <HudCardBack destination={props.backDestination} onClick={props.onBack} disabled={pending || props.cancelPending} />
    <div className={styles.model} data-slot="model-preview"><SpacecraftPreview kind="ship" objectId={fleet.id} label={fleetLabel(fleet)} showInstructions={false} accentColor={0x91d9ec} /></div>
    <HudHeading variant="section">{action ? running ? 'Mining' : 'Mining result' : props.blocker ? 'Mining unavailable' : 'Attached · ready'}</HudHeading>
    <HudText variant="secondary">{target.name ?? target.catalogueRef ?? target.id}</HudText>
    {!action ? <>
      <div className={styles.formFields}>
        <label className={styles.field}><HudText variant="label">Resource</HudText><HudSelect aria-label="Resource" value={kind} disabled={pending} onChange={event => props.onKind(event.target.value as ResourceKind)}>
          {!(target.resources ?? []).some(resource => resource.kind === kind && resource.richness > 0) && <option value={kind} disabled>{kind} · unavailable</option>}
          {(target.resources ?? []).filter(resource => resource.richness > 0).map(resource => <option key={resource.kind} value={resource.kind}>{resource.kind}</option>)}
        </HudSelect></label>
        <div className={styles.field}><label htmlFor={quantityId} className="hud-type-label">Quantity (t)</label><div className={styles.quantityRow}>
          <Input id={quantityId} aria-label="Quantity in tonnes" type="number" min={props.minQuantity ?? 0} max={freeHold} step="any" value={quantity} disabled={pending} onChange={event => props.onQuantity(event.target.value)} />
          <HudButton variant="quiet" aria-label="Set maximum mining quantity" disabled={pending} onClick={() => props.onQuantity(String(freeHold))}>Max</HudButton>
        </div></div>
      </div>
      <div className={styles.estimate}><HudText variant="label">Estimated duration</HudText><HudValue>{formatByUnit(duration, scale, 'world-ms-span-bare')}</HudValue></div>
      <HudText variant="caption">{formatByUnit(freeHold, scale, 'tons')} free hold · {formatByUnit(rate * 1000, scale, 'tons-per-world-s')} mining rate</HudText>
      {!valid && <HudText role="alert">Choose an amount {props.minQuantity ? `of at least ${props.minQuantity}` : 'greater than 0'} and no more than {freeHold} tonnes.</HudText>}
      {props.blocker && <HudText role="status">{props.blocker}</HudText>}
    </> : <>
      <HudText role="status">{result ?? (worldTime >= action.eta ? 'Awaiting mining confirmation…' : 'Mining in progress')}</HudText>
      <HudFacts layout="rows" items={[{ label: 'Resource', value: String(action.params?.kind ?? kind) },
        { label: 'Target quantity', value: <HudValue>{formatByUnit(Number(action.params?.tons ?? quantity), scale, 'tons')}</HudValue> },
        ...(running ? [{ label: 'Remaining', value: <HudValue>{formatByUnit(duration, scale, 'world-ms-span-bare')}</HudValue> }] : [])]} />
      {action.outcome && !running && <HudText>{action.outcome}</HudText>}
      {props.connectionUncertain && <HudText role="alert">Connection uncertain. Mining status has not been confirmed; retrying.</HudText>}
      {running && <HudText variant="secondary">You can close this card. Mining continues.</HudText>}
    </>}
    {props.error && <HudText role="alert">{props.error}</HudText>}
    <HudButton presentation="row" aria-expanded={shipsOpen} onClick={() => setShipsOpen(value => !value)}>Ships · {fleet.roster?.ships.length ?? 'Unavailable'}<HudIcon icon={ChevronDownIcon} size={16} className={shipsOpen ? styles.expandedChevron : undefined} /></HudButton>
    {shipsOpen && <HudFacts layout="rows" items={Array.from(counts, ([name, count]) => ({ label: name, value: <HudValue>× {count}</HudValue> }))} />}
  </HudSection>
}
