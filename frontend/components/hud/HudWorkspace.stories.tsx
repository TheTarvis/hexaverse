import { PHONE_HUD_QUERY } from '@/hooks/use-phone-sheet'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SceneNavigationAction } from './SceneNavigationAction'
import { HudWorkspace, type HudWorkspacePanel } from './HudWorkspace'
import { HudCardShell } from './HudCardShell'
import { HudActionBand } from './HudActionBand'
import { useState } from 'react'
import { ObjectSearch, emptyObjectSearch } from '@/components/space/ObjectSearch'

const meta = {
  id: 'hud-workspace', title: 'Foundations/Workspace', tags: ['catalog'],
  component: Sample,
  args: { requestRevision: 0 },
  argTypes: { requestRevision: { name: 'Open fleets request', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to simulate an external request to open Fleets.' } },
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen', docs: { description: { component: 'HUD destinations use direct 44px icon controls on desktop and phone. Fixed docks keep Objects left and fleet cards right. Launchers show/hide cards while retaining mounted task state. Settings uses Audio and Account tabs, with Tuning added when the local backend capability is available.' } } },
} satisfies Meta<typeof Sample>
export default meta
type Story = StoryObj<typeof meta>

function Sample({ corporationId = 'storybook-workspace', fullNavigation = false, requestRevision = 0 }: { corporationId?: string; fullNavigation?: boolean; requestRevision?: number }) {
  const [search, setSearch] = useState(emptyObjectSearch)
  const request = requestRevision > 0 ? { id: 'fleets' as const, sequence: requestRevision } : undefined
  const panels: HudWorkspacePanel[] = [
    { id: 'objects', label: 'Objects', title: { search: 'objects', scope: 'Borealis' }, children: <div style={{ height: '100%', minHeight: 0 }}><ObjectSearch
      items={[{ id: 'gate', name: 'Gate to Borealis', kind: 'gate', subtitle: 'Lane gate' }, { id: 'ruin', name: 'Fractured array', kind: 'ruin', subtitle: 'Borealis · Ruin' }, { id: 'nebula', name: 'Veil nebula', kind: 'nebula', subtitle: 'Borealis · Nebula' }]}
      value={search} onChange={setSearch} onSelect={() => {}} /></div> },
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
    const search = canvas.getByRole('searchbox', { name: 'Find an object' })
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
  name: 'Settings',
  render: args => <Sample {...args} corporationId="storybook-workspace-settings" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }))
    await expect(canvas.getByRole('tab', { name: 'Audio' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('tab', { name: 'Account' }))
    await expect(canvas.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.queryByRole('tab', { name: 'Layout' })).toBeNull()
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
    for (const name of ['Settings', 'Objects', 'Fleet status', 'Fleets', 'Settings', 'Fleets']) {
      await userEvent.click(canvas.getByRole('button', { name: 'Return to map' }))
      await userEvent.click(canvas.getByRole('button', { name }))
      await expect(canvas.queryByRole('navigation', { name: 'HUD panels' })).toBeNull()
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Return to map' }))
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
