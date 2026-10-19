import { useMemo, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createWorldClock } from '@/lib/client-clock'
import type { SpaceBody, SystemSpace } from '@/lib/types/system-space'
import { SpaceStage } from './SpaceStage'
import { buildSceneModel } from './space-scene'
import type { SpaceSelection } from './space-selection'
import type { SceneFrameInputs } from './space-transform-loop'
import { DEFAULT_HEX_SKY, type SpaceGridMode, type HexSkyStyle } from '@/components/graphics/space-sky'

// Deliberately fixed art-review data; production code owns all geometry/art.
const bodies: SpaceBody[] = [
  { id: 'star', type: 'star', name: 'Review star', space: { X: 0, Y: 0, Z: 0 }, size: 4 },
  ...([
    ['rocky', 18, 0.1, 1.4], ['gas_giant', 37, 0.45, 2.8],
    ['ice', 60, 0.75, 1.8], ['belt', 48, 0, 1], ['station', 23, 0.55, 1],
  ] as const).map(([type, radius, phase, size]) => ({
    id: type, type, name: `Review ${type.replaceAll('_', ' ')}`, size,
    space: { X: radius, Y: 0, Z: 0 },
    orbitElements: { parentId: 'star', radius, phase, periodMs: 600_000 + radius * 10_000, inclination: 0, node: 0 },
  })),
]

function SolarSystem({ starClass = 'G', animate = true, extent = 500, gridMode = 'surround', gridDistance = DEFAULT_HEX_SKY.distance, gridBrightness = DEFAULT_HEX_SKY.brightness, gridThickness = DEFAULT_HEX_SKY.thickness, gridStyle = DEFAULT_HEX_SKY.style }: { starClass?: string; animate?: boolean; extent?: number; gridMode?: SpaceGridMode; gridDistance?: number; gridBrightness?: number; gridThickness?: number; gridStyle?: HexSkyStyle }) {
  const [selection, select] = useState<SpaceSelection | null>(null)
  const clock = useMemo(() => {
    const value = createWorldClock()
    value.anchor(120_000, animate ? 1 : 0)
    return value
  }, [animate])
  const interior = useMemo<SystemSpace>(() => ({
    systemId: 'storybook-solar-system', extent, character: 'normal', starClass,
    worldTime: 120_000, scale: 1, features: bodies,
    laneGates: [{ id: 'gate', laneId: 'review-lane', destSystemId: 'review-neighbor', name: 'Review gate',
      size: 1.2, space: { X: 70, Y: 0, Z: 0 },
      orbitElements: { parentId: 'star', radius: 70, phase: 0.35, periodMs: 2_000_000, inclination: 0, node: 0 } }],
  }), [starClass, extent])
  const inputs = useMemo<SceneFrameInputs>(() => ({ interior, fleets: [], reducedMotion: !animate, selection, log: () => {} }), [interior, animate, selection])
  const inputsRef = useRef(inputs)
  inputsRef.current = inputs
  const frameSource = useMemo(() => ({ clock, inputsRef }), [clock])
  const scene = useMemo(() => buildSceneModel({ ...inputs, worldTimeMs: 120_000 }), [inputs])
  return <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#05070d' }}>
    <SpaceStage systemId={interior.systemId} scene={scene} extent={interior.extent}
      worldTime={120_000} scale={1} selection={selection} onSelect={select} frameSource={frameSource} gridMode={gridMode}
      gridSettings={{ distance: gridDistance, brightness: gridBrightness, thickness: gridThickness, style: gridStyle }} />
  </div>
}

const meta = {
  title: 'Graphics/Solar System',
  component: SolarSystem,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Production SpaceStage and SpaceWorld with a fixed review system: star, rocky world, gas giant, ice world, belt, station and lane gate. Uses the real camera, picking, orbit drawing, materials and guarded renderer. No backend or sign-in required. Freeze animation or change spectral class in Controls.' } } },
  args: { starClass: 'G', animate: true, extent: 500, gridMode: 'surround', gridDistance: DEFAULT_HEX_SKY.distance, gridBrightness: DEFAULT_HEX_SKY.brightness, gridThickness: DEFAULT_HEX_SKY.thickness, gridStyle: DEFAULT_HEX_SKY.style },
  argTypes: {
    starClass: { control: 'select', options: ['O', 'B', 'A', 'F', 'G', 'K', 'M'] },
    extent: { control: { type: 'range', min: 80, max: 600, step: 10 } },
    gridMode: { control: 'select', options: ['surround', 'ground', 'none'] },
    gridDistance: { control: { type: 'range', min: 6, max: 36, step: 1 } },
    gridBrightness: { control: { type: 'range', min: 0, max: 0.3, step: 0.005 } },
    gridThickness: { control: { type: 'range', min: 0.5, max: 4, step: 0.25 } },
    gridStyle: { control: 'select', options: ['dark', 'luminous'] },
  },
} satisfies Meta<typeof SolarSystem>
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}
export const Frozen: Story = { args: { animate: false } }
export const Close: Story = { args: { extent: 80 } }
