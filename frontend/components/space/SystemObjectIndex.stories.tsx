import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { SystemObjectIndex } from './SystemObjectIndex'

const meta: Meta<typeof SystemObjectIndex> = {
  id: 'hud-objects-search', title: 'Tasks/Objects/Current app', tags: ['catalog'],
  component: SystemObjectIndex,
  parameters: { catalog: { purpose: 'task', status: 'reference', record: 'docs/hud.md', task: 'objects' }, layout: 'fullscreen', docs: { description: { component: 'The actual Objects card opens directly to all disclosed rows. Shared object search supplies category presets and text filtering. Its results scroll independently; inspection and command ownership remain separate.' } } },
}
export default meta
type Story = StoryObj<typeof meta>

function SearchCard() {
  const [selected, select] = useState<string | null>(null)
  const [active, setActive] = useState(false)
  const objects = Array.from({ length: 30 }, (_, i) => ({ name: `site-${i + 1}`, label: `Known site ${String(i + 1).padStart(2, '0')}`, kind: 'ruin', group: 'Features', x: 0, y: 0 }))
  return <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: '#08121d' }}>
    <HudWorkspace corporationId="storybook-objects-search" request={{ id: 'objects', sequence: 1 }}
      onPanelActivate={id => { if (id === 'objects') setActive(true) }}
      onPanelDismiss={id => { if (id === 'objects') setActive(false) }}
      panels={[
        { id: 'objects', label: 'Objects', children: <SystemObjectIndex compact objects={objects} selected={selected} open={active} onOpen={setActive} onSelect={select} onFocus={() => {}} systemName="Solace" /> },
        { id: 'fleets', label: 'Fleets', children: <p>Command state is separate from object browsing.</p> },
      ]} />
  </div>
}

export const AlwaysVisibleSearch: Story = {
  render: () => <SearchCard />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox', { name: 'Find an object' })
    await expect(canvas.queryByTestId('system-index-toggle')).not.toBeInTheDocument()
    await expect(canvas.getByTestId('index-site-30')).toBeInTheDocument()
    await userEvent.type(search, 'Known site 03')
    await expect(canvas.getByTestId('index-site-3')).toBeVisible()
    await expect(canvas.queryByTestId('index-site-1')).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'no known match')
    await expect(canvas.getByText('No matching objects.')).toBeVisible()
    await userEvent.clear(search)
    await expect(canvas.getByTestId('index-site-30')).toBeInTheDocument()
    const results = canvas.getByRole('region', { name: 'Search results' })
    const pinned = search.getBoundingClientRect().top
    await expect(results.scrollHeight).toBeGreaterThan(results.clientHeight)
    results.scrollTop = 200
    await new Promise(requestAnimationFrame)
    await expect(results.scrollTop).toBeGreaterThan(0)
    results.scrollTop = 600
    await new Promise(requestAnimationFrame)
    await expect(Math.abs(search.getBoundingClientRect().top - pinned)).toBeLessThan(1)
    await expect(search).toBeVisible()
  },
}

/** Free inspection without the search walkthrough running concurrently. */
export const Inspection: Story = { parameters: { catalog: { primary: true } }, render: () => <SearchCard /> }
