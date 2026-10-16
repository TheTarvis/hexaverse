'use client'

import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { WebGPUCanvas, type CanvasSceneFactory } from './WebGPUCanvas'
import { addPreviewLights } from './scene-resources'

export type ModelViewAngle = 'three-quarter' | 'front' | 'back' | 'side'
export interface ModelViewEffect {
  object: THREE.Object3D
  update: (progress: number, elapsedSeconds: number) => void
}
export type ModelViewEffectFactory = (context: { bounds: THREE.Box3 }) => ModelViewEffect

export interface WebGPUModelViewProps {
  src: string
  label: string
  view?: ModelViewAngle
  animation?: string
  /** Normalized position within the chosen GLB animation. */
  progress?: number
  playing?: boolean
  wireframe?: boolean
  /** Stable factory for an optional animated effect, independent of the GLB. */
  createEffect?: ModelViewEffectFactory
  className?: string
  style?: CSSProperties
}

/** Drop a GLB into the canvas foundation; framing, studio lights and orbit are shared. */
export function WebGPUModelView({ src, label, view = 'three-quarter', animation, progress = 1, playing = false, wireframe = false, createEffect, className, style }: WebGPUModelViewProps) {
  const settings = useRef({ view, animation, progress, playing, wireframe })
  settings.current = { view, animation, progress, playing, wireframe }
  const invalidate = useRef<() => void>(() => {})
  const createScene = useCallback<CanvasSceneFactory>(async context => {
    const gltf = await new GLTFLoader().loadAsync(src)
    const scene = new THREE.Scene()
    scene.add(gltf.scene)
    // A late result still returns its owned resources to the canvas for disposal.
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
    if (context.signal.aborted) return { scene, camera }
    invalidate.current = context.invalidate
    const bounds = new THREE.Box3().setFromObject(gltf.scene)
    const center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.01)
    gltf.scene.position.sub(center)
    const effect = createEffect?.({ bounds: bounds.clone() })
    if (effect) scene.add(effect.object)
    addPreviewLights(scene)
    const controls = new OrbitControls(camera, context.element)
    controls.enableDamping = false
    controls.minDistance = radius * 1.1
    controls.maxDistance = radius * 12
    controls.addEventListener('change', context.invalidate)
    const mixer = new THREE.AnimationMixer(gltf.scene)
    let action: THREE.AnimationAction | undefined
    let appliedAnimation: string | undefined, appliedView: ModelViewAngle | undefined
    let appliedWireframe: boolean | undefined, width = 1, height = 1, playhead = 0
    const fit = () => {
      const directions = { 'three-quarter': [0.32, 0.14, 1], front: [0, 0, 1], back: [0, 0, -1], side: [1, 0, 0] }
      const direction = new THREE.Vector3().fromArray(directions[settings.current.view]).normalize()
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize()
      const up = new THREE.Vector3().crossVectors(direction, right).normalize()
      const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const tanHorizontal = tanVertical * width / height
      let distance = radius
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center)
        distance = Math.max(distance, Math.abs(corner.dot(right)) / tanHorizontal + corner.dot(direction), Math.abs(corner.dot(up)) / tanVertical + corner.dot(direction))
      }
      camera.position.copy(direction).multiplyScalar(distance * 1.12)
      camera.near = radius * 0.01
      camera.far = radius * 30
      camera.updateProjectionMatrix()
      controls.target.set(0, 0, 0)
      controls.update()
    }
    return {
      scene, camera,
      resize(w, h) { width = w; height = h; fit() },
      frame(delta, elapsed) {
        const next = settings.current
        if (appliedView !== next.view) { appliedView = next.view; fit() }
        const clip = next.animation ? THREE.AnimationClip.findByName(gltf.animations, next.animation) : gltf.animations[0]
        if (appliedAnimation !== clip?.name) {
          mixer.stopAllAction()
          appliedAnimation = clip?.name
          action = clip ? mixer.clipAction(clip) : undefined
          action?.setLoop(THREE.LoopOnce, 1)
          if (action) { action.clampWhenFinished = true; action.play() }
        }
        let position = next.progress
        if (action) {
          if (next.playing) playhead += delta
          else playhead = 0
          position = next.playing && delta > 0 ? (1 - Math.cos(playhead * Math.PI / 1.5)) / 2 : next.progress
          action.paused = false
          mixer.setTime(THREE.MathUtils.clamp(position, 0, 1) * action.getClip().duration)
        }
        effect?.update(position, elapsed)
        if (appliedWireframe !== next.wireframe) {
          appliedWireframe = next.wireframe
          gltf.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              if (material instanceof THREE.MeshStandardMaterial) material.wireframe = next.wireframe
            }
          })
        }
      },
      dispose() {
        controls.removeEventListener('change', context.invalidate)
        controls.dispose()
        mixer.stopAllAction()
        mixer.uncacheRoot(gltf.scene)
      },
    }
  }, [src, createEffect])
  useEffect(() => { invalidate.current() }, [view, animation, progress, playing, wireframe])
  return <WebGPUCanvas label={label} createScene={createScene} animate={playing || !!createEffect} className={className} style={style} />
}
