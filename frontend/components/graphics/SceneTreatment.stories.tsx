import { useMemo } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as THREE from 'three'
import { WebGPUCanvas, type CanvasSceneFactory } from './WebGPUCanvas'
import { addPreviewLights } from './scene-resources'
import { createSpaceSky, updateSpaceSky, DEFAULT_HEX_SKY } from './space-sky'
import { createPlanetModel } from '../space/webgl/scene-art'
import { HudHeading, HudText } from '../hud/HudTypography'

type Treatment = 'sky' | 'surface' | 'lighting'
function SceneTreatment({ treatment }: { treatment: Treatment }) {
  const createScene = useMemo<CanvasSceneFactory>(() => () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000)
    camera.position.set(0, 1, 6)
    camera.lookAt(0, 0, 0)
    addPreviewLights(scene)
    const sky = treatment === 'sky' ? createSpaceSky(10, { hexLattice: true }) : null
    if (sky) scene.add(sky)
    else {
      const geometry = new THREE.SphereGeometry(1.2, 48, 32)
      // Neutral geometry isolates the actual shared light rig; surface uses the production material factory.
      scene.add(treatment === 'surface' ? createPlanetModel('rocky', 'foundation-rocky', geometry) : new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 })))
    }
    return { scene, camera, frame: (_delta, elapsed) => {
      if (sky) {
        camera.rotation.y = elapsed * 0.025
        updateSpaceSky(sky, camera, 10, DEFAULT_HEX_SKY)
      }
    } }
  }, [treatment])
  return <main className="dark" style={{ background: '#050e17', minHeight: '100dvh' }}>
    <header className="p-4"><HudHeading size="compact">Shared scene treatment</HudHeading><HudText variant="secondary">Uses production sky, surface material and preview lighting owners directly. Edit those owners to change consumers.</HudText></header>
    <WebGPUCanvas label={`Shared ${treatment}`} createScene={createScene} animate={treatment === 'sky'} style={{ height: '75dvh' }} />
  </main>
}

const meta = {
  id: 'foundations-graphics-scene-treatment', title: 'Foundations/Graphics/Scene treatment', tags: ['catalog'],
  component: SceneTreatment,
  args: { treatment: 'sky' },
  argTypes: { treatment: { control: 'select', options: ['sky', 'surface', 'lighting'] } },
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/art-direction.md' }, layout: 'fullscreen' },
} satisfies Meta<typeof SceneTreatment>
export default meta
type Story = StoryObj<typeof meta>
export const SharedOwners: Story = {}
