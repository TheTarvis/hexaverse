import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { HudWorkspace, type HudWorkspacePanel } from './HudWorkspace'
import { HudCardShell } from './HudCardShell'
import { HudObjectThumbnail } from './HudObjectThumbnail'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'

const meta: Meta<typeof HudWorkspace> = {
  title: 'HUD/Workspace',
  component: HudWorkspace,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Phone HUD destinations use direct 44px icon controls on the map and the same strip inside an open card; desktop controls stay textual. Docked layout around existing HUD content. Arrange with ordinary keyboard controls, show/hide panels, and reset local preferences. Panel contents remain mounted when moved or hidden. Navigation and vitals stay outside the customizable workspace. These stories use separate demonstration corporation storage keys.' } } },
}
export default meta
type Story = StoryObj<typeof meta>

function Sample({ corporationId = 'storybook-workspace', compact = false }: { corporationId?: string; compact?: boolean }) {
  const [request, setRequest] = useState<{ id: 'command'; sequence: number }>()
  const panels: HudWorkspacePanel[] = [
    { id: 'objects', label: 'Objects', children: <HudCardShell title="Known objects" lighting="none"><Input aria-label="Find objects" placeholder="Find an object…" />{['gate', 'ruin', 'nebula'].map(kind => <div key={kind} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><HudObjectThumbnail kind={kind} /><span>{kind === 'gate' ? 'Gate to Borealis' : kind === 'ruin' ? 'Fractured array' : 'Veil nebula'}</span></div>)}</HudCardShell> },
    { id: 'command', label: 'Command', children: <HudCardShell title="Peregrine" lighting="none"><p>Command fleet · Holding position</p><p>Inspecting an object keeps Peregrine selected for commands.</p><Button outline onClick={() => {}}>Review course</Button></HudCardShell> },
  ]
  return <div style={{ width: compact ? 390 : '100%', maxWidth: '100%', height: compact ? 760 : '100vh', minHeight: 560, position: 'relative', overflow: 'hidden', color: '#d5e7f1', background: 'radial-gradient(ellipse at 48% 43%, #1a3447, #071019 60%)' }}>
    <div style={{ position: 'absolute', top: 16, left: 16, right: compact ? 216 : 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Borealis · Peregrine · Fuel 84%</span>{!compact && <Button plain onClick={() => setRequest(previous => ({ id: 'command', sequence: (previous?.sequence ?? 0) + 1 }))}>Open command</Button>}</div>
    <HudWorkspace corporationId={corporationId} panels={panels} request={request} />
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
    await userEvent.click(canvas.getByRole('button', { name: 'Move Command to left' }))
    await expect(canvas.getByRole('button', { name: 'Move Command to left' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Move Command up' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Command moved up.')
  },
}


export const PhoneNavigation: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => <Sample corporationId="storybook-workspace-phone-navigation" compact />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const direct = within(canvas.getByRole('navigation', { name: 'HUD panels' }))
    await expect(direct.getAllByRole('button')).toHaveLength(3)
    await expect(canvas.queryByRole('button', { name: 'HUD menu' })).not.toBeInTheDocument()
    await userEvent.click(direct.getByRole('button', { name: 'Command' }))
    for (const name of ['Arrange HUD', 'Objects', 'Command', 'Arrange HUD', 'Command']) {
      const navigation = within(canvas.getByRole('navigation', { name: 'HUD panels' }))
      await userEvent.click(navigation.getByRole('button', { name }))
      await expect(within(canvas.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Close Command panel' }))
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
