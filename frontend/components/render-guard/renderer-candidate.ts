import { WebGPURenderer } from 'three/webgpu'
import type * as THREE from 'three'
export type RendererBackend = 'webgpu' | 'webgl2'
export interface RendererCandidate {
  readonly canvas: HTMLCanvasElement
  init(): Promise<void>
  backend(): RendererBackend
  render(scene: THREE.Scene, camera: THREE.Camera): void | Promise<void>
  resize(width: number, height: number, pixelRatio: number): void
  setClearColor(color: THREE.ColorRepresentation, alpha: number): void
  onLoss(listener: (info: { message?: string }) => void): () => void
  dispose(): void
}
export interface RendererCandidateOptions { canvas: HTMLCanvasElement; forceWebGL: boolean; alpha: boolean; stencil: boolean }
export type RendererCandidateFactory = (options: RendererCandidateOptions) => RendererCandidate
export function createRendererCandidate(options: RendererCandidateOptions): RendererCandidate {
  const renderer = new WebGPURenderer({ ...options, antialias: true })
  const originalBackend = renderer.backend
  let initialization: 'idle' | 'pending' | 'ready' | 'failed' = 'idle'
  let retired = false, released = false
  const releasedBackends = new Set<typeof renderer.backend>()
  const releaseBackend = (backend: typeof renderer.backend) => {
    if (releasedBackends.has(backend)) return
    releasedBackends.add(backend)
    // r185 implements dispose on both concrete backends; the base type omits it.
    const disposable = backend as typeof backend & { dispose?: () => void }
    try { disposable.dispose?.() } catch { /* A partially initialized backend may lack resources. */ }
  }
  const release = () => {
    if (!retired || released || initialization === 'pending') return
    released = true
    if (initialization === 'ready') {
      // Three r185's full dispose is safe only after init resolves. Before then
      // its unawaited setAnimationLoop(null) re-enters failed initialization.
      releasedBackends.add(renderer.backend)
      try { renderer.dispose() } catch { /* Teardown remains local. */ }
    } else {
      releaseBackend(renderer.backend)
    }
    // Built-in fallback may replace a native backend that acquired resources.
    if (originalBackend !== renderer.backend) releaseBackend(originalBackend)
  }
  const listeners = new Set<(info: { message?: string }) => void>()
  renderer.onDeviceLost = info => { for (const listener of listeners) listener(info) }
  return {
    canvas: options.canvas,
    init: async () => {
      initialization = 'pending'
      try {
        await renderer.init()
        initialization = 'ready'
        if (originalBackend !== renderer.backend) releaseBackend(originalBackend)
      } catch (error) {
        initialization = 'failed'
        throw error
      } finally { release() }
    },
    backend: () => (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2',
    render: (scene, camera) => renderer.renderAsync(scene, camera),
    resize: (width, height, ratio) => { renderer.setPixelRatio(ratio); renderer.setSize(width, height, false) },
    setClearColor: (color, alpha) => { renderer.setClearColor(color, alpha) },
    onLoss: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose: () => { retired = true; listeners.clear(); release() },
  }
}
