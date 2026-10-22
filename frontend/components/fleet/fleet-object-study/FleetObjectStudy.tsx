'use client'

import { useState } from 'react'
import { HudCardBack, HudCardShell, HudSection } from '@/components/hud/HudCardShell'
import { HudButton, HudSearchInput, HudSelect } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudObjectThumbnail, type HudObjectKind } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import { SpacecraftPreview } from '@/components/space/SpacecraftPreview'
import { FleetCardDeck, type FleetTab, type FleetCommand } from './FleetCardDeck'
import styles from './fleet-object-study.module.css'

type Category = 'owned' | 'friendly' | 'enemy' | 'unknown'
type Item = { id: string; name: string; kind: 'fleet' | 'resource-site' | 'station' | 'burn'; category?: Category; subtitle: string }
const items: Item[] = [
  { id: 'peregrine', name: 'Peregrine', kind: 'fleet', category: 'owned', subtitle: 'Owned · Attached at Nereid outer belt' },
  { id: 'belt', name: 'Nereid outer belt', kind: 'resource-site', subtitle: 'Resource site · Iron, silicates' },
  { id: 'courier', name: 'Wayfarer', kind: 'fleet', category: 'friendly', subtitle: 'Friendly · Aster Cooperative' },
  { id: 'station', name: 'Solace Station', kind: 'station', subtitle: 'Station · Trade services' },
  { id: 'raider', name: 'Red Wake', kind: 'fleet', category: 'enemy', subtitle: 'Enemy · Cinder Collective' },
  { id: 'burn', name: 'Unanalyzed burn', kind: 'burn', category: 'unknown', subtitle: 'Unknown · Last observed near the outer belt' },
]
const labels: Record<Category, string> = { owned: 'Owned', friendly: 'Friendly', enemy: 'Enemy', unknown: 'Unknown' }
type Props = { startAt: 'objects' | 'owned-fleet' }

/** Throwaway browse/detail comparison. Foreign identities and relationships are fictional. */
export function FleetObjectStudy({ startAt }: Props) {
  return <Browse key={startAt} startAt={startAt} />
}

function Art({ item }: { item: Item }) {
  return item.kind === 'burn' ? <HudObjectThumbnail analyzed={false} /> : <HudObjectThumbnail kind={item.kind as HudObjectKind} />
}

function Browse({ startAt }: Props) {
  const [open, setOpen] = useState(true)
  const [type, setType] = useState<'all' | 'fleets'>('all')
  const [category, setCategory] = useState<'all' | Category>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(startAt === 'owned-fleet' ? 'peregrine' : null)
  const [tabs, setTabs] = useState<Record<string, FleetTab>>({})
  const [command, setCommand] = useState<FleetCommand | null>(null)
  const item = items.find(item => item.id === selected)
  const owned = item?.category === 'owned'
  const rows = items.filter(item => (type === 'all' || !!item.category) && (type !== 'fleets' || category === 'all' || category === item.category) && `${item.name} ${item.subtitle}`.toLowerCase().includes(search.toLowerCase()))
  const model = <div data-slot="model-preview"><SpacecraftPreview kind="ship" objectId="fleet-card-study-peregrine" label="Peregrine generalist ship" showInstructions={false} accentColor={0x91d9ec} /></div>
  const activity = <HudSection><HudHeading variant="section">Attached · ready</HudHeading><HudText variant="secondary">Nereid outer belt · Solace system</HudText></HudSection>
  const facts = <HudFacts layout="columns" items={[
    { label: 'Fuel', value: <HudValue>24 t</HudValue> }, { label: 'Free hold', value: <HudValue>80 t</HudValue> },
    { label: 'Ships', value: <HudValue>3 generalists</HudValue> },
  ]} />
  const identity = item && <div className={styles.identity}><Art item={item} /><div><HudHeading size="compact">{item.name}</HudHeading><HudText variant="secondary">{item.subtitle}</HudText></div></div>
  const back = () => { if (command) setCommand(null); else setSelected(null) }
  const body = !item ? <>
    <div className={styles.filters}>
      <label className={styles.field}><HudText variant="label">Object type</HudText><HudSelect aria-label="Object type" value={type} onChange={event => setType(event.target.value as typeof type)}><option value="all">All objects</option><option value="fleets">Fleets</option></HudSelect></label>
      {type === 'fleets' && <label className={styles.field}><HudText variant="label">Fleet category</HudText><HudSelect aria-label="Fleet category" value={category} onChange={event => setCategory(event.target.value as typeof category)}><option value="all">All</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</HudSelect></label>}
    </div>
    <HudSearchInput aria-label="Find an object" placeholder="Find an object…" value={search} onChange={event => setSearch(event.target.value)} />
    <HudText variant="caption">{rows.length} {type === 'fleets' ? 'fleets / burn observations' : 'objects'}</HudText>
    <div className={styles.rows}>{rows.map(item => <HudButton key={item.id} presentation="row" onClick={() => setSelected(item.id)}><Art item={item} /><span className={styles.rowText}><span className="hud-type-compact">{item.name}</span><span className="hud-type-secondary">{item.subtitle}</span></span></HudButton>)}</div>
    {!rows.length && <HudText role="status">No matching objects.</HudText>}
  </> : command ? <HudSection aria-label="Choose action target">
    <HudHeading variant="section">{command} with Peregrine</HudHeading>
    <HudText variant="secondary">{command === 'Mine' ? 'Choose a resource site' : command === 'Dock' ? 'Choose a station' : command === 'Analyze' ? 'Choose an object to analyze' : 'Choose a destination'}</HudText>
    {items.filter(target => command === 'Mine' ? target.kind === 'resource-site' : command === 'Dock' ? target.kind === 'station' : target.kind === 'station' || target.kind === 'resource-site').map(target => <HudButton key={target.id} presentation="row" onClick={() => { setSelected(target.id); setCommand(null) }}><Art item={target} />{target.name}</HudButton>)}
  </HudSection> : owned ? <>
    {model}{activity}{facts}
    <FleetCardDeck tab={tabs[item.id] ?? 'actions'} onTab={tab => setTabs(previous => ({ ...previous, [item.id]: tab }))} onCommand={setCommand} />
  </> : item.kind === 'burn' ? <HudSection aria-label="Unknown burn observation">
    {identity}
    <HudHeading variant="section">Burn observed · not analyzed</HudHeading>
    <HudText>Last observed near Nereid outer belt.</HudText>
    <HudText variant="secondary">Source identity, allegiance and ship composition are unknown. This observation does not establish its current position.</HudText>
  </HudSection> : <>
    {identity}
    <HudFacts layout="rows" items={item.kind === 'fleet' ? [{ label: 'Relationship', value: labels[item.category!] }, { label: 'Location', value: 'Solace system' }, { label: 'Ships & cargo', value: 'Not disclosed' }] : item.kind === 'station' ? [{ label: 'Location', value: 'Solace system' }, { label: 'Services', value: 'Trade' }] : [{ label: 'Iron richness', value: '68%' }, { label: 'Silicate richness', value: '32%' }]} />
  </>

  return <main className={`dark ${styles.stage}`}>
    {!open && <HudButton onClick={() => setOpen(true)}>Open objects</HudButton>}
    <HudCardShell hidden={!open} paused={!open} title={!item ? 'Objects · Solace' : command ? `${item.name} · ${command}` : owned ? `${item.name} · Fleet` : item.name} className={styles.card} onClose={() => setOpen(false)} closeLabel="Close objects">
      {item && <HudCardBack destination={command ? 'fleet' : 'objects'} onClick={back} />}
      {body}
    </HudCardShell>
  </main>
}
