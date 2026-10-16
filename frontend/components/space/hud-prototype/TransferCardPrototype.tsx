'use client'

// THROWAWAY E: one fleet, one destination, one immediate transfer.
import { Button } from '@/components/catalyst/button'
import { Select } from '@/components/catalyst/select'
import type { Entity, Fleet } from './HudPrototype'
import styles from './hud-prototype.module.css'

export function TransferCardPrototype({ fleet, fleets, target, objects, previewing, onFleet, onTarget, onPreview, onBack, onTravel, onStop, onArrival }: {
  fleet: Fleet; fleets: Fleet[]; target?: Entity; objects: Entity[]; previewing: boolean
  onFleet: (id: string) => void; onTarget: (id: string) => void; onPreview: () => void
  onBack: () => void; onTravel: () => void; onStop: () => void; onArrival: () => void
}) {
  const busy = fleet.activity === 'Mining' || fleet.activity === 'Traveling'
  const enoughFuel = !!target?.cost && fleet.fuel >= target.cost
  const canTravel = !!target?.cost && target.system === fleet.system && enoughFuel && !busy
  return <section className={styles.transferCard} aria-label="Fleet transfer">
    <header><h2>Transfer</h2><span>{previewing ? 'Course preview' : 'Select a fleet and a destination'}</span></header>
    <div className={styles.singleTransferFields}>
      <label><span>Fleet</span><Select aria-label="Transfer fleet" value={fleet.id} onChange={event => onFleet(event.target.value)}>{fleets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.system}</option>)}</Select></label>
      <b aria-hidden="true">→</b>
      <label><span>Destination</span><Select aria-label="Transfer destination" value={target?.id ?? ''} onChange={event => onTarget(event.target.value)}><option value="">Choose on map…</option>{objects.filter(object => object.cost && object.system === fleet.system).map(object => <option key={object.id} value={object.id}>{object.name}</option>)}</Select></label>
    </div>
    <div className={styles.transferEstimate}><span>{fleet.activity} · {fleet.fuel} t fuel</span>{target && <span>{target.eta} flight · {target.cost} t fuel</span>}</div>
    {target && !enoughFuel && <p className={styles.hint}>{fleet.name} needs more fuel for this destination.</p>}
    {busy && <p className={styles.hint}>{fleet.name} is {fleet.activity.toLowerCase()}{fleet.destination ? ` at ${fleet.destination}` : ''}. Stop the current order to set a new course.</p>}
    <footer>
      {busy ? <><Button outline onClick={onStop}>{fleet.activity === 'Mining' ? 'Stop mining' : 'Cut drive'}</Button>{fleet.activity === 'Traveling' && <Button plain onClick={onArrival}>Simulate arrival →</Button>}</> : previewing ? <><Button outline onClick={onBack}>Back</Button><Button color="cyan" disabled={!canTravel} onClick={onTravel}>Start travel →</Button></> : <Button color="cyan" disabled={!canTravel} onClick={onPreview}>Preview course →</Button>}
    </footer>
  </section>
}
