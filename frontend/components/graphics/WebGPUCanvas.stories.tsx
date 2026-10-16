import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as THREE from 'three'
import { WebGPUCanvas, type CanvasSceneFactory } from './WebGPUCanvas'

const createExampleScene: CanvasSceneFactory = () => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
  camera.position.set(2, 1.3, 3)
  camera.lookAt(0, 0, 0)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xb9cedb, roughness: 0.6 }))
  scene.add(mesh, new THREE.HemisphereLight(0xd7e9ff, 0x243344, 2))
  const key = new THREE.DirectionalLight(0xffffff, 3)
  key.position.set(2, 3, 4)
  scene.add(key)
  return { scene, camera, frame: delta => { mesh.rotation.y += delta * 0.4 } }
}

const meta = {
  title: 'Graphics/WebGPU Canvas',
  component: WebGPUCanvas,
  tags: ['autodocs'],
  args: { label: 'Example scene', createScene: createExampleScene, animate: false, surface: 'preview', alpha: true, stencil: false, style: { width: '100%', height: '100dvh' } },
  argTypes: { createScene: { control: false }, rendererFactory: { control: false }, style: { control: false } },
  parameters: {
    docs: { description: { component: 'Reusable canvas foundation. Supply one stable createScene callback returning a Three scene and camera. The canvas owns WebGPU-first initialization, WebGL2 compatibility, recovery, resizing, demand rendering, visibility/reduced-motion handling and disposal. Add optional frame/resize hooks for custom content. Use WebGPUModelView to display a GLB without writing a scene.' } },
  },
} satisfies Meta<typeof WebGPUCanvas>

export default meta
type Story = StoryObj<typeof meta>

export const BasicScene: Story = {}
export const AnimatedScene: Story = { args: { animate: true } }
export const Narrow: Story = { args: { style: { width: 280, height: 320 } } }
