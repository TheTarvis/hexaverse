'use client'

import { useRef } from 'react'
import { usePhoneSheet } from '@/hooks/use-phone-sheet'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { HudActionBand, type HudBandAction } from '@/components/hud/HudActionBand'
import type { CommandGuide } from '@/lib/command-onboarding'
import type { Fleet } from '@/lib/types/fleet'
import type { Station } from '@/lib/types/market'
import type { SpaceBody } from '@/lib/types/system-space'
import styles from './command-view.module.css'

export function RecoveryTransmission({ guide, fleet, bodies, station = null, stationFailed = false, interiorFailed, actionFailed, onRetryAction, onSave, onTarget, onScan, onObjects }: {
  guide: CommandGuide
  fleet: Fleet
  bodies: SpaceBody[]
  station?: Station | null
  stationFailed?: boolean
  interiorFailed: boolean
  actionFailed: boolean
  onRetryAction: () => void
  onSave: (guide: CommandGuide) => void
  onTarget: (id: string) => void
  onScan: () => void
  onObjects?: () => void
}) {
  const sheetRef = useRef<HTMLElement>(null)
  usePhoneSheet(true, sheetRef, 'recovery', 'root')
  const target = bodies.find(body => body.id === guide.targetId)
  const candidate = bodies.find(body => body.type !== 'station' && body.id !== fleet.attachedTo && body.resources?.length)
  const label = target ? `${target.type.replaceAll('_', ' ')} ${target.id}` : guide.targetId
  const activeTarget = guide.targetId ?? candidate?.id
  const miningDone = ['return', 'returning', 'sell', 'refuel', 'done'].includes(guide.phase)
  const motorDone = miningDone || ['mine', 'extraction'].includes(guide.phase)
  const stationBody = station ? bodies.find(body => body.id === station.featureId) : null
  const stationUnavailable = stationFailed || interiorFailed || !stationBody
  const atStation = !!station && fleet.state?.Mode === 1 && fleet.attachedTo === station.featureId
  const stationCopy = stationFailed || interiorFailed ? 'Station telemetry is unavailable. Retry the station or system read before plotting the return.' : !stationBody ? 'No trading station is disclosed in this system. Keep your cargo and fuel reserve; the trading lesson can resume when station telemetry is available. You can dismiss the guide and explore.' : `Return to station ${stationBody.id}. Review the burn cost and leave enough fuel for the crossing.`
  const unavailable = interiorFailed || (!!guide.targetId && !target)
  let copy: string
  if (guide.phase === 'wake') copy = 'Wakey wakey. You’re online. Your first fleet is connected. Let’s make sure everything still works.'
  else if (guide.phase === 'objects') copy = 'Let’s see where we are. Open the Objects panel.'
  else if (guide.phase === 'station') copy = stationUnavailable ? stationCopy : 'This station is your home port. Sell mined cargo here, then buy fuel for your next trip.'
  else if (guide.phase === 'scan') copy = 'Let’s scan our surroundings. Choose a nearby host in Scan and start a sweep to look for resources.'
  else if (guide.phase === 'scanning') copy = actionFailed ? 'The scan report is unavailable. Retry to check its result.' : 'Sensors working. Waiting for the scan report.'
  else if (guide.phase === 'contacts') copy = interiorFailed ? 'Scan complete, but resource telemetry is unavailable. Retry the system read before choosing a destination.' : 'Scan complete. Checking disclosed resource sites. If none are found, scan another host.'
  else if (guide.phase === 'target') copy = unavailable ? 'System telemetry is unavailable. Your orders are unchanged; reconnect before choosing a destination.' : activeTarget ? `Contact found. Let’s test your engines. Open Objects to inspect the resource site.` : 'We need a known resource site for this check. Open Scan to survey a nearby host, then return here when resources are disclosed.'
  else if (guide.phase === 'travel') copy = `Motor check in progress. We’ll confirm it when this fleet docks at ${label}. If its course was interrupted, select the destination and issue another burn.`
  else if (guide.phase === 'mine') copy = unavailable ? 'Motor function confirmed. Resource telemetry is unavailable; retry the system read before mining.' : !target?.resources?.length ? 'Motor function confirmed. Scan this host to disclose its resources before the mining check.' : 'Motor function confirmed. Nicely done. Now mine a sample of a disclosed resource using the mining controls. Review the quantity and issue the order.'
  else if (guide.phase === 'extraction') copy = actionFailed ? 'The extraction report could not be read. We haven’t confirmed mining yet. Retry to check the result.' : 'Mining rig responding. Waiting for the completed extraction report and a one-tonne increase in this fleet’s hold.'
  else if (guide.phase === 'return' || guide.phase === 'returning') copy = `Mining function confirmed. Cargo is not fuel: sell it at a station, then purchase propellant. ${stationCopy}${guide.phase === 'returning' ? ' Arrival will be confirmed from docking telemetry.' : ''}`
  else if (guide.phase === 'sell') copy = stationUnavailable || !atStation ? stationCopy : `Docking confirmed. Use Sell to trade some of the mined ${guide.resource}. Check the quantity and live proceeds before committing. If none remains in your hold, gather another sample first.`
  else if (guide.phase === 'refuel') copy = stationUnavailable || !atStation ? stationCopy : 'Sale confirmed. Use Refuel to buy fuel at the station. Review the live price, your credits and free hold: fuel shares cargo capacity. Purchase an affordable amount to complete this check.'
  else copy = 'Refuelling confirmed. You can travel, mine, sell cargo and replenish fuel. Before the next burn, budget enough fuel to reach a station again.'

  const actions: HudBandAction[] = []
  if (guide.phase === 'wake') actions.push({ id: 'begin-guide', testId: 'begin-guide', label: 'Begin systems check', onClick: () => onSave({ ...guide, phase: 'objects', targetId: null }) })
  if (guide.phase === 'objects') actions.push({ id: 'guide-objects', testId: 'guide-objects', label: 'Open Objects panel', onClick: () => onObjects?.() })
  if (guide.phase === 'station') actions.push({ id: 'guide-introduce-scan', testId: 'guide-introduce-scan', label: 'Check sensors', onClick: () => onSave({ ...guide, phase: 'scan', stationId: station?.featureId ?? guide.stationId }) })
  if (['scan', 'contacts'].includes(guide.phase)) actions.push({ id: 'guide-open-scan', testId: 'guide-open-scan', label: 'Open Scan', onClick: () => { if (guide.phase === 'contacts') onSave({ ...guide, phase: 'scan', scanActionId: null }); onScan() } })
  if (guide.phase === 'scanning' && actionFailed) actions.push({ id: 'guide-retry-scan', testId: 'guide-retry-scan', label: 'Retry scan report', onClick: onRetryAction })
  if (['target', 'travel', 'mine'].includes(guide.phase) && !unavailable && activeTarget) actions.push({ id: 'guide-target', testId: 'guide-target', label: guide.phase === 'target' ? 'Open Objects panel' : `Open Objects · ${label ?? candidate?.id}`, onClick: () => { onSave({ ...guide, targetId: activeTarget }); onTarget(activeTarget) } })
  if ((guide.phase === 'target' && !activeTarget || guide.phase === 'mine' && !target?.resources?.length) && !interiorFailed) actions.push({ id: 'guide-scan', testId: 'guide-scan', label: 'Open Scan', onClick: onScan })
  if (guide.phase === 'extraction' && actionFailed) actions.push({ id: 'guide-retry', testId: 'guide-retry', label: 'Retry extraction report', onClick: onRetryAction })
  if (['return', 'returning', 'sell', 'refuel'].includes(guide.phase) && !stationUnavailable && station) actions.push({ id: 'guide-station', testId: 'guide-station', label: `Select station ${station.featureId}`, onClick: () => { onSave({ ...guide, stationId: station.featureId }); onTarget(station.featureId) } })
  if (guide.phase === 'done') actions.push({ id: 'finish-guide', testId: 'finish-guide', label: 'Command network online', onClick: () => onSave({ ...guide, phase: 'dismissed' }) })
  const [primary, secondary] = actions

  return <aside ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} data-phone-sheet="true" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onSave({ ...guide, phase: 'dismissed' }) } }} className={styles.transmission} aria-label="Recovery transmission" data-testid="recovery-transmission" data-phase={guide.phase}>
    <HudCardShell title="Recovery signal" className={styles.recoveryCard} contentClassName={styles.recoveryContent} closeLabel="Dismiss startup guide" closeTestId="dismiss-guide" onClose={() => onSave({ ...guide, phase: 'dismissed' })} footer={primary && <HudActionBand label="Recovery actions" actions={secondary ? [primary, secondary] : [primary]} />}>
    <div className={styles.transmissionBody}>
    <p role="status" aria-live="polite" data-testid="recovery-copy">{copy}</p>
    <ol className={styles.checks} aria-label="Startup checks"><li data-testid="live-motor-check">{motorDone ? '✓ Confirmed' : '01 Pending'} · Motor function</li><li data-testid="live-mining-check">{miningDone ? '✓ Confirmed' : '02 Pending'} · Mining function</li><li data-testid="live-fuel-check">{guide.phase === 'done' ? '✓ Confirmed' : '03 Pending'} · Refuelling</li></ol>
    </div>

    <small>Guide progress is saved in this browser.</small>
    </HudCardShell>
  </aside>
}
