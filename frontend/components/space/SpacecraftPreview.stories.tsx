import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpacecraftPreview } from './SpacecraftPreview'

const meta = {
  id: 'graphics-game-preview', title: 'Foundations/Graphics/Object preview',
  component: SpacecraftPreview,
  tags: ['autodocs', 'catalog'],
  args: { kind: 'ship', objectId: 'storybook-ship', label: 'Utility ship', accentColor: 0x4fce92 },
  argTypes: {
    kind: { control: 'select', options: ['ship', 'station', 'rocky', 'gas_giant', 'ice', 'moon', 'star'] },
    accentColor: { control: 'number' },
    rendererFactory: { control: false },
  },
  decorators: [Story => <div className="dark max-w-lg bg-[#09151f] p-6"><Story /></div>],
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/art-direction.md' }, docs: { description: { component: 'The same SpacecraftPreview used in game details, mounted on WebGPUCanvas. Ships/stations use loadSpacecraftAsset and createSpacecraftModel, including production materials, normalization and accent paint. Lighting is shared with raw model review and offline HUD thumbnails. Drag or arrow keys rotate; Home/Reset restores the view. Gas/star animation shares the canvas loop, capped at 30fps and paused by visibility/reduced motion.' } } },
} satisfies Meta<typeof SpacecraftPreview>

export default meta
type Story = StoryObj<typeof meta>
export const Ship: Story = {}
export const Station: Story = { args: { kind: 'station', objectId: 'storybook-station', label: 'Orbital station', accentColor: 0x67e8f9 } }
export const GasGiant: Story = { args: { kind: 'gas_giant', objectId: 'hud-gas_giant-1', label: 'Gas giant' } }
export const Star: Story = { args: { kind: 'star', objectId: 'hud-star-g', label: 'Star', starClass: 'G' } }
export const Narrow: Story = { decorators: [Story => <div style={{ width: 240 }}><Story /></div>] }
