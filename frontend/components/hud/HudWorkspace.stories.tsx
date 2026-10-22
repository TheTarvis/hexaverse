import { PHONE_HUD_QUERY } from '@/hooks/use-phone-sheet'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SceneNavigationAction } from './SceneNavigationAction'
import { HudWorkspace, type HudWorkspacePanel } from './HudWorkspace'
import { HudCardShell } from './HudCardShell'
import { HudActionBand } from './HudActionBand'
import { HudObjectThumbnail } from './HudObjectThumbnail'
import { HudSearchInput } from './HudControls'

const meta = {
  id: 'hud-workspace', title: 'Foundations/Workspace', tags: ['catalog'],
  component: Sample,
  args: { requestRevision: 0 },
  argTypes: { requestRevision: { name: 'Open fleets request', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to simulate an external request to open Fleets.' } },
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen', docs: { description: { component: 'HUD destinations use direct 44px icon controls on desktop and phone; phones repeat the same strip inside an open card. Docked layout around existing HUD content. Arrange with ordinary keyboard controls, show/hide panels, and reset local preferences. Panel contents remain mounted when moved or hidden. Navigation stays outside the customizable workspace. These stories use separate demonstration corporation storage keys.' } } },
} satisfies Meta<typeof Sample>
export default meta
type Story = StoryObj<typeof meta>

function Sample({ corporationId = 'storybook-workspace', fullNavigation = false, requestRevision = 0 }: { corporationId?: string; fullNavigation?: boolean; requestRevision?: number }) {
  const request = requestRevision > 0 ? { id: 'fleets' as const, sequence: requestRevision } : undefined
  const panels: HudWorkspacePanel[] = [
    { id: 'objects', label: 'Objects', children: <HudCardShell title="Known objects"><HudSearchInput aria-label="Find objects" placeholder="Find an object…" />{['gate', 'ruin', 'nebula'].map(kind => <div key={kind} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><HudObjectThumbnail kind={kind} /><span>{kind === 'gate' ? 'Gate to Borealis' : kind === 'ruin' ? 'Fractured array' : 'Veil nebula'}</span></div>)}</HudCardShell> },
    { id: 'fleets', label: 'Fleets', footer: <HudActionBand actions={[{ id: 'review-course', label: 'Review course', onClick: () => {} }]} />, children: <HudCardShell title="Peregrine"><p>Command fleet · Holding position</p><p>Inspecting an object keeps Peregrine selected for commands.</p></HudCardShell> },
  ]
  if (fullNavigation) panels.push({ id: 'fleet-status', label: 'Fleet status', children: <p>Selected fleet status</p> })
  return <div style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden', color: '#d5e7f1', background: 'radial-gradient(ellipse at 48% 43%, #1a3447, #071019 60%)' }}>
    <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Borealis · Peregrine · Fuel 84%</span></div>
    <HudWorkspace corporationId={corporationId} panels={panels} request={request} navigationAction={fullNavigation ? <SceneNavigationAction destination="system" systemName="Borealis" onEnter={() => {}} /> : undefined} />
  </div>
}

export const Docked: Story = {
  render: args => <Sample {...args} />,
  play: async ({ canvasElement }) => {
    if (window.matchMedia(PHONE_HUD_QUERY).matches) return
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox', { name: 'Find objects' })
    await userEvent.type(search, 'Borealis')
    await userEvent.click(canvas.getByRole('button', { name: /^Objects$/ }))
    await expect(search).not.toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Objects (hidden)' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Objects (hidden)' }))
    await expect(search).toHaveValue('Borealis')
    await userEvent.click(search)
    await userEvent.keyboard('{Escape}')
    await expect(search).not.toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Objects (hidden)' })).toHaveFocus()
    await expect(canvas.getByRole('region', { name: 'Fleets panel' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Objects (hidden)' }))
    await expect(search).toHaveValue('Borealis')
  },
}
export const Phone: Story = { globals: { viewport: { value: 'mobile2', isRotated: false } }, render: args => <Sample {...args} corporationId="storybook-workspace-phone" /> }
export const Arrange: Story = {
  render: args => <Sample {...args} corporationId="storybook-workspace-arrange" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Arrange HUD' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reset HUD layout' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Move Fleets to left' }))
    await expect(canvas.getByRole('button', { name: 'Move Fleets to left' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Move Fleets up' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Fleets moved up.')
    const reset = canvas.getByRole('button', { name: 'Reset HUD layout' })
    const frame = reset.closest<HTMLElement>('[data-hud-framing="frame"]')!
    const footer = frame.querySelector<HTMLElement>('[data-slot="hud-footer"]')!
    await expect(footer.contains(reset)).toBe(true)
    await expect(reset.closest('[data-slot="hud-action-band"]')).not.toBeNull()
    const previousHeight = frame.style.maxHeight
    frame.style.maxHeight = '300px'
    const bottomGap = () => frame.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom
    await expect(bottomGap()).toBeCloseTo(5, 0)
    const content = frame.querySelector<HTMLElement>('[data-slot="hud-content"]')!
    await expect(content.scrollHeight).toBeGreaterThan(content.clientHeight)
    const position = footer.getBoundingClientRect().top
    content.scrollTop = content.scrollHeight
    await expect(footer.getBoundingClientRect().top).toBeCloseTo(position, 0)
    frame.style.maxHeight = previousHeight
    content.scrollTop = 0
  },
}


export const PhoneNavigation: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: args => <Sample {...args} corporationId="storybook-workspace-phone-navigation" fullNavigation />,
  play: async ({ canvasElement }) => {
    if (!window.matchMedia(PHONE_HUD_QUERY).matches) return
    const canvas = within(canvasElement)
    const direct = within(canvas.getByRole('navigation', { name: 'HUD panels' }))
    await expect(direct.getAllByRole('button')).toHaveLength(5)
    for (const button of direct.getAllByRole('button')) {
      const bounds = button.getBoundingClientRect()
      await expect(bounds.width).toBeGreaterThanOrEqual(44)
      await expect(bounds.left).toBeGreaterThanOrEqual(0)
      await expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
    }
    await expect(canvas.queryByRole('button', { name: 'HUD menu' })).not.toBeInTheDocument()
    await userEvent.click(direct.getByRole('button', { name: 'Fleets' }))
    const returnToMap = canvas.getByRole('button', { name: 'Return to map' })
    await expect(returnToMap.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await expect(canvasElement.querySelector('[data-slot="hud-close"]')).not.toBeNull()
    for (const name of ['Arrange HUD', 'Objects', 'Fleet status', 'Fleets', 'Arrange HUD', 'Fleets']) {
      await userEvent.click(canvas.getByRole('button', { name: 'Return to map' }))
      await userEvent.click(canvas.getByRole('button', { name }))
      await expect(canvas.queryByRole('navigation', { name: 'HUD panels' })).toBeNull()
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Return to map' }))
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
