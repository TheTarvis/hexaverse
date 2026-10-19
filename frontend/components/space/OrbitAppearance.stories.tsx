import { useMemo, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createWorldClock } from '@/lib/client-clock'
import type { SpaceBody, SystemSpace } from '@/lib/types/system-space'
import { SpaceStage } from './SpaceStage'
import { SYSTEM_ORBIT_APPEARANCE, SYSTEM_LABEL_APPEARANCE } from './space-appearance'
import { buildSceneModel } from './space-scene'
import type { SpaceSelection } from './space-selection'
import type { SceneFrameInputs } from './space-transform-loop'

// A deliberately crowded fixture: eight planets, their moons, stations,
// two asteroid belts and gates. Geometry and picking use the real stage.
const angle = (radians: number) => Math.round(radians / (2 * Math.PI) * (1 << 20))
const names = ['Copper Haven I', 'Saffron Haven II', 'Amber Haven III', 'Flame Haven IV', 'Amber Haven V', 'Flame Haven VI', 'Ember Haven VII', 'Saffron Haven VIII']
const planets: SpaceBody[] = names.map((name, i) => ({
  id: `planet-${i}`, name, type: i === 4 || i === 5 ? 'gas_giant' : i > 5 ? 'ice' : 'rocky',
  size: i === 4 || i === 5 ? 2.5 : 1.2,
  space: { X: 16 + i * 9, Y: 0, Z: 0 },
  orbitElements: { parentId: 'star', radius: 16 + i * 9, phase: angle(i * 0.79), periodMs: 1_000_000 + i * 250_000, inclination: angle(i % 3 * 0.035), node: angle(i * 0.2) },
}))
const features: SpaceBody[] = [
  { id: 'star', name: 'Beleen II', type: 'star', size: 4, space: { X: 0, Y: 0, Z: 0 } },
  ...planets,
  ...planets.slice(2).map((planet, i): SpaceBody => ({
    id: `moon-${i}`, name: `${planet.name} — Moon`, type: 'moon', size: 0.45,
    space: { X: 3 + i * 0.4, Y: 0, Z: 0 },
    orbitElements: { parentId: planet.id, radius: 3 + i * 0.4, phase: angle(i * 1.3), periodMs: 180_000 + i * 40_000, inclination: angle(0.1), node: angle(i) },
  })),
  ...([['station', 28], ['station', 57], ['belt', 38], ['belt', 88]] as const).map(([type, radius], i): SpaceBody => ({
    id: `site-${i}`, name: `${['Amber station S-I', 'Flame station S-II', 'Amber belt B-II', 'Flame belt B-I'][i]}`, type, size: 0.8,
    space: { X: radius, Y: 0, Z: 0 },
    orbitElements: { parentId: 'star', radius, phase: angle(i * 1.8), periodMs: 2_000_000, inclination: 0, node: 0 },
  })),
]

interface AppearanceControls {
  orbitBrightness: number
  orbitThickness: number
  selectedOrbitBrightness: number
  selectedOrbitThickness: number
  labelsVisible: boolean
  labelOpacity: number
  selectedLabelVisible: boolean
  selectedLabelOpacity: number
  initialSelection: string
  animate: boolean
}

function OrbitAppearance({ orbitBrightness, orbitThickness, selectedOrbitBrightness, selectedOrbitThickness, labelsVisible, labelOpacity, selectedLabelVisible, selectedLabelOpacity, initialSelection, animate }: AppearanceControls) {
  const [selection, select] = useState<SpaceSelection | null>(() => initialSelection ? { bodyId: initialSelection } : null)
  const [previousInitialSelection, setPreviousInitialSelection] = useState(initialSelection)
  if (previousInitialSelection !== initialSelection) {
    setPreviousInitialSelection(initialSelection)
    select(initialSelection ? { bodyId: initialSelection } : null)
  }
  const clock = useMemo(() => {
    const value = createWorldClock()
    value.anchor(120_000, animate ? 1 : 0)
    return value
  }, [animate])
  const interior = useMemo<SystemSpace>(() => ({
    systemId: 'orbit-appearance-review', extent: 400, character: 'normal', starClass: 'G',
    worldTime: 120_000, scale: 1, features,
    laneGates: [0, 1].map(i => ({ id: `gate-${i}`, laneId: `lane-${i}`, destSystemId: `neighbor-${i}`, name: `Gate to ${i ? 'Talaeeth' : 'Ember'}`, size: 1,
      space: { X: 96, Y: 0, Z: 0 },
      orbitElements: { parentId: 'star', radius: 96, phase: angle(i * Math.PI + 0.5), periodMs: 3_000_000, inclination: 0, node: 0 },
    })),
  }), [])
  const inputs = useMemo<SceneFrameInputs>(() => ({ interior, fleets: [], reducedMotion: !animate, selection, log: () => {} }), [interior, animate, selection])
  const inputsRef = useRef(inputs)
  inputsRef.current = inputs
  const frameSource = useMemo(() => ({ clock, inputsRef }), [clock])
  const scene = useMemo(() => buildSceneModel({ ...inputs, worldTimeMs: 120_000 }), [inputs])
  const selectedName = features.find(body => body.id === selection?.bodyId)?.name ?? interior.laneGates.find(gate => gate.id === selection?.bodyId)?.name
  return <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#05070d' }}>
    <SpaceStage systemId={interior.systemId} scene={scene} extent={interior.extent} worldTime={120_000} scale={1}
      selection={selection} onSelect={select} frameSource={frameSource} gridMode="surround"
      orbitAppearance={{ brightness: orbitBrightness, thickness: orbitThickness, selectedBrightness: selectedOrbitBrightness, selectedThickness: selectedOrbitThickness }}
      labelAppearance={{ visible: labelsVisible, opacity: labelOpacity, selectedVisible: selectedLabelVisible, selectedOpacity: selectedLabelOpacity }} />
    <aside style={{ position: 'absolute', top: 20, left: 20, maxWidth: 320, pointerEvents: 'none', color: '#b6cedb', fontSize: 13, lineHeight: 1.7 }}>
      <strong style={{ color: '#e1f6ff' }}>Orbit &amp; label study</strong><br />
      Adjust the Storybook Controls below. Click a body to select it; click empty space to clear. Drag to orbit, scroll to zoom.<br />
      <span role="status">Selected: {selectedName ?? 'none'}</span>
    </aside>
  </div>
}

const meta = {
  title: 'Graphics/Orbit Appearance',
  component: OrbitAppearance,
  parameters: { layout: 'fullscreen' },
  args: {
    orbitBrightness: SYSTEM_ORBIT_APPEARANCE.brightness, orbitThickness: SYSTEM_ORBIT_APPEARANCE.thickness,
    selectedOrbitBrightness: SYSTEM_ORBIT_APPEARANCE.selectedBrightness, selectedOrbitThickness: SYSTEM_ORBIT_APPEARANCE.selectedThickness,
    labelsVisible: SYSTEM_LABEL_APPEARANCE.visible, labelOpacity: SYSTEM_LABEL_APPEARANCE.opacity,
    selectedLabelVisible: SYSTEM_LABEL_APPEARANCE.selectedVisible, selectedLabelOpacity: SYSTEM_LABEL_APPEARANCE.selectedOpacity,
    initialSelection: '', animate: false,
  },
  argTypes: {
    orbitBrightness: { control: { type: 'range', min: 0, max: 1, step: 0.005 }, description: 'Ordinary orbit opacity. Zero hides the path.', table: { category: 'Orbits' } },
    orbitThickness: { control: { type: 'range', min: 0, max: 5, step: 0.1 }, description: 'Screen pixels.', table: { category: 'Orbits' } },
    selectedOrbitBrightness: { control: { type: 'range', min: 0, max: 1, step: 0.01 }, table: { category: 'Selection' } },
    selectedOrbitThickness: { control: { type: 'range', min: 0, max: 5, step: 0.1 }, table: { category: 'Selection' } },
    labelsVisible: { control: 'boolean', table: { category: 'Labels' } },
    labelOpacity: { control: { type: 'range', min: 0, max: 1, step: 0.05 }, description: 'Opacity of the entire ordinary label, including its background.', table: { category: 'Labels' } },
    selectedLabelVisible: { control: 'boolean', table: { category: 'Selection' } },
    selectedLabelOpacity: { control: { type: 'range', min: 0, max: 1, step: 0.05 }, table: { category: 'Selection' } },
    initialSelection: { control: 'select', options: ['', ...features.map(body => body.id), 'gate-0', 'gate-1'], description: 'Select here or click any object in the scene.' },
  },
} satisfies Meta<typeof OrbitAppearance>
export default meta
type Story = StoryObj<typeof meta>

export const QuietSystem: Story = {}
export const SelectedBody: Story = { args: { initialSelection: 'planet-4' } }
export const AllLabels: Story = { args: { labelsVisible: true, labelOpacity: 1, orbitBrightness: 0.2, orbitThickness: 1 } }
