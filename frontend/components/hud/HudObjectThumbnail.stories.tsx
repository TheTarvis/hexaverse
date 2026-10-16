import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { HudCardShell } from './HudCardShell'
import { HudObjectThumbnail, type HudObjectKind } from './HudObjectThumbnail'
import { HudHeading, HudText } from './HudTypography'
import styles from './hud-object-thumbnail.stories.module.css'

// Storybook controls describe the known-object branch; unresolved stories
// render the separate, kind-free branch explicitly.
const meta: Meta<{ kind: HudObjectKind; alt?: string }> = {
  title: 'HUD/Object Thumbnails',
  component: HudObjectThumbnail,
  tags: ['autodocs'],
  args: { kind: 'fleet' },
  parameters: {
    docs: { description: { component: 'C2 — 32px static thumbnails, using 128px transparent sources rendered offline from existing game art. Representative category images rather than per-object portraits. Decorative beside names; supply alt for standalone images. No model loading, canvas or GPU renderer is created by this component. These examples do not settle fleet-list composition.' } },
  },
  argTypes: { kind: { control: 'select', options: ['fleet', 'station', 'rocky', 'resource-site', 'star', 'gas_giant', 'ice', 'moon'] } },
  decorators: [(Story) => <div className={`dark ${styles.stage}`}><Story /></div>],
}

export default meta
type Story = StoryObj<typeof meta>

const objects: { kind: HudObjectKind; name: string; description: string }[] = [
  { kind: 'fleet', name: 'Peregrine', description: 'Fleet · 3 ships' },
  { kind: 'station', name: 'Aurelia Station', description: 'Station · Orbital' },
  { kind: 'rocky', name: 'Rocky world', description: 'Surface body' },
  { kind: 'resource-site', name: 'Resource site', description: 'Asteroid field' },
]

const celestialObjects: typeof objects = [
  { kind: 'star', name: 'Star', description: 'G-class representative' },
  { kind: 'rocky', name: 'Rocky world', description: 'Rocky surface' },
  { kind: 'gas_giant', name: 'Gas giant', description: 'Cloud bands' },
  { kind: 'ice', name: 'Ice world', description: 'Icy surface' },
  { kind: 'moon', name: 'Moon', description: 'Lunar surface' },
]

function ObjectSample({ narrow = false, longName = false, analyzed = true, entries = objects }: { narrow?: boolean; longName?: boolean; analyzed?: boolean; entries?: typeof objects }) {
  return (
    <HudCardShell title={analyzed ? 'Object thumbnails' : 'Not analyzed'} lighting="none" className={`${styles.card} ${narrow ? styles.narrow : ''}`}>
      <ul className={styles.list}>
        {entries.map(({ kind, name, description }) => (
          <li key={kind} className={styles.row}>
            {analyzed ? <HudObjectThumbnail kind={kind} /> : <HudObjectThumbnail analyzed={false} />}
            <div className={styles.identity}>
              <HudHeading size="compact">{!analyzed ? 'Unresolved contact' : longName && kind === 'station' ? 'Aurelia Outer System Research Anchorage' : name}</HudHeading>
              <HudText variant="secondary">{analyzed ? description : 'Not analyzed'}</HudText>
            </div>
          </li>
        ))}
      </ul>
    </HudCardShell>
  )
}

export const Objects: Story = { render: () => <ObjectSample /> }
export const Narrow: Story = { render: () => <ObjectSample narrow /> }
export const LongName: Story = { render: () => <ObjectSample narrow longName /> }
export const Comparison: Story = {
  render: () => (
    <div className={styles.comparison}>
      <ObjectSample />
      <ObjectSample narrow longName />
    </div>
  ),
}

export const Standalone: Story = {
  args: { alt: 'Fleet category' },
  render: args => <HudCardShell title="Thumbnail" lighting="none" className={styles.narrow}><HudObjectThumbnail {...args} /></HudCardShell>,
}

export const Unanalyzed: Story = {
  parameters: { docs: { description: { story: 'D — Diffuse return means not analyzed. The same anonymous appearance is used for every undisclosed category. Detection, stealth, transponders and continued tracking are separate domain decisions.' } } },
  render: () => <ObjectSample narrow analyzed={false} />,
}

export const AnalysisStates: Story = {
  parameters: { docs: { description: { story: 'Visual state comparison only: unresolved detections become recognizable category thumbnails after analysis. This story does not implement Sweep/Analyze actions or persistent visibility.' } } },
  render: () => (
    <div className={styles.comparison}>
      <ObjectSample narrow analyzed={false} />
      <ObjectSample narrow />
    </div>
  ),
}

export const UnanalyzedStandalone: Story = {
  render: () => (
    <HudCardShell title="Unresolved" lighting="none" className={styles.narrow}>
      <HudObjectThumbnail analyzed={false} alt="Unanalyzed object" />
    </HudCardShell>
  ),
}

export const CelestialBodies: Story = { render: () => <ObjectSample entries={celestialObjects} /> }

export const CelestialComparison: Story = {
  render: () => (
    <div className={styles.comparison}>
      <ObjectSample entries={celestialObjects} />
      <ObjectSample entries={celestialObjects} narrow />
    </div>
  ),
}

export const ImageUnavailable: Story = {
  parameters: { docs: { description: { story: 'The middle row makes a real missing-image request. Its known name/type remain visible beside a muted Photo icon. The unanalyzed row retains its separate diffuse return.' } } },
  render: () => (
    <HudCardShell title="Image fallback" lighting="none" className={styles.narrow}>
      <ul className={styles.list}>
        <li className={styles.row}>
          <HudObjectThumbnail kind="fleet" />
          <div className={styles.identity}><HudHeading size="compact">Peregrine</HudHeading><HudText variant="secondary">Fleet · 3 ships</HudText></div>
        </li>
        <li className={styles.row}>
          <HudObjectThumbnail kind="station" alt="Station thumbnail" />
          <div className={styles.identity}><HudHeading size="compact">Aurelia Station</HudHeading><HudText variant="secondary">Station · Orbital</HudText></div>
        </li>
        <li className={styles.row}>
          <HudObjectThumbnail analyzed={false} />
          <div className={styles.identity}><HudHeading size="compact">Unresolved contact</HudHeading><HudText variant="secondary">Not analyzed</HudText></div>
        </li>
      </ul>
    </HudCardShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thumbnail = canvas.getByRole('img', { name: /Station thumbnail/ })
    const image = thumbnail.querySelector('img')!
    // Request a genuinely missing resource, exercising the normal error path
    // without adding a fake failure prop to the production component.
    image.src = '/__hud-missing-thumbnail__.png'
    await expect(await canvas.findByRole('img', { name: 'Station thumbnail — image unavailable' })).toBeVisible()
    await expect(canvas.getByText('Aurelia Station')).toBeVisible()
    await expect(canvas.getByText('Station · Orbital')).toBeVisible()
  },
}
