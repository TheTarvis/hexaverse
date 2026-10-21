import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import clsx from 'clsx'
import { HudBackButton } from './HudControls'
import { HudHeading, HudText } from './HudTypography'
import { HudCardShell, type HudCardShellProps } from './HudCardShell'
import styles from './hud-card-shell.stories.module.css'
import originalChrome from './__fixtures__/original-card-chrome.json'

type StoryArgs = HudCardShellProps & {
  showClose: boolean
  showContentBounds: boolean
}

const meta = {
  title: 'HUD/Card Shell',
  component: HudCardShell,
  tags: ['autodocs'],
  args: {
    title: 'Inspector',
    onClose: fn(),
    closeLabel: 'Close inspector',
    showClose: true,
    showContentBounds: false,
    lighting: 'signal',
    paused: false,
    style: { width: 320, maxWidth: '100%', height: 440 },
  },
  argTypes: {
    title: { control: 'text' },
    showClose: { control: 'boolean' },
    showContentBounds: { control: 'boolean' },
    lighting: { control: 'radio', options: ['signal', 'none'] },
    paused: { control: 'boolean' },
    onClose: { control: false },
    children: { control: false },
    contentClassName: { control: false },
    className: { control: false },
  },
  decorators: [
    (Story) => <div className={clsx('dark', styles.stage)}><Story /></div>,
  ],
  render: ({ showClose, showContentBounds, onClose, contentClassName, ...args }) => (
    <HudCardShell
      {...args}
      {...(showClose && onClose ? { onClose } : {})}
      contentClassName={clsx(contentClassName, showContentBounds && styles.contentBounds)}
    />
  ),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

export const Tall: Story = {}

// Plain is the standard empty card, including its shared signal lighting.
export const Plain: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="hud-frame-lighting"]')).not.toBeNull()
  },
}

/** Explicit CSS-only comparison; renderer failure retains this same static frame. */
export const StaticFrame: Story = { args: { lighting: 'none' } }

export const Wide: Story = {
  args: {
    title: 'Travel review',
    closeLabel: 'Close travel review',
    style: { width: 560, maxWidth: '100%', height: 240 },
  },
}

export const Headerless: Story = {
  args: {
    title: '',
    'aria-label': 'Quick actions',
    showClose: false,
    style: { width: 560, maxWidth: '100%', minHeight: 88 },
  },
}

export const Narrow: Story = {
  args: {
    style: { width: 280, maxWidth: '100%', height: 380 },
  },
}

export const LongTitle: Story = {
  args: {
    title: 'An exceptionally long inspected object title',
  },
}

export const ScrollingContent: Story = {
  args: {
    title: 'Scroll study',
    closeLabel: 'Close scroll study',
    style: { width: 320, maxWidth: '100%', height: 300 },
    children: Array.from({ length: 12 }, (_, index) => (
      <p key={index} className={styles.sampleRow}>
        Sample content {index + 1}
      </p>
    )),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shell = canvas.getByRole('region', { name: 'Scroll study' })
    const viewport = canvas.getByText('Sample content 1').parentElement!
    const frameWidth = parseFloat(getComputedStyle(shell).getPropertyValue('--hud-frame-width'))
    try {
      viewport.scrollTop = viewport.scrollHeight / 2
      const bounds = viewport.getBoundingClientRect()
      const frame = shell.getBoundingClientRect()
      // The clipping boundary meets the inner frame; content padding scrolls away.
      await expect(bounds.top - frame.top).toBeCloseTo(frameWidth, 0)
      await expect(frame.bottom - bounds.bottom).toBeCloseTo(frameWidth, 0)
      await expect(getComputedStyle(viewport).clipPath).not.toBe('none')
      await expect(viewport.scrollTop).toBeGreaterThan(0)
    } finally {
      viewport.scrollTop = 0
    }
  },
}

export const SizeComparison: Story = {
  render: ({ showClose, showContentBounds, onClose, lighting = 'signal', paused = false }) => {
    const closeProps = showClose && onClose ? { onClose } : {}
    const contentClassName = showContentBounds ? styles.contentBounds : ''

    return (
      <div className={styles.comparison}>
        <HudCardShell
          title="Inspector"
          lighting={lighting}
          paused={paused}
          {...closeProps}
          closeLabel="Close inspector"
          contentClassName={contentClassName}
          className={styles.tall}
        />
        <div className={styles.stack}>
          <HudCardShell
            title="Travel review"
            lighting={lighting}
            paused={paused}
            {...closeProps}
            closeLabel="Close travel review"
            contentClassName={contentClassName}
            className={styles.wide}
          />
          <HudCardShell
            aria-label="Quick actions"
            lighting={lighting}
            paused={paused}
            contentClassName={contentClassName}
            className={styles.strip}
          />
        </div>
      </div>
    )
  },
  args: { showContentBounds: true },
}

export const NestedSections: Story = {
  args: { title: 'Command', lighting: 'none', style: { width: 360, height: 520 } },
  render: args => <HudCardShell {...args}>
    <HudCardShell title="Fleet actions" lighting="none"><HudHeading size="compact">Peregrine</HudHeading><HudText variant="secondary">Mining metals · 40 t free hold</HudText></HudCardShell>
    <HudCardShell title="Travel review" lighting="none"><HudText>One owning frame; travel and action sections retain their own meaning and controls.</HudText></HudCardShell>
  </HudCardShell>,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-hud-framing="frame"]')).toHaveLength(1)
    await expect(canvasElement.querySelectorAll('[data-hud-framing="section"]')).toHaveLength(2)
  },
}


export const OriginalChromeAlignment: Story = {
  args: {
    title: 'Objects',
    lighting: 'none',
    children: <><HudBackButton destination="objects" /><p>Back is an independent content action. The close control occupies only the right side of the header.</p></>,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('region', { name: 'Objects' })
    const title = canvas.getByRole('heading', { name: 'Objects' })
    const center = (element: Element) => { const bounds = element.getBoundingClientRect(); return bounds.left + bounds.width / 2 }
    await expect(Math.abs(center(title) - center(card))).toBeLessThan(1)
    const close = canvas.getByRole('button', { name: 'Close inspector' })
    await expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(close.getBoundingClientRect().left)
    for (const [node, expected] of [[title, originalChrome.title], [close, originalChrome.close], [close.querySelector('svg')!, originalChrome.icon]] as const) {
      const computed = getComputedStyle(node)
      for (const [property, value] of Object.entries(expected)) await expect(computed[property as keyof CSSStyleDeclaration]).toBe(value)
    }
    await expect(title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2).toBeCloseTo(card.getBoundingClientRect().top, 0)
    await userEvent.click(close)
    await expect(args.onClose).toHaveBeenCalled()
  },
}
