import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import clsx from 'clsx'
import { HudHeading, HudText } from './HudTypography'
import { HudCardBack, HudCardShell, type HudCardShellProps } from './HudCardShell'
import { HudActionBand } from './HudActionBand'
import styles from './hud-card-shell.stories.module.css'
import originalChrome from './__fixtures__/original-card-chrome.json'

type StoryArgs = HudCardShellProps & {
  showClose: boolean
  showBack: boolean
  showContentBounds: boolean
  mobileOverflow?: boolean
}

function ShellExample({ showClose, showBack, showContentBounds, onClose, contentClassName, mobileOverflow, children, ...args }: StoryArgs) {
  return (
    <HudCardShell
      {...args}
      {...(showClose && onClose ? { onClose } : {})}
      contentClassName={clsx(contentClassName, showContentBounds && styles.contentBounds)}
    >
      {showBack && <HudCardBack destination="objects" onClick={fn()} />}
      {children}
      {mobileOverflow && Array.from({ length: 12 }, (_, index) => <HudText key={index}>Detail group {index + 1} · Additional settings and explanations inside the scrolling card body.</HudText>)}
    </HudCardShell>
  )
}

const meta = {
  id: 'hud-card-shell', title: 'Foundations/Cards/Shell',
  component: HudCardShell,
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' } },
  tags: ['autodocs', 'catalog'],
  args: {
    title: 'Inspector',
    onClose: fn(),
    closeLabel: 'Close inspector',
    showClose: true,
    showBack: true,
    showContentBounds: false,
    lighting: 'signal',
    paused: false,
    style: { width: 320, maxWidth: '100%', height: 440 },
  },
  argTypes: {
    title: { control: 'text' },
    showClose: { control: 'boolean' },
    showBack: { control: 'boolean' },
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
  render: args => <ShellExample {...args} />,
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

export const Tall: Story = {}

/** Isolated card foundation; workspace navigation is deliberately not composed here. */
export const Mobile: Story = {
  globals: { viewport: { value: 'phoneFit', isRotated: false } },
  args: {
    title: 'Card foundation', showClose: true, mobileOverflow: false,
    className: styles.mobileCard,
    style: { width: '100%', height: '100%' },
    footer: <HudActionBand actions={[{ id: 'apply', label: 'Apply changes', onClick: fn() }]} />,
    children: <><HudHeading variant="section">Scrolling body</HudHeading><HudText>Card content sits between the shared header and action footer.</HudText><HudText variant="secondary">The header and footer stay reachable while this body scrolls.</HudText></>,
  },
  argTypes: {
    mobileOverflow: { name: 'Overflowing content', control: 'boolean' },
    header: { control: false }, footer: { control: false }, style: { control: false },
  },
  parameters: { docs: { description: { story: 'The shared card at 414px phone width and the available Storybook canvas height, so header/body/footer fit above the Controls panel. This is a responsive phone-width specimen, not a fixed 414×896 device capture. No workspace panel tabs or Return to map toolbar. Toggle overflow in Storybook Controls. Workspace mobile navigation remains a separate design review.' } } },
}

// Plain is the standard empty card, including its shared signal lighting.
export const Plain: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="hud-frame-lighting"]')).not.toBeNull())
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
    showBack: false,
    style: { width: 560, maxWidth: '100%', minHeight: 88 },
  },
}

export const Narrow: Story = {
  args: {
    style: { width: 280, maxWidth: '100%', height: 380 },
  },
}

export const LongTitle: Story = {
  parameters: { docs: { description: { story: 'Shared title overflow: the plaque keeps its lettering size and pans overflowing text with pauses at each end. Hover pauses movement; reduced-motion uses static ellipsis. This uses the same shell as every other card.' } } },
  args: {
    title: 'An exceptionally long inspected object title',
  },
}

export const TaskTitle: Story = {
  args: { title: { fleet: 'Peregrine', action: 'travel', object: 'Nereid outer belt' } },
  argTypes: { title: { control: 'object' } },
  parameters: { docs: { description: { story: 'Task cards supply fleet, action and object as structured title data. The shell owns wording and overflow. Remove fleet to preview entry before selection; change action between travel and mining to preview the shared wording policy.' } } },
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
  render: ({ style: _style, className: _className, ...args }) => <div className={styles.comparison}>
    <ShellExample {...args} title="Inspector" closeLabel="Close inspector" className={styles.tall} />
    <div className={styles.stack}>
      <ShellExample {...args} title="Travel review" closeLabel="Close travel review" className={styles.wide} />
      <ShellExample {...args} title="" aria-label="Quick actions" showBack={false} showClose={false} className={styles.strip} />
    </div>
  </div>,
  args: { showContentBounds: true },
}

export const NestedSections: Story = {
  args: { title: 'Command', style: { width: 360, height: 520 }, children: <>
    <HudCardShell title="Fleet actions"><HudHeading size="compact">Peregrine</HudHeading><HudText variant="secondary">Mining metals · 40 t free hold</HudText></HudCardShell>
    <HudCardShell title="Travel review"><HudText>One owning frame; travel and action sections retain their own meaning and controls.</HudText></HudCardShell>
  </> },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-hud-framing="frame"]')).toHaveLength(1)
    await expect(canvasElement.querySelectorAll('[data-hud-framing="section"]')).toHaveLength(2)
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-slot="hud-frame-lighting"]')).toHaveLength(1))
  },
}


export const OriginalChromeAlignment: Story = {
  args: {
    title: 'Objects',
    paused: true,
    children: <p>Back and Close share one inset header; the plaque retains the title.</p>,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('region', { name: 'Objects' })
    const title = canvas.getByRole('heading', { name: 'Objects' })
    const center = (element: Element) => { const bounds = element.getBoundingClientRect(); return bounds.left + bounds.width / 2 }
    await expect(Math.abs(center(title) - center(card))).toBeLessThan(1)
    const close = canvas.getByRole('button', { name: 'Close inspector' })
    const back = canvas.getByRole('button', { name: 'Back to objects' })
    await expect(close.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
    await expect(back.getBoundingClientRect().top).toBeCloseTo(close.getBoundingClientRect().top, 0)
    await expect(close.getBoundingClientRect().right).toBeLessThan(card.getBoundingClientRect().right)
    for (const [node, expected] of [[title, originalChrome.title]] as const) {
      const computed = getComputedStyle(node)
      for (const [property, value] of Object.entries(expected)) await expect(computed[property as keyof CSSStyleDeclaration]).toBe(value)
    }
    await expect(title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2).toBeCloseTo(card.getBoundingClientRect().top, 0)
    await userEvent.click(close)
    await expect(args.onClose).toHaveBeenCalled()
  },
}
