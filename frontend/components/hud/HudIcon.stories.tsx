import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ArrowLeftIcon, ChevronDownIcon, FunnelIcon, InformationCircleIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { HudCardShell } from './HudCardShell'
import { HudIcon } from './HudIcon'
import { HudHeading, HudText } from './HudTypography'
import styles from './hud-icon.stories.module.css'

const utilities = [
  { label: 'Back', icon: ArrowLeftIcon },
  { label: 'Search', icon: MagnifyingGlassIcon },
  { label: 'Filter', icon: FunnelIcon },
  { label: 'Expand', icon: ChevronDownIcon },
  { label: 'Info', icon: InformationCircleIcon },
  { label: 'Close', icon: XMarkIcon },
] as const

const meta = {
  id: 'hud-icons', title: 'Foundations/Icons',
  component: HudIcon,
  tags: ['autodocs', 'catalog'],
  args: { icon: ArrowLeftIcon, size: 20 },
  argTypes: { icon: { control: false }, size: { control: 'radio', options: [16, 20, 24] } },
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' },
    docs: { description: { component: 'A — Light outline, using existing Heroicons 24px outline assets at their native 1.5-unit stroke. The 20px display has a 1.25px effective stroke. Icons inherit text color and are decorative by default; interactive controls need accessible labels. Game-object artwork and button design remain separate.' } },
  },
  decorators: [(Story) => <div className={`dark ${styles.stage}`}><Story /></div>],
} satisfies Meta<typeof HudIcon>

export default meta
type Story = StoryObj<typeof meta>

export const Utilities: Story = {
  render: ({ size }) => (
    <HudCardShell title="Utility icons" className={styles.card}>
      <ul className={styles.gallery}>
        {utilities.map(({ label, icon }) => (
          <li key={label} className={styles.sample}>
            <HudIcon icon={icon} size={size ?? 20} />
            <HudText variant="caption">{label}</HudText>
          </li>
        ))}
      </ul>
    </HudCardShell>
  ),
}

export const Sizes: Story = {
  render: () => (
    <HudCardShell title="Icon sizes" className={styles.card}>
      {([16, 20, 24] as const).map(size => (
        <div key={size} className={styles.sizeGroup}>
          <HudHeading variant="section">{size}px</HudHeading>
          <ul className={styles.gallery}>
            {utilities.map(({ label, icon }) => (
              <li key={label} className={styles.sample}>
                <HudIcon icon={icon} size={size} />
                <HudText variant="caption">{label}</HudText>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </HudCardShell>
  ),
}

export const WithText: Story = {
  render: () => (
    <HudCardShell title="Icon and text" className={styles.card}>
      <HudText variant="caption">Text alignment samples</HudText>
      {utilities.map(({ label, icon }) => (
        <div key={label} className={styles.textSample}>
          <HudIcon icon={icon} />
          <HudText>{label}</HudText>
        </div>
      ))}
    </HudCardShell>
  ),
}
