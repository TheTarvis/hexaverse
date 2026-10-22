import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { useMemo } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as THREE from 'three'
import { createFeatureModel, advanceFeatureModel, type FeatureArtKind } from '../space/webgl/feature-art'
import { WebGPUModelView } from './WebGPUModelView'
import { createLaneGatePortal } from './lane-gate-portal'
import { addPreviewLights } from './scene-resources'
import { WebGPUCanvas, type CanvasSceneFactory } from './WebGPUCanvas'

const kinds: FeatureArtKind[] = ['anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation']

function FeatureReview({ kind = 'ruin', comparison = false, animate = true, compact = false }: { kind?: FeatureArtKind; comparison?: boolean; animate?: boolean; compact?: boolean }) {
  const createScene = useMemo<CanvasSceneFactory>(() => () => {
    const scene = new THREE.Scene()
    addPreviewLights(scene)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
    camera.position.set(0, compact ? 1.8 : 3.8, comparison ? 14 : compact ? 2.6 : 4.8)
    camera.lookAt(0, 0, 0)
    const models = (comparison ? kinds : [kind]).map((category, index) => {
      const model = createFeatureModel(category, `review-${category}`)
      if (comparison) model.position.set((index % 3 - 1) * 3.5, 0, (Math.floor(index / 3) - 0.5) * 3.5)
      scene.add(model)
      return model
    })
    return { scene, camera, frame: (_delta, elapsed) => { models.forEach(model => advanceFeatureModel(model, elapsed * 1000)) } }
  }, [kind, comparison, compact])
  return <div style={{ background: '#080e19', minHeight: compact ? 0 : '100dvh', color: '#d6e2ef' }}>
    <WebGPUCanvas label={comparison ? 'Feature art comparison' : kind} createScene={createScene} animate={animate} style={{ height: compact ? 380 : '90dvh', width: '100%' }} />
    <HudText className="px-5">{comparison ? 'Back row: anomaly · ruin · nebula. Front row: gravity well · debris · radiation.' : kind}</HudText>
  </div>
}

const meta = {
  id: 'graphics-feature-art', title: 'Graphics/Feature models', tags: ['catalog'], component: FeatureReview,
  parameters: { catalog: { purpose: 'scene', status: 'reference', record: 'docs/art-direction.md' }, layout: 'fullscreen' },
  args: { kind: 'ruin', comparison: false, animate: true },
  argTypes: { kind: { control: 'select', options: kinds } },
} satisfies Meta<typeof FeatureReview>
export default meta
type Story = StoryObj<typeof meta>

export const Ruin: Story = {}
export const Anomaly: Story = { args: { kind: 'anomaly' } }
export const Nebula: Story = { args: { kind: 'nebula' } }
export const GravityWell: Story = { args: { kind: 'gravity_well' } }
export const Debris: Story = { args: { kind: 'debris' } }
export const Radiation: Story = { args: { kind: 'radiation' } }
export const Comparison: Story = { args: { comparison: true } }
export const ReducedMotion: Story = { args: { kind: 'anomaly', animate: false } }


export const RuinCandidate: Story = {
  parameters: { catalog: { status: 'comparison', question: 'Does the generated ruin fit the shared manufactured art direction?' } },
  render: () => <div style={{ background: '#080e19', minHeight: '100dvh' }}>
    <WebGPUModelView src="/models/space/ruin-candidate.glb" label="Generated ruin candidate — raw materials" view="three-quarter" style={{ height: '100dvh', width: '100%' }} />
  </div>,
}

/** Same reusable light rig; each model is independently fitted for material/silhouette review. */
export const RuinProductionComparison: Story = {
  parameters: { catalog: { status: 'comparison', question: 'Which ruin silhouette and material treatment should replace the current model?' } },
  render: () => <div style={{ background: '#080e19', color: '#d6e2ef', minHeight: '100dvh', padding: 16 }}>
    <HudHeading level={1} size="compact">Ruin production review</HudHeading>
    <HudText>Compare architectural silhouette, light gray plating, graphite recesses and sparse amber accents against the accepted gate. Raw candidate materials are preserved. No world replacement is implied.</HudText>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, marginTop: 20 }}>
      <section><HudHeading variant="section">Local procedural ruin</HudHeading><FeatureReview kind="ruin" animate={false} compact /></section>
      <section><HudHeading variant="section">Generated ruin candidate</HudHeading><WebGPUModelView src="/models/space/ruin-candidate.glb" label="Generated ruin candidate" view="three-quarter" style={{ height: 380 }} /></section>
      <section><HudHeading variant="section">Accepted lane gate</HudHeading><WebGPUModelView src="/models/space/lane-gate.glb" label="Accepted open lane gate" animation="Open" progress={1} playing={false} createEffect={createLaneGatePortal} view="three-quarter" style={{ height: 380 }} /></section>
    </div>
  </div>,
}

/** Local authored candidates, shared preview lighting and independent framing. */
export const ManufacturedFamilyReview: Story = {
  parameters: { catalog: { status: 'comparison', question: 'Do the ruin and debris silhouettes read consistently beside the accepted gate?' } },
  render: () => <div style={{ background: '#080e19', color: '#d6e2ef', minHeight: '100dvh', padding: 16 }}>
    <HudHeading level={1} size="compact">Manufactured family review</HudHeading>
    <HudText>Compare the broken architectural spine and detached hull sections against the accepted gate: broad gray armor, graphite structure, sparse amber details and readable negative space.</HudText>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, marginTop: 20 }}>
      <section><HudHeading variant="section">Fractured ruin</HudHeading><FeatureReview kind="ruin" animate={false} compact /></section>
      <section><HudHeading variant="section">Separated hull debris</HudHeading><FeatureReview kind="debris" animate={false} compact /></section>
      <section><HudHeading variant="section">Accepted lane gate</HudHeading><WebGPUModelView src="/models/space/lane-gate.glb" label="Accepted open lane gate" animation="Open" progress={1} playing={false} createEffect={createLaneGatePortal} view="three-quarter" style={{ height: 380 }} /></section>
    </div>
  </div>,
}
