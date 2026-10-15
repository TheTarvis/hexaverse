import type * as THREE from 'three'
import { createRendererCandidate, type RendererBackend, type RendererCandidate, type RendererCandidateFactory } from './renderer-candidate'
export type { RendererBackend } from './renderer-candidate'
export type RendererPhase = 'pending' | 'ready' | 'unavailable' | 'interrupted' | 'disposed'
export type RendererSurface = 'space' | 'preview' | 'galaxy' | 'intel-spike' | 'space-spike' | 'hud'
export interface RendererSnapshot { phase: RendererPhase; backend: RendererBackend | null; retrying: boolean }
export interface RendererOwner {
  snapshot(): RendererSnapshot
  setPresentationEligible(eligible: boolean): void
  resize(width: number, height: number, pixelRatio?: number): void
  present(scene: THREE.Scene, camera: THREE.Camera): Promise<boolean>
  update(operation: () => void | Promise<void>): Promise<void>
  retry(): void
  dispose(): void
}
export const RENDERER_INIT_BUDGET_MS = 15000
export const RENDERER_FIRST_FRAME_BUDGET_MS = 15000
export interface RendererDiagnostic { surface: RendererSurface; stage: 'init' | 'first-frame' | 'lost' | 'restore-failed' | 'frame' | 'resize' | 'update'; backend: RendererBackend | null; detail?: string }
interface Options {
  surface: RendererSurface; alpha: boolean; stencil: boolean
  createCanvas(): HTMLCanvasElement
  onCanvas(canvas: HTMLCanvasElement): void
  onState(snapshot: RendererSnapshot): void
  factory?: RendererCandidateFactory
  record?: (diagnostic: RendererDiagnostic) => void
  clock?: { now(): number; setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>; clearTimeout(timer: ReturnType<typeof setTimeout>): void }
}
export function createRendererOwner(options: Options): RendererOwner {
  // Browser timers require the Window/undefined receiver, not this clock object.
  const clock = options.clock ?? {
    now: () => performance.now(),
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
  }
  let state: RendererSnapshot = { phase: 'pending', backend: null, retrying: false }
  let generation = 0, candidate: RendererCandidate | null = null, initialized = false, inFlight = false
  let eligible = false, width = 0, height = 0, ratio = 1, everReady = false, forced = false, recovering = false, restoring = false
  let timer: ReturnType<typeof setTimeout> | undefined, remaining = RENDERER_FIRST_FRAME_BUDGET_MS, started: number | null = null
  let removeLoss = () => {}, removeRestore = () => {}
  const publish = () => {
    if (candidate) {
      if (state.backend) candidate.canvas.dataset.rendererBackend = state.backend
      else delete candidate.canvas.dataset.rendererBackend
      if (state.phase === 'ready') candidate.canvas.dataset.rendererReady = 'true'
      else delete candidate.canvas.dataset.rendererReady
    }
    options.onState({ ...state })
  }
  const clearTimer = () => { if (timer !== undefined) clock.clearTimeout(timer); timer = undefined }
  const record = (stage: RendererDiagnostic['stage'], error?: unknown) => {
    try { (options.record ?? (diagnostic => console.error('[renderer]', diagnostic)))({ surface: options.surface, stage, backend: state.backend, detail: error instanceof Error ? error.message : String(error ?? '') }) } catch { /* diagnostics never own recovery */ }
  }
  const retire = (detach = true) => {
    generation++; clearTimer(); started = null; initialized = false; inFlight = false
    removeLoss(); removeLoss = () => {}; removeRestore(); removeRestore = () => {}
    if (candidate) { try { candidate.dispose() } catch {} if (detach) candidate.canvas.remove() }
    candidate = null
  }
  const fail = (stage: RendererDiagnostic['stage'], error?: unknown) => {
    if (state.phase === 'disposed') return
    record(stage, error)
    const fallback = !everReady && !forced && state.backend !== 'webgl2' || state.retrying && !forced && state.backend !== 'webgl2'
    if (fallback) { begin(true); return }
    const lostCandidate = candidate
    const compatibility = state.backend === 'webgl2'
    if (lostCandidate) delete lostCandidate.canvas.dataset.rendererReady
    retire( !everReady )
    if (lostCandidate && everReady) removeRestore = () => { lostCandidate.canvas.remove() }
    if (lostCandidate && compatibility && everReady) {
      const restore = () => { if (state.phase === 'interrupted' && !state.retrying) { restoring = true; owner.retry() } }
      lostCandidate.canvas.addEventListener('webglcontextrestored', restore)
      removeRestore = () => { lostCandidate.canvas.removeEventListener('webglcontextrestored', restore); lostCandidate.canvas.remove() }
    }
    if (restoring) { record('restore-failed', error); restoring = false }
    state = { ...state, phase: everReady ? 'interrupted' : 'unavailable', retrying: false }; publish()
  }
  const frameBudget = () => {
    if (!initialized || state.phase === 'ready') return
    if (started !== null) remaining -= clock.now() - started
    started = null; clearTimer()
    if (eligible && width > 0 && height > 0) {
      started = clock.now(); timer = clock.setTimeout(() => fail('first-frame', new Error('First presentation deadline exceeded')), Math.max(0, remaining))
    }
  }
  function begin(forceWebGL: boolean) {
    retire(); forced = forceWebGL; remaining = RENDERER_FIRST_FRAME_BUDGET_MS
    state = { phase: recovering ? (everReady ? 'interrupted' : 'unavailable') : 'pending', backend: null, retrying: recovering }
    const token = generation
    try {
      const next = (options.factory ?? createRendererCandidate)({ canvas: options.createCanvas(), forceWebGL, alpha: options.alpha, stencil: options.stencil })
      candidate = next; options.onCanvas(next.canvas); publish()
      removeLoss = next.onLoss(info => { if (generation === token) fail('lost', info.message) })
      timer = clock.setTimeout(() => { if (generation === token) fail('init', new Error('Initialization deadline exceeded')) }, RENDERER_INIT_BUDGET_MS)
      Promise.resolve(next.init()).then(() => {
        if (generation !== token) { try { next.dispose() } catch {} return }
        clearTimer(); initialized = true; state.backend = next.backend()
        next.setClearColor(options.alpha ? 0x000000 : 0x071324, options.alpha ? 0 : 1)
        if (width > 0 && height > 0) next.resize(width, height, ratio)
        publish(); frameBudget()
      }).catch(error => { if (generation === token) fail('init', error); else { try { next.dispose() } catch {} } })
    } catch (error) { fail('init', error) }
  }
  const owner: RendererOwner = {
    snapshot: () => ({ ...state }),
    setPresentationEligible: value => { eligible = value; frameBudget() },
    resize: (w, h, r = 1) => { width = w; height = h; ratio = r; try { if (initialized && w > 0 && h > 0) candidate?.resize(w, h, r) } catch (error) { fail('resize', error) } frameBudget() },
    present: async (scene, camera) => {
      if (!initialized || !candidate || !eligible || width <= 0 || height <= 0 || inFlight) return false
      const token = generation; inFlight = true
      try {
        const submission = candidate.render(scene, camera)
        if (submission) await submission
        if (token !== generation) return false
        if (state.phase !== 'ready') { clearTimer(); started = null; everReady = true; recovering = false; restoring = false; state = { ...state, phase: 'ready', retrying: false }; publish() }
        return true
      } catch (error) { if (token === generation) fail(everReady && !state.retrying ? 'frame' : 'first-frame', error); return false }
      finally { if (token === generation) inFlight = false }
    },
    update: async operation => { const token = generation; if (state.phase === 'disposed') return; try { await operation() } catch (error) { if (token === generation) fail('update', error) } },
    retry: () => { if (state.phase === 'disposed' || state.retrying || state.phase === 'pending' || state.phase === 'ready') return; recovering = true; begin(false) },
    dispose: () => { if (state.phase === 'disposed') return; retire(); state = { ...state, phase: 'disposed', retrying: false }; publish() },
  }
  begin(false)
  return owner
}
