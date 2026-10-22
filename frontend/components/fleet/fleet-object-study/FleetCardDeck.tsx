'use client'

import { ArrowUpRightIcon, BeakerIcon, CubeIcon, ArrowRightEndOnRectangleIcon, ShieldExclamationIcon, BoltIcon } from '@heroicons/react/24/outline'
import { HudCardTabs } from '@/components/hud/HudCardTabs'
import { HudButton } from '@/components/hud/HudControls'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudProgress } from '@/components/hud/HudProgress'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import styles from './fleet-object-study.module.css'

export type FleetTab = 'cargo' | 'actions' | 'stats'
export type FleetCommand = 'Travel' | 'Mine' | 'Dock' | 'Analyze'

/** Fictional fleet data; the shared tab interaction is ready for other card consumers. */
export function FleetCardDeck({ tab, onTab, onCommand }: { tab: FleetTab; onTab: (tab: FleetTab) => void; onCommand: (command: FleetCommand) => void }) {
  const commands = [
    { label: 'Travel', icon: ArrowUpRightIcon }, { label: 'Mine', icon: CubeIcon },
    { label: 'Dock', icon: ArrowRightEndOnRectangleIcon }, { label: 'Analyze', icon: BeakerIcon },
    { label: 'Attack', icon: ShieldExclamationIcon, reason: 'Requires weapons' }, { label: 'Jump', icon: BoltIcon, reason: 'Attach to a gate' },
  ] as const
  return <HudCardTabs label="Fleet information" value={tab} onChange={value => onTab(value as FleetTab)} tabs={[
    { id: 'cargo', label: 'Cargo', content: <div className={styles.deckContent}>
      <HudFacts layout="rows" items={[{ label: 'Fuel', value: <HudValue>24 t</HudValue> }, { label: 'Iron', value: <HudValue>16 t</HudValue> }]} />
      <HudHeading variant="section">Cargo capacity</HudHeading>
      <HudProgress label="Cargo capacity used" value={40} max={120} />
      <div className={styles.capacity}><HudText>40 / 120 t used</HudText><HudText variant="secondary">80 t free</HudText></div>
    </div> },
    { id: 'actions', label: 'Actions', content: <div className={styles.commandGrid}>{commands.map(command => {
      const reason = 'reason' in command ? command.reason : undefined
      return <HudButton key={command.label} className={styles.command} disabled={!!reason} aria-describedby={reason ? `fleet-study-${command.label}-reason` : undefined} onClick={() => { if (!reason) onCommand(command.label as FleetCommand) }}>
        <HudIcon icon={command.icon} size={24} /><span className={styles.commandText}><span>{command.label}</span>{reason && <span id={`fleet-study-${command.label}-reason`} className="hud-type-caption">{reason}</span>}</span>
      </HudButton>
    })}</div> },
    { id: 'stats', label: 'Ship stats', content: <div className={styles.deckContent}>
      <HudHeading variant="section">Composition</HudHeading>
      <div className={styles.composition}><HudObjectThumbnail kind="fleet" /><HudText>Generalist</HudText><HudValue>×3</HudValue></div>
      <HudHeading variant="section">Combined capabilities</HudHeading>
      <HudFacts layout="rows" items={[{ label: 'Hold capacity', value: <HudValue>120 t</HudValue> }, { label: 'Mining rate', value: <HudValue>12 t/min</HudValue> }, { label: 'Weapons', value: 'None' }]} />
    </div> },
  ]} />
}
