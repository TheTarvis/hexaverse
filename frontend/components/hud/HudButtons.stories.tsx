import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ArrowLeftIcon, MagnifyingGlassIcon, Cog6ToothIcon, TrashIcon } from '@heroicons/react/24/outline'
import { HudBackButton, HudButton, HudIconButton } from './HudControls'
import { HudActionBand } from './HudActionBand'
import { HudHeading, HudText } from './HudTypography'
import styles from './hud-buttons.stories.module.css'

function ButtonStudy() {
  const [chosen, setChosen] = useState(false)
  const [notice, setNotice] = useState('')
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}><HudHeading level={1}>Buttons and navigation</HudHeading><HudText variant="secondary">Actual shared controls: Lens actions, Back navigation, structured targets and request states. Changes to HudControls update consumers.</HudText></header>
    <section className={styles.samples} aria-label="Crystal control variants"><HudHeading size="compact">Shared variants</HudHeading>
      <div className={styles.row}><HudButton appearance="crystal" variant="primary" onClick={() => setNotice('Primary action')}>Primary action</HudButton><HudButton appearance="crystal" onClick={() => setNotice('Secondary action')}>Secondary action</HudButton><HudButton appearance="crystal" variant="quiet" onClick={() => setNotice('Quiet action')}>Quiet action</HudButton></div>
      <div className={styles.row}><HudBackButton destination="objects" onClick={() => setNotice('Back')} /><HudIconButton appearance="crystal" variant="secondary" icon={MagnifyingGlassIcon} label="Search" onClick={() => setNotice('Search')} /><HudIconButton appearance="crystal" variant="secondary" icon={Cog6ToothIcon} label="Settings" onClick={() => setNotice('Settings')} /><HudButton appearance="crystal" aria-pressed={chosen} onClick={() => setChosen(value => !value)}>Selected toggle</HudButton></div>
      <div className={styles.row}><HudButton appearance="crystal" disabled>Unavailable</HudButton><HudButton appearance="crystal" variant="primary" pending pendingLabel="Applying…">Apply changes</HudButton><HudIconButton appearance="crystal" variant="secondary" icon={MagnifyingGlassIcon} label="Searching" pending /><HudButton appearance="crystal" variant="primary" onClick={() => setNotice('Long label activated')}>Open outer-system expedition fleet</HudButton></div>
      <HudHeading size="compact">One shared action interface</HudHeading>
      <div className={styles.row}>
        <HudButton href="/" target="_blank" rel="noreferrer">Open galaxy</HudButton>
        <HudButton href="/" disabled>Unavailable link</HudButton>
        <HudIconButton href="/" icon={ArrowLeftIcon} label="Galaxy link" />
      </div>
      <div className={styles.row}>
        <HudButton presentation="row" aria-pressed={chosen} onClick={() => setChosen(value => !value)}>Structured fleet row · selected state</HudButton>
        <HudIconButton presentation="chrome" icon={Cog6ToothIcon} label="Chrome settings example" onClick={() => setNotice('Chrome settings preview')} />
        <HudButton presentation="map" aria-label="Map target example" onClick={() => setNotice('Map target preview')}>◎</HudButton>
      </div>
      <HudHeading size="compact">Cancel, interrupt and destructive actions</HudHeading>
      <HudText variant="secondary">Cancel leaves an uncommitted choice. Stop interrupts an active order. Destructive actions name what will be removed.</HudText>
      <div className={styles.row}>
        <HudButton appearance="crystal" onClick={() => setNotice('Cancelled this preview choice.')}>Cancel</HudButton>
        <HudButton appearance="crystal" tone="danger" onClick={() => setNotice('Stop travel preview only.')}>Stop travel</HudButton>
        <HudButton appearance="crystal" variant="primary" tone="danger" onClick={() => setNotice('Delete preset preview only. Nothing was deleted.')}>Delete preset</HudButton>
        <HudIconButton appearance="crystal" variant="secondary" tone="danger" icon={TrashIcon} label="Delete preset icon" onClick={() => setNotice('Delete preset icon preview only.')} />
      </div>
      <div className={styles.row}>
        <HudButton appearance="crystal" pending pendingLabel="Working…">Neutral task</HudButton>
        <HudButton appearance="crystal" tone="danger" pending pendingLabel="Stopping…">Stop travel</HudButton>
        <HudButton appearance="crystal" variant="primary" tone="danger" pending pendingLabel="Deleting…">Delete preset</HudButton>
        <HudButton appearance="crystal" tone="danger" disabled>Delete unavailable</HudButton>
      </div>
      <HudText variant="label">Destructive footer</HudText>
      <HudActionBand label="Destructive example actions" actions={[
        { id: 'cancel', label: 'Cancel', onClick: () => setNotice('Kept the preview preset.') },
        { id: 'delete', label: 'Delete preset', tone: 'danger', onClick: () => setNotice('Destructive footer preview only. Nothing was deleted.') },
      ]} />
      <HudText role="status" variant="caption">{notice || 'Hover, press or Tab through the controls. Material facets stay still; working buttons show a diagonal sweep.'}</HudText>
    </section>
  </main>
}
const meta = { id: 'hud-buttons', title: 'Foundations/Controls/Buttons', tags: ['catalog'], component: ButtonStudy, parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen' } } satisfies Meta<typeof ButtonStudy>
export default meta
type Story = StoryObj<typeof meta>
export const SmokedCrystal: Story = { name: 'States and behavior' }
