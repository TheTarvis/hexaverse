import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { HudCardBack, HudCardShell } from './HudCardShell'
import { HudActionBand } from './HudActionBand'
import { HudHeading, HudText } from './HudTypography'
import { HudFacts } from './HudFacts'
import { SpacecraftPreview } from '@/components/space/SpacecraftPreview'
import styles from './hud-card-shell.stories.module.css'

type Props = { longTitle: boolean; overflow: boolean }
const onBack = fn(), onReturnToMap = fn(), onStart = fn()

/** Accepted shared header, using the same shell on desktop and phone. */
function AcceptedCardHeader({ longTitle, overflow }: Props) {
  const title = longTitle ? 'Mine resources in the Nereid outer extraction field' : 'Mine resources'
  return <HudCardShell title={title} className={styles.mobileCard}
    style={{ width: '100%', height: '100%' }} onClose={onReturnToMap} closeLabel="Close mining"
    footer={<HudActionBand actions={[{ id: 'mine', label: 'Start mining', onClick: onStart }]} />}>
    <HudCardBack destination="resource" onClick={onBack} />
    <SpacecraftPreview kind="ship" objectId="header-comparison-seed" label="Generalist ship" accentColor={0x91d9ec} />
    <HudText variant="secondary">Nereid outer belt</HudText>
    <HudHeading size="compact">Peregrine</HudHeading>
    <HudText variant="secondary">3 generalist ships · attached here</HudText>
    <HudFacts layout="rows" items={[{ label: 'Resource', value: 'Iron' }, { label: 'Quantity', value: '24 t' }, { label: 'Estimated duration', value: '2m 00s' }]} />
    {overflow && Array.from({ length: 8 }, (_, index) => <HudText key={index}>Resource detail {index + 1} · Additional context inside the scrolling body.</HudText>)}
  </HudCardShell>
}

const meta = {
  id: 'hud-mobile-header', title: 'Foundations/Cards/Task header', tags: ['catalog'],
  component: AcceptedCardHeader,
  globals: { viewport: { value: 'phoneFit', isRotated: false } },
  args: { longTitle: false, overflow: false },
  argTypes: {
    longTitle: { name: 'Long title', control: 'boolean' },
    overflow: { name: 'Overflowing content', control: 'boolean' },
  },
  decorators: [(Story) => <div className={`dark ${styles.stage}`}><Story /></div>],
  parameters: {
    catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' },
    layout: 'fullscreen',
    docs: { description: { component: 'Accepted shared task header: title in the plaque, inset Back left and Close right aligned on one row, on every viewport. Navigation does not reserve a separate strip over a model-first body. Model reset stays bottom-right. Back returns to the resource; Close dismisses without cancelling an order. Fictional mining facts and callbacks only; use Controls for long titles and overflow.' } },
  },
} satisfies Meta<typeof AcceptedCardHeader>

export default meta
type Story = StoryObj<typeof meta>
// Preserve the reviewed URL while retiring discarded executable options.
export const Compare: Story = { name: 'Accepted' }
