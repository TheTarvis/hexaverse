import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { SystemObjectIndex } from './SystemObjectIndex'

const meta: Meta<typeof SystemObjectIndex> = {
  title: 'HUD/Objects Search',
  component: SystemObjectIndex,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The actual Objects card opens directly to all disclosed rows. Text search stays pinned during internal scrolling; typing filters and clearing restores the full list. No disclosure or hidden category filter.' } } },
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
        { id: 'command', label: 'Command', children: <p>Command state is separate from object browsing.</p> },
      ]} />
  </div>
}

export const AlwaysVisibleSearch: Story = {
  render: () => <SearchCard />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox', { name: 'Find a system object' })
    await expect(canvas.queryByTestId('system-index-toggle')).not.toBeInTheDocument()
    await expect(canvas.getByTestId('index-site-30')).toBeInTheDocument()
    await userEvent.type(search, 'Known site 03')
    await expect(canvas.getByTestId('index-site-3')).toBeVisible()
    await expect(canvas.queryByTestId('index-site-1')).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'no known match')
    await expect(canvas.getByText('No known objects match. Try a name or type.')).toBeVisible()
    await userEvent.clear(search)
    await expect(canvas.getByTestId('index-site-30')).toBeInTheDocument()
    const header = canvas.getByTestId('system-index-search-header')
    let viewport = header.parentElement!
    while (viewport.parentElement && !/(auto|scroll)/.test(getComputedStyle(viewport).overflowY)) viewport = viewport.parentElement
    viewport.scrollTop = 200
    await new Promise(requestAnimationFrame)
    const pinned = header.getBoundingClientRect().top
    viewport.scrollTop = 600
    await new Promise(requestAnimationFrame)
    await expect(Math.abs(header.getBoundingClientRect().top - pinned)).toBeLessThan(1)
    await expect(search).toBeVisible()
  },
}
