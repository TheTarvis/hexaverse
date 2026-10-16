import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { WebGPUCanvas, type CanvasScene, type CanvasSceneContext } from './WebGPUCanvas'
import type { RendererCandidateOptions } from '@/components/render-guard/renderer-candidate'

let frames: Map<number, FrameRequestCallback>, nextFrame: number
const settle = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }) }
async function frame(now = 100) {
  const callbacks = [...frames.values()]
  frames.clear()
  await act(async () => { callbacks.forEach(callback => callback(now)) })
  await settle()
}

function renderer() {
  const entries: { canvas: HTMLCanvasElement; loss: (info: { message?: string }) => void; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = []
  const factory = vi.fn((options: RendererCandidateOptions) => {
    const entry = { canvas: options.canvas, loss: (_info: { message?: string }) => {}, render: vi.fn(), dispose: vi.fn() }
    entries.push(entry)
    return {
      canvas: options.canvas, init: async () => {}, backend: () => 'webgpu' as const,
      render: entry.render, dispose: entry.dispose, resize: vi.fn(), setClearColor: vi.fn(),
      onLoss(listener: typeof entry.loss) { entry.loss = listener; return vi.fn() },
    }
  })
  return { factory, entries }
}

function content() {
  const scene = new THREE.Scene()
  const geometry = new THREE.BoxGeometry()
  const texture = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map: texture })
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
  const releases = [geometry, material, texture].map(resource => vi.spyOn(resource, 'dispose'))
  const value: CanvasScene = { scene, camera: new THREE.PerspectiveCamera(), frame: vi.fn(), dispose: vi.fn() }
  return { value, releases }
}

beforeEach(() => {
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(480)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('WebGPU canvas foundation', () => {
  it('forwards surface, alpha and stencil without changing the renderer-owner contract', async () => {
    const { factory, entries } = renderer()
    const { value } = content()
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<WebGPUCanvas label="HUD scene" createScene={() => value} surface="hud" alpha={false} stencil rendererFactory={factory} />)
    await settle()
    await frame()
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ alpha: false, stencil: true, forceWebGL: false }))
    act(() => entries[0].loss({ message: 'Device lost' }))
    expect(diagnostic).toHaveBeenCalledWith('[renderer]', expect.objectContaining({ surface: 'hud', stage: 'lost' }))
  })

  it('releases a scene that finishes loading after unmount without presenting it', async () => {
    let resolve!: (value: CanvasScene) => void
    const load = vi.fn(() => new Promise<CanvasScene>(yes => { resolve = yes }))
    const { factory, entries } = renderer()
    const { value, releases } = content()
    const host = render(<WebGPUCanvas label="Late model" createScene={load} rendererFactory={factory} />)
    await settle()
    host.unmount()
    await act(async () => { resolve(value) })
    await settle()
    expect(entries[0].render).not.toHaveBeenCalled()
    expect(entries[0].dispose).toHaveBeenCalledTimes(1)
    expect(value.dispose).toHaveBeenCalledTimes(1)
    releases.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
  })

  it('recovers onto a fresh canvas while retaining the loaded scene and stable input target', async () => {
    const { factory, entries } = renderer()
    const { value, releases } = content()
    let context!: CanvasSceneContext
    const load = vi.fn((next: CanvasSceneContext) => { context = next; return value })
    const host = render(<WebGPUCanvas label="Gate" createScene={load} rendererFactory={factory} />)
    await settle()
    await frame()
    expect(host.getByRole('img', { name: 'Gate' })).toHaveAttribute('data-renderer-ready', 'true')
    const input = context.element
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => entries[0].loss({ message: 'Device lost' }))
    expect(host.getByTestId('renderer-interrupted')).toHaveAttribute('data-surface', 'preview')
    fireEvent.click(host.getByRole('button', { name: 'Retry' }))
    await settle()
    await frame(200)
    expect(entries).toHaveLength(2)
    expect(entries[1].canvas).not.toBe(entries[0].canvas)
    expect(input).toContainElement(entries[1].canvas)
    expect(load).toHaveBeenCalledTimes(1)
    expect(entries[1].render).toHaveBeenCalledWith(value.scene, value.camera)
    expect(host.queryByTestId('renderer-interrupted')).toBeNull()
    expect(diagnostic).toHaveBeenCalled()
    host.unmount()
    releases.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
  })

  it('retries scene loading failures independently of renderer initialization', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { factory } = renderer()
    const { value } = content()
    const load = vi.fn().mockRejectedValueOnce(new Error('Missing GLB')).mockResolvedValueOnce(value)
    const host = render(<WebGPUCanvas label="Model" createScene={load} rendererFactory={factory} />)
    await settle()
    expect(host.getByText('Scene could not be loaded.')).toBeVisible()
    fireEvent.click(host.getByRole('button', { name: 'Retry' }))
    await settle()
    await frame()
    expect(load).toHaveBeenCalledTimes(2)
    expect(host.queryByText('Scene could not be loaded.')).toBeNull()
    expect(host.getByRole('img', { name: 'Model' })).toHaveAttribute('data-renderer-ready', 'true')
  })

  it('reduced motion freezes continuous animation while explicit invalidation still presents changed content', async () => {
    const preference = Object.assign(new EventTarget(), { matches: true })
    vi.stubGlobal('matchMedia', () => preference)
    const { factory, entries } = renderer()
    const { value } = content()
    let context!: CanvasSceneContext
    const load = (next: CanvasSceneContext) => { context = next; return value }
    render(<WebGPUCanvas label="Animated model" animate createScene={load} rendererFactory={factory} />)
    await settle()
    await frame()
    await frame(200)
    const count = entries[0].render.mock.calls.length
    await frame(300)
    expect(entries[0].render).toHaveBeenCalledTimes(count)
    act(() => context.invalidate())
    await frame(400)
    expect(entries[0].render).toHaveBeenCalledTimes(count + 1)
    expect(value.frame).toHaveBeenLastCalledWith(0, 0)
  })
})
