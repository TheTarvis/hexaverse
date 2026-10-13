import * as THREE from 'three'
import { createSpacecraftModel, loadSpacecraftAsset, type SpacecraftKind } from './spacecraft-art'

import { advancePlanetClouds, createPlanetModel, type PlanetKind } from './scene-art'

export type PreviewKind = SpacecraftKind | PlanetKind
export type PreviewStatus = 'loading' | 'ready' | 'fallback' | 'unavailable'
export interface SpacecraftPreviewController {
  resize(width: number, height: number): void
  rotate(deltaYaw: number, deltaPitch: number): void
  setAccentColor(color: number): void
  reset(): void
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

export function createSpacecraftPreview(canvas: HTMLCanvasElement, kind: PreviewKind, accentColor: number, onStatus: (status: PreviewStatus) => void, objectId = ''): SpacecraftPreviewController {
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }) }
  catch {
    onStatus('unavailable')
    return { resize() {}, rotate() {}, setAccentColor() {}, reset() {}, dispose() {} }
  }
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
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
  let model = spacecraft ? createSpacecraftModel(kind, currentAccent) : createPlanetModel(kind, objectId, new THREE.SphereGeometry(1, 28, 18))
  scene.add(model)
  let source: THREE.Group | null = null
  let disposed = false, lost = false, width = 0, height = 0, yaw = 0, pitch = 0
  const draw = () => {
    if (disposed || lost || width <= 0 || height <= 0) return
    try { renderer.render(scene, camera) }
    catch { lost = true; onStatus('unavailable') }
  }
  const orient = () => { model.rotation.set(pitch, yaw, 0); draw() }
  // Only gas previews need a continuous loop. Stop it when the panel is
  // scrolled away, hidden, zero-sized, reduced-motion, lost or disposed.
  const animated = kind === 'gas_giant'
  const motionPreference = animated ? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
  let visible = typeof IntersectionObserver === 'undefined', animationFrame: number | null = null, lastAnimation = 0
  const stopAnimation = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    animationFrame = null
    lastAnimation = 0
  }
  const canAnimate = () => animated && visible && !document.hidden && !motionPreference?.matches && !disposed && !lost && width > 0 && height > 0
  const animate = (now: number) => {
    animationFrame = null
    if (!canAnimate()) { lastAnimation = 0; return }
    if (!lastAnimation) lastAnimation = now
    if (now - lastAnimation >= 1000 / 30) {
      advancePlanetClouds(model, (now - lastAnimation) / 1000)
      lastAnimation = now
      draw()
    }
    if (canAnimate()) animationFrame = requestAnimationFrame(animate)
  }
  const syncAnimation = () => {
    if (!canAnimate()) stopAnimation()
    else if (animationFrame === null) animationFrame = requestAnimationFrame(animate)
  }
  const observer = animated && typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting)
    syncAnimation()
  }) : null
  observer?.observe(canvas)
  if (animated) {
    document.addEventListener('visibilitychange', syncAnimation)
    motionPreference?.addEventListener('change', syncAnimation)
  }
  const contextLost = (event: Event) => {
    event.preventDefault()
    if (disposed || lost) return
    lost = true
    stopAnimation()
    onStatus('unavailable')
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  onStatus(spacecraft ? 'loading' : 'ready')
  if (spacecraft) void loadSpacecraftAsset(kind).then(loaded => {
    if (disposed || lost) { release(loaded, true); return }
    let next: THREE.Mesh
    try { next = createSpacecraftModel(kind, currentAccent, loaded) }
    catch { release(loaded, true); onStatus('fallback'); return }
    source = loaded
    scene.remove(model)
    release(model)
    model = next
    scene.add(model)
    orient()
    if (!lost) onStatus('ready')
  }).catch(() => { if (!disposed && !lost) onStatus('fallback') })
  return {
    resize(nextWidth, nextHeight) {
      if (disposed || lost || (width === nextWidth && height === nextHeight)) return
      width = nextWidth; height = nextHeight
      if (width <= 0 || height <= 0) { syncAnimation(); return }
      camera.aspect = width / height
      const halfAngle = Math.min(35 * Math.PI / 360, Math.atan(Math.tan(35 * Math.PI / 360) * camera.aspect))
      camera.position.copy(new THREE.Vector3(3, 2, -3).normalize().multiplyScalar(1.1 / Math.sin(halfAngle)))
      camera.far = camera.position.length() + 10
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      if (animated) renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5, 384 / Math.max(width, height)))
      renderer.setSize(width, height, false)
      draw()
      syncAnimation()
    },
    rotate(deltaYaw, deltaPitch) {
      if (disposed || lost) return
      yaw = (yaw + deltaYaw) % (Math.PI * 2)
      pitch = THREE.MathUtils.clamp(pitch + deltaPitch, -Math.PI / 3, Math.PI / 3)
      orient()
    },
    setAccentColor(color) {
      if (!spacecraft || disposed || lost || color === currentAccent) return
      currentAccent = color
      const next = createSpacecraftModel(kind, currentAccent, source ?? undefined)
      scene.remove(model)
      release(model)
      model = next
      scene.add(model)
      orient()
    },
    reset() { if (!disposed && !lost) { yaw = 0; pitch = 0; orient() } },
    dispose() {
      if (disposed) return
      disposed = true
      stopAnimation()
      observer?.disconnect()
      if (animated) {
        document.removeEventListener('visibilitychange', syncAnimation)
        motionPreference?.removeEventListener('change', syncAnimation)
      }
      canvas.removeEventListener('webglcontextlost', contextLost)
      release(model)
      if (source) release(source, true)
      renderer.dispose()
    },
  }
}
