'use client'

import { useState } from 'react'
import { HudCardBack, HudCardShell, HudSection } from '@/components/hud/HudCardShell'
import { HudButton } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import { SpacecraftPreview } from '@/components/space/SpacecraftPreview'
import { ObjectSearchCard } from '@/components/space/ObjectSearchCard'
import { emptyObjectSearch, isObjectSearchResourceSite, fleetCategoryLabels as labels, type ObjectSearchEntry, type ObjectSearchValue } from '@/components/space/ObjectSearch'
import { FleetCardDeck, type FleetTab, type FleetCommand } from './FleetCardDeck'
import styles from './fleet-object-study.module.css'

const items: ObjectSearchEntry[] = [
  { id: 'peregrine', name: 'Peregrine', kind: 'fleet', category: 'owned', subtitle: 'Owned · Attached at Nereid outer belt' },
  { id: 'belt', name: 'Nereid outer belt', kind: 'belt', resourceSite: true, subtitle: 'Resource site · Iron, silicates' },
  { id: 'courier', name: 'Wayfarer', kind: 'fleet', category: 'friendly', subtitle: 'Friendly · Aster Cooperative' },
  { id: 'station', name: 'Solace Station', kind: 'station', subtitle: 'Station · Trade services' },
  { id: 'raider', name: 'Red Wake', kind: 'fleet', category: 'enemy', subtitle: 'Enemy · Cinder Collective' },
  { id: 'burn', name: 'Unanalyzed burn', kind: 'burn', category: 'unknown', subtitle: 'Unknown · Last observed near the outer belt' },
]
type Props = { startAt: 'objects' | 'owned-fleet' }

/** Throwaway browse/detail comparison. Foreign identities and relationships are fictional. */
export function FleetObjectStudy({ startAt }: Props) {
  return <Browse key={startAt} startAt={startAt} />
}

function Art({ item }: { item: ObjectSearchEntry }) {
  return item.kind === 'burn' ? <HudObjectThumbnail analyzed={false} /> : <HudObjectThumbnail kind={item.kind} />
}

function Browse({ startAt }: Props) {
  const [open, setOpen] = useState(true)
  const [queries, setQueries] = useState<Record<string, ObjectSearchValue>>({})
  const [selected, setSelected] = useState<string | null>(startAt === 'owned-fleet' ? 'peregrine' : null)
  const [tabs, setTabs] = useState<Record<string, FleetTab>>({})
  const [command, setCommand] = useState<FleetCommand | null>(null)
  const item = items.find(item => item.id === selected)
  const owned = item?.category === 'owned'
  const model = <div data-slot="model-preview"><SpacecraftPreview kind="ship" objectId="fleet-card-study-peregrine" label="Peregrine generalist ship" showInstructions={false} accentColor={0x91d9ec} /></div>
  const activity = <HudSection><HudHeading variant="section">Attached · ready</HudHeading><HudText variant="secondary">Nereid outer belt · Solace system</HudText></HudSection>
  const facts = <HudFacts layout="columns" items={[
    { label: 'Fuel', value: <HudValue>24 t</HudValue> }, { label: 'Free hold', value: <HudValue>80 t</HudValue> },
    { label: 'Ships', value: <HudValue>3 generalists</HudValue> },
  ]} />
  const identity = item && <div className={styles.identity}><Art item={item} /><div><HudHeading size="compact">{item.name}</HudHeading><HudText variant="secondary">{item.subtitle}</HudText></div></div>
  const back = () => { if (command) setCommand(null); else setSelected(null) }
  const searchContext = command ?? 'objects'
  const eligible = command ? items.filter(target => command === 'Mine' ? isObjectSearchResourceSite(target) : command === 'Dock' ? target.kind === 'station' : target.kind === 'station' || isObjectSearchResourceSite(target)) : items
  const body = !item ? null : owned ? <>
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
    {!item || command ? <ObjectSearchCard showPresets={command !== 'Travel' && command !== 'Mine'} hidden={!open} className={styles.card}
      title={command === 'Mine' || command === 'Travel' ? { search: command === 'Mine' ? 'mining-target' : 'travel-destination', scope: 'Solace', fleet: item?.name }
        : command ? `${item?.name} · ${command === 'Dock' ? 'Choose station' : 'Choose analysis target'} · Solace` : { search: 'objects', scope: 'Solace' }}
      items={eligible} value={queries[searchContext] ?? emptyObjectSearch} onChange={value => setQueries(previous => ({ ...previous, [searchContext]: value }))}
      onSelect={id => { setSelected(id); setCommand(null) }} onBack={command ? back : undefined} backDestination="fleet" onClose={() => setOpen(false)} />
    : <HudCardShell hidden={!open} paused={!open} title={owned ? `${item.name} · Fleet` : item.name} className={styles.card} onClose={() => setOpen(false)} closeLabel="Close objects">
      <HudCardBack destination="objects" onClick={back} />
      {body}
    </HudCardShell>}
  </main>
}
