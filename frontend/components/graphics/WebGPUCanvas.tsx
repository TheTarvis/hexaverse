'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import { Button } from '@/components/catalyst/button'
import { RendererStateNotice } from '@/components/render-guard/RendererStateNotice'
import { createRendererOwner, type RendererOwner, type RendererSnapshot, type RendererSurface } from '@/components/render-guard/renderer-owner'
import type { RendererCandidateFactory } from '@/components/render-guard/renderer-candidate'
import { disposeObjectResources } from './scene-resources'
import styles from './webgpu-canvas.module.css'

export interface CanvasScene {
  scene: THREE.Scene
  camera: THREE.Camera
  resize?: (width: number, height: number) => void
  frame?: (deltaSeconds: number, elapsedSeconds: number) => void
  /** Release controls/listeners; the canvas releases scene geometry, materials and textures. */
  dispose?: () => void
}

export interface CanvasSceneContext {
  /** Stable input target: renderer recovery may replace its child canvas. */
  element: HTMLDivElement
  signal: AbortSignal
  invalidate: () => void
}

export type CanvasSceneFactory = (context: CanvasSceneContext) => CanvasScene | Promise<CanvasScene>

export interface WebGPUCanvasProps {
  label: string
  /** Keep this function stable; changing it replaces the scene. Resources are instance-owned. */
  createScene: CanvasSceneFactory
  animate?: boolean
  surface?: RendererSurface
  alpha?: boolean
  stencil?: boolean
  maxResolution?: number
  maxFramesPerSecond?: number
  className?: string
  style?: CSSProperties
  rendererFactory?: RendererCandidateFactory
}

/** Release each instance-owned resource once, including late async scene results. */
function release(content: CanvasScene) {
  try { content.dispose?.() }
  finally { disposeObjectResources(content.scene); content.scene.clear() }
}

/** WebGPU first, compatibility fallback and device recovery through the shared renderer owner. */
export function WebGPUCanvas({ label, createScene, animate = false, surface = 'preview', alpha = true, stencil = false, maxResolution = Infinity, maxFramesPerSecond = 60, className, style, rendererFactory }: WebGPUCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const labelRef = useRef(label)
  labelRef.current = label
  const animateRef = useRef(animate)
  animateRef.current = animate
  const invalidateRef = useRef<() => void>(() => {})
  const ownerRef = useRef<RendererOwner | null>(null)
  const claimFocus = useRef(false)
  const [snapshot, setSnapshot] = useState<RendererSnapshot>({ phase: 'pending', backend: null, retrying: false })
  const [loaded, setLoaded] = useState(false)
  const [sceneError, setSceneError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const element = host.current!
    const abort = new AbortController()
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let content: CanvasScene | undefined
    let width = 0, height = 0, visible = true, failed = false
    let raf: number | null = null, previous = 0, elapsed = 0
    setLoaded(false)
    setSceneError(false)
    const eligible = () => !!content && !abort.signal.aborted && !failed && visible && !document.hidden && width > 0 && height > 0
    const stop = () => { if (raf !== null) cancelAnimationFrame(raf); raf = null; previous = 0 }
    const invalidate = () => { if (eligible() && raf === null) raf = requestAnimationFrame(draw) }
    function draw(now: number) {
      raf = null
      if (!eligible() || !content || !owner) return
      const state = owner.snapshot()
      if (!state.backend || state.phase === 'unavailable' || state.phase === 'interrupted' && !state.retrying) return
      const continuous = animateRef.current && !motion.matches
      if (continuous && previous && now - previous < 1000 / Math.max(1, maxFramesPerSecond)) { invalidate(); return }
      const delta = continuous && previous ? Math.min((now - previous) / 1000, 0.1) : 0
      previous = continuous ? now : 0
      elapsed += delta
      try {
        content.frame?.(delta, elapsed)
        void owner.present(content.scene, content.camera)
      } catch (error) {
        console.error('[WebGPUCanvas] scene frame failed', error)
        failed = true
        owner.setPresentationEligible(false)
        setSceneError(true)
        return
      }
      if (continuous) invalidate()
    }
    const resize = () => {
      width = element.clientWidth
      height = element.clientHeight
      owner?.resize(width, height, Math.min(window.devicePixelRatio || 1, 2, maxResolution / Math.max(width, height, 1)))
      if (content && width > 0 && height > 0) {
        if (content.camera instanceof THREE.PerspectiveCamera) {
          content.camera.aspect = width / height
          content.camera.updateProjectionMatrix()
        }
        content.resize?.(width, height)
      }
      owner?.setPresentationEligible(eligible())
      invalidate()
    }
    const sync = () => { stop(); owner?.setPresentationEligible(eligible()); invalidate() }
    const owner = createRendererOwner({
      surface, alpha, stencil, factory: rendererFactory,
      createCanvas: () => document.createElement('canvas'),
      onCanvas: canvas => {
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', labelRef.current)
        canvas.className = styles.canvas
        element.replaceChildren(canvas)
      },
      onState: state => {
        if (abort.signal.aborted) return
        if (state.phase === 'unavailable' || state.phase === 'interrupted') claimFocus.current = element.contains(document.activeElement) || !!element.parentElement?.contains(document.activeElement)
        setSnapshot(state)
        if (state.phase !== 'ready') stop()
        if (state.phase !== 'unavailable' && (state.phase !== 'interrupted' || state.retrying)) queueMicrotask(invalidate)
      },
    })
    ownerRef.current = owner
    invalidateRef.current = sync
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting)
      sync()
    })
    intersection?.observe(element)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    resize()
    Promise.resolve().then(() => createScene({ element, signal: abort.signal, invalidate })).then(next => {
      if (abort.signal.aborted) { release(next); return }
      content = next
      setLoaded(true)
      resize()
    }).catch(error => {
      if (abort.signal.aborted) return
      console.error('[WebGPUCanvas] scene creation failed', error)
      failed = true
      stop()
      owner?.setPresentationEligible(false)
      setSceneError(true)
    })
    return () => {
      abort.abort()
      stop()
      observer.disconnect()
      intersection?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      ownerRef.current = null
      invalidateRef.current = () => {}
      owner?.dispose()
      if (content) release(content)
    }
  }, [createScene, rendererFactory, surface, alpha, stencil, maxResolution, maxFramesPerSecond, attempt])

  useEffect(() => { invalidateRef.current() }, [animate])
  useEffect(() => { host.current?.querySelector('canvas')?.setAttribute('aria-label', label) }, [label])
  const failed = sceneError || snapshot.phase === 'unavailable' || snapshot.phase === 'interrupted'
  const pending = !failed && (!loaded || snapshot.phase !== 'ready')
  return (
    <div className={`${styles.root} ${className ?? ''}`} style={style} data-renderer-phase={snapshot.phase} data-content-ready={loaded}>
      <div ref={host} className={styles.viewport} />
      {pending && <p role="status" className={styles.notice}>Loading {label}…</p>}
      {sceneError ? <div role="status" className={styles.notice}>
        <p>Scene could not be loaded.</p>
        <Button outline onClick={() => setAttempt(value => value + 1)}>Retry</Button>
      </div> : failed && <div className={styles.notice}>
        <RendererStateNotice status={snapshot.phase === 'interrupted' ? 'interrupted' : 'unsupported'}
          cause={snapshot.phase === 'interrupted' ? 'lost' : 'creation'} surface={surface === 'space' || surface === 'galaxy' ? surface : 'preview'}
          retrying={snapshot.retrying} onRetry={() => ownerRef.current?.retry()} claimFocus={claimFocus.current} />
      </div>}
    </div>
  )
}
