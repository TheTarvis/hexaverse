import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { WebGPUModelView } from './WebGPUModelView'
import { createLaneGatePortal } from './lane-gate-portal'
import { SpacecraftPreview } from '@/components/space/SpacecraftPreview'

const meta = {
  id: 'graphics-model-view', title: 'Foundations/Graphics/Model viewer',
  component: WebGPUModelView,
  tags: ['autodocs', 'catalog'],
  args: {
    src: '/models/space/lane-gate.glb',
    label: 'Lane gate',
    animation: 'Open',
    createEffect: createLaneGatePortal,
    progress: 1,
    playing: false,
    wireframe: false,
    view: 'three-quarter',
    style: { width: '100%', height: '100dvh' },
  },
  argTypes: {
    src: { control: 'text' },
    view: { control: 'select', options: ['three-quarter', 'front', 'back', 'side'] },
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    playing: { control: 'boolean' },
    wireframe: { control: 'boolean' },
    style: { control: false },
    createEffect: { control: false, table: { disable: true } },
  },
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/art-direction.md' },
    docs: { description: { component: 'Raw GLB art review on the shared WebGPU canvas foundation, using the production preview/thumbnail light rig. Change src to review another raw model; framing and drag/scroll orbit are automatic. Ship and Station render the actual game SpacecraftPreview, including production material/accent treatment. Use Graphics/Game Preview for its full controls. The lane gate has two independent rigid halves; its wormhole is separate and material-role masks remain production work.' } },
  },
} satisfies Meta<typeof WebGPUModelView>

export default meta
type Story = StoryObj<typeof meta>

export const LaneGate: Story = {}
export const Closed: Story = { args: { progress: 0 } }
export const Opening: Story = { args: { playing: true } }
export const Back: Story = { args: { view: 'back' } }
export const Side: Story = { args: { view: 'side' } }
export const RawGLB: Story = { args: { createEffect: undefined }, parameters: { docs: { description: { story: 'Unmodified model materials for new-asset art review. This is explicitly separate from production spacecraft treatment.' } } } }
export const Ship: Story = {
  parameters: { controls: { include: ['label'] } },
  args: { label: 'Utility ship', createEffect: undefined },
  render: args => <div className="dark max-w-lg bg-[#09151f] p-6"><SpacecraftPreview kind="ship" objectId="storybook-ship" label={args.label} accentColor={0x4fce92} /></div>,
}
export const Station: Story = {
  parameters: { controls: { include: ['label'] } },
  args: { label: 'Orbital station', createEffect: undefined },
  render: args => <div className="dark max-w-lg bg-[#09151f] p-6"><SpacecraftPreview kind="station" objectId="storybook-station" label={args.label} accentColor={0x67e8f9} /></div>,
}
export const MissingModel: Story = { args: { src: '/models/space/not-available.glb', label: 'Unavailable model' } }
export const Narrow: Story = { args: { style: { width: 280, height: 320 } } }
export const InHudCard: Story = {
  render: args => (
    <div className="dark p-8">
      <HudCardShell title="Lane gate" style={{ width: 420, maxWidth: '100%' }}>
        <WebGPUModelView {...args} style={{ height: 340 }} />
      </HudCardShell>
    </div>
  ),
}
