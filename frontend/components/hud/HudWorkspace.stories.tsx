import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SceneNavigationAction } from './SceneNavigationAction'
import { HudWorkspace, type HudWorkspacePanel } from './HudWorkspace'
import { HudCardShell } from './HudCardShell'
import { HudObjectThumbnail } from './HudObjectThumbnail'
import { HudButton, HudSearchInput } from './HudControls'

const meta: Meta<typeof HudWorkspace> = {
  id: 'hud-workspace', title: 'Foundations/Workspace', tags: ['catalog'],
  component: HudWorkspace,
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen', docs: { description: { component: 'HUD destinations use direct 44px icon controls on desktop and phone; phones repeat the same strip inside an open card. Docked layout around existing HUD content. Arrange with ordinary keyboard controls, show/hide panels, and reset local preferences. Panel contents remain mounted when moved or hidden. Navigation stays outside the customizable workspace. These stories use separate demonstration corporation storage keys.' } } },
}
export default meta
type Story = StoryObj<typeof meta>

function Sample({ corporationId = 'storybook-workspace', compact = false, fullNavigation = false }: { corporationId?: string; compact?: boolean; fullNavigation?: boolean }) {
  const [request, setRequest] = useState<{ id: 'fleets'; sequence: number }>()
  const panels: HudWorkspacePanel[] = [
    { id: 'objects', label: 'Objects', children: <HudCardShell title="Known objects"><HudSearchInput aria-label="Find objects" placeholder="Find an object…" />{['gate', 'ruin', 'nebula'].map(kind => <div key={kind} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><HudObjectThumbnail kind={kind} /><span>{kind === 'gate' ? 'Gate to Borealis' : kind === 'ruin' ? 'Fractured array' : 'Veil nebula'}</span></div>)}</HudCardShell> },
    { id: 'fleets', label: 'Fleets', children: <HudCardShell title="Peregrine"><p>Command fleet · Holding position</p><p>Inspecting an object keeps Peregrine selected for commands.</p><HudButton onClick={() => {}}>Review course</HudButton></HudCardShell> },
  ]
  if (fullNavigation) panels.push({ id: 'fleet-status', label: 'Fleet status', children: <p>Selected fleet status</p> })
  return <div style={{ width: compact ? 390 : '100%', maxWidth: '100%', height: compact ? 760 : '100vh', minHeight: 560, position: 'relative', overflow: 'hidden', color: '#d5e7f1', background: 'radial-gradient(ellipse at 48% 43%, #1a3447, #071019 60%)' }}>
    <div style={{ position: 'absolute', top: 16, left: 16, right: compact ? 216 : 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Borealis · Peregrine · Fuel 84%</span>{!compact && <HudButton variant="quiet" onClick={() => setRequest(previous => ({ id: 'fleets', sequence: (previous?.sequence ?? 0) + 1 }))}>Open fleets</HudButton>}</div>
    <HudWorkspace corporationId={corporationId} panels={panels} request={request} navigationAction={fullNavigation ? <SceneNavigationAction destination="system" systemName="Borealis" onEnter={() => {}} /> : undefined} />
  </div>
}

export const Docked: Story = { render: () => <Sample /> }
export const Phone: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } }, render: () => <Sample corporationId="storybook-workspace-phone" compact /> }
export const Arrange: Story = {
  render: () => <Sample corporationId="storybook-workspace-arrange" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Arrange HUD' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reset HUD layout' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Move Fleets to left' }))
    await expect(canvas.getByRole('button', { name: 'Move Fleets to left' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Move Fleets up' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Fleets moved up.')
  },
}


export const PhoneNavigation: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => <Sample corporationId="storybook-workspace-phone-navigation" compact fullNavigation />,
  play: async ({ canvasElement }) => {
    if (!window.matchMedia('(max-width: 760px)').matches) return
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
    for (const name of ['Arrange HUD', 'Objects', 'Fleet status', 'Fleets', 'Arrange HUD', 'Fleets']) {
      const navigation = within(canvas.getByRole('navigation', { name: 'HUD panels' }))
      await userEvent.click(navigation.getByRole('button', { name }))
      await expect(within(canvas.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Close Fleets panel' }))
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
