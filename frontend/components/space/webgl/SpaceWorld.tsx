'use client'

// SpaceWorld — the GL half of the space view: it draws the scene model onto
// the guarded canvas and nothing else. Dynamically imported with SSR
// disabled (three needs a GL context), so it never reaches the server path.
//
// It is a pure CONSUMER of `SceneModel`: every position, radius and curve
// here was resolved by `space-scene.ts` from served values, and every
// projection agrees with `space-projection.ts`'s own basis (same vertical
// field of view, same eye) so a drawn mark and its DOM hit target land in
// the same place. Nothing in this file computes a rule-bearing number, and
// nothing displayed to the player is read back out of it.
//
// It FAILS SOFT. Under jsdom — and on any context this renderer cannot be
// constructed against — it mounts, finds it cannot draw, and returns
// without throwing: the renderer-availability guard, not this module, owns
// the player-facing unavailable state.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { TAN_HALF_FOV, viewBasisOf } from '../space-projection'
import type { SpaceCamera } from '../space-camera'
import type { SceneModel } from '../space-scene'

export interface SpaceWorldProps {
  canvas: HTMLCanvasElement
  scene: SceneModel
  camera: SpaceCamera
  extent: number
  onFirstFrame?: () => void
}

const MARK_COLOR: Record<string, number> = {
  star: 0xfde68a,
  body: 0xa5b4fc,
  belt: 0xa8a29e,
  gate: 0x67e8f9,
  fleet: 0x4ade80,
  contact: 0xfbbf24,
  ghost: 0x94a3b8,
  'point-selection': 0xf472b6,
}

const FOV_DEGREES = (Math.atan(TAN_HALF_FOV) * 360) / Math.PI

export function SpaceWorld({ canvas, scene, camera, extent, onFirstFrame }: SpaceWorldProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<SceneModel>(scene)
  const cameraRef = useRef<SpaceCamera>(camera)
  sceneRef.current = scene
  cameraRef.current = camera

  useEffect(() => {
    // A context that cannot answer the calls a renderer makes is not a
    // context to build one against. Under jsdom the stub answers
    // `getExtension` and nothing else, and a half-constructed renderer would
    // still attach its own context-lost/restored listeners to this canvas —
    // and then throw from inside them, outside any React boundary.
    const probe = canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (!probe || typeof probe.createProgram !== 'function') return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    } catch {
      // No usable context here (jsdom, or a driver that refused): the guard
      // owns that state — this module simply does not draw.
      return
    }
    rendererRef.current = renderer
    renderer.setClearColor(0x05060a, 1)

    const world = new THREE.Scene()
    const view = new THREE.PerspectiveCamera(FOV_DEGREES, 1, extent / 1000, extent * 100)
    const geometry = new THREE.SphereGeometry(1, 16, 12)
    const meshes = new Map<string, THREE.Mesh>()
    const lines: THREE.Line[] = []
    let frame = 0
    let announced = false

    const syncMarks = () => {
      const live = new Set<string>()
      for (const mark of sceneRef.current.marks) {
        live.add(mark.id)
        let mesh = meshes.get(mark.id)
        if (!mesh) {
          mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({ color: MARK_COLOR[mark.kind] ?? MARK_COLOR.body }),
          )
          meshes.set(mark.id, mesh)
          world.add(mesh)
        }
        mesh.position.set(mark.position.x, mark.position.y, mark.position.z)
        const size = Math.max(mark.radius, extent / 400)
        mesh.scale.setScalar(mark.selected ? size * 1.6 : size)
      }
      for (const [id, mesh] of meshes) {
        if (live.has(id)) continue
        world.remove(mesh)
        ;(mesh.material as THREE.Material).dispose()
        meshes.delete(id)
      }
    }

    const syncCurves = () => {
      for (const line of lines.splice(0)) {
        world.remove(line)
        line.geometry.dispose()
      }
      for (const curve of sceneRef.current.curves) {
        const points = curve.controlPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z))
        if (points.length < 2) continue
        const smooth = new THREE.CatmullRomCurve3(points).getPoints(64)
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(smooth),
          new THREE.LineBasicMaterial({ color: 0x38bdf8 }),
        )
        lines.push(line)
        world.add(line)
      }
    }

    const draw = () => {
      const width = canvas.clientWidth || 1
      const height = canvas.clientHeight || 1
      renderer.setSize(width, height, false)
      view.aspect = width / height
      view.updateProjectionMatrix()

      const basis = viewBasisOf(cameraRef.current, { width, height })
      view.position.set(basis.eye.x, basis.eye.y, basis.eye.z)
      view.up.set(basis.up.x, basis.up.y, basis.up.z)
      const target = cameraRef.current.target
      view.lookAt(target.x, target.y, target.z)

      syncMarks()
      syncCurves()
      renderer.render(world, view)
      if (!announced) {
        announced = true
        onFirstFrame?.()
      }
      frame = requestAnimationFrame(draw)
    }

    const disposeAll = () => {
      cancelAnimationFrame(frame)
      for (const [, mesh] of meshes) (mesh.material as THREE.Material).dispose()
      geometry.dispose()
      // dispose() also detaches three's own context-lost/restored listeners
      // from the canvas — without it a renderer that failed to draw would
      // keep reacting to a restore it can no longer serve.
      try {
        renderer.dispose()
      } catch {
        // A renderer this broken has nothing left to release.
      }
      rendererRef.current = null
    }

    try {
      draw()
    } catch {
      disposeAll()
      return
    }

    return disposeAll
  }, [canvas, extent, onFirstFrame])

  return null
}

export default SpaceWorld
