import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { ArrowLeftIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { HudCardShell } from './HudCardShell'
import { HudButton, HudIconButton, HudSearchInput, HudSelect } from './HudControls'
import { HudIcon } from './HudIcon'
import { HudFacts } from './HudFacts'
import { HudHeading, HudText, HudValue } from './HudTypography'
import styles from './hud-typography.stories.module.css'

const meta = {
  title: 'HUD/Typography',
  component: HudHeading,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: 'Shared HUD foundation: geometric identity headings, sans body copy, cyan labels, tabular figures and outline icons. Edit hud-tokens.css for font roles, colors, icon sizes and compact control defaults. HudControls adapts Catalyst; the game and these examples consume the same defaults. Compact controls are under visual review.' } },
  },
  decorators: [(Story) => <div className={`dark ${styles.stage}`}><Story /></div>],
} satisfies Meta<typeof HudHeading>

export default meta
type Story = StoryObj<typeof meta>

function TravelSample({ narrow = false, longNames = false, ellipsis = false }: { narrow?: boolean; longNames?: boolean; ellipsis?: boolean }) {
  const fleetName = longNames ? 'Peregrine Deep Space Expedition' : 'Peregrine'
  const destinationName = longNames ? 'Aurelia Outer System Research Anchorage' : 'Aurelia Station'
  const nameProps = {
    size: longNames && !ellipsis ? 'compact' as const : 'default' as const,
    ...(ellipsis ? { className: styles.ellipsis } : {}),
  }
  return (
    <HudCardShell title="Travel review" className={`${styles.card} ${narrow ? styles.narrow : ''}`}>
      <div className={styles.group}>
        <HudText variant="label">Command fleet</HudText>
        <HudHeading {...nameProps} title={fleetName}>{fleetName}</HudHeading>
        <HudText variant="secondary">3 ships · Ready</HudText>
      </div>
      <div className={styles.section}>
        <HudHeading variant="section" level={4}>Destination</HudHeading>
        <HudHeading {...nameProps} title={destinationName}>{destinationName}</HudHeading>
        <HudText>Review the trip before issuing an order.</HudText>
      </div>
      <div className={styles.section}>
        <HudHeading variant="section" level={4}>Trip estimate</HudHeading>
        <dl className={styles.facts}>
          <dt><HudText variant="secondary">Arrival</HudText></dt>
          <dd><HudValue>3m 12s</HudValue></dd>
          <dt><HudText variant="secondary">Fuel cost</HudText></dt>
          <dd><HudValue>12.4 t</HudValue></dd>
          <dt><HudText variant="secondary">Fuel remaining</HudText></dt>
          <dd><HudValue>58.9 t</HudValue></dd>
        </dl>
      </div>
      <HudText variant="caption">Estimate for {fleetName} → {destinationName}</HudText>
    </HudCardShell>
  )
}

export const TravelReview: Story = { render: () => <TravelSample /> }
export const Narrow: Story = { render: () => <TravelSample narrow /> }
export const LongNames: Story = { render: () => <TravelSample narrow longNames /> }

export const LongNameComparison: Story = {
  render: () => (
    <div className={styles.comparison}>
      <div className={styles.option}>
        <HudText variant="label">Smaller, full name</HudText>
        <TravelSample narrow longNames />
      </div>
      <div className={styles.option}>
        <HudText variant="label">Original size, ellipsis</HudText>
        <TravelSample narrow longNames ellipsis />
      </div>
    </div>
  ),
}

export const NameLengthStudy: Story = {
  render: () => (
    <div className={styles.comparison}>
      {[32, 40, 60, 200].map(length => (
        <div key={length} className={styles.option}>
          <HudText variant="label">{length} characters{length === 200 ? ' · outlier' : ''}</HudText>
          <HudCardShell title="Naming stress test" className={`${styles.narrow} ${styles.bounded}`}>
            <HudText variant="label">Wide, unbroken name</HudText>
            <HudHeading size="compact">{'W'.repeat(length)}</HudHeading>
            <HudText variant="secondary">All characters remain available by scrolling.</HudText>
            <HudHeading variant="section" level={4}>Trip estimate</HudHeading>
            <HudValue>3m 12s · 12.4 t</HudValue>
            <HudText>Trip details remain reachable below the name.</HudText>
          </HudCardShell>
        </div>
      ))}
    </div>
  ),
}

const textEntries = [
  { name: 'Reference sample', quantity: '12', state: 'Available', value: '71.3 t' },
  { name: 'Extended reference entry with a full name', quantity: '4', state: 'In progress', value: '28.4 t' },
  { name: 'Secondary sample', quantity: '2', state: 'Complete', value: '42.8 t' },
  { name: 'Final sample', quantity: '8', state: 'Waiting', value: '8.6 t' },
] as const

function StructuredListSample({ narrow = false, stress = false }: { narrow?: boolean; stress?: boolean }) {
  const entries = stress ? [
    { name: 'W'.repeat(40), quantity: '1,024', state: 'Awaiting confirmation', value: '1,234.5 t' },
    { name: 'A long derived reference name with a suffix', quantity: '99.9%', state: 'Information unavailable', value: '12h 34m' },
  ] : textEntries

  return (
    <HudCardShell title="Text list" className={`${styles.card} ${narrow ? styles.narrow : ''}`}>
      <ul className={styles.textList}>
        {entries.map(entry => (
          <li key={entry.name} className={styles.textEntry}>
            <HudHeading size="compact">{entry.name}</HudHeading>
            <HudFacts items={[
              { label: stress ? 'Reported quantity' : 'Quantity', value: <HudValue>{entry.quantity}</HudValue> },
              { label: stress ? 'Current availability' : 'State', value: <HudText>{entry.state}</HudText> },
              { label: stress ? 'Recorded measurement' : 'Value', value: <HudValue>{entry.value}</HudValue> },
            ]} />
          </li>
        ))}
      </ul>
    </HudCardShell>
  )
}

export const StructuredTextList: Story = {
  parameters: { docs: { description: { story: 'D — Structured: generic text-list hierarchy. Names, labels and values demonstrate typography; fleet list composition and interactions remain separate decisions.' } } },
  render: () => <StructuredListSample />,
}

export const StructuredTextListNarrow: Story = { render: () => <StructuredListSample narrow /> }

export const StructuredTextListLongContent: Story = { render: () => <StructuredListSample narrow stress /> }

export const StructuredTextListComparison: Story = {
  render: () => (
    <div className={styles.comparison}>
      <div className={styles.option}>
        <HudText variant="label">Standard card</HudText>
        <StructuredListSample />
      </div>
      <div className={styles.option}>
        <HudText variant="label">Narrow card</HudText>
        <StructuredListSample narrow />
      </div>
    </div>
  ),
}

export const TextRoles: Story = {
  render: () => (
    <HudCardShell title="Text roles" className={styles.card}>
      <div className={styles.samples}>
        <HudHeading>Peregrine</HudHeading>
        <HudHeading variant="section" level={4}>Section heading</HudHeading>
        <HudText>Body copy explains what the player can do next.</HudText>
        <HudText variant="secondary">Secondary context · 3 ships</HudText>
        <HudText variant="label">Command fleet</HudText>
        <HudValue>58.9 t · 3m 12s · 43%</HudValue>
        <HudText variant="caption">Supporting caption with a longer explanation that can wrap.</HudText>
      </div>
    </HudCardShell>
  ),
}

function FoundationSample() {
  const [scope, setScope] = useState('local')
  return <HudCardShell title="Shared foundations" className={styles.card} lighting="none">
    <div className={styles.samples}>
      <HudHeading size="compact">Peregrine</HudHeading>
      <HudText variant="secondary">One shared token source for typography, icons and HUD controls.</HudText>
      <div className={styles.controlRow}><HudIcon icon={ArrowLeftIcon} size={16} /><HudIcon icon={MagnifyingGlassIcon} /><HudIcon icon={ChevronDownIcon} size={24} /></div>
      <div className={styles.controlRow}><HudIconButton icon={ArrowLeftIcon} label="Back" /><HudText variant="secondary">Compact icon control</HudText></div>
      <HudSearchInput aria-label="Foundation search" placeholder="Search by name…" />
      <div className={styles.controlRow}><HudButton aria-pressed={scope === 'local'} onClick={() => setScope('local')}>This system</HudButton><HudButton aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All known systems</HudButton></div>
      <label className={styles.controlRow}><HudText variant="label">Activity</HudText><HudSelect aria-label="Foundation activity"><option>All</option><option>Ready</option></HudSelect></label>
      <div className={styles.controlRow}><HudButton variant="primary">Start travel</HudButton><HudButton disabled>Unavailable</HudButton></div>
      <HudText variant="caption">Touch layouts retain 44px targets and 16px input text.</HudText>
    </div>
  </HudCardShell>
}

export const SharedFoundations: Story = { render: () => <FoundationSample /> }
