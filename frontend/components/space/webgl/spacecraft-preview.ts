import * as THREE from 'three'
import { createSpacecraftModel, loadSpacecraftAsset, type SpacecraftKind } from './spacecraft-art'

import { advancePlanetClouds, createPlanetModel, type PlanetKind } from './scene-art'

import { createRendererOwner, type RendererOwner } from '@/components/render-guard/renderer-owner'
import type { RendererCandidateFactory } from '@/components/render-guard/renderer-candidate'
import { createStarModel } from './star-art'
export interface PreviewOptions { starClass?: string; onCanvas?: (canvas: HTMLCanvasElement) => void; createCanvas?: () => HTMLCanvasElement; rendererFactory?: RendererCandidateFactory }
export type PreviewKind = SpacecraftKind | PlanetKind | 'star'
export type PreviewStatus = 'loading' | 'ready' | 'fallback' | 'unavailable' | 'interrupted'
export interface SpacecraftPreviewController {
  resize(width: number, height: number): void
  rotate(deltaYaw: number, deltaPitch: number): void
  setAccentColor(color: number): void
  reset(): void
  retry(): void
  dispose(): void
}

function release(root: THREE.Object3D, closeImages = false) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  const images = new Set<ImageBitmap>()
  textures.forEach(texture => {
    if (closeImages && typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image)
    texture.dispose()
  })
  materials.forEach(material => material.dispose())
  geometries.forEach(geometry => geometry.dispose())
  images.forEach(image => image.close())
}

export function createSpacecraftPreview(canvas: HTMLCanvasElement, kind: PreviewKind, accentColor: number, onStatus: (status: PreviewStatus) => void, objectId = '', options: PreviewOptions = {}): SpacecraftPreviewController {
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xc7ddff, 2))
  const key = new THREE.DirectionalLight(0xffe2b3, 3)
  key.position.set(-3, 5, -2)
  const fill = new THREE.DirectionalLight(0x79b9ff, 1.5)
  fill.position.set(3, 1, 2)
  scene.add(key, fill)
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
  let currentAccent = accentColor
  const spacecraft = kind === 'ship' || kind === 'station'
  const star = kind === 'star' ? createStarModel({ objectId, starClass: options.starClass }) : null
  let model = star ? star.mesh : spacecraft ? createSpacecraftModel(kind, currentAccent) : createPlanetModel(kind as PlanetKind, objectId, new THREE.SphereGeometry(1, 28, 18))
  scene.add(model)
  let source: THREE.Group | null = null
  let disposed = false, width = 0, height = 0, yaw = 0, pitch = 0
  let assetStatus: PreviewStatus = spacecraft ? 'loading' : 'ready'
  const animated = kind === 'gas_giant' || kind === 'star'
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  let visible = typeof IntersectionObserver === 'undefined', animationFrame: number | null = null, lastAnimation = 0
  // The synchronous owner callbacks run during construction, before assignment.
  // eslint-disable-next-line prefer-const
  let owner: RendererOwner | undefined
  let currentCanvas = canvas, seedUsed = false
  const eligible = () => !disposed && visible && !document.hidden && width > 0 && height > 0
  const active = () => { const state = owner?.snapshot(); return !!state && (state.phase === 'ready' || state.phase === 'pending' || state.retrying) }
  const draw = () => { if (eligible() && active()) void owner?.present(scene, camera) }
  const orient = () => { model.rotation.set(pitch, yaw, 0); draw() }
  const stopAnimation = () => { if (animationFrame !== null) cancelAnimationFrame(animationFrame); animationFrame = null; lastAnimation = 0 }
  const canAnimate = () => animated && eligible() && active() && !motionPreference?.matches
  const animate = (now: number) => {
    animationFrame = null
    if (!canAnimate()) { lastAnimation = 0; return }
    if (!lastAnimation) lastAnimation = now
    if (now - lastAnimation >= 1000 / 30) {
      const delta = Math.min((now - lastAnimation) / 1000, 0.1)
      if (star) star.advance(delta); else advancePlanetClouds(model, delta)
      lastAnimation = now; draw()
    }
    if (canAnimate()) animationFrame = requestAnimationFrame(animate)
  }
  const syncAnimation = () => {
    owner?.setPresentationEligible(eligible())
    if (!canAnimate()) stopAnimation()
    else if (animationFrame === null) animationFrame = requestAnimationFrame(animate)
  }
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting); lastAnimation = 0; syncAnimation(); if (visible) draw()
  }) : null
  const visibility = () => {
    lastAnimation = 0
    syncAnimation()
    // Static and reduced-motion previews have no decorative RAF to request
    // their first/current frame after initialization in a hidden tab.
    if (!document.hidden && !canAnimate()) draw()
  }
  document.addEventListener('visibilitychange', visibility)
  motionPreference?.addEventListener('change', syncAnimation)
  onStatus('loading')
  owner = createRendererOwner({ surface: 'preview', alpha: true, stencil: false, factory: options.rendererFactory,
    createCanvas: () => options.createCanvas?.() ?? (!seedUsed ? (seedUsed = true, canvas) : document.createElement('canvas')),
    onCanvas: next => {
      observer?.unobserve?.(currentCanvas); currentCanvas = next
      options.onCanvas?.(next); observer?.observe(next)
    },
    onState: state => {
      if (disposed || state.phase === 'disposed') return
      if (state.phase === 'ready') onStatus(assetStatus)
      else if (state.phase === 'unavailable' || state.phase === 'interrupted') onStatus(state.phase)
      else onStatus('loading')
      if (state.phase === 'unavailable' || state.phase === 'interrupted' && !state.retrying) stopAnimation()
      // Init publishes its actual backend before first submission. Demand-driven
      // previews must request that frame even when reduced motion stops the RAF.
      if (state.backend && (state.phase === 'pending' || state.retrying)) queueMicrotask(() => { syncAnimation(); draw() })
    },
  })
  const publishAsset = () => { if (owner?.snapshot().phase === 'ready') onStatus(assetStatus) }
  if (spacecraft) void loadSpacecraftAsset(kind).then(loaded => {
    if (disposed) { release(loaded, true); return }
    let next: THREE.Mesh
    try { next = createSpacecraftModel(kind, currentAccent, loaded) }
    catch { release(loaded, true); assetStatus = 'fallback'; publishAsset(); return }
    source = loaded; scene.remove(model); release(model); model = next; scene.add(model)
    assetStatus = 'ready'; orient(); publishAsset()
  }).catch(() => { if (!disposed) { assetStatus = 'fallback'; publishAsset() } })
  return {
    resize(nextWidth, nextHeight) {
      if (disposed || width === nextWidth && height === nextHeight) return
      width = nextWidth; height = nextHeight
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 2, 384 / Math.max(width, height, 1))
      owner!.resize(width, height, ratio); syncAnimation()
      if (width <= 0 || height <= 0) return
      camera.aspect = width / height
      const halfAngle = Math.min(35 * Math.PI / 360, Math.atan(Math.tan(35 * Math.PI / 360) * camera.aspect))
      camera.position.copy(new THREE.Vector3(3, 2, -3).normalize().multiplyScalar((star ? 4 : 1.1) / Math.sin(halfAngle)))
      camera.far = camera.position.length() + 10; camera.lookAt(0, 0, 0); camera.updateProjectionMatrix()
      draw()
    },
    rotate(deltaYaw, deltaPitch) { if (disposed) return; yaw = (yaw + deltaYaw) % (Math.PI * 2); pitch = THREE.MathUtils.clamp(pitch + deltaPitch, -Math.PI / 3, Math.PI / 3); orient() },
    setAccentColor(color) {
      if (!spacecraft || disposed || color === currentAccent) return
      currentAccent = color
      void owner!.update(() => {
        const next = createSpacecraftModel(kind, currentAccent, source ?? undefined)
        scene.remove(model); release(model); model = next; scene.add(model); orient()
      })
    },
    reset() { if (!disposed) { yaw = 0; pitch = 0; orient() } },
    retry() { owner!.retry() },
    dispose() {
      if (disposed) return
      disposed = true; stopAnimation(); observer?.disconnect()
      document.removeEventListener('visibilitychange', visibility); motionPreference?.removeEventListener('change', syncAnimation)
      if (star) star.dispose(); else release(model)
      if (source) release(source, true)
      owner!.dispose()
    },
  }
}
