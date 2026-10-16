import * as THREE from 'three'
import { createSpacecraftModel, loadSpacecraftAsset, type SpacecraftKind } from './spacecraft-art'
import { advancePlanetClouds, createPlanetModel, type PlanetKind } from './scene-art'
import { createStarModel } from './star-art'
import { addPreviewLights, disposeObjectResources } from '@/components/graphics/scene-resources'
import type { CanvasScene, CanvasSceneContext } from '@/components/graphics/WebGPUCanvas'

export type PreviewKind = SpacecraftKind | PlanetKind | 'star'
export type PreviewAssetStatus = 'loading' | 'ready' | 'fallback'
export interface SpacecraftPreviewScene extends CanvasScene {
  rotate(deltaYaw: number, deltaPitch: number): void
  setAccentColor(color: number): void
  reset(): void
}
export interface SpacecraftPreviewSceneOptions {
  kind: PreviewKind
  objectId: string
  accentColor: number
  starClass?: string
  onAssetStatus?: (status: PreviewAssetStatus) => void
}

/** Production appearance and pose only. WebGPUCanvas owns rendering, recovery and visibility. */
export function createSpacecraftPreviewScene(context: CanvasSceneContext, options: SpacecraftPreviewSceneOptions): SpacecraftPreviewScene {
  const { kind, objectId, starClass, onAssetStatus } = options
  const scene = new THREE.Scene()
  addPreviewLights(scene)
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
  let currentAccent = options.accentColor
  const spacecraft = kind === 'ship' || kind === 'station'
  const star = kind === 'star' ? createStarModel({ objectId, starClass }) : null
  let model = star ? star.mesh : spacecraft ? createSpacecraftModel(kind, currentAccent) : createPlanetModel(kind as PlanetKind, objectId, new THREE.SphereGeometry(1, 28, 18))
  scene.add(model)
  let source: THREE.Group | undefined
  let disposed = false, yaw = 0, pitch = 0
  const live = () => !disposed && !context.signal.aborted
  const orient = () => { model.rotation.set(pitch, yaw, 0); context.invalidate() }
  const replace = (next: THREE.Mesh) => {
    scene.remove(model)
    disposeObjectResources(model)
    model = next
    scene.add(model)
    orient()
  }
  onAssetStatus?.(spacecraft ? 'loading' : 'ready')
  if (spacecraft) void loadSpacecraftAsset(kind).then(loaded => {
    if (!live()) { disposeObjectResources(loaded, true); return }
    try {
      const next = createSpacecraftModel(kind, currentAccent, loaded)
      source = loaded
      replace(next)
      onAssetStatus?.('ready')
    } catch {
      disposeObjectResources(loaded, true)
      onAssetStatus?.('fallback')
    }
  }).catch(() => { if (live()) onAssetStatus?.('fallback') })
  return {
    scene, camera,
    resize(width, height) {
      if (!live() || width <= 0 || height <= 0) return
      camera.aspect = width / height
      const halfAngle = Math.min(35 * Math.PI / 360, Math.atan(Math.tan(35 * Math.PI / 360) * camera.aspect))
      camera.position.copy(new THREE.Vector3(3, 2, -3).normalize().multiplyScalar((star ? 4 : 1.1) / Math.sin(halfAngle)))
      camera.far = camera.position.length() + 10
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
    },
    frame(delta) {
      if (!live() || delta <= 0) return
      if (star) star.advance(delta)
      else if (kind === 'gas_giant') advancePlanetClouds(model, delta)
    },
    rotate(deltaYaw, deltaPitch) {
      if (!live()) return
      yaw = (yaw + deltaYaw) % (Math.PI * 2)
      pitch = THREE.MathUtils.clamp(pitch + deltaPitch, -Math.PI / 3, Math.PI / 3)
      orient()
    },
    setAccentColor(color) {
      if (!spacecraft || !live() || color === currentAccent) return
      currentAccent = color
      replace(createSpacecraftModel(kind, currentAccent, source))
    },
    reset() { if (live()) { yaw = 0; pitch = 0; orient() } },
    dispose() {
      if (disposed) return
      disposed = true
      // Current scene resources belong to WebGPUCanvas; the retained source is separate.
      if (source) disposeObjectResources(source, true)
    },
  }
}
